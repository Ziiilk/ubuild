import path from 'path';
import fs from 'fs-extra';
import {
  createFakeEngine,
  createFakeExecaChild,
  createFakeProject,
  createOutputCapture,
  withTempDir,
} from '../test-utils';
import { ProjectRunner, runProject } from './project-runner';

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
const mockResolveEngine = jest.fn<Promise<MockEngineResult>, [string]>();
const mockResolveEnginePath = jest.fn<
  Promise<string>,
  [{ projectPath?: string; enginePath?: string }]
>();
const mockResolveTarget = jest.fn<Promise<string>, [string, string]>();
const mockExeca = jest.fn<ReturnType<typeof createFakeExecaChild>, ExecaInvocation>();

jest.mock('./build-executor', () => {
  const BuildExecutor = jest.fn().mockImplementation(() => ({
    execute: (...args: [unknown]) => mockBuildExecute(...args),
  }));
  return { BuildExecutor };
});

jest.mock('./engine-resolver', () => ({
  EngineResolver: {
    resolveEngine: (...args: [string]) => mockResolveEngine(...args),
    resolveEnginePath: (...args: [{ projectPath?: string; enginePath?: string }]) =>
      mockResolveEnginePath(...args),
  },
}));

jest.mock('./target-resolver', () => ({
  TargetResolver: {
    resolveTarget: (...args: [string, string]) => mockResolveTarget(...args),
  },
}));

jest.mock('execa', () => ({
  execa: (...args: ExecaInvocation) => mockExeca(...args),
}));

