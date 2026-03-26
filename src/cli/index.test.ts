/**
 * Tests for CLI entry point.
 *
 * Tests the main CLI initialization, command registration, conditional evolve
 * command loading, and error handling behavior.
 */

import { Command } from 'commander';

// Mock Logger.debug
const mockLoggerDebug = jest.fn();

jest.mock('../utils/logger', () => ({
  Logger: {
    debug: (...args: unknown[]) => mockLoggerDebug(...args),
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
const mockEvolveCommand = jest.fn();

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

jest.mock('../commands/evolve', () => ({
  evolveCommand: (program: Command) => mockEvolveCommand(program),
}));

// Mock package.json
jest.mock('../../package.json', () => ({
  version: '1.0.0-test',
  description: 'Test description',
}));

describe('CLI Entry Point', () => {
  let originalArgv: string[];
  let originalNodeEnv: string | undefined;
  let originalEvolveEnabled: string | undefined;
  let originalExit: typeof process.exit;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    originalArgv = [...process.argv];
    originalNodeEnv = process.env.NODE_ENV;
    originalEvolveEnabled = process.env.UBUILD_EVOLVE_ENABLED;
    originalExit = process.exit;
    // Prevent process.exit from actually exiting
    process.exit = jest.fn() as unknown as typeof process.exit;
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env.NODE_ENV = originalNodeEnv;
    process.env.UBUILD_EVOLVE_ENABLED = originalEvolveEnabled;
    process.exit = originalExit;
  });

  describe('program initialization', () => {
    it('registers all standard commands', async () => {
      // Use a command that won't trigger help output
      process.argv = ['node', 'ubuild', 'list'];

      // Import the module to trigger command registration
      await import('./index');

      // Give time for async main() to start
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockListCommand).toHaveBeenCalled();
      expect(mockEngineCommand).toHaveBeenCalled();
      expect(mockBuildCommand).toHaveBeenCalled();
      expect(mockGenerateCommand).toHaveBeenCalled();
      expect(mockInitCommand).toHaveBeenCalled();
      expect(mockRunCommand).toHaveBeenCalled();
      expect(mockUpdateCommand).toHaveBeenCalled();
      expect(mockGencodebaseCommand).toHaveBeenCalled();
      expect(mockCleanCommand).toHaveBeenCalled();
    });
  });

  describe('evolve command registration', () => {
    it('registers evolve command when evolve is requested', async () => {
      process.argv = ['node', 'ubuild', 'evolve'];

      await import('./index');
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockEvolveCommand).toHaveBeenCalled();
    });

    it('registers evolve command in development mode', async () => {
      process.argv = ['node', 'ubuild', 'list'];
      process.env.NODE_ENV = 'development';

      await import('./index');
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockEvolveCommand).toHaveBeenCalled();
    });

    it('registers evolve command when UBILD_EVOLVE_ENABLED is true', async () => {
      process.argv = ['node', 'ubuild', 'list'];
      process.env.UBUILD_EVOLVE_ENABLED = 'true';

      await import('./index');
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockEvolveCommand).toHaveBeenCalled();
    });

    it('does not register evolve command in production mode without evolve arg', async () => {
      process.argv = ['node', 'ubuild', 'list'];
      process.env.NODE_ENV = 'production';
      delete process.env.UBUILD_EVOLVE_ENABLED;

      await import('./index');
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockEvolveCommand).not.toHaveBeenCalled();
    });

    it('logs debug message when evolve command fails to load', async () => {
      process.argv = ['node', 'ubuild', 'evolve'];

      // Make the evolve command mock throw an error
      mockEvolveCommand.mockImplementation(() => {
        throw new Error('Module not found');
      });

      await import('./index');
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockLoggerDebug).toHaveBeenCalledWith(
        expect.stringContaining('Evolve command not available')
      );
    });
  });

  describe('error handling', () => {
    it('exits with code 1 when program.parseAsync throws an error', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {
        // Suppress console.error output during test
      });
      process.argv = ['node', 'ubuild', 'list'];

      // Mock list command to throw an error during execution
      mockListCommand.mockImplementation((program: Command) => {
        program
          .command('list')
          .description('List projects')
          .action(async () => {
            throw new Error('Test error');
          });
      });

      await import('./index');
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(process.exit).toHaveBeenCalledWith(1);
      consoleErrorSpy.mockRestore();
    });

    it('handles non-Error exceptions in main', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {
        // Suppress console.error output during test
      });
      process.argv = ['node', 'ubuild', 'list'];

      // Mock list command to throw a non-Error value
      mockListCommand.mockImplementation((program: Command) => {
        program
          .command('list')
          .description('List projects')
          .action(async () => {
            throw 'String error';
          });
      });

      await import('./index');
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(process.exit).toHaveBeenCalledWith(1);
      consoleErrorSpy.mockRestore();
    });
  });
});
