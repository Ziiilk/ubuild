// Mock execa before importing modules that use it
const mockExeca = jest.fn();

jest.mock('execa', () => ({
  execa: (...args: unknown[]) => mockExeca(...args),
}));

// Mock BuildExecutor module
const mockGetAvailableTargets = jest.fn();
const mockBuildExecutorExecute = jest.fn();

jest.mock('./build-executor', () => ({
  BuildExecutor: class MockBuildExecutor {
    execute = mockBuildExecutorExecute;
    static getAvailableTargets = mockGetAvailableTargets;
  },
}));

import { ProjectBuilder } from './project-builder';
import * as EngineResolverModule from './engine-resolver';
import { createFakeProject, createOutputCapture, withTempDir } from '../test-utils';

describe('ProjectBuilder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExeca.mockReset();
    mockGetAvailableTargets.mockReset();
    mockBuildExecutorExecute.mockReset();
  });

  describe('constructor', () => {
    it('creates a builder with default stdout/stderr when none provided', () => {
      const builder = new ProjectBuilder({});
      expect(builder.getLogger()).toBeDefined();
    });

    it('creates a builder with custom stdout/stderr streams', () => {
      const capture = createOutputCapture();
      const builder = new ProjectBuilder({
        stdout: capture.stdout,
        stderr: capture.stderr,
      });
      expect(builder.getLogger()).toBeDefined();
    });

    it('creates a builder with custom logger', () => {
      const capture = createOutputCapture();
      const { Logger } = jest.requireActual('../utils/logger');
      const customLogger = new Logger({
        stdout: capture.stdout,
        stderr: capture.stderr,
        silent: true,
      });
      const builder = new ProjectBuilder({ logger: customLogger });
      expect(builder.getLogger()).toBe(customLogger);
    });

    it('getLogger returns the logger instance', () => {
      const builder = new ProjectBuilder({});
      const logger = builder.getLogger();
      expect(logger).toBeDefined();
    });
  });

  describe('build validation', () => {
    it('throws error for invalid build target', async () => {
      await withTempDir(async () => {
        const capture = createOutputCapture();
        const builder = new ProjectBuilder({
          stdout: capture.stdout,
          stderr: capture.stderr,
          silent: true,
        });

        await expect(
          builder.build({
            target: 'InvalidTarget',
            config: 'Development',
            platform: 'Win64',
          })
        ).rejects.toThrow();
      });
    });

    it('throws error for invalid build configuration', async () => {
      await withTempDir(async () => {
        const capture = createOutputCapture();
        const builder = new ProjectBuilder({
          stdout: capture.stdout,
          stderr: capture.stderr,
          silent: true,
        });

        await expect(
          builder.build({
            target: 'Editor',
            config: 'InvalidConfig',
            platform: 'Win64',
          })
        ).rejects.toThrow();
      });
    });

    it('throws error for invalid build platform', async () => {
      await withTempDir(async () => {
        const capture = createOutputCapture();
        const builder = new ProjectBuilder({
          stdout: capture.stdout,
          stderr: capture.stderr,
          silent: true,
        });

        await expect(
          builder.build({
            target: 'Editor',
            config: 'Development',
            platform: 'InvalidPlatform',
          })
        ).rejects.toThrow();
      });
    });
  });

  describe('dry run', () => {
    it('prints dry run configuration without executing build', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
        const capture = createOutputCapture();
        const builder = new ProjectBuilder({
          stdout: capture.stdout,
          stderr: capture.stderr,
          silent: true,
        });

        await builder.build({
          project: project.projectDir,
          target: 'Editor',
          config: 'Development',
          platform: 'Win64',
          clean: true,
          verbose: true,
          dryRun: true,
        });

        const output = capture.getStdout();
        expect(output).toContain('Project:');
        expect(output).toContain('Target:');
        expect(output).toContain('Editor');
        expect(output).toContain('Configuration:');
        expect(output).toContain('Development');
        expect(output).toContain('Platform:');
        expect(output).toContain('Win64');
        expect(output).toContain('Clean Build: Yes');
        expect(output).toContain('Verbose: Yes');
      });
    });

    it('shows default values in dry run when options not specified', async () => {
      await withTempDir(async () => {
        const capture = createOutputCapture();
        const builder = new ProjectBuilder({
          stdout: capture.stdout,
          stderr: capture.stderr,
          silent: true,
        });

        await builder.build({
          dryRun: true,
        });

        const output = capture.getStdout();
        expect(output).toContain('Clean Build: No');
        expect(output).toContain('Verbose: No');
      });
    });
  });

  describe('listAvailableTargets', () => {
    it('lists available build targets for project', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'TestGame' });

        mockGetAvailableTargets.mockResolvedValueOnce([
          { name: 'TestGameEditor', type: 'Editor' },
          { name: 'TestGame', type: 'Game' },
        ]);

        const capture = createOutputCapture();
        const builder = new ProjectBuilder({
          stdout: capture.stdout,
          stderr: capture.stderr,
          silent: true,
        });

        await builder.build({
          project: project.projectDir,
          listTargets: true,
        });

        const output = capture.getStdout();
        expect(output).toContain('TestGameEditor');
        expect(output).toContain('TestGame');
        expect(output).toContain('(Editor)');
        expect(output).toContain('(Game)');
      });
    });

    it('shows helpful message when no targets found', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'TestGame' });

        mockGetAvailableTargets.mockResolvedValueOnce([]);

        const capture = createOutputCapture();
        const builder = new ProjectBuilder({
          stdout: capture.stdout,
          stderr: capture.stderr,
          silent: true,
        });

        await builder.build({
          project: project.projectDir,
          listTargets: true,
        });

        const output = capture.getStdout();
        expect(output).toContain('No build targets found');
        expect(output).toContain('Make sure:');
        expect(output).toContain('Source/*.Target.cs');
      });
    });

    it('handles errors when listing targets fails', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'TestGame' });

        mockGetAvailableTargets.mockRejectedValueOnce(new Error('Target scan failed'));

        const capture = createOutputCapture();
        const builder = new ProjectBuilder({
          stdout: capture.stdout,
          stderr: capture.stderr,
          silent: false,
        });

        // Should not throw, just log the error
        await expect(
          builder.build({
            project: project.projectDir,
            listTargets: true,
          })
        ).resolves.not.toThrow();

        // Error is written to stderr via logger.error
        const output = capture.getStderr();
        expect(output).toContain('Failed to list targets');
        expect(output).toContain('Target scan failed');
      });
    });
  });

  describe('successful build output', () => {
    it('displays output path when build succeeds', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'TestGame' });

        mockBuildExecutorExecute.mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: 'Build succeeded\nOutput path: C:\\Build\\Output',
          stderr: '',
        });

        const capture = createOutputCapture();
        const builder = new ProjectBuilder({
          stdout: capture.stdout,
          stderr: capture.stderr,
        });

        await builder.build({
          project: project.projectDir,
          target: 'Editor',
          config: 'Development',
          platform: 'Win64',
        });

        const output = capture.getStdout();
        expect(output).toContain('Build completed successfully');
        expect(output).toContain('Output directory: C:\\Build\\Output');
      });
    });

    it('completes successfully without output path in stdout', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'TestGame' });

        mockBuildExecutorExecute.mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: 'Build succeeded without output path',
          stderr: '',
        });

        const capture = createOutputCapture();
        const builder = new ProjectBuilder({
          stdout: capture.stdout,
          stderr: capture.stderr,
        });

        await builder.build({
          project: project.projectDir,
          target: 'Editor',
          config: 'Development',
          platform: 'Win64',
        });

        const output = capture.getStdout();
        expect(output).toContain('Build completed successfully');
        expect(output).not.toContain('Output directory:');
      });
    });
  });

  describe('failed build error summary', () => {
    it('displays error summary when build fails with errors in stderr', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'TestGame' });

        mockBuildExecutorExecute.mockResolvedValueOnce({
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: 'ERROR: Compilation failed\nERROR: Missing header file\nBuild failed',
          error: 'Build process exited with code 1',
        });

        const capture = createOutputCapture();
        const builder = new ProjectBuilder({
          stdout: capture.stdout,
          stderr: capture.stderr,
        });

        await expect(
          builder.build({
            project: project.projectDir,
            target: 'Editor',
            config: 'Development',
            platform: 'Win64',
          })
        ).rejects.toThrow('Build failed with exit code 1');

        const stdout = capture.getStdout();
        expect(stdout).toContain('Error Summary');
        expect(stdout).toContain('ERROR: Compilation failed');
        expect(stdout).toContain('ERROR: Missing header file');
      });
    });

    it('truncates error summary to 10 errors when more are present', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'TestGame' });

        const errorLines = Array.from({ length: 15 }, (_, i) => `ERROR: Error ${i + 1}`);
        mockBuildExecutorExecute.mockResolvedValueOnce({
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: errorLines.join('\n'),
          error: 'Build process exited with code 1',
        });

        const capture = createOutputCapture();
        const builder = new ProjectBuilder({
          stdout: capture.stdout,
          stderr: capture.stderr,
        });

        await expect(
          builder.build({
            project: project.projectDir,
            target: 'Editor',
            config: 'Development',
            platform: 'Win64',
          })
        ).rejects.toThrow();

        const stdout = capture.getStdout();
        expect(stdout).toContain('Error Summary');
        expect(stdout).toContain('ERROR: Error 1');
        expect(stdout).toContain('ERROR: Error 10');
        expect(stdout).not.toContain('ERROR: Error 11');
        expect(stdout).toContain('... and 5 more errors');
      });
    });

    it('handles build failure without stderr', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'TestGame' });

        mockBuildExecutorExecute.mockResolvedValueOnce({
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: '',
          error: 'Build process was killed',
        });

        const capture = createOutputCapture();
        const builder = new ProjectBuilder({
          stdout: capture.stdout,
          stderr: capture.stderr,
        });

        await expect(
          builder.build({
            project: project.projectDir,
            target: 'Editor',
            config: 'Development',
            platform: 'Win64',
          })
        ).rejects.toThrow();

        // Build failed message and error go to stderr via logger.error
        const stderr = capture.getStderr();
        expect(stderr).toContain('Build failed');
        expect(stderr).toContain('Build process was killed');

        // Error Summary should not appear in stdout (no stderr content to filter)
        const stdout = capture.getStdout();
        expect(stdout).not.toContain('Error Summary');
      });
    });

    it('filters stderr lines containing error, failed, or fatal keywords', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'TestGame' });

        mockBuildExecutorExecute.mockResolvedValueOnce({
          success: false,
          exitCode: 1,
          stdout: '',
          stderr:
            'Info: Starting build\nERROR: Compilation failed\nWarning: Deprecated API\nFATAL: Linker error\nBuild FAILED\nInfo: Cleanup done',
          error: 'Build failed',
        });

        const capture = createOutputCapture();
        const builder = new ProjectBuilder({
          stdout: capture.stdout,
          stderr: capture.stderr,
        });

        await expect(
          builder.build({
            project: project.projectDir,
            target: 'Editor',
            config: 'Development',
            platform: 'Win64',
          })
        ).rejects.toThrow();

        const stdout = capture.getStdout();
        expect(stdout).toContain('Error Summary');
        expect(stdout).toContain('ERROR: Compilation failed');
        expect(stdout).toContain('FATAL: Linker error');
        expect(stdout).toContain('Build FAILED');
        expect(stdout).not.toContain('Info: Starting build');
        expect(stdout).not.toContain('Warning: Deprecated API');
        expect(stdout).not.toContain('Info: Cleanup done');
      });
    });
  });

  describe('dry run engine resolution', () => {
    it('shows engine path when engine is resolved successfully in dry run', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'TestGame' });

        const mockResolveEngine = jest
          .spyOn(EngineResolverModule.EngineResolver, 'resolveEngine')
          .mockResolvedValueOnce({
            engine: {
              path: 'C:\\UE_5.3',
              displayName: 'Unreal Engine 5.3',
              associationId: 'UE_5.3',
            },
            warnings: [],
          });

        const capture = createOutputCapture();
        const builder = new ProjectBuilder({
          stdout: capture.stdout,
          stderr: capture.stderr,
          silent: true,
        });

        await builder.build({
          project: project.projectDir,
          target: 'Editor',
          dryRun: true,
        });

        const output = capture.getStdout();
        expect(output).toContain('Engine:');
        expect(output).toContain('Unreal Engine 5.3');

        mockResolveEngine.mockRestore();
      });
    });

    it('shows warning when engine detection fails in dry run', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'TestGame' });

        const mockResolveEngine = jest
          .spyOn(EngineResolverModule.EngineResolver, 'resolveEngine')
          .mockRejectedValueOnce(new Error('Registry access denied'));

        const capture = createOutputCapture();
        const builder = new ProjectBuilder({
          stdout: capture.stdout,
          stderr: capture.stderr,
          silent: true,
        });

        await builder.build({
          project: project.projectDir,
          target: 'Editor',
          dryRun: true,
        });

        const output = capture.getStdout();
        expect(output).toContain('Engine:');
        expect(output).toContain('Detection failed');
        expect(output).toContain('specify with --engine-path');

        mockResolveEngine.mockRestore();
      });
    });

    it('suggests --engine-path when engine is not detected in dry run', async () => {
      await withTempDir(async (rootDir) => {
        const project = await createFakeProject(rootDir, { projectName: 'TestGame' });

        const mockResolveEngine = jest
          .spyOn(EngineResolverModule.EngineResolver, 'resolveEngine')
          .mockResolvedValueOnce({
            engine: undefined,
            warnings: ['No engine found in registry'],
          });

        const capture = createOutputCapture();
        const builder = new ProjectBuilder({
          stdout: capture.stdout,
          stderr: capture.stderr,
          silent: true,
        });

        await builder.build({
          project: project.projectDir,
          target: 'Editor',
          dryRun: true,
        });

        const output = capture.getStdout();
        expect(output).toContain('Engine:');
        expect(output).toContain('Not detected');
        expect(output).toContain('specify with --engine-path');

        mockResolveEngine.mockRestore();
      });
    });
  });
});
