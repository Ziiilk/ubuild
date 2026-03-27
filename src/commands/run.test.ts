import path from 'path';
import { Command } from 'commander';
import { runProject, runCommand, ProjectRunner } from './run';
import {
  createFakeEngine,
  createFakeExecaChild,
  createFakeProject,
  createOutputCapture,
  withTempDir,
} from '../test-utils';

interface MockBuildResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  error?: string;
}

interface MockEngineResult {
  engine?: {
    path: string;
    displayName?: string;
  };
  warnings: string[];
  error?: string;
}

type ExecaInvocation = [
  string,
  string[],
  {
    stdio: string;
    cwd: string;
    detached?: boolean;
  },
];

const mockBuildExecute = jest.fn<Promise<MockBuildResult>, [unknown]>();
const mockGetAvailableTargets = jest.fn<Promise<Array<{ name: string; type: string }>>, [string]>();
const mockResolveEngine = jest.fn<Promise<MockEngineResult>, [string]>();
const mockResolveEnginePath = jest.fn<
  Promise<string>,
  [{ projectPath?: string; enginePath?: string }]
>();
const mockExeca = jest.fn<ReturnType<typeof createFakeExecaChild>, ExecaInvocation>();

jest.mock('../core/build-executor', () => {
  const BuildExecutor = jest.fn().mockImplementation(() => ({
    execute: (...args: [unknown]) => mockBuildExecute(...args),
  }));

  Object.assign(BuildExecutor, {
    getAvailableTargets: (...args: [string]) => mockGetAvailableTargets(...args),
  });

  return { BuildExecutor };
});

jest.mock('../core/engine-resolver', () => ({
  EngineResolver: {
    resolveEngine: (...args: [string]) => mockResolveEngine(...args),
    resolveEnginePath: (...args: [{ projectPath?: string; enginePath?: string }]) =>
      mockResolveEnginePath(...args),
  },
}));

jest.mock('execa', () => ({
  execa: (...args: ExecaInvocation) => mockExeca(...args),
}));

