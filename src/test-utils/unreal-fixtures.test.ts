import fs from 'fs-extra';
import path from 'path';
import { createFakeProject, createFakeEngine } from './unreal-fixtures';
import { createTempDir } from './temp-dir';

describe('createFakeProject', () => {
  it('creates a project with default values', async () => {
    const tempDir = await createTempDir();
    const project = await createFakeProject(tempDir.path);

    expect(project.projectName).toBe('TestProject');
    expect(project.projectDir).toBe(path.join(tempDir.path, 'TestProject'));
    expect(project.sourceDir).toBe(path.join(tempDir.path, 'TestProject', 'Source'));
    expect(project.uprojectPath).toBe(
      path.join(tempDir.path, 'TestProject', 'TestProject.uproject')
    );

    // Verify directory structure
    expect(await fs.pathExists(project.projectDir)).toBe(true);
    expect(await fs.pathExists(project.sourceDir)).toBe(true);
    expect(await fs.pathExists(project.uprojectPath)).toBe(true);

    // Verify uproject content
    expect(project.uproject.FileVersion).toBe(3);
    expect(project.uproject.EngineAssociation).toBe('5.3');
    expect(project.uproject.Modules).toHaveLength(1);
    expect(project.uproject.Modules[0].Name).toBe('TestProject');
    expect(project.uproject.Modules[0].Type).toBe('Runtime');
    expect(project.uproject.Modules[0].LoadingPhase).toBe('Default');

    await tempDir.cleanup();
  });

  it('creates project with custom name', async () => {
    const tempDir = await createTempDir();
    const project = await createFakeProject(tempDir.path, { projectName: 'MyGame' });

    expect(project.projectName).toBe('MyGame');
    expect(project.projectDir).toBe(path.join(tempDir.path, 'MyGame'));
    expect(project.uprojectPath).toBe(path.join(tempDir.path, 'MyGame', 'MyGame.uproject'));
    expect(project.uproject.Modules[0].Name).toBe('MyGame');

    await tempDir.cleanup();
  });

  it('creates project with custom directory name', async () => {
    const tempDir = await createTempDir();
    const project = await createFakeProject(tempDir.path, {
      projectName: 'MyGame',
      projectDirName: 'CustomDir',
    });

    expect(project.projectDir).toBe(path.join(tempDir.path, 'CustomDir'));
    expect(project.uprojectPath).toBe(path.join(tempDir.path, 'CustomDir', 'MyGame.uproject'));

    await tempDir.cleanup();
  });

  it('creates project with custom engine association', async () => {
    const tempDir = await createTempDir();
    const project = await createFakeProject(tempDir.path, { engineAssociation: '5.4' });

    expect(project.uproject.EngineAssociation).toBe('5.4');

    await tempDir.cleanup();
  });

  it('creates project with custom file version', async () => {
    const tempDir = await createTempDir();
    const project = await createFakeProject(tempDir.path, { fileVersion: 4 });

    expect(project.uproject.FileVersion).toBe(4);

    await tempDir.cleanup();
  });

  it('creates project with custom modules', async () => {
    const tempDir = await createTempDir();
    const project = await createFakeProject(tempDir.path, {
      projectName: 'MyGame',
      modules: [
        { name: 'CoreModule', type: 'Runtime', loadingPhase: 'PreDefault' },
        { name: 'EditorExt', type: 'Editor', loadingPhase: 'PostDefault' },
      ],
    });

    expect(project.uproject.Modules).toHaveLength(2);
    expect(project.uproject.Modules[0].Name).toBe('CoreModule');
    expect(project.uproject.Modules[0].Type).toBe('Runtime');
    expect(project.uproject.Modules[0].LoadingPhase).toBe('PreDefault');
    expect(project.uproject.Modules[1].Name).toBe('EditorExt');
    expect(project.uproject.Modules[1].Type).toBe('Editor');
    expect(project.uproject.Modules[1].LoadingPhase).toBe('PostDefault');

    // Verify module files are created
    expect(project.modulePaths).toHaveLength(2);
    expect(await fs.pathExists(project.modulePaths[0])).toBe(true);
    expect(await fs.pathExists(project.modulePaths[1])).toBe(true);

    await tempDir.cleanup();
  });

  it('creates project with custom targets', async () => {
    const tempDir = await createTempDir();
    const project = await createFakeProject(tempDir.path, {
      projectName: 'MyGame',
      targets: [
        { name: 'MyGameEditor', type: 'Editor' },
        { name: 'MyGame', type: 'Game' },
        { name: 'MyGameServer', type: 'Server' },
        { name: 'MyGameClient', type: 'Client' },
      ],
    });

    expect(project.targetPaths).toHaveLength(4);
    expect(await fs.pathExists(project.targetPaths[0])).toBe(true);
    expect(await fs.pathExists(project.targetPaths[1])).toBe(true);
    expect(await fs.pathExists(project.targetPaths[2])).toBe(true);
    expect(await fs.pathExists(project.targetPaths[3])).toBe(true);

    // Verify target file content
    const editorTarget = await fs.readFile(project.targetPaths[0], 'utf-8');
    expect(editorTarget).toContain('public class MyGameEditorTarget');
    expect(editorTarget).toContain('Type = TargetType.Editor');

    const gameTarget = await fs.readFile(project.targetPaths[1], 'utf-8');
    expect(gameTarget).toContain('public class MyGameTarget');
    expect(gameTarget).toContain('Type = TargetType.Game');

    const serverTarget = await fs.readFile(project.targetPaths[2], 'utf-8');
    expect(serverTarget).toContain('Type = TargetType.Server');

    const clientTarget = await fs.readFile(project.targetPaths[3], 'utf-8');
    expect(clientTarget).toContain('Type = TargetType.Client');

    await tempDir.cleanup();
  });

  it('creates project with plugins', async () => {
    const tempDir = await createTempDir();
    const project = await createFakeProject(tempDir.path, {
      plugins: [
        { Name: 'TestPlugin', Enabled: true },
        { Name: 'DisabledPlugin', Enabled: false },
      ],
    });

    expect(project.uproject.Plugins).toHaveLength(2);
    expect(project.uproject.Plugins![0].Name).toBe('TestPlugin');
    expect(project.uproject.Plugins![0].Enabled).toBe(true);
    expect(project.uproject.Plugins![1].Name).toBe('DisabledPlugin');
    expect(project.uproject.Plugins![1].Enabled).toBe(false);

    await tempDir.cleanup();
  });

  it('creates project without source when withSource is false', async () => {
    const tempDir = await createTempDir();
    const project = await createFakeProject(tempDir.path, {
      projectName: 'BlueprintProject',
      withSource: false,
    });

    expect(await fs.pathExists(project.sourceDir)).toBe(false);
    expect(project.targetPaths).toHaveLength(0);
    expect(project.modulePaths).toHaveLength(0);

    // uproject should still exist
    expect(await fs.pathExists(project.uprojectPath)).toBe(true);

    await tempDir.cleanup();
  });

  it('creates module in custom directory', async () => {
    const tempDir = await createTempDir();
    const project = await createFakeProject(tempDir.path, {
      projectName: 'MyGame',
      modules: [{ name: 'Core', directory: 'CoreModule' }],
    });

    const expectedModulePath = path.join(project.sourceDir, 'CoreModule', 'Core.Build.cs');
    expect(project.modulePaths[0]).toBe(expectedModulePath);
    expect(await fs.pathExists(expectedModulePath)).toBe(true);

    await tempDir.cleanup();
  });

  it('infers target type from target name', async () => {
    const tempDir = await createTempDir();
    const project = await createFakeProject(tempDir.path, {
      projectName: 'MyGame',
      targets: [
        { name: 'MyGameEditor' }, // Should infer Editor
        { name: 'MyGame' }, // Should infer Game
        { name: 'MyGameServer' }, // Should infer Server
        { name: 'MyGameClient' }, // Should infer Client
        { name: 'CustomTarget' }, // Should default to Game
      ],
    });

    const editorTarget = await fs.readFile(project.targetPaths[0], 'utf-8');
    expect(editorTarget).toContain('Type = TargetType.Editor');

    const gameTarget = await fs.readFile(project.targetPaths[1], 'utf-8');
    expect(gameTarget).toContain('Type = TargetType.Game');

    const serverTarget = await fs.readFile(project.targetPaths[2], 'utf-8');
    expect(serverTarget).toContain('Type = TargetType.Server');

    const clientTarget = await fs.readFile(project.targetPaths[3], 'utf-8');
    expect(clientTarget).toContain('Type = TargetType.Client');

    const customTarget = await fs.readFile(project.targetPaths[4], 'utf-8');
    expect(customTarget).toContain('Type = TargetType.Game');

    await tempDir.cleanup();
  });

  it('creates module files with correct content', async () => {
    const tempDir = await createTempDir();
    const project = await createFakeProject(tempDir.path, {
      projectName: 'MyGame',
      modules: [{ name: 'MyGame' }],
    });

    const moduleContent = await fs.readFile(project.modulePaths[0], 'utf-8');
    expect(moduleContent).toContain('using UnrealBuildTool;');
    expect(moduleContent).toContain('public class MyGame : ModuleRules');
    expect(moduleContent).toContain('public MyGame(ReadOnlyTargetRules Target) : base(Target)');
    expect(moduleContent).toContain('PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;');

    await tempDir.cleanup();
  });

  it('returns correct fixture data', async () => {
    const tempDir = await createTempDir();
    const project = await createFakeProject(tempDir.path, { projectName: 'TestGame' });

    expect(project).toHaveProperty('projectDir');
    expect(project).toHaveProperty('projectName');
    expect(project).toHaveProperty('sourceDir');
    expect(project).toHaveProperty('uproject');
    expect(project).toHaveProperty('uprojectPath');
    expect(project).toHaveProperty('targetPaths');
    expect(project).toHaveProperty('modulePaths');

    expect(Array.isArray(project.targetPaths)).toBe(true);
    expect(Array.isArray(project.modulePaths)).toBe(true);

    await tempDir.cleanup();
  });
});

