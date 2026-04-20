import fs from 'fs-extra';
import path from 'path';
import { EngineInstallation, EngineVersionInfo } from '../types/engine';
import { UProject } from '../types/project';

type UProjectModule = NonNullable<UProject['Modules']>[number];
type UProjectPlugin = NonNullable<UProject['Plugins']>[number];
type ProjectTargetType = 'Editor' | 'Game' | 'Client' | 'Server';

/**
 * Represents a fake project module for testing.
 * Used to configure modules when creating fake projects.
 */
export interface FakeProjectModule {
  /** Module name */
  name: string;
  /** Module type (Runtime, Editor, Developer, Program, Server) */
  type?: UProjectModule['Type'];
  /** Loading phase for the module */
  loadingPhase?: UProjectModule['LoadingPhase'];
  /** Directory name for the module (defaults to module name) */
  directory?: string;
}

/**
 * Represents a fake build target for testing.
 * Used to configure targets when creating fake projects.
 */
export interface FakeProjectTarget {
  /** Target name */
  name: string;
  /** Target type (Editor, Game, Client, Server) */
  type?: ProjectTargetType;
}

/**
 * Options for creating a fake Unreal Engine project.
 * Allows customization of project structure and content.
 *
 * @example
 * ```typescript
 * const options: CreateFakeProjectOptions = {
 *   projectName: 'MyGame',
 *   type: 'cpp',
 *   modules: [{ name: 'MyGame', type: 'Runtime' }],
 *   withSource: true
 * };
 * ```
 */
export interface CreateFakeProjectOptions {
  /** Project name (default: 'TestProject') */
  projectName?: string;
  /** Directory name for the project (default: projectName) */
  projectDirName?: string;
  /** Engine association GUID or version string (default: '5.3') */
  engineAssociation?: string;
  /** UProject file format version (default: 3) */
  fileVersion?: number;
  /** Array of project modules to create */
  modules?: FakeProjectModule[];
  /** Array of plugins to include in the project */
  plugins?: UProjectPlugin[];
  /** Array of build targets to create */
  targets?: FakeProjectTarget[];
  /** Whether to create Source directory and files (default: true) */
  withSource?: boolean;
}

/**
 * Fixture containing all paths and data for a fake Unreal Engine project.
 * Returned by createFakeProject function.
 */
export interface FakeProjectFixture {
  /** Absolute path to the project directory */
  projectDir: string;
  /** Project name */
  projectName: string;
  /** Absolute path to the Source directory */
  sourceDir: string;
  /** Parsed uproject data */
  uproject: UProject;
  /** Absolute path to the .uproject file */
  uprojectPath: string;
  /** Array of paths to created .Target.cs files */
  targetPaths: string[];
  /** Array of paths to created .Build.cs files */
  modulePaths: string[];
}

/**
 * Options for creating a fake Unreal Engine installation.
 * Allows customization of engine structure and version info.
 *
 * @example
 * ```typescript
 * const options: CreateFakeEngineOptions = {
 *   associationId: 'UE_5.3',
 *   displayName: 'Unreal Engine 5.3',
 *   includeBuildBat: true,
 *   versionInfo: { MajorVersion: 5, MinorVersion: 3 }
 * };
 * ```
 */
export interface CreateFakeEngineOptions {
  /** Directory name for the engine (default: 'UE_{major}_{minor}') */
  engineDirName?: string;
  /** Engine association ID (default: 'UE_{major}.{minor}') */
  associationId?: string;
  /** Display name for the engine */
  displayName?: string;
  /** Source of engine detection */
  source?: EngineInstallation['source'];
  /** Partial version info (defaults applied for missing fields) */
  versionInfo?: Partial<EngineVersionInfo>;
  /** Whether to include Build.bat (default: true) */
  includeBuildBat?: boolean;
  /** Whether to include UnrealBuildTool.exe (default: true) */
  includeUnrealBuildTool?: boolean;
  /** Whether to include UnrealEditor.exe (default: true) */
  includeEditorExecutable?: boolean;
}

/**
 * Fixture containing all paths and data for a fake Unreal Engine installation.
 * Returned by createFakeEngine function.
 */
export interface FakeEngineFixture {
  /** Absolute path to the engine installation directory */
  enginePath: string;
  /** Absolute path to Build.bat */
  buildBatPath: string;
  /** Absolute path to UnrealBuildTool.exe */
  unrealBuildToolPath: string;
  /** Absolute path to UnrealEditor.exe */
  editorExecutablePath: string;
  /** Absolute path to Build.version file */
  buildVersionPath: string;
  /** Absolute path to UnrealEditor.version file */
  editorVersionPath: string;
  /** Engine installation data */
  installation: EngineInstallation;
  /** Complete version information */
  versionInfo: EngineVersionInfo;
}

