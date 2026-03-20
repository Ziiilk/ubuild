import fs from 'fs-extra';
import path from 'path';
import { execa } from 'execa';
import {
  EngineInstallation,
  EngineVersionInfo,
  EngineAssociation,
  EngineDetectionResult,
  EnginePathResolutionOptions,
} from '../types/engine';
import { Platform } from '../utils/platform';
import { Logger } from '../utils/logger';
import { ProjectPathResolver } from './project-path-resolver';

export class EngineResolver {
  static async resolveEnginePath(options: EnginePathResolutionOptions = {}): Promise<string> {
    const { projectPath, enginePath } = options;

    if (enginePath) {
      if (!(await fs.pathExists(enginePath))) {
        throw new Error(`Engine path does not exist: ${enginePath}`);
      }

      return enginePath;
    }

    const engineResult = await this.resolveEngine(projectPath);
    if (!engineResult.engine) {
      throw new Error('Could not determine engine path. Please specify --engine-path');
    }

    if (!(await fs.pathExists(engineResult.engine.path))) {
      throw new Error(`Engine path does not exist: ${engineResult.engine.path}`);
    }

    return engineResult.engine.path;
  }

  static async resolveEngine(projectPath?: string): Promise<EngineDetectionResult> {
    const warnings: string[] = [];

    try {
      let uprojectEngine: EngineAssociation | undefined;
      if (projectPath) {
        const uprojectResult = await this.getEngineAssociationFromProject(projectPath);
        if (uprojectResult.association) {
          uprojectEngine = uprojectResult.association;
        }
        warnings.push(...uprojectResult.warnings);
      }

      const engineInstallations = await this.findEngineInstallations();

      let matchedEngine: EngineInstallation | undefined;
      if (uprojectEngine && engineInstallations.length > 0) {
        const association = uprojectEngine.guid;
        const isVersionString = !association.startsWith('{');

        if (isVersionString) {
          matchedEngine = engineInstallations.find((engine) => {
            if (engine.associationId && engine.associationId.startsWith('UE_')) {
              const engineVersion = engine.associationId.replace('UE_', '').replace(/_/g, '.');
              return this.compareVersionString(engineVersion, association) === 0;
            }
            return false;
          });
        } else {
          matchedEngine = engineInstallations.find(
            (engine) => engine.associationId === association
          );
        }

        if (!matchedEngine && association) {
          warnings.push(`Engine with association ID ${association} not found in installed engines`);
        }
      }

      if (!matchedEngine && engineInstallations.length > 0) {
        engineInstallations.sort((a, b) => this.compareVersions(b.version, a.version));
        matchedEngine = engineInstallations[0];
        warnings.push(
          `Using engine ${matchedEngine.displayName || matchedEngine.associationId} (not associated with project)`
        );
      }

      return {
        engine: matchedEngine,
        uprojectEngine,
        warnings,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        warnings,
      };
    }
  }

  private static async getEngineAssociationFromProject(projectPath: string): Promise<{
    association?: EngineAssociation;
    warnings: string[];
  }> {
    const warnings: string[] = [];

    try {
      const projectPathResolution = await ProjectPathResolver.resolve(projectPath);

      if (projectPathResolution.isDirectory && !projectPathResolution.wasResolvedFromDirectory) {
        warnings.push('No .uproject file found in project directory');
        return { warnings };
      }

      if (!projectPathResolution.hasUProjectExtension) {
        warnings.push('Project path is not a .uproject file');
        return { warnings };
      }

      const uprojectPath = projectPathResolution.resolvedPath;
      const content = await fs.readFile(uprojectPath, 'utf-8');
      const uproject = JSON.parse(content);

      if (!uproject.EngineAssociation) {
        warnings.push('No EngineAssociation found in .uproject file');
        return { warnings };
      }

      const associationValue = uproject.EngineAssociation;
      const isGuid = associationValue.startsWith('{');

      const association: EngineAssociation = {
        guid: associationValue,
        name: associationValue,
        version: isGuid ? undefined : associationValue,
      };

      return { association, warnings };
    } catch (error) {
      warnings.push(
        `Failed to read project file: ${error instanceof Error ? error.message : String(error)}`
      );
      return { warnings };
    }
  }

  public static async findEngineInstallations(): Promise<EngineInstallation[]> {
    const installations: EngineInstallation[] = [];

    if (Platform.isWindows()) {
      const registryEngines = await this.getEnginesFromRegistry();
      installations.push(...registryEngines);

      const launcherEngines = await this.getEnginesFromLauncher();
      installations.push(...launcherEngines);
    }

    const envEngine = await this.getEngineFromEnvironment();
    if (envEngine) {
      installations.push(envEngine);
    }

    const uniqueInstallations = this.removeDuplicateEngines(installations);

    for (const installation of uniqueInstallations) {
      await this.loadEngineVersionInfo(installation);
    }

    return uniqueInstallations;
  }

