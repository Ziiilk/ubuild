import { SelfDriver, SelfEvolverOptions, runSelfEvolution } from './self-driver';

const mockExeca = jest.fn<
  Promise<{ exitCode: number; stdout: string; stderr: string }>,
  [string, string[]?, Record<string, unknown>?]
>();

const mockPathExists = jest.fn();
const mockReadFile = jest.fn();

jest.mock('execa', () => ({
  execa: (...args: [string, string[]?, Record<string, unknown>?]) => mockExeca(...args),
}));

jest.mock('fs-extra', () => ({
  pathExists: (...args: unknown[]) => mockPathExists(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

let driver: SelfDriver;
const originalCwd = process.cwd;
const mockProjectRoot = 'C:\\Projects\\ubuild';

const mockExecaResult = (
  exitCode: number,
  stdout = '',
  stderr = ''
): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> =>
  Promise.resolve({
    exitCode,
    stdout,
    stderr,
  });

describe('SelfDriver', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.cwd = jest.fn().mockReturnValue(mockProjectRoot);

    // Default mock implementations - all passing
    mockExeca.mockImplementation(async (command: string, args?: string[]) => {
      const fullCommand = `${command} ${args?.join(' ') ?? ''}`;

      if (fullCommand.includes('npm test')) {
        return mockExecaResult(0, 'Test Suites: 10 passed', '');
      }
      if (fullCommand.includes('npm run lint')) {
        return mockExecaResult(0, '', '');
      }
      if (fullCommand.includes('npm run build')) {
        return mockExecaResult(0, '', '');
      }
      if (fullCommand.includes('evolve --help')) {
        return mockExecaResult(0, 'Usage: evolve [options]', '');
      }
      if (
        fullCommand.includes('list --help') ||
        fullCommand.includes('engine --help') ||
        fullCommand.includes('build --help')
      ) {
        return mockExecaResult(0, 'Usage: [command] [options]', '');
      }
      if (command === 'git') {
        if (args?.includes('status')) {
          return mockExecaResult(0, '', ''); // No changes
        }
        if (args?.includes('add') || args?.includes('commit') || args?.includes('checkout')) {
          return mockExecaResult(0, '', '');
        }
        if (args?.includes('ls-files')) {
          return mockExecaResult(0, 'src/core/self-driver.ts\nsrc/commands/evolve.ts', '');
        }
      }
      if (command === 'opencode') {
        return mockExecaResult(0, '', '');
      }

      return mockExecaResult(0, '', '');
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.cwd = originalCwd;
    // Cleanup signal handlers to prevent memory leaks
    if (driver) {
      driver.cleanup();
    }
  });

  describe('constructor', () => {
    it('creates driver with default options', () => {
      driver = new SelfDriver();
      expect(driver).toBeDefined();
    });

    it('creates driver with custom logger', () => {
      const customLogger = jest.fn();
      const options: SelfEvolverOptions = {
        logger: customLogger,
      };
      driver = new SelfDriver(options);
      expect(driver).toBeDefined();
    });

    it('creates driver with once option set to true', () => {
      const options: SelfEvolverOptions = {
        once: true,
      };
      driver = new SelfDriver(options);
      expect(driver).toBeDefined();
    });

    it('creates driver with once option set to false', () => {
      const options: SelfEvolverOptions = {
        once: false,
      };
      driver = new SelfDriver(options);
      expect(driver).toBeDefined();
    });

    it('creates driver with dryRun option set to true', () => {
      const options: SelfEvolverOptions = {
        dryRun: true,
      };
      driver = new SelfDriver(options);
      expect(driver).toBeDefined();
    });

    it('creates driver with dryRun option set to false', () => {
      const options: SelfEvolverOptions = {
        dryRun: false,
      };
      driver = new SelfDriver(options);
      expect(driver).toBeDefined();
    });

    it('creates driver with both once and dryRun options', () => {
      const options: SelfEvolverOptions = {
        once: true,
        dryRun: true,
      };
      driver = new SelfDriver(options);
      expect(driver).toBeDefined();
    });

    it('creates driver with custom verifyTimeoutMs', () => {
      const options: SelfEvolverOptions = {
        verifyTimeoutMs: 120000,
      };
      driver = new SelfDriver(options);
      expect(driver).toBeDefined();
    });

    it('creates driver with custom opencodeTimeoutMs', () => {
      const options: SelfEvolverOptions = {
        opencodeTimeoutMs: 900000,
      };
      driver = new SelfDriver(options);
      expect(driver).toBeDefined();
    });

    it('creates driver with both timeout options', () => {
      const options: SelfEvolverOptions = {
        verifyTimeoutMs: 120000,
        opencodeTimeoutMs: 900000,
      };
      driver = new SelfDriver(options);
      expect(driver).toBeDefined();
    });

    it('creates driver with all options', () => {
      const options: SelfEvolverOptions = {
        logger: jest.fn(),
        once: true,
        dryRun: false,
        verifyTimeoutMs: 120000,
        opencodeTimeoutMs: 900000,
      };
      driver = new SelfDriver(options);
      expect(driver).toBeDefined();
    });

    it('creates driver with custom sleepMs', () => {
      const options: SelfEvolverOptions = {
        sleepMs: 10000,
      };
      driver = new SelfDriver(options);
      expect(driver).toBeDefined();
    });

    it('creates driver with all options including sleepMs', () => {
      const options: SelfEvolverOptions = {
        logger: jest.fn(),
        once: true,
        dryRun: false,
        verifyTimeoutMs: 120000,
        opencodeTimeoutMs: 900000,
        sleepMs: 10000,
      };
      driver = new SelfDriver(options);
      expect(driver).toBeDefined();
    });

    it('creates driver with useTsNode option set to true', () => {
      const options: SelfEvolverOptions = {
        useTsNode: true,
      };
      driver = new SelfDriver(options);
      expect(driver).toBeDefined();
    });

    it('creates driver with useTsNode option set to false', () => {
      const options: SelfEvolverOptions = {
        useTsNode: false,
      };
      driver = new SelfDriver(options);
      expect(driver).toBeDefined();
    });

    it('creates driver with all options including useTsNode', () => {
      const options: SelfEvolverOptions = {
        logger: jest.fn(),
        once: true,
        dryRun: false,
        verifyTimeoutMs: 120000,
        opencodeTimeoutMs: 900000,
        sleepMs: 10000,
        useTsNode: true,
      };
      driver = new SelfDriver(options);
      expect(driver).toBeDefined();
    });

    it('creates driver with maxRetries option', () => {
      const options: SelfEvolverOptions = {
        maxRetries: 10,
      };
      driver = new SelfDriver(options);
      expect(driver).toBeDefined();
    });

    it('creates driver with unlimited retries (maxRetries = -1)', () => {
      const options: SelfEvolverOptions = {
        maxRetries: -1,
      };
      driver = new SelfDriver(options);
      expect(driver).toBeDefined();
    });

    it('creates driver with all options including maxRetries', () => {
      const options: SelfEvolverOptions = {
        logger: jest.fn(),
        once: true,
        dryRun: false,
        verifyTimeoutMs: 120000,
        opencodeTimeoutMs: 900000,
        sleepMs: 10000,
        useTsNode: true,
        maxRetries: 3,
      };
      driver = new SelfDriver(options);
      expect(driver).toBeDefined();
    });

    it('creates driver with custom projectRoot', () => {
      const options: SelfEvolverOptions = {
        projectRoot: '/custom/project/path',
      };
      driver = new SelfDriver(options);
      expect(driver).toBeDefined();
      const status = driver.getStatus();
      expect(status.projectRoot).toBe('/custom/project/path');
    });

    it('getStatus returns iterationCount starting at 0', () => {
      driver = new SelfDriver();
      const status = driver.getStatus();
      expect(status.iterationCount).toBe(0);
    });

    it('creates driver with all options including projectRoot', () => {
      const options: SelfEvolverOptions = {
        logger: jest.fn(),
        once: true,
        dryRun: false,
        verifyTimeoutMs: 120000,
        opencodeTimeoutMs: 900000,
        sleepMs: 10000,
        useTsNode: true,
        maxRetries: 3,
        projectRoot: '/custom/project/path',
      };
      driver = new SelfDriver(options);
      expect(driver).toBeDefined();
      const status = driver.getStatus();
      expect(status.projectRoot).toBe('/custom/project/path');
    });

    it('creates driver with keepUntracked option', () => {
      const options: SelfEvolverOptions = {
        keepUntracked: true,
      };
      driver = new SelfDriver(options);
      expect(driver).toBeDefined();
    });

    it('creates driver with all options including keepUntracked', () => {
      const options: SelfEvolverOptions = {
        logger: jest.fn(),
        once: true,
        dryRun: false,
        verifyTimeoutMs: 120000,
        opencodeTimeoutMs: 900000,
        sleepMs: 10000,
        useTsNode: true,
        maxRetries: 3,
        projectRoot: '/custom/project/path',
        keepUntracked: true,
      };
      driver = new SelfDriver(options);
      expect(driver).toBeDefined();
    });
  });

  describe('constructor validation', () => {
    it('throws error when sleepMs is zero', () => {
      expect(() => {
        driver = new SelfDriver({ sleepMs: 0 });
      }).toThrow('Invalid sleepMs: 0. Must be a positive number.');
    });

    it('throws error when sleepMs is negative', () => {
      expect(() => {
        driver = new SelfDriver({ sleepMs: -1000 });
      }).toThrow('Invalid sleepMs: -1000. Must be a positive number.');
    });

    it('throws error when maxRetries is less than -1', () => {
      expect(() => {
        driver = new SelfDriver({ maxRetries: -2 });
      }).toThrow('Invalid maxRetries: -2. Must be >= -1 (-1 for unlimited).');
    });

    it('throws error when verifyTimeoutMs is zero', () => {
      expect(() => {
        driver = new SelfDriver({ verifyTimeoutMs: 0 });
      }).toThrow('Invalid verifyTimeoutMs: 0. Must be a positive number.');
    });

    it('throws error when opencodeTimeoutMs is negative', () => {
      expect(() => {
        driver = new SelfDriver({ opencodeTimeoutMs: -100 });
      }).toThrow('Invalid opencodeTimeoutMs: -100. Must be a positive number.');
    });

    it('accepts maxRetries of -1 for unlimited retries', () => {
      expect(() => {
        driver = new SelfDriver({ maxRetries: -1 });
      }).not.toThrow();
    });
  });

  describe('verify', () => {
    beforeEach(() => {
      driver = new SelfDriver();
    });

    it('returns true when all checks pass', async () => {
      // Access private method via type assertion
      const verify = (driver as unknown as { verify: () => Promise<boolean> }).verify;
      const result = await verify.call(driver);
      expect(result).toBe(true);
    });

    it('returns false when build fails', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'npm' && args?.includes('run') && args?.includes('build')) {
          return mockExecaResult(1, 'Build failed', '');
        }
        return mockExecaResult(0, '', '');
      });

      const verify = (driver as unknown as { verify: () => Promise<boolean> }).verify;
      const result = await verify.call(driver);
      expect(result).toBe(false);
    });

    it('returns false when tests fail', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'npm' && args?.includes('test')) {
          return mockExecaResult(1, 'Tests failed', '');
        }
        return mockExecaResult(0, '', '');
      });

      const verify = (driver as unknown as { verify: () => Promise<boolean> }).verify;
      const result = await verify.call(driver);
      expect(result).toBe(false);
    });

    it('returns false when lint fails', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'npm' && args?.includes('run') && args?.includes('lint')) {
          return mockExecaResult(1, 'Lint errors', '');
        }
        return mockExecaResult(0, '', '');
      });

      const verify = (driver as unknown as { verify: () => Promise<boolean> }).verify;
      const result = await verify.call(driver);
      expect(result).toBe(false);
    });

    it('returns false when evolve command fails', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'node' && args?.includes('dist/cli/index.js') && args?.includes('evolve')) {
          return mockExecaResult(1, 'Command failed', '');
        }
        return mockExecaResult(0, '', '');
      });

      const verify = (driver as unknown as { verify: () => Promise<boolean> }).verify;
      const result = await verify.call(driver);
      expect(result).toBe(false);
    });

    it('returns false when list command fails', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'node' && args?.includes('dist/cli/index.js') && args?.includes('list')) {
          return mockExecaResult(1, 'Command failed', '');
        }
        return mockExecaResult(0, '', '');
      });

      const verify = (driver as unknown as { verify: () => Promise<boolean> }).verify;
      const result = await verify.call(driver);
      expect(result).toBe(false);
    });

    it('handles execution errors gracefully', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'npm' && args?.includes('test')) {
          throw new Error('npm not found');
        }
        return mockExecaResult(0, '', '');
      });

      const verify = (driver as unknown as { verify: () => Promise<boolean> }).verify;
      const result = await verify.call(driver);
      expect(result).toBe(false);
    });

    it('logs stderr and stdout when verification fails', async () => {
      const mockLogger = jest.fn();
      driver = new SelfDriver({ logger: mockLogger });

      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'npm' && args?.includes('run') && args?.includes('build')) {
          return mockExecaResult(1, 'Build output here', 'Build error: something went wrong');
        }
        return mockExecaResult(0, '', '');
      });

      const verify = (driver as unknown as { verify: () => Promise<boolean> }).verify;
      const result = await verify.call(driver);

      expect(result).toBe(false);
      expect(mockLogger).toHaveBeenCalledWith('     Error: Build error: something went wrong');
      expect(mockLogger).toHaveBeenCalledWith('     Output: Build output here');
    });

    it('logs only stdout when verification fails without stderr', async () => {
      const mockLogger = jest.fn();
      driver = new SelfDriver({ logger: mockLogger });

      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'npm' && args?.includes('run') && args?.includes('build')) {
          return mockExecaResult(1, 'Build failed with this output', '');
        }
        return mockExecaResult(0, '', '');
      });

      const verify = (driver as unknown as { verify: () => Promise<boolean> }).verify;
      const result = await verify.call(driver);

      expect(result).toBe(false);
      expect(mockLogger).toHaveBeenCalledWith('     Output: Build failed with this output');
    });

    it('uses ts-node for verification when useTsNode is true', async () => {
      driver = new SelfDriver({ useTsNode: true });

      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'npx' && args?.includes('ts-node')) {
          return mockExecaResult(0, 'Usage: [command] [options]', '');
        }
        if (command === 'npm') {
          return mockExecaResult(0, '', '');
        }
        return mockExecaResult(0, '', '');
      });

      const verify = (driver as unknown as { verify: () => Promise<boolean> }).verify;
      const result = await verify.call(driver);
      expect(result).toBe(true);
      expect(mockExeca).toHaveBeenCalledWith(
        'npx',
        ['ts-node', 'src/cli/index.ts', 'list', '--help'],
        expect.any(Object)
      );
    });
  });

  describe('isWorkingTreeClean', () => {
    beforeEach(() => {
      driver = new SelfDriver();
    });

    it('returns false when git status shows changes', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'git' && args?.includes('status') && args?.includes('--porcelain')) {
          return mockExecaResult(0, 'M src/core/example.ts', '');
        }
        return mockExecaResult(0, '', '');
      });

      const isWorkingTreeClean = (
        driver as unknown as { isWorkingTreeClean: () => Promise<boolean> }
      ).isWorkingTreeClean;
      const result = await isWorkingTreeClean.call(driver);

      expect(result).toBe(false);
    });

    it('returns true when git status is empty', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'git' && args?.includes('status') && args?.includes('--porcelain')) {
          return mockExecaResult(0, '', '');
        }
        return mockExecaResult(0, '', '');
      });

      const isWorkingTreeClean = (
        driver as unknown as { isWorkingTreeClean: () => Promise<boolean> }
      ).isWorkingTreeClean;
      const result = await isWorkingTreeClean.call(driver);

      expect(result).toBe(true);
    });

    it('returns false when git command fails', async () => {
      mockExeca.mockImplementation(async () => {
        throw new Error('Not a git repository');
      });

      const isWorkingTreeClean = (
        driver as unknown as { isWorkingTreeClean: () => Promise<boolean> }
      ).isWorkingTreeClean;
      const result = await isWorkingTreeClean.call(driver);

      expect(result).toBe(false);
    });
  });

  describe('revert', () => {
    beforeEach(() => {
      driver = new SelfDriver();
    });

    it('reverts changes successfully', async () => {
      mockExeca.mockImplementation(async () => mockExecaResult(0, '', ''));

      const revert = (driver as unknown as { revert: () => Promise<boolean> }).revert;
      const result = await revert.call(driver);
      expect(result).toBe(true);
    });

    it('handles revert failure gracefully', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'git' && args?.includes('checkout')) {
          throw new Error('Revert failed');
        }
        return mockExecaResult(0, '', '');
      });

      const revert = (driver as unknown as { revert: () => Promise<boolean> }).revert;
      const result = await revert.call(driver);
      expect(result).toBe(false);
    });

    it('skips git clean when keepUntracked is true', async () => {
      const mockLogger = jest.fn();
      driver = new SelfDriver({ keepUntracked: true, logger: mockLogger });

      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'git' && args?.includes('reset')) {
          return mockExecaResult(0, '', '');
        }
        if (command === 'git' && args?.includes('checkout')) {
          return mockExecaResult(0, '', '');
        }
        // git clean should NOT be called when keepUntracked is true
        if (command === 'git' && args?.includes('clean')) {
          throw new Error('git clean should not be called');
        }
        return mockExecaResult(0, '', '');
      });

      const revert = (driver as unknown as { revert: () => Promise<boolean> }).revert;
      const result = await revert.call(driver);

      expect(result).toBe(true);
      expect(mockLogger).toHaveBeenCalledWith('ℹ️  Preserving untracked files (--keep-untracked)');
    });

    it('calls git clean when keepUntracked is false (default)', async () => {
      driver = new SelfDriver({ keepUntracked: false });

      let cleanCalled = false;
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'git' && args?.includes('reset')) {
          return mockExecaResult(0, '', '');
        }
        if (command === 'git' && args?.includes('checkout')) {
          return mockExecaResult(0, '', '');
        }
        if (command === 'git' && args?.includes('clean')) {
          cleanCalled = true;
          return mockExecaResult(0, '', '');
        }
        return mockExecaResult(0, '', '');
      });

      const revert = (driver as unknown as { revert: () => Promise<boolean> }).revert;
      const result = await revert.call(driver);

      expect(result).toBe(true);
      expect(cleanCalled).toBe(true);
    });
  });

  describe('evolveWithOpenCode', () => {
    beforeEach(() => {
      driver = new SelfDriver();
    });

    it('executes opencode successfully', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'git' && args?.includes('ls-files')) {
          return mockExecaResult(0, 'src/core/self-driver.ts', '');
        }
        if (command === 'opencode' && args?.includes('--version')) {
          return mockExecaResult(0, '1.0.0', '');
        }
        if (command === 'opencode' && args?.includes('run')) {
          return mockExecaResult(0, '', '');
        }
        return mockExecaResult(0, '', '');
      });

      const evolveWithOpenCode = (
        driver as unknown as {
          evolveWithOpenCode: (constitution: string) => Promise<boolean>;
        }
      ).evolveWithOpenCode;
      const result = await evolveWithOpenCode.call(driver, '');

      expect(result).toBe(true);
    });

    it('returns false when opencode is not installed', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'git' && args?.includes('ls-files')) {
          return mockExecaResult(0, 'src/core/self-driver.ts', '');
        }
        if (command === 'opencode' && args?.includes('--version')) {
          throw new Error('Command not found');
        }
        return mockExecaResult(0, '', '');
      });

      const evolveWithOpenCode = (
        driver as unknown as {
          evolveWithOpenCode: (constitution: string) => Promise<boolean>;
        }
      ).evolveWithOpenCode;
      const result = await evolveWithOpenCode.call(driver, '');

      expect(result).toBe(false);
    });

    it('returns false when opencode run fails', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'git' && args?.includes('ls-files')) {
          return mockExecaResult(0, 'src/core/self-driver.ts', '');
        }
        if (command === 'opencode' && args?.includes('--version')) {
          return mockExecaResult(0, '1.0.0', '');
        }
        if (command === 'opencode' && args?.includes('run')) {
          return mockExecaResult(1, '', '');
        }
        return mockExecaResult(0, '', '');
      });

      const evolveWithOpenCode = (
        driver as unknown as {
          evolveWithOpenCode: (constitution: string) => Promise<boolean>;
        }
      ).evolveWithOpenCode;
      const result = await evolveWithOpenCode.call(driver, '');

      expect(result).toBe(false);
    });

    it('handles opencode run execution errors', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'git' && args?.includes('ls-files')) {
          return mockExecaResult(0, 'src/core/self-driver.ts', '');
        }
        if (command === 'opencode' && args?.includes('--version')) {
          return mockExecaResult(0, '1.0.0', '');
        }
        if (command === 'opencode' && args?.includes('run')) {
          throw new Error('OpenCode execution failed');
        }
        return mockExecaResult(0, '', '');
      });

      const evolveWithOpenCode = (
        driver as unknown as {
          evolveWithOpenCode: (constitution: string) => Promise<boolean>;
        }
      ).evolveWithOpenCode;
      const result = await evolveWithOpenCode.call(driver, '');

      expect(result).toBe(false);
    });

    it('handles opencode timeout and reverts changes', async () => {
      const mockLogger = jest.fn();
      driver = new SelfDriver({ logger: mockLogger });

      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'git' && args?.includes('ls-files')) {
          return mockExecaResult(0, 'src/core/self-driver.ts', '');
        }
        if (command === 'opencode' && args?.includes('--version')) {
          return mockExecaResult(0, '1.0.0', '');
        }
        if (command === 'opencode' && args?.includes('run')) {
          // Return a timed-out result
          return {
            exitCode: 0,
            stdout: '',
            stderr: '',
            timedOut: true,
          };
        }
        // Git commands for revert
        if (command === 'git' && args?.includes('reset')) {
          return mockExecaResult(0, '', '');
        }
        if (command === 'git' && args?.includes('checkout')) {
          return mockExecaResult(0, '', '');
        }
        if (command === 'git' && args?.includes('clean')) {
          return mockExecaResult(0, '', '');
        }
        return mockExecaResult(0, '', '');
      });

      const evolveWithOpenCode = (
        driver as unknown as {
          evolveWithOpenCode: (constitution: string) => Promise<boolean>;
        }
      ).evolveWithOpenCode;
      const result = await evolveWithOpenCode.call(driver, '');

      expect(result).toBe(false);
      expect(mockLogger).toHaveBeenCalledWith(
        '⚠️  OpenCode timed out, reverting any partial changes...'
      );
      expect(mockLogger).toHaveBeenCalledWith('🔄 Reverted changes');
    });

    it('logs stderr output from opencode', async () => {
      const mockLogger = jest.fn();
      driver = new SelfDriver({ logger: mockLogger });

      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'git' && args?.includes('ls-files')) {
          return mockExecaResult(0, 'src/core/self-driver.ts', '');
        }
        if (command === 'opencode' && args?.includes('--version')) {
          return mockExecaResult(0, '1.0.0', '');
        }
        if (command === 'opencode' && args?.includes('run')) {
          return {
            exitCode: 0,
            stdout: '',
            stderr: 'Some debug output from OpenCode',
            timedOut: false,
          };
        }
        return mockExecaResult(0, '', '');
      });

      const evolveWithOpenCode = (
        driver as unknown as {
          evolveWithOpenCode: (constitution: string) => Promise<boolean>;
        }
      ).evolveWithOpenCode;
      const result = await evolveWithOpenCode.call(driver, '');

      expect(result).toBe(true);
      expect(mockLogger).toHaveBeenCalledWith('OpenCode stderr: Some debug output from OpenCode');
    });

    it('constructs prompt with constitution, file tree, and task instructions', async () => {
      let capturedPrompt = '';
      const constitution = '# Test Constitution';

      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'git' && args?.includes('ls-files')) {
          return mockExecaResult(0, 'src/core/self-driver.ts\nsrc/commands/evolve.ts', '');
        }
        if (command === 'opencode' && args?.includes('--version')) {
          return mockExecaResult(0, '1.0.0', '');
        }
        if (command === 'opencode' && args?.includes('run')) {
          // Capture the prompt argument
          capturedPrompt = args?.[1] ?? '';
          return mockExecaResult(0, '', '');
        }
        return mockExecaResult(0, '', '');
      });

      const evolveWithOpenCode = (
        driver as unknown as {
          evolveWithOpenCode: (constitution: string) => Promise<boolean>;
        }
      ).evolveWithOpenCode;
      await evolveWithOpenCode.call(driver, constitution);

      // Verify prompt structure
      expect(capturedPrompt).toContain('# Test Constitution');
      expect(capturedPrompt).toContain('## Current Codebase');
      expect(capturedPrompt).toContain('## Source Files');
      expect(capturedPrompt).toContain('self-driver.ts');
      expect(capturedPrompt).toContain('evolve.ts');
      expect(capturedPrompt).toContain('## Your Task');
      expect(capturedPrompt).toContain('1. FIX');
      expect(capturedPrompt).toContain('2. TEST');
      expect(capturedPrompt).toContain('3. REFACTOR');
      expect(capturedPrompt).toContain('4. FEATURE');
      expect(capturedPrompt).toContain('5. SKIP');
      expect(capturedPrompt).toContain('## After Changes');
      expect(capturedPrompt).toContain('npx ts-node src/cli/index.ts list --help');
      expect(capturedPrompt).toContain('npx ts-node src/cli/index.ts evolve --help');
      expect(capturedPrompt).toContain('git add -A');
      expect(capturedPrompt).toContain('git commit -m');
    });
  });

  describe('readConstitution', () => {
    beforeEach(() => {
      driver = new SelfDriver();
    });

    it('reads EVOLVE.md when it exists', async () => {
      mockPathExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue('# Evolution Guide');

      const readConstitution = (
        driver as unknown as {
          readConstitution: () => Promise<string>;
        }
      ).readConstitution;
      const result = await readConstitution.call(driver);

      expect(result).toBe('# Evolution Guide');
    });

    it('returns empty string when EVOLVE.md does not exist', async () => {
      mockPathExists.mockResolvedValue(false);

      const readConstitution = (
        driver as unknown as {
          readConstitution: () => Promise<string>;
        }
      ).readConstitution;
      const result = await readConstitution.call(driver);

      expect(result).toBe('');
    });

    it('returns empty string when reading EVOLVE.md throws an error', async () => {
      mockPathExists.mockResolvedValue(true);
      mockReadFile.mockRejectedValue(new Error('Permission denied'));

      const readConstitution = (
        driver as unknown as {
          readConstitution: () => Promise<string>;
        }
      ).readConstitution;
      const result = await readConstitution.call(driver);

      expect(result).toBe('');
    });
  });

  describe('getFileTree', () => {
    beforeEach(() => {
      driver = new SelfDriver();
    });

    it('returns file list from git with all sections', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'git' && args?.includes('ls-files')) {
          // Single call returns all files together
          return mockExecaResult(
            0,
            'package.json\ntsconfig.json\nbin/ubuild.js\nsrc/core/self-driver.ts\nsrc/commands/evolve.ts',
            ''
          );
        }
        return mockExecaResult(0, '', '');
      });

      const getFileTree = (
        driver as unknown as {
          getFileTree: () => Promise<string>;
        }
      ).getFileTree;
      const result = await getFileTree.call(driver);

      expect(result).toContain('## Configuration Files');
      expect(result).toContain('## Bin Files');
      expect(result).toContain('## Source Files');
      expect(result).toContain('self-driver.ts');
      expect(result).toContain('evolve.ts');
      expect(result).toContain('package.json');
      expect(result).toContain('bin/ubuild.js');
    });

    it('returns message when no files are found', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'git' && args?.includes('ls-files')) {
          return mockExecaResult(0, '', '');
        }
        return mockExecaResult(0, '', '');
      });

      const getFileTree = (
        driver as unknown as {
          getFileTree: () => Promise<string>;
        }
      ).getFileTree;
      const result = await getFileTree.call(driver);

      expect(result).toBe('Project files (unable to list - git exit code 0)');
    });

    it('returns error message when git fails', async () => {
      mockExeca.mockImplementation(async () => {
        throw new Error('Git error');
      });

      const getFileTree = (
        driver as unknown as {
          getFileTree: () => Promise<string>;
        }
      ).getFileTree;
      const result = await getFileTree.call(driver);

      expect(result).toBe('Project files (unable to list - git exit code unknown)');
    });
  });

  describe('signal handling', () => {
    const drivers: SelfDriver[] = [];

    afterEach(() => {
      // Clean up all drivers created in this test
      drivers.forEach((d) => d.cleanup());
      drivers.length = 0;
    });

    it('handles SIGINT signal', () => {
      const d = new SelfDriver();
      drivers.push(d);

      // Emit SIGINT - should not throw
      expect(() => process.emit('SIGINT' as NodeJS.Signals)).not.toThrow();
    });

    it('handles SIGTERM signal', () => {
      const d = new SelfDriver();
      drivers.push(d);

      // Emit SIGTERM - should not throw
      expect(() => process.emit('SIGTERM' as NodeJS.Signals)).not.toThrow();
    });

    it('cleans up signal handlers when cleanup is called', () => {
      const d = new SelfDriver();
      drivers.push(d);

      // Cleanup should not throw
      expect(() => d.cleanup()).not.toThrow();

      // Emitting signals after cleanup should not affect the driver
      expect(() => process.emit('SIGINT' as NodeJS.Signals)).not.toThrow();
      expect(() => process.emit('SIGTERM' as NodeJS.Signals)).not.toThrow();
    });

    it('handles multiple cleanup calls gracefully', () => {
      const d = new SelfDriver();
      drivers.push(d);

      // Multiple cleanups should not throw
      expect(() => {
        d.cleanup();
        d.cleanup();
      }).not.toThrow();
    });
  });

  describe('isGitRepository', () => {
    beforeEach(() => {
      driver = new SelfDriver();
    });

    it('returns true when git rev-parse succeeds', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'git' && args?.includes('rev-parse') && args?.includes('--git-dir')) {
          return mockExecaResult(0, '.git', '');
        }
        return mockExecaResult(0, '', '');
      });

      const isGitRepository = (driver as unknown as { isGitRepository: () => Promise<boolean> })
        .isGitRepository;
      const result = await isGitRepository.call(driver);

      expect(result).toBe(true);
    });

    it('returns false when git rev-parse fails', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'git' && args?.includes('rev-parse') && args?.includes('--git-dir')) {
          return mockExecaResult(128, '', 'fatal: not a git repository');
        }
        return mockExecaResult(0, '', '');
      });

      const isGitRepository = (driver as unknown as { isGitRepository: () => Promise<boolean> })
        .isGitRepository;
      const result = await isGitRepository.call(driver);

      expect(result).toBe(false);
    });

    it('returns false when git command throws', async () => {
      mockExeca.mockImplementation(async (command: string) => {
        if (command === 'git') {
          throw new Error('Command not found');
        }
        return mockExecaResult(0, '', '');
      });

      const isGitRepository = (driver as unknown as { isGitRepository: () => Promise<boolean> })
        .isGitRepository;
      const result = await isGitRepository.call(driver);

      expect(result).toBe(false);
    });
  });

  describe('isOpenCodeInstalled', () => {
    beforeEach(() => {
      driver = new SelfDriver();
    });

    it('returns true when opencode --version succeeds', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'opencode' && args?.includes('--version')) {
          return mockExecaResult(0, '1.0.0', '');
        }
        return mockExecaResult(0, '', '');
      });

      const isOpenCodeInstalled = (
        driver as unknown as { isOpenCodeInstalled: () => Promise<boolean> }
      ).isOpenCodeInstalled;
      const result = await isOpenCodeInstalled.call(driver);

      expect(result).toBe(true);
    });

    it('returns false when opencode --version fails', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'opencode' && args?.includes('--version')) {
          return mockExecaResult(127, '', 'command not found');
        }
        return mockExecaResult(0, '', '');
      });

      const isOpenCodeInstalled = (
        driver as unknown as { isOpenCodeInstalled: () => Promise<boolean> }
      ).isOpenCodeInstalled;
      const result = await isOpenCodeInstalled.call(driver);

      expect(result).toBe(false);
    });

    it('returns false when opencode command throws', async () => {
      mockExeca.mockImplementation(async (command: string) => {
        if (command === 'opencode') {
          throw new Error('Command not found');
        }
        return mockExecaResult(0, '', '');
      });

      const isOpenCodeInstalled = (
        driver as unknown as { isOpenCodeInstalled: () => Promise<boolean> }
      ).isOpenCodeInstalled;
      const result = await isOpenCodeInstalled.call(driver);

      expect(result).toBe(false);
    });
  });

  describe('getHeadCommitHash', () => {
    beforeEach(() => {
      driver = new SelfDriver();
    });

    it('returns commit hash when git rev-parse HEAD succeeds', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'git' && args?.includes('rev-parse') && args?.includes('HEAD')) {
          return mockExecaResult(0, 'abc123def456', '');
        }
        return mockExecaResult(0, '', '');
      });

      const getHeadCommitHash = (
        driver as unknown as { getHeadCommitHash: () => Promise<string | null> }
      ).getHeadCommitHash;
      const result = await getHeadCommitHash.call(driver);

      expect(result).toBe('abc123def456');
    });

    it('returns null when git rev-parse HEAD fails', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'git' && args?.includes('rev-parse') && args?.includes('HEAD')) {
          return mockExecaResult(128, '', 'fatal: not a git repository');
        }
        return mockExecaResult(0, '', '');
      });

      const getHeadCommitHash = (
        driver as unknown as { getHeadCommitHash: () => Promise<string | null> }
      ).getHeadCommitHash;
      const result = await getHeadCommitHash.call(driver);

      expect(result).toBeNull();
    });

    it('returns null when git command throws', async () => {
      mockExeca.mockImplementation(async (command: string) => {
        if (command === 'git') {
          throw new Error('Command not found');
        }
        return mockExecaResult(0, '', '');
      });

      const getHeadCommitHash = (
        driver as unknown as { getHeadCommitHash: () => Promise<string | null> }
      ).getHeadCommitHash;
      const result = await getHeadCommitHash.call(driver);

      expect(result).toBeNull();
    });

    it('returns null when git rev-parse HEAD returns empty output', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'git' && args?.includes('rev-parse') && args?.includes('HEAD')) {
          return mockExecaResult(0, '', ''); // Empty stdout
        }
        return mockExecaResult(0, '', '');
      });

      const getHeadCommitHash = (
        driver as unknown as { getHeadCommitHash: () => Promise<string | null> }
      ).getHeadCommitHash;
      const result = await getHeadCommitHash.call(driver);

      expect(result).toBeNull();
    });
  });

  describe('runPreFlightChecks', () => {
    beforeEach(() => {
      driver = new SelfDriver({ once: true });
    });

    it('returns true when all checks pass', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'git' && args?.includes('rev-parse') && args?.includes('--git-dir')) {
          return mockExecaResult(0, '.git', '');
        }
        if (command === 'git' && args?.includes('status') && args?.includes('--porcelain')) {
          return mockExecaResult(0, '', '');
        }
        if (command === 'opencode' && args?.includes('--version')) {
          return mockExecaResult(0, '1.0.0', '');
        }
        return mockExecaResult(0, '', '');
      });

      const runPreFlightChecks = (
        driver as unknown as { runPreFlightChecks: () => Promise<boolean> }
      ).runPreFlightChecks;
      const result = await runPreFlightChecks.call(driver);

      expect(result).toBe(true);
    });

    it('returns false when not in git repository', async () => {
      const mockLogger = jest.fn();
      driver = new SelfDriver({ once: true, logger: mockLogger });

      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'git' && args?.includes('rev-parse') && args?.includes('--git-dir')) {
          return mockExecaResult(128, '', 'fatal: not a git repository');
        }
        return mockExecaResult(0, '', '');
      });

      const runPreFlightChecks = (
        driver as unknown as { runPreFlightChecks: () => Promise<boolean> }
      ).runPreFlightChecks;
      const result = await runPreFlightChecks.call(driver);

      expect(result).toBe(false);
      expect(mockLogger).toHaveBeenCalledWith('❌ Error: Not a git repository');
    });

    it('returns false when working tree has uncommitted changes', async () => {
      const mockLogger = jest.fn();
      driver = new SelfDriver({ once: true, logger: mockLogger });

      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'git' && args?.includes('rev-parse') && args?.includes('--git-dir')) {
          return mockExecaResult(0, '.git', '');
        }
        if (command === 'git' && args?.includes('status') && args?.includes('--porcelain')) {
          return mockExecaResult(0, 'M src/file.ts', '');
        }
        return mockExecaResult(0, '', '');
      });

      const runPreFlightChecks = (
        driver as unknown as { runPreFlightChecks: () => Promise<boolean> }
      ).runPreFlightChecks;
      const result = await runPreFlightChecks.call(driver);

      expect(result).toBe(false);
      expect(mockLogger).toHaveBeenCalledWith('❌ Error: Working tree has uncommitted changes');
    });

    it('returns false when opencode is not installed', async () => {
      const mockLogger = jest.fn();
      driver = new SelfDriver({ once: true, logger: mockLogger });

      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'git' && args?.includes('rev-parse') && args?.includes('--git-dir')) {
          return mockExecaResult(0, '.git', '');
        }
        if (command === 'git' && args?.includes('status') && args?.includes('--porcelain')) {
          return mockExecaResult(0, '', '');
        }
        if (command === 'opencode' && args?.includes('--version')) {
          return mockExecaResult(127, '', 'command not found');
        }
        return mockExecaResult(0, '', '');
      });

      const runPreFlightChecks = (
        driver as unknown as { runPreFlightChecks: () => Promise<boolean> }
      ).runPreFlightChecks;
      const result = await runPreFlightChecks.call(driver);

      expect(result).toBe(false);
      expect(mockLogger).toHaveBeenCalledWith('❌ Error: OpenCode is not installed or not in PATH');
    });
  });

  describe('git repository validation in run', () => {
    it('exits early when not in a git repository', async () => {
      const mockLogger = jest.fn();
      driver = new SelfDriver({ once: true, logger: mockLogger });

      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        // Git rev-parse fails - not a git repo
        if (command === 'git' && args?.includes('rev-parse') && args?.includes('--git-dir')) {
          return mockExecaResult(128, '', 'fatal: not a git repository');
        }
        return mockExecaResult(0, '', '');
      });

      const run = (driver as unknown as { run: () => Promise<void> }).run;
      await run.call(driver);

      expect(mockLogger).toHaveBeenCalledWith('❌ Error: Not a git repository');
      expect(mockLogger).toHaveBeenCalledWith(
        '   Self-evolution requires a git repository to track and revert changes.'
      );
      expect(mockLogger).toHaveBeenCalledWith(`   Current directory: ${mockProjectRoot}`);
    });

    it('exits early when working tree has uncommitted changes', async () => {
      const mockLogger = jest.fn();
      driver = new SelfDriver({ once: true, logger: mockLogger });

      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        // Git rev-parse succeeds - is a git repo
        if (command === 'git' && args?.includes('rev-parse') && args?.includes('--git-dir')) {
          return mockExecaResult(0, '.git', '');
        }
        // Git status shows uncommitted changes
        if (command === 'git' && args?.includes('status') && args?.includes('--porcelain')) {
          return mockExecaResult(0, 'M src/some-file.ts', '');
        }
        return mockExecaResult(0, '', '');
      });

      const run = (driver as unknown as { run: () => Promise<void> }).run;
      await run.call(driver);

      expect(mockLogger).toHaveBeenCalledWith('❌ Error: Working tree has uncommitted changes');
      expect(mockLogger).toHaveBeenCalledWith(
        '   Self-evolution may revert changes using `git checkout .`'
      );
      expect(mockLogger).toHaveBeenCalledWith(
        '   Commit or stash your changes before running evolve.'
      );
    });

    it('exits early when opencode is not installed', async () => {
      const mockLogger = jest.fn();
      driver = new SelfDriver({ once: true, logger: mockLogger });

      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        // Git rev-parse succeeds - is a git repo
        if (command === 'git' && args?.includes('rev-parse') && args?.includes('--git-dir')) {
          return mockExecaResult(0, '.git', '');
        }
        // Git status returns clean
        if (command === 'git' && args?.includes('status') && args?.includes('--porcelain')) {
          return mockExecaResult(0, '', '');
        }
        // OpenCode is not installed
        if (command === 'opencode' && args?.includes('--version')) {
          return mockExecaResult(127, '', 'command not found');
        }
        return mockExecaResult(0, '', '');
      });

      const run = (driver as unknown as { run: () => Promise<void> }).run;
      await run.call(driver);

      expect(mockLogger).toHaveBeenCalledWith('❌ Error: OpenCode is not installed or not in PATH');
      expect(mockLogger).toHaveBeenCalledWith('   Self-evolution requires OpenCode CLI to run.');
      expect(mockLogger).toHaveBeenCalledWith('   Install it with: npm install -g opencode');
    });

    it('proceeds with evolution when in a git repository', async () => {
      const mockLogger = jest.fn();
      driver = new SelfDriver({ once: true, logger: mockLogger });

      let gitRevParseCallCount = 0;

      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        const fullCommand = `${command} ${args?.join(' ') ?? ''}`;

        // Git rev-parse --git-dir succeeds (pre-flight check)
        if (command === 'git' && args?.includes('rev-parse') && args?.includes('--git-dir')) {
          return mockExecaResult(0, '.git', '');
        }

        // Git rev-parse HEAD - return different hashes to simulate a commit was made
        if (command === 'git' && args?.includes('rev-parse') && args?.includes('HEAD')) {
          gitRevParseCallCount++;
          if (gitRevParseCallCount === 1) {
            // Before evolution
            return mockExecaResult(0, 'abc123', '');
          } else {
            // After evolution - different hash = commit made
            return mockExecaResult(0, 'def456', '');
          }
        }

        // Git status returns clean
        if (command === 'git' && args?.includes('status') && args?.includes('--porcelain')) {
          return mockExecaResult(0, '', '');
        }

        // All verification checks pass
        if (fullCommand.includes('npm run build')) {
          return mockExecaResult(0, '', '');
        }
        if (fullCommand.includes('npm test')) {
          return mockExecaResult(0, 'Test Suites: 10 passed', '');
        }
        if (fullCommand.includes('npm run lint')) {
          return mockExecaResult(0, '', '');
        }
        if (fullCommand.includes('evolve --help') || fullCommand.includes('list --help')) {
          return mockExecaResult(0, 'Usage: [command] [options]', '');
        }

        // OpenCode executes successfully
        if (command === 'opencode') {
          if (args?.includes('--version')) {
            return mockExecaResult(0, '1.0.0', '');
          }
          if (args?.includes('run')) {
            return mockExecaResult(0, '', '');
          }
        }

        if (command === 'git' && args?.includes('ls-files')) {
          return mockExecaResult(0, 'src/core/self-driver.ts', '');
        }

        return mockExecaResult(0, '', '');
      });

      const run = (driver as unknown as { run: () => Promise<void> }).run;
      await run.call(driver);

      // Should proceed with evolution
      expect(mockLogger).toHaveBeenCalledWith('🔄 Starting self-evolution...');
      expect(mockLogger).toHaveBeenCalledWith('✅ Changes committed by AI');
    });
  });

  describe('dry-run behavior', () => {
    it('logs dry run information and exits early', async () => {
      const mockLogger = jest.fn();
      const options: SelfEvolverOptions = {
        logger: mockLogger,
        dryRun: true,
      };
      driver = new SelfDriver(options);

      const run = (driver as unknown as { run: () => Promise<void> }).run;
      await run.call(driver);

      expect(mockLogger).toHaveBeenCalledWith('🔍 Dry run mode - showing what would be done');
      expect(mockLogger).toHaveBeenCalledWith(`📁 Project: ${mockProjectRoot}`);
      expect(mockLogger).toHaveBeenCalledWith('\n📝 Would perform the following actions:');
      expect(mockLogger).toHaveBeenCalledWith('\n✨ Dry run complete - no changes made');
    });

    it('shows single iteration mode in dry run with --once', async () => {
      const mockLogger = jest.fn();
      const options: SelfEvolverOptions = {
        logger: mockLogger,
        dryRun: true,
        once: true,
      };
      driver = new SelfDriver(options);

      const run = (driver as unknown as { run: () => Promise<void> }).run;
      await run.call(driver);

      expect(mockLogger).toHaveBeenCalledWith('\n  Mode: Single iteration (--once)');
    });

    it('shows continuous mode in dry run without --once', async () => {
      const mockLogger = jest.fn();
      const options: SelfEvolverOptions = {
        logger: mockLogger,
        dryRun: true,
        once: false,
      };
      driver = new SelfDriver(options);

      const run = (driver as unknown as { run: () => Promise<void> }).run;
      await run.call(driver);

      expect(mockLogger).toHaveBeenCalledWith('\n  Mode: Continuous (runs until Ctrl+C)');
      expect(mockLogger).toHaveBeenCalledWith('  Would loop every 5 seconds');
    });
  });
});

