import { Command } from 'commander';
import { CapturedWritable } from '../test-utils/capture-stream';
import { InitResult } from '../types/init';
import { EngineInstallation } from '../types/engine';

const mockInitialize = jest.fn<Promise<InitResult>, [unknown]>();
const mockIsValidProjectName = jest.fn<boolean, [string]>();
const mockIsValidProjectType = jest.fn<boolean, [string]>();
const mockFindEngineInstallations = jest.fn<Promise<EngineInstallation[]>, []>();

jest.mock('../core/project-initializer', () => ({
  ProjectInitializer: {
    initialize: (...args: [unknown]) => mockInitialize(...args),
  },
}));

jest.mock('../utils/validator', () => ({
  Validator: {
    isValidProjectName: (...args: [string]) => mockIsValidProjectName(...args),
    isValidProjectType: (...args: [string]) => mockIsValidProjectType(...args),
  },
}));

jest.mock('../core/engine-resolver', () => ({
  EngineResolver: {
    findEngineInstallations: () => mockFindEngineInstallations(),
  },
}));

// Import after mocking
import { executeInit, initCommand, InitCommandOptions } from './init';

describe('executeInit', () => {
  let stdout: CapturedWritable;
  let stderr: CapturedWritable;

  const createMockInitResult = (overrides: Partial<InitResult> = {}): InitResult => ({
    success: true,
    projectPath: 'C:\\Projects\\TestProject',
    uprojectPath: 'C:\\Projects\\TestProject\\TestProject.uproject',
    engineAssociation: '5.3',
    createdFiles: [
      'C:\\Projects\\TestProject\\TestProject.uproject',
      'C:\\Projects\\TestProject\\Config',
    ],
    ...overrides,
  });

  const createOptions = (overrides: Partial<InitCommandOptions> = {}): InitCommandOptions => ({
    name: 'TestProject',
    type: 'cpp',
    template: 'Basic',
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    stdout = new CapturedWritable();
    stderr = new CapturedWritable();
    mockIsValidProjectName.mockReturnValue(true);
    mockIsValidProjectType.mockReturnValue(true);
  });

  describe('project name validation', () => {
    it('rejects invalid project names', async () => {
      mockIsValidProjectName.mockReturnValue(false);

      await expect(
        executeInit(
          createOptions({
            name: 'Invalid@Name',
            stdout,
            stderr,
          })
        )
      ).rejects.toThrow('Invalid project name');

      expect(stderr.output).toContain('Invalid project name');
      expect(mockInitialize).not.toHaveBeenCalled();
    });

    it('accepts valid project names', async () => {
      mockInitialize.mockResolvedValue(createMockInitResult());

      await executeInit(
        createOptions({
          name: 'ValidProject',
          stdout,
          stderr,
        })
      );

      expect(mockInitialize).toHaveBeenCalled();
    });

    it('shows helpful message for invalid project name', async () => {
      mockIsValidProjectName.mockReturnValue(false);

      await expect(
        executeInit(
          createOptions({
            name: 'Test@123',
            stdout,
            stderr,
          })
        )
      ).rejects.toThrow();

      expect(stdout.output).toContain('a-z, A-Z, 0-9, _, -');
    });
  });

  describe('project type validation', () => {
    it('rejects invalid project types', async () => {
      mockIsValidProjectType.mockReturnValue(false);

      await expect(
        executeInit(
          createOptions({
            type: 'invalid-type' as 'cpp',
            stdout,
            stderr,
          })
        )
      ).rejects.toThrow('Invalid project type');

      expect(stderr.output).toContain('Invalid project type');
      expect(mockInitialize).not.toHaveBeenCalled();
    });

    it('accepts cpp project type', async () => {
      mockInitialize.mockResolvedValue(createMockInitResult());

      await executeInit(
        createOptions({
          type: 'cpp',
          stdout,
          stderr,
        })
      );

      expect(mockInitialize).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'cpp',
        })
      );
    });

    it('accepts blueprint project type', async () => {
      mockInitialize.mockResolvedValue(createMockInitResult());

      await executeInit(
        createOptions({
          type: 'blueprint',
          stdout,
          stderr,
        })
      );

      expect(mockInitialize).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'blueprint',
        })
      );
    });

    it('accepts blank project type', async () => {
      mockInitialize.mockResolvedValue(createMockInitResult());

      await executeInit(
        createOptions({
          type: 'blank',
          stdout,
          stderr,
        })
      );

      expect(mockInitialize).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'blank',
        })
      );
    });

    it('shows helpful message for invalid project type', async () => {
      mockIsValidProjectType.mockReturnValue(false);

      await expect(
        executeInit(
          createOptions({
            type: 'invalid' as 'cpp',
            stdout,
            stderr,
          })
        )
      ).rejects.toThrow();

      expect(stdout.output).toContain('Valid types: cpp, blueprint, blank');
    });
  });

  describe('dry run mode', () => {
    it('shows dry run preview without creating project', async () => {
      const result = await executeInit(
        createOptions({
          dryRun: true,
          stdout,
          stderr,
        })
      );

      expect(mockInitialize).not.toHaveBeenCalled();
      expect(stdout.output).toContain('Dry Run');
      expect(result.success).toBe(true);
    });

    it('displays project configuration in dry run', async () => {
      await executeInit(
        createOptions({
          name: 'MyGame',
          type: 'cpp',
          template: 'FirstPerson',
          dryRun: true,
          stdout,
          stderr,
        })
      );

      expect(stdout.output).toContain('MyGame');
      expect(stdout.output).toContain('cpp');
      expect(stdout.output).toContain('FirstPerson');
    });

    it('shows file structure preview in dry run', async () => {
      await executeInit(
        createOptions({
          name: 'TestProject',
          type: 'cpp',
          dryRun: true,
          stdout,
          stderr,
        })
      );

      expect(stdout.output).toContain('What would be created');
      expect(stdout.output).toContain('TestProject.uproject');
      expect(stdout.output).toContain('Config/');
      expect(stdout.output).toContain('Source/');
    });

    it('shows Content directory for blueprint projects in dry run', async () => {
      await executeInit(
        createOptions({
          name: 'BPProject',
          type: 'blueprint',
          dryRun: true,
          stdout,
          stderr,
        })
      );

      expect(stdout.output).toContain('Content/');
      // Should not show Source/ for blueprint projects
      expect(stdout.output).not.toContain('Source/');
    });
  });

  describe('successful initialization', () => {
    it('outputs success message on successful init', async () => {
      mockInitialize.mockResolvedValue(createMockInitResult());

      await executeInit(createOptions({ stdout, stderr }));

      expect(stdout.output).toContain('initialized successfully');
    });

    it('displays project structure for C++ projects', async () => {
      mockInitialize.mockResolvedValue(createMockInitResult());

      await executeInit(
        createOptions({
          type: 'cpp',
          name: 'MyGame',
          stdout,
          stderr,
        })
      );

      expect(stdout.output).toContain('Project Structure');
      expect(stdout.output).toContain('MyGame.uproject');
      expect(stdout.output).toContain('Source/');
      expect(stdout.output).toContain('MyGame.Target.cs');
      expect(stdout.output).toContain('MyGameEditor.Target.cs');
    });

    it('displays simplified structure for Blueprint projects', async () => {
      mockInitialize.mockResolvedValue(
        createMockInitResult({
          projectPath: 'C:\\Projects\\BPProject',
        })
      );

      await executeInit(
        createOptions({
          type: 'blueprint',
          name: 'BPProject',
          stdout,
          stderr,
        })
      );

      expect(stdout.output).toContain('Content/');
      expect(stdout.output).not.toContain('Source/');
    });

    it('shows next steps for C++ projects', async () => {
      mockInitialize.mockResolvedValue(createMockInitResult());

      await executeInit(
        createOptions({
          type: 'cpp',
          stdout,
          stderr,
        })
      );

      expect(stdout.output).toContain('Next Steps');
      expect(stdout.output).toContain('ubuild generate');
      expect(stdout.output).toContain('ubuild build');
    });

    it('shows simplified next steps for Blueprint projects', async () => {
      mockInitialize.mockResolvedValue(createMockInitResult());

      await executeInit(
        createOptions({
          type: 'blueprint',
          stdout,
          stderr,
        })
      );

      expect(stdout.output).toContain('Next Steps');
      expect(stdout.output).toContain('Double-click');
      expect(stdout.output).toContain('Blueprints');
    });

    it('displays project location and engine association', async () => {
      mockInitialize.mockResolvedValue(
        createMockInitResult({
          projectPath: 'C:\\Projects\\TestProject',
          engineAssociation: '5.3',
        })
      );

      await executeInit(createOptions({ stdout, stderr }));

      expect(stdout.output).toContain('C:\\Projects\\TestProject');
      expect(stdout.output).toContain('5.3');
    });

    it('returns the init result on success', async () => {
      const expectedResult = createMockInitResult({
        projectPath: 'C:\\Custom\\Path',
      });
      mockInitialize.mockResolvedValue(expectedResult);

      const result = await executeInit(
        createOptions({
          directory: 'C:\\Custom\\Path',
          stdout,
          stderr,
        })
      );

      expect(result).toEqual(expectedResult);
    });
  });

  describe('error handling', () => {
    it('throws error when initialization fails', async () => {
      mockInitialize.mockResolvedValue({
        success: false,
        projectPath: '',
        uprojectPath: '',
        engineAssociation: '',
        createdFiles: [],
        error: 'Engine not found',
      });

      await expect(executeInit(createOptions({ stdout, stderr }))).rejects.toThrow(
        'Engine not found'
      );

      expect(stderr.output).toContain('Engine not found');
    });

    it('throws error with default message when error is empty', async () => {
      mockInitialize.mockResolvedValue({
        success: false,
        projectPath: '',
        uprojectPath: '',
        engineAssociation: '',
        createdFiles: [],
      });

      await expect(executeInit(createOptions({ stdout, stderr }))).rejects.toThrow(
        'Project initialization failed'
      );
    });
  });

  describe('option passing', () => {
    it('passes name to ProjectInitializer', async () => {
      mockInitialize.mockResolvedValue(createMockInitResult());

      await executeInit(
        createOptions({
          name: 'MyAwesomeGame',
          stdout,
          stderr,
        })
      );

      expect(mockInitialize).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'MyAwesomeGame',
        })
      );
    });

    it('passes type to ProjectInitializer', async () => {
      mockInitialize.mockResolvedValue(createMockInitResult());

      await executeInit(
        createOptions({
          type: 'blueprint',
          stdout,
          stderr,
        })
      );

      expect(mockInitialize).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'blueprint',
        })
      );
    });

    it('passes template to ProjectInitializer', async () => {
      mockInitialize.mockResolvedValue(createMockInitResult());

      await executeInit(
        createOptions({
          template: 'ThirdPerson',
          stdout,
          stderr,
        })
      );

      expect(mockInitialize).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'ThirdPerson',
        })
      );
    });

    it('passes enginePath to ProjectInitializer', async () => {
      mockInitialize.mockResolvedValue(createMockInitResult());

      await executeInit(
        createOptions({
          enginePath: 'C:\\Engines\\UE_5.3',
          stdout,
          stderr,
        })
      );

      expect(mockInitialize).toHaveBeenCalledWith(
        expect.objectContaining({
          enginePath: 'C:\\Engines\\UE_5.3',
        })
      );
    });

    it('passes directory to ProjectInitializer', async () => {
      mockInitialize.mockResolvedValue(createMockInitResult());

      await executeInit(
        createOptions({
          directory: 'C:\\Projects\\CustomDir',
          stdout,
          stderr,
        })
      );

      expect(mockInitialize).toHaveBeenCalledWith(
        expect.objectContaining({
          directory: 'C:\\Projects\\CustomDir',
        })
      );
    });

    it('passes force flag to ProjectInitializer', async () => {
      mockInitialize.mockResolvedValue(createMockInitResult());

      await executeInit(
        createOptions({
          force: true,
          stdout,
          stderr,
        })
      );

      expect(mockInitialize).toHaveBeenCalledWith(
        expect.objectContaining({
          force: true,
        })
      );
    });

    it('defaults type to cpp when not specified', async () => {
      mockInitialize.mockResolvedValue(createMockInitResult());

      await executeInit(
        createOptions({
          type: undefined,
          stdout,
          stderr,
        })
      );

      expect(mockInitialize).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'cpp',
        })
      );
    });
  });

  describe('stream handling', () => {
    it('uses provided stdout and stderr streams', async () => {
      mockInitialize.mockResolvedValue(createMockInitResult());

      await executeInit(createOptions({ stdout, stderr }));

      expect(stdout.output).toContain('Initialize Unreal Engine Project');
    });

    it('falls back to process stdout/stderr when not provided', async () => {
      mockInitialize.mockResolvedValue(createMockInitResult());

      // Should not throw when stdout/stderr are not provided
      await expect(executeInit(createOptions())).resolves.toBeDefined();
    });
  });

  describe('initCommand registration', () => {
    it('registers init command with Commander', () => {
      const program = new Command();
      initCommand(program);

      const commands = program.commands.map((cmd) => cmd.name());
      expect(commands).toContain('init');
    });

    it('configures required name option', () => {
      const program = new Command();
      initCommand(program);

      const initCmd = program.commands.find((cmd) => cmd.name() === 'init');
      expect(initCmd).toBeDefined();

      const options = initCmd?.options.map((opt) => opt.long);
      expect(options).toContain('--name');
    });

    it('configures optional type option with default', () => {
      const program = new Command();
      initCommand(program);

      const initCmd = program.commands.find((cmd) => cmd.name() === 'init');
      const typeOption = initCmd?.options.find((opt) => opt.long === '--type');

      expect(typeOption).toBeDefined();
    });

    it('configures template option with default', () => {
      const program = new Command();
      initCommand(program);

      const initCmd = program.commands.find((cmd) => cmd.name() === 'init');
      const templateOption = initCmd?.options.find((opt) => opt.long === '--template');

      expect(templateOption).toBeDefined();
    });

    it('configures directory option', () => {
      const program = new Command();
      initCommand(program);

      const initCmd = program.commands.find((cmd) => cmd.name() === 'init');
      const dirOption = initCmd?.options.find((opt) => opt.long === '--directory');

      expect(dirOption).toBeDefined();
    });

    it('configures engine-path option', () => {
      const program = new Command();
      initCommand(program);

      const initCmd = program.commands.find((cmd) => cmd.name() === 'init');
      const engineOption = initCmd?.options.find((opt) => opt.long === '--engine-path');

      expect(engineOption).toBeDefined();
    });

    it('configures force flag', () => {
      const program = new Command();
      initCommand(program);

      const initCmd = program.commands.find((cmd) => cmd.name() === 'init');
      const forceOption = initCmd?.options.find((opt) => opt.long === '--force');

      expect(forceOption).toBeDefined();
    });

    it('configures dry-run flag', () => {
      const program = new Command();
      initCommand(program);

      const initCmd = program.commands.find((cmd) => cmd.name() === 'init');
      const dryRunOption = initCmd?.options.find((opt) => opt.long === '--dry-run');

      expect(dryRunOption).toBeDefined();
    });
  });

  describe('dry run engine detection', () => {
    it('displays provided engine path in dry run', async () => {
      mockFindEngineInstallations.mockResolvedValue([]);

      await executeInit(
        createOptions({
          name: 'TestProject',
          dryRun: true,
          enginePath: 'C:\\Engines\\UE_5.3',
          stdout,
          stderr,
        })
      );

      expect(stdout.output).toContain('Engine Path:');
      expect(stdout.output).toContain('C:\\Engines\\UE_5.3');
    });

    it('shows warning when no engines found in dry run', async () => {
      mockFindEngineInstallations.mockResolvedValue([]);

      await executeInit(
        createOptions({
          name: 'TestProject',
          dryRun: true,
          stdout,
          stderr,
        })
      );

      expect(stdout.output).toContain('No engines found');
      expect(stdout.output).toContain('will prompt for path');
    });

    it('displays single engine when only one is found', async () => {
      mockFindEngineInstallations.mockResolvedValue([
        {
          associationId: 'UE_5.3',
          displayName: 'Unreal Engine 5.3',
          path: 'C:\\Engines\\UE_5.3',
          version: {
            MajorVersion: 5,
            MinorVersion: 3,
            PatchVersion: 2,
            Changelist: 12345,
            CompatibleChangelist: 12345,
            IsLicenseeVersion: 0,
            IsPromotedBuild: 1,
            BranchName: '++UE5+Release-5.3',
            BuildId: '5.3.2-12345',
          },
          source: 'registry',
        },
      ]);

      await executeInit(
        createOptions({
          name: 'TestProject',
          dryRun: true,
          stdout,
          stderr,
        })
      );

      expect(stdout.output).toContain('Engine:');
      expect(stdout.output).toContain('Unreal Engine 5.3');
    });

    it('displays multiple engines with prompt when multiple are found', async () => {
      mockFindEngineInstallations.mockResolvedValue([
        {
          associationId: 'UE_5.2',
          displayName: 'Unreal Engine 5.2',
          path: 'C:\\Engines\\UE_5.2',
          version: {
            MajorVersion: 5,
            MinorVersion: 2,
            PatchVersion: 1,
            Changelist: 12344,
            CompatibleChangelist: 12344,
            IsLicenseeVersion: 0,
            IsPromotedBuild: 1,
            BranchName: '++UE5+Release-5.2',
            BuildId: '5.2.1-12344',
          },
          source: 'registry',
        },
        {
          associationId: 'UE_5.3',
          displayName: 'Unreal Engine 5.3',
          path: 'C:\\Engines\\UE_5.3',
          version: {
            MajorVersion: 5,
            MinorVersion: 3,
            PatchVersion: 2,
            Changelist: 12345,
            CompatibleChangelist: 12345,
            IsLicenseeVersion: 0,
            IsPromotedBuild: 1,
            BranchName: '++UE5+Release-5.3',
            BuildId: '5.3.2-12345',
          },
          source: 'registry',
        },
      ]);

      await executeInit(
        createOptions({
          name: 'TestProject',
          dryRun: true,
          stdout,
          stderr,
        })
      );

      expect(stdout.output).toContain('Multiple engines available');
      expect(stdout.output).toContain('will prompt for selection');
      expect(stdout.output).toContain('Unreal Engine 5.2');
      expect(stdout.output).toContain('Unreal Engine 5.3');
    });

    it('displays unknown version when version is missing in multiple engines', async () => {
      mockFindEngineInstallations.mockResolvedValue([
        {
          associationId: 'UE_5.2',
          displayName: 'Engine 5.2',
          path: 'C:\\Engines\\UE_5.2',
          source: 'registry',
        },
        {
          associationId: 'UE_5.3',
          displayName: 'Engine 5.3',
          path: 'C:\\Engines\\UE_5.3',
          source: 'registry',
        },
      ]);

      await executeInit(
        createOptions({
          name: 'TestProject',
          dryRun: true,
          stdout,
          stderr,
        })
      );

      expect(stdout.output).toContain('Unknown version');
    });

    it('handles engine detection failure gracefully in dry run', async () => {
      mockFindEngineInstallations.mockRejectedValue(new Error('Registry access denied'));

      await executeInit(
        createOptions({
          name: 'TestProject',
          dryRun: true,
          stdout,
          stderr,
        })
      );

      expect(stdout.output).toContain('Detection failed');
      expect(stdout.output).toContain('will prompt for path');
    });
  });
});