/**
 * Creates a fake Unreal Engine project structure for testing.
 * Generates .uproject file, source files, and target files.
 *
 * @example
 * ```typescript
 * const project = await createFakeProject(tempDir, {
 *   projectName: 'MyGame',
 *   type: 'cpp',
 *   modules: [{ name: 'MyGame' }]
 * });
 * console.log(project.uprojectPath); // /tmp/test/MyGame/MyGame.uproject
 * ```
 *
 * @param rootDir - Root directory where the project will be created
 * @param options - Configuration options for the fake project
 * @returns A fixture containing all project paths and data
 */
export async function createFakeProject(
  rootDir: string,
  options: CreateFakeProjectOptions = {}
): Promise<FakeProjectFixture> {
  const projectName = options.projectName ?? 'TestProject';
  const projectDir = path.join(rootDir, options.projectDirName ?? projectName);
  const sourceDir = path.join(projectDir, 'Source');
  const uprojectPath = path.join(projectDir, `${projectName}.uproject`);
  const modules = options.modules ?? [{ name: projectName }];
  const targets = options.targets ?? defaultTargets(projectName);
  const uproject: UProject = {
    FileVersion: options.fileVersion ?? 3,
    EngineAssociation: options.engineAssociation ?? '5.3',
    Modules: modules.map((module) => ({
      Name: module.name,
      Type: module.type ?? 'Runtime',
      LoadingPhase: module.loadingPhase ?? 'Default',
    })),
    Plugins: options.plugins,
  };

  await fs.ensureDir(projectDir);
  await fs.writeJson(uprojectPath, uproject, { spaces: 2 });

  const targetPaths: string[] = [];
  const modulePaths: string[] = [];

  if (options.withSource !== false) {
    await fs.ensureDir(sourceDir);

    for (const target of targets) {
      const targetPath = path.join(sourceDir, `${target.name}.Target.cs`);
      await fs.writeFile(
        targetPath,
        renderTargetFile(target.name, target.type ?? inferTargetType(target.name))
      );
      targetPaths.push(targetPath);
    }

    for (const module of modules) {
      const moduleDir = path.join(sourceDir, module.directory ?? module.name);
      const modulePath = path.join(moduleDir, `${module.name}.Build.cs`);
      await fs.ensureDir(moduleDir);
      await fs.writeFile(modulePath, renderModuleFile(module.name));
      modulePaths.push(modulePath);
    }
  }

  return {
    projectDir,
    projectName,
    sourceDir,
    uproject,
    uprojectPath,
    targetPaths,
    modulePaths,
  };
}

/**
 * Creates a fake Unreal Engine installation for testing.
 * Generates directory structure, version files, and optional executables.
 *
 * @example
 * ```typescript
 * const engine = await createFakeEngine(tempDir, {
 *   versionInfo: { MajorVersion: 5, MinorVersion: 3 }
 * });
 * console.log(engine.buildBatPath); // /tmp/test/UE_5_3/Engine/Build/BatchFiles/Build.bat
 * ```
 *
 * @param rootDir - Root directory where the engine will be created
 * @param options - Configuration options for the fake engine
 * @returns A fixture containing all engine paths and data
 */
