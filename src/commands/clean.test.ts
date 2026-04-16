import { Command } from 'commander';
import { CleanResult } from '../types/clean';
import { CapturedWritable } from '../test-utils/capture-stream';

const mockExecute = jest.fn<Promise<CleanResult>, [unknown]>();

jest.mock('../core/clean-executor', () => ({
  CleanExecutor: jest.fn().mockImplementation(() => ({
    execute: (...args: [unknown]) => mockExecute(...args),
  })),
}));

// Import after mocking
import { executeClean, cleanCommand, CleanCommandOptions } from './clean';

describe('executeClean', () => {
  let stdout: CapturedWritable;
  let stderr: CapturedWritable;

  const createMockCleanResult = (overrides: Partial<CleanResult> = {}): CleanResult => ({
    success: true,
    deletedPaths: [
      'C:\\Projects\\TestProject\\Binaries',
      'C:\\Projects\\TestProject\\Intermediate',
    ],
    failedPaths: [],
    ...overrides,
  });

  const createOptions = (overrides: Partial<CleanCommandOptions> = {}): CleanCommandOptions => ({
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    stdout = new CapturedWritable();
    stderr = new CapturedWritable();
  });

  describe('successful cleaning', () => {
    it('cleans project in current directory by default', async () => {
      mockExecute.mockResolvedValue(createMockCleanResult());

      const result = await executeClean(createOptions({ stdout, stderr }));

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          projectPath: undefined,
          dryRun: undefined,
          binariesOnly: undefined,
        })
      );
      expect(result.success).toBe(true);
    });

    it('uses provided project path when specified', async () => {
      mockExecute.mockResolvedValue(createMockCleanResult());

      await executeClean(
        createOptions({
          project: 'C:\\Custom\\Project',
          stdout,
          stderr,
        })
      );

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          projectPath: 'C:\\Custom\\Project',
        })
      );
    });

    it('passes engine path to executor', async () => {
      mockExecute.mockResolvedValue(createMockCleanResult());

      await executeClean(
        createOptions({
          enginePath: 'C:\\Engine\\UE_5.3',
          stdout,
          stderr,
        })
      );

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          enginePath: 'C:\\Engine\\UE_5.3',
        })
      );
    });

    it('passes dry run flag to executor', async () => {
      mockExecute.mockResolvedValue(createMockCleanResult());

      await executeClean(
        createOptions({
          dryRun: true,
          stdout,
          stderr,
        })
      );

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          dryRun: true,
        })
      );
    });

    it('passes binaries only flag to executor', async () => {
      mockExecute.mockResolvedValue(createMockCleanResult());

      await executeClean(
        createOptions({
          binariesOnly: true,
          stdout,
          stderr,
        })
      );

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          binariesOnly: true,
        })
      );
    });

    it('passes all options together', async () => {
      mockExecute.mockResolvedValue(createMockCleanResult());

      await executeClean(
        createOptions({
          project: 'C:\\Projects\\MyProject',
          enginePath: 'C:\\Engine\\UE_5.3',
          dryRun: true,
          binariesOnly: true,
          stdout,
          stderr,
        })
      );

      expect(mockExecute).toHaveBeenCalledWith({
        projectPath: 'C:\\Projects\\MyProject',
        enginePath: 'C:\\Engine\\UE_5.3',
        dryRun: true,
        binariesOnly: true,
        stdout,
        stderr,
        silent: undefined,
      });
    });

    it('returns the clean result on success', async () => {
      const cleanResult = createMockCleanResult({
        deletedPaths: ['C:\\Projects\\TestProject\\Binaries'],
      });
      mockExecute.mockResolvedValue(cleanResult);

      const result = await executeClean(createOptions({ stdout, stderr }));

      expect(result).toEqual(cleanResult);
    });
  });

  describe('clean results', () => {
    it('handles successful clean with multiple deleted paths', async () => {
      mockExecute.mockResolvedValue(
        createMockCleanResult({
          deletedPaths: [
            'C:\\Projects\\TestProject\\Binaries',
            'C:\\Projects\\TestProject\\Intermediate',
            'C:\\Projects\\TestProject\\Saved',
          ],
        })
      );

      const result = await executeClean(createOptions({ stdout, stderr }));

      expect(result.success).toBe(true);
      expect(result.deletedPaths).toHaveLength(3);
    });

    it('handles successful clean with no paths to delete', async () => {
      mockExecute.mockResolvedValue(
        createMockCleanResult({
          deletedPaths: [],
        })
      );

      const result = await executeClean(createOptions({ stdout, stderr }));

      expect(result.success).toBe(true);
      expect(result.deletedPaths).toHaveLength(0);
    });

    it('handles clean with failed paths', async () => {
      mockExecute.mockResolvedValue(
        createMockCleanResult({
          success: false,
          deletedPaths: ['C:\\Projects\\TestProject\\Binaries'],
          failedPaths: [
            { path: 'C:\\Projects\\TestProject\\Intermediate', error: 'Permission denied' },
          ],
          error: 'Failed to clean 1 path(s)',
        })
      );

      const result = await executeClean(createOptions({ stdout, stderr }));

      expect(result.success).toBe(false);
      expect(result.failedPaths).toHaveLength(1);
      expect(result.failedPaths[0].error).toBe('Permission denied');
    });
  });

  describe('error handling', () => {
    it('returns failure result when clean executor fails', async () => {
      mockExecute.mockResolvedValue({
        success: false,
        deletedPaths: [],
        failedPaths: [],
        error: 'Project not found',
      });

      const result = await executeClean(createOptions({ stdout, stderr }));

      expect(result.success).toBe(false);
      expect(result.error).toBe('Project not found');
    });

    it('handles unexpected exceptions from executor', async () => {
      mockExecute.mockRejectedValue(new Error('Unexpected error'));

      await expect(executeClean(createOptions({ stdout, stderr }))).rejects.toThrow(
        'Unexpected error'
      );
    });

    it('handles non-Error exceptions', async () => {
      mockExecute.mockRejectedValue('String error');

      await expect(executeClean(createOptions({ stdout, stderr }))).rejects.toBe('String error');
    });
  });

  describe('stream handling', () => {
    it('uses provided stdout and stderr streams', async () => {
      mockExecute.mockResolvedValue(createMockCleanResult());

      await executeClean({
        stdout,
        stderr,
      });

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          stdout,
          stderr,
        })
      );
    });

    it('passes undefined streams when not provided', async () => {
      mockExecute.mockResolvedValue(createMockCleanResult());

      await executeClean({});

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          stdout: undefined,
          stderr: undefined,
        })
      );
    });
  });

  describe('silent mode', () => {
    it('passes silent flag to executor', async () => {
      mockExecute.mockResolvedValue(createMockCleanResult());

      await executeClean(
        createOptions({
          silent: true,
          stdout,
          stderr,
        })
      );

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          silent: true,
        })
      );
    });
  });
});

