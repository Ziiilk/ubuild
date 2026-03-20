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
});
