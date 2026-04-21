/**
 * Tests for CLI entry point.
 *
 * Tests the main CLI initialization, command registration,
 * and error handling behavior.
 */

import { Command } from 'commander';
import { flushPromises } from '../test-utils/flush-promises';

// Mock Logger
const mockLoggerDebug = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('../utils/logger', () => ({
  Logger: {
    debug: (...args: unknown[]) => mockLoggerDebug(...args),
    error: (...args: unknown[]) => mockLoggerError(...args),
  },
}));

// Mock all command modules
const mockListCommand = jest.fn();
const mockEngineCommand = jest.fn();
const mockBuildCommand = jest.fn();
const mockGenerateCommand = jest.fn();
const mockInitCommand = jest.fn();
const mockRunCommand = jest.fn();
const mockUpdateCommand = jest.fn();
const mockGencodebaseCommand = jest.fn();
const mockCleanCommand = jest.fn();
const mockVersionCommand = jest.fn();

jest.mock('../commands/list', () => ({
  listCommand: (program: Command) => mockListCommand(program),
}));

jest.mock('../commands/engine', () => ({
  engineCommand: (program: Command) => mockEngineCommand(program),
}));

jest.mock('../commands/build', () => ({
  buildCommand: (program: Command) => mockBuildCommand(program),
}));

jest.mock('../commands/generate', () => ({
  generateCommand: (program: Command) => mockGenerateCommand(program),
}));

jest.mock('../commands/init', () => ({
  initCommand: (program: Command) => mockInitCommand(program),
}));

jest.mock('../commands/run', () => ({
  runCommand: (program: Command) => mockRunCommand(program),
}));

jest.mock('../commands/update', () => ({
  updateCommand: (program: Command) => mockUpdateCommand(program),
}));

jest.mock('../commands/gencodebase', () => ({
  gencodebaseCommand: (program: Command) => mockGencodebaseCommand(program),
}));

jest.mock('../commands/clean', () => ({
  cleanCommand: (program: Command) => mockCleanCommand(program),
}));

jest.mock('../commands/version', () => ({
  versionCommand: (program: Command) => mockVersionCommand(program),
}));

// Mock package.json
jest.mock('../../package.json', () => ({
  version: '1.0.0-test',
  description: 'Test description',
}));

describe('CLI Entry Point', () => {
  let originalArgv: string[];
  let originalNodeEnv: string | undefined;
  let originalExit: typeof process.exit;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    originalArgv = [...process.argv];
    originalNodeEnv = process.env.NODE_ENV;
    originalExit = process.exit;
    // Prevent process.exit from actually exiting
    process.exit = jest.fn() as unknown as typeof process.exit;
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env.NODE_ENV = originalNodeEnv;
    process.exit = originalExit;
  });

  describe('program initialization', () => {
    it('registers all standard commands', async () => {
      // Use a command that won't trigger help output
      process.argv = ['node', 'ubuild', 'list'];

      // Import the module to trigger command registration
      await import('./index');

      // Wait for async main() to complete
      await flushPromises();

      expect(mockListCommand).toHaveBeenCalled();
      expect(mockEngineCommand).toHaveBeenCalled();
      expect(mockBuildCommand).toHaveBeenCalled();
      expect(mockGenerateCommand).toHaveBeenCalled();
      expect(mockInitCommand).toHaveBeenCalled();
      expect(mockRunCommand).toHaveBeenCalled();
      expect(mockUpdateCommand).toHaveBeenCalled();
      expect(mockGencodebaseCommand).toHaveBeenCalled();
      expect(mockCleanCommand).toHaveBeenCalled();
      expect(mockVersionCommand).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('logs error and exits when program.parseAsync throws', async () => {
      process.argv = ['node', 'ubuild', 'list'];

      // Mock commander to make parseAsync reject
      jest.doMock('commander', () => {
        const ActualCommand = jest.requireActual('commander').Command;
        return {
          Command: class MockCommand extends ActualCommand {
            async parseAsync(..._args: unknown[]): Promise<this> {
              throw new Error('Command execution failed');
            }
          },
        };
      });

      await import('./index');
      await flushPromises();

      expect(mockLoggerError).toHaveBeenCalledWith('Error: Command execution failed');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('handles non-Error values thrown by parseAsync', async () => {
      process.argv = ['node', 'ubuild', 'list'];

      jest.doMock('commander', () => {
        const ActualCommand = jest.requireActual('commander').Command;
        return {
          Command: class MockCommand extends ActualCommand {
            async parseAsync(..._args: unknown[]): Promise<this> {
              throw 'string error';
            }
          },
        };
      });

      await import('./index');
      await flushPromises();

      expect(mockLoggerError).toHaveBeenCalledWith('Error: string error');
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  describe('configureOutput', () => {
    it('configures outputError to wrap errors with chalk.red', async () => {
      let capturedOutputError: ((str: string, write: (s: string) => void) => void) | null = null;

      jest.doMock('commander', () => {
        const ActualCommand = jest.requireActual('commander').Command;
        return {
          Command: class extends ActualCommand {
            configureOutput(opts: Record<string, unknown>) {
              if (typeof opts?.outputError === 'function') {
                capturedOutputError = opts.outputError as typeof capturedOutputError;
              }
              return super.configureOutput(opts as never);
            }
          },
        };
      });

      process.argv = ['node', 'ubuild', 'list'];
      await import('./index');
      await flushPromises();

      expect(capturedOutputError).not.toBeNull();

      const mockWrite = jest.fn();
      capturedOutputError!('test error', mockWrite);
      expect(mockWrite).toHaveBeenCalledTimes(1);

      // The callback delegates to write(chalk.red(str)) — chalk.red output
      // varies by environment (ANSI in TTY, plain in non-TTY), so we verify
      // the error text is present in the written output.
      const written = mockWrite.mock.calls[0][0] as string;
      expect(written).toContain('test error');
    });
  });

  describe('configureHelp', () => {
    it('configures help to sort subcommands and show name-only terms', async () => {
      let capturedHelpConfig: Record<string, unknown> | null = null;

      jest.doMock('commander', () => {
        const ActualCommand = jest.requireActual('commander').Command;
        return {
          Command: class extends ActualCommand {
            configureHelp(config: Record<string, unknown>) {
              capturedHelpConfig = config;
              return super.configureHelp(config as never);
            }
          },
        };
      });

      process.argv = ['node', 'ubuild', 'list'];
      await import('./index');
      await flushPromises();

      expect(capturedHelpConfig).not.toBeNull();
      expect(capturedHelpConfig!.sortSubcommands).toBe(true);

      const subcommandTerm = capturedHelpConfig!.subcommandTerm as (cmd: {
        name: () => string;
      }) => string;
      expect(typeof subcommandTerm).toBe('function');
      expect(subcommandTerm({ name: () => 'testCommand' })).toBe('testCommand');
    });
  });
});