  private static async getEnginesFromRegistry(): Promise<EngineInstallation[]> {
    const installations: EngineInstallation[] = [];

    const registryLocations = [
      'HKEY_CURRENT_USER\\SOFTWARE\\Epic Games\\Unreal Engine\\Builds',
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\Epic Games\\Unreal Engine\\Builds',
      'HKEY_CURRENT_USER\\SOFTWARE\\EpicGames\\Unreal Engine',
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\EpicGames\\Unreal Engine',
      'HKEY_CURRENT_USER\\SOFTWARE\\Epic Games\\UE_5',
      'HKEY_CURRENT_USER\\SOFTWARE\\Epic Games\\UE_4',
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\Epic Games\\UE_5',
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\Epic Games\\UE_4',
    ];

    Logger.debug(
      'Querying registry for UE engines from locations: ' + JSON.stringify(registryLocations)
    );

    for (const registryLocation of registryLocations) {
      try {
        Logger.debug(`Querying registry location: ${registryLocation}`);
        const locationEngines = await this.queryRegistryKey(registryLocation);
        installations.push(...locationEngines);
        Logger.debug(`Found ${locationEngines.length} engines at ${registryLocation}`);
      } catch (error) {
        const err = error as Error;
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

  private static async queryRegistryKey(registryKey: string): Promise<EngineInstallation[]> {
    const installations: EngineInstallation[] = [];

    const { stdout } = await execa('reg', ['query', registryKey, '/s']);

    const lines = stdout.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const fullMatch = line.match(/{([^}]+)}\s+REG_SZ\s+(.+)$/);
      if (fullMatch) {
        const guid = `{${fullMatch[1]}}`;
        const enginePath = fullMatch[2].trim();

        installations.push({
          path: enginePath,
          associationId: guid,
          displayName: `UE Engine ${guid}`,
          version: undefined,
          source: 'registry',
        });
        continue;
      }

      if (line.startsWith('{')) {
        const guidMatch = line.match(/^({[^}]+})/);
        if (guidMatch) {
          const guid = guidMatch[1];
          let enginePath: string | undefined;

          const regSzMatch = line.match(/REG_SZ\s+(.+)$/);
          if (regSzMatch) {
            enginePath = regSzMatch[1].trim();
          } else {
            for (let j = i + 1; j < lines.length; j++) {
              const nextLine = lines[j].trim();
              if (nextLine.includes('REG_SZ')) {
                const pathMatch = nextLine.match(/REG_SZ\s+(.+)$/);
                if (pathMatch) {
                  enginePath = pathMatch[1].trim();
                  break;
                }
              } else if (nextLine.startsWith('{') || nextLine.includes(registryKey)) {
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
              source: 'registry',
            });
          } else {
            Logger.debug(`Found GUID ${guid} but could not extract engine path`);
          }
        }
      }
    }

    return installations;
  }

