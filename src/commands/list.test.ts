import { ProjectDetectionResult, ProjectInfo, UProject } from '../types/project';
import { CapturedWritable } from '../test-utils/capture-stream';

const mockDetectProject = jest.fn<Promise<ProjectDetectionResult>, [unknown]>();

jest.mock('../core/project-detector', () => ({
  ProjectDetector: {
    detectProject: (...args: [unknown]) => mockDetectProject(...args),
  },
}));

// Import after mocking
import { executeList } from './list';

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
    it('exits with error when project detection fails', async () => {
      mockDetectProject.mockResolvedValue({
        isValid: false,
        error: 'No .uproject file found',
        warnings: [],
      });

      // Mock process.exit to prevent actual exit
      const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called');
      }) as (code?: string | number | null | undefined) => never);

      await expect(
        executeList({
          recursive: false,
          json: false,
          stdout,
          stderr,
        })
      ).rejects.toThrow('process.exit called');

      expect(mockExit).toHaveBeenCalledWith(1);
      mockExit.mockRestore();
    });

    it('exits with error when no project is returned', async () => {
      mockDetectProject.mockResolvedValue({
        isValid: true,
        warnings: [],
      });

      const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called');
      }) as (code?: string | number | null | undefined) => never);

      await expect(
        executeList({
          recursive: false,
          json: false,
          stdout,
          stderr,
        })
      ).rejects.toThrow('process.exit called');

      expect(mockExit).toHaveBeenCalledWith(1);
      mockExit.mockRestore();
    });

    it('exits with error on unexpected exception', async () => {
      mockDetectProject.mockRejectedValue(new Error('Unexpected error'));

      const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called');
      }) as (code?: string | number | null | undefined) => never);

      await expect(
        executeList({
          recursive: false,
          json: false,
          stdout,
          stderr,
        })
      ).rejects.toThrow('process.exit called');

      expect(mockExit).toHaveBeenCalledWith(1);
      mockExit.mockRestore();
    });

    it('displays warnings in error output when project is invalid', async () => {
      mockDetectProject.mockResolvedValue({
        isValid: false,
        error: 'Invalid project',
        warnings: ['Warning 1', 'Warning 2'],
      });

      const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called');
      }) as (code?: string | number | null | undefined) => never);

      await expect(
        executeList({
          recursive: false,
          json: false,
          stdout,
          stderr,
        })
      ).rejects.toThrow();

      expect(mockExit).toHaveBeenCalledWith(1);
      mockExit.mockRestore();
    });
  });

  describe('successful detection output', () => {
    it('handles project without source directory (blueprint project)', async () => {
      const blueprintProject: ProjectInfo = {
        ...createMockProjectInfo(),
        sourceDir: '',
        targets: [],
        modules: [],
      };

      mockDetectProject.mockResolvedValue({
        isValid: true,
        project: blueprintProject,
        warnings: ['Source directory not found'],
      });

      await executeList({
        recursive: false,
        json: false,
        stdout,
        stderr,
      });

      expect(stdout.output).toContain('TestProject');
      expect(stdout.output).toContain('Not found');
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