describe('initCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInitialize.mockResolvedValue({
      success: true,
      projectPath: 'C:\\Projects\\TestProject',
      uprojectPath: 'C:\\Projects\\TestProject\\TestProject.uproject',
      engineAssociation: '5.3',
      createdFiles: [],
    });
    mockIsValidProjectName.mockReturnValue(true);
    mockIsValidProjectType.mockReturnValue(true);
  });

  it('registers the init command with correct options', () => {
    const program = new Command();
    const commandSpy = jest.spyOn(program, 'command');

    initCommand(program);

    expect(commandSpy).toHaveBeenCalledWith('init');
  });

  it('registers all required options', () => {
    const program = new Command();
    initCommand(program);

    const initCmd = program.commands.find((cmd) => cmd.name() === 'init');
    expect(initCmd).toBeDefined();

    const options = initCmd?.options || [];
    const optionFlags = options.map((opt) => opt.flags);

    expect(optionFlags).toContain('-n, --name <name>');
    expect(optionFlags).toContain('-t, --type <type>');
    expect(optionFlags).toContain('--template <template>');
    expect(optionFlags).toContain('-d, --directory <path>');
    expect(optionFlags).toContain('--engine-path <path>');
    expect(optionFlags).toContain('--force');
    expect(optionFlags).toContain('--dry-run');
  });

  it('makes name option required', () => {
    const program = new Command();
    initCommand(program);

    const initCmd = program.commands.find((cmd) => cmd.name() === 'init');
    expect(initCmd).toBeDefined();

    const requiredOptions = initCmd?.options.filter((opt) => opt.required);
    const requiredFlags = requiredOptions?.map((opt) => opt.flags);

    expect(requiredFlags).toContain('-n, --name <name>');
  });

  it('action handler exits with code 1 when executeInit throws', async () => {
    mockInitialize.mockRejectedValue(new Error('Init failed'));

    const program = new Command();
    initCommand(program);

    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    program.parse(['node', 'test', 'init', '--name', 'TestProject']);

    // Wait for async action
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });
});

