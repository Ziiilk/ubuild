/**
 * Tests for evolve types
 *
 * @module types/evolve.test
 */

import type {
  SelfEvolverOptions,
  IterationResult,
  EvolutionRecord,
  VerificationMetrics,
  MetricDelta,
  DecisionGuidance,
  EvolutionDecision,
} from './evolve';
import { EVOLUTION_VERIFY_COMMANDS } from './evolve';

describe('SelfEvolverOptions interface', () => {
  it('accepts valid options with all properties', () => {
    const mockLogger = jest.fn();
    const options: SelfEvolverOptions = {
      logger: mockLogger,
      once: true,
      dryRun: false,
      verifyTimeoutMs: 120000,
      opencodeTimeoutMs: 900000,
      sleepMs: 10000,
      useTsNode: true,
      maxRetries: 3,
      projectRoot: '/custom/project/path',
      keepUntracked: true,
      logFile: 'custom.jsonl',
      forbiddenPaths: ['package.json', 'tsconfig.json'],
      allowedPaths: ['src/**'],
      maxDiffLines: 200,
      coverageBaseline: {
        branches: 80,
        functions: 75,
        lines: 85,
        statements: 85,
      },
    };

    expect(options.logger).toBeDefined();
    expect(options.once).toBe(true);
    expect(options.dryRun).toBe(false);
    expect(options.verifyTimeoutMs).toBe(120000);
    expect(options.opencodeTimeoutMs).toBe(900000);
    expect(options.sleepMs).toBe(10000);
    expect(options.useTsNode).toBe(true);
    expect(options.maxRetries).toBe(3);
    expect(options.projectRoot).toBe('/custom/project/path');
    expect(options.keepUntracked).toBe(true);
    expect(options.logFile).toBe('custom.jsonl');
    expect(options.forbiddenPaths).toEqual(['package.json', 'tsconfig.json']);
    expect(options.allowedPaths).toEqual(['src/**']);
    expect(options.maxDiffLines).toBe(200);
    expect(options.coverageBaseline?.branches).toBe(80);
  });

  it('accepts empty options object', () => {
    const options: SelfEvolverOptions = {};
    expect(options).toBeDefined();
  });

  it('accepts partial options', () => {
    const optionsWithLogger: SelfEvolverOptions = {
      logger: jest.fn(),
    };
    expect(optionsWithLogger.logger).toBeDefined();

    const optionsWithOnce: SelfEvolverOptions = {
      once: true,
    };
    expect(optionsWithOnce.once).toBe(true);

    const optionsWithDryRun: SelfEvolverOptions = {
      dryRun: true,
    };
    expect(optionsWithDryRun.dryRun).toBe(true);

    const optionsWithVerifyTimeout: SelfEvolverOptions = {
      verifyTimeoutMs: 120000,
    };
    expect(optionsWithVerifyTimeout.verifyTimeoutMs).toBe(120000);

    const optionsWithOpencodeTimeout: SelfEvolverOptions = {
      opencodeTimeoutMs: 900000,
    };
    expect(optionsWithOpencodeTimeout.opencodeTimeoutMs).toBe(900000);

    const optionsWithSleepMs: SelfEvolverOptions = {
      sleepMs: 10000,
    };
    expect(optionsWithSleepMs.sleepMs).toBe(10000);

    const optionsWithUseTsNode: SelfEvolverOptions = {
      useTsNode: true,
    };
    expect(optionsWithUseTsNode.useTsNode).toBe(true);

    const optionsWithMaxRetries: SelfEvolverOptions = {
      maxRetries: 10,
    };
    expect(optionsWithMaxRetries.maxRetries).toBe(10);

    const optionsWithUnlimitedRetries: SelfEvolverOptions = {
      maxRetries: -1,
    };
    expect(optionsWithUnlimitedRetries.maxRetries).toBe(-1);

    const optionsWithProjectRoot: SelfEvolverOptions = {
      projectRoot: '/custom/project/path',
    };
    expect(optionsWithProjectRoot.projectRoot).toBe('/custom/project/path');

    const optionsWithKeepUntracked: SelfEvolverOptions = {
      keepUntracked: true,
    };
    expect(optionsWithKeepUntracked.keepUntracked).toBe(true);

    const optionsWithKeepUntrackedFalse: SelfEvolverOptions = {
      keepUntracked: false,
    };
    expect(optionsWithKeepUntrackedFalse.keepUntracked).toBe(false);
  });

  it('logger function can be called', () => {
    const mockLogger = jest.fn();
    const options: SelfEvolverOptions = {
      logger: mockLogger,
    };

    options.logger?.('test message');
    expect(mockLogger).toHaveBeenCalledWith('test message');
  });

  it('accepts forbiddenPaths option', () => {
    const options: SelfEvolverOptions = {
      forbiddenPaths: ['package.json', 'tsconfig.json', '.github/**'],
    };
    expect(options.forbiddenPaths).toEqual(['package.json', 'tsconfig.json', '.github/**']);
  });

  it('accepts empty forbiddenPaths array', () => {
    const options: SelfEvolverOptions = {
      forbiddenPaths: [],
    };
    expect(options.forbiddenPaths).toEqual([]);
  });

  it('accepts allowedPaths option', () => {
    const options: SelfEvolverOptions = {
      allowedPaths: ['src/**'],
    };
    expect(options.allowedPaths).toEqual(['src/**']);
  });

  it('accepts empty allowedPaths array to disable check', () => {
    const options: SelfEvolverOptions = {
      allowedPaths: [],
    };
    expect(options.allowedPaths).toEqual([]);
  });

  it('accepts maxDiffLines option', () => {
    const options: SelfEvolverOptions = {
      maxDiffLines: 200,
    };
    expect(options.maxDiffLines).toBe(200);
  });

  it('accepts maxDiffLines of 0 to disable', () => {
    const options: SelfEvolverOptions = {
      maxDiffLines: 0,
    };
    expect(options.maxDiffLines).toBe(0);
  });

  it('accepts coverageBaseline option', () => {
    const options: SelfEvolverOptions = {
      coverageBaseline: {
        branches: 80,
        functions: 75,
        lines: 85,
        statements: 85,
      },
    };
    expect(options.coverageBaseline).toBeDefined();
    expect(options.coverageBaseline?.branches).toBe(80);
    expect(options.coverageBaseline?.functions).toBe(75);
    expect(options.coverageBaseline?.lines).toBe(85);
    expect(options.coverageBaseline?.statements).toBe(85);
  });

  it('accepts coverageBaseline with zero thresholds', () => {
    const options: SelfEvolverOptions = {
      coverageBaseline: {
        branches: 0,
        functions: 0,
        lines: 0,
        statements: 0,
      },
    };
    expect(options.coverageBaseline?.branches).toBe(0);
  });

  it('accepts all new options together', () => {
    const options: SelfEvolverOptions = {
      forbiddenPaths: ['package.json'],
      allowedPaths: ['src/**'],
      maxDiffLines: 100,
      coverageBaseline: {
        branches: 40,
        functions: 50,
        lines: 60,
        statements: 60,
      },
    };
    expect(options.forbiddenPaths).toEqual(['package.json']);
    expect(options.allowedPaths).toEqual(['src/**']);
    expect(options.maxDiffLines).toBe(100);
    expect(options.coverageBaseline?.branches).toBe(40);
  });
});

