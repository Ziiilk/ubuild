import { Command } from 'commander';
import { CapturedWritable } from '../test-utils/capture-stream';
import { GenerateResult } from '../types/generate';

const mockGenerate = jest.fn<Promise<GenerateResult>, [unknown]>();

jest.mock('../core/project-generator', () => ({
  ProjectGenerator: {
    generate: (...args: [unknown]) => mockGenerate(...args),
  },
}));

// Import after mocking
import { executeGenerate, generateCommand } from './generate';

describe('executeGenerate', () => {
  let stdout: CapturedWritable;
  let stderr: CapturedWritable;

  const createMockGenerateResult = (overrides: Partial<GenerateResult> = {}): GenerateResult => ({
    success: true,
    generatedFiles: ['TestProject.sln', 'TestProject.vcxproj'],
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    stdout = new CapturedWritable();
    stderr = new CapturedWritable();
  });

  describe('IDE validation', () => {
    it('uses sln as default IDE when not specified', async () => {
      mockGenerate.mockResolvedValue(createMockGenerateResult());

      await executeGenerate({
        stdout,
        stderr,
      });

      expect(mockGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          ide: 'sln',
        })
      );
    });

    it('accepts vscode as IDE type', async () => {
      mockGenerate.mockResolvedValue(createMockGenerateResult());

      await executeGenerate({
        ide: 'vscode',
        stdout,
        stderr,
      });

      expect(mockGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          ide: 'vscode',
        })
      );
    });

    it('accepts vs2022 as IDE type', async () => {
      mockGenerate.mockResolvedValue(createMockGenerateResult());

      await executeGenerate({
        ide: 'vs2022',
        stdout,
        stderr,
      });

      expect(mockGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          ide: 'vs2022',
        })
      );
    });

    it('accepts clion as IDE type', async () => {
      mockGenerate.mockResolvedValue(createMockGenerateResult());

      await executeGenerate({
        ide: 'clion',
        stdout,
        stderr,
      });

      expect(mockGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          ide: 'clion',
        })
      );
    });

    it('accepts xcode as IDE type', async () => {
      mockGenerate.mockResolvedValue(createMockGenerateResult());

      await executeGenerate({
        ide: 'xcode',
        stdout,
        stderr,
      });

      expect(mockGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          ide: 'xcode',
        })
      );
    });

    it('exits with error for invalid IDE type', async () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called');
      }) as (code?: string | number | null | undefined) => never);

      await expect(
        executeGenerate({
          ide: 'invalid-ide',
          stdout,
          stderr,
        })
      ).rejects.toThrow('process.exit called');

      expect(mockExit).toHaveBeenCalledWith(1);
      mockExit.mockRestore();
    });
  });

  describe('list IDEs option', () => {
    it('lists available IDEs when listIdes flag is set', async () => {
      await executeGenerate({
        listIdes: true,
        stdout,
        stderr,
      });

      expect(stdout.output).toContain('Available IDE Types');
      expect(stdout.output).toContain('sln');
      expect(stdout.output).toContain('vscode');
      expect(stdout.output).toContain('Visual Studio');
    });

    it('does not call ProjectGenerator when listing IDEs', async () => {
      await executeGenerate({
        listIdes: true,
        stdout,
        stderr,
      });

      expect(mockGenerate).not.toHaveBeenCalled();
    });
  });

  describe('successful generation', () => {
    it('outputs success message on successful generation', async () => {
      mockGenerate.mockResolvedValue(createMockGenerateResult());

      await executeGenerate({
        ide: 'sln',
        stdout,
        stderr,
      });

      expect(stdout.output).toContain('Project files generated successfully');
    });

    it('displays generated files list', async () => {
      mockGenerate.mockResolvedValue(
        createMockGenerateResult({
          generatedFiles: ['TestProject.sln', 'TestProject.vcxproj', 'TestProject.vcxproj.filters'],
        })
      );

      await executeGenerate({
        ide: 'sln',
        stdout,
        stderr,
      });

      expect(stdout.output).toContain('Generated Files');
      expect(stdout.output).toContain('TestProject.sln');
      expect(stdout.output).toContain('TestProject.vcxproj');
    });

    it('shows Visual Studio hint for sln IDE type', async () => {
      mockGenerate.mockResolvedValue(createMockGenerateResult());

      await executeGenerate({
        ide: 'sln',
        stdout,
        stderr,
      });

      expect(stdout.output).toContain('Visual Studio');
      expect(stdout.output).toContain('.sln');
    });

    it('shows Visual Studio hint for vs2022 IDE type', async () => {
      mockGenerate.mockResolvedValue(createMockGenerateResult());

      await executeGenerate({
        ide: 'vs2022',
        stdout,
        stderr,
      });

      expect(stdout.output).toContain('Visual Studio');
    });

    it('shows VSCode hint for vscode IDE type', async () => {
      mockGenerate.mockResolvedValue(createMockGenerateResult());

      await executeGenerate({
        ide: 'vscode',
        stdout,
        stderr,
      });

      expect(stdout.output).toContain('code-workspace');
      expect(stdout.output).toContain('Visual Studio Code');
    });

    it('does not show IDE hint for clion IDE type', async () => {
      mockGenerate.mockResolvedValue(createMockGenerateResult());

      await executeGenerate({
        ide: 'clion',
        stdout,
        stderr,
      });

      // CLion doesn't have a specific hint in the current implementation
      expect(stdout.output).toContain('Project files generated successfully');
    });

    it('handles empty generated files list', async () => {
      mockGenerate.mockResolvedValue(
        createMockGenerateResult({
          generatedFiles: [],
        })
      );

      await executeGenerate({
        ide: 'sln',
        stdout,
        stderr,
      });

      expect(stdout.output).toContain('Project files generated successfully');
      // Generated Files section should not appear when empty
      const lines = stdout.output.split('\n');
      const generatedFilesIndex = lines.findIndex((line) => line.includes('Generated Files'));
      expect(generatedFilesIndex).toBe(-1);
    });
  });

  describe('error handling', () => {
    it('exits with error when generation fails', async () => {
      mockGenerate.mockResolvedValue({
        success: false,
        generatedFiles: [],
        error: 'Engine path not found',
      });

      const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called');
      }) as (code?: string | number | null | undefined) => never);

      await expect(
        executeGenerate({
          ide: 'sln',
          stdout,
          stderr,
        })
      ).rejects.toThrow('process.exit called');

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(stderr.output).toContain('Engine path not found');
      mockExit.mockRestore();
    });

    it('exits with error on unexpected exception', async () => {
      mockGenerate.mockRejectedValue(new Error('Unexpected error'));

      const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called');
      }) as (code?: string | number | null | undefined) => never);

      await expect(
        executeGenerate({
          ide: 'sln',
          stdout,
          stderr,
        })
      ).rejects.toThrow('process.exit called');

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(stderr.output).toContain('Unexpected error');
      mockExit.mockRestore();
    });
  });

  describe('option passing', () => {
    it('passes project path to ProjectGenerator', async () => {
      mockGenerate.mockResolvedValue(createMockGenerateResult());

      await executeGenerate({
        ide: 'sln',
        projectPath: '/path/to/project',
        stdout,
        stderr,
      });

      expect(mockGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          projectPath: '/path/to/project',
        })
      );
    });

    it('passes engine path to ProjectGenerator', async () => {
      mockGenerate.mockResolvedValue(createMockGenerateResult());

      await executeGenerate({
        ide: 'sln',
        enginePath: '/path/to/engine',
        stdout,
        stderr,
      });

      expect(mockGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          enginePath: '/path/to/engine',
        })
      );
    });

    it('passes force flag to ProjectGenerator', async () => {
      mockGenerate.mockResolvedValue(createMockGenerateResult());

      await executeGenerate({
        ide: 'sln',
        force: true,
        stdout,
        stderr,
      });

      expect(mockGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          force: true,
        })
      );
    });

    it('passes undefined options when not specified', async () => {
      mockGenerate.mockResolvedValue(createMockGenerateResult());

      await executeGenerate({
        ide: 'sln',
        stdout,
        stderr,
      });

      expect(mockGenerate).toHaveBeenCalledWith({
        ide: 'sln',
        projectPath: undefined,
        enginePath: undefined,
        force: undefined,
      });
    });
  });

  describe('IDE type specific behavior', () => {
    it('outputs correct IDE name in title for each IDE type', async () => {
      const ideTypes = ['sln', 'vscode', 'clion', 'xcode', 'vs2022'];

      for (const ide of ideTypes) {
        jest.clearAllMocks();
        stdout.clear();
        stderr.clear();

        mockGenerate.mockResolvedValue(createMockGenerateResult());

        await executeGenerate({
          ide,
          stdout,
          stderr,
        });

        expect(stdout.output).toContain(ide.toUpperCase());
      }
    });
  });
});

