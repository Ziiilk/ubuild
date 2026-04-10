/**
 * Type definitions for the evolve command.
 *
 * Provides TypeScript interfaces for configuring and executing
 * self-evolution operations using OpenCode.
 *
 * @module types/evolve
 * @see {@link SelfEvolverOptions} for evolution configuration options
 */

/**
 * Commands to verify during self-evolution.
 * These commands are checked with `--help` to ensure they work correctly.
 * When adding new commands, add them here to include them in verification.
 */
export const EVOLUTION_VERIFY_COMMANDS = [
  'list',
  'engine',
  'build',
  'generate',
  'init',
  'run',
  'clean',
  'update',
  'version',
  'gencodebase',
  'evolve',
] as const;

/**
 * Options for configuring the self-evolution driver.
 *
 * @example
 * ```typescript
 * import type { SelfEvolverOptions } from '@zitool/ubuild/types';
 *
 * const options: SelfEvolverOptions = {
 *   once: true,
 *   dryRun: false,
 *   logger: (msg) => console.log(msg),
 *   verifyTimeoutMs: 120000,
 *   opencodeTimeoutMs: 900000,
 *   maxRetries: 3
 * };
 * ```
 */
export interface SelfEvolverOptions {
  /** Custom logger function for evolution output */
  logger?: (msg: string) => void;
  /** Run only one iteration and exit (default: false - run forever) */
  once?: boolean;
  /** Show what would be done without actually executing */
  dryRun?: boolean;
  /** Timeout for verification checks in milliseconds (default: 60000) */
  verifyTimeoutMs?: number;
  /** Timeout for OpenCode execution in milliseconds (default: 600000) */
  opencodeTimeoutMs?: number;
  /** Sleep duration between iterations in milliseconds (default: 5000) */
  sleepMs?: number;
  /** Use ts-node for verification instead of compiled dist (default: false) */
  useTsNode?: boolean;
  /** Maximum number of consecutive retry attempts on failure (default: 5, set to -1 for unlimited) */
  maxRetries?: number;
  /** Project root directory for evolution (default: process.cwd()) */
  projectRoot?: string;
  /** Keep untracked files when reverting changes (default: false - removes untracked files) */
  keepUntracked?: boolean;
  /** Path to the evolution log file relative to projectRoot (default: '.evolve-history.jsonl') */
  logFile?: string;
  /** Glob patterns for files that must not be modified during evolution (default: ['package.json', 'tsconfig.json', '.github/**']) */
  forbiddenPaths?: string[];
  /** Glob patterns for files that are allowed to be modified during evolution (default: ['src/**']). Files outside these patterns are rejected. Set to empty array to disable. */
  allowedPaths?: string[];
  /** Maximum number of changed lines (insertions + deletions) allowed per iteration (default: 200, 0 to disable) */
  maxDiffLines?: number;
  /** Coverage baseline thresholds. When set, verification will fail if coverage drops below these values. */
  coverageBaseline?: {
    branches: number;
    functions: number;
    lines: number;
    statements: number;
  };
}

/**
 * Result of a single evolution iteration, used to propagate context
 * between iterations so the AI can learn from previous failures.
 */
export interface IterationResult {
  /** The iteration number */
  iteration: number;
  /** Whether the iteration succeeded */
  success: boolean;
  /** The AI's decision for this iteration (FIX, TEST, REFACTOR, FEATURE, SKIP) */
  decision?: string;
  /** The stage at which the iteration failed, if applicable */
  failureStage?: 'execution' | 'verification' | 'commit';
  /** Truncated error detail from the failed stage */
  failureDetail?: string;
  /** List of files changed by the AI in this iteration */
  filesChanged?: string[];
}

/**
 * Supported decision classes for self-evolution planning and logging.
 * @deprecated Retained only for backward compatibility with existing .evolve-history.jsonl records.
 */
export type EvolutionDecision = 'FIX' | 'TEST' | 'REFACTOR' | 'FEATURE' | 'SKIP';

