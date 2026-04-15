/**
 * Tests for CleanExecutor module.
 */

import { CleanExecutor } from './clean-executor';
import type { CleanOptions } from '../types/clean';
import { Writable } from 'stream';
import * as path from 'path';

const mockFsPathExists = jest.fn();
const mockFsRemove = jest.fn();
const mockFsReaddir = jest.fn();
const mockFsStat = jest.fn();

jest.mock('fs-extra', () => ({
  pathExists: (...args: unknown[]) => mockFsPathExists(...args),
  remove: (...args: unknown[]) => mockFsRemove(...args),
  readdir: (...args: unknown[]) => mockFsReaddir(...args),
  stat: (...args: unknown[]) => mockFsStat(...args),
}));

const mockLoggerInstance = {
  info: jest.fn(),
  success: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  divider: jest.fn(),
  title: jest.fn(),
  subTitle: jest.fn(),
  json: jest.fn(),
  write: jest.fn(),
  writeError: jest.fn(),
  warning: jest.fn(),
  clearProgress: jest.fn(),
  progress: jest.fn(),
};

jest.mock('../utils/logger', () => ({
  Logger: jest.fn().mockImplementation(() => mockLoggerInstance),
  resolveLoggerStreams: jest.fn().mockImplementation((options?: { logger?: unknown }) => ({
    stdout: process.stdout,
    stderr: process.stderr,
    logger: options?.logger || mockLoggerInstance,
  })),
}));

jest.mock('./project-path-resolver', () => ({
  ProjectPathResolver: {
    resolveOrThrow: jest.fn().mockResolvedValue('C:\\Projects\\TestProject\\TestProject.uproject'),
  },
}));

// Import mocked modules for resetting in beforeEach
import { ProjectPathResolver } from './project-path-resolver';

