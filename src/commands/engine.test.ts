import { EngineDetectionResult, EngineInstallation, EngineAssociation } from '../types/engine';
import { ProjectDetectionResult, ProjectInfo } from '../types/project';
import { CapturedWritable } from '../test-utils/capture-stream';
import { Command } from 'commander';

const mockResolveEngine = jest.fn<Promise<EngineDetectionResult>, [string | undefined]>();
const mockFindEngineInstallations = jest.fn<Promise<EngineInstallation[]>, []>();
const mockDetectProject = jest.fn<Promise<ProjectDetectionResult>, [unknown]>();

jest.mock('../core/engine-resolver', () => ({
  EngineResolver: {
    resolveEngine: (...args: [string | undefined]) => mockResolveEngine(...args),
    findEngineInstallations: () => mockFindEngineInstallations(),
  },
}));

jest.mock('../core/project-detector', () => ({
  ProjectDetector: {
    detectProject: (...args: [unknown]) => mockDetectProject(...args),
  },
}));

// Import after mocking
import { executeEngine, engineCommand } from './engine';

describe('executeEngine', () => {
  let stdout: CapturedWritable;
  let stderr: CapturedWritable;

  const createMockEngineInstallation = (): EngineInstallation => ({
    path: 'C:\\Program Files\\Epic Games\\UE_5.3',
    associationId: 'UE_5.3',
    displayName: 'UE 5.3',
    version: {
      MajorVersion: 5,
      MinorVersion: 3,
      PatchVersion: 2,
      Changelist: 29314046,
      CompatibleChangelist: 0,
      IsLicenseeVersion: 0,
      IsPromotedBuild: 1,
      BranchName: '++UE5+Release-5.3',
      BuildId: '27419083',
    },
    installedDate: '2024-01-15',
    source: 'launcher',
  });

  const createMockEngineAssociation = (): EngineAssociation => ({
    guid: 'UE_5.3',
    name: 'UE 5.3',
    path: 'C:\\Program Files\\Epic Games\\UE_5.3',
    version: '5.3',
  });

  const createMockEngineResult = (): EngineDetectionResult => ({
    engine: createMockEngineInstallation(),
    uprojectEngine: createMockEngineAssociation(),
    warnings: [],
  });

  const createMockProjectInfo = (): ProjectInfo => ({
    name: 'TestProject',
    path: 'C:\\Projects\\TestProject',
    uproject: {
      FileVersion: 3,
      EngineAssociation: 'UE_5.3',
      Category: 'Games',
      Description: 'Test Project',
      Modules: [],
      Plugins: [],
    },
    sourceDir: 'C:\\Projects\\TestProject\\Source',
    targets: [],
    modules: [],
  });

  beforeEach(() => {
    jest.clearAllMocks();
    stdout = new CapturedWritable();
    stderr = new CapturedWritable();
  });

  describe('basic engine detection', () => {
    it('detects engine for project in current directory by default', async () => {
      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: createMockProjectInfo(),
        warnings: [],
      });
      mockResolveEngine.mockResolvedValue(createMockEngineResult());

      await executeEngine({
        stdout,
        stderr,
      });

      expect(mockDetectProject).toHaveBeenCalledWith({
        cwd: expect.any(String),
      });
      expect(mockResolveEngine).toHaveBeenCalled();
    });

    it('uses provided project path when specified', async () => {
      mockDetectProject.mockResolvedValue({
        isValid: true,
        warnings: [],
      });
      mockResolveEngine.mockResolvedValue(createMockEngineResult());

      await executeEngine({
        project: 'C:\\Custom\\Project',
        stdout,
        stderr,
      });

      expect(mockDetectProject).toHaveBeenCalledWith({
        cwd: 'C:\\Custom\\Project',
      });
    });

    it('outputs engine information on success', async () => {
      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: createMockProjectInfo(),
        warnings: [],
      });
      mockResolveEngine.mockResolvedValue(createMockEngineResult());

      await executeEngine({
        stdout,
        stderr,
      });

      expect(stdout.output).toContain('Engine Information');
      expect(stdout.output).toContain('UE 5.3');
      expect(stdout.output).toContain('Engine Details');
    });
  });

  describe('json output', () => {
    it('outputs json when json flag is set', async () => {
      const engineResult = createMockEngineResult();

      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: createMockProjectInfo(),
        warnings: [],
      });
      mockResolveEngine.mockResolvedValue(engineResult);

      await executeEngine({
        json: true,
        stdout,
        stderr,
      });

      // Parse the JSON output to verify it's valid
      const output = stdout.output;
      expect(() => JSON.parse(output)).not.toThrow();
      const parsed = JSON.parse(output);
      expect(parsed.engine.displayName).toBe('UE 5.3');
      expect(parsed.uprojectEngine.guid).toBe('UE_5.3');
    });

    it('outputs only json without other formatting when json flag is set', async () => {
      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: createMockProjectInfo(),
        warnings: [],
      });
      mockResolveEngine.mockResolvedValue(createMockEngineResult());

      await executeEngine({
        json: true,
        stdout,
        stderr,
      });

      // Should be parseable JSON only
      const output = stdout.output;
      expect(() => JSON.parse(output)).not.toThrow();
    });
  });

  describe('verbose output', () => {
    it('shows all engine installations in verbose mode', async () => {
      const engines: EngineInstallation[] = [
        createMockEngineInstallation(),
        {
          ...createMockEngineInstallation(),
          path: 'C:\\Program Files\\Epic Games\\UE_5.4',
          associationId: 'UE_5.4',
          displayName: 'UE 5.4',
        },
      ];

      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: createMockProjectInfo(),
        warnings: [],
      });
      mockResolveEngine.mockResolvedValue(createMockEngineResult());
      mockFindEngineInstallations.mockResolvedValue(engines);

      await executeEngine({
        verbose: true,
        stdout,
        stderr,
      });

      expect(stdout.output).toContain('Engine Detection Details');
      expect(stdout.output).toContain('Total engines detected: 2');
      expect(stdout.output).toContain('UE_5.3');
      expect(stdout.output).toContain('UE_5.4');
    });

    it('handles no engine installations in verbose mode', async () => {
      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: createMockProjectInfo(),
        warnings: [],
      });
      mockResolveEngine.mockResolvedValue(createMockEngineResult());
      mockFindEngineInstallations.mockResolvedValue([]);

      await executeEngine({
        verbose: true,
        stdout,
        stderr,
      });

      expect(stdout.output).toContain('Total engines detected: 0');
    });

    it('shows unknown for engine without source in verbose mode', async () => {
      const minimalEngine: EngineInstallation = {
        path: 'C:\\Engine\\Custom',
        associationId: 'CustomBuild',
      };

      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: createMockProjectInfo(),
        warnings: [],
      });
      mockResolveEngine.mockResolvedValue(createMockEngineResult());
      mockFindEngineInstallations.mockResolvedValue([minimalEngine]);

      await executeEngine({
        verbose: true,
        stdout,
        stderr,
      });

      expect(stdout.output).toContain('Source: unknown');
      expect(stdout.output).toContain('Display Name: (none)');
    });
  });

  describe('error handling', () => {
    it('throws error when engine resolution fails', async () => {
      mockResolveEngine.mockResolvedValue({
        error: 'Failed to resolve engine',
        warnings: [],
      });

      await expect(
        executeEngine({
          stdout,
          stderr,
        })
      ).rejects.toThrow('Failed to resolve engine');
    });

    it('throws error on unexpected exception', async () => {
      mockDetectProject.mockRejectedValue(new Error('Unexpected error'));

      await expect(
        executeEngine({
          stdout,
          stderr,
        })
      ).rejects.toThrow('Unexpected error');
    });
  });

  describe('engine details display', () => {
    it('displays engine without version information', async () => {
      const engineWithoutVersion: EngineInstallation = {
        path: 'C:\\Custom\\Engine',
        associationId: '{12345678-1234-1234-1234-123456789012}',
        displayName: 'Custom Engine',
        source: 'registry',
      };

      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: createMockProjectInfo(),
        warnings: [],
      });
      mockResolveEngine.mockResolvedValue({
        engine: engineWithoutVersion,
        uprojectEngine: createMockEngineAssociation(),
        warnings: [],
      });

      await executeEngine({
        stdout,
        stderr,
      });

      expect(stdout.output).toContain('Custom Engine');
      expect(stdout.output).toContain('C:\\Custom\\Engine');
    });

    it('displays engine with installed date', async () => {
      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: createMockProjectInfo(),
        warnings: [],
      });
      mockResolveEngine.mockResolvedValue(createMockEngineResult());

      await executeEngine({
        stdout,
        stderr,
      });

      expect(stdout.output).toContain('2024-01-15');
    });

    it('falls back to associationId when displayName is absent', async () => {
      const engineWithoutName: EngineInstallation = {
        path: 'C:\\Engine',
        associationId: 'UE_5.3',
        version: {
          MajorVersion: 5,
          MinorVersion: 3,
          PatchVersion: 2,
          Changelist: 29314046,
          CompatibleChangelist: 0,
          IsLicenseeVersion: 0,
          IsPromotedBuild: 1,
          BranchName: '++UE5+Release-5.3',
          BuildId: '27419083',
        },
      };

      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: createMockProjectInfo(),
        warnings: [],
      });
      mockResolveEngine.mockResolvedValue({
        engine: engineWithoutName,
        uprojectEngine: createMockEngineAssociation(),
        warnings: [],
      });

      await executeEngine({
        stdout,
        stderr,
      });

      expect(stdout.output).toContain('UE_5.3');
    });

    it('displays No for non-promoted build', async () => {
      const nonPromotedEngine: EngineInstallation = {
        path: 'C:\\Engine',
        associationId: 'UE_5.3',
        displayName: 'UE 5.3',
        version: {
          MajorVersion: 5,
          MinorVersion: 3,
          PatchVersion: 2,
          Changelist: 29314046,
          CompatibleChangelist: 0,
          IsLicenseeVersion: 0,
          IsPromotedBuild: 0,
          BranchName: '++UE5+Release-5.3',
          BuildId: '27419083',
        },
      };

      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: createMockProjectInfo(),
        warnings: [],
      });
      mockResolveEngine.mockResolvedValue({
        engine: nonPromotedEngine,
        uprojectEngine: createMockEngineAssociation(),
        warnings: [],
      });

      await executeEngine({
        stdout,
        stderr,
      });

      expect(stdout.output).toContain('Promoted Build: No');
    });

    it('displays engine without installedDate', async () => {
      const engineNoDate: EngineInstallation = {
        path: 'C:\\Engine',
        associationId: 'UE_5.3',
        displayName: 'UE 5.3',
        version: {
          MajorVersion: 5,
          MinorVersion: 3,
          PatchVersion: 2,
          Changelist: 29314046,
          CompatibleChangelist: 0,
          IsLicenseeVersion: 0,
          IsPromotedBuild: 1,
          BranchName: '++UE5+Release-5.3',
          BuildId: '27419083',
        },
      };

      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: createMockProjectInfo(),
        warnings: [],
      });
      mockResolveEngine.mockResolvedValue({
        engine: engineNoDate,
        uprojectEngine: createMockEngineAssociation(),
        warnings: [],
      });

      await executeEngine({
        stdout,
        stderr,
      });

      expect(stdout.output).toContain('Engine Details');
      expect(stdout.output).toContain('UE 5.3');
    });
  });

  describe('project engine association display', () => {
    it('displays uproject engine association when available', async () => {
      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: createMockProjectInfo(),
        warnings: [],
      });
      mockResolveEngine.mockResolvedValue(createMockEngineResult());

      await executeEngine({
        stdout,
        stderr,
      });

      expect(stdout.output).toContain('Project Engine Association');
      expect(stdout.output).toContain('UE_5.3');
    });

    it('warns when engine association exists but no matching installation', async () => {
      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: createMockProjectInfo(),
        warnings: [],
      });
      mockResolveEngine.mockResolvedValue({
        engine: undefined,
        uprojectEngine: createMockEngineAssociation(),
        warnings: ['Engine not found'],
      });

      await executeEngine({
        stdout,
        stderr,
      });

      expect(stdout.output).toContain('Engine association found in project');
      expect(stdout.output).toContain('no matching engine installation detected');
    });

    it('displays uprojectEngine with only guid when optional fields are absent', async () => {
      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: createMockProjectInfo(),
        warnings: [],
      });
      mockResolveEngine.mockResolvedValue({
        engine: createMockEngineInstallation(),
        uprojectEngine: {
          guid: 'UE_5.3',
        },
        warnings: [],
      });

      await executeEngine({
        stdout,
        stderr,
      });

      expect(stdout.output).toContain('Project Engine Association');
      expect(stdout.output).toContain('UE_5.3');
      expect(stdout.output).toContain('Engine information retrieved successfully');
    });
  });

  describe('no engine found', () => {
    it('displays warning when no engine installation found', async () => {
      mockDetectProject.mockResolvedValue({
        isValid: true,
        warnings: [],
      });
      mockResolveEngine.mockResolvedValue({
        engine: undefined,
        uprojectEngine: undefined,
        warnings: [],
      });

      await executeEngine({
        stdout,
        stderr,
      });

      expect(stdout.output).toContain('No engine installation found');
    });
  });

  describe('warnings display', () => {
    it('displays warnings section when warnings exist', async () => {
      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: createMockProjectInfo(),
        warnings: [],
      });
      mockResolveEngine.mockResolvedValue({
        engine: createMockEngineInstallation(),
        uprojectEngine: createMockEngineAssociation(),
        warnings: ['Warning 1', 'Warning 2'],
      });

      await executeEngine({
        stdout,
        stderr,
      });

      expect(stdout.output).toContain('Warnings');
      expect(stdout.output).toContain('Warning 1');
      expect(stdout.output).toContain('Warning 2');
    });

    it('does not display warnings section when no warnings', async () => {
      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: createMockProjectInfo(),
        warnings: [],
      });
      mockResolveEngine.mockResolvedValue({
        engine: createMockEngineInstallation(),
        uprojectEngine: createMockEngineAssociation(),
        warnings: [],
      });

      await executeEngine({
        stdout,
        stderr,
      });

      // Should have success message
      expect(stdout.output).toContain('Engine information retrieved successfully');
    });
  });

  describe('project path resolution', () => {
    it('uses project path from detection result when available', async () => {
      const projectInfo = createMockProjectInfo();

      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: projectInfo,
        warnings: [],
      });
      mockResolveEngine.mockResolvedValue(createMockEngineResult());

      await executeEngine({
        project: 'C:\\Some\\Directory',
        stdout,
        stderr,
      });

      // Should use the detected project path, not the original directory
      expect(mockResolveEngine).toHaveBeenCalledWith(projectInfo.path);
    });

    it('falls back to original path when project detection returns no project', async () => {
      mockDetectProject.mockResolvedValue({
        isValid: true,
        warnings: [],
      });
      mockResolveEngine.mockResolvedValue(createMockEngineResult());

      await executeEngine({
        project: 'C:\\Some\\Directory',
        stdout,
        stderr,
      });

      expect(mockResolveEngine).toHaveBeenCalledWith('C:\\Some\\Directory');
    });
  });
});

