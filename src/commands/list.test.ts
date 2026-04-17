import { Command } from 'commander';
import { ProjectDetectionResult, ProjectInfo, UProject } from '../types/project';
import { CapturedWritable } from '../test-utils/capture-stream';

const mockDetectProject = jest.fn<Promise<ProjectDetectionResult>, [unknown]>();

jest.mock('../core/project-detector', () => ({
  ProjectDetector: {
    detectProject: (...args: [unknown]) => mockDetectProject(...args),
  },
}));

// Import after mocking
import { executeList, listCommand } from './list';

describe('executeList', () => {
  let stdout: CapturedWritable;
  let stderr: CapturedWritable;

  const createMockUProject = (): UProject => ({
    FileVersion: 3,
    EngineAssociation: '{12345678-1234-1234-1234-123456789012}',
    Category: 'Games',
    Description: 'Test Project',
    Modules: [
      {
        Name: 'TestProject',
        Type: 'Runtime',
        LoadingPhase: 'Default',
      },
    ],
    Plugins: [
      {
        Name: 'TestPlugin',
        Enabled: true,
      },
    ],
  });

  const createMockProjectInfo = (): ProjectInfo => ({
    name: 'TestProject',
    path: 'C:\\Projects\\TestProject',
    uproject: createMockUProject(),
    sourceDir: 'C:\\Projects\\TestProject\\Source',
    targets: [
      { name: 'TestProjectEditor', type: 'Editor', path: 'Source\\TestProjectEditor.Target.cs' },
      { name: 'TestProject', type: 'Game', path: 'Source\\TestProject.Target.cs' },
    ],
    modules: [{ name: 'TestProject', path: 'Source\\TestProject\\TestProject.Build.cs' }],
  });

  beforeEach(() => {
    jest.clearAllMocks();
    stdout = new CapturedWritable();
    stderr = new CapturedWritable();
  });

  describe('project detection', () => {
    it('detects project in current directory by default', async () => {
      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: createMockProjectInfo(),
        warnings: [],
      });

      await executeList({
        recursive: false,
        json: false,
        stdout,
        stderr,
      });

      expect(mockDetectProject).toHaveBeenCalledWith({
        cwd: expect.any(String),
        recursive: false,
      });
    });

    it('uses custom project path when specified', async () => {
      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: createMockProjectInfo(),
        warnings: [],
      });

      await executeList({
        project: 'C:\\Custom\\Project',
        recursive: false,
        json: false,
        stdout,
        stderr,
      });

      expect(mockDetectProject).toHaveBeenCalledWith({
        cwd: 'C:\\Custom\\Project',
        recursive: false,
      });
    });

    it('passes recursive flag when specified', async () => {
      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: createMockProjectInfo(),
        warnings: [],
      });

      await executeList({
        recursive: true,
        json: false,
        stdout,
        stderr,
      });

      expect(mockDetectProject).toHaveBeenCalledWith({
        cwd: expect.any(String),
        recursive: true,
      });
    });

    it('outputs project name on success', async () => {
      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: createMockProjectInfo(),
        warnings: [],
      });

      await executeList({
        recursive: false,
        json: false,
        stdout,
        stderr,
      });

      expect(stdout.output).toContain('TestProject');
    });
  });

  describe('json output', () => {
    it('outputs json when json flag is set', async () => {
      const projectInfo = createMockProjectInfo();

      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: projectInfo,
        warnings: [],
      });

      await executeList({
        recursive: false,
        json: true,
        stdout,
        stderr,
      });

      // Parse the JSON output to verify it's valid
      const output = stdout.output;
      expect(() => JSON.parse(output)).not.toThrow();
      const parsed = JSON.parse(output);
      expect(parsed.isValid).toBe(true);
      expect(parsed.project.name).toBe('TestProject');
    });

    it('outputs only json without other formatting when json flag is set', async () => {
      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: createMockProjectInfo(),
        warnings: [],
      });

      await executeList({
        recursive: false,
        json: true,
        stdout,
        stderr,
      });

      // Should be parseable JSON only
      const output = stdout.output;
      expect(() => JSON.parse(output)).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('throws error when project detection fails', async () => {
      mockDetectProject.mockResolvedValue({
        isValid: false,
        error: 'No .uproject file found',
        warnings: [],
      });

      await expect(
        executeList({
          recursive: false,
          json: false,
          stdout,
          stderr,
        })
      ).rejects.toThrow('No .uproject file found');

      expect(stderr.output).toContain('No .uproject file found');
    });

    it('throws error with fallback message when project detection fails without error details', async () => {
      mockDetectProject.mockResolvedValue({
        isValid: false,
        error: undefined,
        warnings: [],
      });

      await expect(
        executeList({
          recursive: false,
          json: false,
          stdout,
          stderr,
        })
      ).rejects.toThrow('Project detection failed');

      expect(stderr.output).toContain('Project detection failed');
    });

    it('throws error when no project is returned', async () => {
      mockDetectProject.mockResolvedValue({
        isValid: true,
        warnings: [],
      });

      await expect(
        executeList({
          recursive: false,
          json: false,
          stdout,
          stderr,
        })
      ).rejects.toThrow('No project found');

      expect(stderr.output).toContain('No project found');
    });

    it('throws error on unexpected exception', async () => {
      mockDetectProject.mockRejectedValue(new Error('Unexpected error'));

      await expect(
        executeList({
          recursive: false,
          json: false,
          stdout,
          stderr,
        })
      ).rejects.toThrow('Unexpected error');
    });

    it('displays warnings in error output when project is invalid', async () => {
      mockDetectProject.mockResolvedValue({
        isValid: false,
        error: 'Invalid project',
        warnings: ['Warning 1', 'Warning 2'],
      });

      await expect(
        executeList({
          recursive: false,
          json: false,
          stdout,
          stderr,
        })
      ).rejects.toThrow();

      expect(stderr.output).toContain('Invalid project');
      expect(stdout.output).toContain('Warning 1');
      expect(stdout.output).toContain('Warning 2');
    });
  });

  describe('successful detection output', () => {
    it('handles blueprint project without uproject modules (empty Modules array)', async () => {
      const blueprintProject: ProjectInfo = {
        ...createMockProjectInfo(),
        sourceDir: '',
        targets: [],
        modules: [],
        uproject: {
          ...createMockUProject(),
          Modules: [],
        },
      };

      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: blueprintProject,
        warnings: [],
      });

      await executeList({
        recursive: false,
        json: false,
        stdout,
        stderr,
      });

      // Verify project is displayed
      expect(stdout.output).toContain('TestProject');
      // Modules section should not be present when uproject.Modules is empty
      const lines = stdout.output.split('\n');
      // Should not have a Modules section (but may have Source Modules)
      const hasModulesSection = lines.some(
        (line, idx) =>
          line.includes('Modules') &&
          !line.includes('Source Modules') &&
          idx < lines.length - 1 &&
          lines[idx + 1]?.includes('•')
      );
      expect(hasModulesSection).toBe(false);
    });

    it('handles project without build targets (empty targets array)', async () => {
      const projectWithoutTargets: ProjectInfo = {
        ...createMockProjectInfo(),
        targets: [],
      };

      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: projectWithoutTargets,
        warnings: [],
      });

      await executeList({
        recursive: false,
        json: false,
        stdout,
        stderr,
      });

      // Verify project is displayed
      expect(stdout.output).toContain('TestProject');
      // Build Targets section should not be present when targets is empty
      const lines = stdout.output.split('\n');
      const buildTargetsLineIndex = lines.findIndex((line) => line.includes('Build Targets'));
      if (buildTargetsLineIndex >= 0) {
        // If section header exists, verify no target items follow it
        const nextLines = lines.slice(buildTargetsLineIndex + 1, buildTargetsLineIndex + 5);
        expect(nextLines.some((line) => line.includes('•'))).toBe(false);
      }
    });

    it('handles project without source modules (empty modules array)', async () => {
      const projectWithoutSourceModules: ProjectInfo = {
        ...createMockProjectInfo(),
        modules: [],
      };

      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: projectWithoutSourceModules,
        warnings: [],
      });

      await executeList({
        recursive: false,
        json: false,
        stdout,
        stderr,
      });

      // Verify project is displayed
      expect(stdout.output).toContain('TestProject');
      // Source Modules section should not be present when modules is empty
      const lines = stdout.output.split('\n');
      const hasSourceModulesSection = lines.some(
        (line, idx) =>
          line.includes('Source Modules') && idx < lines.length - 1 && lines[idx + 1]?.includes('•')
      );
      expect(hasSourceModulesSection).toBe(false);
    });

    it('handles project with disabled plugins', async () => {
      const projectWithDisabledPlugins: ProjectInfo = {
        ...createMockProjectInfo(),
        uproject: {
          ...createMockUProject(),
          Plugins: [
            { Name: 'EnabledPlugin', Enabled: true },
            { Name: 'DisabledPlugin', Enabled: false },
          ],
        },
      };

      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: projectWithDisabledPlugins,
        warnings: [],
      });

      await executeList({
        recursive: false,
        json: false,
        stdout,
        stderr,
      });

      expect(stdout.output).toContain('EnabledPlugin');
      expect(stdout.output).toContain('DisabledPlugin');
    });

    it('handles project without plugins', async () => {
      const projectWithoutPlugins: ProjectInfo = {
        ...createMockProjectInfo(),
        uproject: {
          ...createMockUProject(),
          Plugins: undefined,
        },
      };

      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: projectWithoutPlugins,
        warnings: [],
      });

      await executeList({
        recursive: false,
        json: false,
        stdout,
        stderr,
      });

      expect(stdout.output).toContain('TestProject');
      // Plugins section should not be present
      const lines = stdout.output.split('\n');
      const pluginsSectionIndex = lines.findIndex((line) => line.includes('Plugins'));
      // If Plugins section exists, it should not have any plugin items
      if (pluginsSectionIndex >= 0) {
        expect(lines.slice(pluginsSectionIndex + 1).some((line) => line.includes('•'))).toBe(false);
      }
    });

    it('displays warnings section when warnings exist', async () => {
      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: createMockProjectInfo(),
        warnings: ['Warning 1', 'Warning 2'],
      });

      await executeList({
        recursive: false,
        json: false,
        stdout,
        stderr,
      });

      expect(stdout.output).toContain('Warnings');
      expect(stdout.output).toContain('Warning 1');
      expect(stdout.output).toContain('Warning 2');
    });

    it('displays build targets when available', async () => {
      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: createMockProjectInfo(),
        warnings: [],
      });

      await executeList({
        recursive: false,
        json: false,
        stdout,
        stderr,
      });

      expect(stdout.output).toContain('Build Targets');
      expect(stdout.output).toContain('TestProjectEditor');
      expect(stdout.output).toContain('Editor');
    });

    it('displays source modules when available', async () => {
      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: createMockProjectInfo(),
        warnings: [],
      });

      await executeList({
        recursive: false,
        json: false,
        stdout,
        stderr,
      });

      expect(stdout.output).toContain('Source Modules');
      expect(stdout.output).toContain('TestProject');
    });

    it('displays uproject modules', async () => {
      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: createMockProjectInfo(),
        warnings: [],
      });

      await executeList({
        recursive: false,
        json: false,
        stdout,
        stderr,
      });

      expect(stdout.output).toContain('Modules');
      expect(stdout.output).toContain('Runtime');
    });
  });
});

