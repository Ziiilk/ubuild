import { Command } from 'commander';
import { executeBuild, buildCommand, ProjectBuilder } from './build';
import { createOutputCapture } from '../test-utils';

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
}

const mockBuildExecute = jest.fn<Promise<MockBuildResult>, [unknown]>();
const mockGetAvailableTargets = jest.fn<Promise<Array<{ name: string; type: string }>>, [string]>();
const mockResolveEngine = jest.fn<Promise<MockEngineResult>, [string | undefined]>();

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
    resolveEngine: (...args: [string | undefined]) => mockResolveEngine(...args),
  },
}));

describe('executeBuild', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAvailableTargets.mockResolvedValue([]);
    mockResolveEngine.mockResolvedValue({ warnings: [] });
  });

  it('prints the current build plan for dry runs without invoking the executor', async () => {
    const capture = createOutputCapture();

    mockResolveEngine.mockResolvedValue({
      engine: {
        path: 'C:\\Engines\\UE_5.3',
        displayName: 'Unreal Engine 5.3',
      },
      warnings: [],
    });

    await executeBuild({
      project: 'C:\\Projects\\SpaceGame',
      target: 'Editor',
      config: 'Development',
      platform: 'Win64',
      clean: true,
      verbose: true,
      dryRun: true,
      stdout: capture.stdout,
      stderr: capture.stderr,
    });

    expect(mockBuildExecute).not.toHaveBeenCalled();
    expect(capture.getStdout()).toContain('Dry Run - Build Configuration');
    expect(capture.getStdout()).toContain('Project: C:\\Projects\\SpaceGame');
    expect(capture.getStdout()).toContain('Target: Editor');
    expect(capture.getStdout()).toContain('Configuration: Development');
    expect(capture.getStdout()).toContain('Platform: Win64');
    expect(capture.getStdout()).toContain('Clean Build: Yes');
    expect(capture.getStdout()).toContain('Verbose: Yes');
    expect(capture.getStdout()).toContain('Engine: Unreal Engine 5.3');
    expect(capture.getStdout()).toContain('This is a dry run - no actual build will be performed');
  });

  it('rejects invalid build configurations before invoking the executor', async () => {
    const capture = createOutputCapture();

    await expect(
      executeBuild({
        target: 'Editor',
        config: 'Profile',
        platform: 'Win64',
        stdout: capture.stdout,
        stderr: capture.stderr,
      })
    ).rejects.toThrow('Invalid config');

    expect(mockBuildExecute).not.toHaveBeenCalled();
    expect(capture.getStderr()).toContain('Invalid build configuration: Profile');
    expect(capture.getStdout()).toContain(
      'Valid configurations: Debug, DebugGame, Development, Shipping, Test'
    );
  });

  it('shapes successful builds with completion timing and output directory details', async () => {
    const capture = createOutputCapture();

    mockBuildExecute.mockResolvedValue({
      success: true,
      exitCode: 0,
      stdout: 'Compile complete\nOutput path: C:\\Builds\\SpaceGame\\Binaries',
      stderr: '',
      duration: 25,
    });

    await executeBuild({
      project: 'C:\\Projects\\SpaceGame\\SpaceGame.uproject',
      target: 'Editor',
      config: 'Development',
      platform: 'Win64',
      enginePath: 'C:\\Engines\\UE_5.3',
      clean: true,
      verbose: true,
      stdout: capture.stdout,
      stderr: capture.stderr,
    });

    expect(mockBuildExecute).toHaveBeenCalledWith({
      target: 'Editor',
      config: 'Development',
      platform: 'Win64',
      projectPath: 'C:\\Projects\\SpaceGame\\SpaceGame.uproject',
      enginePath: 'C:\\Engines\\UE_5.3',
      clean: true,
      verbose: true,
    });
    expect(capture.getStdout()).toContain('Preparing to build: Editor | Win64 | Development');
    expect(capture.getStdout()).toContain('Build completed successfully in ');
    expect(capture.getStdout()).toContain('Output directory: C:\\Builds\\SpaceGame\\Binaries');
  });

  it('summarizes failed builds and surfaces the executor exit code', async () => {
    const capture = createOutputCapture();

    mockBuildExecute.mockResolvedValue({
      success: false,
      exitCode: 6,
      stdout: '',
      stderr: [
        'warning: first warning',
        'Error: Missing generated header',
        'fatal error: could not open response file',
        'link failed while producing binary',
      ].join('\n'),
      duration: 25,
      error: 'UBT reported a failure',
    });

    await expect(
      executeBuild({
        project: 'C:\\Projects\\SpaceGame\\SpaceGame.uproject',
        target: 'Editor',
        config: 'Development',
        platform: 'Win64',
        enginePath: 'C:\\Engines\\UE_5.3',
        stdout: capture.stdout,
        stderr: capture.stderr,
      })
    ).rejects.toThrow('Build failed with exit code 6');

    expect(capture.getStderr()).toContain('Build failed after ');
    expect(capture.getStderr()).toContain('UBT reported a failure');
    expect(capture.getStdout()).toContain('Error Summary');
    expect(capture.getStdout()).toContain('Error: Missing generated header');
    expect(capture.getStdout()).toContain('fatal error: could not open response file');
    expect(capture.getStdout()).toContain('link failed while producing binary');
  });

  it('rejects invalid build platforms before invoking the executor', async () => {
    const capture = createOutputCapture();

    await expect(
      executeBuild({
        target: 'Editor',
        config: 'Development',
        platform: 'InvalidPlatform',
        stdout: capture.stdout,
        stderr: capture.stderr,
      })
    ).rejects.toThrow('Invalid platform');

    expect(mockBuildExecute).not.toHaveBeenCalled();
    expect(capture.getStderr()).toContain('Invalid build platform: InvalidPlatform');
  });

  it('lists available targets when listTargets option is set', async () => {
    const capture = createOutputCapture();

    mockGetAvailableTargets.mockResolvedValue([
      { name: 'SpaceGameEditor', type: 'Editor' },
      { name: 'SpaceGame', type: 'Game' },
    ]);

    await executeBuild({
      project: 'C:\\Projects\\SpaceGame',
      listTargets: true,
      stdout: capture.stdout,
      stderr: capture.stderr,
    });

    expect(mockGetAvailableTargets).toHaveBeenCalledWith('C:\\Projects\\SpaceGame');
    expect(capture.getStdout()).toContain('Available Build Targets');
    expect(capture.getStdout()).toContain('SpaceGameEditor');
    expect(capture.getStdout()).toContain('SpaceGame');
    expect(mockBuildExecute).not.toHaveBeenCalled();
  });

  it('shows message when no targets are available', async () => {
    const capture = createOutputCapture();

    mockGetAvailableTargets.mockResolvedValue([]);

    await executeBuild({
      project: 'C:\\Projects\\SpaceGame',
      listTargets: true,
      stdout: capture.stdout,
      stderr: capture.stderr,
    });

    expect(capture.getStdout()).toContain('No build targets found');
    expect(capture.getStdout()).toContain('Blueprint-only projects have no build targets');
  });

  it('handles target listing errors gracefully', async () => {
    const capture = createOutputCapture();

    mockGetAvailableTargets.mockRejectedValue(new Error('Target scan failed'));

    await executeBuild({
      project: 'C:\\Projects\\SpaceGame',
      listTargets: true,
      stdout: capture.stdout,
      stderr: capture.stderr,
    });

    expect(capture.getStderr()).toContain('Failed to list targets: Target scan failed');
  });

  it('handles dry run when engine resolution fails', async () => {
    const capture = createOutputCapture();

    mockResolveEngine.mockRejectedValue(new Error('Engine not found'));

    await executeBuild({
      target: 'Editor',
      config: 'Development',
      platform: 'Win64',
      dryRun: true,
      stdout: capture.stdout,
      stderr: capture.stderr,
    });

    expect(capture.getStdout()).toContain('Detection failed - specify with --engine-path');
    expect(mockBuildExecute).not.toHaveBeenCalled();
  });

  it('uses default values when options are not provided', async () => {
    const capture = createOutputCapture();

    mockBuildExecute.mockResolvedValue({
      success: true,
      exitCode: 0,
      stdout: 'Build complete',
      stderr: '',
      duration: 10,
    });

    await executeBuild({
      stdout: capture.stdout,
      stderr: capture.stderr,
    });

    expect(mockBuildExecute).toHaveBeenCalledWith({
      target: 'Editor',
      config: 'Development',
      platform: 'Win64',
      projectPath: undefined,
      enginePath: undefined,
      clean: undefined,
      verbose: undefined,
    });
  });

  it('handles build failures without stderr', async () => {
    const capture = createOutputCapture();

    mockBuildExecute.mockResolvedValue({
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: '',
      duration: 5,
      error: 'Build failed',
    });

    await expect(
      executeBuild({
        target: 'Editor',
        config: 'Development',
        platform: 'Win64',
        stdout: capture.stdout,
        stderr: capture.stderr,
      })
    ).rejects.toThrow('Build failed with exit code 1');

    expect(capture.getStdout()).not.toContain('Error Summary');
  });

  it('truncates error summary when there are many errors', async () => {
    const capture = createOutputCapture();

    const manyErrors = Array(15)
      .fill(null)
      .map((_, i) => `Error: failure ${i + 1}`)
      .join('\n');

    mockBuildExecute.mockResolvedValue({
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: manyErrors,
      duration: 5,
    });

    await expect(
      executeBuild({
        target: 'Editor',
        config: 'Development',
        platform: 'Win64',
        stdout: capture.stdout,
        stderr: capture.stderr,
      })
    ).rejects.toThrow('Build failed with exit code 1');

    expect(capture.getStdout()).toContain('Error Summary');
    expect(capture.getStdout()).toContain('... and 5 more errors');
  });

  it('works with custom targets that are non-empty strings', async () => {
    const capture = createOutputCapture();

    mockBuildExecute.mockResolvedValue({
      success: true,
      exitCode: 0,
      stdout: 'Build complete',
      stderr: '',
      duration: 10,
    });

    await executeBuild({
      target: 'MyCustomTarget',
      config: 'Development',
      platform: 'Win64',
      stdout: capture.stdout,
      stderr: capture.stderr,
    });

    expect(mockBuildExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'MyCustomTarget',
      })
    );
  });
});

