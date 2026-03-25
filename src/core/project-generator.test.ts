import path from 'path';
import { PassThrough } from 'stream';
import fs from 'fs-extra';
import { ProjectGenerator } from './project-generator';
import { createFakeEngine, createFakeProject, withTempDir } from '../test-utils';

interface ExecaOptions {
  stdio: 'pipe';
  cwd: string;
  shell: true;
}

interface ExecaResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface MockChildProcess extends Promise<ExecaResult> {
  stdout: PassThrough;
  stderr: PassThrough;
}

interface MockExecaProcessOptions {
  result?: Partial<ExecaResult>;
  streamedStdout?: string[];
  streamedStderr?: string[];
}

const mockExeca = jest.fn<MockChildProcess, [string, ExecaOptions]>();

jest.mock('execa', () => ({
  execa: (...args: [string, ExecaOptions]) => mockExeca(...args),
}));

function createMockChildProcess(options: MockExecaProcessOptions = {}): MockChildProcess {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const result: ExecaResult = {
    stdout: options.result?.stdout ?? '',
    stderr: options.result?.stderr ?? '',
    exitCode: options.result?.exitCode ?? 0,
  };

  const promise = Promise.resolve().then(() => {
    for (const chunk of options.streamedStdout ?? []) {
      stdout.write(chunk);
    }

    for (const chunk of options.streamedStderr ?? []) {
      stderr.write(chunk);
    }

    stdout.end();
    stderr.end();

    return result;
  });

  return Object.assign(promise, { stdout, stderr });
}

