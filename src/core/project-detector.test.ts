import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { ProjectDetector } from './project-detector';
import { UProject } from '../types/project';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((tempDir) => fs.remove(tempDir)));
  tempDirs.length = 0;
});

async function createTempDir(): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-detector-'));
  tempDirs.push(tempDir);
  return tempDir;
}

function createValidUProject(
  modules: UProject['Modules'] = [
    {
      Name: 'TestGame',
      Type: 'Runtime',
      LoadingPhase: 'Default',
    },
  ]
): UProject {
  return {
    FileVersion: 3,
    EngineAssociation: '5.3',
    Modules: modules,
  };
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

async function writeTextFile(filePath: string, content: string = ''): Promise<void> {
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf-8');
}

describe('ProjectDetector', () => {
  it('detects a .uproject file in the current directory', async () => {
    const cwd = await createTempDir();
    const projectName = 'SurfaceProject';
    const projectFilePath = path.join(cwd, `${projectName}.uproject`);
    const sourceDir = path.join(cwd, 'Source');

    await writeJsonFile(projectFilePath, createValidUProject());
    await fs.ensureDir(sourceDir);

    const result = await ProjectDetector.detectProject({ cwd, recursive: false });

    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.warnings).toEqual([]);
    expect(result.project).toBeDefined();

    if (!result.project) {
      throw new Error('Expected a detected project result');
    }

    expect(result.project.name).toBe(projectName);
    expect(result.project.path).toBe(cwd);
    expect(result.project.sourceDir).toBe(sourceDir);
    expect(result.project.targets).toEqual([]);
    expect(result.project.modules).toEqual([]);
  });

  it('only finds nested .uproject files when recursive discovery is enabled', async () => {
    const cwd = await createTempDir();
    const projectName = 'NestedProject';
    const nestedProjectDir = path.join(cwd, 'games', projectName);
    const projectFilePath = path.join(nestedProjectDir, `${projectName}.uproject`);

    await writeJsonFile(projectFilePath, createValidUProject());
    await fs.ensureDir(path.join(nestedProjectDir, 'Source'));

    const nonRecursiveResult = await ProjectDetector.detectProject({ cwd, recursive: false });
    const recursiveResult = await ProjectDetector.detectProject({ cwd, recursive: true });

    expect(nonRecursiveResult.isValid).toBe(false);
    expect(nonRecursiveResult.error).toBe('No Unreal Engine project (.uproject) file found');
    expect(nonRecursiveResult.warnings).toEqual([]);

    expect(recursiveResult.isValid).toBe(true);
    expect(recursiveResult.error).toBeUndefined();
    expect(recursiveResult.warnings).toEqual([]);
    expect(recursiveResult.project).toBeDefined();

    if (!recursiveResult.project) {
      throw new Error('Expected recursive discovery to find a project');
    }

    expect(recursiveResult.project.name).toBe(projectName);
    expect(recursiveResult.project.path).toBe(nestedProjectDir);
  });

  it('reports structurally invalid .uproject files as invalid project results', async () => {
    const cwd = await createTempDir();
    const projectFilePath = path.join(cwd, 'BrokenProject.uproject');

    await writeJsonFile(projectFilePath, {
      FileVersion: 3,
      EngineAssociation: '5.3',
    });
    await fs.ensureDir(path.join(cwd, 'Source'));

    const result = await ProjectDetector.detectProject({ cwd, recursive: false });

    expect(result.isValid).toBe(false);
    expect(result.project).toBeUndefined();
    expect(result.error).toBe('Invalid .uproject file: Missing or invalid Modules array');
    expect(result.warnings).toEqual([]);
  });

  it('returns a blueprint-only warning when the project has no Source directory', async () => {
    const cwd = await createTempDir();
    const projectName = 'BlueprintOnlyProject';
    const projectFilePath = path.join(cwd, `${projectName}.uproject`);

    await writeJsonFile(projectFilePath, createValidUProject([]));

    const result = await ProjectDetector.detectProject({ cwd, recursive: false });

    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.warnings).toEqual([
      'Source directory not found - this may be a blueprint-only project',
    ]);
    expect(result.project).toBeDefined();

    if (!result.project) {
      throw new Error('Expected blueprint-only project details');
    }

    expect(result.project.name).toBe(projectName);
    expect(result.project.path).toBe(cwd);
    expect(result.project.sourceDir).toBe('');
    expect(result.project.targets).toEqual([]);
    expect(result.project.modules).toEqual([]);
  });

  it('discovers root-level targets and recursively discovers module build files', async () => {
    const cwd = await createTempDir();
    const projectName = 'DiscoveryProject';
    const projectFilePath = path.join(cwd, `${projectName}.uproject`);
    const sourceDir = path.join(cwd, 'Source');

    await writeJsonFile(projectFilePath, createValidUProject());
    await fs.ensureDir(sourceDir);

    await writeTextFile(path.join(sourceDir, `${projectName}.Target.cs`), '// game target');
    await writeTextFile(path.join(sourceDir, `${projectName}Editor.Target.cs`), '// editor target');
    await writeTextFile(path.join(sourceDir, `${projectName}Server.Target.cs`), '// server target');
    await writeTextFile(path.join(sourceDir, 'Gameplay.Build.cs'), '// root module');
    await writeTextFile(path.join(sourceDir, 'Gameplay', 'Gameplay.Build.cs'), '// nested module');
    await writeTextFile(
      path.join(sourceDir, 'Networking', 'Networking.Build.cs'),
      '// nested module'
    );
    await writeTextFile(
      path.join(sourceDir, 'NestedTargets', `${projectName}Client.Target.cs`),
      '// nested target should not be discovered'
    );

    const result = await ProjectDetector.detectProject({ cwd, recursive: false });

    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.warnings).toEqual([]);
    expect(result.project).toBeDefined();

    if (!result.project) {
      throw new Error('Expected discovered project details');
    }

    const targets = [...result.project.targets].sort((left, right) =>
      left.name.localeCompare(right.name)
    );
    const modules = [...result.project.modules].sort((left, right) =>
      left.name.localeCompare(right.name)
    );

    expect(targets).toEqual([
      {
        name: 'DiscoveryProject',
        type: 'Game',
        path: path.join(sourceDir, 'DiscoveryProject.Target.cs'),
      },
      {
        name: 'DiscoveryProjectEditor',
        type: 'Editor',
        path: path.join(sourceDir, 'DiscoveryProjectEditor.Target.cs'),
      },
      {
        name: 'DiscoveryProjectServer',
        type: 'Server',
        path: path.join(sourceDir, 'DiscoveryProjectServer.Target.cs'),
      },
    ]);

    expect(modules).toEqual([
      {
        name: 'Gameplay',
        path: path.join(sourceDir, 'Gameplay.Build.cs'),
      },
      {
        name: 'Gameplay',
        path: path.join(sourceDir, 'Gameplay', 'Gameplay.Build.cs'),
      },
      {
        name: 'Networking',
        path: path.join(sourceDir, 'Networking', 'Networking.Build.cs'),
      },
    ]);
  });

  it('returns error when no .uproject files are found in directory', async () => {
    const cwd = await createTempDir();

    const result = await ProjectDetector.detectProject({ cwd, recursive: false });

    expect(result.isValid).toBe(false);
    expect(result.error).toBe('No Unreal Engine project (.uproject) file found');
    expect(result.project).toBeUndefined();
    expect(result.warnings).toEqual([]);
  });

  it('returns error when .uproject file has missing FileVersion', async () => {
    const cwd = await createTempDir();
    const projectFilePath = path.join(cwd, 'TestProject.uproject');

    await writeJsonFile(projectFilePath, {
      EngineAssociation: '5.3',
      Modules: [{ Name: 'Test', Type: 'Runtime', LoadingPhase: 'Default' }],
    });

    const result = await ProjectDetector.detectProject({ cwd, recursive: false });

    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Invalid .uproject file: Missing FileVersion field');
    expect(result.project).toBeUndefined();
  });

  it('returns error when .uproject file has missing EngineAssociation', async () => {
    const cwd = await createTempDir();
    const projectFilePath = path.join(cwd, 'TestProject.uproject');

    await writeJsonFile(projectFilePath, {
      FileVersion: 3,
      Modules: [{ Name: 'Test', Type: 'Runtime', LoadingPhase: 'Default' }],
    });

    const result = await ProjectDetector.detectProject({ cwd, recursive: false });

    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Invalid .uproject file: Missing EngineAssociation field');
    expect(result.project).toBeUndefined();
  });

  it('detects Client target type from target filename', async () => {
    const cwd = await createTempDir();
    const projectName = 'ClientTestProject';
    const projectFilePath = path.join(cwd, `${projectName}.uproject`);
    const sourceDir = path.join(cwd, 'Source');

    await writeJsonFile(projectFilePath, createValidUProject());
    await fs.ensureDir(sourceDir);
    await writeTextFile(path.join(sourceDir, `${projectName}Client.Target.cs`), '// client target');

    const result = await ProjectDetector.detectProject({ cwd, recursive: false });

    expect(result.isValid).toBe(true);
    expect(result.project).toBeDefined();

    if (!result.project) {
      throw new Error('Expected project details');
    }

    expect(result.project.targets).toHaveLength(1);
    expect(result.project.targets[0].type).toBe('Client');
  });

  it('accepts project with unexpected FileVersion without error', async () => {
    const cwd = await createTempDir();
    const projectName = 'OldVersionProject';
    const projectFilePath = path.join(cwd, `${projectName}.uproject`);

    await writeJsonFile(projectFilePath, {
      FileVersion: 2,
      EngineAssociation: '4.27',
      Modules: [{ Name: 'Test', Type: 'Runtime', LoadingPhase: 'Default' }],
    });
    await fs.ensureDir(path.join(cwd, 'Source'));

    const result = await ProjectDetector.detectProject({ cwd, recursive: false });

    // Project is accepted despite unexpected FileVersion
    expect(result.isValid).toBe(true);
    expect(result.project).toBeDefined();
    expect(result.error).toBeUndefined();
    // Note: FileVersion warnings from validation are not currently propagated to final result
  });

  it('handles invalid JSON in .uproject file gracefully', async () => {
    const cwd = await createTempDir();
    const projectFilePath = path.join(cwd, 'InvalidProject.uproject');

    await fs.writeFile(projectFilePath, 'this is not valid json', 'utf-8');

    const result = await ProjectDetector.detectProject({ cwd, recursive: false });

    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Unexpected token');
    expect(result.project).toBeUndefined();
  });

  it('uses default cwd when options.cwd is not provided', async () => {
    const result = await ProjectDetector.detectProject({ recursive: false });

    // Since we can't predict the actual result, we just verify the method works
    // and returns a valid result structure (either valid or invalid depending on cwd)
    expect(typeof result.isValid).toBe('boolean');
    if (!result.isValid) {
      expect(result.error).toBeDefined();
    }
  });

  it('detects multiple modules at different nesting levels', async () => {
    const cwd = await createTempDir();
    const projectName = 'MultiModuleProject';
    const projectFilePath = path.join(cwd, `${projectName}.uproject`);
    const sourceDir = path.join(cwd, 'Source');

    await writeJsonFile(projectFilePath, createValidUProject());
    await fs.ensureDir(sourceDir);

    await writeTextFile(path.join(sourceDir, 'Core', 'Core.Build.cs'), '// core module');
    await writeTextFile(
      path.join(sourceDir, 'Gameplay', 'Gameplay.Build.cs'),
      '// gameplay module'
    );
    await writeTextFile(
      path.join(sourceDir, 'Gameplay', 'Abilities', 'Abilities.Build.cs'),
      '// abilities module'
    );

    const result = await ProjectDetector.detectProject({ cwd, recursive: false });

    expect(result.isValid).toBe(true);
    expect(result.project).toBeDefined();

    if (!result.project) {
      throw new Error('Expected project details');
    }

    expect(result.project.modules).toHaveLength(3);
    const moduleNames = result.project.modules.map((m) => m.name).sort();
    expect(moduleNames).toEqual(['Abilities', 'Core', 'Gameplay']);
  });

  it('uses first .uproject file when multiple are found', async () => {
    const cwd = await createTempDir();

    await writeJsonFile(path.join(cwd, 'Alpha.uproject'), createValidUProject());
    await writeJsonFile(path.join(cwd, 'Beta.uproject'), createValidUProject());
    await fs.ensureDir(path.join(cwd, 'Source'));

    const result = await ProjectDetector.detectProject({ cwd, recursive: false });

    expect(result.isValid).toBe(true);
    expect(result.project).toBeDefined();

    if (!result.project) {
      throw new Error('Expected project details');
    }

    // Should use one of the valid projects (glob order may vary)
    expect(['Alpha', 'Beta']).toContain(result.project.name);
  });

  it('correctly identifies all target types in mixed project', async () => {
    const cwd = await createTempDir();
    const projectName = 'MixedTargetProject';
    const projectFilePath = path.join(cwd, `${projectName}.uproject`);
    const sourceDir = path.join(cwd, 'Source');

    await writeJsonFile(projectFilePath, createValidUProject());
    await fs.ensureDir(sourceDir);

    await writeTextFile(path.join(sourceDir, `${projectName}.Target.cs`), '// game target');
    await writeTextFile(path.join(sourceDir, `${projectName}Editor.Target.cs`), '// editor target');
    await writeTextFile(path.join(sourceDir, `${projectName}Client.Target.cs`), '// client target');
    await writeTextFile(path.join(sourceDir, `${projectName}Server.Target.cs`), '// server target');

    const result = await ProjectDetector.detectProject({ cwd, recursive: false });

    expect(result.isValid).toBe(true);
    expect(result.project).toBeDefined();

    if (!result.project) {
      throw new Error('Expected project details');
    }

    const targetTypes = result.project.targets.map((t) => t.type).sort();
    expect(targetTypes).toEqual(['Client', 'Editor', 'Game', 'Server']);
  });

  it('handles project with empty Modules array', async () => {
    const cwd = await createTempDir();
    const projectFilePath = path.join(cwd, 'EmptyModulesProject.uproject');

    await writeJsonFile(projectFilePath, {
      FileVersion: 3,
      EngineAssociation: '5.3',
      Modules: [],
    });
    await fs.ensureDir(path.join(cwd, 'Source'));

    const result = await ProjectDetector.detectProject({ cwd, recursive: false });

    expect(result.isValid).toBe(true);
    expect(result.project).toBeDefined();

    if (!result.project) {
      throw new Error('Expected project details');
    }

    expect(result.project.modules).toEqual([]);
  });

  it('handles case-insensitive target type detection', async () => {
    const cwd = await createTempDir();
    const projectName = 'CaseTest';
    const projectFilePath = path.join(cwd, `${projectName}.uproject`);
    const sourceDir = path.join(cwd, 'Source');

    await writeJsonFile(projectFilePath, createValidUProject());
    await fs.ensureDir(sourceDir);

    await writeTextFile(
      path.join(sourceDir, `${projectName}EDITOR.Target.cs`),
      '// EDITOR in caps'
    );
    await writeTextFile(
      path.join(sourceDir, `${projectName}CLIENT.Target.cs`),
      '// CLIENT in caps'
    );

    const result = await ProjectDetector.detectProject({ cwd, recursive: false });

    expect(result.isValid).toBe(true);
    expect(result.project).toBeDefined();

    if (!result.project) {
      throw new Error('Expected project details');
    }

    expect(result.project.targets).toHaveLength(2);
    const editorTarget = result.project.targets.find((t) =>
      t.name.toLowerCase().includes('editor')
    );
    const clientTarget = result.project.targets.find((t) =>
      t.name.toLowerCase().includes('client')
    );
    expect(editorTarget?.type).toBe('Editor');
    expect(clientTarget?.type).toBe('Client');
  });
});
