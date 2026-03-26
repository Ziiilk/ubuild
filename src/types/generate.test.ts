import { IDE, GenerateOptions, GenerateResult } from './generate';

describe('Generate Types', () => {
  describe('IDE type', () => {
    it('accepts valid IDE types', () => {
      const ides: IDE[] = ['sln', 'vscode', 'clion', 'xcode', 'vs2022'];
      expect(ides).toContain('sln');
      expect(ides).toContain('vscode');
      expect(ides).toContain('clion');
      expect(ides).toContain('xcode');
      expect(ides).toContain('vs2022');
    });

    it('sln represents Visual Studio solution', () => {
      const ide: IDE = 'sln';
      expect(ide).toBe('sln');
    });

    it('vscode represents Visual Studio Code', () => {
      const ide: IDE = 'vscode';
      expect(ide).toBe('vscode');
    });

    it('clion represents JetBrains CLion', () => {
      const ide: IDE = 'clion';
      expect(ide).toBe('clion');
    });

    it('xcode represents Apple Xcode', () => {
      const ide: IDE = 'xcode';
      expect(ide).toBe('xcode');
    });

    it('vs2022 represents Visual Studio 2022', () => {
      const ide: IDE = 'vs2022';
      expect(ide).toBe('vs2022');
    });
  });

  describe('GenerateOptions interface', () => {
    it('can be constructed with minimal properties', () => {
      const options: GenerateOptions = {};
      expect(options).toBeDefined();
    });

    it('can be constructed with all properties', () => {
      const options: GenerateOptions = {
        ide: 'vscode',
        projectPath: '/path/to/project',
        enginePath: '/path/to/engine',
        force: true,
      };

      expect(options.ide).toBe('vscode');
      expect(options.projectPath).toBe('/path/to/project');
      expect(options.enginePath).toBe('/path/to/engine');
      expect(options.force).toBe(true);
    });

    it('can be constructed with sln IDE', () => {
      const options: GenerateOptions = {
        ide: 'sln',
      };
      expect(options.ide).toBe('sln');
    });

    it('can be constructed with vscode IDE', () => {
      const options: GenerateOptions = {
        ide: 'vscode',
      };
      expect(options.ide).toBe('vscode');
    });

    it('can be constructed with clion IDE', () => {
      const options: GenerateOptions = {
        ide: 'clion',
      };
      expect(options.ide).toBe('clion');
    });

    it('can be constructed with xcode IDE', () => {
      const options: GenerateOptions = {
        ide: 'xcode',
      };
      expect(options.ide).toBe('xcode');
    });

    it('can be constructed with vs2022 IDE', () => {
      const options: GenerateOptions = {
        ide: 'vs2022',
      };
      expect(options.ide).toBe('vs2022');
    });

    it('can be constructed with only project path', () => {
      const options: GenerateOptions = {
        projectPath: '/path/to/project',
      };
      expect(options.projectPath).toBe('/path/to/project');
      expect(options.ide).toBeUndefined();
      expect(options.force).toBeUndefined();
    });

    it('can be constructed with force flag', () => {
      const options: GenerateOptions = {
        force: true,
      };
      expect(options.force).toBe(true);
    });

    it('handles all IDE types', () => {
      const ides: IDE[] = ['sln', 'vscode', 'clion', 'xcode', 'vs2022'];

      ides.forEach((ide) => {
        const options: GenerateOptions = { ide };
        expect(options.ide).toBe(ide);
      });
    });
  });

  describe('GenerateResult interface', () => {
    it('can be constructed for successful generation', () => {
      const result: GenerateResult = {
        success: true,
        generatedFiles: ['MyProject.sln', 'MyProject.vcxproj'],
      };

      expect(result.success).toBe(true);
      expect(result.generatedFiles).toHaveLength(2);
      expect(result.generatedFiles[0]).toBe('MyProject.sln');
      expect(result.generatedFiles[1]).toBe('MyProject.vcxproj');
      expect(result.error).toBeUndefined();
    });

    it('can be constructed for failed generation', () => {
      const result: GenerateResult = {
        success: false,
        generatedFiles: [],
        error: 'Failed to generate project files',
      };

      expect(result.success).toBe(false);
      expect(result.generatedFiles).toHaveLength(0);
      expect(result.error).toBe('Failed to generate project files');
    });

    it('can be constructed with single generated file', () => {
      const result: GenerateResult = {
        success: true,
        generatedFiles: ['compile_commands.json'],
      };

      expect(result.generatedFiles).toHaveLength(1);
      expect(result.generatedFiles[0]).toBe('compile_commands.json');
    });

    it('can be constructed with multiple generated files', () => {
      const result: GenerateResult = {
        success: true,
        generatedFiles: [
          'MyProject.sln',
          'MyProject.vcxproj',
          'MyProject.vcxproj.filters',
          'MyProject.vcxproj.user',
          '.vscode/launch.json',
          '.vscode/tasks.json',
        ],
      };

      expect(result.generatedFiles).toHaveLength(6);
      expect(result.generatedFiles).toContain('.vscode/launch.json');
    });

    it('can be constructed with partial success (some files generated)', () => {
      const result: GenerateResult = {
        success: false,
        generatedFiles: ['MyProject.sln'],
        error: 'Some files could not be generated',
      };

      expect(result.success).toBe(false);
      expect(result.generatedFiles).toHaveLength(1);
      expect(result.error).toBeDefined();
    });
  });
});