describe('ProjectGenerator', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('generate', () => {
    it('generates Visual Studio solution files (sln) successfully', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
        const engine = await createFakeEngine(rootDir);

        mockExeca.mockReturnValueOnce(
          createMockChildProcess({
            result: { stdout: 'Project files generated successfully' },
          })
        );

        const result = await ProjectGenerator.generate({
          ide: 'sln',
          projectPath: project.uprojectPath,
          enginePath: engine.enginePath,
        });

        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
        expect(mockExeca).toHaveBeenCalledTimes(1);
        expect(mockExeca).toHaveBeenCalledWith(
          expect.stringContaining('UnrealBuildTool'),
          expect.objectContaining({
            stdio: 'pipe',
            shell: true,
          })
        );
      });
    });

    it('generates VSCode project files successfully', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'VSCodeGame' });
        const engine = await createFakeEngine(rootDir);

        mockExeca.mockReturnValueOnce(
          createMockChildProcess({
            result: { stdout: 'VSCode project files generated' },
          })
        );

        const result = await ProjectGenerator.generate({
          ide: 'vscode',
          projectPath: project.uprojectPath,
          enginePath: engine.enginePath,
        });

        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();

        const projectDir = path.dirname(project.uprojectPath);
        const vscodeDir = path.join(projectDir, '.vscode');
        const tasksPath = path.join(vscodeDir, 'tasks.json');

        const tasksFileExists = await fs.pathExists(tasksPath);
        expect(tasksFileExists).toBe(true);

        const tasksConfig = await fs.readJson(tasksPath);
        expect(tasksConfig.version).toBe('2.0.0');
        expect(tasksConfig.tasks).toHaveLength(2);
        expect(tasksConfig.tasks[0].label).toBe('ubuild: Build Project');
        expect(tasksConfig.tasks[1].label).toBe('ubuild: Run Project');
      });
    });

    it('generates CLion project files successfully', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'CLionGame' });
        const engine = await createFakeEngine(rootDir);

        mockExeca.mockReturnValueOnce(
          createMockChildProcess({
            result: { stdout: 'CLion project files generated' },
          })
        );

        const projectDir = path.dirname(project.uprojectPath);
        const cmakePath = path.join(projectDir, 'CMakeLists.txt');
        await fs.writeFile(cmakePath, 'cmake_minimum_required(VERSION 3.20)');

        const result = await ProjectGenerator.generate({
          ide: 'clion',
          projectPath: project.uprojectPath,
          enginePath: engine.enginePath,
        });

        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.generatedFiles).toContain(cmakePath);
      });
    });

    it('generates Xcode project files successfully', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'XcodeGame' });
        const engine = await createFakeEngine(rootDir);

        mockExeca.mockReturnValueOnce(
          createMockChildProcess({
            result: { stdout: 'Xcode project files generated' },
          })
        );

        const projectDir = path.dirname(project.uprojectPath);
        const xcodeProjPath = path.join(projectDir, 'XcodeGame.xcodeproj');
        await fs.ensureDir(xcodeProjPath);

        const result = await ProjectGenerator.generate({
          ide: 'xcode',
          projectPath: project.uprojectPath,
          enginePath: engine.enginePath,
        });

        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.generatedFiles).toContain(xcodeProjPath);
      });
    });

    it('generates VS2022 project files successfully', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'VS2022Game' });
        const engine = await createFakeEngine(rootDir);

        mockExeca.mockReturnValueOnce(
          createMockChildProcess({
            result: { stdout: 'VS2022 project files generated' },
          })
        );

        const result = await ProjectGenerator.generate({
          ide: 'vs2022',
          projectPath: project.uprojectPath,
          enginePath: engine.enginePath,
        });

        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    it('defaults to sln when ide is not specified', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'DefaultGame' });
        const engine = await createFakeEngine(rootDir);

        mockExeca.mockReturnValueOnce(
          createMockChildProcess({
            result: { stdout: 'Project files generated' },
          })
        );

        const result = await ProjectGenerator.generate({
          projectPath: project.uprojectPath,
          enginePath: engine.enginePath,
        });

        expect(result.success).toBe(true);
        expect(mockExeca).toHaveBeenCalledWith(
          expect.not.stringContaining('-VSCode'),
          expect.anything()
        );
      });
    });

    it('uses force flag when specified', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'ForceGame' });
        const engine = await createFakeEngine(rootDir);

        mockExeca.mockReturnValueOnce(
          createMockChildProcess({
            result: { stdout: 'Forced regeneration' },
          })
        );

        const result = await ProjectGenerator.generate({
          ide: 'sln',
          projectPath: project.uprojectPath,
          enginePath: engine.enginePath,
          force: true,
        });

        expect(result.success).toBe(true);
        expect(mockExeca).toHaveBeenCalledWith(
          expect.stringContaining('-force'),
          expect.anything()
        );
      });
    });

    it('returns failure when UBT is not found', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'NoUbtGame' });
        const engine = await createFakeEngine(rootDir, { includeUnrealBuildTool: false });

        const result = await ProjectGenerator.generate({
          ide: 'sln',
          projectPath: project.uprojectPath,
          enginePath: engine.enginePath,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('UnrealBuildTool not found');
      });
    });

    it('returns failure when UBT exits with non-zero code', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'FailedGame' });
        const engine = await createFakeEngine(rootDir);

        mockExeca.mockReturnValueOnce(
          createMockChildProcess({
            result: {
              stdout: 'Build started',
              stderr: 'Compilation failed',
              exitCode: 1,
            },
          })
        );

        const result = await ProjectGenerator.generate({
          ide: 'sln',
          projectPath: project.uprojectPath,
          enginePath: engine.enginePath,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Project generation failed with exit code 1');
      });
    });

    it('merges with existing VSCode tasks.json instead of overwriting', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'MergeGame' });
        const engine = await createFakeEngine(rootDir);

        mockExeca.mockReturnValueOnce(
          createMockChildProcess({
            result: { stdout: 'VSCode project files generated' },
          })
        );

        const projectDir = path.dirname(project.uprojectPath);
        const vscodeDir = path.join(projectDir, '.vscode');
        await fs.ensureDir(vscodeDir);

        const existingTasks = {
          version: '2.0.0',
          tasks: [
            {
              label: 'custom: Build',
              type: 'shell',
              command: 'make',
            },
          ],
        };
        await fs.writeJson(path.join(vscodeDir, 'tasks.json'), existingTasks, { spaces: 2 });

        const result = await ProjectGenerator.generate({
          ide: 'vscode',
          projectPath: project.uprojectPath,
          enginePath: engine.enginePath,
        });

        expect(result.success).toBe(true);

        const tasksConfig = await fs.readJson(path.join(vscodeDir, 'tasks.json'));
        expect(tasksConfig.tasks).toHaveLength(3);
        expect(tasksConfig.tasks[0].label).toBe('custom: Build');
        expect(tasksConfig.tasks[1].label).toBe('ubuild: Build Project');
        expect(tasksConfig.tasks[2].label).toBe('ubuild: Run Project');
      });
    });

    it('replaces existing ubuild tasks when regenerating', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'ReplaceGame' });
        const engine = await createFakeEngine(rootDir);

        mockExeca.mockReturnValueOnce(
          createMockChildProcess({
            result: { stdout: 'VSCode project files generated' },
          })
        );

        const projectDir = path.dirname(project.uprojectPath);
        const vscodeDir = path.join(projectDir, '.vscode');
        await fs.ensureDir(vscodeDir);

        const existingTasks = {
          version: '2.0.0',
          tasks: [
            {
              label: 'ubuild: Old Task',
              type: 'shell',
              command: 'old',
            },
            {
              label: 'custom: Build',
              type: 'shell',
              command: 'make',
            },
          ],
        };
        await fs.writeJson(path.join(vscodeDir, 'tasks.json'), existingTasks, { spaces: 2 });

        const result = await ProjectGenerator.generate({
          ide: 'vscode',
          projectPath: project.uprojectPath,
          enginePath: engine.enginePath,
        });

        expect(result.success).toBe(true);

        const tasksConfig = await fs.readJson(path.join(vscodeDir, 'tasks.json'));
        const ubuildTasks = tasksConfig.tasks.filter((t: { label: string }) =>
          t.label?.startsWith('ubuild:')
        );
        expect(ubuildTasks).toHaveLength(2);
        expect(ubuildTasks[0].label).toBe('ubuild: Build Project');
        expect(ubuildTasks[1].label).toBe('ubuild: Run Project');
        expect(ubuildTasks.some((t: { label: string }) => t.label === 'ubuild: Old Task')).toBe(
          false
        );
      });
    });

    it('handles malformed existing tasks.json by regenerating', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'MalformedGame' });
        const engine = await createFakeEngine(rootDir);

        mockExeca.mockReturnValueOnce(
          createMockChildProcess({
            result: { stdout: 'VSCode project files generated' },
          })
        );

        const projectDir = path.dirname(project.uprojectPath);
        const vscodeDir = path.join(projectDir, '.vscode');
        await fs.ensureDir(vscodeDir);

        await fs.writeFile(path.join(vscodeDir, 'tasks.json'), 'invalid json {{');

        const result = await ProjectGenerator.generate({
          ide: 'vscode',
          projectPath: project.uprojectPath,
          enginePath: engine.enginePath,
        });

        expect(result.success).toBe(true);

        const tasksConfig = await fs.readJson(path.join(vscodeDir, 'tasks.json'));
        expect(tasksConfig.version).toBe('2.0.0');
        expect(tasksConfig.tasks).toHaveLength(2);
      });
    });

    it('resolves project directory to uproject file', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'DirGame' });
        const engine = await createFakeEngine(rootDir);

        mockExeca.mockReturnValueOnce(
          createMockChildProcess({
            result: { stdout: 'Project files generated' },
          })
        );

        const result = await ProjectGenerator.generate({
          ide: 'sln',
          projectPath: project.projectDir,
          enginePath: engine.enginePath,
        });

        expect(result.success).toBe(true);
        expect(mockExeca).toHaveBeenCalledWith(
          expect.stringContaining(`-project="${project.uprojectPath}"`),
          expect.anything()
        );
      });
    });

    it('includes generated solution files in result', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'SolutionGame' });
        const engine = await createFakeEngine(rootDir);

        mockExeca.mockReturnValueOnce(
          createMockChildProcess({
            result: { stdout: 'Project files generated' },
          })
        );

        const projectDir = path.dirname(project.uprojectPath);
        await fs.writeFile(path.join(projectDir, 'SolutionGame.sln'), 'Solution file content');
        await fs.writeFile(path.join(projectDir, 'SolutionGame.vcxproj'), 'Project file content');
        await fs.writeFile(
          path.join(projectDir, 'SolutionGame.vcxproj.filters'),
          'Filters file content'
        );

        const result = await ProjectGenerator.generate({
          ide: 'sln',
          projectPath: project.uprojectPath,
          enginePath: engine.enginePath,
        });

        expect(result.success).toBe(true);
        expect(result.generatedFiles).toContain(path.join(projectDir, 'SolutionGame.sln'));
        expect(result.generatedFiles).toContain(path.join(projectDir, 'SolutionGame.vcxproj'));
        expect(result.generatedFiles).toContain(
          path.join(projectDir, 'SolutionGame.vcxproj.filters')
        );
      });
    });

    it('includes VSCode workspace files in result for vscode ide', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'WorkspaceGame' });
        const engine = await createFakeEngine(rootDir);

        mockExeca.mockReturnValueOnce(
          createMockChildProcess({
            result: { stdout: 'VSCode project files generated' },
          })
        );

        const projectDir = path.dirname(project.uprojectPath);
        const workspacePath = path.join(projectDir, 'WorkspaceGame.code-workspace');
        await fs.writeFile(workspacePath, '{}');

        const result = await ProjectGenerator.generate({
          ide: 'vscode',
          projectPath: project.uprojectPath,
          enginePath: engine.enginePath,
        });

        expect(result.success).toBe(true);
        expect(result.generatedFiles).toContain(workspacePath);
      });
    });

    it('includes VSCode config files in result for vscode ide', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'ConfigGame' });
        const engine = await createFakeEngine(rootDir);

        mockExeca.mockReturnValueOnce(
          createMockChildProcess({
            result: { stdout: 'VSCode project files generated' },
          })
        );

        const projectDir = path.dirname(project.uprojectPath);
        const vscodeDir = path.join(projectDir, '.vscode');
        await fs.ensureDir(vscodeDir);
        await fs.writeFile(path.join(vscodeDir, 'settings.json'), '{}');
        await fs.writeFile(path.join(vscodeDir, 'launch.json'), '{}');

        const result = await ProjectGenerator.generate({
          ide: 'vscode',
          projectPath: project.uprojectPath,
          enginePath: engine.enginePath,
        });

        expect(result.success).toBe(true);
        expect(result.generatedFiles).toContain(path.join(vscodeDir, 'settings.json'));
        expect(result.generatedFiles).toContain(path.join(vscodeDir, 'launch.json'));
      });
    });

    it('passes correct IDE flags to UBT', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'FlagsGame' });
        const engine = await createFakeEngine(rootDir);

        const ides: Array<{ ide: 'vscode' | 'clion' | 'xcode'; flag: string }> = [
          { ide: 'vscode', flag: '-VSCode' },
          { ide: 'clion', flag: '-CLion' },
          { ide: 'xcode', flag: '-XCodeProjectFiles' },
        ];

        for (const { ide, flag } of ides) {
          mockExeca.mockReturnValueOnce(
            createMockChildProcess({
              result: { stdout: `${ide} project files generated` },
            })
          );

          await ProjectGenerator.generate({
            ide,
            projectPath: project.uprojectPath,
            enginePath: engine.enginePath,
          });

          expect(mockExeca).toHaveBeenLastCalledWith(
            expect.stringContaining(flag),
            expect.anything()
          );
        }
      });
    });
  });
});