describe('CleanExecutor', () => {
  let executor: CleanExecutor;
  const mockProjectPath = 'C:\\Projects\\TestProject\\TestProject.uproject';
  const mockProjectDir = 'C:\\Projects\\TestProject';
  const mockProjectName = 'TestProject';

  beforeEach(() => {
    jest.clearAllMocks();
    mockLoggerInstance.info.mockClear();
    mockLoggerInstance.success.mockClear();
    mockLoggerInstance.error.mockClear();
    mockLoggerInstance.debug.mockClear();
    mockLoggerInstance.divider.mockClear();
    // Reset ProjectPathResolver mock to default
    (ProjectPathResolver.resolveOrThrow as jest.Mock).mockResolvedValue(
      'C:\\Projects\\TestProject\\TestProject.uproject'
    );
    executor = new CleanExecutor();
  });

  describe('constructor', () => {
    it('creates executor with default options', () => {
      expect(executor).toBeDefined();
    });

    it('creates executor with custom logger', () => {
      const customLogger = {
        info: jest.fn(),
        success: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        divider: jest.fn(),
      } as unknown as import('../utils/logger').Logger;
      const customExecutor = new CleanExecutor({ logger: customLogger });
      expect(customExecutor).toBeDefined();
    });

    it('creates executor with silent option', () => {
      const silentExecutor = new CleanExecutor({ silent: true });
      expect(silentExecutor).toBeDefined();
    });

    it('creates executor with custom stdout stream', () => {
      const mockStdout = new Writable();
      const customExecutor = new CleanExecutor({ stdout: mockStdout });
      expect(customExecutor).toBeDefined();
    });

    it('creates executor with custom stderr stream', () => {
      const mockStderr = new Writable();
      const customExecutor = new CleanExecutor({ stderr: mockStderr });
      expect(customExecutor).toBeDefined();
    });
  });

  describe('execute', () => {
    const baseOptions: CleanOptions = {
      projectPath: mockProjectPath,
    };

    beforeEach(() => {
      // Default mock implementations
      mockFsPathExists.mockResolvedValue(true);
      mockFsRemove.mockResolvedValue(undefined);
      mockFsReaddir.mockResolvedValue(['Plugin1', 'Plugin2']);
      mockFsStat.mockResolvedValue({ isDirectory: () => true } as unknown as import('fs').Stats);
    });

    it('successfully cleans project with default options', async () => {
      const result = await executor.execute(baseOptions);

      expect(result.success).toBe(true);
      expect(result.deletedPaths).toBeDefined();
      expect(result.failedPaths).toBeDefined();
      expect(mockLoggerInstance.info).toHaveBeenCalledWith(`Cleaning project: ${mockProjectName}`);
      expect(mockLoggerInstance.info).toHaveBeenCalledWith(`Project directory: ${mockProjectDir}`);
      expect(mockLoggerInstance.info).toHaveBeenCalledWith(
        'Mode: Full clean (Binaries, Intermediate, Saved, DerivedDataCache)'
      );
    });

    it('performs full clean by default', async () => {
      await executor.execute(baseOptions);

      expect(mockLoggerInstance.info).toHaveBeenCalledWith(
        'Mode: Full clean (Binaries, Intermediate, Saved, DerivedDataCache)'
      );
    });

    it('performs binaries-only clean when specified', async () => {
      const options: CleanOptions = {
        ...baseOptions,
        binariesOnly: true,
      };

      await executor.execute(options);

      expect(mockLoggerInstance.info).toHaveBeenCalledWith('Mode: Binaries and Intermediate only');
    });

    it('performs dry run without deleting files', async () => {
      const options: CleanOptions = {
        ...baseOptions,
        dryRun: true,
      };

      await executor.execute(options);

      expect(mockLoggerInstance.info).toHaveBeenCalledWith(
        'Dry run mode - no files will be deleted'
      );
      expect(mockFsRemove).not.toHaveBeenCalled();
    });

    it('logs "Would remove" instead of "Removed" in dry run mode', async () => {
      mockFsPathExists.mockResolvedValue(true);

      const options: CleanOptions = {
        ...baseOptions,
        dryRun: true,
      };

      await executor.execute(options);

      // Should use "Would remove" prefix in dry-run mode
      const successCalls = mockLoggerInstance.success.mock.calls.map((call: string[]) => call[0]);
      for (const msg of successCalls) {
        expect(msg).toMatch(/^Would remove:/);
      }
      // Should NOT contain "Removed:" in dry-run mode
      expect(successCalls.every((msg: string) => !msg.startsWith('Removed:'))).toBe(true);
    });

    it('logs "Would clean" summary instead of "Cleaned" in dry run mode', async () => {
      mockFsPathExists.mockResolvedValue(true);

      const options: CleanOptions = {
        ...baseOptions,
        dryRun: true,
      };

      await executor.execute(options);

      // Summary should use "Would clean" in dry-run mode
      expect(mockLoggerInstance.info).toHaveBeenCalledWith(
        expect.stringMatching(/^Would clean \d+ directory/)
      );
      // Should NOT contain "Cleaned" in dry-run mode
      const infoCalls = mockLoggerInstance.info.mock.calls.map((call: string[]) => call[0]);
      expect(infoCalls.every((msg: string) => !msg.startsWith('Cleaned'))).toBe(true);
    });

    it('cleans Binaries and Intermediate directories', async () => {
      await executor.execute(baseOptions);

      expect(mockFsPathExists).toHaveBeenCalledWith(expect.stringContaining('Binaries'));
      expect(mockFsPathExists).toHaveBeenCalledWith(expect.stringContaining('Intermediate'));
    });

    it('cleans Saved directory in full clean mode', async () => {
      await executor.execute(baseOptions);

      expect(mockFsPathExists).toHaveBeenCalledWith(expect.stringContaining('Saved'));
    });

    it('cleans DerivedDataCache in full clean mode', async () => {
      await executor.execute(baseOptions);

      expect(mockFsPathExists).toHaveBeenCalledWith(expect.stringContaining('DerivedDataCache'));
    });

    it('cleans .sln file in full clean mode', async () => {
      await executor.execute(baseOptions);

      expect(mockFsPathExists).toHaveBeenCalledWith(expect.stringContaining('.sln'));
    });

    it('cleans .vs directory in full clean mode', async () => {
      await executor.execute(baseOptions);

      expect(mockFsPathExists).toHaveBeenCalledWith(expect.stringContaining('.vs'));
    });

    it('cleans .idea directory in full clean mode', async () => {
      await executor.execute(baseOptions);

      expect(mockFsPathExists).toHaveBeenCalledWith(expect.stringContaining('.idea'));
    });

    it('does not clean Saved directory in binaries-only mode', async () => {
      const options: CleanOptions = {
        ...baseOptions,
        binariesOnly: true,
      };

      await executor.execute(options);

      expect(mockFsPathExists).not.toHaveBeenCalledWith(expect.stringContaining('Saved'));
    });

    it('handles non-existent paths gracefully', async () => {
      mockFsPathExists.mockResolvedValue(false);

      const result = await executor.execute(baseOptions);

      expect(result.success).toBe(true);
      expect(result.deletedPaths.length).toBe(0);
      expect(mockLoggerInstance.info).toHaveBeenCalledWith('No build artifacts found to clean');
    });

    it('returns failure when path removal fails', async () => {
      mockFsRemove.mockRejectedValue(new Error('Permission denied'));

      const result = await executor.execute(baseOptions);

      expect(result.success).toBe(false);
      expect(result.failedPaths).toBeDefined();
      expect(result.failedPaths.length).toBeGreaterThan(0);
    });

    it('returns failure with error message on exception', async () => {
      const mockProjectPathResolver = await import('./project-path-resolver');
      (mockProjectPathResolver.ProjectPathResolver.resolveOrThrow as jest.Mock).mockRejectedValue(
        new Error('Project not found')
      );

      const result = await executor.execute(baseOptions);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Project not found');
    });

    it('cleans plugin Binaries directories', async () => {
      await executor.execute(baseOptions);

      expect(mockFsReaddir).toHaveBeenCalledWith(expect.stringContaining('Plugins'));
      expect(mockFsPathExists).toHaveBeenCalledWith(
        expect.stringContaining(pathJoin('Plugins', 'Plugin1', 'Binaries'))
      );
    });

    it('cleans plugin Intermediate directories', async () => {
      await executor.execute(baseOptions);

      expect(mockFsPathExists).toHaveBeenCalledWith(
        expect.stringContaining(pathJoin('Plugins', 'Plugin1', 'Intermediate'))
      );
    });

    it('skips plugin cleaning if Plugins directory does not exist', async () => {
      mockFsPathExists.mockImplementation((path: string) => {
        if (path.includes('Plugins')) {
          return Promise.resolve(false);
        }
        return Promise.resolve(true);
      });

      await executor.execute(baseOptions);

      expect(mockFsReaddir).not.toHaveBeenCalled();
    });

    it('skips non-directory plugin entries', async () => {
      mockFsStat.mockResolvedValue({ isDirectory: () => false } as unknown as import('fs').Stats);

      await executor.execute(baseOptions);

      expect(mockFsPathExists).not.toHaveBeenCalledWith(
        expect.stringContaining(pathJoin('Plugins', 'Plugin1', 'Binaries'))
      );
    });

    it('handles plugin directory read errors gracefully', async () => {
      mockFsReaddir.mockRejectedValue(new Error('Cannot read directory'));

      const result = await executor.execute(baseOptions);

      // Plugin cleaning failure should cause overall failure
      expect(result.success).toBe(false);
      expect(mockLoggerInstance.warning).toHaveBeenCalledWith(
        expect.stringContaining('Failed to clean plugins')
      );
      // Plugin directory should be recorded in failedPaths
      expect(result.failedPaths!.length).toBeGreaterThan(0);
      expect(result.failedPaths!.some((fp) => fp.path.includes('Plugins'))).toBe(true);
    });

    it('logs success message with count of cleaned directories', async () => {
      mockFsPathExists.mockResolvedValue(true);

      await executor.execute(baseOptions);

      expect(mockLoggerInstance.success).toHaveBeenCalledWith(
        expect.stringMatching(/Cleaned \d+ directory\/directories/)
      );
    });

    it('logs removed paths with relative paths', async () => {
      await executor.execute(baseOptions);

      expect(mockLoggerInstance.success).toHaveBeenCalledWith(expect.stringContaining('Removed:'));
    });

    it('logs failed paths with relative paths', async () => {
      mockFsRemove.mockRejectedValue(new Error('Permission denied'));

      await executor.execute(baseOptions);

      expect(mockLoggerInstance.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to remove:')
      );
    });

    it('uses custom project path when provided', async () => {
      const customPath = 'D:\\CustomProject\\MyProject.uproject';
      const options: CleanOptions = {
        projectPath: customPath,
      };

      const mockProjectPathResolver = await import('./project-path-resolver');
      (mockProjectPathResolver.ProjectPathResolver.resolveOrThrow as jest.Mock).mockResolvedValue(
        customPath
      );

      await executor.execute(options);

      expect(mockProjectPathResolver.ProjectPathResolver.resolveOrThrow).toHaveBeenCalledWith(
        customPath
      );
    });
  });

  describe('getPathsToClean', () => {
    it('returns Binaries and Intermediate for binaries-only mode', () => {
      // This is tested indirectly through execute(), but we verify the behavior
      const options: CleanOptions = {
        projectPath: mockProjectPath,
        binariesOnly: true,
      };

      executor.execute(options);

      // Should not check for Saved, DerivedDataCache, .sln, .vs, .idea
      expect(mockFsPathExists).not.toHaveBeenCalledWith(expect.stringContaining('Saved'));
      expect(mockFsPathExists).not.toHaveBeenCalledWith(
        expect.stringContaining('DerivedDataCache')
      );
      expect(mockFsPathExists).not.toHaveBeenCalledWith(expect.stringContaining('.sln'));
    });

    it('returns all paths for full clean mode', async () => {
      // This is tested indirectly through execute()
      const options: CleanOptions = {
        projectPath: mockProjectPath,
      };

      // Set up mock to return true for all paths so they are checked
      mockFsPathExists.mockResolvedValue(true);

      await executor.execute(options);

      // Should check for all paths
      expect(mockFsPathExists).toHaveBeenCalledWith(expect.stringContaining('Binaries'));
      expect(mockFsPathExists).toHaveBeenCalledWith(expect.stringContaining('Intermediate'));
      expect(mockFsPathExists).toHaveBeenCalledWith(expect.stringContaining('Saved'));
    });
  });

  describe('cleanPath', () => {
    it('removes existing path when not in dry run mode', async () => {
      mockFsPathExists.mockResolvedValue(true);

      const options: CleanOptions = {
        projectPath: mockProjectPath,
      };

      await executor.execute(options);

      expect(mockFsRemove).toHaveBeenCalled();
    });

    it('does not remove path in dry run mode', async () => {
      mockFsPathExists.mockResolvedValue(true);

      const options: CleanOptions = {
        projectPath: mockProjectPath,
        dryRun: true,
      };

      await executor.execute(options);

      expect(mockFsRemove).not.toHaveBeenCalled();
    });

    it('returns deleted: false for non-existent path', async () => {
      mockFsPathExists.mockResolvedValue(false);

      const result = await executor.execute({ projectPath: mockProjectPath });

      expect(result.success).toBe(true);
    });

    it('returns error when removal fails', async () => {
      mockFsPathExists.mockResolvedValue(true);
      mockFsRemove.mockRejectedValue(new Error('EACCES: permission denied'));

      const result = await executor.execute({ projectPath: mockProjectPath });

      expect(result.failedPaths).toBeDefined();
      expect(result.failedPaths[0].error).toContain('EACCES');
    });
  });

  describe('cleanPluginDirectories', () => {
    it('cleans multiple plugin directories', async () => {
      mockFsReaddir.mockResolvedValue(['Plugin1', 'Plugin2', 'Plugin3']);
      mockFsPathExists.mockResolvedValue(true);
      mockFsRemove.mockResolvedValue(undefined);
      mockFsStat.mockResolvedValue({
        isDirectory: () => true,
      } as unknown as import('fs').Stats);

      const result = await executor.execute({ projectPath: mockProjectPath });

      expect(result.success).toBe(true);
      expect(mockFsPathExists).toHaveBeenCalledWith(
        expect.stringContaining(pathJoin('Plugins', 'Plugin1', 'Binaries'))
      );
      expect(mockFsPathExists).toHaveBeenCalledWith(
        expect.stringContaining(pathJoin('Plugins', 'Plugin2', 'Binaries'))
      );
      expect(mockFsPathExists).toHaveBeenCalledWith(
        expect.stringContaining(pathJoin('Plugins', 'Plugin3', 'Binaries'))
      );
    });

    it('handles empty plugins directory', async () => {
      mockFsReaddir.mockResolvedValue([]);
      mockFsPathExists.mockResolvedValue(true);
      mockFsRemove.mockResolvedValue(undefined);

      const result = await executor.execute({ projectPath: mockProjectPath });

      expect(result.success).toBe(true);
    });

    it('handles mixed file and directory entries in plugins', async () => {
      mockFsPathExists.mockResolvedValue(true);
      mockFsRemove.mockResolvedValue(undefined);
      mockFsReaddir.mockResolvedValue(['file.txt', 'Dir1', 'file2.txt', 'Dir2']);
      let callCount = 0;
      mockFsStat.mockImplementation(() => {
        callCount++;
        // First call is directory, second is file
        return Promise.resolve({
          isDirectory: () => callCount % 2 === 1,
        } as unknown as import('fs').Stats);
      });

      const result = await executor.execute({ projectPath: mockProjectPath });

      expect(result.success).toBe(true);
    });
  });

  describe('error handling', () => {
    it('handles fs-extra errors gracefully', async () => {
      mockFsPathExists.mockRejectedValue(new Error('File system error'));

      const result = await executor.execute({ projectPath: mockProjectPath });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('includes error details in failed paths', async () => {
      mockFsPathExists.mockResolvedValue(true);
      mockFsRemove.mockRejectedValue(new Error('Specific error message'));

      const result = await executor.execute({ projectPath: mockProjectPath });

      expect(result.failedPaths).toBeDefined();
      expect(result.failedPaths[0].error).toContain('Specific error message');
    });

    it('continues cleaning after individual path failures', async () => {
      // Setup mocks for this test
      let callCount = 0;
      mockFsPathExists.mockResolvedValue(true);
      mockFsRemove.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('First path fails'));
        }
        return Promise.resolve(undefined);
      });

      const result = await executor.execute({ projectPath: mockProjectPath });

      // Should continue cleaning other paths
      expect(mockFsRemove).toHaveBeenCalledTimes(callCount);
      expect(result.failedPaths.length).toBeGreaterThan(0);
    });
  });

  describe('logging', () => {
    it('logs project information', async () => {
      await executor.execute({ projectPath: mockProjectPath });

      expect(mockLoggerInstance.info).toHaveBeenCalledWith(`Cleaning project: ${mockProjectName}`);
      expect(mockLoggerInstance.info).toHaveBeenCalledWith(`Project directory: ${mockProjectDir}`);
    });

    it('logs clean mode', async () => {
      await executor.execute({ projectPath: mockProjectPath, binariesOnly: true });

      expect(mockLoggerInstance.info).toHaveBeenCalledWith('Mode: Binaries and Intermediate only');
    });

    it('logs dry run mode', async () => {
      await executor.execute({ projectPath: mockProjectPath, dryRun: true });

      expect(mockLoggerInstance.info).toHaveBeenCalledWith(
        'Dry run mode - no files will be deleted'
      );
    });

    it('logs divider before and after cleaning', async () => {
      mockFsPathExists.mockResolvedValue(false); // No paths to clean

      await executor.execute({ projectPath: mockProjectPath });

      expect(mockLoggerInstance.divider).toHaveBeenCalledTimes(2);
    });

    it('logs success for each removed path', async () => {
      mockFsPathExists.mockResolvedValue(true);

      await executor.execute({ projectPath: mockProjectPath });

      expect(mockLoggerInstance.success).toHaveBeenCalled();
    });

    it('logs error for each failed path', async () => {
      // Setup mocks for this test
      mockFsPathExists.mockResolvedValue(true);
      mockFsRemove.mockRejectedValue(new Error('Failed'));

      await executor.execute({ projectPath: mockProjectPath });

      expect(mockLoggerInstance.error).toHaveBeenCalled();
    });

    it('uses silent mode to suppress logging', async () => {
      const silentLogger = {
        info: jest.fn(),
        success: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        divider: jest.fn(),
        title: jest.fn(),
        subTitle: jest.fn(),
        json: jest.fn(),
        write: jest.fn(),
        writeError: jest.fn(),
        warning: jest.fn(),
        clearProgress: jest.fn(),
        progress: jest.fn(),
      } as unknown as import('../utils/logger').Logger;
      const silentExecutor = new CleanExecutor({ logger: silentLogger, silent: true });

      mockFsPathExists.mockResolvedValue(false);

      await silentExecutor.execute({ projectPath: mockProjectPath });

      // Silent logger methods should not be called
      expect(silentLogger.info).not.toHaveBeenCalled();
      expect(silentLogger.success).not.toHaveBeenCalled();
      expect(silentLogger.error).not.toHaveBeenCalled();
    });

    it('returns failure in silent mode when path removal fails', async () => {
      const silentLogger = {
        info: jest.fn(),
        success: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        divider: jest.fn(),
        title: jest.fn(),
        subTitle: jest.fn(),
        json: jest.fn(),
        write: jest.fn(),
        writeError: jest.fn(),
        warning: jest.fn(),
        clearProgress: jest.fn(),
        progress: jest.fn(),
      } as unknown as import('../utils/logger').Logger;
      const silentExecutor = new CleanExecutor({ logger: silentLogger, silent: true });

      mockFsPathExists.mockResolvedValue(true);
      mockFsRemove.mockRejectedValue(new Error('Permission denied'));

      const result = await silentExecutor.execute({ projectPath: mockProjectPath });

      // Should report failure even in silent mode
      expect(result.success).toBe(false);
      expect(result.failedPaths.length).toBeGreaterThan(0);
      expect(result.error).toBeDefined();

      // Should not have logged anything in silent mode
      expect(silentLogger.info).not.toHaveBeenCalled();
      expect(silentLogger.success).not.toHaveBeenCalled();
      expect(silentLogger.error).not.toHaveBeenCalled();
    });

    it('does not log success messages in silent mode when paths are deleted', async () => {
      // Setup mocks for this test
      mockFsPathExists.mockResolvedValue(true);
      mockFsRemove.mockResolvedValue(undefined);
      mockFsReaddir.mockResolvedValue([]);

      const silentLogger = {
        info: jest.fn(),
        success: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        divider: jest.fn(),
        title: jest.fn(),
        subTitle: jest.fn(),
        json: jest.fn(),
        write: jest.fn(),
        writeError: jest.fn(),
        warning: jest.fn(),
        clearProgress: jest.fn(),
        progress: jest.fn(),
      } as unknown as import('../utils/logger').Logger;
      const silentExecutor = new CleanExecutor({ logger: silentLogger, silent: true });

      const result = await silentExecutor.execute({ projectPath: mockProjectPath });

      // Should report success
      expect(result.success).toBe(true);
      expect(result.deletedPaths.length).toBeGreaterThan(0);

      // Should not have logged success messages in silent mode
      expect(silentLogger.success).not.toHaveBeenCalled();
    });

    it('does not log warning in silent mode when plugin cleaning fails', async () => {
      // Setup mocks for this test
      mockFsPathExists.mockImplementation((path: string) => {
        if (path.includes('Plugins')) {
          return Promise.resolve(true);
        }
        return Promise.resolve(false);
      });
      mockFsReaddir.mockRejectedValue(new Error('Permission denied'));

      const silentLogger = {
        info: jest.fn(),
        success: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        divider: jest.fn(),
        title: jest.fn(),
        subTitle: jest.fn(),
        json: jest.fn(),
        write: jest.fn(),
        writeError: jest.fn(),
        warning: jest.fn(),
        clearProgress: jest.fn(),
        progress: jest.fn(),
      } as unknown as import('../utils/logger').Logger;
      const silentExecutor = new CleanExecutor({ logger: silentLogger, silent: true });

      const result = await silentExecutor.execute({ projectPath: mockProjectPath });

      // Should report failure due to plugin cleaning error
      expect(result.success).toBe(false);
      expect(result.failedPaths!.some((fp) => fp.path.includes('Plugins'))).toBe(true);

      // Should not have logged warning in silent mode
      expect(silentLogger.warning).not.toHaveBeenCalled();
    });
  });

  describe('result object', () => {
    it('returns success with deleted paths on success', async () => {
      // Reset mocks and set up fresh implementations
      mockFsPathExists.mockReset().mockResolvedValue(true);
      mockFsRemove.mockReset().mockResolvedValue(undefined);
      mockFsReaddir.mockReset().mockResolvedValue([]);

      const result = await executor.execute({ projectPath: mockProjectPath });

      expect(result.success).toBe(true);
      expect(result.deletedPaths).toBeDefined();
      expect(Array.isArray(result.deletedPaths)).toBe(true);
      expect(result.failedPaths).toBeDefined();
      expect(Array.isArray(result.failedPaths)).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('returns failure with error message on error', async () => {
      const mockProjectPathResolver = await import('./project-path-resolver');
      (mockProjectPathResolver.ProjectPathResolver.resolveOrThrow as jest.Mock).mockRejectedValue(
        new Error('Test error')
      );

      const result = await executor.execute({ projectPath: mockProjectPath });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Test error');
    });

    it('returns failure when some paths fail', async () => {
      let callCount = 0;
      mockFsPathExists.mockImplementation(() => {
        callCount++;
        return Promise.resolve(callCount <= 3); // First 3 paths exist
      });
      mockFsRemove.mockImplementation((path: string) => {
        if (path.includes('Binaries')) {
          return Promise.reject(new Error('Permission denied'));
        }
        return Promise.resolve(undefined);
      });

      const result = await executor.execute({ projectPath: mockProjectPath });

      expect(result.success).toBe(false);
      expect(result.failedPaths.length).toBeGreaterThan(0);
      expect(result.error).toBeDefined();
    });
  });
});

/**
 * Helper to join path segments in a platform-agnostic way for testing.
 * Since tests run on different platforms, we need to handle path separators.
 */
function pathJoin(...segments: string[]): string {
  return segments.join(path.sep);
}
