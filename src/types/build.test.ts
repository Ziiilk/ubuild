import {
  BuildOptions,
  BuildResult,
  BuildTarget,
  BuildConfiguration,
  BuildPlatform,
  BuildTargetWithCustom,
  BuildConfigurationWithCustom,
  BuildPlatformWithCustom,
  BUILD_TARGETS,
  BUILD_CONFIGS,
  BUILD_PLATFORMS,
} from './build';
import { Writable } from 'stream';
import { Logger } from '../utils/logger';

describe('Build Types', () => {
  describe('BuildTarget type', () => {
    it('accepts valid build targets', () => {
      const targets: BuildTarget[] = ['Editor', 'Game', 'Client', 'Server'];
      expect(targets).toContain('Editor');
      expect(targets).toContain('Game');
      expect(targets).toContain('Client');
      expect(targets).toContain('Server');
    });

    it('BUILD_TARGETS constant contains all valid targets', () => {
      expect(BUILD_TARGETS).toEqual(['Editor', 'Game', 'Client', 'Server']);
    });
  });

  describe('BuildConfiguration type', () => {
    it('accepts valid build configurations', () => {
      const configs: BuildConfiguration[] = [
        'Debug',
        'DebugGame',
        'Development',
        'Shipping',
        'Test',
      ];
      expect(configs).toContain('Debug');
      expect(configs).toContain('DebugGame');
      expect(configs).toContain('Development');
      expect(configs).toContain('Shipping');
      expect(configs).toContain('Test');
    });

    it('BUILD_CONFIGS constant contains all valid configurations', () => {
      expect(BUILD_CONFIGS).toEqual(['Debug', 'DebugGame', 'Development', 'Shipping', 'Test']);
    });
  });

  describe('BuildPlatform type', () => {
    it('accepts valid build platforms', () => {
      const platforms: BuildPlatform[] = ['Win64', 'Win32', 'Linux', 'Mac', 'Android', 'IOS'];
      expect(platforms).toContain('Win64');
      expect(platforms).toContain('Win32');
      expect(platforms).toContain('Linux');
      expect(platforms).toContain('Mac');
      expect(platforms).toContain('Android');
      expect(platforms).toContain('IOS');
    });

    it('BUILD_PLATFORMS constant contains all valid platforms', () => {
      expect(BUILD_PLATFORMS).toEqual(['Win64', 'Win32', 'Linux', 'Mac', 'Android', 'IOS']);
    });
  });

  describe('BuildTargetWithCustom type', () => {
    it('accepts standard targets', () => {
      const target: BuildTargetWithCustom = 'Editor';
      expect(target).toBe('Editor');
    });

    it('accepts custom string targets', () => {
      const target: BuildTargetWithCustom = 'MyCustomTarget';
      expect(target).toBe('MyCustomTarget');
    });
  });

  describe('BuildConfigurationWithCustom type', () => {
    it('accepts standard configurations', () => {
      const config: BuildConfigurationWithCustom = 'Development';
      expect(config).toBe('Development');
    });

    it('accepts custom string configurations', () => {
      const config: BuildConfigurationWithCustom = 'CustomConfig';
      expect(config).toBe('CustomConfig');
    });
  });

  describe('BuildPlatformWithCustom type', () => {
    it('accepts standard platforms', () => {
      const platform: BuildPlatformWithCustom = 'Win64';
      expect(platform).toBe('Win64');
    });

    it('accepts custom string platforms', () => {
      const platform: BuildPlatformWithCustom = 'CustomPlatform';
      expect(platform).toBe('CustomPlatform');
    });
  });

  describe('BuildOptions interface', () => {
    it('can be constructed with minimal properties', () => {
      const options: BuildOptions = {};
      expect(options).toBeDefined();
    });

    it('can be constructed with all properties', () => {
      const stdout = new Writable({ write: () => {} });
      const stderr = new Writable({ write: () => {} });
      const logger = new Logger();

      const options: BuildOptions = {
        target: 'Editor',
        config: 'Development',
        platform: 'Win64',
        projectPath: '/path/to/project',
        enginePath: '/path/to/engine',
        clean: true,
        verbose: true,
        additionalArgs: ['-arg1', '-arg2'],
        logger: logger,
        stdout: stdout,
        stderr: stderr,
        silent: false,
      };

      expect(options.target).toBe('Editor');
      expect(options.config).toBe('Development');
      expect(options.platform).toBe('Win64');
      expect(options.projectPath).toBe('/path/to/project');
      expect(options.enginePath).toBe('/path/to/engine');
      expect(options.clean).toBe(true);
      expect(options.verbose).toBe(true);
      expect(options.additionalArgs).toEqual(['-arg1', '-arg2']);
      expect(options.logger).toBe(logger);
      expect(options.stdout).toBe(stdout);
      expect(options.stderr).toBe(stderr);
      expect(options.silent).toBe(false);
    });

    it('can use custom target types', () => {
      const options: BuildOptions = {
        target: 'CustomPluginTarget',
        config: 'Development',
        platform: 'Win64',
      };
      expect(options.target).toBe('CustomPluginTarget');
    });

    it('can use custom config types', () => {
      const options: BuildOptions = {
        target: 'Editor',
        config: 'CustomConfiguration',
        platform: 'Win64',
      };
      expect(options.config).toBe('CustomConfiguration');
    });

    it('can use custom platform types', () => {
      const options: BuildOptions = {
        target: 'Editor',
        config: 'Development',
        platform: 'CustomPlatform',
      };
      expect(options.platform).toBe('CustomPlatform');
    });
  });

  describe('BuildResult interface', () => {
    it('can be constructed for successful build', () => {
      const result: BuildResult = {
        success: true,
        exitCode: 0,
        stdout: 'Build successful',
        stderr: '',
        duration: 5000,
      };

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('Build successful');
      expect(result.stderr).toBe('');
      expect(result.duration).toBe(5000);
      expect(result.error).toBeUndefined();
    });

    it('can be constructed for failed build', () => {
      const result: BuildResult = {
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: 'Compilation error',
        duration: 2000,
        error: 'Build failed with errors',
      };

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('Compilation error');
      expect(result.duration).toBe(2000);
      expect(result.error).toBe('Build failed with errors');
    });

    it('accepts partial stdout and stderr content', () => {
      const result: BuildResult = {
        success: true,
        exitCode: 0,
        stdout: 'Building...\nCompiling...\nDone',
        stderr: 'Warning: deprecated function',
        duration: 10000,
      };

      expect(result.stdout).toContain('Building');
      expect(result.stdout).toContain('Done');
      expect(result.stderr).toContain('Warning');
    });
  });

  describe('Re-exports from constants', () => {
    it('re-exports BUILD_TARGETS from constants', () => {
      expect(BUILD_TARGETS).toBeDefined();
      expect(Array.isArray(BUILD_TARGETS)).toBe(true);
      expect(BUILD_TARGETS.length).toBeGreaterThan(0);
    });

    it('re-exports BUILD_CONFIGS from constants', () => {
      expect(BUILD_CONFIGS).toBeDefined();
      expect(Array.isArray(BUILD_CONFIGS)).toBe(true);
      expect(BUILD_CONFIGS.length).toBeGreaterThan(0);
    });

    it('re-exports BUILD_PLATFORMS from constants', () => {
      expect(BUILD_PLATFORMS).toBeDefined();
      expect(Array.isArray(BUILD_PLATFORMS)).toBe(true);
      expect(BUILD_PLATFORMS.length).toBeGreaterThan(0);
    });
  });
});
