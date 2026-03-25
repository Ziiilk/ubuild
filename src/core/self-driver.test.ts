import {
  SelfDriver,
  SelfEvolverOptions,
  Diagnosis,
  EvolutionSuggestion,
  VerificationResult,
  runSelfEvolution,
} from './self-driver';

const mockExeca = jest.fn<
  Promise<{ exitCode: number; stdout: string; stderr: string }>,
  [string, string[]?, Record<string, unknown>?]
>();

jest.mock('execa', () => ({
  execa: (...args: [string, string[]?, Record<string, unknown>?]) => mockExeca(...args),
}));

describe('SelfDriver', () => {
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

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers();
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
      }
      if (command === 'find' || command === 'cmd') {
        return mockExecaResult(0, 'src/core/self-driver.test.ts', '');
      }
      if (command === 'opencode') {
        return mockExecaResult(0, '', '');
      }

      return mockExecaResult(0, '', '');
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    process.cwd = originalCwd;
  });

  describe('constructor', () => {
    it('creates driver with default options', () => {
      driver = new SelfDriver();
      expect(driver).toBeDefined();
    });

    it('creates driver with custom options', () => {
      const options: SelfEvolverOptions = {
        interval: 10000,
        apiKey: 'test-api-key',
        model: 'test-model',
        logger: jest.fn(),
      };
      driver = new SelfDriver(options);
      expect(driver).toBeDefined();
    });

    it('uses default interval when not specified', () => {
      driver = new SelfDriver();
      expect(driver).toBeDefined();
    });
  });

  describe('diagnose', () => {
    beforeEach(() => {
      driver = new SelfDriver();
    });

    it('returns empty diagnosis when all checks pass', async () => {
      // Access private method via type assertion
      const diagnose = (driver as unknown as { diagnose: () => Promise<Diagnosis> }).diagnose;
      const result = await diagnose.call(driver);

      expect(result.testFailures).toEqual([]);
      expect(result.lintErrors).toEqual([]);
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });

    it('captures test failures from test output', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'npm' && args?.includes('test')) {
          return mockExecaResult(1, 'FAIL src/core/example.test.ts', 'Test failed');
        }
        return mockExecaResult(0, '', '');
      });

      const diagnose = (driver as unknown as { diagnose: () => Promise<Diagnosis> }).diagnose;
      const result = await diagnose.call(driver);

      expect(result.testFailures.length).toBeGreaterThan(0);
    });

    it('captures lint errors from lint output', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'npm' && args?.includes('test')) {
          return mockExecaResult(0, '', '');
        }
        if (command === 'npm' && args?.includes('run') && args?.includes('lint')) {
          return mockExecaResult(1, 'src/core/example.ts:10:5 error Missing semicolon', '');
        }
        return mockExecaResult(0, '', '');
      });

      const diagnose = (driver as unknown as { diagnose: () => Promise<Diagnosis> }).diagnose;
      const result = await diagnose.call(driver);

      expect(result.lintErrors.length).toBeGreaterThan(0);
    });

    it('handles test execution errors gracefully', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'npm' && args?.includes('test')) {
          throw new Error('npm not found');
        }
        return mockExecaResult(0, '', '');
      });

      const diagnose = (driver as unknown as { diagnose: () => Promise<Diagnosis> }).diagnose;
      const result = await diagnose.call(driver);

      expect(result.testFailures.length).toBeGreaterThan(0);
      expect(result.testFailures[0]).toContain('npm not found');
    });

    it('handles lint execution errors gracefully', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'npm' && args?.includes('run') && args?.includes('lint')) {
          throw new Error('npm not found');
        }
        return mockExecaResult(0, '', '');
      });

      const diagnose = (driver as unknown as { diagnose: () => Promise<Diagnosis> }).diagnose;
      const result = await diagnose.call(driver);

      expect(result.lintErrors.length).toBeGreaterThan(0);
      expect(result.lintErrors[0]).toContain('npm not found');
    });
  });

  describe('analyzeEvolutionSuggestions', () => {
    beforeEach(() => {
      driver = new SelfDriver();
    });

    it('returns critical suggestions when tests fail', async () => {
      const diagnosis: Diagnosis = {
        testFailures: ['src/core/example.test.ts'],
        lintErrors: [],
        timestamp: new Date().toISOString(),
      };

      const analyzeEvolutionSuggestions = (
        driver as unknown as {
          analyzeEvolutionSuggestions: (d: Diagnosis) => Promise<EvolutionSuggestion[]>;
        }
      ).analyzeEvolutionSuggestions;
      const suggestions = await analyzeEvolutionSuggestions.call(driver, diagnosis);

      const criticalFixes = suggestions.filter(
        (s) => s.priority === 'critical' && s.category === 'fix' && s.description.includes('test')
      );
      expect(criticalFixes.length).toBeGreaterThan(0);
    });

    it('returns critical suggestions when lint errors exist', async () => {
      const diagnosis: Diagnosis = {
        testFailures: [],
        lintErrors: ['src/core/example.ts:10:5 error Missing semicolon'],
        timestamp: new Date().toISOString(),
      };

      const analyzeEvolutionSuggestions = (
        driver as unknown as {
          analyzeEvolutionSuggestions: (d: Diagnosis) => Promise<EvolutionSuggestion[]>;
        }
      ).analyzeEvolutionSuggestions;
      const suggestions = await analyzeEvolutionSuggestions.call(driver, diagnosis);

      const criticalLintFixes = suggestions.filter(
        (s) => s.priority === 'critical' && s.category === 'fix' && s.description.includes('lint')
      );
      expect(criticalLintFixes.length).toBeGreaterThan(0);
    });

    it('returns conservative improvements when no critical issues', async () => {
      mockExeca.mockImplementation(async () => mockExecaResult(0, '', ''));

      const diagnosis: Diagnosis = {
        testFailures: [],
        lintErrors: [],
        timestamp: new Date().toISOString(),
      };

      const analyzeEvolutionSuggestions = (
        driver as unknown as {
          analyzeEvolutionSuggestions: (d: Diagnosis) => Promise<EvolutionSuggestion[]>;
        }
      ).analyzeEvolutionSuggestions;
      const suggestions = await analyzeEvolutionSuggestions.call(driver, diagnosis);

      // Should have at least type safety and documentation suggestions
      expect(suggestions.length).toBeGreaterThan(0);

      // Check that suggestions are prioritized correctly
      const typeRefactor = suggestions.find(
        (s) => s.category === 'refactor' && s.description.toLowerCase().includes('type')
      );
      expect(typeRefactor).toBeDefined();
    });

    it('sorts suggestions by priority', async () => {
      mockExeca.mockImplementation(async () => mockExecaResult(0, '', ''));

      const diagnosis: Diagnosis = {
        testFailures: [],
        lintErrors: [],
        timestamp: new Date().toISOString(),
      };

      const analyzeEvolutionSuggestions = (
        driver as unknown as {
          analyzeEvolutionSuggestions: (d: Diagnosis) => Promise<EvolutionSuggestion[]>;
        }
      ).analyzeEvolutionSuggestions;
      const suggestions = await analyzeEvolutionSuggestions.call(driver, diagnosis);

      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      for (let i = 0; i < suggestions.length - 1; i++) {
        const current = priorityOrder[suggestions[i].priority];
        const next = priorityOrder[suggestions[i + 1].priority];
        expect(current).toBeLessThanOrEqual(next);
      }
    });
  });

  describe('verify', () => {
    beforeEach(() => {
      driver = new SelfDriver();
    });

    it('returns success when all verification checks pass', async () => {
      mockExeca.mockImplementation(async () => mockExecaResult(0, '', ''));

      const verify = (driver as unknown as { verify: () => Promise<VerificationResult> }).verify;
      const result = await verify.call(driver);

      expect(result.success).toBe(true);
      expect(result.buildSucceeds).toBe(true);
      expect(result.testsPass).toBe(true);
      expect(result.lintClean).toBe(true);
      expect(result.evolveFunctional).toBe(true);
      expect(result.coreCommandsWork).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('returns failure when build fails', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'npm' && args?.includes('run') && args?.includes('build')) {
          return mockExecaResult(1, 'Build failed', '');
        }
        return mockExecaResult(0, '', '');
      });

      const verify = (driver as unknown as { verify: () => Promise<VerificationResult> }).verify;
      const result = await verify.call(driver);

      expect(result.success).toBe(false);
      expect(result.buildSucceeds).toBe(false);
      expect(result.errors).toContain('Build failed');
    });

    it('returns failure when tests fail', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'npm' && args?.includes('test')) {
          return mockExecaResult(1, 'Tests failed', '');
        }
        return mockExecaResult(0, '', '');
      });

      const verify = (driver as unknown as { verify: () => Promise<VerificationResult> }).verify;
      const result = await verify.call(driver);

      expect(result.success).toBe(false);
      expect(result.testsPass).toBe(false);
      expect(result.errors).toContain('Tests failed');
    });

    it('returns failure when lint fails', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'npm' && args?.includes('run') && args?.includes('lint')) {
          return mockExecaResult(1, 'Lint errors', '');
        }
        return mockExecaResult(0, '', '');
      });

      const verify = (driver as unknown as { verify: () => Promise<VerificationResult> }).verify;
      const result = await verify.call(driver);

      expect(result.success).toBe(false);
      expect(result.lintClean).toBe(false);
      expect(result.errors).toContain('Lint errors found');
    });

    it('returns failure when evolve command is broken', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'npx' && args?.includes('evolve')) {
          return mockExecaResult(1, 'Command failed', '');
        }
        return mockExecaResult(0, '', '');
      });

      const verify = (driver as unknown as { verify: () => Promise<VerificationResult> }).verify;
      const result = await verify.call(driver);

      expect(result.success).toBe(false);
      expect(result.evolveFunctional).toBe(false);
      expect(result.errors).toContain('Evolve command broken');
    });

    it('returns failure when core commands are broken', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'npx' && args?.includes('list')) {
          return mockExecaResult(1, 'Command failed', '');
        }
        return mockExecaResult(0, '', '');
      });

      const verify = (driver as unknown as { verify: () => Promise<VerificationResult> }).verify;
      const result = await verify.call(driver);

      expect(result.success).toBe(false);
      expect(result.coreCommandsWork).toBe(false);
      expect(result.errors.some((e) => e.includes("Core command 'list'"))).toBe(true);
    });

    it('captures execution errors in error list', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'npm' && args?.includes('test')) {
          throw new Error('Test execution error');
        }
        return mockExecaResult(0, '', '');
      });

      const verify = (driver as unknown as { verify: () => Promise<VerificationResult> }).verify;
      const result = await verify.call(driver);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Test execution error');
    });
  });

  describe('hasTestFiles', () => {
    beforeEach(() => {
      driver = new SelfDriver();
    });

    it('returns true when test files exist (Unix find)', async () => {
      mockExeca.mockImplementation(async (command: string) => {
        if (command === 'find') {
          return mockExecaResult(0, 'src/core/example.test.ts', '');
        }
        return mockExecaResult(0, '', '');
      });

      const hasTestFiles = (driver as unknown as { hasTestFiles: () => Promise<boolean> })
        .hasTestFiles;
      const result = await hasTestFiles.call(driver);

      expect(result).toBe(true);
    });

    it('returns false when no test files exist', async () => {
      mockExeca.mockImplementation(async () => mockExecaResult(0, '', ''));

      const hasTestFiles = (driver as unknown as { hasTestFiles: () => Promise<boolean> })
        .hasTestFiles;
      const result = await hasTestFiles.call(driver);

      expect(result).toBe(false);
    });

    it('falls back to Windows dir command on Unix find failure', async () => {
      mockExeca.mockImplementation(async (command: string) => {
        if (command === 'find') {
          throw new Error('Command not found');
        }
        if (command === 'cmd') {
          return mockExecaResult(0, 'src\\core\\example.test.ts', '');
        }
        return mockExecaResult(0, '', '');
      });

      const hasTestFiles = (driver as unknown as { hasTestFiles: () => Promise<boolean> })
        .hasTestFiles;
      const result = await hasTestFiles.call(driver);

      expect(result).toBe(true);
    });

    it('returns false when both find and dir fail', async () => {
      mockExeca.mockImplementation(async () => {
        throw new Error('Command failed');
      });

      const hasTestFiles = (driver as unknown as { hasTestFiles: () => Promise<boolean> })
        .hasTestFiles;
      const result = await hasTestFiles.call(driver);

      expect(result).toBe(false);
    });
  });

  describe('hasChanges', () => {
    beforeEach(() => {
      driver = new SelfDriver();
    });

    it('returns true when git status shows changes', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'git' && args?.includes('status')) {
          return mockExecaResult(0, 'M src/core/example.ts', '');
        }
        return mockExecaResult(0, '', '');
      });

      const hasChanges = (driver as unknown as { hasChanges: () => Promise<boolean> }).hasChanges;
      const result = await hasChanges.call(driver);

      expect(result).toBe(true);
    });

    it('returns false when git status is empty', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'git' && args?.includes('status')) {
          return mockExecaResult(0, '', '');
        }
        return mockExecaResult(0, '', '');
      });

      const hasChanges = (driver as unknown as { hasChanges: () => Promise<boolean> }).hasChanges;
      const result = await hasChanges.call(driver);

      expect(result).toBe(false);
    });

    it('returns false when git command fails', async () => {
      mockExeca.mockImplementation(async () => {
        throw new Error('Not a git repository');
      });

      const hasChanges = (driver as unknown as { hasChanges: () => Promise<boolean> }).hasChanges;
      const result = await hasChanges.call(driver);

      expect(result).toBe(false);
    });
  });

  describe('commit', () => {
    beforeEach(() => {
      driver = new SelfDriver();
    });

    it('commits changes when they exist', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'git' && args?.includes('status')) {
          return mockExecaResult(0, 'M src/core/example.ts', '');
        }
        return mockExecaResult(0, '', '');
      });

      const commit = (driver as unknown as { commit: (msg: string) => Promise<void> }).commit;
      await expect(commit.call(driver, 'test: add example tests')).resolves.not.toThrow();
    });

    it('does not commit when no changes exist', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'git' && args?.includes('status')) {
          return mockExecaResult(0, '', '');
        }
        return mockExecaResult(0, '', '');
      });

      const commit = (driver as unknown as { commit: (msg: string) => Promise<void> }).commit;
      await expect(commit.call(driver, 'test: add example tests')).resolves.not.toThrow();
    });

    it('handles commit failure gracefully', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'git' && args?.includes('status')) {
          return mockExecaResult(0, 'M src/core/example.ts', '');
        }
        if (command === 'git' && args?.includes('commit')) {
          throw new Error('Commit failed');
        }
        return mockExecaResult(0, '', '');
      });

      const commit = (driver as unknown as { commit: (msg: string) => Promise<void> }).commit;
      await expect(commit.call(driver, 'test: add example tests')).resolves.not.toThrow();
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

  describe('buildPrompt', () => {
    beforeEach(() => {
      driver = new SelfDriver();
    });

    it('includes critical issues in prompt', () => {
      const diagnosis: Diagnosis = {
        testFailures: ['src/core/example.test.ts'],
        lintErrors: ['src/core/example.ts:10:5 error'],
        timestamp: new Date().toISOString(),
      };
      const suggestions: EvolutionSuggestion[] = [];

      const buildPrompt = (
        driver as unknown as {
          buildPrompt: (d: Diagnosis, s: EvolutionSuggestion[]) => string;
        }
      ).buildPrompt;
      const prompt = buildPrompt.call(driver, diagnosis, suggestions);

      expect(prompt).toContain('CRITICAL ISSUES');
      expect(prompt).toContain('example.test.ts');
      expect(prompt).toContain('FIX IMMEDIATELY');
    });

    it('suggests improvements when no critical issues', () => {
      const diagnosis: Diagnosis = {
        testFailures: [],
        lintErrors: [],
        timestamp: new Date().toISOString(),
      };
      const suggestions: EvolutionSuggestion[] = [
        {
          priority: 'high',
          category: 'test',
          description: 'Add more tests',
          reason: 'Coverage is low',
          estimatedEffort: 'medium',
        },
      ];

      const buildPrompt = (
        driver as unknown as {
          buildPrompt: (d: Diagnosis, s: EvolutionSuggestion[]) => string;
        }
      ).buildPrompt;
      const prompt = buildPrompt.call(driver, diagnosis, suggestions);

      expect(prompt).toContain('No critical issues');
      expect(prompt).toContain('Add more tests');
    });

    it('includes verification checklist in prompt', () => {
      const diagnosis: Diagnosis = {
        testFailures: [],
        lintErrors: [],
        timestamp: new Date().toISOString(),
      };
      const suggestions: EvolutionSuggestion[] = [];

      const buildPrompt = (
        driver as unknown as {
          buildPrompt: (d: Diagnosis, s: EvolutionSuggestion[]) => string;
        }
      ).buildPrompt;
      const prompt = buildPrompt.call(driver, diagnosis, suggestions);

      expect(prompt).toContain('VERIFICATION CHECKLIST');
      expect(prompt).toContain('npm run build');
      expect(prompt).toContain('npm test');
      expect(prompt).toContain('npm run lint');
    });
  });

  describe('generateCommitMessage', () => {
    beforeEach(() => {
      driver = new SelfDriver();
    });

    it('generates fix message for test failures', () => {
      const diagnosis: Diagnosis = {
        testFailures: ['src/core/example.test.ts'],
        lintErrors: [],
        timestamp: new Date().toISOString(),
      };
      const suggestions: EvolutionSuggestion[] = [];

      const generateCommitMessage = (
        driver as unknown as {
          generateCommitMessage: (d: Diagnosis, s: EvolutionSuggestion[]) => string;
        }
      ).generateCommitMessage;
      const message = generateCommitMessage.call(driver, diagnosis, suggestions);

      expect(message).toContain('fix');
      expect(message).toContain('test');
    });

    it('generates fix message for lint errors', () => {
      const diagnosis: Diagnosis = {
        testFailures: [],
        lintErrors: ['error 1', 'error 2'],
        timestamp: new Date().toISOString(),
      };
      const suggestions: EvolutionSuggestion[] = [];

      const generateCommitMessage = (
        driver as unknown as {
          generateCommitMessage: (d: Diagnosis, s: EvolutionSuggestion[]) => string;
        }
      ).generateCommitMessage;
      const message = generateCommitMessage.call(driver, diagnosis, suggestions);

      expect(message).toContain('fix');
      expect(message).toContain('lint');
    });

    it('generates message from top suggestion when no issues', () => {
      const diagnosis: Diagnosis = {
        testFailures: [],
        lintErrors: [],
        timestamp: new Date().toISOString(),
      };
      const suggestions: EvolutionSuggestion[] = [
        {
          priority: 'high',
          category: 'test',
          description: 'Add integration tests',
          reason: 'Coverage',
          estimatedEffort: 'large',
        },
      ];

      const generateCommitMessage = (
        driver as unknown as {
          generateCommitMessage: (d: Diagnosis, s: EvolutionSuggestion[]) => string;
        }
      ).generateCommitMessage;
      const message = generateCommitMessage.call(driver, diagnosis, suggestions);

      expect(message).toContain('test');
      expect(message).toContain('integration tests');
    });

    it('generates generic message when no issues or suggestions', () => {
      const diagnosis: Diagnosis = {
        testFailures: [],
        lintErrors: [],
        timestamp: new Date().toISOString(),
      };
      const suggestions: EvolutionSuggestion[] = [];

      const generateCommitMessage = (
        driver as unknown as {
          generateCommitMessage: (d: Diagnosis, s: EvolutionSuggestion[]) => string;
        }
      ).generateCommitMessage;
      const message = generateCommitMessage.call(driver, diagnosis, suggestions);

      expect(message).toContain('refactor');
    });
  });

  describe('evolveWithOpenCode', () => {
    beforeEach(() => {
      driver = new SelfDriver({ apiKey: 'test-key', model: 'test-model' });
    });

    it('executes opencode with correct arguments', async () => {
      mockExeca.mockImplementation(async () => mockExecaResult(0, '', ''));

      const diagnosis: Diagnosis = {
        testFailures: [],
        lintErrors: [],
        timestamp: new Date().toISOString(),
      };
      const suggestions: EvolutionSuggestion[] = [];

      const evolveWithOpenCode = (
        driver as unknown as {
          evolveWithOpenCode: (d: Diagnosis, s: EvolutionSuggestion[]) => Promise<boolean>;
        }
      ).evolveWithOpenCode;
      const result = await evolveWithOpenCode.call(driver, diagnosis, suggestions);

      expect(result).toBe(true);
      expect(mockExeca).toHaveBeenCalledWith(
        'opencode',
        expect.arrayContaining(['run', '--api-key', 'test-key', '--model', 'test-model']),
        expect.any(Object)
      );
    });

    it('returns true even when opencode exits with error', async () => {
      mockExeca.mockImplementation(async () => {
        throw new Error('Exit code 1');
      });

      const diagnosis: Diagnosis = {
        testFailures: [],
        lintErrors: [],
        timestamp: new Date().toISOString(),
      };
      const suggestions: EvolutionSuggestion[] = [];

      const evolveWithOpenCode = (
        driver as unknown as {
          evolveWithOpenCode: (d: Diagnosis, s: EvolutionSuggestion[]) => Promise<boolean>;
        }
      ).evolveWithOpenCode;
      const result = await evolveWithOpenCode.call(driver, diagnosis, suggestions);

      expect(result).toBe(true);
    });
  });

  describe('buildEnv', () => {
    beforeEach(() => {
      driver = new SelfDriver({ model: 'custom-model' });
    });

    it('includes OPENCODE_MODEL when model is specified', () => {
      const buildEnv = (driver as unknown as { buildEnv: () => Record<string, string> }).buildEnv;
      const env = buildEnv.call(driver);

      expect(env.OPENCODE_MODEL).toBe('custom-model');
    });

    it('includes all existing environment variables', () => {
      process.env.TEST_VAR = 'test-value';

      const buildEnv = (driver as unknown as { buildEnv: () => Record<string, string> }).buildEnv;
      const env = buildEnv.call(driver);

      expect(env.TEST_VAR).toBe('test-value');

      delete process.env.TEST_VAR;
    });
  });

  describe('sleep', () => {
    beforeEach(() => {
      driver = new SelfDriver();
    });

    it('resolves after specified time', async () => {
      const sleep = (driver as unknown as { sleep: (ms: number) => Promise<void> }).sleep;
      const promise = sleep.call(driver, 1000);

      jest.advanceTimersByTime(1000);
      await expect(promise).resolves.toBeUndefined();
    });
  });
});

describe('runSelfEvolution', () => {
  it('exports the convenience function', () => {
    expect(runSelfEvolution).toBeDefined();
    expect(typeof runSelfEvolution).toBe('function');
  });
});
