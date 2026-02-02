import fs from 'fs-extra';
import path from 'path';
import { execa } from 'execa';
import { EngineInstallation, EngineVersionInfo, EngineAssociation, EngineDetectionResult } from '../types/engine';
import { Platform } from '../utils/platform';
import { Logger } from '../utils/logger';

export class EngineResolver {
  /**
   * Resolve engine information for a project
   */
  static async resolveEngine(projectPath?: string): Promise<EngineDetectionResult> {
    const warnings: string[] = [];

    try {
      // If project path is provided, get engine association from .uproject
      let uprojectEngine: EngineAssociation | undefined;
      if (projectPath) {
        const uprojectResult = await this.getEngineAssociationFromProject(projectPath);
        if (uprojectResult.association) {
          uprojectEngine = uprojectResult.association;
        }
        warnings.push(...uprojectResult.warnings);
      }

      // Try to find engine installation
      const engineInstallations = await this.findEngineInstallations();

      // If we have an engine association, try to match it
      let matchedEngine: EngineInstallation | undefined;
      if (uprojectEngine && engineInstallations.length > 0) {
        matchedEngine = engineInstallations.find(
          engine => engine.associationId === uprojectEngine!.guid
        );

        if (!matchedEngine && uprojectEngine.guid) {
          warnings.push(`Engine with association ID ${uprojectEngine.guid} not found in installed engines`);
        }
      }

      // If no matched engine, use the first available engine or latest version
      if (!matchedEngine && engineInstallations.length > 0) {
        // Sort by version (newest first) and use the first one
        engineInstallations.sort((a, b) => this.compareVersions(b.version, a.version));
        matchedEngine = engineInstallations[0];
        warnings.push(`Using engine ${matchedEngine.displayName || matchedEngine.associationId} (not associated with project)`);
      }

      return {
        engine: matchedEngine,
        uprojectEngine,
        warnings
      };

    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        warnings
      };
    }
  }

  /**
   * Get engine association from .uproject file
   */
  private static async getEngineAssociationFromProject(projectPath: string): Promise<{
    association?: EngineAssociation;
    warnings: string[];
  }> {
    const warnings: string[] = [];

    try {
      // Check if projectPath is a directory or .uproject file
      let uprojectPath = projectPath;
      if (await fs.pathExists(projectPath) && (await fs.stat(projectPath)).isDirectory()) {
        // Look for .uproject file in directory
        const uprojectFiles = await fs.readdir(projectPath).then(files =>
          files.filter(f => f.endsWith('.uproject'))
        );

        if (uprojectFiles.length === 0) {
          warnings.push('No .uproject file found in project directory');
          return { warnings };
        }

        uprojectPath = path.join(projectPath, uprojectFiles[0]);
      }

      if (!uprojectPath.endsWith('.uproject')) {
        warnings.push('Project path is not a .uproject file');
        return { warnings };
      }

      // Read and parse .uproject file
      const content = await fs.readFile(uprojectPath, 'utf-8');
      const uproject = JSON.parse(content);

      if (!uproject.EngineAssociation) {
        warnings.push('No EngineAssociation found in .uproject file');
        return { warnings };
      }

      const association: EngineAssociation = {
        guid: uproject.EngineAssociation,
        name: uproject.EngineAssociation
      };

      return { association, warnings };

    } catch (error) {
      warnings.push(`Failed to read project file: ${error instanceof Error ? error.message : String(error)}`);
      return { warnings };
    }
  }

  /**
   * Find all Unreal Engine installations
   */
  public static async findEngineInstallations(): Promise<EngineInstallation[]> {
    const installations: EngineInstallation[] = [];

    // Platform-specific engine discovery
    if (Platform.isWindows()) {
      // Try registry first
      const registryEngines = await this.getEnginesFromRegistry();
      installations.push(...registryEngines);

      // Try launcher installed manifest
      const launcherEngines = await this.getEnginesFromLauncher();
      installations.push(...launcherEngines);
    }

    // Try environment variable
    const envEngine = await this.getEngineFromEnvironment();
    if (envEngine) {
      installations.push(envEngine);
    }

    // Remove duplicates (same path)
    const uniqueInstallations = this.removeDuplicateEngines(installations);

    // Load version info for each engine
    for (const installation of uniqueInstallations) {
      await this.loadEngineVersionInfo(installation);
    }

    return uniqueInstallations;
  }

  /**
   * Get engines from Windows registry
   */
  private static async getEnginesFromRegistry(): Promise<EngineInstallation[]> {
    const installations: EngineInstallation[] = [];

    // Common registry locations for Unreal Engine installations
    const registryLocations = [
      // Current user builds (source engine registrations)
      'HKEY_CURRENT_USER\\SOFTWARE\\Epic Games\\Unreal Engine\\Builds',
      // Local machine builds (official launcher installations may register here)
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\Epic Games\\Unreal Engine\\Builds',
      // Alternative registry paths (different naming conventions)
      'HKEY_CURRENT_USER\\SOFTWARE\\EpicGames\\Unreal Engine',
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\EpicGames\\Unreal Engine',
      // Additional possible locations
      'HKEY_CURRENT_USER\\SOFTWARE\\Epic Games\\UE_5',
      'HKEY_CURRENT_USER\\SOFTWARE\\Epic Games\\UE_4',
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\Epic Games\\UE_5',
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\Epic Games\\UE_4',
    ];

    Logger.debug('Querying registry for UE engines from locations: ' + JSON.stringify(registryLocations));

    for (const registryLocation of registryLocations) {
      try {
        Logger.debug(`Querying registry location: ${registryLocation}`);
        const locationEngines = await this.queryRegistryKey(registryLocation);
        installations.push(...locationEngines);
        Logger.debug(`Found ${locationEngines.length} engines at ${registryLocation}`);
      } catch (error) {
        // Log but continue - some locations may not exist or have permission issues
        const err = error as Error;
        // Check if it's a "key not found" error (common and expected)
        if (err.message && err.message.includes('unable to find the specified registry key')) {
          Logger.debug(`Registry key not found: ${registryLocation}`);
        } else {
          Logger.debug(`Failed to query registry location ${registryLocation}: ${err.message}`);
        }
      }
    }

    Logger.debug(`Total engines found from registry: ${installations.length}`);
    return installations;
  }

  /**
   * Query a specific registry key for engine installations
   */
  private static async queryRegistryKey(registryKey: string): Promise<EngineInstallation[]> {
    const installations: EngineInstallation[] = [];

    try {
      const { stdout } = await execa('reg', [
        'query',
        registryKey,
        '/s'
      ]);

      // Parse registry output
      // Format can vary:
      // 1. Single line: HKEY_CURRENT_USER\SOFTWARE\Epic Games\Unreal Engine\Builds
      //    {GUID}    REG_SZ    <EnginePath>
      // 2. Multi-line:
      //    {GUID}
      //        EnginePath    REG_SZ    <Path>
      const lines = stdout.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Try to match the complete pattern: {GUID}    REG_SZ    <EnginePath>
        const fullMatch = line.match(/{([^}]+)}\s+REG_SZ\s+(.+)$/);
        if (fullMatch) {
          const guid = `{${fullMatch[1]}}`;
          const enginePath = fullMatch[2].trim();

          installations.push({
            path: enginePath,
            associationId: guid,
            displayName: `UE Engine ${guid}`,
            version: undefined,
            source: 'registry'
          });
          continue;
        }

        // Fallback: Check for GUID line (starts with {) - might be followed by REG_SZ on next line
        if (line.startsWith('{')) {
          const guidMatch = line.match(/^({[^}]+})/);
          if (guidMatch) {
            const guid = guidMatch[1];
            let enginePath: string | undefined;

            // Check if this line also contains REG_SZ (some formats)
            const regSzMatch = line.match(/REG_SZ\s+(.+)$/);
            if (regSzMatch) {
              enginePath = regSzMatch[1].trim();
            } else {
              // Look for REG_SZ on following lines (multi-line format)
              for (let j = i + 1; j < lines.length; j++) {
                const nextLine = lines[j].trim();
                if (nextLine.includes('REG_SZ')) {
                  const pathMatch = nextLine.match(/REG_SZ\s+(.+)$/);
                  if (pathMatch) {
                    enginePath = pathMatch[1].trim();
                    break;
                  }
                } else if (nextLine.startsWith('{') || nextLine.includes(registryKey)) {
                  // Reached next GUID or registry key, stop searching
                  break;
                }
              }
            }

            if (enginePath) {
              installations.push({
                path: enginePath,
                associationId: guid,
                displayName: `UE Engine ${guid}`,
                version: undefined,
                source: 'registry'
              });
            } else {
              Logger.debug(`Found GUID ${guid} but could not extract engine path`);
            }
          }
        }
      }
    } catch (error) {
      // Re-throw error to be handled by caller
      throw error;
    }

    return installations;
  }

  /**
   * Get engines from Epic Games Launcher installation manifest
   */
  private static async getEnginesFromLauncher(): Promise<EngineInstallation[]> {
    const installations: EngineInstallation[] = [];

    try {
      // Common launcher manifest locations
      const manifestPaths = [
        // Legacy UnrealEngine launcher
        path.join(process.env.LOCALAPPDATA || '', 'UnrealEngine', 'Common', 'LauncherInstalled.dat'),
        // ProgramData locations
        path.join(process.env.PROGRAMDATA || '', 'Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat'),
        path.join(process.env.PROGRAMDATA || '', 'Epic', 'EpicGamesLauncher', 'Data', 'LauncherInstalled.dat'),
        // AppData locations
        path.join(process.env.APPDATA || '', 'Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat'),
        path.join(process.env.APPDATA || '', 'Epic', 'EpicGamesLauncher', 'Data', 'LauncherInstalled.dat'),
        // Additional possible locations for newer launcher versions
        path.join(process.env.LOCALAPPDATA || '', 'EpicGamesLauncher', 'Data', 'LauncherInstalled.dat'),
        path.join(process.env.LOCALAPPDATA || '', 'Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat'),
        path.join(process.env.APPDATA || '', 'Epic Games', 'Launcher', 'Data', 'LauncherInstalled.dat'),
        // Fallback: Epic Games Launcher default installation
        path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Epic Games', 'Launcher', 'Data', 'LauncherInstalled.dat'),
        path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Epic Games', 'Launcher', 'Data', 'LauncherInstalled.dat')
      ];

      Logger.debug('Searching for launcher manifests in: ' + JSON.stringify(manifestPaths));

      for (const manifestPath of manifestPaths) {
        Logger.debug(`Checking launcher manifest path: ${manifestPath}`);
        if (await fs.pathExists(manifestPath)) {
          Logger.debug(`Found launcher manifest at: ${manifestPath}`);
          try {
            const content = await fs.readFile(manifestPath, 'utf-8');
            const manifest = JSON.parse(content);

            if (manifest.InstallationList && Array.isArray(manifest.InstallationList)) {
              Logger.debug(`Found ${manifest.InstallationList.length} installations in manifest`);
              for (const installation of manifest.InstallationList) {
                // Check if this is an Unreal Engine installation
                // AppName could be: 'UE_4', 'UE_5', 'UE_5.0', 'UE_5.1', etc.
                // Also check for 'UE_' prefix in general
                if (installation.AppName &&
                    (installation.AppName.startsWith('UE_') ||
                     installation.AppName.includes('UnrealEngine') ||
                     installation.Category === 'engine')) {

                  Logger.debug(`Found UE installation: ${installation.AppName} at ${installation.InstallLocation}`);
                  installations.push({
                    path: installation.InstallLocation,
                    associationId: installation.AppName,
                    displayName: installation.DisplayName || installation.AppName || `UE ${installation.AppVersion || 'Unknown'}`,
                    installedDate: installation.InstallDate,
                    version: undefined,
                    source: 'launcher'
                  });
                } else {
                  Logger.debug(`Skipping non-UE installation: ${installation.AppName}`);
                }
              }
            } else {
              Logger.debug('No InstallationList found in manifest or it is not an array');
            }
          } catch (parseError) {
            Logger.debug('Failed to parse launcher manifest: ' + (parseError instanceof Error ? parseError.message : String(parseError)));
            Logger.debug('Manifest path: ' + manifestPath);
          }
        } else {
          Logger.debug('Launcher manifest not found at: ' + manifestPath);
        }
      }
    } catch (error) {
      Logger.debug('Failed to read launcher manifest: ' + (error instanceof Error ? error.message : String(error)));
    }

    Logger.debug(`Total launcher engines found: ${installations.length}`);
    return installations;
  }

  /**
   * Get engine from environment variable
   */
  private static async getEngineFromEnvironment(): Promise<EngineInstallation | undefined> {
    const envVars = ['UE_ENGINE_PATH', 'UE_ROOT', 'UNREAL_ENGINE_PATH'];

    for (const envVar of envVars) {
      const enginePath = process.env[envVar];
      if (enginePath && await fs.pathExists(enginePath)) {
        return {
          path: enginePath,
          associationId: `ENV_${envVar}`,
          displayName: `UE Engine (from ${envVar})`,
          version: undefined,
          source: 'environment'
        };
      }
    }

    return undefined;
  }

  /**
   * Load version information for an engine installation
   */
  private static async loadEngineVersionInfo(installation: EngineInstallation): Promise<void> {
    try {
      // Look for version file in common locations
      const versionFilePaths = [
        path.join(installation.path, 'Engine', 'Binaries', 'Win64', 'UnrealEditor.version'),
        path.join(installation.path, 'Engine', 'Build', 'Build.version')
      ];

      for (const versionFilePath of versionFilePaths) {
        if (await fs.pathExists(versionFilePath)) {
          try {
            const content = await fs.readFile(versionFilePath, 'utf-8');
            const versionInfo: EngineVersionInfo = JSON.parse(content);
            installation.version = versionInfo;

            // Generate better display name
            installation.displayName = `UE ${versionInfo.MajorVersion}.${versionInfo.MinorVersion}.${versionInfo.PatchVersion}`;

            return;
          } catch (parseError) {
            Logger.debug('Failed to parse version file: ' + (parseError instanceof Error ? parseError.message : String(parseError)));
          }
        }
      }

      // If no version file found, try to extract version from path
      const pathMatch = installation.path.match(/UE_(?:5|4)[._]?(\d+(?:[._]\d+)*)/i);
      if (pathMatch) {
        const versionStr = pathMatch[1].replace('_', '.');
        installation.version = {
          MajorVersion: parseInt(versionStr.split('.')[0]) || 5,
          MinorVersion: parseInt(versionStr.split('.')[1]) || 0,
          PatchVersion: parseInt(versionStr.split('.')[2]) || 0,
          Changelist: 0,
          CompatibleChangelist: 0,
          IsLicenseeVersion: 0,
          IsPromotedBuild: 0,
          BranchName: '',
          BuildId: ''
        };
        installation.displayName = `UE ${versionStr}`;
      }
    } catch (error) {
      Logger.debug('Failed to load engine version info: ' + (error instanceof Error ? error.message : String(error)));
    }
  }

  /**
   * Remove duplicate engines (same path)
   */
  private static removeDuplicateEngines(installations: EngineInstallation[]): EngineInstallation[] {
    const seen = new Set<string>();
    const unique: EngineInstallation[] = [];

    for (const installation of installations) {
      const normalizedPath = path.normalize(installation.path).toLowerCase();
      if (!seen.has(normalizedPath)) {
        seen.add(normalizedPath);
        unique.push(installation);
      }
    }

    return unique;
  }

  /**
   * Compare two engine versions (semantic version comparison)
   */
  private static compareVersions(a?: EngineVersionInfo, b?: EngineVersionInfo): number {
    // Handle undefined versions
    if (!a && !b) return 0;
    if (!a) return -1; // a is undefined, b is defined -> a < b
    if (!b) return 1;  // a is defined, b is undefined -> a > b

    if (a.MajorVersion !== b.MajorVersion) {
      return a.MajorVersion - b.MajorVersion;
    }
    if (a.MinorVersion !== b.MinorVersion) {
      return a.MinorVersion - b.MinorVersion;
    }
    if (a.PatchVersion !== b.PatchVersion) {
      return a.PatchVersion - b.PatchVersion;
    }
    return a.Changelist - b.Changelist;
  }
}