describe('runProject', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAvailableTargets.mockResolvedValue([]);
    mockResolveEngine.mockResolvedValue({ warnings: [] });
    mockResolveEnginePath.mockResolvedValue('');
  });

  it('prints a dry-run summary including the resolved executable path', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'OrbitGame' });
      const engine = await createFakeEngine(rootDir, {
        displayName: 'Unreal Engine 5.3 Test',
      });
      const capture = createOutputCapture();

      mockResolveEngine.mockResolvedValue({
        engine: {
          path: engine.enginePath,
          displayName: engine.installation.displayName,
        },
        warnings: [],
      });
      mockResolveEnginePath.mockResolvedValue(engine.enginePath);
      mockGetAvailableTargets.mockResolvedValue([
        { name: `${project.projectName}Editor`, type: 'Editor' },
      ]);

      await runProject({
        project: project.projectDir,
        target: 'Editor',
        config: 'Development',
        platform: 'Win64',
        dryRun: true,
        buildFirst: true,
        detached: true,
        args: ['-log', '-trace'],
        stdout: capture.stdout,
        stderr: capture.stderr,
      });

      expect(mockBuildExecute).not.toHaveBeenCalled();
      expect(mockExeca).not.toHaveBeenCalled();
      expect(capture.getStdout()).toContain('Dry Run - Run Configuration');
      expect(capture.getStdout()).toContain(`Project: ${project.projectDir}`);
      expect(capture.getStdout()).toContain('Build First: Yes');
      expect(capture.getStdout()).toContain('Detached: Yes');
      expect(capture.getStdout()).toContain('Additional Args: -log -trace');
      expect(capture.getStdout()).toContain(`Engine: ${engine.installation.displayName}`);
      expect(capture.getStdout()).toContain(`Executable: ${engine.editorExecutablePath}`);
      expect(capture.getStdout()).toContain('Executable exists: Yes');
      expect(capture.getStdout()).toContain('This is a dry run - no actual run will be performed');
    });
  });

  it('rejects invalid run platforms before touching the filesystem or process layer', async () => {
    const capture = createOutputCapture();

    await expect(
      runProject({
        target: 'Editor',
        config: 'Development',
        platform: 'PS5',
        stdout: capture.stdout,
        stderr: capture.stderr,
      })
    ).rejects.toThrow('Invalid platform');

    expect(mockBuildExecute).not.toHaveBeenCalled();
    expect(mockExeca).not.toHaveBeenCalled();
    expect(capture.getStderr()).toContain('Invalid platform: PS5');
    expect(capture.getStdout()).toContain(
      'Valid platforms: Win64, Win32, Linux, Mac, Android, IOS'
    );
  });

  it('builds first, then runs the resolved editor executable with the project path prepended', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'OrbitGame' });
      const engine = await createFakeEngine(rootDir);
      const capture = createOutputCapture();

      mockResolveEngine.mockResolvedValue({
        engine: {
          path: engine.enginePath,
          displayName: engine.installation.displayName,
        },
        warnings: [],
      });
      mockGetAvailableTargets.mockResolvedValue([
        { name: `${project.projectName}Editor`, type: 'Editor' },
      ]);
      mockBuildExecute.mockResolvedValue({
        success: true,
        exitCode: 0,
        stdout: 'Build ok',
        stderr: '',
        duration: 10,
      });
      mockResolveEnginePath.mockResolvedValue(engine.enginePath);
      mockExeca.mockImplementation(() => {
        const child = createFakeExecaChild({ exitCode: 0 });
        const originalOn = child.on.bind(child);

        child.on = (event: 'exit', listener: (code: number) => void) => {
          const registeredChild = originalOn(event, listener);
          listener(0);
          return registeredChild;
        };

        return child;
      });

      await runProject({
        project: project.projectDir,
        enginePath: engine.enginePath,
        target: 'Editor',
        config: 'Development',
        platform: 'Win64',
        buildFirst: true,
        args: ['-trace'],
        stdout: capture.stdout,
        stderr: capture.stderr,
      });

      expect(mockBuildExecute).toHaveBeenCalledWith({
        target: 'Editor',
        config: 'Development',
        platform: 'Win64',
        projectPath: project.uprojectPath,
        enginePath: engine.enginePath,
        verbose: false,
      });
      expect(mockExeca).toHaveBeenCalledWith(
        engine.editorExecutablePath,
        [project.uprojectPath, '-trace'],
        expect.objectContaining({
          stdio: 'inherit',
          cwd: path.dirname(engine.editorExecutablePath),
        })
      );
      expect(capture.getStdout()).toContain('Building project before running...');
      expect(capture.getStdout()).toContain('Running: UnrealEditor.exe');
      expect(capture.getStdout()).toContain('Process completed successfully in ');
    });
  });

  it('stops before launching when the build-first step fails', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'OrbitGame' });
      const engine = await createFakeEngine(rootDir);
      const capture = createOutputCapture();

      mockBuildExecute.mockResolvedValue({
        success: false,
        exitCode: 9,
        stdout: '',
        stderr: 'compile failed',
        duration: 10,
      });
      mockResolveEnginePath.mockResolvedValue(engine.enginePath);

      await expect(
        runProject({
          project: project.projectDir,
          enginePath: engine.enginePath,
          target: 'Editor',
          config: 'Development',
          platform: 'Win64',
          buildFirst: true,
          stdout: capture.stdout,
          stderr: capture.stderr,
        })
      ).rejects.toThrow('Build failed with exit code 9');

      expect(mockExeca).not.toHaveBeenCalled();
      expect(capture.getStderr()).toContain('Build failed. Cannot run project.');
    });
  });
});