export async function createFakeEngine(
  rootDir: string,
  options: CreateFakeEngineOptions = {}
): Promise<FakeEngineFixture> {
  const versionInfo = createVersionInfo(options.versionInfo);
  const versionLabel = `${versionInfo.MajorVersion}.${versionInfo.MinorVersion}`;
  const enginePath = path.join(
    rootDir,
    options.engineDirName ?? `UE_${versionLabel.replace('.', '_')}`
  );
  const buildBatPath = path.join(enginePath, 'Engine', 'Build', 'BatchFiles', 'Build.bat');
  const unrealBuildToolPath = path.join(
    enginePath,
    'Engine',
    'Binaries',
    'DotNET',
    'UnrealBuildTool',
    'UnrealBuildTool.exe'
  );
  const editorExecutablePath = path.join(
    enginePath,
    'Engine',
    'Binaries',
    'Win64',
    'UnrealEditor.exe'
  );
  const buildVersionPath = path.join(enginePath, 'Engine', 'Build', 'Build.version');
  const editorVersionPath = path.join(
    enginePath,
    'Engine',
    'Binaries',
    'Win64',
    'UnrealEditor.version'
  );

  await fs.ensureDir(enginePath);
  await fs.ensureDir(path.dirname(buildVersionPath));
  await fs.ensureDir(path.dirname(editorVersionPath));
  await fs.writeJson(buildVersionPath, versionInfo, { spaces: 2 });
  await fs.writeJson(editorVersionPath, versionInfo, { spaces: 2 });

  if (options.includeBuildBat !== false) {
    await fs.ensureDir(path.dirname(buildBatPath));
    await fs.writeFile(buildBatPath, '@echo off\r\nexit /b 0\r\n');
  }

  if (options.includeUnrealBuildTool !== false) {
    await fs.ensureDir(path.dirname(unrealBuildToolPath));
    await fs.writeFile(unrealBuildToolPath, '');
  }

  if (options.includeEditorExecutable !== false) {
    await fs.writeFile(editorExecutablePath, '');
  }

  const associationId = options.associationId ?? `UE_${versionLabel.replace('.', '_')}`;
  const installation: EngineInstallation = {
    path: enginePath,
    associationId,
    displayName: options.displayName ?? `UE ${versionLabel}.${versionInfo.PatchVersion}`,
    version: versionInfo,
    source: options.source ?? 'environment',
  };

  return {
    enginePath,
    buildBatPath,
    unrealBuildToolPath,
    editorExecutablePath,
    buildVersionPath,
    editorVersionPath,
    installation,
    versionInfo,
  };
}

/**
 * Creates default build targets for a project.
 * Generates Editor and Game targets with standard naming conventions.
 *
 * @param projectName - The name of the project
 * @returns Array of default targets (Editor and Game)
 */
function defaultTargets(projectName: string): FakeProjectTarget[] {
  return [
    { name: `${projectName}Editor`, type: 'Editor' },
    { name: projectName, type: 'Game' },
  ];
}

/**
 * Infers the target type from a target name.
 * Analyzes the target name to determine if it's an Editor, Client, Server, or Game target.
 *
 * @param targetName - The name of the target to analyze
 * @returns The inferred target type
 */
function inferTargetType(targetName: string): ProjectTargetType {
  const normalizedTargetName = targetName.toLowerCase();

  if (normalizedTargetName.includes('editor')) {
    return 'Editor';
  }

  if (normalizedTargetName.includes('client')) {
    return 'Client';
  }

  if (normalizedTargetName.includes('server')) {
    return 'Server';
  }

  return 'Game';
}

/**
 * Renders a C# target rules file content.
 * Generates the source code for a Target.cs file used by UnrealBuildTool.
 *
 * @param targetName - The name of the target
 * @param targetType - The type of the target (Editor, Game, Client, Server)
 * @returns The rendered C# source code
 */
function renderTargetFile(targetName: string, targetType: ProjectTargetType): string {
  return [
    'using UnrealBuildTool;',
    '',
    `public class ${targetName}Target : TargetRules`,
    '{',
    `  public ${targetName}Target(TargetInfo Target) : base(Target)`,
    '  {',
    `    Type = TargetType.${targetType};`,
    '    DefaultBuildSettings = BuildSettingsVersion.V2;',
    '  }',
    '}',
    '',
  ].join('\n');
}

/**
 * Renders a C# module rules file content.
 * Generates the source code for a Build.cs file used by UnrealBuildTool.
 *
 * @param moduleName - The name of the module
 * @returns The rendered C# source code
 */
function renderModuleFile(moduleName: string): string {
  return [
    'using UnrealBuildTool;',
    '',
    `public class ${moduleName} : ModuleRules`,
    '{',
    `  public ${moduleName}(ReadOnlyTargetRules Target) : base(Target)`,
    '  {',
    '    PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;',
    '  }',
    '}',
    '',
  ].join('\n');
}

/**
 * Creates version info with defaults for missing fields.
 * Provides sensible defaults for engine version information.
 *
 * @param overrides - Partial version info to override defaults
 * @returns Complete version info with all fields populated
 */
function createVersionInfo(overrides: Partial<EngineVersionInfo> = {}): EngineVersionInfo {
  return {
    MajorVersion: overrides.MajorVersion ?? 5,
    MinorVersion: overrides.MinorVersion ?? 3,
    PatchVersion: overrides.PatchVersion ?? 2,
    Changelist: overrides.Changelist ?? 0,
    CompatibleChangelist: overrides.CompatibleChangelist ?? 0,
    IsLicenseeVersion: overrides.IsLicenseeVersion ?? 0,
    IsPromotedBuild: overrides.IsPromotedBuild ?? 0,
    BranchName: overrides.BranchName ?? '++UE5+Release',
    BuildId: overrides.BuildId ?? 'test-build-id',
  };
}
