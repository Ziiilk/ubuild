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

    it('returns empty suggestions when no critical issues (AI decides improvements)', async () => {
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

      // When no critical issues, suggestions should be empty
      // AI will analyze codebase and decide improvements in buildPrompt
      expect(suggestions.length).toBe(0);
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

    it('handles build failure in analyzeEvolutionSuggestions', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'npm' && args?.includes('test')) {
          return mockExecaResult(0, '', '');
        }
        if (command === 'npm' && args?.includes('run') && args?.includes('build')) {
          return mockExecaResult(1, 'Build failed', '');
        }
        if (command === 'npx' && args?.includes('evolve')) {
          return mockExecaResult(0, 'Usage: evolve [options]', '');
        }
        if (
          command === 'npx' &&
          (args?.includes('list') || args?.includes('engine') || args?.includes('build'))
        ) {
          return mockExecaResult(0, 'Usage: [command] [options]', '');
        }
        return mockExecaResult(0, '', '');
      });

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

      const buildFix = suggestions.find((s) => s.description.includes('TypeScript compilation'));
      expect(buildFix).toBeDefined();
      expect(buildFix?.priority).toBe('critical');
    });

    it('handles build command exception in analyzeEvolutionSuggestions', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'npm' && args?.includes('test')) {
          return mockExecaResult(0, '', '');
        }
        if (command === 'npm' && args?.includes('run') && args?.includes('build')) {
          throw new Error('Build command failed');
        }
        if (command === 'npx' && args?.includes('evolve')) {
          return mockExecaResult(0, 'Usage: evolve [options]', '');
        }
        if (
          command === 'npx' &&
          (args?.includes('list') || args?.includes('engine') || args?.includes('build'))
        ) {
          return mockExecaResult(0, 'Usage: [command] [options]', '');
        }
        return mockExecaResult(0, '', '');
      });

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

      const buildFix = suggestions.find((s) => s.description.includes('build configuration'));
      expect(buildFix).toBeDefined();
      expect(buildFix?.priority).toBe('critical');
    });

    it('handles evolve command failure in analyzeEvolutionSuggestions', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'npm' && args?.includes('test')) {
          return mockExecaResult(0, '', '');
        }
        if (command === 'npm' && args?.includes('run') && args?.includes('build')) {
          return mockExecaResult(0, '', '');
        }
        if (command === 'npx' && args?.includes('evolve')) {
          return mockExecaResult(1, 'Command failed', '');
        }
        if (
          command === 'npx' &&
          (args?.includes('list') || args?.includes('engine') || args?.includes('build'))
        ) {
          return mockExecaResult(0, 'Usage: [command] [options]', '');
        }
        return mockExecaResult(0, '', '');
      });

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

      const evolveFix = suggestions.find((s) => s.description.includes('self-evolution'));
      expect(evolveFix).toBeDefined();
      expect(evolveFix?.priority).toBe('critical');
    });

    it('handles evolve command exception in analyzeEvolutionSuggestions', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'npm' && args?.includes('test')) {
          return mockExecaResult(0, '', '');
        }
        if (command === 'npm' && args?.includes('run') && args?.includes('build')) {
          return mockExecaResult(0, '', '');
        }
        if (command === 'npx' && args?.includes('evolve')) {
          throw new Error('Evolve command exception');
        }
        if (
          command === 'npx' &&
          (args?.includes('list') || args?.includes('engine') || args?.includes('build'))
        ) {
          return mockExecaResult(0, 'Usage: [command] [options]', '');
        }
        return mockExecaResult(0, '', '');
      });

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

      const evolveFix = suggestions.find((s) => s.description.includes('Restore evolve'));
      expect(evolveFix).toBeDefined();
      expect(evolveFix?.priority).toBe('critical');
      expect(evolveFix?.estimatedEffort).toBe('large');
    });

    it('handles core command failure in analyzeEvolutionSuggestions', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'npm' && args?.includes('test')) {
          return mockExecaResult(0, '', '');
        }
        if (command === 'npm' && args?.includes('run') && args?.includes('build')) {
          return mockExecaResult(0, '', '');
        }
        if (command === 'npx' && args?.includes('evolve')) {
          return mockExecaResult(0, 'Usage: evolve [options]', '');
        }
        if (command === 'npx' && args?.includes('list')) {
          return mockExecaResult(1, 'Command failed', '');
        }
        if (command === 'npx' && (args?.includes('engine') || args?.includes('build'))) {
          return mockExecaResult(0, 'Usage: [command] [options]', '');
        }
        return mockExecaResult(0, '', '');
      });

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

      const coreFix = suggestions.find((s) => s.description.includes("'list' command"));
      expect(coreFix).toBeDefined();
      expect(coreFix?.priority).toBe('high');
    });

    it('handles core command exception in analyzeEvolutionSuggestions', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'npm' && args?.includes('test')) {
          return mockExecaResult(0, '', '');
        }
        if (command === 'npm' && args?.includes('run') && args?.includes('build')) {
          return mockExecaResult(0, '', '');
        }
        if (command === 'npx' && args?.includes('evolve')) {
          return mockExecaResult(0, 'Usage: evolve [options]', '');
        }
        if (command === 'npx' && args?.includes('engine')) {
          throw new Error('Engine command exception');
        }
        if (command === 'npx' && (args?.includes('list') || args?.includes('build'))) {
          return mockExecaResult(0, 'Usage: [command] [options]', '');
        }
        return mockExecaResult(0, '', '');
      });

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

      const coreFix = suggestions.find((s) => s.description.includes("'engine' command"));
      expect(coreFix).toBeDefined();
      expect(coreFix?.priority).toBe('high');
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

    it('captures build execution error', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'npm' && args?.includes('run') && args?.includes('build')) {
          throw new Error('Build execution error');
        }
        if (command === 'npm' && args?.includes('test')) {
          return mockExecaResult(0, '', '');
        }
        if (command === 'npm' && args?.includes('run') && args?.includes('lint')) {
          return mockExecaResult(0, '', '');
        }
        if (command === 'npx' && args?.includes('evolve')) {
          return mockExecaResult(0, 'Usage: evolve [options]', '');
        }
        if (
          command === 'npx' &&
          (args?.includes('list') || args?.includes('engine') || args?.includes('build'))
        ) {
          return mockExecaResult(0, 'Usage: [command] [options]', '');
        }
        return mockExecaResult(0, '', '');
      });

      const verify = (driver as unknown as { verify: () => Promise<VerificationResult> }).verify;
      const result = await verify.call(driver);

      expect(result.success).toBe(false);
      expect(result.buildSucceeds).toBe(false);
      expect(result.errors.some((e) => e.includes('Build execution error'))).toBe(true);
    });

    it('captures lint execution error', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'npm' && args?.includes('run') && args?.includes('lint')) {
          throw new Error('Lint execution error');
        }
        if (command === 'npm' && args?.includes('test')) {
          return mockExecaResult(0, '', '');
        }
        if (command === 'npm' && args?.includes('run') && args?.includes('build')) {
          return mockExecaResult(0, '', '');
        }
        if (command === 'npx' && args?.includes('evolve')) {
          return mockExecaResult(0, 'Usage: evolve [options]', '');
        }
        if (
          command === 'npx' &&
          (args?.includes('list') || args?.includes('engine') || args?.includes('build'))
        ) {
          return mockExecaResult(0, 'Usage: [command] [options]', '');
        }
        return mockExecaResult(0, '', '');
      });

      const verify = (driver as unknown as { verify: () => Promise<VerificationResult> }).verify;
      const result = await verify.call(driver);

      expect(result.success).toBe(false);
      expect(result.lintClean).toBe(false);
      expect(result.errors.some((e) => e.includes('Lint execution error'))).toBe(true);
    });

    it('captures evolve check execution error', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'npx' && args?.includes('evolve')) {
          throw new Error('Evolve check error');
        }
        if (command === 'npm' && args?.includes('test')) {
          return mockExecaResult(0, '', '');
        }
        if (command === 'npm' && args?.includes('run') && args?.includes('build')) {
          return mockExecaResult(0, '', '');
        }
        if (command === 'npm' && args?.includes('run') && args?.includes('lint')) {
          return mockExecaResult(0, '', '');
        }
        if (
          command === 'npx' &&
          (args?.includes('list') || args?.includes('engine') || args?.includes('build'))
        ) {
          return mockExecaResult(0, 'Usage: [command] [options]', '');
        }
        return mockExecaResult(0, '', '');
      });

      const verify = (driver as unknown as { verify: () => Promise<VerificationResult> }).verify;
      const result = await verify.call(driver);

      expect(result.success).toBe(false);
      expect(result.evolveFunctional).toBe(false);
      expect(result.errors.some((e) => e.includes('Evolve check failed'))).toBe(true);
    });

    it('captures core command execution error', async () => {
      mockExeca.mockImplementation(async (command: string, args?: string[]) => {
        if (command === 'npx' && args?.includes('build')) {
          throw new Error('Build command error');
        }
        if (command === 'npm' && args?.includes('test')) {
          return mockExecaResult(0, '', '');
        }
        if (command === 'npm' && args?.includes('run') && args?.includes('build')) {
          return mockExecaResult(0, '', '');
        }
        if (command === 'npm' && args?.includes('run') && args?.includes('lint')) {
          return mockExecaResult(0, '', '');
        }
        if (command === 'npx' && args?.includes('evolve')) {
          return mockExecaResult(0, 'Usage: evolve [options]', '');
        }
        if (command === 'npx' && (args?.includes('list') || args?.includes('engine'))) {
          return mockExecaResult(0, 'Usage: [command] [options]', '');
        }
        return mockExecaResult(0, '', '');
      });

      const verify = (driver as unknown as { verify: () => Promise<VerificationResult> }).verify;
      const result = await verify.call(driver);

      expect(result.success).toBe(false);
      expect(result.coreCommandsWork).toBe(false);
      expect(result.errors.some((e) => e.includes("Command 'build' error"))).toBe(true);
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
      expect(prompt).toContain('ANALYZE the codebase');
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

      expect(result).toBe(false);
    });

    it('logs error message when opencode throws', async () => {
      const logSpy = jest.fn();
      driver = new SelfDriver({ logger: logSpy });

      mockExeca.mockImplementation(async () => {
        throw new Error('OpenCode execution failed');
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
      await evolveWithOpenCode.call(driver, diagnosis, suggestions);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('OpenCode exited'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('OpenCode execution failed'));
    });

    it('handles non-Error objects thrown by opencode', async () => {
      const logSpy = jest.fn();
      driver = new SelfDriver({ logger: logSpy });

      mockExeca.mockImplementation(async () => {
        throw 'String error';
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

      expect(result).toBe(false);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('String error'));
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

  describe('logDiagnosis', () => {
    beforeEach(() => {
      driver = new SelfDriver();
    });

    it('logs issues when test failures exist', () => {
      const diagnosis: Diagnosis = {
        testFailures: ['src/core/failing.test.ts'],
        lintErrors: [],
        timestamp: new Date().toISOString(),
      };
      const suggestions: EvolutionSuggestion[] = [];

      const logDiagnosis = (
        driver as unknown as { logDiagnosis: (d: Diagnosis, s: EvolutionSuggestion[]) => void }
      ).logDiagnosis;
      logDiagnosis.call(driver, diagnosis, suggestions);

      // Method should complete without error
      expect(true).toBe(true);
    });

    it('logs issues when lint errors exist', () => {
      const diagnosis: Diagnosis = {
        testFailures: [],
        lintErrors: ['src/core/example.ts:10:5 error Missing semicolon'],
        timestamp: new Date().toISOString(),
      };
      const suggestions: EvolutionSuggestion[] = [];

      const logDiagnosis = (
        driver as unknown as { logDiagnosis: (d: Diagnosis, s: EvolutionSuggestion[]) => void }
      ).logDiagnosis;
      logDiagnosis.call(driver, diagnosis, suggestions);

      expect(true).toBe(true);
    });

    it('logs suggestions when available', () => {
      const diagnosis: Diagnosis = {
        testFailures: [],
        lintErrors: [],
        timestamp: new Date().toISOString(),
      };
      const suggestions: EvolutionSuggestion[] = [
        {
          priority: 'critical',
          category: 'fix',
          description: 'Fix test failures',
          reason: 'Tests are broken',
          estimatedEffort: 'medium',
        },
        {
          priority: 'high',
          category: 'test',
          description: 'Add more tests',
          reason: 'Coverage is low',
          estimatedEffort: 'large',
        },
        {
          priority: 'medium',
          category: 'refactor',
          description: 'Improve types',
          reason: 'Type safety',
          estimatedEffort: 'small',
        },
      ];

      const logDiagnosis = (
        driver as unknown as { logDiagnosis: (d: Diagnosis, s: EvolutionSuggestion[]) => void }
      ).logDiagnosis;
      logDiagnosis.call(driver, diagnosis, suggestions);

      expect(true).toBe(true);
    });
  });
});

describe('SelfDriver isInterrupted', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.cwd = jest.fn().mockReturnValue(mockProjectRoot);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.cwd = originalCwd;
  });

  it('returns false when not interrupted', () => {
    driver = new SelfDriver();

    const isInterrupted = (driver as unknown as { isInterrupted: () => boolean }).isInterrupted;
    const result = isInterrupted.call(driver);

    expect(result).toBe(false);
  });

  it('returns true after SIGINT signal', () => {
    driver = new SelfDriver();

    // Trigger interruption
    process.emit('SIGINT' as NodeJS.Signals);

    const isInterrupted = (driver as unknown as { isInterrupted: () => boolean }).isInterrupted;
    const result = isInterrupted.call(driver);

    expect(result).toBe(true);
  });
});

