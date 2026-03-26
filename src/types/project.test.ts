import {
  UProject,
  ProjectInfo,
  ProjectDetectionOptions,
  ProjectDetectionResult,
  ProjectPathResolution,
} from './project';

describe('Project Types', () => {
  describe('UProject interface', () => {
    it('can be constructed with minimal required properties', () => {
      const project: UProject = {
        FileVersion: 3,
        EngineAssociation: 'UE_5.3',
        Modules: [
          {
            Name: 'MyGame',
            Type: 'Runtime',
            LoadingPhase: 'Default',
          },
        ],
      };

      expect(project.FileVersion).toBe(3);
      expect(project.EngineAssociation).toBe('UE_5.3');
      expect(project.Modules).toHaveLength(1);
      expect(project.Category).toBeUndefined();
      expect(project.Description).toBeUndefined();
      expect(project.Plugins).toBeUndefined();
    });

    it('can be constructed with all properties', () => {
      const project: UProject = {
        FileVersion: 3,
        EngineAssociation: '5.3',
        Category: 'Games',
        Description: 'My awesome game',
        Modules: [
          {
            Name: 'MyGame',
            Type: 'Runtime',
            LoadingPhase: 'Default',
          },
          {
            Name: 'MyGameEditor',
            Type: 'Editor',
            LoadingPhase: 'PostConfigInit',
          },
        ],
        Plugins: [
          {
            Name: 'MyPlugin',
            Enabled: true,
          },
          {
            Name: 'OptionalPlugin',
            Enabled: false,
            TargetAllowList: ['Editor', 'Game'],
          },
        ],
      };

      expect(project.FileVersion).toBe(3);
      expect(project.EngineAssociation).toBe('5.3');
      expect(project.Category).toBe('Games');
      expect(project.Description).toBe('My awesome game');
      expect(project.Modules).toHaveLength(2);
      expect(project.Plugins).toHaveLength(2);
    });

    it('handles different module types', () => {
      const moduleTypes: Array<'Runtime' | 'Editor' | 'Developer' | 'Program' | 'Server'> = [
        'Runtime',
        'Editor',
        'Developer',
        'Program',
        'Server',
      ];

      const modules = moduleTypes.map((type) => ({
        Name: `Module${type}`,
        Type: type,
        LoadingPhase: 'Default' as const,
      }));

      const project: UProject = {
        FileVersion: 3,
        EngineAssociation: 'UE_5.3',
        Modules: modules,
      };

      expect(project.Modules).toHaveLength(5);
    });

    it('handles different loading phases', () => {
      const project: UProject = {
        FileVersion: 3,
        EngineAssociation: 'UE_5.3',
        Modules: [
          {
            Name: 'DefaultModule',
            Type: 'Runtime',
            LoadingPhase: 'Default',
          },
          {
            Name: 'PostConfigModule',
            Type: 'Runtime',
            LoadingPhase: 'PostConfigInit',
          },
          {
            Name: 'PreDefaultModule',
            Type: 'Runtime',
            LoadingPhase: 'PreDefault',
          },
          {
            Name: 'CustomModule',
            Type: 'Runtime',
            LoadingPhase: 'CustomPhase',
          },
        ],
      };

      expect(project.Modules).toHaveLength(4);
    });

    it('handles GUID-based engine association', () => {
      const project: UProject = {
        FileVersion: 3,
        EngineAssociation: '{12345678-1234-1234-1234-123456789012}',
        Modules: [
          {
            Name: 'MyGame',
            Type: 'Runtime',
            LoadingPhase: 'Default',
          },
        ],
      };

      expect(project.EngineAssociation).toBe('{12345678-1234-1234-1234-123456789012}');
    });

    it('handles plugins with target allow list', () => {
      const project: UProject = {
        FileVersion: 3,
        EngineAssociation: 'UE_5.3',
        Modules: [
          {
            Name: 'MyGame',
            Type: 'Runtime',
            LoadingPhase: 'Default',
          },
        ],
        Plugins: [
          {
            Name: 'EditorOnlyPlugin',
            Enabled: true,
            TargetAllowList: ['Editor'],
          },
        ],
      };

      expect(project.Plugins?.[0].TargetAllowList).toEqual(['Editor']);
    });
  });

  describe('ProjectInfo interface', () => {
    it('can be constructed with all required properties', () => {
      const uproject: UProject = {
        FileVersion: 3,
        EngineAssociation: 'UE_5.3',
        Modules: [
          {
            Name: 'MyGame',
            Type: 'Runtime',
            LoadingPhase: 'Default',
          },
        ],
      };

      const info: ProjectInfo = {
        name: 'MyGame',
        path: 'C:/Projects/MyGame',
        uproject: uproject,
        sourceDir: 'C:/Projects/MyGame/Source',
        targets: [
          {
            name: 'MyGameEditor',
            type: 'Editor',
            path: 'C:/Projects/MyGame/Source/MyGameEditor.Target.cs',
          },
        ],
        modules: [
          {
            name: 'MyGame',
            path: 'C:/Projects/MyGame/Source/MyGame',
          },
        ],
      };

      expect(info.name).toBe('MyGame');
      expect(info.path).toBe('C:/Projects/MyGame');
      expect(info.uproject).toEqual(uproject);
      expect(info.sourceDir).toBe('C:/Projects/MyGame/Source');
      expect(info.targets).toHaveLength(1);
      expect(info.modules).toHaveLength(1);
    });

    it('handles project without source directory (blueprint project)', () => {
      const uproject: UProject = {
        FileVersion: 3,
        EngineAssociation: 'UE_5.3',
        Modules: [],
      };

      const info: ProjectInfo = {
        name: 'MyBlueprintGame',
        path: 'C:/Projects/MyBlueprintGame',
        uproject: uproject,
        sourceDir: '',
        targets: [],
        modules: [],
      };

      expect(info.sourceDir).toBe('');
      expect(info.targets).toHaveLength(0);
      expect(info.modules).toHaveLength(0);
    });

    it('handles project with multiple targets', () => {
      const uproject: UProject = {
        FileVersion: 3,
        EngineAssociation: 'UE_5.3',
        Modules: [],
      };

      const info: ProjectInfo = {
        name: 'MyGame',
        path: 'C:/Projects/MyGame',
        uproject: uproject,
        sourceDir: 'C:/Projects/MyGame/Source',
        targets: [
          {
            name: 'MyGameEditor',
            type: 'Editor',
            path: 'C:/Projects/MyGame/Source/MyGameEditor.Target.cs',
          },
          {
            name: 'MyGame',
            type: 'Game',
            path: 'C:/Projects/MyGame/Source/MyGame.Target.cs',
          },
          {
            name: 'MyGameServer',
            type: 'Server',
            path: 'C:/Projects/MyGame/Source/MyGameServer.Target.cs',
          },
        ],
        modules: [],
      };

      expect(info.targets).toHaveLength(3);
      expect(info.targets[0].type).toBe('Editor');
      expect(info.targets[1].type).toBe('Game');
      expect(info.targets[2].type).toBe('Server');
    });

    it('handles project with multiple modules', () => {
      const uproject: UProject = {
        FileVersion: 3,
        EngineAssociation: 'UE_5.3',
        Modules: [],
      };

      const info: ProjectInfo = {
        name: 'MyGame',
        path: 'C:/Projects/MyGame',
        uproject: uproject,
        sourceDir: 'C:/Projects/MyGame/Source',
        targets: [],
        modules: [
          {
            name: 'MyGame',
            path: 'C:/Projects/MyGame/Source/MyGame',
          },
          {
            name: 'MyGameCore',
            path: 'C:/Projects/MyGame/Source/MyGameCore',
          },
          {
            name: 'MyGameUI',
            path: 'C:/Projects/MyGame/Source/MyGameUI',
          },
        ],
      };

      expect(info.modules).toHaveLength(3);
    });
  });

  describe('ProjectDetectionOptions interface', () => {
    it('can be constructed with minimal properties', () => {
      const options: ProjectDetectionOptions = {};
      expect(options).toBeDefined();
    });

    it('can be constructed with all properties', () => {
      const options: ProjectDetectionOptions = {
        cwd: '/projects',
        recursive: true,
      };

      expect(options.cwd).toBe('/projects');
      expect(options.recursive).toBe(true);
    });

    it('can be constructed with only cwd', () => {
      const options: ProjectDetectionOptions = {
        cwd: '/projects',
      };
      expect(options.cwd).toBe('/projects');
      expect(options.recursive).toBeUndefined();
    });

    it('can be constructed with only recursive flag', () => {
      const options: ProjectDetectionOptions = {
        recursive: true,
      };
      expect(options.recursive).toBe(true);
      expect(options.cwd).toBeUndefined();
    });
  });

  describe('ProjectDetectionResult interface', () => {
    it('can be constructed for valid detection', () => {
      const uproject: UProject = {
        FileVersion: 3,
        EngineAssociation: 'UE_5.3',
        Modules: [],
      };

      const info: ProjectInfo = {
        name: 'MyGame',
        path: 'C:/Projects/MyGame',
        uproject: uproject,
        sourceDir: 'C:/Projects/MyGame/Source',
        targets: [],
        modules: [],
      };

      const result: ProjectDetectionResult = {
        isValid: true,
        project: info,
        warnings: [],
      };

      expect(result.isValid).toBe(true);
      expect(result.project).toEqual(info);
      expect(result.warnings).toHaveLength(0);
      expect(result.error).toBeUndefined();
    });

    it('can be constructed for invalid detection', () => {
      const result: ProjectDetectionResult = {
        isValid: false,
        warnings: [],
        error: 'No .uproject file found',
      };

      expect(result.isValid).toBe(false);
      expect(result.project).toBeUndefined();
      expect(result.error).toBe('No .uproject file found');
    });

    it('can be constructed with warnings', () => {
      const uproject: UProject = {
        FileVersion: 3,
        EngineAssociation: 'UE_5.3',
        Modules: [],
      };

      const info: ProjectInfo = {
        name: 'MyGame',
        path: 'C:/Projects/MyGame',
        uproject: uproject,
        sourceDir: '',
        targets: [],
        modules: [],
      };

      const result: ProjectDetectionResult = {
        isValid: true,
        project: info,
        warnings: [
          'No Source directory found - Blueprint project?',
          'Multiple .uproject files found in subdirectories',
        ],
      };

      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(2);
    });
  });

  describe('ProjectPathResolution interface', () => {
    it('can be constructed for directory resolved to uproject', () => {
      const resolution: ProjectPathResolution = {
        inputPath: './MyProject',
        resolvedPath: 'C:/Projects/MyProject/MyProject.uproject',
        isDirectory: false,
        wasResolvedFromDirectory: true,
        hasUProjectExtension: true,
      };

      expect(resolution.inputPath).toBe('./MyProject');
      expect(resolution.resolvedPath).toBe('C:/Projects/MyProject/MyProject.uproject');
      expect(resolution.isDirectory).toBe(false);
      expect(resolution.wasResolvedFromDirectory).toBe(true);
      expect(resolution.hasUProjectExtension).toBe(true);
    });

    it('can be constructed for direct uproject file path', () => {
      const resolution: ProjectPathResolution = {
        inputPath: './MyProject/MyProject.uproject',
        resolvedPath: 'C:/Projects/MyProject/MyProject.uproject',
        isDirectory: false,
        wasResolvedFromDirectory: false,
        hasUProjectExtension: true,
      };

      expect(resolution.wasResolvedFromDirectory).toBe(false);
      expect(resolution.hasUProjectExtension).toBe(true);
    });

    it('can be constructed for directory path', () => {
      const resolution: ProjectPathResolution = {
        inputPath: './Projects',
        resolvedPath: 'C:/Projects',
        isDirectory: true,
        wasResolvedFromDirectory: false,
        hasUProjectExtension: false,
      };

      expect(resolution.isDirectory).toBe(true);
      expect(resolution.hasUProjectExtension).toBe(false);
    });

    it('can be constructed for path without uproject extension', () => {
      const resolution: ProjectPathResolution = {
        inputPath: './MyProject/project',
        resolvedPath: 'C:/Projects/MyProject/project',
        isDirectory: false,
        wasResolvedFromDirectory: false,
        hasUProjectExtension: false,
      };

      expect(resolution.hasUProjectExtension).toBe(false);
    });
  });
});