describe('runCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAvailableTargets.mockResolvedValue([]);
    mockResolveEngine.mockResolvedValue({ warnings: [] });
    mockResolveEnginePath.mockResolvedValue('');
  });

  it('registers the run command with commander', () => {
    const program = new Command();
    runCommand(program);

    const commands = program.commands.map((cmd) => cmd.name());
    expect(commands).toContain('run');
  });

  it('command has all expected options', () => {
    const program = new Command();
    runCommand(program);

    const runCmd = program.commands.find((cmd) => cmd.name() === 'run');
    expect(runCmd).toBeDefined();

    const options = runCmd!.options.map((opt) => opt.long);
    expect(options).toContain('--target');
    expect(options).toContain('--config');
    expect(options).toContain('--platform');
    expect(options).toContain('--project');
    expect(options).toContain('--engine-path');
    expect(options).toContain('--dry-run');
    expect(options).toContain('--build-first');
    expect(options).toContain('--no-build');
    expect(options).toContain('--detached');
    expect(options).toContain('--args');
  });

  it('throws error when run fails', async () => {
    const program = new Command();
    runCommand(program);

    const runCmd = program.commands.find((cmd) => cmd.name() === 'run');
    expect(runCmd).toBeDefined();

    const mockRun = jest
      .spyOn(ProjectRunner.prototype, 'run')
      .mockRejectedValue(new Error('Run failed'));

    await expect(runCmd!.parseAsync(['node', 'test', '--dry-run'])).rejects.toThrow('Run failed');

    mockRun.mockRestore();
  });

  it('handles non-Error exceptions during run', async () => {
    const program = new Command();
    runCommand(program);

    const runCmd = program.commands.find((cmd) => cmd.name() === 'run');
    expect(runCmd).toBeDefined();

    const mockRun = jest.spyOn(ProjectRunner.prototype, 'run').mockRejectedValue('String error');

    await expect(runCmd!.parseAsync(['node', 'test', '--dry-run'])).rejects.toThrow('String error');

    mockRun.mockRestore();
  });

  it('passes options correctly to ProjectRunner', async () => {
    const program = new Command();
    runCommand(program);

    const runCmd = program.commands.find((cmd) => cmd.name() === 'run');
    expect(runCmd).toBeDefined();

    const mockRun = jest.spyOn(ProjectRunner.prototype, 'run').mockResolvedValue(undefined);

    await runCmd!.parseAsync([
      'node',
      'test',
      '--target',
      'Game',
      '--config',
      'Shipping',
      '--platform',
      'Linux',
      '--dry-run',
      '--build-first',
      '--detached',
      '--args',
      '-log',
    ]);

    expect(mockRun).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'Game',
        config: 'Shipping',
        platform: 'Linux',
        dryRun: true,
        buildFirst: true,
        detached: true,
        args: ['-log'],
      })
    );

    mockRun.mockRestore();
  });

  it('uses default values when options are not specified', async () => {
    const program = new Command();
    runCommand(program);

    const runCmd = program.commands.find((cmd) => cmd.name() === 'run');
    expect(runCmd).toBeDefined();

    const mockRun = jest.spyOn(ProjectRunner.prototype, 'run').mockResolvedValue(undefined);

    await runCmd!.parseAsync(['node', 'test']);

    expect(mockRun).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'Editor',
        config: 'Development',
        platform: 'Win64',
      })
    );

    mockRun.mockRestore();
  });

  it('respects --no-build flag', async () => {
    const program = new Command();
    runCommand(program);

    const runCmd = program.commands.find((cmd) => cmd.name() === 'run');
    expect(runCmd).toBeDefined();

    const mockRun = jest.spyOn(ProjectRunner.prototype, 'run').mockResolvedValue(undefined);

    await runCmd!.parseAsync(['node', 'test', '--no-build']);

    expect(mockRun).toHaveBeenCalledWith(
      expect.objectContaining({
        build: false,
      })
    );

    mockRun.mockRestore();
  });
});