describe('ProjectRunner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveEngine.mockResolvedValue({ warnings: [] });
    mockResolveEnginePath.mockResolvedValue('');
    mockResolveTarget.mockImplementation((_, target) => Promise.resolve(target));
  });

  describe('constructor', () => {
    it('creates a runner with default stdout/stderr when none provided', () => {
      const runner = new ProjectRunner();
      expect(runner.getLogger()).toBeDefined();
    });

    it('creates a runner with custom stdout/stderr streams', async () => {
      await withTempDir(async () => {
        const capture = createOutputCapture();
        const runner = new ProjectRunner({
          stdout: capture.stdout,
          stderr: capture.stderr,
        });

        expect(runner.getLogger()).toBeDefined();
      });
    });

    it('respects silent mode', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir);
        const engine = await createFakeEngine(rootDir);
        const capture = createOutputCapture();

        mockResolveEnginePath.mockResolvedValue(engine.enginePath);

        const runner = new ProjectRunner({
          stdout: capture.stdout,
          stderr: capture.stderr,
          silent: true,
        });

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

        await runner.run({
          project: project.projectDir,
          target: 'Editor',
          config: 'Development',
          platform: 'Win64',
        });

        expect(capture.getStdout()).toBe('');
        expect(capture.getStderr()).toBe('');
      });
    });
  });

  describe('getLogger', () => {
    it('returns the logger instance', () => {
      const runner = new ProjectRunner();
      const logger = runner.getLogger();
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
    });
  });

  describe('run validation', () => {
    it('throws error for invalid target', async () => {
      const capture = createOutputCapture();
      const runner = new ProjectRunner({
        stdout: capture.stdout,
        stderr: capture.stderr,
      });

      // Use whitespace-only target which is falsy after trim
      await expect(
        runner.run({
          target: '   ',
          config: 'Development',
          platform: 'Win64',
        })
      ).rejects.toThrow('Invalid target');

      expect(capture.getStderr()).toContain('Invalid build target');
    });

    it('throws error for invalid config', async () => {
      const capture = createOutputCapture();
      const runner = new ProjectRunner({
        stdout: capture.stdout,
        stderr: capture.stderr,
      });

      await expect(
        runner.run({
          target: 'Editor',
          config: 'InvalidConfig',
          platform: 'Win64',
        })
      ).rejects.toThrow('Invalid config');

      expect(capture.getStderr()).toContain('Invalid build configuration: InvalidConfig');
    });

    it('throws error for invalid platform', async () => {
      const capture = createOutputCapture();
      const runner = new ProjectRunner({
        stdout: capture.stdout,
        stderr: capture.stderr,
      });

      await expect(
        runner.run({
          target: 'Editor',
          config: 'Development',
          platform: 'InvalidPlatform',
        })
      ).rejects.toThrow('Invalid platform');

      expect(capture.getStderr()).toContain('Invalid build platform: InvalidPlatform');
    });
  });

  describe('dry run', () => {
    it('prints dry run configuration without executing', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
        const engine = await createFakeEngine(rootDir, { displayName: 'Unreal Engine 5.3' });
        const capture = createOutputCapture();

        mockResolveEngine.mockResolvedValue({
          engine: {
            path: engine.enginePath,
            displayName: engine.installation.displayName,
          },
          warnings: [],
        });
        mockResolveEnginePath.mockResolvedValue(engine.enginePath);

        const runner = new ProjectRunner({
          stdout: capture.stdout,
          stderr: capture.stderr,
        });

        await runner.run({
          project: project.projectDir,
          target: 'Editor',
          config: 'Development',
          platform: 'Win64',
          dryRun: true,
          buildFirst: true,
          detached: false,
        });

        expect(mockExeca).not.toHaveBeenCalled();
        expect(mockBuildExecute).not.toHaveBeenCalled();
        expect(capture.getStdout()).toContain('Dry Run - Run Configuration');
        expect(capture.getStdout()).toContain(`Project: ${project.projectDir}`);
        expect(capture.getStdout()).toContain('Target: Editor');
        expect(capture.getStdout()).toContain('Configuration: Development');
        expect(capture.getStdout()).toContain('Platform: Win64');
        expect(capture.getStdout()).toContain('Build First: Yes');
        expect(capture.getStdout()).toContain('Detached: No');
        expect(capture.getStdout()).toContain(`Engine: ${engine.installation.displayName}`);
        expect(capture.getStdout()).toContain(
          'This is a dry run - no actual run will be performed'
        );
      });
    });

    it('handles missing engine gracefully in dry run', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir);
        const capture = createOutputCapture();

        mockResolveEngine.mockRejectedValue(new Error('Engine not found'));
        mockResolveEnginePath.mockRejectedValue(new Error('Engine not found'));

        const runner = new ProjectRunner({
          stdout: capture.stdout,
          stderr: capture.stderr,
        });

        await runner.run({
          project: project.projectDir,
          target: 'Editor',
          config: 'Development',
          platform: 'Win64',
          dryRun: true,
        });

        expect(capture.getStdout()).toContain('Detection failed - specify with --engine-path');
      });
    });

    it('shows non-existent executable warning in dry run', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
        const engine = await createFakeEngine(rootDir, { includeEditorExecutable: false });
        const capture = createOutputCapture();

        mockResolveEngine.mockResolvedValue({
          engine: { path: engine.enginePath },
          warnings: [],
        });
        mockResolveEnginePath.mockResolvedValue(engine.enginePath);

        const runner = new ProjectRunner({
          stdout: capture.stdout,
          stderr: capture.stderr,
        });

        await runner.run({
          project: project.projectDir,
          target: 'Editor',
          config: 'Development',
          platform: 'Win64',
          dryRun: true,
        });

        expect(capture.getStdout()).toContain('Executable exists:');
        expect(capture.getStdout()).toContain('No - may need to build first');
      });
    });

    it('handles executable path detection failure in dry run', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
        const engine = await createFakeEngine(rootDir);
        const capture = createOutputCapture();

        mockResolveEngine.mockResolvedValue({
          engine: { path: engine.enginePath },
          warnings: [],
        });
        // Mock resolveEnginePath to throw an error during executable finding
        mockResolveEnginePath.mockRejectedValue(new Error('Engine path resolution failed'));

        const runner = new ProjectRunner({
          stdout: capture.stdout,
          stderr: capture.stderr,
        });

        await runner.run({
          project: project.projectDir,
          target: 'Editor',
          config: 'Development',
          platform: 'Win64',
          dryRun: true,
        });

        // When findExecutable returns null due to engine resolution failure
        expect(capture.getStdout()).toContain('Could not determine path');
      });
    });

    it('shows defaults in dry run when options not specified', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir);
        const engine = await createFakeEngine(rootDir);
        const capture = createOutputCapture();

        mockResolveEngine.mockResolvedValue({
          engine: { path: engine.enginePath },
          warnings: [],
        });
        mockResolveEnginePath.mockResolvedValue(engine.enginePath);

        const runner = new ProjectRunner({
          stdout: capture.stdout,
          stderr: capture.stderr,
        });

        await runner.run({
          project: project.projectDir,
          dryRun: true,
        });

        expect(capture.getStdout()).toContain('Target: Editor');
        expect(capture.getStdout()).toContain('Configuration: Development');
        expect(capture.getStdout()).toContain('Platform: Win64');
      });
    });
  });

  describe('runProject', () => {
    it('runs editor executable with project path prepended', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
        const engine = await createFakeEngine(rootDir);
        const capture = createOutputCapture();

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

        const runner = new ProjectRunner({
          stdout: capture.stdout,
          stderr: capture.stderr,
        });

        await runner.run({
          project: project.projectDir,
          enginePath: engine.enginePath,
          target: 'Editor',
          config: 'Development',
          platform: 'Win64',
        });

        expect(mockExeca).toHaveBeenCalledWith(
          engine.editorExecutablePath,
          [project.uprojectPath],
          expect.objectContaining({
            stdio: 'inherit',
            cwd: path.dirname(engine.editorExecutablePath),
            detached: undefined,
          })
        );
        expect(capture.getStdout()).toContain('Running: UnrealEditor.exe');
        expect(capture.getStdout()).toContain('Process completed successfully in');
      });
    });

    it('builds first when buildFirst option is true', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
        const engine = await createFakeEngine(rootDir);
        const capture = createOutputCapture();

        mockResolveEnginePath.mockResolvedValue(engine.enginePath);
        mockBuildExecute.mockResolvedValue({
          success: true,
          exitCode: 0,
          stdout: 'Build successful',
          stderr: '',
          duration: 5,
        });
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

        const runner = new ProjectRunner({
          stdout: capture.stdout,
          stderr: capture.stderr,
        });

        await runner.run({
          project: project.projectDir,
          enginePath: engine.enginePath,
          target: 'Editor',
          config: 'Development',
          platform: 'Win64',
          buildFirst: true,
        });

        expect(mockBuildExecute).toHaveBeenCalledWith({
          target: 'Editor',
          config: 'Development',
          platform: 'Win64',
          projectPath: project.uprojectPath,
          enginePath: engine.enginePath,
          verbose: false,
        });
        expect(capture.getStdout()).toContain('Building project before running...');
      });
    });

    it('throws when build fails and buildFirst is true', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
        const engine = await createFakeEngine(rootDir);
        const capture = createOutputCapture();

        mockResolveEnginePath.mockResolvedValue(engine.enginePath);
        mockBuildExecute.mockResolvedValue({
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: 'Compilation failed',
          duration: 10,
        });

        const runner = new ProjectRunner({
          stdout: capture.stdout,
          stderr: capture.stderr,
        });

        await expect(
          runner.run({
            project: project.projectDir,
            enginePath: engine.enginePath,
            target: 'Editor',
            config: 'Development',
            platform: 'Win64',
            buildFirst: true,
          })
        ).rejects.toThrow('Build failed with exit code 1');

        expect(mockExeca).not.toHaveBeenCalled();
        expect(capture.getStderr()).toContain('Build failed. Cannot run project.');
      });
    });

    it('skips build when noBuild option is true even if buildFirst is also set', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'NoBuildGame' });
        const engine = await createFakeEngine(rootDir);
        const capture = createOutputCapture();

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

        const runner = new ProjectRunner({
          stdout: capture.stdout,
          stderr: capture.stderr,
        });

        await runner.run({
          project: project.projectDir,
          enginePath: engine.enginePath,
          target: 'Editor',
          config: 'Development',
          platform: 'Win64',
          noBuild: true,
          buildFirst: true,
        });

        // Build should NOT be called when noBuild is true
        expect(mockBuildExecute).not.toHaveBeenCalled();
        expect(capture.getStdout()).not.toContain('Building project before running...');
        // But the executable should still be launched
        expect(mockExeca).toHaveBeenCalled();
      });
    });

    it('runs in detached mode when specified', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
        const engine = await createFakeEngine(rootDir);
        const capture = createOutputCapture();

        mockResolveEnginePath.mockResolvedValue(engine.enginePath);

        const mockUnref = jest.fn();
        mockExeca.mockImplementation(() => {
          const child = createFakeExecaChild({ exitCode: 0 });
          (child as unknown as { unref: () => void }).unref = mockUnref;
          return child;
        });

        const runner = new ProjectRunner({
          stdout: capture.stdout,
          stderr: capture.stderr,
        });

        await runner.run({
          project: project.projectDir,
          enginePath: engine.enginePath,
          target: 'Editor',
          config: 'Development',
          platform: 'Win64',
          detached: true,
        });

        expect(mockExeca).toHaveBeenCalledWith(
          engine.editorExecutablePath,
          [project.uprojectPath],
          expect.objectContaining({
            stdio: 'ignore',
            detached: true,
          })
        );
        expect(mockUnref).toHaveBeenCalled();
        expect(capture.getStdout()).toContain('Started process in detached mode');
      });
    });

    it('handles execa rejection in detached mode without unhandled promise', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'RejectGame' });
        const engine = await createFakeEngine(rootDir);
        const capture = createOutputCapture();

        mockResolveEnginePath.mockResolvedValue(engine.enginePath);

        const mockUnref = jest.fn();
        mockExeca.mockImplementation(() => {
          const child = createFakeExecaChild({}, { rejectWith: new Error('spawn failed') });
          (child as unknown as { unref: () => void }).unref = mockUnref;
          return child;
        });

        const runner = new ProjectRunner({
          stdout: capture.stdout,
          stderr: capture.stderr,
        });

        // Should NOT throw and should NOT produce an unhandled promise rejection
        await runner.run({
          project: project.projectDir,
          enginePath: engine.enginePath,
          target: 'Editor',
          config: 'Development',
          platform: 'Win64',
          detached: true,
        });

        expect(mockUnref).toHaveBeenCalled();
        expect(capture.getStdout()).toContain('Started process in detached mode');
      });
    });

    it('passes additional arguments to executable', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
        const engine = await createFakeEngine(rootDir);
        const capture = createOutputCapture();

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

        const runner = new ProjectRunner({
          stdout: capture.stdout,
          stderr: capture.stderr,
        });

        await runner.run({
          project: project.projectDir,
          enginePath: engine.enginePath,
          target: 'Editor',
          config: 'Development',
          platform: 'Win64',
          args: ['-log', '-trace=default'],
        });

        expect(mockExeca).toHaveBeenCalledWith(
          engine.editorExecutablePath,
          [project.uprojectPath, '-log', '-trace=default'],
          expect.any(Object)
        );
      });
    });

    it('does not prepend project path for non-editor targets', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
        const binariesDir = path.join(project.projectDir, 'Binaries', 'Win64');
        const gameExecutable = path.join(binariesDir, 'TestGame.exe');

        await fs.ensureDir(binariesDir);
        await fs.writeFile(gameExecutable, '');

        const engine = await createFakeEngine(rootDir);
        const capture = createOutputCapture();

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

        const runner = new ProjectRunner({
          stdout: capture.stdout,
          stderr: capture.stderr,
        });

        await runner.run({
          project: project.projectDir,
          target: 'Game',
          config: 'Development',
          platform: 'Win64',
        });

        expect(mockExeca).toHaveBeenCalledWith(gameExecutable, [], expect.any(Object));
      });
    });

    it('finds alternative editor executables when main one is missing', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
        const engine = await createFakeEngine(rootDir, { includeEditorExecutable: false });
        const capture = createOutputCapture();

        // Create UE4Editor.exe as alternative
        const binariesDir = path.join(engine.enginePath, 'Engine', 'Binaries', 'Win64');
        await fs.ensureDir(binariesDir);
        await fs.writeFile(path.join(binariesDir, 'UE4Editor.exe'), '');

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

        const runner = new ProjectRunner({
          stdout: capture.stdout,
          stderr: capture.stderr,
        });

        await runner.run({
          project: project.projectDir,
          enginePath: engine.enginePath,
          target: 'Editor',
          config: 'Development',
          platform: 'Win64',
        });

        expect(mockExeca).toHaveBeenCalledWith(
          path.join(binariesDir, 'UE4Editor.exe'),
          [project.uprojectPath],
          expect.any(Object)
        );
      });
    });

    it('handles engine path resolution failure in dry run', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
        const capture = createOutputCapture();

        mockResolveEngine.mockResolvedValue({
          engine: { path: 'some/path' },
          warnings: [],
        });
        // Make engine path resolution fail for editor target path lookups
        mockResolveEnginePath.mockRejectedValue(new Error('Engine resolution failed'));

        const runner = new ProjectRunner({
          stdout: capture.stdout,
          stderr: capture.stderr,
        });

        await runner.run({
          project: project.projectDir,
          target: 'Editor',
          config: 'Development',
          platform: 'Win64',
          dryRun: true,
        });

        // When engine resolution fails for editor targets, executable path cannot be determined
        expect(capture.getStdout()).toContain('Could not determine path');
      });
    });

    it('throws when project file does not exist', async () => {
      await withTempDir(async (rootDir) => {
        const nonExistentProject = path.join(rootDir, 'NonExistent', 'Project.uproject');
        const capture = createOutputCapture();

        const runner = new ProjectRunner({
          stdout: capture.stdout,
          stderr: capture.stderr,
        });

        await expect(
          runner.run({
            project: nonExistentProject,
            target: 'Editor',
            config: 'Development',
            platform: 'Win64',
          })
        ).rejects.toThrow();
      });
    });

    it('throws when executable is not found', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
        const engine = await createFakeEngine(rootDir, { includeEditorExecutable: false });
        const capture = createOutputCapture();

        mockResolveEnginePath.mockResolvedValue(engine.enginePath);

        const runner = new ProjectRunner({
          stdout: capture.stdout,
          stderr: capture.stderr,
        });

        await expect(
          runner.run({
            project: project.projectDir,
            enginePath: engine.enginePath,
            target: 'Editor',
            config: 'Development',
            platform: 'Win64',
          })
        ).rejects.toThrow('Executable not found');
      });
    });

    it('throws when executable path cannot be determined', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
        const engine = await createFakeEngine(rootDir);
        const capture = createOutputCapture();

        mockResolveEnginePath.mockResolvedValue(engine.enginePath);
        // Mock execa to throw an error that triggers the catch block in findExecutable
        // This will cause findExecutable to return null
        mockResolveTarget.mockRejectedValue(new Error('Target resolution failed'));

        const runner = new ProjectRunner({
          stdout: capture.stdout,
          stderr: capture.stderr,
        });

        await expect(
          runner.run({
            project: project.projectDir,
            enginePath: engine.enginePath,
            target: 'Game',
            config: 'Development',
            platform: 'Win64',
          })
        ).rejects.toThrow('Could not determine executable path');
      });
    });

    it('handles execa execution errors', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
        const engine = await createFakeEngine(rootDir);
        const capture = createOutputCapture();

        mockResolveEnginePath.mockResolvedValue(engine.enginePath);
        mockExeca.mockImplementation(() => {
          throw new Error('Execution failed: Permission denied');
        });

        const runner = new ProjectRunner({
          stdout: capture.stdout,
          stderr: capture.stderr,
        });

        await expect(
          runner.run({
            project: project.projectDir,
            enginePath: engine.enginePath,
            target: 'Editor',
            config: 'Development',
            platform: 'Win64',
          })
        ).rejects.toThrow('Failed to run executable: Execution failed: Permission denied');
      });
    });

    it('handles process exit with non-zero code', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
        const engine = await createFakeEngine(rootDir);
        const capture = createOutputCapture();

        mockResolveEnginePath.mockResolvedValue(engine.enginePath);
        mockExeca.mockImplementation(() => {
          const child = createFakeExecaChild({ exitCode: 1 });
          const originalOn = child.on.bind(child);
          child.on = (event: 'exit', listener: (code: number) => void) => {
            const registeredChild = originalOn(event, listener);
            listener(1);
            return registeredChild;
          };
          return child;
        });

        const runner = new ProjectRunner({
          stdout: capture.stdout,
          stderr: capture.stderr,
        });

        await runner.run({
          project: project.projectDir,
          enginePath: engine.enginePath,
          target: 'Editor',
          config: 'Development',
          platform: 'Win64',
        });

        expect(capture.getStderr()).toContain('Process exited with code 1');
      });
    });

    it('handles process exit with null code (abnormal termination)', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
        const engine = await createFakeEngine(rootDir);
        const capture = createOutputCapture();

        mockResolveEnginePath.mockResolvedValue(engine.enginePath);
        mockExeca.mockImplementation(() => {
          const child = createFakeExecaChild({ exitCode: 0 });
          const originalOn = child.on.bind(child);
          // Override the exit handler to simulate null exit code (abnormal termination)
          // In real scenarios, Node.js child_process can emit null for exit code
          child.on = ((event: string, listener: (code: number | null) => void) => {
            if (event === 'exit') {
              // Call the listener with null to simulate abnormal termination
              listener(null);
            }
            return originalOn(event as 'exit', listener as (code: number) => void);
          }) as typeof child.on;
          return child;
        });

        const runner = new ProjectRunner({
          stdout: capture.stdout,
          stderr: capture.stderr,
        });

        await runner.run({
          project: project.projectDir,
          enginePath: engine.enginePath,
          target: 'Editor',
          config: 'Development',
          platform: 'Win64',
        });

        expect(capture.getStderr()).toContain('Process terminated abnormally');
      });
    });

    it('uses default values when options are not provided', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
        const engine = await createFakeEngine(rootDir);
        const capture = createOutputCapture();

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

        const runner = new ProjectRunner({
          stdout: capture.stdout,
          stderr: capture.stderr,
        });

        await runner.run({
          project: project.projectDir,
          enginePath: engine.enginePath,
        });

        expect(mockExeca).toHaveBeenCalledWith(
          engine.editorExecutablePath,
          [project.uprojectPath],
          expect.any(Object)
        );
      });
    });

    it('uses current working directory when project is not specified', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
        const engine = await createFakeEngine(rootDir);
        const capture = createOutputCapture();

        const originalCwd = process.cwd();
        process.chdir(project.projectDir);

        try {
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

          const runner = new ProjectRunner({
            stdout: capture.stdout,
            stderr: capture.stderr,
          });

          await runner.run({});

          expect(mockExeca).toHaveBeenCalled();
        } finally {
          process.chdir(originalCwd);
        }
      });
    });
  });
});