describe('pre-existing dirty state handling', () => {
  beforeEach(() => {
    driver = new SelfDriver({ once: true });
  });

  afterEach(() => {
    if (driver) {
      driver.cleanup();
    }
  });

  it('exits early when working tree has pre-existing uncommitted changes', async () => {
    const mockLogger = jest.fn();
    driver = new SelfDriver({ once: true, logger: mockLogger });

    mockExeca.mockImplementation(async (command: string, args?: string[]) => {
      // Git rev-parse succeeds - is a git repo
      if (command === 'git' && args?.includes('rev-parse') && args?.includes('--git-dir')) {
        return mockExecaResult(0, '.git', '');
      }

      // Git status always returns dirty (pre-existing changes)
      if (command === 'git' && args?.includes('status') && args?.includes('--porcelain')) {
        return mockExecaResult(0, 'M src/some-file.ts', '');
      }

      return mockExecaResult(0, '', '');
    });

    const run = (driver as unknown as { run: () => Promise<void> }).run;
    await run.call(driver);

    // Should exit early with dirty state error
    expect(mockLogger).toHaveBeenCalledWith('❌ Error: Working tree has uncommitted changes');
    expect(mockLogger).toHaveBeenCalledWith(
      '   Self-evolution may revert changes using `git checkout .`'
    );
    expect(mockLogger).toHaveBeenCalledWith(
      '   Commit or stash your changes before running evolve.'
    );

    // Should NOT proceed with evolution
    expect(mockLogger).not.toHaveBeenCalledWith('🔄 Starting self-evolution...');
  });

  it('commits successfully when working tree is clean after evolution', async () => {
    const mockLogger = jest.fn();
    driver = new SelfDriver({ once: true, logger: mockLogger });

    let gitRevParseCallCount = 0;

    mockExeca.mockImplementation(async (command: string, args?: string[]) => {
      const fullCommand = `${command} ${args?.join(' ') ?? ''}`;

      // Git rev-parse --git-dir succeeds (pre-flight check)
      if (command === 'git' && args?.includes('rev-parse') && args?.includes('--git-dir')) {
        return mockExecaResult(0, '.git', '');
      }

      // Git rev-parse HEAD - return different hashes to simulate a commit was made
      if (command === 'git' && args?.includes('rev-parse') && args?.includes('HEAD')) {
        gitRevParseCallCount++;
        if (gitRevParseCallCount === 1) {
          // Before evolution
          return mockExecaResult(0, 'abc123', '');
        } else {
          // After evolution - different hash = commit made
          return mockExecaResult(0, 'def456', '');
        }
      }

      // Git status returns clean (AI committed changes)
      if (command === 'git' && args?.includes('status') && args?.includes('--porcelain')) {
        return mockExecaResult(0, '', '');
      }

      // All verification checks pass
      if (fullCommand.includes('npm run build')) {
        return mockExecaResult(0, '', '');
      }
      if (fullCommand.includes('npm test')) {
        return mockExecaResult(0, 'Test Suites: 10 passed', '');
      }
      if (fullCommand.includes('npm run lint')) {
        return mockExecaResult(0, '', '');
      }
      if (fullCommand.includes('evolve --help') || fullCommand.includes('list --help')) {
        return mockExecaResult(0, 'Usage: [command] [options]', '');
      }

      // OpenCode executes successfully
      if (command === 'opencode') {
        if (args?.includes('--version')) {
          return mockExecaResult(0, '1.0.0', '');
        }
        if (args?.includes('run')) {
          return mockExecaResult(0, '', '');
        }
      }

      if (command === 'git' && args?.includes('ls-files')) {
        return mockExecaResult(0, 'src/core/self-driver.ts', '');
      }

      return mockExecaResult(0, '', '');
    });

    const run = (driver as unknown as { run: () => Promise<void> }).run;
    await run.call(driver);

    // Should confirm changes committed
    expect(mockLogger).toHaveBeenCalledWith('✅ Changes committed by AI');

    // Should NOT revert
    expect(mockLogger).not.toHaveBeenCalledWith('🔄 Reverting...');
  });
});

