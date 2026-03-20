import { executeBuild } from './build';
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
});