describe('engineCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers the engine command with commander', () => {
    const program = new Command();
    engineCommand(program);

    const engineCmd = program.commands.find((cmd) => cmd.name() === 'engine');
    expect(engineCmd).toBeDefined();
    expect(engineCmd?.description()).toBe('Display engine information for the current project');
  });

  it('registers all expected options', () => {
    const program = new Command();
    engineCommand(program);

    const engineCmd = program.commands.find((cmd) => cmd.name() === 'engine');
    const options = engineCmd?.options || [];

    const optionFlags = options.map((opt) => opt.long);
    expect(optionFlags).toContain('--project');
    expect(optionFlags).toContain('--json');
    expect(optionFlags).toContain('--verbose');
  });

  it('registers short option flags', () => {
    const program = new Command();
    engineCommand(program);

    const engineCmd = program.commands.find((cmd) => cmd.name() === 'engine');
    const options = engineCmd?.options || [];

    const optionFlags = options.map((opt) => opt.short);
    expect(optionFlags).toContain('-p');
    expect(optionFlags).toContain('-j');
    expect(optionFlags).toContain('-v');
  });

  it('calls executeEngine with options on action', async () => {
    mockDetectProject.mockResolvedValue({
      isValid: true,
      project: {
        name: 'TestProject',
        path: 'C:\\Projects\\TestProject',
        uproject: {
          FileVersion: 3,
          EngineAssociation: '5.3',
          Category: 'Games',
          Description: '',
          Modules: [],
          Plugins: [],
        },
        sourceDir: 'C:\\Projects\\TestProject\\Source',
        targets: [],
        modules: [],
      },
      warnings: [],
    });
    mockResolveEngine.mockResolvedValue({
      engine: {
        path: 'C:\\Engine',
        associationId: '5.3',
        displayName: 'UE 5.3',
        source: 'launcher',
      },
      uprojectEngine: undefined,
      warnings: [],
    });

    const program = new Command();
    engineCommand(program);

    await program.parseAsync(['node', 'test', 'engine', '--project', 'C:\\Test']);

    expect(mockDetectProject).toHaveBeenCalled();
    expect(mockResolveEngine).toHaveBeenCalled();
  });

  it('passes json flag to executeEngine', async () => {
    mockDetectProject.mockResolvedValue({
      isValid: true,
      warnings: [],
    });
    mockResolveEngine.mockResolvedValue({
      engine: undefined,
      uprojectEngine: undefined,
      warnings: [],
    });

    const program = new Command();
    engineCommand(program);

    await program.parseAsync(['node', 'test', 'engine', '--json']);

    // JSON mode should call resolveEngine but not throw
    expect(mockResolveEngine).toHaveBeenCalled();
  });

  it('passes verbose flag to executeEngine', async () => {
    mockDetectProject.mockResolvedValue({
      isValid: true,
      project: {
        name: 'TestProject',
        path: 'C:\\Projects\\TestProject',
        uproject: {
          FileVersion: 3,
          EngineAssociation: '5.3',
          Category: 'Games',
          Description: '',
          Modules: [],
          Plugins: [],
        },
        sourceDir: 'C:\\Projects\\TestProject\\Source',
        targets: [],
        modules: [],
      },
      warnings: [],
    });
    mockResolveEngine.mockResolvedValue({
      engine: {
        path: 'C:\\Engine',
        associationId: '5.3',
        displayName: 'UE 5.3',
        source: 'launcher',
      },
      uprojectEngine: undefined,
      warnings: [],
    });
    mockFindEngineInstallations.mockResolvedValue([]);

    const program = new Command();
    engineCommand(program);

    await program.parseAsync(['node', 'test', 'engine', '--verbose']);

    expect(mockFindEngineInstallations).toHaveBeenCalled();
  });

  it('exits with error code 1 on engine command failure', async () => {
    mockDetectProject.mockRejectedValue(new Error('Engine resolution failed'));

    const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as (code?: string | number | null | undefined) => never);

    const program = new Command();
    engineCommand(program);

    await expect(program.parseAsync(['node', 'test', 'engine'])).rejects.toThrow(
      'process.exit called'
    );

    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });

  it('handles non-Error exceptions in command action', async () => {
    mockDetectProject.mockRejectedValue('String error message');

    const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as (code?: string | number | null | undefined) => never);

    const program = new Command();
    engineCommand(program);

    await expect(program.parseAsync(['node', 'test', 'engine'])).rejects.toThrow(
      'process.exit called'
    );

    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });
});