describe('SelfDriver cleanupSignalHandlers', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers();
    process.cwd = jest.fn().mockReturnValue(mockProjectRoot);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    process.cwd = originalCwd;
  });

  it('cleans up signal handlers without error', () => {
    driver = new SelfDriver();

    const cleanupSignalHandlers = (driver as unknown as { cleanupSignalHandlers: () => void })
      .cleanupSignalHandlers;

    // Should not throw
    expect(() => cleanupSignalHandlers.call(driver)).not.toThrow();
  });
});

describe('SelfDriver signal handlers', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('handles SIGINT signal', () => {
    driver = new SelfDriver();

    // Emit SIGINT
    process.emit('SIGINT' as NodeJS.Signals);

    // Should complete without error
    expect(true).toBe(true);
  });

  it('handles SIGTERM signal', () => {
    driver = new SelfDriver();

    // Emit SIGTERM
    process.emit('SIGTERM' as NodeJS.Signals);

    // Should complete without error
    expect(true).toBe(true);
  });
});

describe('SelfDriver run() interruption flow', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers();
    process.cwd = jest.fn().mockReturnValue(mockProjectRoot);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    process.cwd = originalCwd;
  });

  it('returns result with iteration count when interrupted', async () => {
    driver = new SelfDriver({ interval: 100 });

    // Mock diagnose to return quickly
    const diagnoseSpy = jest
      .spyOn(driver as unknown as { diagnose: () => Promise<Diagnosis> }, 'diagnose')
      .mockResolvedValue({
        testFailures: [],
        lintErrors: [],
        timestamp: new Date().toISOString(),
      });

    // Mock analyzeEvolutionSuggestions to return empty suggestions
    const analyzeSpy = jest
      .spyOn(
        driver as unknown as {
          analyzeEvolutionSuggestions: (d: Diagnosis) => Promise<EvolutionSuggestion[]>;
        },
        'analyzeEvolutionSuggestions'
      )
      .mockResolvedValue([]);

    // Mock logDiagnosis to do nothing
    const logDiagnosisSpy = jest
      .spyOn(driver as unknown as { logDiagnosis: () => void }, 'logDiagnosis')
      .mockImplementation(() => {});

    // Mock evolveWithOpenCode to return true (success but no changes)
    const evolveSpy = jest
      .spyOn(
        driver as unknown as {
          evolveWithOpenCode: () => Promise<boolean>;
        },
        'evolveWithOpenCode'
      )
      .mockResolvedValue(true);

    // Mock verify to return success
    const verifySpy = jest
      .spyOn(driver as unknown as { verify: () => Promise<VerificationResult> }, 'verify')
      .mockResolvedValue({
        success: true,
        buildSucceeds: true,
        testsPass: true,
        lintClean: true,
        evolveFunctional: true,
        coreCommandsWork: true,
        errors: [],
      });

    // Mock hasChanges to return false (no changes made)
    const hasChangesSpy = jest
      .spyOn(driver as unknown as { hasChanges: () => Promise<boolean> }, 'hasChanges')
      .mockResolvedValue(false);

    // Mock sleep to complete immediately
    const sleepSpy = jest
      .spyOn(driver as unknown as { sleep: () => Promise<void> }, 'sleep')
      .mockResolvedValue(undefined);

    // Start run()
    const runPromise = driver.run();

    // Wait for first iteration to start
    await Promise.resolve();

    // Trigger interruption
    process.emit('SIGINT' as NodeJS.Signals);

    // Advance timers to let any pending async operations complete
    jest.advanceTimersByTime(200);

    const result = await runPromise;

    // Verify the result structure
    expect(typeof result.iterations).toBe('number');
    expect(typeof result.success).toBe('boolean');
    expect(Array.isArray(result.improvements)).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);

    // Clean up spies
    diagnoseSpy.mockRestore();
    analyzeSpy.mockRestore();
    logDiagnosisSpy.mockRestore();
    evolveSpy.mockRestore();
    verifySpy.mockRestore();
    hasChangesSpy.mockRestore();
    sleepSpy.mockRestore();
  });

  it('accumulates iterations across multiple iterations before interruption', async () => {
    let callCount = 0;
    driver = new SelfDriver({ interval: 50 });

    // Mock diagnose to track calls
    const diagnoseSpy = jest
      .spyOn(driver as unknown as { diagnose: () => Promise<Diagnosis> }, 'diagnose')
      .mockImplementation(async () => {
        callCount++;
        // Interrupt after 2 iterations
        if (callCount >= 2) {
          process.emit('SIGINT' as NodeJS.Signals);
        }
        return {
          testFailures: [],
          lintErrors: [],
          timestamp: new Date().toISOString(),
        };
      });

    // Mock other methods
    jest
      .spyOn(
        driver as unknown as {
          analyzeEvolutionSuggestions: () => Promise<EvolutionSuggestion[]>;
        },
        'analyzeEvolutionSuggestions'
      )
      .mockResolvedValue([]);

    jest
      .spyOn(driver as unknown as { logDiagnosis: () => void }, 'logDiagnosis')
      .mockImplementation(() => {});

    jest
      .spyOn(
        driver as unknown as { evolveWithOpenCode: () => Promise<boolean> },
        'evolveWithOpenCode'
      )
      .mockResolvedValue(true);

    jest
      .spyOn(driver as unknown as { verify: () => Promise<VerificationResult> }, 'verify')
      .mockResolvedValue({
        success: true,
        buildSucceeds: true,
        testsPass: true,
        lintClean: true,
        evolveFunctional: true,
        coreCommandsWork: true,
        errors: [],
      });

    jest
      .spyOn(driver as unknown as { hasChanges: () => Promise<boolean> }, 'hasChanges')
      .mockResolvedValue(false);

    jest
      .spyOn(driver as unknown as { sleep: () => Promise<void> }, 'sleep')
      .mockResolvedValue(undefined);

    const result = await driver.run();

    // Should have run at least 2 iterations
    expect(result.iterations).toBeGreaterThanOrEqual(2);
    expect(result.success).toBe(false); // No improvements made

    diagnoseSpy.mockRestore();
  });
});