describe('EVOLUTION_VERIFY_COMMANDS', () => {
  it('contains all expected CLI commands', () => {
    expect(EVOLUTION_VERIFY_COMMANDS).toContain('list');
    expect(EVOLUTION_VERIFY_COMMANDS).toContain('engine');
    expect(EVOLUTION_VERIFY_COMMANDS).toContain('build');
    expect(EVOLUTION_VERIFY_COMMANDS).toContain('generate');
    expect(EVOLUTION_VERIFY_COMMANDS).toContain('init');
    expect(EVOLUTION_VERIFY_COMMANDS).toContain('run');
    expect(EVOLUTION_VERIFY_COMMANDS).toContain('clean');
    expect(EVOLUTION_VERIFY_COMMANDS).toContain('update');
    expect(EVOLUTION_VERIFY_COMMANDS).toContain('version');
    expect(EVOLUTION_VERIFY_COMMANDS).toContain('gencodebase');
    expect(EVOLUTION_VERIFY_COMMANDS).toContain('evolve');
  });

  it('has correct number of commands', () => {
    expect(EVOLUTION_VERIFY_COMMANDS).toHaveLength(11);
  });

  it('is defined as a readonly tuple', () => {
    // Verify the constant exists and has the expected structure
    expect(Array.isArray(EVOLUTION_VERIFY_COMMANDS)).toBe(true);
    expect(EVOLUTION_VERIFY_COMMANDS.every((cmd) => typeof cmd === 'string')).toBe(true);
  });

  it('contains no duplicate commands', () => {
    const uniqueCommands = new Set(EVOLUTION_VERIFY_COMMANDS);
    expect(uniqueCommands.size).toBe(EVOLUTION_VERIFY_COMMANDS.length);
  });

  it('contains no empty or whitespace-only commands', () => {
    expect(EVOLUTION_VERIFY_COMMANDS.every((cmd) => cmd.trim().length > 0)).toBe(true);
  });

  it('includes evolve command for self-verification', () => {
    expect(EVOLUTION_VERIFY_COMMANDS).toContain('evolve');
  });
});