describe('ProjectBuilder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAvailableTargets.mockResolvedValue([]);
    mockResolveEngine.mockResolvedValue({ warnings: [] });
  });

  it('creates builder with default options', () => {
    const builder = new ProjectBuilder();
    expect(builder.getLogger()).toBeDefined();
  });

  it('creates builder with custom streams', () => {
    const capture = createOutputCapture();
    const builder = new ProjectBuilder({
      stdout: capture.stdout,
      stderr: capture.stderr,
    });
    expect(builder.getLogger()).toBeDefined();
  });

  it('respects silent mode', async () => {
    const capture = createOutputCapture();

    mockBuildExecute.mockResolvedValue({
      success: true,
      exitCode: 0,
      stdout: 'Build complete',
      stderr: '',
      duration: 10,
    });

    const builder = new ProjectBuilder({
      stdout: capture.stdout,
      stderr: capture.stderr,
      silent: true,
    });

    await builder.build({
      target: 'Editor',
      config: 'Development',
      platform: 'Win64',
    });

    expect(capture.getStdout()).toBe('');
  });
});

describe('buildCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAvailableTargets.mockResolvedValue([]);
    mockResolveEngine.mockResolvedValue({ warnings: [] });
  });

  it('registers the build command with commander', () => {
    const program = new Command();
    buildCommand(program);

    const buildCmd = program.commands.find((cmd) => cmd.name() === 'build');
    expect(buildCmd).toBeDefined();
    expect(buildCmd?.description()).toBe('Build Unreal Engine project');
  });

  it('command has all expected options', () => {
    const program = new Command();
    buildCommand(program);

    const buildCmd = program.commands.find((cmd) => cmd.name() === 'build');
    const options = buildCmd?.options || [];

    const optionFlags = options.map((opt) => opt.long);
    expect(optionFlags).toContain('--target');
    expect(optionFlags).toContain('--config');
    expect(optionFlags).toContain('--platform');
    expect(optionFlags).toContain('--project');
    expect(optionFlags).toContain('--engine-path');
    expect(optionFlags).toContain('--clean');
    expect(optionFlags).toContain('--verbose');
    expect(optionFlags).toContain('--dry-run');
    expect(optionFlags).toContain('--list-targets');
  });

  it('exits with error code 1 on build failure', async () => {
    const program = new Command();
    buildCommand(program);

    mockBuildExecute.mockResolvedValue({
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: 'Error: build failed',
      duration: 5,
    });

    const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as (code?: string | number | null | undefined) => never);

    const buildCmd = program.commands.find((cmd) => cmd.name() === 'build');
    await expect(
      buildCmd?.parseAsync(['--target', 'Editor', '--config', 'Development', '--platform', 'Win64'])
    ).rejects.toThrow('process.exit called');

    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });
});
