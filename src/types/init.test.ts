import { ProjectType, InitOptions, InitResult } from './init';

describe('Init Types', () => {
  describe('ProjectType type', () => {
    it('accepts valid project types', () => {
      const types: ProjectType[] = ['cpp', 'blueprint', 'blank'];
      expect(types).toContain('cpp');
      expect(types).toContain('blueprint');
      expect(types).toContain('blank');
    });

    it('cpp represents C++ project', () => {
      const type: ProjectType = 'cpp';
      expect(type).toBe('cpp');
    });

    it('blueprint represents Blueprint project', () => {
      const type: ProjectType = 'blueprint';
      expect(type).toBe('blueprint');
    });

    it('blank represents Blank project', () => {
      const type: ProjectType = 'blank';
      expect(type).toBe('blank');
    });
  });

  describe('InitOptions interface', () => {
    it('can be constructed with minimal required properties', () => {
      const options: InitOptions = {
        name: 'MyGame',
      };

      expect(options.name).toBe('MyGame');
      expect(options.type).toBeUndefined();
      expect(options.template).toBeUndefined();
      expect(options.enginePath).toBeUndefined();
      expect(options.directory).toBeUndefined();
      expect(options.force).toBeUndefined();
    });

    it('can be constructed with all properties', () => {
      const options: InitOptions = {
        name: 'MyGame',
        type: 'cpp',
        template: 'ThirdPerson',
        enginePath: '/path/to/engine',
        directory: '/projects/MyGame',
        force: true,
      };

      expect(options.name).toBe('MyGame');
      expect(options.type).toBe('cpp');
      expect(options.template).toBe('ThirdPerson');
      expect(options.enginePath).toBe('/path/to/engine');
      expect(options.directory).toBe('/projects/MyGame');
      expect(options.force).toBe(true);
    });

    it('can be constructed with cpp project type', () => {
      const options: InitOptions = {
        name: 'MyGame',
        type: 'cpp',
      };
      expect(options.type).toBe('cpp');
    });

    it('can be constructed with blueprint project type', () => {
      const options: InitOptions = {
        name: 'MyGame',
        type: 'blueprint',
      };
      expect(options.type).toBe('blueprint');
    });

    it('can be constructed with blank project type', () => {
      const options: InitOptions = {
        name: 'MyGame',
        type: 'blank',
      };
      expect(options.type).toBe('blank');
    });

    it('can be constructed with template option', () => {
      const options: InitOptions = {
        name: 'MyGame',
        template: 'FirstPerson',
      };
      expect(options.template).toBe('FirstPerson');
    });

    it('can be constructed with directory option', () => {
      const options: InitOptions = {
        name: 'MyGame',
        directory: '/custom/path',
      };
      expect(options.directory).toBe('/custom/path');
    });

    it('can be constructed with force flag', () => {
      const options: InitOptions = {
        name: 'MyGame',
        force: true,
      };
      expect(options.force).toBe(true);
    });

    it('handles all project types', () => {
      const types: ProjectType[] = ['cpp', 'blueprint', 'blank'];

      types.forEach((type) => {
        const options: InitOptions = {
          name: 'MyGame',
          type: type,
        };
        expect(options.type).toBe(type);
      });
    });
  });

  describe('InitResult interface', () => {
    it('can be constructed for successful initialization', () => {
      const result: InitResult = {
        success: true,
        projectPath: '/projects/MyGame',
        uprojectPath: '/projects/MyGame/MyGame.uproject',
        engineAssociation: '5.3',
        createdFiles: [
          'MyGame.uproject',
          'Source/MyGame/MyGame.Build.cs',
          'Source/MyGame/MyGame.cpp',
        ],
      };

      expect(result.success).toBe(true);
      expect(result.projectPath).toBe('/projects/MyGame');
      expect(result.uprojectPath).toBe('/projects/MyGame/MyGame.uproject');
      expect(result.engineAssociation).toBe('5.3');
      expect(result.createdFiles).toHaveLength(3);
      expect(result.error).toBeUndefined();
    });

    it('can be constructed for failed initialization', () => {
      const result: InitResult = {
        success: false,
        projectPath: '',
        uprojectPath: '',
        engineAssociation: '',
        createdFiles: [],
        error: 'Project name is invalid',
      };

      expect(result.success).toBe(false);
      expect(result.createdFiles).toHaveLength(0);
      expect(result.error).toBe('Project name is invalid');
    });

    it('can be constructed for blueprint project', () => {
      const result: InitResult = {
        success: true,
        projectPath: '/projects/MyBlueprintGame',
        uprojectPath: '/projects/MyBlueprintGame/MyBlueprintGame.uproject',
        engineAssociation: '5.3',
        createdFiles: ['MyBlueprintGame.uproject', 'Config/DefaultEngine.ini'],
      };

      expect(result.createdFiles).not.toContain(expect.stringContaining('Source/'));
    });

    it('can be constructed for cpp project', () => {
      const result: InitResult = {
        success: true,
        projectPath: '/projects/MyCppGame',
        uprojectPath: '/projects/MyCppGame/MyCppGame.uproject',
        engineAssociation: '5.3',
        createdFiles: [
          'MyCppGame.uproject',
          'Source/MyCppGame/MyCppGame.Build.cs',
          'Source/MyCppGame/MyCppGame.cpp',
          'Source/MyCppGame/MyCppGame.h',
          'Source/MyCppGameEditor.Target.cs',
        ],
      };

      expect(result.createdFiles).toContain('Source/MyCppGame/MyCppGame.Build.cs');
      expect(result.createdFiles).toContain('Source/MyCppGameEditor.Target.cs');
    });

    it('handles empty created files list', () => {
      const result: InitResult = {
        success: false,
        projectPath: '/projects/Failed',
        uprojectPath: '',
        engineAssociation: '',
        createdFiles: [],
        error: 'Directory is not empty',
      };

      expect(result.createdFiles).toHaveLength(0);
    });

    it('handles engine association as GUID', () => {
      const result: InitResult = {
        success: true,
        projectPath: '/projects/MyGame',
        uprojectPath: '/projects/MyGame/MyGame.uproject',
        engineAssociation: '{12345678-1234-1234-1234-123456789012}',
        createdFiles: ['MyGame.uproject'],
      };

      expect(result.engineAssociation).toBe('{12345678-1234-1234-1234-123456789012}');
    });
  });
});
