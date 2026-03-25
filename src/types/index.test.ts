import type {
  // Build types
  BuildTarget,
  BuildConfiguration,
  BuildPlatform,
  BuildOptions,
  BuildResult,
  // Engine types
  EngineVersionInfo,
  EngineInstallation,
  EngineAssociation,
  EngineDetectionResult,
  EnginePathResolutionOptions,
  // Generate types
  IDE,
  GenerateOptions,
  GenerateResult,
  // Init types
  ProjectType,
  InitOptions,
  InitResult,
  // Project types
  UProject,
  ProjectInfo,
  ProjectDetectionOptions,
  ProjectDetectionResult,
  ProjectPathResolution,
} from './index';
import { BUILD_TARGETS, BUILD_CONFIGS, BUILD_PLATFORMS } from './index';

describe('Type Exports', () => {
  describe('Build types', () => {
    it('exports BUILD_TARGETS constant with correct values', () => {
      expect(BUILD_TARGETS).toEqual(['Editor', 'Game', 'Client', 'Server']);
    });

    it('exports BUILD_CONFIGS constant with correct values', () => {
      expect(BUILD_CONFIGS).toEqual(['Debug', 'DebugGame', 'Development', 'Shipping', 'Test']);
    });

    it('exports BUILD_PLATFORMS constant with correct values', () => {
      expect(BUILD_PLATFORMS).toEqual(['Win64', 'Win32', 'Linux', 'Mac', 'Android', 'IOS']);
    });

    it('BuildTarget type accepts valid targets', () => {
      const validTargets: BuildTarget[] = ['Editor', 'Game', 'Client', 'Server'];
      expect(validTargets).toHaveLength(4);
    });

    it('BuildConfiguration type accepts valid configurations', () => {
      const validConfigs: BuildConfiguration[] = [
        'Debug',
        'DebugGame',
        'Development',
        'Shipping',
        'Test',
      ];
      expect(validConfigs).toHaveLength(5);
    });

    it('BuildPlatform type accepts valid platforms', () => {
      const validPlatforms: BuildPlatform[] = ['Win64', 'Win32', 'Linux', 'Mac', 'Android', 'IOS'];
      expect(validPlatforms).toHaveLength(6);
    });

    it('BuildTarget type accepts valid targets', () => {
      const targets: BuildTarget[] = ['Editor', 'Game', 'Client', 'Server'];
      expect(targets).toContain('Editor');
      expect(targets).toContain('Game');
    });

    it('BuildOptions interface can be constructed with all properties', () => {
      const options: BuildOptions = {
        target: 'Editor',
        config: 'Development',
        platform: 'Win64',
        projectPath: '/path/to/project',
        enginePath: '/path/to/engine',
        clean: true,
        verbose: true,
        additionalArgs: ['-arg1', '-arg2'],
        silent: false,
      };

      expect(options.target).toBe('Editor');
      expect(options.config).toBe('Development');
      expect(options.platform).toBe('Win64');
      expect(options.clean).toBe(true);
    });

    it('BuildOptions interface can be constructed with minimal properties', () => {
      const options: BuildOptions = {};
      expect(Object.keys(options)).toHaveLength(0);
    });

    it('BuildResult interface has all required properties', () => {
      const result: BuildResult = {
        success: true,
        exitCode: 0,
        stdout: 'build output',
        stderr: '',
        duration: 12345,
      };

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.duration).toBe(12345);
    });

    it('BuildResult interface accepts error property', () => {
      const result: BuildResult = {
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: 'error output',
        duration: 1000,
        error: 'Build failed',
      };

      expect(result.error).toBe('Build failed');
    });
  });

  describe('Engine types', () => {
    it('EngineVersionInfo interface has all required properties', () => {
      const version: EngineVersionInfo = {
        MajorVersion: 5,
        MinorVersion: 3,
        PatchVersion: 2,
        Changelist: 12345,
        CompatibleChangelist: 12340,
        IsLicenseeVersion: 0,
        IsPromotedBuild: 1,
        BranchName: '++UE5+Release-5.3',
        BuildId: '5.3.2-12345+++UE5+Release-5.3',
      };

      expect(version.MajorVersion).toBe(5);
      expect(version.MinorVersion).toBe(3);
      expect(version.BuildId).toContain('5.3');
    });

    it('EngineInstallation interface has required and optional properties', () => {
      const engine: EngineInstallation = {
        path: 'C:/Program Files/Epic Games/UE_5.3',
        associationId: '{12345678-1234-1234-1234-123456789012}',
        displayName: 'UE 5.3',
        source: 'launcher',
      };

      expect(engine.path).toContain('UE_5.3');
      expect(engine.source).toBe('launcher');
    });

    it('EngineInstallation accepts all source types', () => {
      const sources: Array<EngineInstallation['source']> = [
        'registry',
        'launcher',
        'environment',
        undefined,
      ];

      expect(sources).toContain('registry');
      expect(sources).toContain('launcher');
      expect(sources).toContain('environment');
    });

    it('EngineAssociation interface accepts minimal properties', () => {
      const association: EngineAssociation = {
        guid: '{12345678-1234-1234-1234-123456789012}',
      };

      expect(association.guid).toContain('1234');
    });

    it('EngineDetectionResult interface accepts success state', () => {
      const result: EngineDetectionResult = {
        engine: {
          path: 'C:/UE_5.3',
          associationId: 'UE_5.3',
        },
        warnings: [],
      };

      expect(result.engine).toBeDefined();
      expect(result.warnings).toEqual([]);
    });

    it('EngineDetectionResult interface accepts error state', () => {
      const result: EngineDetectionResult = {
        error: 'Engine not found',
        warnings: ['Multiple engines detected'],
      };

      expect(result.error).toBe('Engine not found');
      expect(result.warnings).toHaveLength(1);
    });

    it('EnginePathResolutionOptions interface is flexible', () => {
      const options: EnginePathResolutionOptions = {};
      expect(Object.keys(options)).toHaveLength(0);

      const fullOptions: EnginePathResolutionOptions = {
        projectPath: '/project',
        enginePath: '/engine',
      };
      expect(fullOptions.projectPath).toBe('/project');
    });
  });

  describe('Generate types', () => {
    it('IDE type accepts all valid IDE values', () => {
      const ides: IDE[] = ['sln', 'vscode', 'clion', 'xcode', 'vs2022'];
      expect(ides).toHaveLength(5);
      expect(ides).toContain('vscode');
      expect(ides).toContain('clion');
    });

    it('GenerateOptions interface accepts minimal properties', () => {
      const options: GenerateOptions = {};
      expect(Object.keys(options)).toHaveLength(0);
    });

    it('GenerateOptions interface accepts all properties', () => {
      const options: GenerateOptions = {
        ide: 'vscode',
        projectPath: '/path/to/project',
        enginePath: '/path/to/engine',
        force: true,
      };

      expect(options.ide).toBe('vscode');
      expect(options.force).toBe(true);
    });

    it('GenerateResult interface accepts success state', () => {
      const result: GenerateResult = {
        success: true,
        generatedFiles: ['project.sln', '.vscode/tasks.json'],
      };

      expect(result.success).toBe(true);
      expect(result.generatedFiles).toHaveLength(2);
    });

    it('GenerateResult interface accepts error state', () => {
      const result: GenerateResult = {
        success: false,
        generatedFiles: [],
        error: 'Generation failed',
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe('Generation failed');
    });
  });

  describe('Init types', () => {
    it('ProjectType accepts all valid types', () => {
      const types: ProjectType[] = ['cpp', 'blueprint', 'blank'];
      expect(types).toHaveLength(3);
      expect(types).toContain('cpp');
      expect(types).toContain('blueprint');
    });

    it('InitOptions requires name property', () => {
      const options: InitOptions = {
        name: 'MyProject',
      };

      expect(options.name).toBe('MyProject');
    });

    it('InitOptions accepts all optional properties', () => {
      const options: InitOptions = {
        name: 'MyProject',
        type: 'cpp',
        template: 'FirstPerson',
        enginePath: '/path/to/engine',
        directory: '/path/to/output',
        force: true,
      };

      expect(options.name).toBe('MyProject');
      expect(options.type).toBe('cpp');
      expect(options.template).toBe('FirstPerson');
    });

    it('InitResult interface accepts success state', () => {
      const result: InitResult = {
        success: true,
        projectPath: '/path/to/MyProject',
        uprojectPath: '/path/to/MyProject/MyProject.uproject',
        engineAssociation: 'UE_5.3',
        createdFiles: ['MyProject.uproject', 'Source/MyProject/MyProject.Build.cs'],
      };

      expect(result.success).toBe(true);
      expect(result.createdFiles).toHaveLength(2);
    });

    it('InitResult interface accepts error state', () => {
      const result: InitResult = {
        success: false,
        projectPath: '',
        uprojectPath: '',
        engineAssociation: '',
        createdFiles: [],
        error: 'Project already exists',
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe('Project already exists');
    });
  });

  describe('Project types', () => {
    it('UProject interface accepts valid project structure', () => {
      const project: UProject = {
        FileVersion: 3,
        EngineAssociation: 'UE_5.3',
        Category: 'Games',
        Description: 'My test project',
        Modules: [
          {
            Name: 'MyProject',
            Type: 'Runtime',
            LoadingPhase: 'Default',
          },
        ],
        Plugins: [
          {
            Name: 'MyPlugin',
            Enabled: true,
          },
        ],
      };

      expect(project.FileVersion).toBe(3);
      expect(project.Modules).toHaveLength(1);
      expect(project.Plugins).toHaveLength(1);
    });

    it('UProject accepts minimal required properties', () => {
      const project: UProject = {
        FileVersion: 3,
        EngineAssociation: '{12345678-1234-1234-1234-123456789012}',
        Modules: [],
      };

      expect(project.FileVersion).toBe(3);
      expect(project.Modules).toEqual([]);
    });

    it('ProjectInfo interface accepts valid project info', () => {
      const info: ProjectInfo = {
        name: 'MyProject',
        path: 'C:/Projects/MyProject',
        uproject: {
          FileVersion: 3,
          EngineAssociation: 'UE_5.3',
          Modules: [],
        },
        sourceDir: 'C:/Projects/MyProject/Source',
        targets: [
          {
            name: 'MyProjectEditor',
            type: 'Editor',
            path: 'C:/Projects/MyProject/Source/MyProjectEditor.Target.cs',
          },
        ],
        modules: [
          {
            name: 'MyProject',
            path: 'C:/Projects/MyProject/Source/MyProject',
          },
        ],
      };

      expect(info.name).toBe('MyProject');
      expect(info.targets).toHaveLength(1);
      expect(info.modules).toHaveLength(1);
    });

    it('ProjectDetectionOptions accepts empty object', () => {
      const options: ProjectDetectionOptions = {};
      expect(Object.keys(options)).toHaveLength(0);
    });

    it('ProjectDetectionOptions accepts all properties', () => {
      const options: ProjectDetectionOptions = {
        cwd: '/working/dir',
        recursive: true,
      };

      expect(options.cwd).toBe('/working/dir');
      expect(options.recursive).toBe(true);
    });

    it('ProjectDetectionResult accepts valid detection', () => {
      const result: ProjectDetectionResult = {
        isValid: true,
        project: {
          name: 'Test',
          path: '/test',
          uproject: {
            FileVersion: 3,
            EngineAssociation: 'UE_5.3',
            Modules: [],
          },
          sourceDir: '/test/Source',
          targets: [],
          modules: [],
        },
        warnings: [],
      };

      expect(result.isValid).toBe(true);
      expect(result.project).toBeDefined();
    });

    it('ProjectDetectionResult accepts invalid detection', () => {
      const result: ProjectDetectionResult = {
        isValid: false,
        error: 'No .uproject file found',
        warnings: ['Directory is empty'],
      };

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('No .uproject file found');
    });

    it('ProjectPathResolution interface has all required properties', () => {
      const resolution: ProjectPathResolution = {
        inputPath: './MyProject',
        resolvedPath: 'C:/Projects/MyProject/MyProject.uproject',
        isDirectory: false,
        wasResolvedFromDirectory: true,
        hasUProjectExtension: true,
      };

      expect(resolution.inputPath).toBe('./MyProject');
      expect(resolution.wasResolvedFromDirectory).toBe(true);
      expect(resolution.hasUProjectExtension).toBe(true);
    });
  });
});
