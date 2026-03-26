import { Command } from 'commander';

// Mock the logger module
const mockLoggerTitle = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerSubTitle = jest.fn();
const mockLoggerSuccess = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerWarning = jest.fn();

jest.mock('../utils/logger', () => ({
  Logger: {
    title: (...args: unknown[]) => mockLoggerTitle(...args),
    info: (...args: unknown[]) => mockLoggerInfo(...args),
    subTitle: (...args: unknown[]) => mockLoggerSubTitle(...args),
    success: (...args: unknown[]) => mockLoggerSuccess(...args),
    error: (...args: unknown[]) => mockLoggerError(...args),
    warning: (...args: unknown[]) => mockLoggerWarning(...args),
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

    it('registers --api-key option', () => {
      evolveCommand(program);

      const evolveCmd = program.commands.find((cmd) => cmd.name() === 'evolve');
      const apiKeyOption = evolveCmd?.options.find((opt) => opt.long === '--api-key');

      expect(apiKeyOption).toBeDefined();
      expect(apiKeyOption?.description).toContain('OpenAI/Anthropic API key');
    });

    it('registers --model option with default empty string', () => {
      evolveCommand(program);

      const evolveCmd = program.commands.find((cmd) => cmd.name() === 'evolve');
      const modelOption = evolveCmd?.options.find((opt) => opt.long === '--model');

      expect(modelOption).toBeDefined();
      expect(modelOption?.defaultValue).toBe('');
    });
  });

  describe('command execution', () => {
    it('displays title and initial info on execution', async () => {
      mockRunSelfEvolution.mockResolvedValue({
        success: true,
        iterations: 1,
        improvements: ['test improvement'],
        errors: [],
      });

      evolveCommand(program);

      await program.parseAsync(['node', 'test', 'evolve']);

      expect(mockLoggerTitle).toHaveBeenCalledWith('ubuild Self-Evolution');
      expect(mockLoggerInfo).toHaveBeenCalledWith('Using OpenCode (default model)');
      expect(mockLoggerInfo).toHaveBeenCalledWith('Runs forever until Ctrl+C\n');
    });

    it('calls runSelfEvolution with default options', async () => {
      mockRunSelfEvolution.mockResolvedValue({
        success: true,
        iterations: 5,
        improvements: ['improvement 1'],
        errors: [],
      });

      evolveCommand(program);

      await program.parseAsync(['node', 'test', 'evolve']);

      expect(mockRunSelfEvolution).toHaveBeenCalledWith({
        interval: 5000,
        apiKey: undefined,
        model: '',
        logger: expect.any(Function),
      });
    });

    it('passes custom interval when provided', async () => {
      mockRunSelfEvolution.mockResolvedValue({
        success: true,
        iterations: 1,
        improvements: [],
        errors: [],
      });

      evolveCommand(program);

      await program.parseAsync(['node', 'test', 'evolve', '--interval', '10000']);

      expect(mockRunSelfEvolution).toHaveBeenCalledWith(
        expect.objectContaining({
          interval: 10000,
        })
      );
    });

    it('falls back to default interval when non-numeric string is provided', async () => {
      mockRunSelfEvolution.mockResolvedValue({
        success: true,
        iterations: 1,
        improvements: [],
        errors: [],
      });

      evolveCommand(program);

      await program.parseAsync(['node', 'test', 'evolve', '--interval', 'invalid']);

      expect(mockRunSelfEvolution).toHaveBeenCalledWith(
        expect.objectContaining({
          interval: 5000,
        })
      );
      expect(mockLoggerWarning).toHaveBeenCalledWith(
        'Invalid interval value, using default of 5000ms'
      );
    });

    it('falls back to default interval when value is less than 1000ms', async () => {
      mockRunSelfEvolution.mockResolvedValue({
        success: true,
        iterations: 1,
        improvements: [],
        errors: [],
      });

      evolveCommand(program);

      await program.parseAsync(['node', 'test', 'evolve', '--interval', '500']);

      expect(mockRunSelfEvolution).toHaveBeenCalledWith(
        expect.objectContaining({
          interval: 5000,
        })
      );
      expect(mockLoggerWarning).toHaveBeenCalledWith(
        'Invalid interval value, using default of 5000ms'
      );
    });

    it('falls back to default interval when value is negative', async () => {
      mockRunSelfEvolution.mockResolvedValue({
        success: true,
        iterations: 1,
        improvements: [],
        errors: [],
      });

      evolveCommand(program);

      await program.parseAsync(['node', 'test', 'evolve', '--interval', '-100']);

      expect(mockRunSelfEvolution).toHaveBeenCalledWith(
        expect.objectContaining({
          interval: 5000,
        })
      );
      expect(mockLoggerWarning).toHaveBeenCalledWith(
        'Invalid interval value, using default of 5000ms'
      );
    });

    it('accepts minimum valid interval of 1000ms', async () => {
      mockRunSelfEvolution.mockResolvedValue({
        success: true,
        iterations: 1,
        improvements: [],
        errors: [],
      });

      evolveCommand(program);

      await program.parseAsync(['node', 'test', 'evolve', '--interval', '1000']);

      expect(mockRunSelfEvolution).toHaveBeenCalledWith(
        expect.objectContaining({
          interval: 1000,
        })
      );
      expect(mockLoggerWarning).not.toHaveBeenCalled();
    });

    it('passes API key when provided', async () => {
      mockRunSelfEvolution.mockResolvedValue({
        success: true,
        iterations: 1,
        improvements: [],
        errors: [],
      });

      evolveCommand(program);

      await program.parseAsync(['node', 'test', 'evolve', '--api-key', 'sk-test123']);

      expect(mockRunSelfEvolution).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'sk-test123',
        })
      );
    });

    it('passes model when provided', async () => {
      mockRunSelfEvolution.mockResolvedValue({
        success: true,
        iterations: 1,
        improvements: [],
        errors: [],
      });

      evolveCommand(program);

      await program.parseAsync(['node', 'test', 'evolve', '--model', 'gpt-4']);

      expect(mockRunSelfEvolution).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4',
        })
      );
    });

    it('passes all options together', async () => {
      mockRunSelfEvolution.mockResolvedValue({
        success: true,
        iterations: 1,
        improvements: [],
        errors: [],
      });

      evolveCommand(program);

      await program.parseAsync([
        'node',
        'test',
        'evolve',
        '--api-key',
        'sk-test',
        '--model',
        'claude-3',
        '--interval',
        '15000',
      ]);

      expect(mockRunSelfEvolution).toHaveBeenCalledWith({
        interval: 15000,
        apiKey: 'sk-test',
        model: 'claude-3',
        logger: expect.any(Function),
      });
    });
  });

  describe('successful evolution output', () => {
    it('displays evolution summary on success', async () => {
      mockRunSelfEvolution.mockResolvedValue({
        success: true,
        iterations: 10,
        improvements: ['feat: add new feature', 'fix: resolve bug'],
        errors: [],
      });

      evolveCommand(program);

      await program.parseAsync(['node', 'test', 'evolve']);

      expect(mockLoggerSubTitle).toHaveBeenCalledWith('Evolution Summary');
      expect(mockLoggerInfo).toHaveBeenCalledWith('Total iterations: 10');
      expect(mockLoggerInfo).toHaveBeenCalledWith('Improvements: 2');
    });

    it('lists improvements when present', async () => {
      mockRunSelfEvolution.mockResolvedValue({
        success: true,
        iterations: 5,
        improvements: ['feat: new feature', 'fix: bug fix'],
        errors: [],
      });

      evolveCommand(program);

      await program.parseAsync(['node', 'test', 'evolve']);

      expect(mockLoggerSuccess).toHaveBeenCalledWith('Improvements made:');
      expect(mockLoggerInfo).toHaveBeenCalledWith('  - feat: new feature');
      expect(mockLoggerInfo).toHaveBeenCalledWith('  - fix: bug fix');
    });

    it('does not list improvements section when empty', async () => {
      mockRunSelfEvolution.mockResolvedValue({
        success: true,
        iterations: 3,
        improvements: [],
        errors: [],
      });

      evolveCommand(program);

      await program.parseAsync(['node', 'test', 'evolve']);

      expect(mockLoggerSuccess).not.toHaveBeenCalledWith('Improvements made:');
    });

    it('exits with code 0 on success', async () => {
      mockRunSelfEvolution.mockResolvedValue({
        success: true,
        iterations: 1,
        improvements: [],
        errors: [],
      });

      evolveCommand(program);

      await program.parseAsync(['node', 'test', 'evolve']);

      expect(process.exit).toHaveBeenCalledWith(0);
    });
  });

  describe('failed evolution output', () => {
    it('lists errors when present', async () => {
      mockRunSelfEvolution.mockResolvedValue({
        success: false,
        iterations: 5,
        improvements: [],
        errors: ['Error: Build failed', 'Error: Tests failed'],
      });

      evolveCommand(program);

      await program.parseAsync(['node', 'test', 'evolve']);

      expect(mockLoggerError).toHaveBeenCalledWith('Errors:');
      expect(mockLoggerError).toHaveBeenCalledWith('  - Error: Build failed');
      expect(mockLoggerError).toHaveBeenCalledWith('  - Error: Tests failed');
    });

    it('does not list errors section when empty', async () => {
      mockRunSelfEvolution.mockResolvedValue({
        success: true,
        iterations: 1,
        improvements: [],
        errors: [],
      });

      evolveCommand(program);

      await program.parseAsync(['node', 'test', 'evolve']);

      const errorCalls = mockLoggerError.mock.calls.filter((call) => call[0] === 'Errors:');
      expect(errorCalls).toHaveLength(0);
    });

    it('exits with code 1 when evolution fails', async () => {
      mockRunSelfEvolution.mockResolvedValue({
        success: false,
        iterations: 3,
        improvements: [],
        errors: ['Some error'],
      });

      evolveCommand(program);

      await program.parseAsync(['node', 'test', 'evolve']);

      expect(process.exit).toHaveBeenCalledWith(1);
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

    it('handles null/undefined exceptions', async () => {
      mockRunSelfEvolution.mockRejectedValue(null);

      evolveCommand(program);

      await program.parseAsync(['node', 'test', 'evolve']);

      expect(mockLoggerError).toHaveBeenCalledWith('Error: null');
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
        return Promise.resolve({
          success: true,
          iterations: 1,
          improvements: [],
          errors: [],
        });
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
        return Promise.resolve({
          success: true,
          iterations: 3,
          improvements: [],
          errors: [],
        });
      });

      evolveCommand(program);

      await program.parseAsync(['node', 'test', 'evolve']);

      expect(mockLoggerInfo).toHaveBeenCalledWith('Message 1');
      expect(mockLoggerInfo).toHaveBeenCalledWith('Message 2');
      expect(mockLoggerInfo).toHaveBeenCalledWith('Message 3');
    });
  });
});