describe('runSelfEvolution', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.cwd = jest.fn().mockReturnValue(mockProjectRoot);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exports runSelfEvolution function', () => {
    expect(typeof runSelfEvolution).toBe('function');
  });

  it('runs self-evolution with custom logger', async () => {
    const mockLogger = jest.fn();

    // We can't fully test this without mocking the SelfDriver class,
    // but we can verify the function accepts the options
    expect(() => runSelfEvolution({ logger: mockLogger })).not.toThrow();
  });

  it('runs self-evolution without options', async () => {
    expect(() => runSelfEvolution()).not.toThrow();
  });

  it('runs self-evolution with once option set to true', async () => {
    const mockLogger = jest.fn();
    expect(() => runSelfEvolution({ logger: mockLogger, once: true })).not.toThrow();
  });

  it('runs self-evolution with once option set to false', async () => {
    const mockLogger = jest.fn();
    expect(() => runSelfEvolution({ logger: mockLogger, once: false })).not.toThrow();
  });

  it('runs self-evolution with dryRun option set to true', async () => {
    const mockLogger = jest.fn();
    expect(() => runSelfEvolution({ logger: mockLogger, dryRun: true })).not.toThrow();
  });

  it('runs self-evolution with dryRun option set to false', async () => {
    const mockLogger = jest.fn();
    expect(() => runSelfEvolution({ logger: mockLogger, dryRun: false })).not.toThrow();
  });

  it('runs self-evolution with all options', async () => {
    const mockLogger = jest.fn();
    expect(() => runSelfEvolution({ logger: mockLogger, once: true, dryRun: true })).not.toThrow();
  });

  it('runs self-evolution with sleepMs option', async () => {
    const mockLogger = jest.fn();
    expect(() => runSelfEvolution({ logger: mockLogger, sleepMs: 10000 })).not.toThrow();
  });

  it('runs self-evolution with all options including sleepMs', async () => {
    const mockLogger = jest.fn();
    expect(() =>
      runSelfEvolution({ logger: mockLogger, once: true, dryRun: true, sleepMs: 10000 })
    ).not.toThrow();
  });
});