describe('generateCommand', () => {
  it('registers the generate command with correct options', () => {
    const program = new Command();
    const commandSpy = jest.spyOn(program, 'command');

    generateCommand(program);

    expect(commandSpy).toHaveBeenCalledWith('generate');
  });

  it('registers the gen alias', () => {
    const program = new Command();
    generateCommand(program);

    const generateCmd = program.commands.find((cmd) => cmd.name() === 'generate');
    expect(generateCmd).toBeDefined();
    expect(generateCmd?.alias()).toBe('gen');
  });

  it('registers all required options', () => {
    const program = new Command();
    generateCommand(program);

    const generateCmd = program.commands.find((cmd) => cmd.name() === 'generate');
    expect(generateCmd).toBeDefined();

    const options = generateCmd?.options || [];
    const optionFlags = options.map((opt) => opt.flags);

    expect(optionFlags).toContain('-i, --ide <ide>');
    expect(optionFlags).toContain('--project <path>');
    expect(optionFlags).toContain('--engine-path <path>');
    expect(optionFlags).toContain('--force');
    expect(optionFlags).toContain('--list-ides');
  });

  it('action handler passes options to executeGenerate', async () => {
    mockGenerate.mockResolvedValue({
      success: true,
      generatedFiles: ['TestProject.sln'],
    });

    const program = new Command();
    generateCommand(program);

    const generateCmd = program.commands.find((cmd) => cmd.name() === 'generate');
    expect(generateCmd).toBeDefined();

    // Parse with test arguments
    program.parse(['node', 'test', 'generate', '--ide', 'vscode', '--force']);

    // Wait for async action
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        ide: 'vscode',
        force: true,
      })
    );
  });
});
