import { CapturedWritable } from '../test-utils/capture-stream';
import { InitResult } from '../types/init';

const mockInitialize = jest.fn<Promise<InitResult>, [unknown]>();
const mockIsValidProjectName = jest.fn<boolean, [string]>();
const mockIsValidProjectType = jest.fn<boolean, [string]>();

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

// Import after mocking
import { executeInit, InitCommandOptions } from './init';

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
});