describe('sleep behavior after cleanup', () => {
  it('resolves immediately when sleep is called after cleanup', async () => {
    const d = new SelfDriver({ once: true });

    // Cleanup first
    d.cleanup();

    // Access and call sleep after cleanup - should resolve immediately
    const sleep = (d as unknown as { sleep: (ms: number) => Promise<void> }).sleep;
    const startTime = Date.now();
    await sleep.call(d, 1000); // Request 1 second sleep
    const elapsed = Date.now() - startTime;

    // Should resolve almost immediately (less than 100ms)
    expect(elapsed).toBeLessThan(100);
  });
});

describe('cleanup edge cases', () => {
  it('clears pending sleep timer and resolves sleep promise', async () => {
    const d = new SelfDriver({ once: true });

    // Start a sleep
    const sleep = (d as unknown as { sleep: (ms: number) => Promise<void> }).sleep;
    const sleepPromise = sleep.call(d, 10000); // 10 second sleep

    // Immediately cleanup - this should clear the timer and resolve the sleep
    d.cleanup();

    // Sleep should resolve quickly due to cleanup
    const startTime = Date.now();
    await sleepPromise;
    const elapsed = Date.now() - startTime;

    // Should resolve almost immediately after cleanup (less than 100ms)
    expect(elapsed).toBeLessThan(100);
  });

  it('restores original max listeners when cleanup is called', () => {
    const originalMaxListeners = process.getMaxListeners();

    // Create driver which may increase max listeners
    const d = new SelfDriver({ once: true });

    // Cleanup should restore original
    d.cleanup();

    // Original should be restored (or remain the same if it wasn't changed)
    expect(process.getMaxListeners()).toBe(originalMaxListeners);
  });
});

