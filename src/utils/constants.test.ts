import {
  BUILD_TARGETS,
  BUILD_CONFIGS,
  BUILD_PLATFORMS,
  PROJECT_TYPES,
  IDE_TYPES,
  DEFAULTS,
  BuildTarget,
  BuildConfig,
  BuildPlatform,
  ProjectType,
  IDEType,
} from './constants';

describe('Constants', () => {
  describe('BUILD_TARGETS', () => {
    it('should contain all valid build targets', () => {
      expect(BUILD_TARGETS).toEqual(['Editor', 'Game', 'Client', 'Server']);
    });
  });

  describe('BUILD_CONFIGS', () => {
    it('should contain all valid build configurations', () => {
      expect(BUILD_CONFIGS).toEqual(['Debug', 'DebugGame', 'Development', 'Shipping', 'Test']);
    });
  });

  describe('BUILD_PLATFORMS', () => {
    it('should contain all valid build platforms', () => {
      expect(BUILD_PLATFORMS).toEqual(['Win64', 'Win32', 'Linux', 'Mac', 'Android', 'IOS']);
    });
  });

  describe('PROJECT_TYPES', () => {
    it('should contain all valid project types', () => {
      expect(PROJECT_TYPES).toEqual(['cpp', 'blueprint', 'blank']);
    });
  });

  describe('IDE_TYPES', () => {
    it('should contain all valid IDE types', () => {
      expect(IDE_TYPES).toEqual(['sln', 'vscode', 'clion', 'xcode', 'vs2022']);
    });
  });

  describe('DEFAULTS', () => {
    it('should have correct default build target', () => {
      expect(DEFAULTS.BUILD_TARGET).toBe('Editor');
    });

    it('should have correct default build config', () => {
      expect(DEFAULTS.BUILD_CONFIG).toBe('Development');
    });

    it('should have correct default build platform', () => {
      expect(DEFAULTS.BUILD_PLATFORM).toBe('Win64');
    });

    it('should have correct default project type', () => {
      expect(DEFAULTS.PROJECT_TYPE).toBe('cpp');
    });

    it('should have correct default IDE', () => {
      expect(DEFAULTS.IDE).toBe('sln');
    });

    it('should have correct default max find depth', () => {
      expect(DEFAULTS.MAX_FIND_DEPTH).toBe(3);
    });
  });

  describe('Type exports', () => {
    it('BuildTarget type should be compatible with BUILD_TARGETS values', () => {
      const validTarget: BuildTarget = 'Editor';
      expect(BUILD_TARGETS).toContain(validTarget);
    });

    it('BuildConfig type should be compatible with BUILD_CONFIGS values', () => {
      const validConfig: BuildConfig = 'Development';
      expect(BUILD_CONFIGS).toContain(validConfig);
    });

    it('BuildPlatform type should be compatible with BUILD_PLATFORMS values', () => {
      const validPlatform: BuildPlatform = 'Win64';
      expect(BUILD_PLATFORMS).toContain(validPlatform);
    });

    it('ProjectType type should be compatible with PROJECT_TYPES values', () => {
      const validType: ProjectType = 'cpp';
      expect(PROJECT_TYPES).toContain(validType);
    });

    it('IDEType type should be compatible with IDE_TYPES values', () => {
      const validIDE: IDEType = 'vscode';
      expect(IDE_TYPES).toContain(validIDE);
    });
  });

  describe('Integration with validators', () => {
    it('BUILD_TARGETS can be used for validation', () => {
      const isValidTarget = (target: string): boolean =>
        (BUILD_TARGETS as readonly string[]).includes(target);

      expect(isValidTarget('Editor')).toBe(true);
      expect(isValidTarget('Game')).toBe(true);
      expect(isValidTarget('Invalid')).toBe(false);
    });

    it('BUILD_CONFIGS can be used for validation', () => {
      const isValidConfig = (config: string): boolean =>
        BUILD_CONFIGS.includes(config as BuildConfig);

      expect(isValidConfig('Development')).toBe(true);
      expect(isValidConfig('Shipping')).toBe(true);
      expect(isValidConfig('Invalid')).toBe(false);
    });

    it('BUILD_PLATFORMS can be used for validation', () => {
      const isValidPlatform = (platform: string): boolean =>
        BUILD_PLATFORMS.includes(platform as BuildPlatform);

      expect(isValidPlatform('Win64')).toBe(true);
      expect(isValidPlatform('Linux')).toBe(true);
      expect(isValidPlatform('Invalid')).toBe(false);
    });

    it('PROJECT_TYPES can be used for validation', () => {
      const isValidType = (type: string): boolean => PROJECT_TYPES.includes(type as ProjectType);

      expect(isValidType('cpp')).toBe(true);
      expect(isValidType('blueprint')).toBe(true);
      expect(isValidType('invalid')).toBe(false);
    });

    it('IDE_TYPES can be used for validation', () => {
      const isValidIDE = (ide: string): boolean => IDE_TYPES.includes(ide as IDEType);

      expect(isValidIDE('sln')).toBe(true);
      expect(isValidIDE('vscode')).toBe(true);
      expect(isValidIDE('invalid')).toBe(false);
    });
  });
});
