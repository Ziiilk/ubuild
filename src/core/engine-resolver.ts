/**
 * Engine resolver module for ubuild
 *
 * Resolves Unreal Engine installations from various sources including
 * Windows Registry, Epic Launcher, environment variables, and manual paths.
 * Provides engine version detection and project association resolution.
 *
 * @module core/engine-resolver
 */

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
import { formatError } from '../utils/error';

/**
 * Registry key locations to search for Unreal Engine installations.
 * Ordered by likelihood of finding relevant entries.
 */
const REGISTRY_LOCATIONS: string[] = [
  'HKEY_CURRENT_USER\\SOFTWARE\\Epic Games\\Unreal Engine\\Builds',
  'HKEY_LOCAL_MACHINE\\SOFTWARE\\Epic Games\\Unreal Engine\\Builds',
  'HKEY_CURRENT_USER\\SOFTWARE\\EpicGames\\Unreal Engine',
  'HKEY_LOCAL_MACHINE\\SOFTWARE\\EpicGames\\Unreal Engine',
  'HKEY_CURRENT_USER\\SOFTWARE\\Epic Games\\UE_5',
  'HKEY_CURRENT_USER\\SOFTWARE\\Epic Games\\UE_4',
  'HKEY_LOCAL_MACHINE\\SOFTWARE\\Epic Games\\UE_5',
  'HKEY_LOCAL_MACHINE\\SOFTWARE\\Epic Games\\UE_4',
];

/**
 * Launcher manifest file paths to search for Unreal Engine installations.
 * Covers various Epic Games Launcher installation locations.
 */