describe('evolution retry logic', () => {
  it('retries when evolveWithOpenCode returns false', async () => {
    const mockLogger = jest.fn();
    // Use a very short sleep to avoid test timeout
    driver = new SelfDriver({ once: true, logger: mockLogger, sleepMs: 50 });

    let opencodeCallCount = 0;

    mockExeca.mockImplementation(async (command: string, args?: string[]) => {
      const fullCommand = `${command} ${args?.join(' ') ?? ''}`;

      // Git checks pass
      if (command === 'git' && args?.includes('rev-parse') && args?.includes('--git-dir')) {
        return mockExecaResult(0, '.git', '');
      }
      if (command === 'git' && args?.includes('status') && args?.includes('--porcelain')) {
        return mockExecaResult(0, '', '');
      }

      // OpenCode fails first time, succeeds second time
      if (command === 'opencode') {
        if (args?.includes('--version')) {
          return mockExecaResult(0, '1.0.0', '');
        }
        if (args?.includes('run')) {
          opencodeCallCount++;
          if (opencodeCallCount === 1) {
            return mockExecaResult(1, '', 'Execution failed');
          }
          return mockExecaResult(0, '', '');
        }
      }

      if (command === 'git' && args?.includes('ls-files')) {
        return mockExecaResult(0, 'src/core/self-driver.ts', '');
      }

      // Verification checks
      if (fullCommand.includes('npm run build')) {
        return mockExecaResult(0, '', '');
      }
      if (fullCommand.includes('npm test')) {
        return mockExecaResult(0, 'Test Suites: 10 passed', '');
      }
      if (fullCommand.includes('npm run lint')) {
        return mockExecaResult(0, '', '');
      }
      if (fullCommand.includes('evolve --help') || fullCommand.includes('list --help')) {
        return mockExecaResult(0, 'Usage: [command] [options]', '');
      }

      return mockExecaResult(0, '', '');
    });

    const run = (driver as unknown as { run: () => Promise<void> }).run;
    await run.call(driver);

    // Should log retry message and opencode should be called twice (fail then succeed)
    expect(mockLogger).toHaveBeenCalledWith(expect.stringContaining('Evolution execution issue'));
    expect(opencodeCallCount).toBe(2);
  });
});

