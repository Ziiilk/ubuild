import { Command } from 'commander';

// Mock the logger module
const mockLoggerTitle = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('../utils/logger', () => ({
  Logger: {
    title: (...args: unknown[]) => mockLoggerTitle(...args),
    info: (...args: unknown[]) => mockLoggerInfo(...args),
    error: (...args: unknown[]) => mockLoggerError(...args),
  },
}));

// Mock runSelfEvolution
const mockRunSelfEvolution = jest.fn();

jest.mock('../core/self-driver', () => ({
  runSelfEvolution: (...args: unknown[]) => mockRunSelfEvolution(...args),
}));

// Import after mocking
import { evolveCommand } from './evolve';

describe('evolveCommand', () => {
  let program: Command;
  let originalExit: typeof process.exit;

  beforeEach(() => {
    jest.clearAllMocks();
    program = new Command();
    originalExit = process.exit;
    // Mock process.exit to prevent test from exiting
    process.exit = jest.fn() as unknown as typeof process.exit;
  });

  afterEach(() => {
    process.exit = originalExit;
  });

  describe('command registration', () => {
    it('registers the evolve command with correct name and description', () => {
      evolveCommand(program);

      const commands = program.commands;
      const evolveCmd = commands.find((cmd) => cmd.name() === 'evolve');

      expect(evolveCmd).toBeDefined();
      expect(evolveCmd?.description()).toContain('Self-evolve ubuild using OpenCode');
    });
  });

  describe('command execution', () => {
    it('displays title and initial info on execution', async () => {
      mockRunSelfEvolution.mockResolvedValue(undefined);

      evolveCommand(program);

      await program.parseAsync(['node', 'test', 'evolve']);

      expect(mockLoggerTitle).toHaveBeenCalledWith('ubuild Self-Evolution');
      expect(mockLoggerInfo).toHaveBeenCalledWith('Using OpenCode (default model)');
      expect(mockLoggerInfo).toHaveBeenCalledWith('Runs forever until Ctrl+C\n');
    });

    it('calls runSelfEvolution with logger option', async () => {
      mockRunSelfEvolution.mockResolvedValue(undefined);

      evolveCommand(program);

      await program.parseAsync(['node', 'test', 'evolve']);

      expect(mockRunSelfEvolution).toHaveBeenCalledWith({
        logger: expect.any(Function),
        once: undefined,
        dryRun: undefined,
      });
    });

    describe('--once option', () => {
      it('registers the --once option', () => {
        evolveCommand(program);

        const commands = program.commands;
        const evolveCmd = commands.find((cmd) => cmd.name() === 'evolve');

        expect(evolveCmd).toBeDefined();
        const onceOption = evolveCmd?.options.find((opt) => opt.long === '--once');
        expect(onceOption).toBeDefined();
      });

      it('displays single iteration mode when --once is used', async () => {
        mockRunSelfEvolution.mockResolvedValue(undefined);

        evolveCommand(program);

        await program.parseAsync(['node', 'test', 'evolve', '--once']);

        expect(mockLoggerTitle).toHaveBeenCalledWith('ubuild Self-Evolution');
        expect(mockLoggerInfo).toHaveBeenCalledWith('Mode: Single iteration (--once)\n');
      });

      it('passes once: true to runSelfEvolution when --once is used', async () => {
        mockRunSelfEvolution.mockResolvedValue(undefined);

        evolveCommand(program);

        await program.parseAsync(['node', 'test', 'evolve', '--once']);

        expect(mockRunSelfEvolution).toHaveBeenCalledWith({
          logger: expect.any(Function),
          once: true,
          dryRun: undefined,
        });
      });
    });

    describe('--dry-run option', () => {
      it('registers the --dry-run option', () => {
        evolveCommand(program);

        const commands = program.commands;
        const evolveCmd = commands.find((cmd) => cmd.name() === 'evolve');

        expect(evolveCmd).toBeDefined();
        const dryRunOption = evolveCmd?.options.find((opt) => opt.long === '--dry-run');
        expect(dryRunOption).toBeDefined();
      });

      it('passes dryRun: true to runSelfEvolution when --dry-run is used', async () => {
        mockRunSelfEvolution.mockResolvedValue(undefined);

        evolveCommand(program);

        await program.parseAsync(['node', 'test', 'evolve', '--dry-run']);

        expect(mockRunSelfEvolution).toHaveBeenCalledWith({
          logger: expect.any(Function),
          once: undefined,
          dryRun: true,
        });
      });

      it('can combine --dry-run with --once', async () => {
        mockRunSelfEvolution.mockResolvedValue(undefined);

        evolveCommand(program);

        await program.parseAsync(['node', 'test', 'evolve', '--dry-run', '--once']);

        expect(mockRunSelfEvolution).toHaveBeenCalledWith({
          logger: expect.any(Function),
          once: true,
          dryRun: true,
        });
      });
    });
  });

  describe('error handling', () => {
    it('logs error and exits with code 1 on exception', async () => {
      mockRunSelfEvolution.mockRejectedValue(new Error('Network error'));

      evolveCommand(program);

      await program.parseAsync(['node', 'test', 'evolve']);

      expect(mockLoggerError).toHaveBeenCalledWith('Error: Network error');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('handles non-Error exceptions', async () => {
      mockRunSelfEvolution.mockRejectedValue('String error');

      evolveCommand(program);

      await program.parseAsync(['node', 'test', 'evolve']);

      expect(mockLoggerError).toHaveBeenCalledWith('Error: String error');
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  describe('logger callback', () => {
    it('passes logger function that uses Logger.info', async () => {
      mockRunSelfEvolution.mockImplementation((options) => {
        // Call the logger to test it works
        if (options.logger) {
          options.logger('Test log message');
        }
        return Promise.resolve(undefined);
      });

      evolveCommand(program);

      await program.parseAsync(['node', 'test', 'evolve']);

      expect(mockLoggerInfo).toHaveBeenCalledWith('Test log message');
    });

    it('logger function can be called multiple times', async () => {
      mockRunSelfEvolution.mockImplementation((options) => {
        if (options.logger) {
          options.logger('Message 1');
          options.logger('Message 2');
          options.logger('Message 3');
        }
        return Promise.resolve(undefined);
      });

      evolveCommand(program);

      await program.parseAsync(['node', 'test', 'evolve']);

      expect(mockLoggerInfo).toHaveBeenCalledWith('Message 1');
      expect(mockLoggerInfo).toHaveBeenCalledWith('Message 2');
      expect(mockLoggerInfo).toHaveBeenCalledWith('Message 3');
    });
  });
});
