import path from 'path';
import { PassThrough } from 'stream';
import fs from 'fs-extra';
import { BuildExecutor } from './build-executor';
import { EngineResolver } from './engine-resolver';
import {
  createFakeEngine,
  createFakeProject,
  createOutputCapture,
  withTempDir,
} from '../test-utils';

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

describe('BuildExecutor', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves a project directory to its .uproject and maps generic editor targets for Build.bat', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'FactoryGame' });
      const engine = await createFakeEngine(rootDir);
      const capture = createOutputCapture();

      mockExeca.mockReturnValueOnce(
        createMockChildProcess({
          result: {
            stdout: 'Compiling FactoryGameEditor\n',
          },
        })
      );

      const executor = new BuildExecutor({
        stdout: capture.stdout,
        stderr: capture.stderr,
        silent: true,
      });

      const result = await executor.execute({
        projectPath: project.projectDir,
        enginePath: engine.enginePath,
        target: 'Editor',
      });

      expect(result).toMatchObject({
        success: true,
        exitCode: 0,
        stdout: 'Compiling FactoryGameEditor\n',
        stderr: '',
      });
      expect(mockExeca).toHaveBeenCalledTimes(1);
      expect(mockExeca).toHaveBeenCalledWith(
        engine.buildBatPath,
        [
          'FactoryGameEditor',
          'Win64',
          'Development',
          `-project="${project.uprojectPath}"`,
          '-NoMutex',
        ],
        {
          stdio: 'pipe',
          cwd: path.dirname(engine.buildBatPath),
        }
      );
    });
  });

  it('falls back to UnrealBuildTool command planning when Build.bat is unavailable', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'FallbackGame' });
      const engine = await createFakeEngine(rootDir, { includeBuildBat: false });

      mockExeca.mockReturnValueOnce(
        createMockChildProcess({
          result: {
            stdout: 'UBT succeeded',
          },
        })
      );

      const result = await BuildExecutor.execute({
        projectPath: project.uprojectPath,
        enginePath: engine.enginePath,
        target: 'Game',
        config: 'Shipping',
        clean: true,
        verbose: true,
        additionalArgs: ['-FromTest'],
        silent: true,
      });

      expect(result).toMatchObject({
        success: true,
        exitCode: 0,
        stdout: 'UBT succeeded',
        stderr: '',
      });
      expect(mockExeca).toHaveBeenCalledTimes(1);
      expect(mockExeca).toHaveBeenCalledWith(
        engine.unrealBuildToolPath,
        [
          'FallbackGame',
          'Win64',
          'Shipping',
          `-project="${project.uprojectPath}"`,
          '-NoMutex',
          '-clean',
          '-verbose',
          '-FromTest',
        ],
        {
          stdio: 'pipe',
          cwd: path.dirname(engine.unrealBuildToolPath),
        }
      );
    });
  });

  it('returns a failed build result when the invoked build tool exits non-zero', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'BrokenGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(
        createMockChildProcess({
          result: {
            stdout: 'Build output',
            stderr: 'Compile failed',
            exitCode: 7,
          },
        })
      );

      const result = await BuildExecutor.execute({
        projectPath: project.uprojectPath,
        enginePath: engine.enginePath,
        target: 'Game',
        silent: true,
      });

      expect(result).toMatchObject({
        success: false,
        exitCode: 7,
        stdout: 'Build output',
        stderr: 'Compile failed',
        error: 'Build failed with exit code 7',
      });
    });
  });

  it('returns the execution failure contract when engine resolution cannot determine an engine', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'UnknownEngineGame' });

      const resolveEngineSpy = jest
        .spyOn(EngineResolver, 'resolveEngine')
        .mockResolvedValue({ warnings: [] });

      const result = await BuildExecutor.execute({
        projectPath: project.projectDir,
        target: 'Editor',
        silent: true,
      });

      expect(resolveEngineSpy).toHaveBeenCalledWith(project.uprojectPath);
      expect(mockExeca).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: 'Could not determine engine path. Please specify --engine-path',
        error: 'Build execution failed',
      });
    });
  });

  describe('target resolution', () => {
    it('uses generic target name when project has no targets (blueprint project)', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, {
          projectName: 'BlueprintGame',
          withSource: false,
        });
        const engine = await createFakeEngine(rootDir);

        mockExeca.mockReturnValueOnce(
          createMockChildProcess({
            result: {
              stdout: 'Build succeeded with Server target',
              exitCode: 0,
            },
          })
        );

        const result = await BuildExecutor.execute({
          projectPath: project.projectDir,
          enginePath: engine.enginePath,
          target: 'Server',
          silent: true,
        });

        expect(result).toMatchObject({
          success: true,
          exitCode: 0,
          stdout: 'Build succeeded with Server target',
        });
        expect(mockExeca).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining(['Server']),
          expect.any(Object)
        );
      });
    });

    it('throws error when target is not found in available targets', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, {
          projectName: 'TargetTestGame',
          withSource: true,
          targets: [
            { name: 'TargetTestGame', type: 'Game' },
            { name: 'TargetTestGameEditor', type: 'Editor' },
          ],
        });
        const engine = await createFakeEngine(rootDir);

        mockExeca.mockReturnValue(
          createMockChildProcess({
            result: {
              stdout: '',
              stderr: '',
              exitCode: 0,
            },
          })
        );

        const result = await BuildExecutor.execute({
          projectPath: project.projectDir,
          enginePath: engine.enginePath,
          target: 'NonExistentTarget',
          silent: true,
        });

        expect(result).toMatchObject({
          success: false,
          exitCode: -1,
          error: 'Build execution failed',
        });
        expect(result.stderr).toContain('No NonExistentTarget target found');
        expect(result.stderr).toContain('TargetTestGame');
        expect(result.stderr).toContain('TargetTestGameEditor');
      });
    });

    it('throws error when generic target cannot be resolved and project has targets', async () => {
      await withTempDir(async (rootDir) => {
        // Create project with only Game target, no Editor target
        const project = await createFakeProject(rootDir, {
          projectName: 'GameOnlyProject',
          withSource: true,
          targets: [{ name: 'GameOnlyProject', type: 'Game' }],
        });
        const engine = await createFakeEngine(rootDir);

        // Request 'Server' which is a generic target but doesn't exist in project
        const result = await BuildExecutor.execute({
          projectPath: project.projectDir,
          enginePath: engine.enginePath,
          target: 'Server', // Generic target that doesn't exist
          silent: true,
        });

        expect(result).toMatchObject({
          success: false,
          exitCode: -1,
          error: 'Build execution failed',
        });
        expect(result.stderr).toContain('No Server target found');
        expect(result.stderr).toContain('GameOnlyProject');
      });
    });

    it('uses generic target name when no target files exist', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, {
          projectName: 'BlueprintGame',
          withSource: false,
        });
        const engine = await createFakeEngine(rootDir);

        mockExeca.mockReturnValueOnce(
          createMockChildProcess({
            result: {
              stdout: 'Build succeeded',
              exitCode: 0,
            },
          })
        );

        const result = await BuildExecutor.execute({
          projectPath: project.projectDir,
          enginePath: engine.enginePath,
          target: 'Editor',
          silent: true,
        });

        expect(result).toMatchObject({
          success: true,
          exitCode: 0,
        });
      });
    });
  });

  describe('build flags', () => {
    it('passes clean and verbose flags to Build.bat', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'FlagsGame' });
        const engine = await createFakeEngine(rootDir);

        mockExeca.mockReturnValueOnce(
          createMockChildProcess({
            result: {
              stdout: 'Build with flags',
              exitCode: 0,
            },
          })
        );

        const result = await BuildExecutor.execute({
          projectPath: project.uprojectPath,
          enginePath: engine.enginePath,
          target: 'Game',
          clean: true,
          verbose: true,
          silent: true,
        });

        expect(result).toMatchObject({
          success: true,
          exitCode: 0,
          stdout: 'Build with flags',
        });
        expect(mockExeca).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining(['-clean']),
          expect.any(Object)
        );
        expect(mockExeca).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining(['-verbose']),
          expect.any(Object)
        );
      });
    });
  });

  describe('UnrealBuildTool fallback', () => {
    it('throws error when UnrealBuildTool is not found', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'MissingUBTGame' });
        const engine = await createFakeEngine(rootDir, {
          includeBuildBat: false,
          includeUnrealBuildTool: false,
        });

        const result = await BuildExecutor.execute({
          projectPath: project.uprojectPath,
          enginePath: engine.enginePath,
          target: 'Game',
          silent: true,
        });

        expect(result).toMatchObject({
          success: false,
          exitCode: -1,
          error: 'Build execution failed',
        });
        expect(result.stderr).toContain('UnrealBuildTool not found');
      });
    });

    it('handles null stdout/stderr streams gracefully', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'NullStreamGame' });
        const engine = await createFakeEngine(rootDir);

        // Create a mock child process with null stdout/stderr
        const mockResult: ExecaResult = { stdout: 'result output', stderr: '', exitCode: 0 };
        const mockChildProcess = Object.assign(Promise.resolve(mockResult), {
          stdout: null as unknown as PassThrough,
          stderr: null as unknown as PassThrough,
        });

        mockExeca.mockReturnValueOnce(mockChildProcess as MockChildProcess);

        const result = await BuildExecutor.execute({
          projectPath: project.uprojectPath,
          enginePath: engine.enginePath,
          target: 'Game',
          silent: true,
        });

        expect(result.success).toBe(true);
        expect(result.stdout).toBe('result output');
      });
    });

    it('captures streaming stdout/stderr data via Build.bat path', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'StreamBuildGame' });
        const engine = await createFakeEngine(rootDir);

        const capture = createOutputCapture();

        // Create a mock child process that simulates streaming
        const stdout = new PassThrough();
        const stderr = new PassThrough();
        const mockResult: ExecaResult = { stdout: '', stderr: '', exitCode: 0 };

        const mockChildProcess = Object.assign(
          new Promise<ExecaResult>((resolve) => {
            // Write data to streams after a small delay to simulate real streaming
            setTimeout(() => {
              stdout.write('Build output line 1\n');
              stderr.write('Build warning\n');
              stdout.write('Build output line 2\n');
              stdout.end();
              stderr.end();
              resolve(mockResult);
            }, 10);
          }),
          { stdout, stderr }
        );

        mockExeca.mockReturnValueOnce(mockChildProcess as MockChildProcess);

        const executor = new BuildExecutor({
          stdout: capture.stdout,
          stderr: capture.stderr,
          silent: true,
        });

        await executor.execute({
          projectPath: project.uprojectPath,
          enginePath: engine.enginePath,
          target: 'Game',
        });

        // Give a small delay for stream events to be processed
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Verify the output was captured
        const output = capture.getStdout();
        expect(output).toContain('Build output line 1');
        expect(output).toContain('Build output line 2');
      });
    });

    it('captures streaming output via UnrealBuildTool path', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'StreamUBTGame' });
        const engine = await createFakeEngine(rootDir, { includeBuildBat: false });

        const capture = createOutputCapture();

        // Create a mock child process that simulates streaming
        const stdout = new PassThrough();
        const stderr = new PassThrough();
        const mockResult: ExecaResult = { stdout: '', stderr: '', exitCode: 0 };

        const mockChildProcess = Object.assign(
          new Promise<ExecaResult>((resolve) => {
            setTimeout(() => {
              stdout.write('UBT compiling...\n');
              stderr.write('UBT warning message\n');
              stdout.write('UBT done\n');
              stdout.end();
              stderr.end();
              resolve(mockResult);
            }, 10);
          }),
          { stdout, stderr }
        );

        mockExeca.mockReturnValueOnce(mockChildProcess as MockChildProcess);

        const executor = new BuildExecutor({
          stdout: capture.stdout,
          stderr: capture.stderr,
          silent: true,
        });

        await executor.execute({
          projectPath: project.uprojectPath,
          enginePath: engine.enginePath,
          target: 'Game',
        });

        // Give a small delay for stream events to be processed
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Verify the output was captured
        const output = capture.getStdout();
        expect(output).toContain('UBT compiling');
        expect(output).toContain('UBT done');
      });
    });
  });

  describe('getAvailableTargets', () => {
    it('returns empty array when Source directory does not exist', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, {
          projectName: 'BlueprintGame',
          withSource: false,
        });

        const targets = await BuildExecutor.getAvailableTargets(project.uprojectPath);

        expect(targets).toEqual([]);
      });
    });

    it('detects Client target type from target name', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, {
          projectName: 'MultiplayerGame',
          withSource: true,
          targets: [
            { name: 'MultiplayerGameClient', type: 'Client' },
            { name: 'MultiplayerGameServer', type: 'Server' },
          ],
        });

        const targets = await BuildExecutor.getAvailableTargets(project.uprojectPath);

        expect(targets).toContainEqual({ name: 'MultiplayerGameClient', type: 'Client' });
        expect(targets).toContainEqual({ name: 'MultiplayerGameServer', type: 'Server' });
      });
    });

    it('handles errors gracefully and returns empty array', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, {
          projectName: 'ErrorGame',
          withSource: true,
        });

        const fsReaddir = jest.spyOn(fs, 'readdir' as never).mockImplementationOnce(() => {
          throw new Error('Permission denied');
        });

        const targets = await BuildExecutor.getAvailableTargets(project.uprojectPath);

        expect(targets).toEqual([]);

        fsReaddir.mockRestore();
      });
    });
  });

  describe('getDefaultOptions', () => {
    it('returns Editor target when Editor target exists', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, {
          projectName: 'EditorGame',
          withSource: true,
          targets: [
            { name: 'EditorGame', type: 'Game' },
            { name: 'EditorGameEditor', type: 'Editor' },
          ],
        });

        const options = await BuildExecutor.getDefaultOptions(project.uprojectPath);

        expect(options.target).toBe('Editor');
        expect(options.config).toBe('Development');
        expect(options.platform).toBe('Win64');
      });
    });

    it('returns Game target when no Editor target exists', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, {
          projectName: 'RuntimeGame',
          withSource: true,
          targets: [{ name: 'RuntimeGame', type: 'Game' }],
        });

        const options = await BuildExecutor.getDefaultOptions(project.uprojectPath);

        expect(options.target).toBe('Game');
      });
    });
  });

  describe('constructor', () => {
    it('uses default stdout/stderr when not provided', () => {
      const executor = new BuildExecutor({ silent: true });

      expect(executor).toBeDefined();
    });
  });
});