describe('listCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers the list command with correct options', () => {
    const program = new Command();
    const commandSpy = jest.spyOn(program, 'command');

    listCommand(program);

    expect(commandSpy).toHaveBeenCalledWith('list');
  });

  it('registers the ls alias', () => {
    const program = new Command();
    listCommand(program);

    const listCmd = program.commands.find((cmd) => cmd.name() === 'list');
    expect(listCmd).toBeDefined();
    expect(listCmd?.alias()).toBe('ls');
  });

  it('registers all required options', () => {
    const program = new Command();
    listCommand(program);

    const listCmd = program.commands.find((cmd) => cmd.name() === 'list');
    expect(listCmd).toBeDefined();

    const options = listCmd?.options || [];
    const optionFlags = options.map((opt) => opt.flags);

    expect(optionFlags).toContain('-p, --project <path>');
    expect(optionFlags).toContain('-r, --recursive');
    expect(optionFlags).toContain('-j, --json');
  });

  it('action handler passes options to executeList', async () => {
    mockDetectProject.mockResolvedValue({
      isValid: true,
      project: {
        name: 'TestProject',
        path: '/test/project',
        uproject: {
          FileVersion: 3,
          EngineAssociation: '5.3',
          Modules: [],
        },
        sourceDir: '/test/project/Source',
        targets: [],
        modules: [],
      },
      warnings: [],
    });

    const program = new Command();
    listCommand(program);

    // Parse with test arguments
    program.parse(['node', 'test', 'list', '--recursive', '--json']);

    // Wait for async action
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockDetectProject).toHaveBeenCalledWith(
      expect.objectContaining({
        recursive: true,
      })
    );
  });

  it('calls handleCommandError when executeList throws', async () => {
    mockDetectProject.mockRejectedValue(new Error('Detection failed'));

    const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as (code?: string | number | null | undefined) => never);

    const program = new Command();
    listCommand(program);
    const listCmd = program.commands.find((cmd) => cmd.name() === 'list');

    await expect(listCmd?.parseAsync(['node', 'ubuild'])).rejects.toThrow('process.exit called');

    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });
});