describe('cleanCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers the clean command with commander', () => {
    const program = new Command();
    cleanCommand(program);

    const cleanCmd = program.commands.find((cmd) => cmd.name() === 'clean');
    expect(cleanCmd).toBeDefined();
    expect(cleanCmd?.description()).toBe('Clean build artifacts from Unreal Engine project');
  });

  it('command has all expected options', () => {
    const program = new Command();
    cleanCommand(program);

    const cleanCmd = program.commands.find((cmd) => cmd.name() === 'clean');
    const options = cleanCmd?.options || [];

    const optionFlags = options.map((opt) => opt.long);
    expect(optionFlags).toContain('--project');
    expect(optionFlags).toContain('--engine-path');
    expect(optionFlags).toContain('--dry-run');
    expect(optionFlags).toContain('--binaries-only');
  });

  it('displays success message when cleaning succeeds with deleted paths', async () => {
    const program = new Command();
    cleanCommand(program);

    mockExecute.mockResolvedValue({
      success: true,
      deletedPaths: [
        'C:\\Projects\\TestProject\\Binaries',
        'C:\\Projects\\TestProject\\Intermediate',
      ],
      failedPaths: [],
    });

    const cleanCmd = program.commands.find((cmd) => cmd.name() === 'clean');
    await cleanCmd?.parseAsync([]);

    expect(mockExecute).toHaveBeenCalled();
  });

  it('displays no artifacts message when nothing to clean', async () => {
    const program = new Command();
    cleanCommand(program);

    mockExecute.mockResolvedValue({
      success: true,
      deletedPaths: [],
      failedPaths: [],
    });

    const cleanCmd = program.commands.find((cmd) => cmd.name() === 'clean');
    await cleanCmd?.parseAsync([]);

    expect(mockExecute).toHaveBeenCalled();
  });

  it('exits with error code 1 when cleaning fails', async () => {
    const program = new Command();
    cleanCommand(program);

    mockExecute.mockResolvedValue({
      success: false,
      deletedPaths: [],
      failedPaths: [{ path: 'C:\\Projects\\TestProject\\Binaries', error: 'Permission denied' }],
      error: 'Failed to clean 1 path(s)',
    });

    const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as (code?: string | number | null | undefined) => never);

    const cleanCmd = program.commands.find((cmd) => cmd.name() === 'clean');
    await expect(cleanCmd?.parseAsync([])).rejects.toThrow('process.exit called');

    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });

  it('displays failed paths when cleaning has failures', async () => {
    const program = new Command();
    cleanCommand(program);

    mockExecute.mockResolvedValue({
      success: false,
      deletedPaths: ['C:\\Projects\\TestProject\\Saved'],
      failedPaths: [
        { path: 'C:\\Projects\\TestProject\\Binaries', error: 'Permission denied' },
        { path: 'C:\\Projects\\TestProject\\Intermediate', error: 'Access denied' },
      ],
      error: 'Failed to clean 2 path(s)',
    });

    const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as (code?: string | number | null | undefined) => never);

    const cleanCmd = program.commands.find((cmd) => cmd.name() === 'clean');
    await expect(cleanCmd?.parseAsync([])).rejects.toThrow('process.exit called');

    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });

  it('handles failure with error message but no failed paths', async () => {
    const program = new Command();
    cleanCommand(program);

    mockExecute.mockResolvedValue({
      success: false,
      deletedPaths: [],
      failedPaths: [],
      error: 'Project directory not found',
    });

    const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as (code?: string | number | null | undefined) => never);

    const cleanCmd = program.commands.find((cmd) => cmd.name() === 'clean');
    await expect(cleanCmd?.parseAsync([])).rejects.toThrow('process.exit called');

    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });

  it('handles failure with no error message and no failed paths', async () => {
    const program = new Command();
    cleanCommand(program);

    mockExecute.mockResolvedValue({
      success: false,
      deletedPaths: [],
      failedPaths: [],
      error: undefined,
    });

    const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as (code?: string | number | null | undefined) => never);

    const cleanCmd = program.commands.find((cmd) => cmd.name() === 'clean');
    await expect(cleanCmd?.parseAsync([])).rejects.toThrow('process.exit called');

    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });

  it('handles failure with failed paths but no error message', async () => {
    const program = new Command();
    cleanCommand(program);

    mockExecute.mockResolvedValue({
      success: false,
      deletedPaths: [],
      failedPaths: [{ path: 'C:\\Projects\\TestProject\\Binaries', error: 'Permission denied' }],
      error: undefined,
    });

    const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as (code?: string | number | null | undefined) => never);

    const cleanCmd = program.commands.find((cmd) => cmd.name() === 'clean');
    await expect(cleanCmd?.parseAsync([])).rejects.toThrow('process.exit called');

    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });

  it('handles exceptions during cleaning', async () => {
    const program = new Command();
    cleanCommand(program);

    mockExecute.mockRejectedValue(new Error('Unexpected error during cleaning'));

    const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as (code?: string | number | null | undefined) => never);

    const cleanCmd = program.commands.find((cmd) => cmd.name() === 'clean');
    await expect(cleanCmd?.parseAsync([])).rejects.toThrow('process.exit called');

    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });

  it('handles non-Error exceptions', async () => {
    const program = new Command();
    cleanCommand(program);

    mockExecute.mockRejectedValue('String error');

    const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as (code?: string | number | null | undefined) => never);

    const cleanCmd = program.commands.find((cmd) => cmd.name() === 'clean');
    await expect(cleanCmd?.parseAsync([])).rejects.toThrow('process.exit called');

    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });
});