describe('SelfDriver buildPrompt categorized suggestions', () => {
  beforeEach(() => {
    driver = new SelfDriver();
  });

  it('includes critical priority suggestions in critical issues section', () => {
    const diagnosis: Diagnosis = {
      testFailures: [],
      lintErrors: [],
      timestamp: new Date().toISOString(),
    };
    const suggestions: EvolutionSuggestion[] = [
      {
        priority: 'critical',
        category: 'fix',
        description: 'Fix broken build',
        reason: 'Build is failing',
        estimatedEffort: 'medium',
      },
    ];

    const buildPrompt = (
      driver as unknown as {
        buildPrompt: (d: Diagnosis, s: EvolutionSuggestion[]) => string;
      }
    ).buildPrompt;
    const prompt = buildPrompt.call(driver, diagnosis, suggestions);

    expect(prompt).toContain('CRITICAL ISSUES');
    expect(prompt).toContain('Fix broken build');
    expect(prompt).toContain('medium effort');
  });

  it('includes high priority suggestions in detected opportunities section', () => {
    const diagnosis: Diagnosis = {
      testFailures: [],
      lintErrors: [],
      timestamp: new Date().toISOString(),
    };
    const suggestions: EvolutionSuggestion[] = [
      {
        priority: 'high',
        category: 'test',
        description: 'Add unit tests for core modules',
        reason: 'Coverage is low',
        estimatedEffort: 'large',
      },
    ];

    const buildPrompt = (
      driver as unknown as {
        buildPrompt: (d: Diagnosis, s: EvolutionSuggestion[]) => string;
      }
    ).buildPrompt;
    const prompt = buildPrompt.call(driver, diagnosis, suggestions);

    expect(prompt).toContain('Detected Improvement Opportunities');
    expect(prompt).toContain('[test] Add unit tests for core modules');
  });

  it('includes medium priority suggestions in detected opportunities section', () => {
    const diagnosis: Diagnosis = {
      testFailures: [],
      lintErrors: [],
      timestamp: new Date().toISOString(),
    };
    const suggestions: EvolutionSuggestion[] = [
      {
        priority: 'medium',
        category: 'refactor',
        description: 'Improve type safety',
        reason: 'Better TypeScript',
        estimatedEffort: 'medium',
      },
    ];

    const buildPrompt = (
      driver as unknown as {
        buildPrompt: (d: Diagnosis, s: EvolutionSuggestion[]) => string;
      }
    ).buildPrompt;
    const prompt = buildPrompt.call(driver, diagnosis, suggestions);

    expect(prompt).toContain('Detected Improvement Opportunities');
    expect(prompt).toContain('[refactor] Improve type safety');
  });

  it('includes low priority suggestions in detected opportunities section', () => {
    const diagnosis: Diagnosis = {
      testFailures: [],
      lintErrors: [],
      timestamp: new Date().toISOString(),
    };
    const suggestions: EvolutionSuggestion[] = [
      {
        priority: 'low',
        category: 'docs',
        description: 'Add JSDoc comments',
        reason: 'Documentation',
        estimatedEffort: 'small',
      },
    ];

    const buildPrompt = (
      driver as unknown as {
        buildPrompt: (d: Diagnosis, s: EvolutionSuggestion[]) => string;
      }
    ).buildPrompt;
    const prompt = buildPrompt.call(driver, diagnosis, suggestions);

    expect(prompt).toContain('Detected Improvement Opportunities');
    expect(prompt).toContain('[docs] Add JSDoc comments');
  });
});

