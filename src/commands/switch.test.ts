/**
 * Tests for switch command module.
 */

import { Command } from 'commander';
import { SwitchResult } from '../types/switch';
import { CapturedWritable } from '../test-utils/capture-stream';

const mockExecute = jest.fn<Promise<SwitchResult>, [unknown]>();

jest.mock('../core/switch-executor', () => ({
  SwitchExecutor: jest.fn().mockImplementation(() => ({
    execute: (...args: [unknown]) => mockExecute(...args),
  })),
}));

import { executeSwitch, switchCommand, SwitchCommandOptions } from './switch';

describe('executeSwitch', () => {
  let stdout: CapturedWritable;
  let stderr: CapturedWritable;

  const createMockSwitchResult = (overrides: Partial<SwitchResult> = {}): SwitchResult => ({
    success: true,
    previousAssociation: '5.3',
    newAssociation: '5.4',
    uprojectPath: 'C:\\Projects\\TestProject\\TestProject.uproject',
    ...overrides,
  });

  const createOptions = (overrides: Partial<SwitchCommandOptions> = {}): SwitchCommandOptions => ({
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    stdout = new CapturedWritable();
    stderr = new CapturedWritable();
  });

  describe('successful switching', () => {
    it('switches engine for project in current directory by default', async () => {
      mockExecute.mockResolvedValue(createMockSwitchResult());

      const result = await executeSwitch(createOptions({ stdout, stderr }));

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          projectPath: undefined,
          enginePath: undefined,
        })
      );
      expect(result.success).toBe(true);
    });

    it('passes project path when specified', async () => {
      mockExecute.mockResolvedValue(createMockSwitchResult());

      await executeSwitch(
        createOptions({
          project: 'C:\\Projects\\TestProject',
          stdout,
          stderr,
        })
      );

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          projectPath: 'C:\\Projects\\TestProject',
        })
      );
    });

    it('passes engine path when specified', async () => {
      mockExecute.mockResolvedValue(createMockSwitchResult());

      await executeSwitch(
        createOptions({
          enginePath: 'C:\\Program Files\\Epic Games\\UE_5.4',
          stdout,
          stderr,
        })
      );

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          enginePath: 'C:\\Program Files\\Epic Games\\UE_5.4',
        })
      );
    });
  });

  describe('failure handling', () => {
    it('returns failure result from executor', async () => {
      mockExecute.mockResolvedValue(
        createMockSwitchResult({
          success: false,
          error: 'No Unreal Engine installations found',
        })
      );

      const result = await executeSwitch(createOptions({ stdout, stderr }));

      expect(result.success).toBe(false);
      expect(result.error).toBe('No Unreal Engine installations found');
    });

    it('propagates executor exceptions', async () => {
      mockExecute.mockRejectedValue(new Error('Switch failed'));

      await expect(executeSwitch(createOptions({ stdout, stderr }))).rejects.toThrow(
        'Switch failed'
      );
    });
  });
});

describe('switchCommand', () => {
  it('registers the switch command on the program', () => {
    const program = new Command();
    switchCommand(program);

    const cmd = program.commands.find((c) => c.name() === 'switch');
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toBe('Switch Unreal Engine association for the current project');
  });

  it('registers expected options', () => {
    const program = new Command();
    switchCommand(program);

    const cmd = program.commands.find((c) => c.name() === 'switch');
    const optionNames = cmd?.options.map((o) => o.long);
    expect(optionNames).toContain('--project');
    expect(optionNames).toContain('--engine-path');
  });
});
