import { Command } from 'commander';

// Mock the logger module
const mockLoggerTitle = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerWarning = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('../utils/logger', () => ({
  Logger: {
    title: (...args: unknown[]) => mockLoggerTitle(...args),
    info: (...args: unknown[]) => mockLoggerInfo(...args),
    warning: (...args: unknown[]) => mockLoggerWarning(...args),
    error: (...args: unknown[]) => mockLoggerError(...args),
  },
}));

// Mock runSelfEvolution
const mockRunSelfEvolution = jest.fn();

jest.mock('../core/self-driver', () => ({
  runSelfEvolution: (...args: unknown[]) => mockRunSelfEvolution(...args),
}));

// Mock fs-extra
const mockPathExists = jest.fn();

jest.mock('fs-extra', () => ({
  pathExists: (...args: unknown[]) => mockPathExists(...args),
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
        sleepMs: undefined,
        useTsNode: undefined,
        verifyTimeoutMs: undefined,
        opencodeTimeoutMs: undefined,
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
          sleepMs: undefined,
          useTsNode: undefined,
          verifyTimeoutMs: undefined,
          opencodeTimeoutMs: undefined,
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
          sleepMs: undefined,
          useTsNode: undefined,
          verifyTimeoutMs: undefined,
          opencodeTimeoutMs: undefined,
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
          sleepMs: undefined,
          useTsNode: undefined,
          verifyTimeoutMs: undefined,
          opencodeTimeoutMs: undefined,
        });
      });
    });

    describe('--sleep option', () => {
      it('registers the --sleep option', () => {
        evolveCommand(program);

        const commands = program.commands;
        const evolveCmd = commands.find((cmd) => cmd.name() === 'evolve');

        expect(evolveCmd).toBeDefined();
        const sleepOption = evolveCmd?.options.find((opt) => opt.long === '--sleep');
        expect(sleepOption).toBeDefined();
      });

      it('passes sleepMs to runSelfEvolution when --sleep is used', async () => {
        mockRunSelfEvolution.mockResolvedValue(undefined);

        evolveCommand(program);

        await program.parseAsync(['node', 'test', 'evolve', '--sleep', '10000']);

        expect(mockRunSelfEvolution).toHaveBeenCalledWith({
          logger: expect.any(Function),
          once: undefined,
          dryRun: undefined,
          sleepMs: 10000,
          useTsNode: undefined,
          verifyTimeoutMs: undefined,
          opencodeTimeoutMs: undefined,
        });
      });

      it('can combine --sleep with --once', async () => {
        mockRunSelfEvolution.mockResolvedValue(undefined);

        evolveCommand(program);

        await program.parseAsync(['node', 'test', 'evolve', '--sleep', '5000', '--once']);

        expect(mockRunSelfEvolution).toHaveBeenCalledWith({
          logger: expect.any(Function),
          once: true,
          dryRun: undefined,
          sleepMs: 5000,
          useTsNode: undefined,
          verifyTimeoutMs: undefined,
          opencodeTimeoutMs: undefined,
        });
      });
    });

    describe('--use-ts-node option', () => {
      it('registers the --use-ts-node option', () => {
        evolveCommand(program);

        const commands = program.commands;
        const evolveCmd = commands.find((cmd) => cmd.name() === 'evolve');

        expect(evolveCmd).toBeDefined();
        const useTsNodeOption = evolveCmd?.options.find((opt) => opt.long === '--use-ts-node');
        expect(useTsNodeOption).toBeDefined();
      });

      it('passes useTsNode: true to runSelfEvolution when --use-ts-node is used', async () => {
        mockRunSelfEvolution.mockResolvedValue(undefined);

        evolveCommand(program);

        await program.parseAsync(['node', 'test', 'evolve', '--use-ts-node']);

        expect(mockRunSelfEvolution).toHaveBeenCalledWith({
          logger: expect.any(Function),
          once: undefined,
          dryRun: undefined,
          sleepMs: undefined,
          useTsNode: true,
          verifyTimeoutMs: undefined,
          opencodeTimeoutMs: undefined,
        });
      });

      it('can combine --use-ts-node with other options', async () => {
        mockRunSelfEvolution.mockResolvedValue(undefined);

        evolveCommand(program);

        await program.parseAsync([
          'node',
          'test',
          'evolve',
          '--use-ts-node',
          '--once',
          '--dry-run',
        ]);

        expect(mockRunSelfEvolution).toHaveBeenCalledWith({
          logger: expect.any(Function),
          once: true,
          dryRun: true,
          sleepMs: undefined,
          useTsNode: true,
          verifyTimeoutMs: undefined,
          opencodeTimeoutMs: undefined,
        });
      });
    });

    describe('--verify-timeout option', () => {
      it('registers the --verify-timeout option', () => {
        evolveCommand(program);

        const commands = program.commands;
        const evolveCmd = commands.find((cmd) => cmd.name() === 'evolve');

        expect(evolveCmd).toBeDefined();
        const verifyTimeoutOption = evolveCmd?.options.find(
          (opt) => opt.long === '--verify-timeout'
        );
        expect(verifyTimeoutOption).toBeDefined();
      });

      it('passes verifyTimeoutMs to runSelfEvolution when --verify-timeout is used', async () => {
        mockRunSelfEvolution.mockResolvedValue(undefined);

        evolveCommand(program);

        await program.parseAsync(['node', 'test', 'evolve', '--verify-timeout', '120000']);

        expect(mockRunSelfEvolution).toHaveBeenCalledWith({
          logger: expect.any(Function),
          once: undefined,
          dryRun: undefined,
          sleepMs: undefined,
          useTsNode: undefined,
          verifyTimeoutMs: 120000,
        });
      });
    });

    describe('--opencode-timeout option', () => {
      it('registers the --opencode-timeout option', () => {
        evolveCommand(program);

        const commands = program.commands;
        const evolveCmd = commands.find((cmd) => cmd.name() === 'evolve');

        expect(evolveCmd).toBeDefined();
        const opencodeTimeoutOption = evolveCmd?.options.find(
          (opt) => opt.long === '--opencode-timeout'
        );
        expect(opencodeTimeoutOption).toBeDefined();
      });

      it('passes opencodeTimeoutMs to runSelfEvolution when --opencode-timeout is used', async () => {
        mockRunSelfEvolution.mockResolvedValue(undefined);

        evolveCommand(program);

        await program.parseAsync(['node', 'test', 'evolve', '--opencode-timeout', '900000']);

        expect(mockRunSelfEvolution).toHaveBeenCalledWith({
          logger: expect.any(Function),
          once: undefined,
          dryRun: undefined,
          sleepMs: undefined,
          useTsNode: undefined,
          verifyTimeoutMs: undefined,
          opencodeTimeoutMs: 900000,
        });
      });

      it('can combine both timeout options', async () => {
        mockRunSelfEvolution.mockResolvedValue(undefined);

        evolveCommand(program);

        await program.parseAsync([
          'node',
          'test',
          'evolve',
          '--verify-timeout',
          '120000',
          '--opencode-timeout',
          '900000',
        ]);

        expect(mockRunSelfEvolution).toHaveBeenCalledWith({
          logger: expect.any(Function),
          once: undefined,
          dryRun: undefined,
          sleepMs: undefined,
          useTsNode: undefined,
          verifyTimeoutMs: 120000,
          opencodeTimeoutMs: 900000,
        });
      });
    });
  });

  describe('parsePositiveInt validation', () => {
    beforeEach(() => {
      mockRunSelfEvolution.mockResolvedValue(undefined);
      evolveCommand(program);
    });

    describe('--sleep option validation', () => {
      it('accepts valid positive integer', async () => {
        await program.parseAsync(['node', 'test', 'evolve', '--sleep', '10000']);
        expect(mockRunSelfEvolution).toHaveBeenCalledWith(
          expect.objectContaining({ sleepMs: 10000 })
        );
      });

      it('throws error for non-numeric value', async () => {
        await expect(
          program.parseAsync(['node', 'test', 'evolve', '--sleep', 'abc'])
        ).rejects.toThrow('--sleep must be a positive integer, got: abc');
      });

      it('throws error for zero value', async () => {
        await expect(
          program.parseAsync(['node', 'test', 'evolve', '--sleep', '0'])
        ).rejects.toThrow('--sleep must be a positive integer, got: 0');
      });

      it('throws error for negative value', async () => {
        await expect(
          program.parseAsync(['node', 'test', 'evolve', '--sleep', '-100'])
        ).rejects.toThrow('--sleep must be a positive integer, got: -100');
      });

      it('throws error for float value', async () => {
        await expect(
          program.parseAsync(['node', 'test', 'evolve', '--sleep', '5.5'])
        ).rejects.toThrow('--sleep must be an integer, got: 5.5');
      });

      it('throws error for float string value', async () => {
        await expect(
          program.parseAsync(['node', 'test', 'evolve', '--sleep', '10.5'])
        ).rejects.toThrow('--sleep must be an integer, got: 10.5');
      });

      it('accepts minimum valid value of 1', async () => {
        await program.parseAsync(['node', 'test', 'evolve', '--sleep', '1']);
        expect(mockRunSelfEvolution).toHaveBeenCalledWith(expect.objectContaining({ sleepMs: 1 }));
      });
    });

    describe('--verify-timeout option validation', () => {
      it('accepts valid positive integer', async () => {
        await program.parseAsync(['node', 'test', 'evolve', '--verify-timeout', '120000']);
        expect(mockRunSelfEvolution).toHaveBeenCalledWith(
          expect.objectContaining({ verifyTimeoutMs: 120000 })
        );
      });

      it('throws error for non-numeric value', async () => {
        await expect(
          program.parseAsync(['node', 'test', 'evolve', '--verify-timeout', 'abc'])
        ).rejects.toThrow('--verify-timeout must be a positive integer, got: abc');
      });

      it('throws error for zero value', async () => {
        await expect(
          program.parseAsync(['node', 'test', 'evolve', '--verify-timeout', '0'])
        ).rejects.toThrow('--verify-timeout must be a positive integer, got: 0');
      });

      it('throws error for negative value', async () => {
        await expect(
          program.parseAsync(['node', 'test', 'evolve', '--verify-timeout', '-1000'])
        ).rejects.toThrow('--verify-timeout must be a positive integer, got: -1000');
      });

      it('throws error for float value', async () => {
        await expect(
          program.parseAsync(['node', 'test', 'evolve', '--verify-timeout', '60.5'])
        ).rejects.toThrow('--verify-timeout must be an integer, got: 60.5');
      });
    });

    describe('--opencode-timeout option validation', () => {
      it('accepts valid positive integer', async () => {
        await program.parseAsync(['node', 'test', 'evolve', '--opencode-timeout', '900000']);
        expect(mockRunSelfEvolution).toHaveBeenCalledWith(
          expect.objectContaining({ opencodeTimeoutMs: 900000 })
        );
      });

      it('throws error for non-numeric value', async () => {
        await expect(
          program.parseAsync(['node', 'test', 'evolve', '--opencode-timeout', 'abc'])
        ).rejects.toThrow('--opencode-timeout must be a positive integer, got: abc');
      });

      it('throws error for zero value', async () => {
        await expect(
          program.parseAsync(['node', 'test', 'evolve', '--opencode-timeout', '0'])
        ).rejects.toThrow('--opencode-timeout must be a positive integer, got: 0');
      });

      it('throws error for negative value', async () => {
        await expect(
          program.parseAsync(['node', 'test', 'evolve', '--opencode-timeout', '-500'])
        ).rejects.toThrow('--opencode-timeout must be a positive integer, got: -500');
      });

      it('throws error for float value', async () => {
        await expect(
          program.parseAsync(['node', 'test', 'evolve', '--opencode-timeout', '600.7'])
        ).rejects.toThrow('--opencode-timeout must be an integer, got: 600.7');
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

  describe('EVOLVE.md pre-flight check', () => {
    it('warns when EVOLVE.md does not exist', async () => {
      mockPathExists.mockResolvedValue(false);
      mockRunSelfEvolution.mockResolvedValue(undefined);

      evolveCommand(program);

      await program.parseAsync(['node', 'test', 'evolve']);

      expect(mockLoggerWarning).toHaveBeenCalledWith(
        'Warning: EVOLVE.md not found in project root'
      );
      expect(mockLoggerWarning).toHaveBeenCalledWith(
        '  Evolution will proceed without constitution guidance'
      );
    });

    it('does not warn when EVOLVE.md exists', async () => {
      mockPathExists.mockResolvedValue(true);
      mockRunSelfEvolution.mockResolvedValue(undefined);

      evolveCommand(program);

      await program.parseAsync(['node', 'test', 'evolve']);

      expect(mockLoggerWarning).not.toHaveBeenCalled();
    });
  });
});