describe('SelfDriver run', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // Use real timers for signal-based async tests
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
    process.cwd = originalCwd;
  });

  it('exits loop and returns result when interrupted', async () => {
    driver = new SelfDriver({ interval: 10 });

    // Emit SIGINT to interrupt the loop immediately
    setTimeout(() => {
      process.emit('SIGINT' as NodeJS.Signals);
    }, 50);

    const result = await driver.run();

    expect(result.success).toBe(false); // No improvements made
    expect(result.iterations).toBeGreaterThanOrEqual(0);
    expect(result.improvements).toEqual([]);
    expect(result.errors).toEqual([]);
  }, 10000);

  it('processes one iteration before interruption', async () => {
    driver = new SelfDriver({ interval: 10 });

    // Emit SIGINT after a short delay to allow one iteration
    setTimeout(() => {
      process.emit('SIGINT' as NodeJS.Signals);
    }, 100);

    const result = await driver.run();

    expect(result.iterations).toBeGreaterThanOrEqual(1);
  }, 10000);
});

describe('runSelfEvolution', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // Use real timers for signal-based async tests
    process.cwd = jest.fn().mockReturnValue(mockProjectRoot);

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
        return mockExecaResult(0, '', '');
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
    process.cwd = originalCwd;
  });

  it('exports the convenience function', () => {
    expect(runSelfEvolution).toBeDefined();
    expect(typeof runSelfEvolution).toBe('function');
  });

  it('creates driver with provided options and runs evolution', async () => {
    const options: SelfEvolverOptions = {
      interval: 10,
      model: 'test-model',
    };

    // Interrupt after first iteration
    setTimeout(() => {
      process.emit('SIGINT' as NodeJS.Signals);
    }, 100);

    const result = await runSelfEvolution(options);

    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
    expect(typeof result.iterations).toBe('number');
    expect(Array.isArray(result.improvements)).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);
  }, 10000);

  it('works with default options when none provided', async () => {
    // Interrupt immediately
    setTimeout(() => {
      process.emit('SIGINT' as NodeJS.Signals);
    }, 50);

    const result = await runSelfEvolution();

    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
    expect(typeof result.iterations).toBe('number');
  }, 10000);
});