describe('verification failure handling', () => {
  it('reverts changes when verification fails', async () => {
    const mockLogger = jest.fn();
    driver = new SelfDriver({ once: true, logger: mockLogger });

    let revertCalled = false;

    mockExeca.mockImplementation(async (command: string, args?: string[]) => {
      const fullCommand = `${command} ${args?.join(' ') ?? ''}`;

      // Git checks pass
      if (command === 'git' && args?.includes('rev-parse') && args?.includes('--git-dir')) {
        return mockExecaResult(0, '.git', '');
      }
      if (command === 'git' && args?.includes('status') && args?.includes('--porcelain')) {
        return mockExecaResult(0, '', '');
      }

      // OpenCode succeeds
      if (command === 'opencode') {
        if (args?.includes('--version')) {
          return mockExecaResult(0, '1.0.0', '');
        }
        if (args?.includes('run')) {
          return mockExecaResult(0, '', '');
        }
      }

      if (command === 'git' && args?.includes('ls-files')) {
        return mockExecaResult(0, 'src/core/self-driver.ts', '');
      }

      // Build fails
      if (fullCommand.includes('npm run build')) {
        return mockExecaResult(1, 'Build failed', '');
      }

      // Revert is called
      if (command === 'git' && args?.includes('checkout') && args?.includes('.')) {
        revertCalled = true;
        return mockExecaResult(0, '', '');
      }

      return mockExecaResult(0, '', '');
    });

    const run = (driver as unknown as { run: () => Promise<void> }).run;
    await run.call(driver);

    // Should log verification failure
    expect(mockLogger).toHaveBeenCalledWith(expect.stringContaining('Verifying changes'));
    expect(mockLogger).toHaveBeenCalledWith('❌ Verification failed, reverting...');

    // Should call revert
    expect(revertCalled).toBe(true);
  });
});

describe('uncommitted changes after verification', () => {
  it('reverts when working tree is not clean after verification', async () => {
    const mockLogger = jest.fn();
    driver = new SelfDriver({ once: true, logger: mockLogger });

    let statusCallCount = 0;
    let revertCalled = false;

    mockExeca.mockImplementation(async (command: string, args?: string[]) => {
      const fullCommand = `${command} ${args?.join(' ') ?? ''}`;

      // Git checks pass initially
      if (command === 'git' && args?.includes('rev-parse') && args?.includes('--git-dir')) {
        return mockExecaResult(0, '.git', '');
      }

      // Git rev-parse HEAD - returns same commit hash before and after evolution (no commit made)
      if (command === 'git' && args?.includes('rev-parse') && args?.includes('HEAD')) {
        return mockExecaResult(0, 'abc123def456789012345678901234567890abcd', '');
      }

      // Git status - first call is clean (pre-flight), second call shows uncommitted changes
      if (command === 'git' && args?.includes('status') && args?.includes('--porcelain')) {
        statusCallCount++;
        if (statusCallCount === 1) {
          return mockExecaResult(0, '', ''); // Pre-flight check - clean
        }
        return mockExecaResult(0, 'M src/modified.ts', ''); // Post-evolution - dirty
      }

      // OpenCode succeeds
      if (command === 'opencode') {
        if (args?.includes('--version')) {
          return mockExecaResult(0, '1.0.0', '');
        }
        if (args?.includes('run')) {
          return mockExecaResult(0, '', '');
        }
      }

      if (command === 'git' && args?.includes('ls-files')) {
        return mockExecaResult(0, 'src/core/self-driver.ts', '');
      }

      // All verification checks pass
      if (fullCommand.includes('npm run build')) {
        return mockExecaResult(0, '', '');
      }
      if (fullCommand.includes('npm test')) {
        return mockExecaResult(0, 'Test Suites: 10 passed', '');
      }
      if (fullCommand.includes('npm run lint')) {
        return mockExecaResult(0, '', '');
      }
      if (fullCommand.includes('evolve --help') || fullCommand.includes('list --help')) {
        return mockExecaResult(0, 'Usage: [command] [options]', '');
      }

      // Revert commands - git reset, git checkout, git clean
      if (command === 'git' && args?.includes('reset') && !args?.includes('--hard')) {
        return mockExecaResult(0, '', '');
      }
      if (command === 'git' && args?.includes('checkout') && args?.includes('.')) {
        revertCalled = true;
        return mockExecaResult(0, '', '');
      }
      if (command === 'git' && args?.includes('clean') && args?.includes('-fd')) {
        return mockExecaResult(0, '', '');
      }

      return mockExecaResult(0, '', '');
    });

    const run = (driver as unknown as { run: () => Promise<void> }).run;
    await run.call(driver);

    // Should log warning about uncommitted changes
    expect(mockLogger).toHaveBeenCalledWith(
      expect.stringContaining('Verification passed but AI did not commit changes')
    );

    // Should revert
    expect(revertCalled).toBe(true);
  });
});

describe('once mode completion', () => {
  it('completes single iteration and exits cleanly', async () => {
    const mockLogger = jest.fn();
    driver = new SelfDriver({ once: true, logger: mockLogger });

    mockExeca.mockImplementation(async (command: string, args?: string[]) => {
      const fullCommand = `${command} ${args?.join(' ') ?? ''}`;

      // Git checks pass
      if (command === 'git' && args?.includes('rev-parse') && args?.includes('--git-dir')) {
        return mockExecaResult(0, '.git', '');
      }
      if (command === 'git' && args?.includes('status') && args?.includes('--porcelain')) {
        return mockExecaResult(0, '', '');
      }

      // OpenCode succeeds
      if (command === 'opencode') {
        if (args?.includes('--version')) {
          return mockExecaResult(0, '1.0.0', '');
        }
        if (args?.includes('run')) {
          return mockExecaResult(0, '', '');
        }
      }

      if (command === 'git' && args?.includes('ls-files')) {
        return mockExecaResult(0, 'src/core/self-driver.ts', '');
      }

      // All verification checks pass
      if (fullCommand.includes('npm run build')) {
        return mockExecaResult(0, '', '');
      }
      if (fullCommand.includes('npm test')) {
        return mockExecaResult(0, 'Test Suites: 10 passed', '');
      }
      if (fullCommand.includes('npm run lint')) {
        return mockExecaResult(0, '', '');
      }
      if (fullCommand.includes('evolve --help') || fullCommand.includes('list --help')) {
        return mockExecaResult(0, 'Usage: [command] [options]', '');
      }

      return mockExecaResult(0, '', '');
    });

    const run = (driver as unknown as { run: () => Promise<void> }).run;
    await run.call(driver);

    // Should log single iteration completion
    expect(mockLogger).toHaveBeenCalledWith('\n✨ Single iteration complete (--once flag set)');
  });
});

