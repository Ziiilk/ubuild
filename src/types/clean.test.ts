import { CleanOptions, CleanResult } from './clean';
import { Writable } from 'stream';
import { Logger } from '../utils/logger';

describe('Clean Types', () => {
  describe('CleanOptions interface', () => {
    it('can be constructed with minimal properties', () => {
      const options: CleanOptions = {};
      expect(options).toBeDefined();
    });

    it('can be constructed with all properties', () => {
      const stdout = new Writable({ write: () => {} });
      const stderr = new Writable({ write: () => {} });
      const logger = new Logger();

      const options: CleanOptions = {
        projectPath: '/path/to/project',
        enginePath: '/path/to/engine',
        dryRun: true,
        binariesOnly: true,
        logger: logger,
        stdout: stdout,
        stderr: stderr,
        silent: false,
      };

      expect(options.projectPath).toBe('/path/to/project');
      expect(options.enginePath).toBe('/path/to/engine');
      expect(options.dryRun).toBe(true);
      expect(options.binariesOnly).toBe(true);
      expect(options.logger).toBe(logger);
      expect(options.stdout).toBe(stdout);
      expect(options.stderr).toBe(stderr);
      expect(options.silent).toBe(false);
    });

    it('can be constructed with only project path', () => {
      const options: CleanOptions = {
        projectPath: '/path/to/project',
      };
      expect(options.projectPath).toBe('/path/to/project');
      expect(options.dryRun).toBeUndefined();
      expect(options.binariesOnly).toBeUndefined();
    });

    it('can be constructed with dry run flag', () => {
      const options: CleanOptions = {
        projectPath: '/path/to/project',
        dryRun: true,
      };
      expect(options.dryRun).toBe(true);
    });

    it('can be constructed with binaries only flag', () => {
      const options: CleanOptions = {
        projectPath: '/path/to/project',
        binariesOnly: true,
      };
      expect(options.binariesOnly).toBe(true);
    });

    it('can be constructed with silent flag', () => {
      const options: CleanOptions = {
        projectPath: '/path/to/project',
        silent: true,
      };
      expect(options.silent).toBe(true);
    });
  });

  describe('CleanResult interface', () => {
    it('can be constructed for successful clean', () => {
      const result: CleanResult = {
        success: true,
        deletedPaths: ['C:/Projects/MyGame/Binaries', 'C:/Projects/MyGame/Intermediate'],
        failedPaths: [],
      };

      expect(result.success).toBe(true);
      expect(result.deletedPaths).toHaveLength(2);
      expect(result.deletedPaths[0]).toBe('C:/Projects/MyGame/Binaries');
      expect(result.failedPaths).toHaveLength(0);
      expect(result.error).toBeUndefined();
    });

    it('can be constructed for failed clean', () => {
      const result: CleanResult = {
        success: false,
        deletedPaths: ['C:/Projects/MyGame/Intermediate'],
        failedPaths: [{ path: 'C:/Projects/MyGame/Binaries', error: 'Permission denied' }],
        error: 'Failed to clean some paths',
      };

      expect(result.success).toBe(false);
      expect(result.deletedPaths).toHaveLength(1);
      expect(result.failedPaths).toHaveLength(1);
      expect(result.failedPaths[0].path).toBe('C:/Projects/MyGame/Binaries');
      expect(result.failedPaths[0].error).toBe('Permission denied');
      expect(result.error).toBe('Failed to clean some paths');
    });

    it('can be constructed with empty deleted paths', () => {
      const result: CleanResult = {
        success: true,
        deletedPaths: [],
        failedPaths: [],
      };

      expect(result.success).toBe(true);
      expect(result.deletedPaths).toHaveLength(0);
      expect(result.failedPaths).toHaveLength(0);
    });

    it('can be constructed with multiple failed paths', () => {
      const result: CleanResult = {
        success: false,
        deletedPaths: [],
        failedPaths: [
          { path: 'C:/Projects/MyGame/Binaries', error: 'Permission denied' },
          { path: 'C:/Projects/MyGame/Intermediate', error: 'Access denied' },
          { path: 'C:/Projects/MyGame/Saved', error: 'File in use' },
        ],
      };

      expect(result.failedPaths).toHaveLength(3);
      expect(result.failedPaths[2].error).toBe('File in use');
    });

    it('handles empty error messages in failed paths', () => {
      const result: CleanResult = {
        success: false,
        deletedPaths: [],
        failedPaths: [{ path: 'C:/Projects/MyGame/Binaries', error: '' }],
      };

      expect(result.failedPaths[0].error).toBe('');
    });

    it('handles partial success with both deleted and failed paths', () => {
      const result: CleanResult = {
        success: false,
        deletedPaths: ['C:/Projects/MyGame/Intermediate'],
        failedPaths: [
          { path: 'C:/Projects/MyGame/Binaries', error: 'Permission denied' },
          { path: 'C:/Projects/MyGame/Saved', error: 'Directory not empty' },
        ],
        error: 'Partial clean completed with 2 failures',
      };

      expect(result.success).toBe(false);
      expect(result.deletedPaths).toHaveLength(1);
      expect(result.failedPaths).toHaveLength(2);
      expect(result.error).toBe('Partial clean completed with 2 failures');
    });

    it('handles success with empty error property explicitly undefined', () => {
      const result: CleanResult = {
        success: true,
        deletedPaths: ['C:/Projects/MyGame/Binaries'],
        failedPaths: [],
        error: undefined,
      };

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('handles failed paths with special characters in path', () => {
      const result: CleanResult = {
        success: false,
        deletedPaths: [],
        failedPaths: [
          { path: 'C:/Projects/My Game (v2)/Binaries', error: 'Access denied' },
          { path: '/home/user/my-project_2024/Intermediate', error: 'Permission denied' },
        ],
      };

      expect(result.failedPaths[0].path).toBe('C:/Projects/My Game (v2)/Binaries');
      expect(result.failedPaths[1].path).toBe('/home/user/my-project_2024/Intermediate');
    });

    it('handles long paths in deletedPaths', () => {
      const longPath = 'C:/' + 'a/'.repeat(50) + 'Binaries';
      const result: CleanResult = {
        success: true,
        deletedPaths: [longPath],
        failedPaths: [],
      };

      expect(result.deletedPaths[0]).toBe(longPath);
    });

    it('handles many failed paths', () => {
      const failedPaths = Array.from({ length: 100 }, (_, i) => ({
        path: `C:/Projects/MyGame/Path${i}`,
        error: `Error ${i}`,
      }));

      const result: CleanResult = {
        success: false,
        deletedPaths: [],
        failedPaths,
      };

      expect(result.failedPaths).toHaveLength(100);
      expect(result.failedPaths[99].error).toBe('Error 99');
    });
  });

  describe('CleanOptions edge cases', () => {
    it('can be constructed with only engine path', () => {
      const options: CleanOptions = {
        enginePath: '/path/to/engine',
      };
      expect(options.enginePath).toBe('/path/to/engine');
      expect(options.projectPath).toBeUndefined();
    });

    it('can be constructed with all boolean flags false', () => {
      const options: CleanOptions = {
        projectPath: '/path/to/project',
        dryRun: false,
        binariesOnly: false,
        silent: false,
      };
      expect(options.dryRun).toBe(false);
      expect(options.binariesOnly).toBe(false);
      expect(options.silent).toBe(false);
    });

    it('can be constructed with only logger', () => {
      const logger = new Logger();
      const options: CleanOptions = {
        logger,
      };
      expect(options.logger).toBe(logger);
    });

    it('can be constructed with only stdout and stderr', () => {
      const stdout = new Writable({ write: () => {} });
      const stderr = new Writable({ write: () => {} });
      const options: CleanOptions = {
        stdout,
        stderr,
      };
      expect(options.stdout).toBe(stdout);
      expect(options.stderr).toBe(stderr);
    });

    it('can be constructed with empty string paths', () => {
      const options: CleanOptions = {
        projectPath: '',
        enginePath: '',
      };
      expect(options.projectPath).toBe('');
      expect(options.enginePath).toBe('');
    });

    it('can be constructed with paths containing special characters', () => {
      const options: CleanOptions = {
        projectPath: 'C:/Projects/My Game (v2)/Project_2024',
        enginePath: '/path/with spaces/and-dashes/UE_5.3',
      };
      expect(options.projectPath).toBe('C:/Projects/My Game (v2)/Project_2024');
      expect(options.enginePath).toBe('/path/with spaces/and-dashes/UE_5.3');
    });

    it('can be constructed with UNC paths on Windows', () => {
      const options: CleanOptions = {
        projectPath: '\\\\server\\share\\project',
        enginePath: '\\\\server\\share\\engine',
      };
      expect(options.projectPath).toBe('\\\\server\\share\\project');
      expect(options.enginePath).toBe('\\\\server\\share\\engine');
    });
  });
});