describe('IterationResult interface', () => {
  it('accepts a successful result', () => {
    const result: IterationResult = {
      iteration: 1,
      success: true,
    };
    expect(result.iteration).toBe(1);
    expect(result.success).toBe(true);
    expect(result.failureStage).toBeUndefined();
    expect(result.failureDetail).toBeUndefined();
  });

  it('accepts a failed result with execution stage', () => {
    const result: IterationResult = {
      iteration: 2,
      success: false,
      failureStage: 'execution',
      failureDetail: 'OpenCode timed out',
    };
    expect(result.success).toBe(false);
    expect(result.failureStage).toBe('execution');
    expect(result.failureDetail).toBe('OpenCode timed out');
  });

  it('accepts a failed result with verification stage', () => {
    const result: IterationResult = {
      iteration: 3,
      success: false,
      failureStage: 'verification',
      failureDetail: 'Lint failed',
    };
    expect(result.failureStage).toBe('verification');
  });

  it('accepts a failed result with commit stage', () => {
    const result: IterationResult = {
      iteration: 4,
      success: false,
      failureStage: 'commit',
      failureDetail: 'AI did not commit changes',
    };
    expect(result.failureStage).toBe('commit');
  });

  it('accepts a result without optional fields', () => {
    const result: IterationResult = {
      iteration: 5,
      success: true,
    };
    expect(result).toEqual({ iteration: 5, success: true });
  });

  it('accepts a result with decision field', () => {
    const result: IterationResult = {
      iteration: 6,
      success: true,
      decision: 'FIX',
    };
    expect(result.decision).toBe('FIX');
  });

  it('accepts a result with filesChanged field', () => {
    const result: IterationResult = {
      iteration: 7,
      success: true,
      decision: 'TEST',
      filesChanged: ['src/core/foo.ts', 'src/core/foo.test.ts'],
    };
    expect(result.filesChanged).toEqual(['src/core/foo.ts', 'src/core/foo.test.ts']);
  });
});

describe('DecisionGuidance types', () => {
  it('accepts supported evolution decisions', () => {
    const decision: EvolutionDecision = 'TEST';
    expect(decision).toBe('TEST');
  });

  it('accepts explicit recommendation with reasons and scores', () => {
    const guidance: DecisionGuidance = {
      recommendedDecision: 'FIX',
      reasons: ['Previous iteration failed at verification stage.'],
      scores: {
        FIX: 7,
        TEST: 3,
        REFACTOR: 1,
        FEATURE: 0,
        SKIP: 0,
      },
    };

    expect(guidance.recommendedDecision).toBe('FIX');
    expect(guidance.reasons).toHaveLength(1);
    expect(guidance.scores.TEST).toBe(3);
  });
});

describe('EvolutionRecord interface', () => {
  it('accepts a complete successful record', () => {
    const record: EvolutionRecord = {
      iteration: 1,
      timestamp: '2026-04-07T12:00:00.000Z',
      success: true,
      commitHash: 'abc123',
      decision: 'FIX',
      filesChanged: ['src/core/foo.ts'],
      durationMs: 5000,
    };
    expect(record.success).toBe(true);
    expect(record.commitHash).toBe('abc123');
    expect(record.decision).toBe('FIX');
    expect(record.filesChanged).toEqual(['src/core/foo.ts']);
    expect(record.durationMs).toBe(5000);
  });

  it('accepts a failed record with failure details', () => {
    const record: EvolutionRecord = {
      iteration: 2,
      timestamp: '2026-04-07T12:01:00.000Z',
      success: false,
      failureStage: 'verification',
      failureDetail: 'Build failed',
      durationMs: 3000,
    };
    expect(record.failureStage).toBe('verification');
  });

  it('accepts a minimal record without optional fields', () => {
    const record: EvolutionRecord = {
      iteration: 3,
      timestamp: '2026-04-07T12:02:00.000Z',
      success: true,
      durationMs: 1000,
    };
    expect(record.commitHash).toBeUndefined();
    expect(record.failureStage).toBeUndefined();
  });

  it('accepts metrics snapshots and deltas', () => {
    const before: VerificationMetrics = {
      coverage: { branches: 70, functions: 80, lines: 81, statements: 82 },
      lintWarnings: 4,
      branchHotspots: [{ file: 'src/core/foo.ts', branches: 55 }],
    };
    const delta: MetricDelta = {
      branches: 5,
      functions: 0,
      lines: 1,
      statements: 1,
      lintWarnings: -2,
    };
    const record: EvolutionRecord = {
      iteration: 4,
      timestamp: '2026-04-07T12:03:00.000Z',
      success: true,
      metricsBefore: before,
      metricsAfter: {
        coverage: { branches: 75, functions: 80, lines: 82, statements: 83 },
        lintWarnings: 2,
      },
      metricDelta: delta,
      decisionGuidance: {
        recommendedDecision: 'TEST',
        reasons: ['Lowest branch hotspot is src/core/foo.ts at 55%.'],
        scores: {
          FIX: 1,
          TEST: 6,
          REFACTOR: 0,
          FEATURE: 0,
          SKIP: 0,
        },
      },
      durationMs: 1500,
    };

    expect(record.metricsBefore?.coverage?.branches).toBe(70);
    expect(record.metricsBefore?.branchHotspots?.[0].file).toBe('src/core/foo.ts');
    expect(record.metricDelta?.branches).toBe(5);
    expect(record.metricDelta?.lintWarnings).toBe(-2);
    expect(record.decisionGuidance?.recommendedDecision).toBe('TEST');
  });
});