describe('getStatus', () => {
  beforeEach(() => {
    process.cwd = jest.fn().mockReturnValue(mockProjectRoot);
  });

  it('returns current driver state with default options', () => {
    driver = new SelfDriver();
    const status = driver.getStatus();

    expect(status).toEqual({
      interrupted: false,
      cleanedUp: false,
      projectRoot: mockProjectRoot,
      dryRun: false,
      once: false,
      consecutiveFailures: 0,
      iterationCount: 0,
    });
  });

  it('returns current driver state with once option', () => {
    driver = new SelfDriver({ once: true });
    const status = driver.getStatus();

    expect(status.once).toBe(true);
  });

  it('returns current driver state with dryRun option', () => {
    driver = new SelfDriver({ dryRun: true });
    const status = driver.getStatus();

    expect(status.dryRun).toBe(true);
  });

  it('returns custom project root', () => {
    const customRoot = 'C:\\Custom\\Project';
    process.cwd = jest.fn().mockReturnValue(customRoot);
    driver = new SelfDriver();

    const status = driver.getStatus();
    expect(status.projectRoot).toBe(customRoot);
  });

  it('reflects interrupted state after signal', () => {
    driver = new SelfDriver();
    const statusBefore = driver.getStatus();
    expect(statusBefore.interrupted).toBe(false);

    // Simulate SIGINT
    process.emit('SIGINT');

    const statusAfter = driver.getStatus();
    expect(statusAfter.interrupted).toBe(true);
  });

  it('reflects cleanedUp state after cleanup', () => {
    driver = new SelfDriver();
    const statusBefore = driver.getStatus();
    expect(statusBefore.cleanedUp).toBe(false);

    driver.cleanup();

    const statusAfter = driver.getStatus();
    expect(statusAfter.cleanedUp).toBe(true);
  });

  it('returns all options combined', () => {
    const customRoot = 'C:\\Custom\\Project';
    process.cwd = jest.fn().mockReturnValue(customRoot);

    driver = new SelfDriver({
      once: true,
      dryRun: true,
    });

    const status = driver.getStatus();
    expect(status).toEqual({
      interrupted: false,
      cleanedUp: false,
      projectRoot: customRoot,
      dryRun: true,
      once: true,
      consecutiveFailures: 0,
      iterationCount: 0,
    });
  });
});

describe('unlimited retries (maxRetries = -1)', () => {
  it('continues evolving despite consecutive failures when maxRetries is -1', async () => {
    const mockLogger = jest.fn();
    driver = new SelfDriver({ once: true, logger: mockLogger, maxRetries: -1, sleepMs: 50 });

    let opencodeCallCount = 0;

    mockExeca.mockImplementation(async (command: string, args?: string[]) => {
      const fullCommand = `${command} ${args?.join(' ') ?? ''}`;

      // Git checks pass
      if (command === 'git' && args?.includes('rev-parse') && args?.includes('--git-dir')) {
        return mockExecaResult(0, '.git', '');
      }
      if (command === 'git' && args?.includes('status') && args?.includes('--porcelain')) {
        return mockExecaResult(0, '', '');
      }

      // OpenCode fails first 3 times, succeeds on 4th
      if (command === 'opencode') {
        if (args?.includes('--version')) {
          return mockExecaResult(0, '1.0.0', '');
        }
        if (args?.includes('run')) {
          opencodeCallCount++;
          if (opencodeCallCount <= 3) {
            return mockExecaResult(1, '', 'Execution failed');
          }
          return mockExecaResult(0, '', '');
        }
      }

      if (command === 'git' && args?.includes('ls-files')) {
        return mockExecaResult(0, 'src/core/self-driver.ts', '');
      }

      // Verification checks pass
      if (fullCommand.includes('npm run build')) {
        return mockExecaResult(0, '', '');
      }
      if (fullCommand.includes('npm test')) {
        return mockExecaResult(0, 'Test Suites: 10 passed', '');
      }
      if (fullCommand.includes('npm run lint')) {
        return mockExecaResult(0, '', '');
      }
      if (fullCommand.includes('evolve --help') || fullCommand.includes('list --help')) {
        return mockExecaResult(0, 'Usage: [command] [options]', '');
      }

      return mockExecaResult(0, '', '');
    });

    const run = (driver as unknown as { run: () => Promise<void> }).run;
    await run.call(driver);

    // Should retry multiple times and eventually succeed
    expect(opencodeCallCount).toBe(4);
    expect(mockLogger).toHaveBeenCalledWith(expect.stringContaining('Evolution execution issue'));
  });
});

describe('max retries exhaustion', () => {
  it('stops evolution when max retries is reached after consecutive failures', async () => {
    const mockLogger = jest.fn();
    const maxRetries = 3;
    driver = new SelfDriver({ once: true, logger: mockLogger, maxRetries, sleepMs: 50 });

    let opencodeCallCount = 0;

    mockExeca.mockImplementation(async (command: string, args?: string[]) => {
      // Git checks pass
      if (command === 'git' && args?.includes('rev-parse') && args?.includes('--git-dir')) {
        return mockExecaResult(0, '.git', '');
      }
      if (command === 'git' && args?.includes('status') && args?.includes('--porcelain')) {
        return mockExecaResult(0, '', '');
      }

      // OpenCode always fails
      if (command === 'opencode') {
        if (args?.includes('--version')) {
          return mockExecaResult(0, '1.0.0', '');
        }
        if (args?.includes('run')) {
          opencodeCallCount++;
          return mockExecaResult(1, '', 'Execution failed');
        }
      }

      if (command === 'git' && args?.includes('ls-files')) {
        return mockExecaResult(0, 'src/core/self-driver.ts', '');
      }

      return mockExecaResult(0, '', '');
    });

    const run = (driver as unknown as { run: () => Promise<void> }).run;
    await run.call(driver);

    // Should retry exactly maxRetries times
    expect(opencodeCallCount).toBe(maxRetries);
    expect(mockLogger).toHaveBeenCalledWith(
      expect.stringContaining(`Max retries (${maxRetries}) reached, stopping evolution`)
    );
    // Should log each failure
    expect(
      mockLogger.mock.calls.filter((call) => call[0].includes('Evolution execution issue')).length
    ).toBe(maxRetries);
  });
});

describe('verification timeout behavior', () => {
  it('handles verification timeout gracefully', async () => {
    const mockLogger = jest.fn();
    driver = new SelfDriver({ once: true, logger: mockLogger, verifyTimeoutMs: 100 });

    mockExeca.mockImplementation(async (command: string, args?: string[]) => {
      const fullCommand = `${command} ${args?.join(' ') ?? ''}`;

      // Git checks pass
      if (command === 'git' && args?.includes('rev-parse') && args?.includes('--git-dir')) {
        return mockExecaResult(0, '.git', '');
      }
      if (command === 'git' && args?.includes('status') && args?.includes('--porcelain')) {
        return mockExecaResult(0, '', '');
      }

      // OpenCode succeeds
      if (command === 'opencode') {
        if (args?.includes('--version')) {
          return mockExecaResult(0, '1.0.0', '');
        }
        if (args?.includes('run')) {
          return mockExecaResult(0, '', '');
        }
      }

      if (command === 'git' && args?.includes('ls-files')) {
        return mockExecaResult(0, 'src/core/self-driver.ts', '');
      }

      // Build times out (simulated by throwing timeout error)
      if (fullCommand.includes('npm run build')) {
        const error: Error & { timedOut?: boolean } = new Error('Timeout');
        error.timedOut = true;
        throw error;
      }

      return mockExecaResult(0, '', '');
    });

    const run = (driver as unknown as { run: () => Promise<void> }).run;
    await run.call(driver);

    // Should log verification failure due to timeout
    expect(mockLogger).toHaveBeenCalledWith(expect.stringContaining('Verifying changes'));
    expect(mockLogger).toHaveBeenCalledWith('❌ Verification failed, reverting...');
  });

  it('handles opencode execution failure gracefully', async () => {
    const mockLogger = jest.fn();
    driver = new SelfDriver({ once: true, logger: mockLogger, sleepMs: 50 });

    let opencodeCallCount = 0;

    mockExeca.mockImplementation(async (command: string, args?: string[]) => {
      // Git checks pass
      if (command === 'git' && args?.includes('rev-parse') && args?.includes('--git-dir')) {
        return mockExecaResult(0, '.git', '');
      }
      if (command === 'git' && args?.includes('status') && args?.includes('--porcelain')) {
        return mockExecaResult(0, '', '');
      }

      // OpenCode fails first time, succeeds second time
      if (command === 'opencode') {
        if (args?.includes('--version')) {
          return mockExecaResult(0, '1.0.0', '');
        }
        if (args?.includes('run')) {
          opencodeCallCount++;
          if (opencodeCallCount === 1) {
            return mockExecaResult(1, '', 'Execution failed');
          }
          return mockExecaResult(0, '', '');
        }
      }

      if (command === 'git' && args?.includes('ls-files')) {
        return mockExecaResult(0, 'src/core/self-driver.ts', '');
      }

      // Verification checks pass
      const fullCommand = `${command} ${args?.join(' ') ?? ''}`;
      if (fullCommand.includes('npm run build')) {
        return mockExecaResult(0, '', '');
      }
      if (fullCommand.includes('npm test')) {
        return mockExecaResult(0, 'Test Suites: 10 passed', '');
      }
      if (fullCommand.includes('npm run lint')) {
        return mockExecaResult(0, '', '');
      }
      if (fullCommand.includes('evolve --help') || fullCommand.includes('list --help')) {
        return mockExecaResult(0, 'Usage: [command] [options]', '');
      }

      return mockExecaResult(0, '', '');
    });

    const run = (driver as unknown as { run: () => Promise<void> }).run;
    await run.call(driver);

    // Should log OpenCode failure and retry
    expect(mockLogger).toHaveBeenCalledWith(expect.stringContaining('OpenCode exited with code'));
    expect(opencodeCallCount).toBe(2);
  });
});