  private static async getEnginesFromLauncher(): Promise<EngineInstallation[]> {
    const installations: EngineInstallation[] = [];

    try {
      const manifestPaths = [
        path.join(
          process.env.LOCALAPPDATA || '',
          'UnrealEngine',
          'Common',
          'LauncherInstalled.dat'
        ),
        path.join(
          process.env.PROGRAMDATA || '',
          'Epic',
          'UnrealEngineLauncher',
          'LauncherInstalled.dat'
        ),
        path.join(
          process.env.PROGRAMDATA || '',
          'Epic',
          'EpicGamesLauncher',
          'Data',
          'LauncherInstalled.dat'
        ),
        path.join(
          process.env.APPDATA || '',
          'Epic',
          'UnrealEngineLauncher',
          'LauncherInstalled.dat'
        ),
        path.join(
          process.env.APPDATA || '',
          'Epic',
          'EpicGamesLauncher',
          'Data',
          'LauncherInstalled.dat'
        ),
        path.join(
          process.env.LOCALAPPDATA || '',
          'EpicGamesLauncher',
          'Data',
          'LauncherInstalled.dat'
        ),
        path.join(
          process.env.LOCALAPPDATA || '',
          'Epic',
          'UnrealEngineLauncher',
          'LauncherInstalled.dat'
        ),
        path.join(
          process.env.APPDATA || '',
          'Epic Games',
          'Launcher',
          'Data',
          'LauncherInstalled.dat'
        ),
        path.join(
          process.env.PROGRAMFILES || 'C:\\Program Files',
          'Epic Games',
          'Launcher',
          'Data',
          'LauncherInstalled.dat'
        ),
        path.join(
          process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)',
          'Epic Games',
          'Launcher',
          'Data',
          'LauncherInstalled.dat'
        ),
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
                if (
                  installation.AppName &&
                  (installation.AppName.startsWith('UE_') ||
                    installation.AppName.includes('UnrealEngine') ||
                    installation.Category === 'engine')
                ) {
                  Logger.debug(
                    `Found UE installation: ${installation.AppName} at ${installation.InstallLocation}`
                  );
                  installations.push({
                    path: installation.InstallLocation,
                    associationId: installation.AppName,
                    displayName:
                      installation.DisplayName ||
                      installation.AppName ||
                      `UE ${installation.AppVersion || 'Unknown'}`,
                    installedDate: installation.InstallDate,
                    version: undefined,
                    source: 'launcher',
                  });
                } else {
                  Logger.debug(`Skipping non-UE installation: ${installation.AppName}`);
                }
              }
            } else {
              Logger.debug('No InstallationList found in manifest or it is not an array');
            }
          } catch (parseError) {
            Logger.debug(
              'Failed to parse launcher manifest: ' +
                (parseError instanceof Error ? parseError.message : String(parseError))
            );
            Logger.debug('Manifest path: ' + manifestPath);
          }
        } else {
          Logger.debug('Launcher manifest not found at: ' + manifestPath);
        }
      }
    } catch (error) {
      Logger.debug(
        'Failed to read launcher manifest: ' +
          (error instanceof Error ? error.message : String(error))
      );
    }

    Logger.debug(`Total launcher engines found: ${installations.length}`);
    return installations;
  }

  private static async getEngineFromEnvironment(): Promise<EngineInstallation | undefined> {
    const envVars = ['UE_ENGINE_PATH', 'UE_ROOT', 'UNREAL_ENGINE_PATH'];

    for (const envVar of envVars) {
      const enginePath = process.env[envVar];
      if (enginePath && (await fs.pathExists(enginePath))) {
        return {
          path: enginePath,
          associationId: `ENV_${envVar}`,
          displayName: `UE Engine (from ${envVar})`,
          version: undefined,
          source: 'environment',
        };
      }
    }

    return undefined;
  }

  private static async loadEngineVersionInfo(installation: EngineInstallation): Promise<void> {
    try {
      const versionFilePaths = [
        path.join(installation.path, 'Engine', 'Binaries', 'Win64', 'UnrealEditor.version'),
        path.join(installation.path, 'Engine', 'Build', 'Build.version'),
      ];

      for (const versionFilePath of versionFilePaths) {
        if (await fs.pathExists(versionFilePath)) {
          try {
            const content = await fs.readFile(versionFilePath, 'utf-8');
            const versionInfo: EngineVersionInfo = JSON.parse(content);
            installation.version = versionInfo;

            installation.displayName = `UE ${versionInfo.MajorVersion}.${versionInfo.MinorVersion}.${versionInfo.PatchVersion}`;

            return;
          } catch (parseError) {
            Logger.debug(
              'Failed to parse version file: ' +
                (parseError instanceof Error ? parseError.message : String(parseError))
            );
          }
        }
      }

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
          BuildId: '',
        };
        installation.displayName = `UE ${versionStr}`;
      }
    } catch (error) {
      Logger.debug(
        'Failed to load engine version info: ' +
          (error instanceof Error ? error.message : String(error))
      );
    }
  }

  private static removeDuplicateEngines(installations: EngineInstallation[]): EngineInstallation[] {
    const pathMap = new Map<string, EngineInstallation>();

    for (const installation of installations) {
      const normalizedPath = path.normalize(installation.path).toLowerCase();
      const existing = pathMap.get(normalizedPath);

      if (!existing) {
        pathMap.set(normalizedPath, installation);
      } else {
        const sourcePriority = { launcher: 0, environment: 1, registry: 2 };
        const existingPriority =
          sourcePriority[existing.source as keyof typeof sourcePriority] ?? 2;
        const newPriority = sourcePriority[installation.source as keyof typeof sourcePriority] ?? 2;

        if (newPriority < existingPriority) {
          pathMap.set(normalizedPath, installation);
        }
      }
    }

    const unique = Array.from(pathMap.values());

    unique.sort((a, b) => this.compareVersions(b.version, a.version));

    return unique;
  }

  private static compareVersions(a?: EngineVersionInfo, b?: EngineVersionInfo): number {
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;

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

  private static compareVersionString(a: string, b: string): number {
    if (a === b || a.startsWith(b + '.') || a.startsWith(b + '_')) {
      return 0;
    }

    const parseVersion = (v: string): number[] => {
      return v.split('.').map((part) => parseInt(part, 10) || 0);
    };
    const partsA = parseVersion(a);
    const partsB = parseVersion(b);

    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const partA = partsA[i] || 0;
      const partB = partsB[i] || 0;
      if (partA !== partB) {
        return partA - partB;
      }
    }
    return 0;
  }
}
