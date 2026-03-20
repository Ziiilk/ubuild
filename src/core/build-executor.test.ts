import path from 'path';
import { PassThrough } from 'stream';
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
        `"${engine.buildBatPath}" FactoryGameEditor Win64 Development -project="${project.uprojectPath}" -NoMutex`,
        {
          stdio: 'pipe',
          cwd: path.dirname(engine.buildBatPath),
          shell: true,
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
        `"${engine.unrealBuildToolPath}" FallbackGame Win64 Shipping -project="${project.uprojectPath}" -NoMutex -clean -verbose -FromTest`,
        {
          stdio: 'pipe',
          cwd: path.dirname(engine.unrealBuildToolPath),
          shell: true,
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
});