describe('handlePostVerificationState', () => {
  beforeEach(() => {
    driver = new SelfDriver({ once: true });
  });

  afterEach(() => {
    if (driver) {
      driver.cleanup();
    }
  });

  it('handles SKIP scenario when isClean && !hashChanged && !hashError', async () => {
    const mockLogger = jest.fn();
    driver = new SelfDriver({ once: true, logger: mockLogger });

    // Access private method via type assertion
    const handlePostVerificationState = (
      driver as unknown as {
        handlePostVerificationState: (
          isClean: boolean,
          hashChanged: boolean,
          hashError: boolean
        ) => Promise<boolean>;
      }
    ).handlePostVerificationState;

    // Test the SKIP scenario: working tree is clean but hash didn't change
    // This means AI made no changes this iteration
    const result = await handlePostVerificationState.call(driver, true, false, false);

    expect(result).toBe(true); // Should continue evolution
    expect(mockLogger).toHaveBeenCalledWith(
      expect.stringContaining('AI made no changes this iteration (SKIP)')
    );
  });

  it('handles COMMITTED scenario when isClean && hashChanged', async () => {
    const mockLogger = jest.fn();
    driver = new SelfDriver({ once: true, logger: mockLogger });

    const handlePostVerificationState = (
      driver as unknown as {
        handlePostVerificationState: (
          isClean: boolean,
          hashChanged: boolean,
          hashError: boolean
        ) => Promise<boolean>;
      }
    ).handlePostVerificationState;

    const result = await handlePostVerificationState.call(driver, true, true, false);

    expect(result).toBe(true);
    expect(mockLogger).toHaveBeenCalledWith(expect.stringContaining('Changes committed by AI'));
  });

  it('handles hash error when working tree is clean', async () => {
    const mockLogger = jest.fn();
    driver = new SelfDriver({ once: true, logger: mockLogger });

    const handlePostVerificationState = (
      driver as unknown as {
        handlePostVerificationState: (
          isClean: boolean,
          hashChanged: boolean,
          hashError: boolean
        ) => Promise<boolean>;
      }
    ).handlePostVerificationState;

    const result = await handlePostVerificationState.call(driver, true, false, true);

    expect(result).toBe(true);
    expect(mockLogger).toHaveBeenCalledWith(
      expect.stringContaining('Could not determine commit hash status')
    );
    expect(mockLogger).toHaveBeenCalledWith(
      expect.stringContaining('Working tree is clean, assuming no changes made')
    );
  });

  it('handles hash error when working tree is not clean (reverts)', async () => {
    const mockLogger = jest.fn();
    driver = new SelfDriver({ once: true, logger: mockLogger });

    mockExeca.mockImplementation(async (command: string, args?: string[]) => {
      if (command === 'git' && args?.includes('reset')) {
        return mockExecaResult(0, '', '');
      }
      if (command === 'git' && args?.includes('checkout')) {
        return mockExecaResult(0, '', '');
      }
      if (command === 'git' && args?.includes('clean')) {
        return mockExecaResult(0, '', '');
      }
      return mockExecaResult(0, '', '');
    });

    const handlePostVerificationState = (
      driver as unknown as {
        handlePostVerificationState: (
          isClean: boolean,
          hashChanged: boolean,
          hashError: boolean
        ) => Promise<boolean>;
      }
    ).handlePostVerificationState;

    const result = await handlePostVerificationState.call(driver, false, false, true);

    expect(result).toBe(true);
    expect(mockLogger).toHaveBeenCalledWith(
      expect.stringContaining('Working tree is not clean, reverting to be safe')
    );
  });

  it('handles uncommitted changes after verification passes', async () => {
    const mockLogger = jest.fn();
    driver = new SelfDriver({ once: true, logger: mockLogger });

    mockExeca.mockImplementation(async (command: string, args?: string[]) => {
      if (command === 'git' && args?.includes('reset')) {
        return mockExecaResult(0, '', '');
      }
      if (command === 'git' && args?.includes('checkout')) {
        return mockExecaResult(0, '', '');
      }
      if (command === 'git' && args?.includes('clean')) {
        return mockExecaResult(0, '', '');
      }
      return mockExecaResult(0, '', '');
    });

    const handlePostVerificationState = (
      driver as unknown as {
        handlePostVerificationState: (
          isClean: boolean,
          hashChanged: boolean,
          hashError: boolean
        ) => Promise<boolean>;
      }
    ).handlePostVerificationState;

    // Test the case where verification passed but AI did not commit changes
    // isClean=false, hashError=false means working tree is dirty and we can verify commits
    const result = await handlePostVerificationState.call(driver, false, false, false);

    expect(result).toBe(true);
    expect(mockLogger).toHaveBeenCalledWith(
      expect.stringContaining('Verification passed but AI did not commit changes')
    );
    expect(mockLogger).toHaveBeenCalledWith(
      expect.stringContaining('Reverting uncommitted changes')
    );

    // Verify that consecutiveFailures is NOT incremented (verification passed)
    const status = driver.getStatus();
    expect(status.consecutiveFailures).toBe(0);
  });

  it('logs info message about reset failure counter when reverting uncommitted changes', async () => {
    const mockLogger = jest.fn();
    driver = new SelfDriver({ once: true, logger: mockLogger });

    mockExeca.mockImplementation(async (command: string, args?: string[]) => {
      if (command === 'git' && args?.includes('reset')) {
        return mockExecaResult(0, '', '');
      }
      if (command === 'git' && args?.includes('checkout')) {
        return mockExecaResult(0, '', '');
      }
      if (command === 'git' && args?.includes('clean')) {
        return mockExecaResult(0, '', '');
      }
      return mockExecaResult(0, '', '');
    });

    const handlePostVerificationState = (
      driver as unknown as {
        handlePostVerificationState: (
          isClean: boolean,
          hashChanged: boolean,
          hashError: boolean
        ) => Promise<boolean>;
      }
    ).handlePostVerificationState;

    await handlePostVerificationState.call(driver, false, false, false);

    expect(mockLogger).toHaveBeenCalledWith(expect.stringContaining('Reset failure counter'));
  });
});

describe('revert failure scenarios', () => {
  beforeEach(() => {
    driver = new SelfDriver();
  });

  afterEach(() => {
    if (driver) {
      driver.cleanup();
    }
  });

  it('handles git reset failure', async () => {
    const mockLogger = jest.fn();
    driver = new SelfDriver({ logger: mockLogger });

    mockExeca.mockImplementation(async (command: string, args?: string[]) => {
      if (command === 'git' && args?.includes('reset')) {
        return mockExecaResult(1, '', 'fatal: Cannot reset');
      }
      return mockExecaResult(0, '', '');
    });

    const revert = (driver as unknown as { revert: () => Promise<boolean> }).revert;
    const result = await revert.call(driver);

    expect(result).toBe(false); // Should return false on failure
    expect(mockLogger).toHaveBeenCalledWith(expect.stringContaining('Git reset failed'));
  });

  it('handles git clean failure', async () => {
    const mockLogger = jest.fn();
    driver = new SelfDriver({ logger: mockLogger });

    mockExeca.mockImplementation(async (command: string, args?: string[]) => {
      if (command === 'git' && args?.includes('reset')) {
        return mockExecaResult(0, '', '');
      }
      if (command === 'git' && args?.includes('checkout')) {
        return mockExecaResult(0, '', '');
      }
      if (command === 'git' && args?.includes('clean')) {
        return mockExecaResult(1, '', 'fatal: Cannot clean');
      }
      return mockExecaResult(0, '', '');
    });

    const revert = (driver as unknown as { revert: () => Promise<boolean> }).revert;
    const result = await revert.call(driver);

    expect(result).toBe(false); // Should return false on failure
    expect(mockLogger).toHaveBeenCalledWith(expect.stringContaining('Git clean failed'));
  });
});

describe('verify with useTsNode=false', () => {
  beforeEach(() => {
    driver = new SelfDriver({ useTsNode: false });
  });

  afterEach(() => {
    if (driver) {
      driver.cleanup();
    }
  });

  it('uses dist mode for verification when useTsNode=false', async () => {
    const mockLogger = jest.fn();
    driver = new SelfDriver({ useTsNode: false, logger: mockLogger });

    let distCommandCalled = false;

    mockExeca.mockImplementation(async (command: string, args?: string[]) => {
      // Check if dist mode is being used (node dist/cli/index.js)
      if (command === 'node' && args?.includes('dist/cli/index.js')) {
        distCommandCalled = true;
        return mockExecaResult(0, 'Usage: [command] [options]', '');
      }

      // npm commands should pass
      if (command === 'npm') {
        return mockExecaResult(0, '', '');
      }

      return mockExecaResult(0, '', '');
    });

    const verify = (driver as unknown as { verify: () => Promise<boolean> }).verify;
    const result = await verify.call(driver);

    expect(result).toBe(true);
    expect(distCommandCalled).toBe(true); // Should use dist mode, not ts-node
  });
});

describe('interrupted loop exit', () => {
  const drivers: SelfDriver[] = [];

  beforeEach(() => {
    jest.resetAllMocks();
    process.cwd = jest.fn().mockReturnValue(mockProjectRoot);

    mockExeca.mockImplementation(async (command: string, args?: string[]) => {
      // Git checks pass
      if (command === 'git' && args?.includes('rev-parse') && args?.includes('--git-dir')) {
        return mockExecaResult(0, '.git', '');
      }
      if (command === 'git' && args?.includes('status') && args?.includes('--porcelain')) {
        return mockExecaResult(0, '', '');
      }

      // OpenCode succeeds
      if (command === 'opencode') {
        if (args?.includes('--version')) {
          return mockExecaResult(0, '1.0.0', '');
        }
        if (args?.includes('run')) {
          return mockExecaResult(0, '', '');
        }
      }

      if (command === 'git' && args?.includes('ls-files')) {
        return mockExecaResult(0, 'src/core/self-driver.ts', '');
      }

      // Verification checks pass
      if (command === 'npm' && args?.includes('run') && args?.includes('build')) {
        return mockExecaResult(0, '', '');
      }
      if (command === 'npm' && args?.includes('test')) {
        return mockExecaResult(0, 'Test Suites: 10 passed', '');
      }
      if (command === 'npm' && args?.includes('run') && args?.includes('lint')) {
        return mockExecaResult(0, '', '');
      }
      if (command === 'node' && args?.includes('dist/cli/index.js') && args?.includes('evolve')) {
        return mockExecaResult(0, 'Usage: [command] [options]', '');
      }
      if (command === 'node' && args?.includes('dist/cli/index.js') && args?.includes('list')) {
        return mockExecaResult(0, 'Usage: [command] [options]', '');
      }

      return mockExecaResult(0, '', '');
    });
  });

  afterEach(() => {
    drivers.forEach((d) => d.cleanup());
    drivers.length = 0;
    jest.restoreAllMocks();
    process.cwd = originalCwd;
  });

  it('exits loop gracefully when interrupted by SIGINT', async () => {
    const mockLogger = jest.fn();
    driver = new SelfDriver({ once: false, logger: mockLogger, sleepMs: 50 });
    drivers.push(driver);

    // Access private run method
    const run = (driver as unknown as { run: () => Promise<void> }).run;

    // Start the run loop in the background
    const runPromise = run.call(driver);

    // Wait a bit for the loop to start
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Simulate SIGINT to interrupt the loop
    process.emit('SIGINT' as NodeJS.Signals);

    // Wait for the run to complete
    await runPromise;

    // Should log that evolution stopped
    expect(mockLogger).toHaveBeenCalledWith(expect.stringContaining('Evolution stopped'));
  });
});
