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

      const revert = (driver as unknown as { revert: () => Promise<void> }).revert;
      await expect(revert.call(driver)).resolves.not.toThrow();
    });

    it('handles revert failure gracefully', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'git' && args?.includes('checkout')) {
          throw new Error('Revert failed');
        }
        return mockExecaResult(0, '', '');
      });

      const revert = (driver as unknown as { revert: () => Promise<void> }).revert;
      await expect(revert.call(driver)).resolves.not.toThrow();
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

    it('returns file list from git', async () => {
      mockExeca.mockImplementation(async () => {
        return mockExecaResult(0, 'src/core/self-driver.ts\nsrc/commands/evolve.ts', '');
      });

      const getFileTree = (
        driver as unknown as {
          getFileTree: () => Promise<string>;
        }
      ).getFileTree;
      const result = await getFileTree.call(driver);

      expect(result).toContain('self-driver.ts');
      expect(result).toContain('evolve.ts');
    });

    it('returns default message when git ls-files returns non-zero exit code', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'git' && args?.includes('ls-files')) {
          return mockExecaResult(128, '', 'fatal: not a git repository');
        }
        return mockExecaResult(0, '', '');
      });

      const getFileTree = (
        driver as unknown as {
          getFileTree: () => Promise<string>;
        }
      ).getFileTree;
      const result = await getFileTree.call(driver);

      expect(result).toBe('src/ directory');
    });

    it('returns default message when git fails', async () => {
      mockExeca.mockImplementation(async () => {
        throw new Error('Git error');
      });

      const getFileTree = (
        driver as unknown as {
          getFileTree: () => Promise<string>;
        }
      ).getFileTree;
      const result = await getFileTree.call(driver);

      expect(result).toBe('src/ directory');
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

    it('proceeds with evolution when in a git repository', async () => {
      const mockLogger = jest.fn();
      driver = new SelfDriver({ once: true, logger: mockLogger });

      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        const fullCommand = `${command} ${args?.join(' ') ?? ''}`;

        // Git rev-parse succeeds
        if (command === 'git' && args?.includes('rev-parse') && args?.includes('--git-dir')) {
          return mockExecaResult(0, '.git', '');
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

    mockExeca.mockImplementation(async (command: string, args?: string[]) => {
      const fullCommand = `${command} ${args?.join(' ') ?? ''}`;

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
});