describe('executeInit dry-run', () => {
  let stdout: CapturedWritable;
  let stderr: CapturedWritable;

  beforeEach(() => {
    jest.clearAllMocks();
    stdout = new CapturedWritable();
    stderr = new CapturedWritable();
    mockIsValidProjectName.mockReturnValue(true);
    mockIsValidProjectType.mockReturnValue(true);
  });

  it('shows Force: Yes when force option is true', async () => {
    mockFindEngineInstallations.mockResolvedValue([]);

    await executeInit({
      name: 'ForcedProject',
      type: 'cpp',
      template: 'Basic',
      force: true,
      dryRun: true,
      stdout,
      stderr,
    });

    const output = stdout.output;
    expect(output).toContain('Force: Yes');
  });

  it('shows Force: No when force option is false', async () => {
    mockFindEngineInstallations.mockResolvedValue([]);

    await executeInit({
      name: 'NormalProject',
      type: 'cpp',
      template: 'Basic',
      force: false,
      dryRun: true,
      stdout,
      stderr,
    });

    const output = stdout.output;
    expect(output).toContain('Force: No');
  });

  it('shows engine displayName when single engine found with displayName', async () => {
    mockFindEngineInstallations.mockResolvedValue([
      {
        path: 'C:\\Epic\\UE_5.3',
        version: {
          MajorVersion: 5,
          MinorVersion: 3,
          PatchVersion: 0,
          Changelist: 1,
          CompatibleChangelist: 0,
          IsLicenseeVersion: 0,
          IsPromotedBuild: 0,
          BranchName: '',
          BuildId: '',
        },
        associationId: 'UE_5.3',
        displayName: 'Unreal Engine 5.3',
        installedDate: '',
        source: 'launcher',
      },
    ]);

    await executeInit({
      name: 'MyProject',
      type: 'cpp',
      template: 'Basic',
      dryRun: true,
      stdout,
      stderr,
    });

    const output = stdout.output;
    expect(output).toContain('Unreal Engine 5.3');
  });

  it('lists multiple engines with display names and versions', async () => {
    mockFindEngineInstallations.mockResolvedValue([
      {
        path: 'C:\\Epic\\UE_5.3',
        version: {
          MajorVersion: 5,
          MinorVersion: 3,
          PatchVersion: 2,
          Changelist: 100,
          CompatibleChangelist: 0,
          IsLicenseeVersion: 0,
          IsPromotedBuild: 0,
          BranchName: '',
          BuildId: '',
        },
        associationId: 'UE_5.3',
        displayName: 'Unreal Engine 5.3',
        installedDate: '',
        source: 'launcher',
      },
      {
        path: 'C:\\Epic\\UE_5.4',
        version: {
          MajorVersion: 5,
          MinorVersion: 4,
          PatchVersion: 0,
          Changelist: 200,
          CompatibleChangelist: 0,
          IsLicenseeVersion: 0,
          IsPromotedBuild: 0,
          BranchName: '',
          BuildId: '',
        },
        associationId: 'UE_5.4',
        displayName: 'Unreal Engine 5.4',
        installedDate: '',
        source: 'launcher',
      },
    ]);

    await executeInit({
      name: 'MultiEngineProject',
      type: 'blueprint',
      template: 'Basic',
      dryRun: true,
      stdout,
      stderr,
    });

    const output = stdout.output;
    expect(output).toContain('Multiple engines available');
    expect(output).toContain('Unreal Engine 5.3');
    expect(output).toContain('Unreal Engine 5.4');
    expect(output).toContain('UE 5.3.2');
    expect(output).toContain('UE 5.4.0');
  });

  it('uses engine-path directly when provided instead of detecting engines', async () => {
    await executeInit({
      name: 'PathProject',
      type: 'cpp',
      template: 'Basic',
      dryRun: true,
      enginePath: 'C:\\Custom\\Engine',
      stdout,
      stderr,
    });

    const output = stdout.output;
    expect(output).toContain('Engine Path: C:\\Custom\\Engine');
    expect(mockFindEngineInstallations).not.toHaveBeenCalled();
  });
});
