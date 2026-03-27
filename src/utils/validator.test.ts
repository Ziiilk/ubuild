import path from 'path';
import fs from 'fs-extra';
import { Validator } from './validator';
import {
  BUILD_TARGETS,
  BUILD_CONFIGS,
  BUILD_PLATFORMS,
  IDE_TYPES,
  PROJECT_TYPES,
} from './constants';
import { withTempDir } from '../test-utils';

describe('Validator', () => {
  describe('isValidProjectName', () => {
    it('accepts valid project names', () => {
      expect(Validator.isValidProjectName('MyProject')).toBe(true);
      expect(Validator.isValidProjectName('my_project')).toBe(true);
      expect(Validator.isValidProjectName('my-project')).toBe(true);
      expect(Validator.isValidProjectName('Project123')).toBe(true);
      expect(Validator.isValidProjectName('My_Cpp_Project_2')).toBe(true);
    });

    it('rejects invalid project names', () => {
      expect(Validator.isValidProjectName('')).toBe(false);
      expect(Validator.isValidProjectName('My Project')).toBe(false);
      expect(Validator.isValidProjectName('My.Project')).toBe(false);
      expect(Validator.isValidProjectName('My@Project')).toBe(false);
      expect(Validator.isValidProjectName('我的项目')).toBe(false);
    });

    it('accepts single character names', () => {
      expect(Validator.isValidProjectName('A')).toBe(true);
      expect(Validator.isValidProjectName('a')).toBe(true);
      expect(Validator.isValidProjectName('1')).toBe(true);
      expect(Validator.isValidProjectName('_')).toBe(true);
      expect(Validator.isValidProjectName('-')).toBe(true);
    });

    it('accepts names with only underscores', () => {
      expect(Validator.isValidProjectName('_')).toBe(true);
      expect(Validator.isValidProjectName('___')).toBe(true);
      expect(Validator.isValidProjectName('__test__')).toBe(true);
    });

    it('accepts names with only hyphens', () => {
      expect(Validator.isValidProjectName('-')).toBe(true);
      expect(Validator.isValidProjectName('---')).toBe(true);
      expect(Validator.isValidProjectName('--test--')).toBe(true);
    });

    it('accepts names starting with numbers', () => {
      expect(Validator.isValidProjectName('123')).toBe(true);
      expect(Validator.isValidProjectName('1MyProject')).toBe(true);
      expect(Validator.isValidProjectName('42_Game')).toBe(true);
    });

    it('rejects names with only whitespace', () => {
      expect(Validator.isValidProjectName(' ')).toBe(false);
      expect(Validator.isValidProjectName('   ')).toBe(false);
      expect(Validator.isValidProjectName('\t')).toBe(false);
    });

    it('rejects names with special characters', () => {
      expect(Validator.isValidProjectName('My!Project')).toBe(false);
      expect(Validator.isValidProjectName('My#Project')).toBe(false);
      expect(Validator.isValidProjectName('My$Project')).toBe(false);
      expect(Validator.isValidProjectName('My%Project')).toBe(false);
      expect(Validator.isValidProjectName('My^Project')).toBe(false);
      expect(Validator.isValidProjectName('My&Project')).toBe(false);
      expect(Validator.isValidProjectName('My*Project')).toBe(false);
      expect(Validator.isValidProjectName('My(Project')).toBe(false);
      expect(Validator.isValidProjectName('My)Project')).toBe(false);
      expect(Validator.isValidProjectName('My+Project')).toBe(false);
      expect(Validator.isValidProjectName('My=Project')).toBe(false);
      expect(Validator.isValidProjectName('My[Project')).toBe(false);
      expect(Validator.isValidProjectName('My]Project')).toBe(false);
      expect(Validator.isValidProjectName('My{Project')).toBe(false);
      expect(Validator.isValidProjectName('My}Project')).toBe(false);
      expect(Validator.isValidProjectName('My|Project')).toBe(false);
      expect(Validator.isValidProjectName('My\\Project')).toBe(false);
      expect(Validator.isValidProjectName('My/Project')).toBe(false);
      expect(Validator.isValidProjectName('My:Project')).toBe(false);
      expect(Validator.isValidProjectName('My;Project')).toBe(false);
      expect(Validator.isValidProjectName('My"Project')).toBe(false);
      expect(Validator.isValidProjectName("My'Project")).toBe(false);
      expect(Validator.isValidProjectName('My<Project')).toBe(false);
      expect(Validator.isValidProjectName('My>Project')).toBe(false);
      expect(Validator.isValidProjectName('My?Project')).toBe(false);
      expect(Validator.isValidProjectName('My`Project')).toBe(false);
      expect(Validator.isValidProjectName('My~Project')).toBe(false);
    });
  });

  describe('isValidBuildTarget', () => {
    it('accepts all valid build targets', () => {
      for (const target of BUILD_TARGETS) {
        expect(Validator.isValidBuildTarget(target)).toBe(true);
      }
    });

    it('accepts custom target names (e.g., plugin-specific targets)', () => {
      expect(Validator.isValidBuildTarget('MyPluginTarget')).toBe(true);
      expect(Validator.isValidBuildTarget('ServerWithPlugins')).toBe(true);
    });

    it('rejects empty or whitespace-only strings', () => {
      expect(Validator.isValidBuildTarget('')).toBe(false);
      expect(Validator.isValidBuildTarget('   ')).toBe(false); // trim() results in empty string
    });
  });

  describe('isValidBuildConfig', () => {
    it('accepts all valid build configurations', () => {
      for (const config of BUILD_CONFIGS) {
        expect(Validator.isValidBuildConfig(config)).toBe(true);
      }
    });

    it('rejects invalid configurations', () => {
      expect(Validator.isValidBuildConfig('Release')).toBe(false);
      expect(Validator.isValidBuildConfig('DebugGame')).toBe(true); // This is valid
      expect(Validator.isValidBuildConfig('')).toBe(false);
      expect(Validator.isValidBuildConfig('debug')).toBe(false); // case-sensitive
    });
  });

  describe('isValidBuildPlatform', () => {
    it('accepts all valid build platforms', () => {
      for (const platform of BUILD_PLATFORMS) {
        expect(Validator.isValidBuildPlatform(platform)).toBe(true);
      }
    });

    it('rejects invalid platforms', () => {
      expect(Validator.isValidBuildPlatform('Windows')).toBe(false);
      expect(Validator.isValidBuildPlatform('Win64')).toBe(true); // This is valid
      expect(Validator.isValidBuildPlatform('')).toBe(false);
      expect(Validator.isValidBuildPlatform('linux')).toBe(false); // case-sensitive
    });
  });

  describe('isValidIDE', () => {
    it('accepts all valid IDE types', () => {
      for (const ide of IDE_TYPES) {
        expect(Validator.isValidIDE(ide)).toBe(true);
      }
    });

    it('rejects invalid IDE types', () => {
      expect(Validator.isValidIDE('visualstudio')).toBe(false);
      expect(Validator.isValidIDE('vim')).toBe(false);
      expect(Validator.isValidIDE('')).toBe(false);
    });
  });

  describe('isValidProjectType', () => {
    it('accepts all valid project types', () => {
      for (const type of PROJECT_TYPES) {
        expect(Validator.isValidProjectType(type)).toBe(true);
      }
    });

    it('rejects invalid project types', () => {
      expect(Validator.isValidProjectType('cpp')).toBe(true); // Valid
      expect(Validator.isValidProjectType('Blueprint')).toBe(false); // case-sensitive
      expect(Validator.isValidProjectType('rust')).toBe(false);
      expect(Validator.isValidProjectType('')).toBe(false);
    });
  });

  describe('isValidEnginePath', () => {
    it('accepts a valid engine path with required directories', async () => {
      await withTempDir(async (tempDir) => {
        const enginePath = path.join(tempDir, 'Engine');
        const binariesPath = path.join(enginePath, 'Engine', 'Binaries');
        await fs.ensureDir(binariesPath);

        expect(await Validator.isValidEnginePath(enginePath)).toBe(true);
      });
    });

    it('rejects a path without Engine subdirectory', async () => {
      await withTempDir(async (tempDir) => {
        expect(await Validator.isValidEnginePath(tempDir)).toBe(false);
      });
    });

    it('rejects a non-existent path', async () => {
      expect(await Validator.isValidEnginePath('/non/existent/path')).toBe(false);
    });
  });

  describe('isValidUProjectFile', () => {
    it('accepts a valid .uproject file', async () => {
      await withTempDir(async (tempDir) => {
        const uprojectPath = path.join(tempDir, 'MyProject.uproject');
        await fs.writeJson(uprojectPath, {
          FileVersion: 3,
          EngineAssociation: 'UE_5.0',
          Modules: [{ Name: 'MyProject', Type: 'Runtime', LoadingPhase: 'Default' }],
        });

        expect(await Validator.isValidUProjectFile(uprojectPath)).toBe(true);
      });
    });

    it('rejects a file without .uproject extension', async () => {
      await withTempDir(async (tempDir) => {
        const projectPath = path.join(tempDir, 'MyProject.json');
        await fs.writeJson(projectPath, {
          FileVersion: 3,
          EngineAssociation: 'UE_5.0',
          Modules: [],
        });

        expect(await Validator.isValidUProjectFile(projectPath)).toBe(false);
      });
    });

    it('rejects a non-existent file', async () => {
      expect(await Validator.isValidUProjectFile('/non/existent/MyProject.uproject')).toBe(false);
    });

    it('rejects an invalid .uproject file (missing required fields)', async () => {
      await withTempDir(async (tempDir) => {
        const uprojectPath = path.join(tempDir, 'Invalid.uproject');
        await fs.writeJson(uprojectPath, {
          FileVersion: 3,
          // Missing EngineAssociation
          Modules: [],
        });

        expect(await Validator.isValidUProjectFile(uprojectPath)).toBe(false);
      });
    });

    it('rejects a malformed JSON file', async () => {
      await withTempDir(async (tempDir) => {
        const uprojectPath = path.join(tempDir, 'Malformed.uproject');
        await fs.writeFile(uprojectPath, '{ invalid json }');

        expect(await Validator.isValidUProjectFile(uprojectPath)).toBe(false);
      });
    });

    it('rejects a .uproject file with wrong FileVersion', async () => {
      await withTempDir(async (tempDir) => {
        const uprojectPath = path.join(tempDir, 'WrongVersion.uproject');
        await fs.writeJson(uprojectPath, {
          FileVersion: 4,
          EngineAssociation: 'UE_5.0',
          Modules: [],
        });

        expect(await Validator.isValidUProjectFile(uprojectPath)).toBe(false);
      });
    });
  });

  describe('isSafeForInit', () => {
    it('accepts a non-existent directory', async () => {
      await withTempDir(async (tempDir) => {
        const nonExistentPath = path.join(tempDir, 'new-project');
        const result = await Validator.isSafeForInit(nonExistentPath);

        expect(result.safe).toBe(true);
        expect(result.message).toContain('will be created');
      });
    });

    it('accepts an empty directory', async () => {
      await withTempDir(async (tempDir) => {
        const result = await Validator.isSafeForInit(tempDir);

        expect(result.safe).toBe(true);
      });
    });

    it('accepts a directory with only hidden files', async () => {
      await withTempDir(async (tempDir) => {
        await fs.writeFile(path.join(tempDir, '.gitignore'), '');
        await fs.writeFile(path.join(tempDir, '.hidden'), '');

        const result = await Validator.isSafeForInit(tempDir);

        expect(result.safe).toBe(true);
      });
    });

    it('rejects a directory containing a .uproject file', async () => {
      await withTempDir(async (tempDir) => {
        await fs.writeJson(path.join(tempDir, 'Existing.uproject'), {
          FileVersion: 3,
          EngineAssociation: 'UE_5.0',
          Modules: [],
        });

        const result = await Validator.isSafeForInit(tempDir);

        expect(result.safe).toBe(false);
        expect(result.message).toContain('Existing.uproject');
      });
    });

    it('rejects a non-empty directory without --force', async () => {
      await withTempDir(async (tempDir) => {
        await fs.writeFile(path.join(tempDir, 'README.md'), '# My Project');

        const result = await Validator.isSafeForInit(tempDir);

        expect(result.safe).toBe(false);
        expect(result.message).toContain('not empty');
      });
    });

    it('accepts a non-empty directory with --force', async () => {
      await withTempDir(async (tempDir) => {
        await fs.writeFile(path.join(tempDir, 'README.md'), '# My Project');

        const result = await Validator.isSafeForInit(tempDir, true);

        expect(result.safe).toBe(true);
        expect(result.message).toContain('force flag');
      });
    });

    it('rejects a file path (not a directory)', async () => {
      await withTempDir(async (tempDir) => {
        const filePath = path.join(tempDir, 'file.txt');
        await fs.writeFile(filePath, 'content');

        const result = await Validator.isSafeForInit(filePath);

        expect(result.safe).toBe(false);
        expect(result.message).toContain('not a directory');
      });
    });

    it('handles permission errors gracefully', async () => {
      // This test is platform-dependent and may not reliably test permission errors
      // In practice, we just verify it doesn't throw
      const result = await Validator.isSafeForInit('/root/protected', false);
      expect(result).toHaveProperty('safe');
      expect(result).toHaveProperty('message');
    });

    it('handles stat errors gracefully', async () => {
      await withTempDir(async (tempDir) => {
        // Create a file to trigger stat, then mock stat to throw
        const testFile = path.join(tempDir, 'testfile');
        await fs.writeFile(testFile, 'content');

        const mockStat = jest
          .spyOn(fs, 'stat')
          .mockRejectedValue(new Error('Permission denied') as never);

        try {
          const result = await Validator.isSafeForInit(testFile);

          expect(result.safe).toBe(false);
          expect(result.message).toContain('Failed to check directory');
          expect(result.message).toContain('Permission denied');
        } finally {
          mockStat.mockRestore();
        }
      });
    });
  });

  describe('isValidEnginePath error handling', () => {
    it('handles fs errors gracefully', async () => {
      await withTempDir(async (tempDir) => {
        const enginePath = path.join(tempDir, 'Engine');
        await fs.ensureDir(enginePath);

        // Mock pathExists to throw an error
        const mockPathExists = jest
          .spyOn(fs, 'pathExists')
          .mockRejectedValue(new Error('EACCES') as never);

        try {
          const result = await Validator.isValidEnginePath(enginePath);

          expect(result).toBe(false);
        } finally {
          mockPathExists.mockRestore();
        }
      });
    });
  });

  describe('parsePositiveInt', () => {
    it('parses valid positive integers', () => {
      expect(Validator.parsePositiveInt('1', '--test')).toBe(1);
      expect(Validator.parsePositiveInt('42', '--test')).toBe(42);
      expect(Validator.parsePositiveInt('999999', '--test')).toBe(999999);
    });

    it('rejects non-numeric strings', () => {
      expect(() => Validator.parsePositiveInt('abc', '--test')).toThrow(
        '--test must be a positive integer, got: abc'
      );
      // Note: parseInt('12abc') returns 12, so this is accepted
      expect(Validator.parsePositiveInt('12abc', '--test')).toBe(12);
    });

    it('rejects zero', () => {
      expect(() => Validator.parsePositiveInt('0', '--test')).toThrow(
        '--test must be a positive integer, got: 0'
      );
    });

    it('rejects negative numbers', () => {
      expect(() => Validator.parsePositiveInt('-1', '--test')).toThrow(
        '--test must be a positive integer, got: -1'
      );
      expect(() => Validator.parsePositiveInt('-42', '--test')).toThrow(
        '--test must be a positive integer, got: -42'
      );
    });

    it('rejects float values', () => {
      expect(() => Validator.parsePositiveInt('1.5', '--test')).toThrow(
        '--test must be an integer, got: 1.5'
      );
      expect(() => Validator.parsePositiveInt('3.14', '--test')).toThrow(
        '--test must be an integer, got: 3.14'
      );
    });

    it('rejects empty strings', () => {
      expect(() => Validator.parsePositiveInt('', '--test')).toThrow(
        '--test must be a positive integer, got: '
      );
    });

    it('rejects whitespace-only strings', () => {
      expect(() => Validator.parsePositiveInt('   ', '--test')).toThrow(
        '--test must be a positive integer, got:    '
      );
    });

    it('respects maxValue when provided', () => {
      expect(Validator.parsePositiveInt('100', '--test', 100)).toBe(100);
      expect(Validator.parsePositiveInt('50', '--test', 100)).toBe(50);
    });

    it('rejects values exceeding maxValue', () => {
      expect(() => Validator.parsePositiveInt('101', '--test', 100)).toThrow(
        '--test must be <= 100, got: 101'
      );
      expect(() => Validator.parsePositiveInt('1000', '--test', 100)).toThrow(
        '--test must be <= 100, got: 1000'
      );
    });

    it('handles large integers within safe range', () => {
      expect(Validator.parsePositiveInt('2147483647', '--test')).toBe(2147483647);
    });

    it('includes option name in error messages for debugging', () => {
      expect(() => Validator.parsePositiveInt('-5', '--sleep')).toThrow(
        '--sleep must be a positive integer, got: -5'
      );
      expect(() => Validator.parsePositiveInt('200', '--timeout', 100)).toThrow(
        '--timeout must be <= 100, got: 200'
      );
    });
  });

  describe('parseBoundedInt', () => {
    it('parses valid integers', () => {
      expect(Validator.parseBoundedInt('0', '--test')).toBe(0);
      expect(Validator.parseBoundedInt('42', '--test')).toBe(42);
      expect(Validator.parseBoundedInt('-1', '--test')).toBe(-1);
      expect(Validator.parseBoundedInt('999999', '--test')).toBe(999999);
    });

    it('rejects non-numeric strings', () => {
      expect(() => Validator.parseBoundedInt('abc', '--test')).toThrow(
        '--test must be a number, got: abc'
      );
    });

    it('rejects float values', () => {
      expect(() => Validator.parseBoundedInt('1.5', '--test')).toThrow(
        '--test must be an integer, got: 1.5'
      );
      expect(() => Validator.parseBoundedInt('3.14', '--test')).toThrow(
        '--test must be an integer, got: 3.14'
      );
    });

    it('rejects empty strings', () => {
      expect(() => Validator.parseBoundedInt('', '--test')).toThrow(
        '--test must be a number, got: '
      );
    });

    it('respects min bound', () => {
      expect(Validator.parseBoundedInt('5', '--test', { min: 0 })).toBe(5);
      expect(Validator.parseBoundedInt('0', '--test', { min: 0 })).toBe(0);
      expect(Validator.parseBoundedInt('-1', '--test', { min: -1 })).toBe(-1);
    });

    it('rejects values below min bound', () => {
      expect(() => Validator.parseBoundedInt('-1', '--test', { min: 0 })).toThrow(
        '--test must be >= 0, got: -1'
      );
      expect(() => Validator.parseBoundedInt('-5', '--test', { min: -1 })).toThrow(
        '--test must be >= -1, got: -5'
      );
    });

    it('respects max bound', () => {
      expect(Validator.parseBoundedInt('50', '--test', { max: 100 })).toBe(50);
      expect(Validator.parseBoundedInt('100', '--test', { max: 100 })).toBe(100);
    });

    it('rejects values above max bound', () => {
      expect(() => Validator.parseBoundedInt('101', '--test', { max: 100 })).toThrow(
        '--test must be <= 100, got: 101'
      );
    });

    it('respects both min and max bounds', () => {
      expect(Validator.parseBoundedInt('50', '--test', { min: 0, max: 100 })).toBe(50);
      expect(Validator.parseBoundedInt('0', '--test', { min: 0, max: 100 })).toBe(0);
      expect(Validator.parseBoundedInt('100', '--test', { min: 0, max: 100 })).toBe(100);
    });

    it('rejects values outside combined bounds', () => {
      expect(() => Validator.parseBoundedInt('-1', '--test', { min: 0, max: 100 })).toThrow(
        '--test must be >= 0, got: -1'
      );
      expect(() => Validator.parseBoundedInt('101', '--test', { min: 0, max: 100 })).toThrow(
        '--test must be <= 100, got: 101'
      );
    });

    it('handles unlimited retries case (min: -1)', () => {
      expect(Validator.parseBoundedInt('-1', '--max-retries', { min: -1 })).toBe(-1);
      expect(Validator.parseBoundedInt('0', '--max-retries', { min: -1 })).toBe(0);
      expect(Validator.parseBoundedInt('10', '--max-retries', { min: -1 })).toBe(10);
    });

    it('rejects values below -1 when min is -1', () => {
      expect(() => Validator.parseBoundedInt('-2', '--max-retries', { min: -1 })).toThrow(
        '--max-retries must be >= -1, got: -2'
      );
    });

    it('includes option name in error messages for debugging', () => {
      expect(() => Validator.parseBoundedInt('-5', '--max-retries', { min: -1 })).toThrow(
        '--max-retries must be >= -1, got: -5'
      );
      expect(() => Validator.parseBoundedInt('abc', '--timeout')).toThrow(
        '--timeout must be a number, got: abc'
      );
    });
  });
});