describe('runProject', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveEnginePath.mockResolvedValue('');
    mockResolveTarget.mockImplementation((_, target) => Promise.resolve(target));
  });

  it('convenience function runs project without creating instance', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
      const engine = await createFakeEngine(rootDir);
      const capture = createOutputCapture();

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
        stdout: capture.stdout,
        stderr: capture.stderr,
      });

      expect(mockExeca).toHaveBeenCalled();
      expect(capture.getStdout()).toContain('Running: UnrealEditor.exe');
    });
  });
});

describe('ProjectRunner findExecutable for Client/Server targets', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveEnginePath.mockResolvedValue('');
    mockResolveTarget.mockImplementation((_, target) => Promise.resolve(target));
  });

  it('finds Game target executable in Binaries/platform directory', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'ShooterGame' });
      const binariesDir = path.join(project.projectDir, 'Binaries', 'Win64');
      const gameExe = path.join(binariesDir, 'ShooterGame.exe');
      await fs.ensureDir(binariesDir);
      await fs.writeFile(gameExe, '');

      const engine = await createFakeEngine(rootDir);
      const capture = createOutputCapture();

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

      const runner = new ProjectRunner({
        stdout: capture.stdout,
        stderr: capture.stderr,
      });

      await runner.run({
        project: project.projectDir,
        target: 'Game',
        config: 'Development',
        platform: 'Win64',
      });

      expect(mockExeca).toHaveBeenCalledWith(gameExe, [], expect.any(Object));
    });
  });

  it('finds Client target executable via resolved target name', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'MultiplayerGame' });
      const binariesDir = path.join(project.projectDir, 'Binaries', 'Win64');
      await fs.ensureDir(binariesDir);

      // Client targets typically resolve to "<ProjectName>Client" as target name
      const clientExe = path.join(binariesDir, 'MultiplayerGameClient.exe');
      await fs.writeFile(clientExe, '');

      const engine = await createFakeEngine(rootDir);
      const capture = createOutputCapture();

      mockResolveEnginePath.mockResolvedValue(engine.enginePath);
      mockResolveTarget.mockImplementation((_projectPath, target) => {
        if (target === 'Client') return Promise.resolve('MultiplayerGameClient');
        return Promise.resolve(target);
      });
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

      const runner = new ProjectRunner({
        stdout: capture.stdout,
        stderr: capture.stderr,
      });

      await runner.run({
        project: project.projectDir,
        target: 'Client',
        config: 'Development',
        platform: 'Win64',
      });

      expect(mockExeca).toHaveBeenCalledWith(clientExe, [], expect.any(Object));
      // Should NOT prepend project path for Client target
      const execArgs = mockExeca.mock.calls[0][1];
      expect(execArgs).toEqual([]);
    });
  });

  it('finds Server target executable via resolved target name', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'DedicatedGame' });
      const binariesDir = path.join(project.projectDir, 'Binaries', 'Win64');
      await fs.ensureDir(binariesDir);

      const serverExe = path.join(binariesDir, 'DedicatedGameServer.exe');
      await fs.writeFile(serverExe, '');

      const engine = await createFakeEngine(rootDir);
      const capture = createOutputCapture();

      mockResolveEnginePath.mockResolvedValue(engine.enginePath);
      mockResolveTarget.mockImplementation((_projectPath, target) => {
        if (target === 'Server') return Promise.resolve('DedicatedGameServer');
        return Promise.resolve(target);
      });
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

      const runner = new ProjectRunner({
        stdout: capture.stdout,
        stderr: capture.stderr,
      });

      await runner.run({
        project: project.projectDir,
        target: 'Server',
        config: 'Development',
        platform: 'Win64',
      });

      expect(mockExeca).toHaveBeenCalledWith(serverExe, [], expect.any(Object));
      const execArgs = mockExeca.mock.calls[0][1];
      expect(execArgs).toEqual([]);
    });
  });

  it('returns default path for Client when no executable found on disk', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'NoExeGame' });
      const engine = await createFakeEngine(rootDir);
      const capture = createOutputCapture();

      mockResolveEnginePath.mockResolvedValue(engine.enginePath);
      mockResolveTarget.mockImplementation((_projectPath, target) => {
        if (target === 'Client') return Promise.resolve('NoExeGameClient');
        return Promise.resolve(target);
      });

      const runner = new ProjectRunner({
        stdout: capture.stdout,
        stderr: capture.stderr,
      });

      // Should throw because executable doesn't exist at the default path
      await expect(
        runner.run({
          project: project.projectDir,
          target: 'Client',
          config: 'Development',
          platform: 'Win64',
        })
      ).rejects.toThrow('Executable not found');
    });
  });

  it('returns default path for Server when no executable found on disk', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'NoExeGame' });
      const engine = await createFakeEngine(rootDir);
      const capture = createOutputCapture();

      mockResolveEnginePath.mockResolvedValue(engine.enginePath);
      mockResolveTarget.mockImplementation((_projectPath, target) => {
        if (target === 'Server') return Promise.resolve('NoExeGameServer');
        return Promise.resolve(target);
      });

      const runner = new ProjectRunner({
        stdout: capture.stdout,
        stderr: capture.stderr,
      });

      await expect(
        runner.run({
          project: project.projectDir,
          target: 'Server',
          config: 'Development',
          platform: 'Win64',
        })
      ).rejects.toThrow('Executable not found');
    });
  });
});