describe('createFakeEngine', () => {
  it('creates engine with default values', async () => {
    const tempDir = await createTempDir();
    const engine = await createFakeEngine(tempDir.path);

    expect(engine.enginePath).toBe(path.join(tempDir.path, 'UE_5_3'));
    expect(await fs.pathExists(engine.enginePath)).toBe(true);
    expect(await fs.pathExists(engine.buildBatPath)).toBe(true);
    expect(await fs.pathExists(engine.unrealBuildToolPath)).toBe(true);
    expect(await fs.pathExists(engine.editorExecutablePath)).toBe(true);
    expect(await fs.pathExists(engine.buildVersionPath)).toBe(true);
    expect(await fs.pathExists(engine.editorVersionPath)).toBe(true);

    // Verify version info defaults
    expect(engine.versionInfo.MajorVersion).toBe(5);
    expect(engine.versionInfo.MinorVersion).toBe(3);
    expect(engine.versionInfo.PatchVersion).toBe(2);

    // Verify installation data
    expect(engine.installation.path).toBe(engine.enginePath);
    expect(engine.installation.associationId).toBe('UE_5_3');
    expect(engine.installation.displayName).toBe('UE 5.3.2');
    expect(engine.installation.source).toBe('environment');

    await tempDir.cleanup();
  });

  it('creates engine with custom version', async () => {
    const tempDir = await createTempDir();
    const engine = await createFakeEngine(tempDir.path, {
      versionInfo: { MajorVersion: 5, MinorVersion: 4, PatchVersion: 1 },
    });

    expect(engine.enginePath).toBe(path.join(tempDir.path, 'UE_5_4'));
    expect(engine.versionInfo.MajorVersion).toBe(5);
    expect(engine.versionInfo.MinorVersion).toBe(4);
    expect(engine.versionInfo.PatchVersion).toBe(1);
    expect(engine.installation.associationId).toBe('UE_5_4');
    expect(engine.installation.displayName).toBe('UE 5.4.1');

    await tempDir.cleanup();
  });

  it('creates engine with custom directory name', async () => {
    const tempDir = await createTempDir();
    const engine = await createFakeEngine(tempDir.path, {
      engineDirName: 'CustomEngine',
    });

    expect(engine.enginePath).toBe(path.join(tempDir.path, 'CustomEngine'));
    expect(engine.installation.path).toBe(path.join(tempDir.path, 'CustomEngine'));

    await tempDir.cleanup();
  });

  it('creates engine with custom association ID', async () => {
    const tempDir = await createTempDir();
    const engine = await createFakeEngine(tempDir.path, {
      associationId: '{12345678-1234-1234-1234-123456789012}',
    });

    expect(engine.installation.associationId).toBe('{12345678-1234-1234-1234-123456789012}');

    await tempDir.cleanup();
  });

  it('creates engine with custom display name', async () => {
    const tempDir = await createTempDir();
    const engine = await createFakeEngine(tempDir.path, {
      displayName: 'My Custom Engine',
    });

    expect(engine.installation.displayName).toBe('My Custom Engine');

    await tempDir.cleanup();
  });

  it('creates engine with custom source', async () => {
    const tempDir = await createTempDir();
    const engine = await createFakeEngine(tempDir.path, {
      source: 'registry',
    });

    expect(engine.installation.source).toBe('registry');

    await tempDir.cleanup();
  });

  it('creates engine without Build.bat when specified', async () => {
    const tempDir = await createTempDir();
    const engine = await createFakeEngine(tempDir.path, {
      includeBuildBat: false,
    });

    expect(await fs.pathExists(engine.buildBatPath)).toBe(false);
    expect(await fs.pathExists(engine.unrealBuildToolPath)).toBe(true);
    expect(await fs.pathExists(engine.editorExecutablePath)).toBe(true);

    await tempDir.cleanup();
  });

  it('creates engine without UnrealBuildTool when specified', async () => {
    const tempDir = await createTempDir();
    const engine = await createFakeEngine(tempDir.path, {
      includeUnrealBuildTool: false,
    });

    expect(await fs.pathExists(engine.buildBatPath)).toBe(true);
    expect(await fs.pathExists(engine.unrealBuildToolPath)).toBe(false);
    expect(await fs.pathExists(engine.editorExecutablePath)).toBe(true);

    await tempDir.cleanup();
  });

  it('creates engine without Editor executable when specified', async () => {
    const tempDir = await createTempDir();
    const engine = await createFakeEngine(tempDir.path, {
      includeEditorExecutable: false,
    });

    expect(await fs.pathExists(engine.buildBatPath)).toBe(true);
    expect(await fs.pathExists(engine.unrealBuildToolPath)).toBe(true);
    expect(await fs.pathExists(engine.editorExecutablePath)).toBe(false);

    await tempDir.cleanup();
  });

  it('creates engine without any optional files', async () => {
    const tempDir = await createTempDir();
    const engine = await createFakeEngine(tempDir.path, {
      includeBuildBat: false,
      includeUnrealBuildTool: false,
      includeEditorExecutable: false,
    });

    expect(await fs.pathExists(engine.buildBatPath)).toBe(false);
    expect(await fs.pathExists(engine.unrealBuildToolPath)).toBe(false);
    expect(await fs.pathExists(engine.editorExecutablePath)).toBe(false);
    expect(await fs.pathExists(engine.buildVersionPath)).toBe(true);
    expect(await fs.pathExists(engine.editorVersionPath)).toBe(true);

    await tempDir.cleanup();
  });

  it('writes correct version info to Build.version', async () => {
    const tempDir = await createTempDir();
    const engine = await createFakeEngine(tempDir.path, {
      versionInfo: {
        MajorVersion: 4,
        MinorVersion: 27,
        PatchVersion: 2,
        Changelist: 12345,
        BranchName: '++UE4+Release-4.27',
      },
    });

    const buildVersion = await fs.readJson(engine.buildVersionPath);
    expect(buildVersion.MajorVersion).toBe(4);
    expect(buildVersion.MinorVersion).toBe(27);
    expect(buildVersion.PatchVersion).toBe(2);
    expect(buildVersion.Changelist).toBe(12345);
    expect(buildVersion.BranchName).toBe('++UE4+Release-4.27');

    await tempDir.cleanup();
  });

  it('writes correct content to Build.bat', async () => {
    const tempDir = await createTempDir();
    const engine = await createFakeEngine(tempDir.path);

    const buildBatContent = await fs.readFile(engine.buildBatPath, 'utf-8');
    expect(buildBatContent).toContain('@echo off');
    expect(buildBatContent).toContain('exit /b 0');

    await tempDir.cleanup();
  });

  it('returns correct fixture data', async () => {
    const tempDir = await createTempDir();
    const engine = await createFakeEngine(tempDir.path);

    expect(engine).toHaveProperty('enginePath');
    expect(engine).toHaveProperty('buildBatPath');
    expect(engine).toHaveProperty('unrealBuildToolPath');
    expect(engine).toHaveProperty('editorExecutablePath');
    expect(engine).toHaveProperty('buildVersionPath');
    expect(engine).toHaveProperty('editorVersionPath');
    expect(engine).toHaveProperty('installation');
    expect(engine).toHaveProperty('versionInfo');

    await tempDir.cleanup();
  });

  it('handles UE4 version correctly', async () => {
    const tempDir = await createTempDir();
    const engine = await createFakeEngine(tempDir.path, {
      versionInfo: { MajorVersion: 4, MinorVersion: 27 },
    });

    expect(engine.enginePath).toBe(path.join(tempDir.path, 'UE_4_27'));
    expect(engine.versionInfo.MajorVersion).toBe(4);
    expect(engine.versionInfo.MinorVersion).toBe(27);

    await tempDir.cleanup();
  });
});