/** Snapshot of verification metrics captured around an evolution iteration. */
export interface CoverageSnapshot {
  /** Branch coverage percentage */
  branches: number;
  /** Function coverage percentage */
  functions: number;
  /** Line coverage percentage */
  lines: number;
  /** Statement coverage percentage */
  statements: number;
}

/** Lowest branch-coverage production files to prioritize in future iterations. */
export interface BranchCoverageHotspot {
  /** File path in the repository */
  file: string;
  /** Branch coverage percentage for the file */
  branches: number;
}

/** Verification metrics captured before or after an evolution iteration. */
export interface VerificationMetrics {
  /** Coverage snapshot from coverage-summary.json, if available */
  coverage?: CoverageSnapshot;
  /** ESLint warning count, if available */
  lintWarnings?: number;
  /** Lowest branch-coverage core files, if available */
  branchHotspots?: BranchCoverageHotspot[];
}

/** Delta between pre- and post-iteration verification metrics. */
export interface MetricDelta {
  /** Branch coverage delta in percentage points */
  branches?: number;
  /** Function coverage delta in percentage points */
  functions?: number;
  /** Line coverage delta in percentage points */
  lines?: number;
  /** Statement coverage delta in percentage points */
  statements?: number;
  /** ESLint warning count delta */
  lintWarnings?: number;
}

/**
 * Explicit planning recommendation derived from current metrics and failure history.
 * @deprecated No longer computed or written. Retained only for backward compatibility
 * with existing .evolve-history.jsonl records that may contain this field.
 */
export interface DecisionGuidance {
  /** Highest-scoring recommended decision for the next iteration */
  recommendedDecision: EvolutionDecision;
  /** Human-readable reasons for the recommendation */
  reasons: string[];
  /** Raw scorecard used to pick the recommendation */
  scores: Record<EvolutionDecision, number>;
}

/**
 * Structured log record for a single evolution iteration.
 * Written as JSONL (one JSON object per line) to the evolution log file.
 */
export interface EvolutionRecord {
  /** The iteration number */
  iteration: number;
  /** ISO timestamp of when the iteration started */
  timestamp: string;
  /** Whether the iteration succeeded */
  success: boolean;
  /** The stage at which the iteration failed, if applicable */
  failureStage?: 'execution' | 'verification' | 'commit';
  /** Truncated error detail from the failed stage */
  failureDetail?: string;
  /** Git commit hash if changes were committed */
  commitHash?: string;
  /** The AI decision inferred from the committed change */
  decision?: string;
  /** List of files changed during the iteration */
  filesChanged?: string[];
  /** Metrics captured before the iteration started */
  metricsBefore?: VerificationMetrics;
  /** Metrics captured after verification completed */
  metricsAfter?: VerificationMetrics;
  /** Delta between pre- and post-iteration metrics */
  metricDelta?: MetricDelta;
  /**
   * Explicit recommendation that was given to the AI before the iteration.
   * @deprecated No longer populated. Present only for backward compatibility
   * with older log records.
   */
  decisionGuidance?: DecisionGuidance;
  /** Duration of the iteration in milliseconds */
  durationMs: number;
}

/**
 * Aggregated summary of evolution history for reporting.
 */
export interface EvolutionReport {
  /** Total number of iterations recorded */
  totalIterations: number;
  /** Number of successful iterations */
  successCount: number;
  /** Number of failed iterations */
  failureCount: number;
  /** Overall success rate (0–1) */
  successRate: number;
  /** Breakdown of iterations by decision type */
  decisionDistribution: Record<string, { count: number; successes: number; failures: number }>;
  /** Breakdown of failures by stage */
  failureStages: Record<string, number>;
  /** Most common failure details (top 5) */
  topFailureReasons: Array<{ reason: string; count: number }>;
  /** Average metric deltas across successful iterations */
  averageMetricDelta: MetricDelta;
  /** Average iteration duration in milliseconds */
  averageDurationMs: number;
  /** Total wall-clock time spent in milliseconds */
  totalDurationMs: number;
  /** Statistics for the most recent N iterations (for trend comparison) */
  recentWindow: {
    /** How many iterations are in this window */
    size: number;
    successRate: number;
    decisionDistribution: Record<string, number>;
    averageMetricDelta: MetricDelta;
  };
}