const LAUNCHER_MANIFEST_PATHS: string[] = [
  path.join(process.env.LOCALAPPDATA || '', 'UnrealEngine', 'Common', 'LauncherInstalled.dat'),
  path.join(process.env.PROGRAMDATA || '', 'Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat'),
  path.join(
    process.env.PROGRAMDATA || '',
    'Epic',
    'EpicGamesLauncher',
    'Data',
    'LauncherInstalled.dat'
  ),
  path.join(process.env.APPDATA || '', 'Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat'),
  path.join(
    process.env.APPDATA || '',
    'Epic',
    'EpicGamesLauncher',
    'Data',
    'LauncherInstalled.dat'
  ),
  path.join(process.env.LOCALAPPDATA || '', 'EpicGamesLauncher', 'Data', 'LauncherInstalled.dat'),
  path.join(
    process.env.LOCALAPPDATA || '',
    'Epic',
    'UnrealEngineLauncher',
    'LauncherInstalled.dat'
  ),
  path.join(process.env.APPDATA || '', 'Epic Games', 'Launcher', 'Data', 'LauncherInstalled.dat'),
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

/**
 * Resolves Unreal Engine installations from various sources including
 * Windows Registry, Epic Launcher, environment variables, and manual paths.
 */
export class EngineResolver {
  /**
   * Resolves the engine path using the provided options or auto-detection.
   * @param options - Path resolution options including project path and engine path override
   * @returns Promise resolving to the resolved engine installation path
   * @throws Error if engine path cannot be resolved or does not exist
   */
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

  /**
   * Resolves the engine installation for a given project.
   * @param projectPath - Optional path to the project to find associated engine
   * @returns Promise resolving to engine detection result with matched engine info
   */
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
        error: formatError(error),
        warnings,
      };
    }
  }

  /**
   * Extracts the engine association from a project's .uproject file.
   * @param projectPath - Path to the project directory or .uproject file
   * @returns Promise resolving to the engine association and any warnings
   */
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
      warnings.push(`Failed to read project file: ${formatError(error)}`);
      return { warnings };
    }
  }

  /**
   * Finds all Unreal Engine installations from registry, launcher, and environment.
   * @returns Promise resolving to array of detected engine installations
   */
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

  /**
   * Searches Windows registry for Unreal Engine installations.
   * @returns Promise resolving to array of engine installations found in registry
   */
  private static async getEnginesFromRegistry(): Promise<EngineInstallation[]> {
    const installations: EngineInstallation[] = [];

    Logger.debug(
      'Querying registry for UE engines from locations: ' + JSON.stringify(REGISTRY_LOCATIONS)
    );

    for (const registryLocation of REGISTRY_LOCATIONS) {
      try {
        Logger.debug(`Querying registry location: ${registryLocation}`);
        const locationEngines = await this.queryRegistryKey(registryLocation);
        installations.push(...locationEngines);
        Logger.debug(`Found ${locationEngines.length} engines at ${registryLocation}`);
      } catch (error) {
        const errorMessage = formatError(error);
        if (errorMessage.includes('unable to find the specified registry key')) {
          Logger.debug(`Registry key not found: ${registryLocation}`);
        } else {
          Logger.debug(`Failed to query registry location ${registryLocation}: ${errorMessage}`);
        }
      }
    }

    Logger.debug(`Total engines found from registry: ${installations.length}`);
    return installations;
  }

  /**
   * Queries a specific registry key for Unreal Engine entries.
   * @param registryKey - The registry key path to query
   * @returns Promise resolving to array of engine installations found
   */
  private static async queryRegistryKey(registryKey: string): Promise<EngineInstallation[]> {
    const { stdout } = await execa('reg', ['query', registryKey, '/s']);
    const lines = stdout.split('\n');
    const installations: EngineInstallation[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.includes(registryKey)) continue;

      const installation = this.parseRegistryLine(line, lines, i, registryKey);
      if (installation) {
        installations.push(installation);
      }
    }

    return installations;
  }

  /**
   * Parses a single registry line and extracts engine installation if present.
   * Handles both single-line and multi-line formats.
   * @param line - Current line being parsed
   * @param lines - All lines for forward-scanning multi-line entries
   * @param currentIndex - Index of current line in lines array
   * @param registryKey - Registry key for boundary detection
   * @returns EngineInstallation if found, undefined otherwise
   */
  private static parseRegistryLine(
    line: string,
    lines: string[],
    currentIndex: number,
    registryKey: string
  ): EngineInstallation | undefined {
    // Try single-line format first: {GUID} REG_SZ path
    const singleLineResult = this.parseSingleLineEntry(line);
    if (singleLineResult) {
      return singleLineResult;
    }

    // Try multi-line format: {GUID} on one line, REG_SZ path on next
    return this.parseMultiLineEntry(line, lines, currentIndex, registryKey);
  }

  /**
   * Parses single-line registry entries in format: {GUID} REG_SZ path
   * @param line - Registry line to parse
   * @returns EngineInstallation if matched, undefined otherwise
   */
  private static parseSingleLineEntry(line: string): EngineInstallation | undefined {
    const fullMatch = line.match(/{([^}]+)}\s+REG_SZ\s+(.+)$/);
    if (!fullMatch) {
      return undefined;
    }

    const guid = `{${fullMatch[1]}}`;
    const enginePath = fullMatch[2].trim();

    return {
      path: enginePath,
      associationId: guid,
      displayName: `UE Engine ${guid}`,
      version: undefined,
      source: 'registry',
    };
  }

  /**
   * Parses multi-line registry entries where GUID and path are on separate lines.
   * @param line - Current line (should start with { for GUID entries)
   * @param lines - All lines for forward-scanning
   * @param currentIndex - Index of current line
   * @param registryKey - Registry key for boundary detection
   * @returns EngineInstallation if found, undefined otherwise
   */
  private static parseMultiLineEntry(
    line: string,
    lines: string[],
    currentIndex: number,
    registryKey: string
  ): EngineInstallation | undefined {
    if (!line.startsWith('{')) {
      return undefined;
    }

    const guidMatch = line.match(/^({[^}]+})/);
    if (!guidMatch) {
      return undefined;
    }

    const guid = guidMatch[1];
    const enginePath = this.extractEnginePathFromLineOrSubsequent(
      line,
      lines,
      currentIndex,
      registryKey
    );

    if (!enginePath) {
      Logger.debug(`Found GUID ${guid} but could not extract engine path`);
      return undefined;
    }

    return {
      path: enginePath,
      associationId: guid,
      displayName: `UE Engine ${guid}`,
      version: undefined,
      source: 'registry',
    };
  }

  /**
   * Extracts engine path from current line or scans subsequent lines.
   * @param line - Current line to check first
   * @param lines - All lines for forward-scanning
   * @param currentIndex - Index of current line
   * @param registryKey - Registry key for boundary detection
   * @returns Engine path if found, undefined otherwise
   */
  private static extractEnginePathFromLineOrSubsequent(
    line: string,
    lines: string[],
    currentIndex: number,
    registryKey: string
  ): string | undefined {
    // Check current line first for REG_SZ
    const regSzMatch = line.match(/REG_SZ\s+(.+)$/);
    if (regSzMatch) {
      return regSzMatch[1].trim();
    }

    // Scan subsequent lines for REG_SZ entry
    return this.findEnginePathInSubsequentLines(lines, currentIndex, registryKey);
  }

  /**
   * Scans subsequent lines to find REG_SZ engine path entry.
   * Stops at next GUID or registry key header.
   * @param lines - All lines to scan
   * @param startIndex - Index to start scanning from (exclusive)
   * @param registryKey - Registry key for boundary detection
   * @returns Engine path if found, undefined otherwise
   */
  private static findEnginePathInSubsequentLines(
    lines: string[],
    startIndex: number,
    registryKey: string
  ): string | undefined {
    for (let j = startIndex + 1; j < lines.length; j++) {
      const nextLine = lines[j].trim();

      if (nextLine.includes('REG_SZ')) {
        const pathMatch = nextLine.match(/REG_SZ\s+(.+)$/);
        if (pathMatch) {
          return pathMatch[1].trim();
        }
      }

      // Stop scanning at boundaries
      if (nextLine.startsWith('{') || nextLine.includes(registryKey)) {
        break;
      }
    }

    return undefined;
  }

  /**
   * Searches Epic Games Launcher manifest files for Unreal Engine installations.
   * @returns Promise resolving to array of engine installations found in launcher manifests
   */
  private static async getEnginesFromLauncher(): Promise<EngineInstallation[]> {
    const installations: EngineInstallation[] = [];

    try {
      Logger.debug(
        'Searching for launcher manifests in: ' + JSON.stringify(LAUNCHER_MANIFEST_PATHS)
      );

      for (const manifestPath of LAUNCHER_MANIFEST_PATHS) {
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
            Logger.debug('Failed to parse launcher manifest: ' + formatError(parseError));
            Logger.debug('Manifest path: ' + manifestPath);
          }
        } else {
          Logger.debug('Launcher manifest not found at: ' + manifestPath);
        }
      }
    } catch (error) {
      Logger.debug('Failed to read launcher manifest: ' + formatError(error));
    }

    Logger.debug(`Total launcher engines found: ${installations.length}`);
    return installations;
  }

  /**
   * Checks environment variables for Unreal Engine path.
   * @returns Promise resolving to engine installation from environment, or undefined if not found
   */
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

  /**
   * Loads version information for an engine installation from version files.
   * @param installation - The engine installation to load version info for
   * @returns Promise resolving when version info is loaded (mutates installation object)
   */
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
            Logger.debug('Failed to parse version file: ' + formatError(parseError));
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
      Logger.debug('Failed to load engine version info: ' + formatError(error));
    }
  }

  /**
   * Removes duplicate engine installations, preferring launcher sources.
   * @param installations - Array of engine installations that may contain duplicates
   * @returns Array of unique engine installations sorted by version
   */
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

  /**
   * Compares two engine version info objects.
   * @param a - First engine version info
   * @param b - Second engine version info
   * @returns Negative if a < b, positive if a > b, 0 if equal
   */
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

  /**
   * Compares two version strings in semver format.
   * @param a - First version string
   * @param b - Second version string
   * @returns Negative if a < b, positive if a > b, 0 if equal
   */
  private static compareVersionString(a: string, b: string): number {
    if (a === b) {
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
