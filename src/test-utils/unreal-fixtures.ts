import fs from 'fs-extra';
import path from 'path';
import { EngineInstallation, EngineVersionInfo } from '../types/engine';
import { UProject } from '../types/project';

type UProjectModule = UProject['Modules'][number];
type UProjectPlugin = NonNullable<UProject['Plugins']>[number];
type ProjectTargetType = 'Editor' | 'Game' | 'Client' | 'Server';

export interface FakeProjectModule {
  name: string;
  type?: UProjectModule['Type'];
  loadingPhase?: UProjectModule['LoadingPhase'];
  directory?: string;
}

export interface FakeProjectTarget {
  name: string;
  type?: ProjectTargetType;
}

export interface CreateFakeProjectOptions {
  projectName?: string;
  projectDirName?: string;
  engineAssociation?: string;
  fileVersion?: number;
  modules?: FakeProjectModule[];
  plugins?: UProjectPlugin[];
  targets?: FakeProjectTarget[];
  withSource?: boolean;
}

export interface FakeProjectFixture {
  projectDir: string;
  projectName: string;
  sourceDir: string;
  uproject: UProject;
  uprojectPath: string;
  targetPaths: string[];
  modulePaths: string[];
}

export interface CreateFakeEngineOptions {
  engineDirName?: string;
  associationId?: string;
  displayName?: string;
  source?: EngineInstallation['source'];
  versionInfo?: Partial<EngineVersionInfo>;
  includeBuildBat?: boolean;
  includeUnrealBuildTool?: boolean;
  includeEditorExecutable?: boolean;
}

export interface FakeEngineFixture {
  enginePath: string;
  buildBatPath: string;
  unrealBuildToolPath: string;
  editorExecutablePath: string;
  buildVersionPath: string;
  editorVersionPath: string;
  installation: EngineInstallation;
  versionInfo: EngineVersionInfo;
}

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

function defaultTargets(projectName: string): FakeProjectTarget[] {
  return [
    { name: `${projectName}Editor`, type: 'Editor' },
    { name: projectName, type: 'Game' },
  ];
}

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
