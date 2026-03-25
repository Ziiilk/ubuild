// Mock execa before importing modules that use it
const mockExeca = jest.fn();

jest.mock('execa', () => ({
  execa: (...args: unknown[]) => mockExeca(...args),
}));

import { ProjectBuilder } from './project-builder';
import * as BuildExecutorModule from './build-executor';
import { createFakeProject, createOutputCapture, withTempDir } from '../test-utils';

describe('ProjectBuilder', () => {
  const mockGetAvailableTargets = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    mockExeca.mockReset();
    mockGetAvailableTargets.mockReset();

    // Mock the static method
    jest
      .spyOn(BuildExecutorModule.BuildExecutor, 'getAvailableTargets')
      .mockImplementation(mockGetAvailableTargets);
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
});
