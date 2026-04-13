/**
 * Self-driving evolution engine for ubuild.
 *
 * Automated codebase improvement system that continuously analyzes
 * and applies changes through OpenCode. Runs in an infinite loop
 * until interrupted by user.
 *
 * @module core/self-driver
 */
import { execa } from 'execa';
import { Logger, formatTimestamp } from '../utils/logger';
import { formatErrorWithPrefix } from '../utils/error';
import fs from 'fs-extra';
import path from 'path';
import { EVOLUTION_VERIFY_COMMANDS } from '../types/evolve';
import type {
  SelfEvolverOptions,
  IterationResult,
  EvolutionRecord,
  CoverageSnapshot,
  BranchCoverageHotspot,
  VerificationMetrics,
  MetricDelta,
  EvolutionReport,
  DecisionDiffLimits,
} from '../types/evolve';
import { readEvolutionReport, formatHistorySummary } from './evolution-reporter';
export type {
  SelfEvolverOptions,
  IterationResult,
  EvolutionRecord,
  CoverageSnapshot,
  BranchCoverageHotspot,
  VerificationMetrics,
  MetricDelta,
};
/** Shape of the "total" section in coverage-summary.json used by coverage-related methods. */
interface CoverageTotal {
  branches?: { pct?: number };
  functions?: { pct?: number };
  lines?: { pct?: number };
  statements?: { pct?: number };
}
/**
 * Validates and extracts the "total" section from a parsed coverage summary.
 * Performs runtime type checking on the nested structure to avoid unsafe `as` casts.
 * @param value - The raw `total` value from a parsed coverage-summary.json
 * @returns Validated CoverageTotal, or null if the value doesn't match the expected shape
 */
export function parseCoverageTotal(value: unknown): CoverageTotal | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const obj = value as Record<string, unknown>;
  const result: CoverageTotal = {};
  let hasField = false;
  for (const key of ['branches', 'functions', 'lines', 'statements'] as const) {
    const entry = obj[key];
    if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
      const pct = (entry as Record<string, unknown>).pct;
      if (typeof pct === 'number') {
        result[key] = { pct };
        hasField = true;
      }
    }
  }
  return hasField ? result : null;
}
/**
 * Normalizes a file path to use POSIX-style forward slashes.
 *
 * Consistently converts Windows backslash separators to forward slashes
 * so that path comparisons and pattern matching work cross-platform.
 *
 * @param filePath - The file path to normalize
 * @returns The normalized path with forward slashes
 */
export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}
/**
 * Parses git shortstat output and returns the total changed lines.
 *
 * Extracts insertion and deletion counts from git diff --shortstat output
 * like " 3 files changed, 10 insertions(+), 5 deletions(-)".
 *
 * @param output - The shortstat output string from git diff
 * @returns Total number of changed lines (insertions + deletions)
 */
export function parseDiffTotal(output: string): number {
  const trimmed = output.trim();
  if (!trimmed) return 0;
  const insertions = trimmed.match(/(\d+)\s+insertion/);
  const deletions = trimmed.match(/(\d+)\s+deletion/);
  return parseInt(insertions?.[1] ?? '0', 10) + parseInt(deletions?.[1] ?? '0', 10);
}
/**
 * Safely extracts a coverage metric percentage from a single file entry
 * in a parsed coverage summary. Returns null if the value doesn't contain
 * a valid numeric percentage for the requested metric key.
 */
function extractFileMetricPct(value: unknown, metricKey: 'branches' | 'lines'): number | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const metric = (value as Record<string, unknown>)[metricKey];
  if (typeof metric !== 'object' || metric === null || Array.isArray(metric)) {
    return null;
  }
  const pct = (metric as Record<string, unknown>).pct;
  return typeof pct === 'number' ? pct : null;
}
/** Shape of execa command results used internally for safe command execution. */
interface ExecaResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}
/** Shape of a single file entry in ESLint JSON output format. */
interface ESLintFileResult {
  warningCount?: number;
}
/** Validation result for committed changes between two revisions. */
interface CommittedChangeValidationResult {
  valid: boolean;
  violations: string[];
  total: number;
  withinLimit: boolean;
}
/** Validation result for whether a TEST decision cleared the minimum value bar. */
interface TestDecisionValidationResult {
  valid: boolean;
  reason?: string;
}
/** A single file's coverage metric entry used by coverage collection helpers. */
interface FileCoverageEntry {
  file: string;
  pct: number;
}
/** Default sleep duration between iterations in milliseconds */
const DEFAULT_SLEEP_MS = 5000;
/** Default timeout for verification checks in milliseconds */
const VERIFY_TIMEOUT_MS = 60000;
/** Default timeout for OpenCode execution in milliseconds */
const OPENCODE_TIMEOUT_MS = 600000;
/** Default maximum retry attempts on consecutive failures (-1 for unlimited) */
const DEFAULT_MAX_RETRIES = 5;
/** Maximum length for OpenCode stderr preview in log output */
const OPENCODE_STDERR_PREVIEW_LIMIT = 5000;
/** Maximum length for verification error output preview in log output */
const VERIFY_ERROR_PREVIEW_LIMIT = 2000;
/** Minimum max listeners for process events (increased to handle concurrent test runs) */
const MIN_MAX_LISTENERS = 50;
/** Default forbidden file patterns that must not be modified during evolution */
const DEFAULT_FORBIDDEN_PATHS = ['package.json', 'tsconfig.json', '.github/**'];
/** Default allowed file patterns - files outside these paths are rejected during evolution */
const DEFAULT_ALLOWED_PATHS = ['src/**'];
/** Default maximum number of changed lines per iteration (insertions + deletions) */
const DEFAULT_MAX_DIFF_LINES = 200;
/** Default per-decision diff line limits */
const DEFAULT_DIFF_LIMITS: DecisionDiffLimits = {
  test: 400,
  refactor: 200,
  fix: 100,
  feature: 150,
  unknown: 200,
};
/** Error detail when verification passes but AI fails to commit changes. */
const COMMIT_MISSED_DETAIL = 'Verification passed but AI did not commit changes properly';
/** Error detail when verification passes but AI leaves extra uncommitted changes. */
const PARTIAL_COMMIT_DETAIL =
  'Verification passed but AI left uncommitted changes after partial commit';
export class SelfDriver {
  private log: (msg: string) => void;
  private projectRoot: string;
  private interrupted = false;
  private once: boolean;
  private dryRun: boolean;
  private verifyTimeoutMs: number;
  private opencodeTimeoutMs: number;
  private sleepMs: number;
  private useTsNode: boolean;
  private maxRetries: number;
  private consecutiveFailures = 0;
  private iterationCount = 0;
  private sigintHandler: (() => void) | null = null;
  private sigtermHandler: (() => void) | null = null;
  private originalMaxListeners: number | null = null;
  private sleepTimer: NodeJS.Timeout | null = null;
  private sleepResolve: (() => void) | null = null;
  private cleanedUp = false;
  private sleepCancelled = false;
  private increasedMaxListeners = false;
  private keepUntracked: boolean;
  private lastIterationResult: IterationResult | null = null;
  private logFile: string;
  private iterationStartTime = 0;
  private forbiddenPaths: string[];
  private allowedPaths: string[];
  private maxDiffLines: number;
  private diffLimits: DecisionDiffLimits;
  private coverageBaseline: {
    branches: number;
    functions: number;
    lines: number;
    statements: number;
  } | null;
  /**
   * Validates that a numeric option is a positive number.
   * @param value - The value to validate
   * @param name - The option name for error messages
   * @throws Error if the value is not positive
   */
  private static validatePositive(value: number, name: string): void {
    if (value <= 0) {
      throw new Error(`Invalid ${name}: ${value}. Must be a positive number.`);
    }
  }
  /**
   * Creates a new SelfDriver instance.
   * @param options - Configuration options for the evolution process
   */
  constructor(options: SelfEvolverOptions = {}) {
    this.log = options.logger || ((msg: string) => Logger.info(`[${formatTimestamp()}] ${msg}`));
    this.projectRoot = options.projectRoot ?? process.cwd();
    this.once = options.once || false;
    this.dryRun = options.dryRun || false;
    this.verifyTimeoutMs = options.verifyTimeoutMs ?? VERIFY_TIMEOUT_MS;
    this.opencodeTimeoutMs = options.opencodeTimeoutMs ?? OPENCODE_TIMEOUT_MS;
    this.sleepMs = options.sleepMs ?? DEFAULT_SLEEP_MS;
    this.useTsNode = options.useTsNode || false;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.keepUntracked = options.keepUntracked || false;
    this.logFile = options.logFile ?? '.evolve-history.jsonl';
    this.forbiddenPaths = options.forbiddenPaths ?? DEFAULT_FORBIDDEN_PATHS;
    this.allowedPaths = options.allowedPaths ?? DEFAULT_ALLOWED_PATHS;
    this.maxDiffLines = options.maxDiffLines ?? DEFAULT_MAX_DIFF_LINES;
    // When maxDiffLines is explicitly set without diffLimits, use it as the base for all limits.
    // When diffLimits is provided, it takes precedence with DEFAULT_DIFF_LIMITS as fallback.
    if (options.diffLimits) {
      this.diffLimits = { ...DEFAULT_DIFF_LIMITS, ...options.diffLimits };
    } else {
      const base = this.maxDiffLines;
      this.diffLimits = {
        test: Math.round(base * 2),
        refactor: base,
        fix: Math.round(base * 0.5),
        feature: Math.round(base * 0.75),
        unknown: base,
      };
    }
    this.coverageBaseline = options.coverageBaseline ?? null;
    // Validate options
    SelfDriver.validatePositive(this.sleepMs, 'sleepMs');
    if (this.maxRetries < -1) {
      throw new Error(`Invalid maxRetries: ${this.maxRetries}. Must be >= -1 (-1 for unlimited).`);
    }
    SelfDriver.validatePositive(this.verifyTimeoutMs, 'verifyTimeoutMs');
    SelfDriver.validatePositive(this.opencodeTimeoutMs, 'opencodeTimeoutMs');
    this.setupSignalHandlers();
  }
  /**
   * Truncates output to the specified maximum length for log display.
   * @param output - The string to potentially truncate
   * @param maxLength - Maximum character length before truncation
   * @returns The original string or truncated version with ellipsis
   */
  private truncateOutput(output: string, maxLength: number): string {
    return output.length > maxLength ? output.slice(0, maxLength) + '...(truncated)' : output;
  }
  /**
   * Writes a structured evolution record to the JSONL log file.
   * Failures are logged as warnings but do not interrupt the evolution process.
   */
  private async writeEvolutionRecord(record: EvolutionRecord): Promise<void> {
    if (this.dryRun) return;
    try {
      const logPath = path.join(this.projectRoot, this.logFile);
      await fs.appendFile(logPath, JSON.stringify(record) + '\n', 'utf-8');
    } catch (error) {
      this.log(`⚠️  ${formatErrorWithPrefix('Could not write evolution log', error)}`);
    }
  }
  /**
   * Checks whether a repository file should be treated as a core production file.
   * Excludes tests, test utilities, and pure type barrels from hotspot prioritization.
   */
  private isCoreSourceFile(filePath: string): boolean {
    const normalized = normalizePath(filePath);
    return (
      normalized.startsWith('src/') &&
      !normalized.endsWith('.test.ts') &&
      !normalized.endsWith('.spec.ts') &&
      !normalized.startsWith('src/test-utils/') &&
      !normalized.startsWith('src/types/')
    );
  }
  /**
   * Collects file-level coverage metrics from a parsed coverage summary.
   * Returns entries for core source files with the given metric below 100%,
   * sorted ascending by percentage (lowest coverage first).
   */
  private collectFileCoverageEntries(
    summary: Record<string, unknown>,
    metricKey: 'branches' | 'lines'
  ): FileCoverageEntry[] {
    const entries: FileCoverageEntry[] = [];
    for (const [key, value] of Object.entries(summary)) {
      if (key === 'total' || !this.isCoreSourceFile(key)) {
        continue;
      }
      const pct = extractFileMetricPct(value, metricKey);
      if (pct !== null && pct < 100) {
        entries.push({ file: key, pct });
      }
    }
    entries.sort((a, b) => a.pct - b.pct);
    return entries;
  }
  /**
   * Collects path policy violations for a set of changed files.
   * The evolution log file is always excluded from validation since it is
   * managed by the SelfDriver itself and not by the AI agent.
   */
  private collectPathViolations(changedFiles: string[]): string[] {
    const violations: string[] = [];
    for (const file of changedFiles) {
      if (file === this.logFile) continue;
      let isForbidden = false;
      for (const pattern of this.forbiddenPaths) {
        if (this.matchesGlobPattern(file, pattern)) {
          violations.push(file);
          isForbidden = true;
          break;
        }
      }
      if (!isForbidden && this.allowedPaths.length > 0) {
        const isAllowed = this.allowedPaths.some((pattern) =>
          this.matchesGlobPattern(file, pattern)
        );
        if (!isAllowed) {
          violations.push(file);
        }
      }
    }
    return violations;
  }
  /**
   * Extracts total coverage values from a parsed coverage summary.
   */
  private extractCoverageSnapshot(summary: Record<string, unknown>): CoverageSnapshot | null {
    const total = parseCoverageTotal(summary.total);
    if (!total) {
      return null;
    }
    return {
      branches: total.branches?.pct ?? 0,
      functions: total.functions?.pct ?? 0,
      lines: total.lines?.pct ?? 0,
      statements: total.statements?.pct ?? 0,
    };
  }
  /**
   * Collects the lowest branch-coverage core files from a parsed coverage summary.
   */
  private collectBranchCoverageHotspots(
    summary: Record<string, unknown>,
    maxFiles = 3
  ): BranchCoverageHotspot[] {
    return this.collectFileCoverageEntries(summary, 'branches')
      .slice(0, maxFiles)
      .map((entry) => ({ file: entry.file, branches: entry.pct }));
  }
  /**
   * Formats the branch-coverage hotspots section for the evolution prompt.
   */
  private formatBranchCoverageHotspots(
    summary: Record<string, unknown>,
    maxFiles = 3
  ): string | null {
    const hotspots = this.collectBranchCoverageHotspots(summary, maxFiles);
    if (hotspots.length === 0) {
      return null;
    }
    return `- Branch Coverage Hotspots:\n${hotspots
      .map((hotspot) => `  - ${hotspot.file} (${hotspot.branches}% branches)`)
      .join('\n')}`;
  }
  /**
   * Parses ESLint JSON output and returns the total warning count.
   */
  private countLintWarnings(payload: string): number | null {
    const parsed: unknown = JSON.parse(payload);
    if (!Array.isArray(parsed)) {
      return null;
    }
    let totalWarnings = 0;
    for (const item of parsed) {
      if (typeof item === 'object' && item !== null) {
        totalWarnings += (item as ESLintFileResult).warningCount ?? 0;
      }
    }
    return totalWarnings;
  }
  /**
   * Reads the current ESLint warning count in JSON form for logging and metric deltas.
   */
  private async readLintWarningCount(): Promise<number | null> {
    try {
      const result = await this.safeExeca('npx', ['eslint', 'src', '--ext', '.ts', '-f', 'json'], {
        timeout: this.verifyTimeoutMs,
      });
      if (!result) return null;
      return this.countLintWarnings(result.stdout);
    } catch (error) {
      this.log(`⚠️  ${formatErrorWithPrefix('Could not gather lint warnings', error)}`);
      return null;
    }
  }
  /**
   * Captures verification metrics for evolution logging and metric delta computation.
   */
  private async captureVerificationMetrics(): Promise<VerificationMetrics | null> {
    const [summary, lintWarnings] = await Promise.all([
      this.readCoverageSummary(),
      this.readLintWarningCount(),
    ]);
    const coverage = summary ? this.extractCoverageSnapshot(summary) : null;
    const branchHotspots = summary ? this.collectBranchCoverageHotspots(summary) : [];
    if (!coverage && lintWarnings === null && branchHotspots.length === 0) {
      return null;
    }
    return {
      coverage: coverage ?? undefined,
      lintWarnings: lintWarnings ?? undefined,
      branchHotspots: branchHotspots.length > 0 ? branchHotspots : undefined,
    };
  }
  /**
   * Computes metric deltas between the pre- and post-iteration snapshots.
   */
  private calculateMetricDelta(
    before: VerificationMetrics | null,
    after: VerificationMetrics | null
  ): MetricDelta | undefined {
    const delta: MetricDelta = {};
    if (before?.coverage && after?.coverage) {
      delta.branches = after.coverage.branches - before.coverage.branches;
      delta.functions = after.coverage.functions - before.coverage.functions;
      delta.lines = after.coverage.lines - before.coverage.lines;
      delta.statements = after.coverage.statements - before.coverage.statements;
    }
    if (typeof before?.lintWarnings === 'number' && typeof after?.lintWarnings === 'number') {
      delta.lintWarnings = after.lintWarnings - before.lintWarnings;
    }
    return Object.keys(delta).length > 0 ? delta : undefined;
  }
  /**
   * Checks whether a file is a Jest test file.
   */
  private isTestFile(filePath: string): boolean {
    const normalized = normalizePath(filePath);
    return normalized.endsWith('.test.ts') || normalized.endsWith('.spec.ts');
  }
  /**
   * Normalizes a file path to a module identity so source and colocated test files can be matched.
   */
  private toModuleIdentity(filePath: string): string {
    return normalizePath(filePath)
      .replace(/\.(test|spec)(?=\.ts$)/, '')
      .replace(/\.ts$/, '');
  }
  /**
   * Determines whether two files belong to the same source/test module area.
   */
  private areRelatedModuleFiles(left: string, right: string): boolean {
    return this.toModuleIdentity(left) === this.toModuleIdentity(right);
  }
  /**
   * Enforces a minimum-value bar for committed TEST decisions.
   * TEST commits must either target an existing hotspot, cover a prior failure path,
   * or measurably improve coverage.
   */
  private validateTestDecision(
    decision: string | undefined,
    filesChanged: string[] | undefined,
    metricsBefore: VerificationMetrics | null,
    metricsAfter: VerificationMetrics | null,
    lastResult?: IterationResult | null
  ): TestDecisionValidationResult {
    if (decision !== 'TEST') {
      return { valid: true };
    }
    const changedFiles = filesChanged ?? [];
    const changedTestFiles = changedFiles.filter((file) => this.isTestFile(file));
    if (changedTestFiles.length === 0) {
      return {
        valid: false,
        reason: 'TEST decision did not modify any test files',
      };
    }
    const targetsHotspot =
      metricsBefore?.branchHotspots?.some((hotspot) =>
        changedFiles.some((file) => this.areRelatedModuleFiles(file, hotspot.file))
      ) ?? false;
    const targetsFailurePath =
      (!!lastResult &&
        !lastResult.success &&
        !!lastResult.filesChanged?.some((previousFile) =>
          changedFiles.some((file) => this.areRelatedModuleFiles(file, previousFile))
        )) ??
      false;
    const coverageImproved =
      !!metricsBefore?.coverage &&
      !!metricsAfter?.coverage &&
      (metricsAfter.coverage.branches > metricsBefore.coverage.branches ||
        metricsAfter.coverage.functions > metricsBefore.coverage.functions ||
        metricsAfter.coverage.lines > metricsBefore.coverage.lines ||
        metricsAfter.coverage.statements > metricsBefore.coverage.statements);
    if (targetsHotspot || targetsFailurePath || coverageImproved) {
      return { valid: true };
    }
    return {
      valid: false,
      reason:
        'TEST decision did not target a hotspot, did not cover a prior failure path, and did not improve coverage',
    };
  }
  /**
   * Checks if a file path matches a glob pattern.
   * Supports exact match and directory prefix (ending with /**).
   */
  private matchesGlobPattern(filePath: string, pattern: string): boolean {
    const normalized = normalizePath(filePath);
    const normalizedPattern = normalizePath(pattern);
    // Exact match
    if (normalized === normalizedPattern) return true;
    // Directory glob: "dir/**" matches any file under that directory
    if (normalizedPattern.endsWith('/**')) {
      const prefix = normalizedPattern.slice(0, -3);
      if (normalized === prefix || normalized.startsWith(prefix + '/')) return true;
    }
    return false;
  }
  /**
   * Validates that changed files do not violate forbidden path patterns
   * and are within the allowed paths whitelist.
   * @returns Object with validation result and any violating files
   */
  private async validateChangedFiles(): Promise<{ valid: boolean; violations: string[] }> {
    if (this.forbiddenPaths.length === 0 && this.allowedPaths.length === 0) {
      return { valid: true, violations: [] };
    }
    // Use HEAD to include both staged and unstaged changes
    const result = await this.safeExeca('git', ['diff', '--name-only', 'HEAD']);
    if (!result) {
      this.log('⚠️  Could not determine changed files, skipping file validation');
      return { valid: true, violations: [] };
    }
    const changedFiles = result.stdout
      .split('\n')
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
    if (changedFiles.length === 0) {
      return { valid: true, violations: [] };
    }
    const violations = this.collectPathViolations(changedFiles);
    return { valid: violations.length === 0, violations };
  }
  /**
   * Checks if the total number of changed lines exceeds the maximum allowed limit.
   * Uses the maximum across all decision types as a pre-commit safety cap,
   * since the actual decision type is not yet known at this stage.
   * @returns Object with total changed lines and whether it's within the limit
   */
  private async checkDiffSize(): Promise<{ total: number; withinLimit: boolean }> {
    const maxLimit = this.getMaxDiffLimit();
    if (maxLimit <= 0) {
      return { total: 0, withinLimit: true };
    }
    // Use HEAD to include both staged and unstaged changes
    const result = await this.safeExeca('git', ['diff', '--shortstat', 'HEAD']);
    if (!result) {
      this.log('⚠️  Could not determine diff size, skipping size check');
      return { total: 0, withinLimit: true };
    }
    const output = result.stdout.trim();
    if (output.length === 0) {
      return { total: 0, withinLimit: true };
    }
    const total = parseDiffTotal(output);
    return { total, withinLimit: total <= maxLimit };
  }
  /**
   * Reads and parses the coverage-summary.json file from the last test run.
   * @returns The parsed coverage summary object, or null if unavailable
   */
  private async readCoverageSummary(): Promise<Record<string, unknown> | null> {
    try {
      const summaryPath = path.join(this.projectRoot, 'coverage', 'coverage-summary.json');
      if (!(await fs.pathExists(summaryPath))) {
        return null;
      }
      const raw = await fs.readFile(summaryPath, 'utf-8');
      return JSON.parse(raw) as Record<string, unknown>;
    } catch (error) {
      this.log(`⚠️  ${formatErrorWithPrefix('Could not read coverage summary', error)}`);
      return null;
    }
  }
  /**
   * Formats total coverage metrics from a parsed coverage summary.
   * @param summary - The parsed coverage-summary.json object
   * @returns A formatted string of coverage metrics, or null if unavailable
   */
  private formatCoverageMetrics(summary: Record<string, unknown>): string | null {
    const total = parseCoverageTotal(summary?.total);
    if (!total) return null;
    const b = total.branches?.pct ?? '?';
    const f = total.functions?.pct ?? '?';
    const l = total.lines?.pct ?? '?';
    const s = total.statements?.pct ?? '?';
    return `- Test Coverage: branches ${b}%, functions ${f}%, lines ${l}%, statements ${s}%`;
  }
  /**
   * Finds and formats the files with the lowest line coverage from a parsed summary.
   * @param summary - The parsed coverage-summary.json object
   * @param maxFiles - Maximum number of low-coverage files to return
   * @returns A formatted string listing low-coverage files, or null if unavailable
   */
  private formatLowestCoverageFiles(summary: Record<string, unknown>, maxFiles = 5): string | null {
    const fileEntries = this.collectFileCoverageEntries(summary, 'lines').slice(0, maxFiles);
    if (fileEntries.length === 0) return null;
    return `- Lowest Coverage Files:\n${fileEntries.map((f) => `  - ${f.file} (${f.pct}%)`).join('\n')}`;
  }
  /**
   * Gathers ESLint warning count from the project.
   * Runs eslint in JSON format and counts warnings.
   * @returns A formatted string of lint warnings, or null if unavailable
   */
  private async gatherLintWarnings(): Promise<string | null> {
    const totalWarnings = await this.readLintWarningCount();
    return totalWarnings === null ? null : `- ESLint Warnings: ${totalWarnings}`;
  }
  /**
   * Gathers code health metrics (coverage + lint warnings) for the evolution prompt.
   * Returns a formatted section string, or empty string if no metrics are available.
   */
  private async gatherCodeHealthMetrics(): Promise<string> {
    const [summary, lint] = await Promise.all([
      this.readCoverageSummary(),
      this.gatherLintWarnings(),
    ]);
    const coverage = summary ? this.formatCoverageMetrics(summary) : null;
    const branchHotspots = summary ? this.formatBranchCoverageHotspots(summary) : null;
    const lowestFiles = summary ? this.formatLowestCoverageFiles(summary) : null;
    const lines: string[] = [];
    if (coverage) lines.push(coverage);
    if (branchHotspots) lines.push(branchHotspots);
    if (lowestFiles) lines.push(lowestFiles);
    if (lint) lines.push(lint);
    if (lines.length === 0) return '';
    return `\n## Code Health Metrics\n${lines.join('\n')}`;
  }
  /**
   * Checks if code coverage meets the configured baseline thresholds.
   * Reads coverage-summary.json and compares each metric against the baseline.
   * @returns Object with pass/fail status and details of any regressions
   */
  private async checkCoverageBaseline(): Promise<{ passed: boolean; details: string }> {
    if (!this.coverageBaseline) {
      return { passed: true, details: 'coverage gate disabled' };
    }
    const summary = await this.readCoverageSummary();
    if (!summary) {
      return { passed: false, details: 'coverage-summary.json not found' };
    }
    const total = parseCoverageTotal(summary.total);
    if (!total) {
      return { passed: false, details: 'coverage-summary.json missing total section' };
    }
    const failures: string[] = [];
    const metrics: Array<{ key: string; actual: number; expected: number }> = [
      {
        key: 'branches',
        actual: total.branches?.pct ?? 0,
        expected: this.coverageBaseline.branches,
      },
      {
        key: 'functions',
        actual: total.functions?.pct ?? 0,
        expected: this.coverageBaseline.functions,
      },
      { key: 'lines', actual: total.lines?.pct ?? 0, expected: this.coverageBaseline.lines },
      {
        key: 'statements',
        actual: total.statements?.pct ?? 0,
        expected: this.coverageBaseline.statements,
      },
    ];
    for (const { key, actual, expected } of metrics) {
      if (actual < expected) {
        failures.push(`${key}: ${actual}% < ${expected}%`);
      }
    }
    if (failures.length > 0) {
      return { passed: false, details: failures.join(', ') };
    }
    return { passed: true, details: 'all coverage thresholds met' };
  }
  /**
   * Resolves the diff line limit for a given decision type.
   * Returns the decision-specific limit, or the unknown limit if decision is not recognized.
   */
  getDiffLimitForDecision(decision?: string): number {
    if (!decision) return this.diffLimits.unknown;
    const key = decision.toLowerCase();
    if (key === 'test') return this.diffLimits.test;
    if (key === 'refactor') return this.diffLimits.refactor;
    if (key === 'fix') return this.diffLimits.fix;
    if (key === 'feature') return this.diffLimits.feature;
    return this.diffLimits.unknown;
  }
  /**
   * Returns the maximum diff limit across all decision types.
   * Used for pre-commit safety checks when the decision is not yet known.
   */
  private getMaxDiffLimit(): number {
    return Math.max(
      this.diffLimits.test,
      this.diffLimits.refactor,
      this.diffLimits.fix,
      this.diffLimits.feature,
      this.diffLimits.unknown
    );
  }
  /**
   * Validates the committed diff between two revisions against path and size policies.
   * @param beforeHash - Commit hash before the iteration
   * @param afterHash - Commit hash after the iteration
   * @param decision - The detected decision type, used to resolve the appropriate diff limit
   */
  private async validateCommittedChanges(
    beforeHash: string,
    afterHash: string,
    decision?: string
  ): Promise<CommittedChangeValidationResult> {
    const changedFiles = (await this.getChangedFilesList(beforeHash, afterHash)) ?? [];
    const violations = this.collectPathViolations(changedFiles);
    let total = 0;
    let withinLimit = true;
    const limit = this.getDiffLimitForDecision(decision);
    if (limit > 0) {
      const diffResult = await this.safeExeca('git', [
        'diff',
        '--shortstat',
        beforeHash,
        afterHash,
      ]);
      if (!diffResult) {
        this.log(
          '⚠️  Could not determine committed diff size, skipping post-commit size validation'
        );
      } else {
        total = parseDiffTotal(diffResult.stdout);
        withinLimit = total <= limit;
      }
    }
    return {
      valid: violations.length === 0 && withinLimit,
      violations,
      total,
      withinLimit,
    };
  }
  /**
   * Reverts a committed iteration back to the known-safe commit hash.
   */
  private async revertCommittedIteration(beforeHash: string): Promise<boolean> {
    const resetResult = await this.safeExeca('git', ['reset', '--hard', beforeHash]);
    if (!resetResult || resetResult.exitCode !== 0) {
      this.log('⚠️  Git hard reset failed');
      return false;
    }
    if (!this.keepUntracked) {
      const cleanResult = await this.safeExeca('git', ['clean', '-fd']);
      if (!cleanResult || cleanResult.exitCode !== 0) {
        this.log('⚠️  Git clean failed');
        return false;
      }
    } else {
      this.log('ℹ️  Preserving untracked files (--keep-untracked)');
    }
    this.log(`🔄 Reverted committed iteration to ${beforeHash}`);
    return true;
  }
  /**
   * Safely executes a command with execa, catching errors and returning null on failure.
   * Logs errors with context for debugging.
   */
  private async safeExeca(
    command: string,
    args: string[],
    options?: { cwd?: string; reject?: boolean; timeout?: number }
  ): Promise<ExecaResult | null> {
    try {
      const result = await execa(command, args, {
        cwd: this.projectRoot,
        reject: false,
        ...options,
      });
      return result;
    } catch (error) {
      this.log(`⚠️  ${formatErrorWithPrefix(`${command} failed`, error)}`);
      return null;
    }
  }
  /**
   * Sets up signal handlers for graceful interruption (Ctrl+C, SIGTERM).
   */
  private setupSignalHandlers(): void {
    // If handlers already exist, don't re-register
    if (this.sigintHandler && this.sigtermHandler) {
      return;
    }
    this.sigintHandler = (): void => {
      this.interrupted = true;
      this.log('\n\n⚠️  Interrupted by user (Ctrl+C)');
      this.interruptSleep();
    };
    this.sigtermHandler = (): void => {
      this.interrupted = true;
      this.log('\n\n⚠️  Interrupted by SIGTERM');
      this.interruptSleep();
    };
    // Increase max listeners once to prevent memory leak warnings with multiple handlers
    // Track whether THIS instance increased it so we only restore if we did
    const currentMax = process.getMaxListeners();
    if (currentMax < MIN_MAX_LISTENERS) {
      this.originalMaxListeners = currentMax;
      this.increasedMaxListeners = true;
      process.setMaxListeners(MIN_MAX_LISTENERS);
    }
    process.on('SIGINT', this.sigintHandler);
    process.on('SIGTERM', this.sigtermHandler);
  }
  /**
   * Immediately resolves any pending sleep promise and clears the timer.
   * Used by signal handlers to provide responsive Ctrl+C behavior.
   */
  private interruptSleep(): void {
    if (this.sleepTimer) {
      clearTimeout(this.sleepTimer);
      this.sleepTimer = null;
    }
    if (this.sleepResolve) {
      this.sleepResolve();
      this.sleepResolve = null;
    }
  }
  /**
   * Cleans up signal handlers to prevent memory leaks.
   * Should be called when the driver is no longer needed.
   */
  cleanup(): void {
    if (this.cleanedUp) return; // Prevent double-cleanup
    this.cleanedUp = true;
    this.interrupted = true;
    this.sleepCancelled = true;
    this.log('🧹 Cleaning up signal handlers and timers...');
    if (this.sigintHandler) {
      process.removeListener('SIGINT', this.sigintHandler);
      this.sigintHandler = null;
    }
    if (this.sigtermHandler) {
      process.removeListener('SIGTERM', this.sigtermHandler);
      this.sigtermHandler = null;
    }
    // Restore original max listeners only if THIS instance increased it
    // This prevents multiple instances from corrupting each other's state
    if (this.increasedMaxListeners && this.originalMaxListeners !== null) {
      process.setMaxListeners(this.originalMaxListeners);
      this.originalMaxListeners = null;
      this.increasedMaxListeners = false;
    }
    // Interrupt any pending sleep for responsive cleanup
    this.interruptSleep();
    this.log('✅ Cleanup completed');
  }
  /**
   * Checks if current directory is a git repository.
   */
  private async isGitRepository(): Promise<boolean> {
    const result = await this.safeExeca('git', ['rev-parse', '--git-dir']);
    return result?.exitCode === 0;
  }
  /**
   * Checks if OpenCode CLI is installed and available in PATH.
   */
  private async isOpenCodeInstalled(): Promise<boolean> {
    const result = await this.safeExeca('opencode', ['--version']);
    return result?.exitCode === 0;
  }
  /**
   * Runs pre-flight checks before starting evolution.
   * @returns true if all checks pass, false otherwise
   */
  private async runPreFlightChecks(): Promise<boolean> {
    const isGitRepo = await this.isGitRepository();
    if (!isGitRepo) {
      this.log('❌ Error: Not a git repository');
      this.log('   Self-evolution requires a git repository to track and revert changes.');
      this.log(`   Current directory: ${this.projectRoot}`);
      return false;
    }
    const isClean = await this.isWorkingTreeClean();
    if (!isClean) {
      this.log('❌ Error: Working tree has uncommitted changes');
      this.log('   Self-evolution may revert changes using `git checkout .`');
      this.log('   Commit or stash your changes before running evolve.');
      return false;
    }
    const isOpenCodeInstalled = await this.isOpenCodeInstalled();
    if (!isOpenCodeInstalled) {
      this.log('❌ Error: OpenCode is not installed or not in PATH');
      this.log('   Self-evolution requires OpenCode CLI to run.');
      this.log('   Install it with: npm install -g opencode');
      return false;
    }
    return true;
  }
  /**
   * Resets internal state for a fresh run.
   * Called at the start of `run()` to support re-running after cleanup.
   */
  private resetState(): void {
    this.sleepCancelled = false;
    this.interrupted = false;
    this.cleanedUp = false;
    this.consecutiveFailures = 0;
    this.iterationCount = 0;
    this.lastIterationResult = null;
  }
  /**
   * Displays dry-run information showing what would be done without executing.
   */
  private displayDryRunInfo(): void {
    this.log('🔍 Dry run mode - showing what would be done');
    this.log(`📁 Project: ${this.projectRoot}`);
    this.log('\n📝 Would perform the following actions:');
    this.log('  1. Read EVOLVE.md constitution file');
    this.log('  2. Execute OpenCode with the evolution prompt');
    this.log('  3. Verify changes (build, test, lint, commands)');
    this.log('  4. Check if changes are committed');
    this.log('  5. Revert if verification fails or changes not committed');
    if (this.once) {
      this.log('\n  Mode: Single iteration (--once)');
    } else {
      this.log('\n  Mode: Continuous (runs until Ctrl+C)');
      this.log(`  Would loop every ${this.sleepMs / 1000} seconds`);
    }
    this.log('\n✨ Dry run complete - no changes made');
  }
  /**
   * Displays the start banner for the evolution process.
   */
  private logStartBanner(): void {
    this.log('🔄 Starting self-evolution...');
    this.log(`📁 Project: ${this.projectRoot}`);
    this.log('💡 Press Ctrl+C to stop\n');
  }
  /**
   * Runs a single evolution iteration: execute → verify → commit check.
   * @returns 'stop' if evolution should stop entirely, 'retry' if the iteration
   *   failed and should be retried (skipping the --once check), or 'completed'
   *   if the iteration finished and the --once check should apply.
   */
  private async runIteration(): Promise<'stop' | 'retry' | 'completed'> {
    this.iterationCount++;
    this.iterationStartTime = Date.now();
    const iterationTimestamp = new Date().toISOString();
    this.log(`\n📊 Iteration ${this.iterationCount} starting...`);
    // Capture git commit hash before evolution to detect if changes were committed
    const beforeCommitHash = await this.getHeadCommitHash();
    const metricsBefore = await this.captureVerificationMetrics();
    const historyReport = await readEvolutionReport(path.join(this.projectRoot, this.logFile));
    // 1. Read constitution file
    const constitution = await this.readConstitution();
    // 2. AI analyzes, executes, and commits autonomously
    this.log('\n🤖 AI analyzing and evolving...');
    const executed = await this.evolveWithOpenCode(constitution, historyReport);
    if (!executed) {
      this.lastIterationResult = {
        iteration: this.iterationCount,
        success: false,
        failureStage: 'execution',
        failureDetail: 'OpenCode execution failed or timed out',
      };
      await this.writeEvolutionRecord({
        iteration: this.iterationCount,
        timestamp: iterationTimestamp,
        success: false,
        failureStage: 'execution',
        failureDetail: 'OpenCode execution failed or timed out',
        metricsBefore: metricsBefore ?? undefined,
        durationMs: Date.now() - this.iterationStartTime,
      });
      const shouldStop = this.handleEvolutionFailure('Evolution execution issue');
      return shouldStop ? 'stop' : 'retry';
    }
    // 3. Verify (the only gate)
    this.log('\n🔍 Verifying changes...');
    const verifyFailure = await this.verify();
    if (verifyFailure) {
      this.lastIterationResult = {
        iteration: this.iterationCount,
        success: false,
        failureStage: 'verification',
        failureDetail: verifyFailure,
      };
      await this.writeEvolutionRecord({
        iteration: this.iterationCount,
        timestamp: iterationTimestamp,
        success: false,
        failureStage: 'verification',
        failureDetail: verifyFailure,
        metricsBefore: metricsBefore ?? undefined,
        durationMs: Date.now() - this.iterationStartTime,
      });
      this.log('❌ Verification failed, reverting...');
      const revertSuccess = await this.revert();
      return this.handleRevertFailure(revertSuccess, 'Verification failed') ? 'completed' : 'stop';
    }
    // Verification passed, check if AI has committed by comparing commit hashes
    const isClean = await this.isWorkingTreeClean();
    const afterCommitHash = await this.getHeadCommitHash();
    // Track hash comparison state - null means we couldn't determine the hash
    const beforeHashError = beforeCommitHash === null;
    const afterHashError = afterCommitHash === null;
    const hashChanged = !beforeHashError && !afterHashError && beforeCommitHash !== afterCommitHash;
    // Detect decision before validation so we can apply decision-specific diff limits
    const decision = hashChanged ? await this.detectDecisionFromCommit() : undefined;
    const committedValidation =
      isClean && hashChanged && beforeCommitHash && afterCommitHash
        ? await this.validateCommittedChanges(beforeCommitHash, afterCommitHash, decision)
        : null;
    const metricsAfter = await this.captureVerificationMetrics();
    const filesChanged = await this.getChangedFilesList(beforeCommitHash, afterCommitHash);
    const testDecisionValidation = this.validateTestDecision(
      decision,
      filesChanged,
      metricsBefore,
      metricsAfter,
      this.lastIterationResult
    );
    const shouldContinue = await this.handlePostVerificationState(
      isClean,
      hashChanged,
      beforeHashError || afterHashError,
      beforeCommitHash,
      committedValidation,
      decision,
      testDecisionValidation
    );
    await this.recordIterationOutcome(
      iterationTimestamp,
      isClean,
      hashChanged,
      afterCommitHash,
      decision,
      filesChanged,
      committedValidation,
      testDecisionValidation,
      metricsBefore,
      metricsAfter
    );
    return shouldContinue ? 'completed' : 'stop';
  }
  /**
   * Records the iteration outcome based on working tree state and commit status.
   * Separates result-recording concerns from the iteration control flow.
   * @param iterationTimestamp - ISO timestamp for the evolution log
   * @param isClean - Whether the working tree is clean (pre-revert state)
   * @param hashChanged - Whether the commit hash changed (indicating AI committed)
   * @param beforeCommitHash - Commit hash before the iteration
   * @param afterCommitHash - Commit hash after the iteration
   */
  private async recordIterationOutcome(
    iterationTimestamp: string,
    isClean: boolean,
    hashChanged: boolean,
    afterCommitHash: string | null,
    decision: string | undefined,
    filesChanged: string[] | undefined,
    committedValidation: CommittedChangeValidationResult | null,
    testDecisionValidation: TestDecisionValidationResult,
    metricsBefore: VerificationMetrics | null,
    metricsAfter: VerificationMetrics | null
  ): Promise<void> {
    const durationMs = Date.now() - this.iterationStartTime;
    const metricDelta = this.calculateMetricDelta(metricsBefore, metricsAfter);
    const outcome = this.determineIterationOutcome(
      isClean,
      hashChanged,
      decision,
      filesChanged,
      committedValidation,
      testDecisionValidation
    );
    this.lastIterationResult = {
      iteration: this.iterationCount,
      success: outcome.success,
      decision: outcome.decision,
      failureStage: outcome.failureStage,
      failureDetail: outcome.failureDetail,
      filesChanged: outcome.filesChanged,
    };
    await this.writeEvolutionRecord({
      iteration: this.iterationCount,
      timestamp: iterationTimestamp,
      success: outcome.success,
      failureStage: outcome.failureStage,
      failureDetail: outcome.failureDetail,
      commitHash: afterCommitHash ?? undefined,
      decision: outcome.decision,
      filesChanged: outcome.filesChanged,
      metricsBefore: metricsBefore ?? undefined,
      metricsAfter: metricsAfter ?? undefined,
      metricDelta,
      durationMs,
    });
  }

  /**
   * Determines the outcome of an iteration based on working tree and commit state.
   * Returns a structured result that can be used directly for logging and recording.
   */
  private determineIterationOutcome(
    isClean: boolean,
    hashChanged: boolean,
    decision: string | undefined,
    filesChanged: string[] | undefined,
    committedValidation: CommittedChangeValidationResult | null,
    testDecisionValidation: TestDecisionValidationResult
  ): {
    success: boolean;
    decision: string | undefined;
    failureStage?: 'commit';
    failureDetail?: string;
    filesChanged?: string[];
  } {
    // Committed but TEST decision failed value bar
    if (isClean && hashChanged && !testDecisionValidation.valid) {
      return {
        success: false,
        decision,
        failureStage: 'commit',
        failureDetail:
          testDecisionValidation.reason ?? 'TEST decision did not clear the minimum value bar',
        filesChanged,
      };
    }
    // Committed but violated file restrictions or size limits
    if (isClean && hashChanged && committedValidation && !committedValidation.valid) {
      const failureDetail =
        committedValidation.violations.length > 0
          ? `Committed changes violated file restrictions: ${committedValidation.violations.join(', ')}`
          : `Committed changes exceeded diff size limit: ${committedValidation.total} lines changed (limit: ${this.maxDiffLines})`;
      return {
        success: false,
        decision,
        failureStage: 'commit',
        failureDetail,
        filesChanged,
      };
    }
    // Successfully committed
    if (isClean && hashChanged) {
      return { success: true, decision, filesChanged };
    }
    // Clean but no commit = SKIP
    if (isClean) {
      return {
        success: true,
        decision: 'SKIP',
        failureDetail: 'AI made no changes (SKIP)',
      };
    }
    // Not clean = uncommitted changes remaining
    return {
      success: false,
      decision,
      failureStage: 'commit',
      failureDetail: hashChanged ? PARTIAL_COMMIT_DETAIL : COMMIT_MISSED_DETAIL,
      filesChanged,
    };
  }
  /**
   * Runs the self-evolution loop - continues indefinitely until interrupted by user.
   */
  async run(): Promise<void> {
    this.resetState();
    // Re-register signal handlers if they were cleaned up (allows re-run after cleanup)
    this.setupSignalHandlers();
    const preFlightPassed = await this.runPreFlightChecks();
    if (!preFlightPassed) {
      this.cleanup();
      return;
    }
    if (this.dryRun) {
      this.displayDryRunInfo();
      this.cleanup();
      return;
    }
    this.logStartBanner();
    while (!this.interrupted) {
      const result = await this.runIteration();
      if (result === 'stop') {
        return;
      }
      // Only check --once for completed iterations (not retries from execution failure)
      if (result === 'completed' && this.once) {
        this.log('\n✨ Single iteration complete (--once flag set)');
        this.cleanup();
        return;
      }
      this.log(`\n💤 Waiting ${this.sleepMs / 1000}s before next iteration...`);
      await this.sleep(this.sleepMs);
    }
    this.log('\n✨ Evolution stopped');
    this.cleanup();
  }
  /**
   * Reads the constitution file (EVOLVE.md).
   */
  private async readConstitution(): Promise<string> {
    try {
      const constitutionPath = path.join(this.projectRoot, 'EVOLVE.md');
      if (await fs.pathExists(constitutionPath)) {
        return await fs.readFile(constitutionPath, 'utf-8');
      }
      this.log('⚠️  No EVOLVE.md constitution file found - AI will operate without guidance');
    } catch (error) {
      this.log(`⚠️  ${formatErrorWithPrefix('Could not read EVOLVE.md', error)}`);
    }
    return '';
  }
  /**
   * Gets the file tree for context, including source files, config files, and documentation.
   * Includes both tracked and untracked files to provide complete context for evolution.
   * Uses a single git ls-files call with multiple pathspecs for efficiency.
   */
  private async getFileTree(): Promise<string> {
    // Single git ls-files call with all pathspecs for efficiency
    const result = await this.safeExeca('git', [
      'ls-files',
      '--others',
      '--exclude-standard',
      '--cached',
      '--',
      '*.json',
      '*.js',
      '*.md',
      '*.yml',
      '*.yaml',
      'bin/',
      'src/',
    ]);
    if (!result || !result.stdout.trim()) {
      const exitCode = result?.exitCode ?? 'unknown';
      return `Project files (unable to list - git exit code ${exitCode})`;
    }
    // Categorize files by type
    const files = result.stdout.split('\n').filter((f) => f.trim());
    const configFiles: string[] = [];
    const binFiles: string[] = [];
    const srcFiles: string[] = [];
    for (const file of files) {
      if (file.startsWith('src/')) {
        srcFiles.push(file);
      } else if (file.startsWith('bin/')) {
        binFiles.push(file);
      } else if (
        file.endsWith('.json') ||
        file.endsWith('.js') ||
        file.endsWith('.md') ||
        file.endsWith('.yml') ||
        file.endsWith('.yaml')
      ) {
        configFiles.push(file);
      }
    }
    const parts: string[] = [];
    if (configFiles.length > 0) {
      parts.push('## Configuration Files\n' + configFiles.join('\n'));
    }
    if (binFiles.length > 0) {
      parts.push('## Bin Files\n' + binFiles.join('\n'));
    }
    if (srcFiles.length > 0) {
      parts.push('## Source Files\n' + srcFiles.join('\n'));
    }
    if (parts.length === 0) {
      return 'Project files (unable to list)';
    }
    return parts.join('\n\n');
  }
  /**
   * Builds the file restriction section for the evolution prompt.
   * Includes allowed paths and forbidden paths when configured.
   * @returns Formatted section string, or empty string if no restrictions
   */
  private buildFileRestrictionSection(): string {
    if (this.forbiddenPaths.length === 0 && this.allowedPaths.length === 0) {
      return '';
    }
    const parts: string[] = ['\n## File Restrictions'];
    if (this.allowedPaths.length > 0) {
      parts.push('Only modify files under:');
      parts.push(...this.allowedPaths.map((p) => `- ${p}`));
    }
    if (this.forbiddenPaths.length > 0) {
      parts.push('Do NOT modify these files/paths:');
      parts.push(...this.forbiddenPaths.map((p) => `- ${p}`));
    }
    return parts.join('\n') + '\n';
  }
  /**
   * Builds the change size limit section for the evolution prompt.
   * @returns Formatted section string, or empty string if no limit set
   */
  private buildChangeSizeLimitSection(): string {
    const maxLimit = this.getMaxDiffLimit();
    if (maxLimit <= 0) {
      return '';
    }
    const lines = [
      '',
      '## Change Size Limit',
      'Diff line limits vary by decision type (insertions + deletions combined):',
      `- TEST: ${this.diffLimits.test} lines`,
      `- REFACTOR: ${this.diffLimits.refactor} lines`,
      `- FIX: ${this.diffLimits.fix} lines`,
      `- FEATURE: ${this.diffLimits.feature} lines`,
      'One commit = one focused logical change.',
      '',
    ];
    return lines.join('\n');
  }
  /**
   * Detects if recent iterations are stuck in a low-value decision loop.
   * Analyzes the report's recent window for dominance of a single decision type.
   * @returns A prompt warning string, or empty string if no loop detected
   */
  buildDecisionLoopWarning(report: EvolutionReport | null | undefined): string {
    if (!report || report.recentWindow.size < 5) return '';
    const dist = report.recentWindow.decisionDistribution;
    const recentSize = report.recentWindow.size;
    // Find the dominant decision type
    let dominantType = '';
    let dominantCount = 0;
    for (const [type, count] of Object.entries(dist)) {
      if (type === 'UNKNOWN' || type === 'SKIP') continue;
      if (count > dominantCount) {
        dominantType = type;
        dominantCount = count;
      }
    }
    // Warn if one type accounts for 60%+ of recent decisions
    const dominanceRatio = dominantCount / recentSize;
    if (dominanceRatio < 0.6) return '';
    return [
      '',
      '## Decision Pattern Warning',
      `Recent ${recentSize} iterations are ${Math.round(dominanceRatio * 100)}% ${dominantType}.`,
      'Repeating the same decision type with diminishing returns wastes iterations.',
      'Consider a different decision type or SKIP if the codebase is healthy.',
      '',
    ].join('\n');
  }
  /**
   * Builds the previous iteration context section for the evolution prompt.
   * @param lastResult - The result from the previous iteration
   * @returns Formatted section string, or empty string if no previous result
   */
  private buildPreviousIterationSection(lastResult: IterationResult): string {
    const resultLabel = lastResult.success ? 'SUCCESS' : 'FAILED';
    const parts = [`- Result: ${resultLabel}`];
    if (lastResult.decision) {
      parts.push(`- Decision: ${lastResult.decision}`);
    }
    if (lastResult.failureStage) {
      parts.push(`- Failed Stage: ${lastResult.failureStage}`);
    }
    if (lastResult.failureDetail) {
      parts.push(`- Error: ${lastResult.failureDetail}`);
    }
    if (lastResult.filesChanged && lastResult.filesChanged.length > 0) {
      parts.push(`- Files Changed: ${lastResult.filesChanged.join(', ')}`);
    }
    return [
      '',
      `## Previous Iteration (#${lastResult.iteration})`,
      parts.join('\n'),
      '',
      'Do NOT repeat the same approach that failed. Try a different strategy.',
    ].join('\n');
  }
  /**
   * Builds the evolution prompt for OpenCode with constitution and file tree.
   * Optionally includes context from the previous iteration to avoid repeated failures.
   */
  private buildEvolutionPrompt(
    constitution: string,
    fileTree: string,
    lastResult?: IterationResult | null,
    metricsSection?: string,
    historySummary?: string,
    historyReport?: EvolutionReport | null
  ): string {
    const runner = this.getCommandRunner();
    const cliVerifyCommands = EVOLUTION_VERIFY_COMMANDS.map(
      (cmd) => `   - ${runner.file} ${runner.prefixArgs.join(' ')} ${cmd} --help`
    ).join('\n');
    const previousIterationSection = lastResult
      ? this.buildPreviousIterationSection(lastResult)
      : '';
    const fileRestrictionSection = this.buildFileRestrictionSection();
    const changeSizeLimitSection = this.buildChangeSizeLimitSection();
    const decisionLoopWarning = this.buildDecisionLoopWarning(historyReport);
    const metricsBlock = metricsSection ? `${metricsSection}\n` : '';
    const historyBlock = historySummary ? `\n${historySummary}\n` : '';
    return `${constitution}
## Current Codebase
Source files:
${fileTree}
${metricsBlock}${historyBlock}## Your Task
Read and analyze the codebase, then decide:
1. FIX - Fix bugs, errors, or broken functionality
2. TEST - Add tests for uncovered code
3. REFACTOR - Simplify complex code
4. FEATURE - Add small, useful new functionality (only if base is solid)
5. SKIP - Codebase is healthy, no changes needed this round
Execute your decision. Make minimal, focused changes.
${fileRestrictionSection}${changeSizeLimitSection}${decisionLoopWarning}## After Changes
1. **Verify** all pass:
   - npm run build
   - npm test
   - npm run lint
${cliVerifyCommands}
2. **Commit** if verification passes:
   \`\`\`bash
   git add -A
   git commit -m "[evolve] type: description"
   \`\`\`
    Always prefix with \`[evolve]\` so commits are identifiable in git log.
    Use conventional commit types:
    - \`fix:\` - bug fixes
    - \`test:\` - adding tests
    - \`refactor:\` - code improvements
    - \`feat:\` - new features
If verification fails, do NOT commit - the system will revert automatically.${previousIterationSection}`;
  }
  /**
   * Invokes OpenCode to apply improvements.
   */
  private async evolveWithOpenCode(
    constitution: string,
    historyReport?: EvolutionReport | null
  ): Promise<boolean> {
    const fileTree = await this.getFileTree();
    const metricsSection = await this.gatherCodeHealthMetrics();
    const historySummary = historyReport ? formatHistorySummary(historyReport) : '';
    const prompt = this.buildEvolutionPrompt(
      constitution,
      fileTree,
      this.lastIterationResult,
      metricsSection,
      historySummary,
      historyReport
    );
    try {
      this.log('🚀 Executing OpenCode...');
      const result = await execa('opencode', ['run', prompt], {
        cwd: this.projectRoot,
        stdio: ['inherit', 'pipe', 'pipe'], // Capture stdout/stderr for debugging
        reject: false,
        timeout: this.opencodeTimeoutMs, // 10 minutes timeout to prevent indefinite hangs
      });
      // Log stderr if present for debugging
      if (result.stderr && result.stderr.trim()) {
        const stderrPreview = this.truncateOutput(result.stderr, OPENCODE_STDERR_PREVIEW_LIMIT);
        this.log(`OpenCode stderr: ${stderrPreview}`);
      }
      // Check if OpenCode timed out - revert any partial changes
      if (result.timedOut) {
        this.log('⚠️  OpenCode timed out, reverting any partial changes...');
        const reverted = await this.revert();
        if (!reverted) {
          this.log('❌ Revert after timeout failed - manual intervention may be required');
        }
        return false;
      }
      if (result.exitCode !== 0) {
        this.log(`⚠️  OpenCode exited with code ${result.exitCode}`);
        return false;
      }
      this.log('✅ OpenCode execution completed');
      return true;
    } catch (error) {
      this.log(`⚠️  ${formatErrorWithPrefix('OpenCode execution failed', error)}`);
      return false;
    }
  }
  /**
   * Returns the command runner configuration based on the useTsNode setting.
   * Centralizes the ts-node vs dist branching used by both verify() and buildEvolutionPrompt().
   */
  private getCommandRunner(): { file: string; prefixArgs: string[] } {
    return this.useTsNode
      ? { file: 'npx', prefixArgs: ['ts-node', 'src/cli/index.ts'] }
      : { file: 'node', prefixArgs: ['dist/cli/index.js'] };
  }
  /**
   * Comprehensive verification - includes self-verification.
   * Uses EVOLUTION_VERIFY_COMMANDS to dynamically check all CLI commands.
   * When adding new commands, add them to EVOLUTION_VERIFY_COMMANDS in types/evolve.ts.
   * @returns null if verification passes, or a string describing why it failed
   */
  private async verify(): Promise<string | null> {
    // Check forbidden file changes before running expensive build/test/lint
    const { valid, violations } = await this.validateChangedFiles();
    if (!valid) {
      this.log(`  ❌ Forbidden file changes detected:`);
      for (const v of violations) {
        this.log(`     - ${v}`);
      }
      return `Forbidden file changes: ${violations.join(', ')}`;
    }
    // Check diff size limit (uses max across all decision types as pre-commit safety cap)
    const { total, withinLimit } = await this.checkDiffSize();
    if (!withinLimit) {
      this.log(`  ❌ Change too large: ${total} lines changed (limit: ${this.getMaxDiffLimit()})`);
      return `Change too large: ${total} lines (limit: ${this.getMaxDiffLimit()})`;
    }
    const runner = this.getCommandRunner();
    const commandChecks = EVOLUTION_VERIFY_COMMANDS.map((cmd) => ({
      name: `${cmd.charAt(0).toUpperCase() + cmd.slice(1)} command`,
      file: runner.file,
      args: [...runner.prefixArgs, cmd, '--help'],
    }));
    // Stage 1: Build (must succeed before running tests)
    const buildCheck = { name: 'Build', file: 'npm', args: ['run', 'build'] };
    this.log(`  Checking ${buildCheck.name}...`);
    const buildResult = await this.safeExeca(buildCheck.file, buildCheck.args, {
      timeout: this.verifyTimeoutMs,
    });
    if (!buildResult || buildResult.exitCode !== 0) {
      this.logCheckFailure(buildCheck.name, buildResult);
      return 'Build failed';
    }
    this.log(`  ✅ ${buildCheck.name} passed`);
    // Stage 2: Tests + Lint (independent, can run in parallel)
    // Always collect coverage — the data is needed for TEST validation and metric logging.
    const testArgs = ['test', '--', '--coverage'];
    const parallelChecks = [
      { name: 'Tests', file: 'npm', args: testArgs },
      { name: 'Lint', file: 'npm', args: ['run', 'lint'] },
    ];
    this.log(`  Checking Tests and Lint in parallel...`);
    const parallelResults = await Promise.all(
      parallelChecks.map(async (check) => {
        const result = await this.safeExeca(check.file, check.args, {
          timeout: this.verifyTimeoutMs,
        });
        return { check, result };
      })
    );
    for (const { check, result } of parallelResults) {
      if (!result || result.exitCode !== 0) {
        this.logCheckFailure(check.name, result);
        return `${check.name} failed`;
      }
      this.log(`  ✅ ${check.name} passed`);
    }
    // Stage 2.5: Coverage gate (runs after tests generate coverage data)
    if (this.coverageBaseline) {
      this.log(`  Checking coverage baseline...`);
      const { passed, details } = await this.checkCoverageBaseline();
      if (!passed) {
        this.log(`  ❌ Coverage gate failed: ${details}`);
        return `Coverage gate failed: ${details}`;
      }
      this.log(`  ✅ Coverage gate passed`);
    }
    // Stage 3: CLI command checks (all independent, can run in parallel)
    this.log(`  Checking CLI commands in parallel...`);
    const commandResults = await Promise.all(
      commandChecks.map(async (check) => {
        const result = await this.safeExeca(check.file, check.args, {
          timeout: this.verifyTimeoutMs,
        });
        return { check, result };
      })
    );
    for (const { check, result } of commandResults) {
      if (!result || result.exitCode !== 0) {
        this.logCheckFailure(check.name, result);
        return `${check.name} failed`;
      }
      this.log(`  ✅ ${check.name} passed`);
    }
    return null;
  }
  /**
   * Logs a check failure with error details.
   */
  private logCheckFailure(name: string, result: ExecaResult | null): void {
    this.log(`  ❌ ${name} failed`);
    if (result?.stderr) {
      const stderrPreview = this.truncateOutput(result.stderr, VERIFY_ERROR_PREVIEW_LIMIT);
      this.log(`     Error: ${stderrPreview}`);
    }
    if (result?.stdout) {
      const stdoutPreview = this.truncateOutput(result.stdout, VERIFY_ERROR_PREVIEW_LIMIT);
      if (stdoutPreview) {
        this.log(`     Output: ${stdoutPreview}`);
      }
    }
  }
  /**
   * Handles evolution failure by incrementing failure counter and checking max retries.
   * @param reason - The reason for the failure (for logging)
   * @returns true if evolution should stop (max retries reached), false to continue
   */
  private handleEvolutionFailure(reason: string): boolean {
    this.consecutiveFailures++;
    const shouldStop = this.maxRetries >= 0 && this.consecutiveFailures >= this.maxRetries;
    if (shouldStop) {
      this.log(`❌ ${reason} - Max retries (${this.maxRetries}) reached, stopping evolution`);
      this.cleanup();
    } else {
      const retryLabel = this.maxRetries === -1 ? '∞' : this.maxRetries;
      this.log(
        `⚠️  ${reason} (${this.consecutiveFailures}/${retryLabel}), retrying next iteration...`
      );
    }
    return shouldStop;
  }
  /**
   * Handles revert failure by logging error and cleaning up if necessary.
   * @param revertSuccess - Whether the revert operation succeeded
   * @param reason - The reason for the revert (for logging)
   * @returns true if evolution should continue, false if it should stop
   */
  private handleRevertFailure(revertSuccess: boolean, reason: string): boolean {
    if (!revertSuccess) {
      this.log('❌ Revert failed - manual intervention may be required');
      this.cleanup();
      return false;
    }
    const shouldStop = this.handleEvolutionFailure(reason);
    return !shouldStop;
  }
  /**
   * Attempts to revert changes and reset the consecutive failure counter on success.
   * @returns true if revert succeeded (failure counter reset), false if revert failed (stops evolution)
   */
  private async revertOrFailOrResetFailures(): Promise<boolean> {
    const revertSuccess = await this.revert();
    if (!revertSuccess) {
      this.log('❌ Revert failed - manual intervention may be required');
      this.cleanup();
      return false;
    }
    this.consecutiveFailures = 0;
    return true;
  }
  /**
   * Reverts to a known-safe commit hash, handling the case where the hash is unavailable.
   * Used by handlePostVerificationState when committed changes need to be undone.
   * @returns true if evolution should continue, false if it should stop
   */
  private async revertToHashOrFail(
    beforeCommitHash: string | null,
    reason: string
  ): Promise<boolean> {
    if (!beforeCommitHash) {
      this.cleanup();
      return false;
    }
    const reverted = await this.revertCommittedIteration(beforeCommitHash);
    return this.handleRevertFailure(reverted, reason);
  }
  /**
   * Handles post-verification state by checking working tree cleanliness and commit status.
   * @param isClean - Whether the working tree is clean
   * @param hashChanged - Whether the commit hash changed (indicating AI committed)
   * @param hashError - Whether there was an error getting commit hashes
   * @returns true if evolution should continue, false if it should stop
   */
  private async handlePostVerificationState(
    isClean: boolean,
    hashChanged: boolean,
    hashError: boolean,
    beforeCommitHash: string | null,
    committedValidation: CommittedChangeValidationResult | null,
    decision: string | undefined,
    testDecisionValidation: TestDecisionValidationResult = { valid: true }
  ): Promise<boolean> {
    // If we couldn't determine commit hashes, log a warning but continue
    if (hashError) {
      this.log('⚠️  Could not determine commit hash status (git error)');
      if (isClean) {
        this.log('ℹ️  Working tree is clean, assuming no changes made');
        this.consecutiveFailures = 0;
        return true;
      }
      // Not clean but can't verify commit - revert to be safe
      this.log('⚠️  Working tree is not clean, reverting to be safe...');
      return this.revertOrFailOrResetFailures();
    }
    if (isClean && hashChanged) {
      if (!testDecisionValidation.valid) {
        this.log(`⚠️  ${testDecisionValidation.reason}`);
        return this.revertToHashOrFail(
          beforeCommitHash,
          testDecisionValidation.reason ?? 'Invalid TEST decision'
        );
      }
      if (committedValidation && !committedValidation.valid) {
        if (committedValidation.violations.length > 0) {
          this.log('⚠️  Committed changes violated file restrictions:');
          for (const violation of committedValidation.violations) {
            this.log(`     - ${violation}`);
          }
        } else {
          this.log(
            `⚠️  Committed changes exceeded diff size limit: ${committedValidation.total} lines changed (limit: ${this.getDiffLimitForDecision(decision)} for ${decision ?? 'unknown'})`
          );
        }
        const failureReason =
          committedValidation.violations.length > 0
            ? 'Committed changes violated file restrictions'
            : 'Committed changes exceeded diff size limit';
        return this.revertToHashOrFail(beforeCommitHash, failureReason);
      }
      if (decision === 'TEST') {
        this.log('✅ TEST decision cleared the value bar');
      }
      this.log('✅ Changes committed by AI');
      this.consecutiveFailures = 0; // Reset on success
      return true;
    }
    if (isClean && !hashChanged) {
      this.log('ℹ️  AI made no changes this iteration (SKIP)');
      this.consecutiveFailures = 0; // Not a failure
      return true;
    }
    // Not clean = some changes left uncommitted
    if (hashChanged) {
      this.log('⚠️  Verification passed but AI left uncommitted changes after partial commit');
      this.log('🔄 Reverting committed and uncommitted changes...');
      return this.revertToHashOrFail(beforeCommitHash, PARTIAL_COMMIT_DETAIL);
    } else {
      this.log('⚠️  Verification passed but AI did not commit changes');
      this.log('🔄 Reverting uncommitted changes...');
      return this.handleRevertFailure(await this.revert(), COMMIT_MISSED_DETAIL);
    }
  }
  /**
   * Checks if working tree is clean (all changes committed).
   */
  private async isWorkingTreeClean(): Promise<boolean> {
    const result = await this.safeExeca('git', ['status', '--porcelain']);
    return result ? result.stdout.trim().length === 0 : false;
  }
  /**
   * Gets the current HEAD commit hash.
   * @returns The commit hash string, or null if not in a git repo or on error
   */
  private async getHeadCommitHash(): Promise<string | null> {
    const result = await this.safeExeca('git', ['rev-parse', 'HEAD']);
    if (!result || result.exitCode !== 0) {
      return null;
    }
    const hash = result.stdout.trim();
    return hash.length > 0 ? hash : null;
  }
  /**
   * Gets the list of files changed between two commit hashes, or in the working tree.
   * @returns Array of changed file paths, or undefined if unavailable
   */
  private async getChangedFilesList(
    beforeHash: string | null,
    afterHash: string | null
  ): Promise<string[] | undefined> {
    try {
      let result;
      if (beforeHash && afterHash && beforeHash !== afterHash) {
        result = await this.safeExeca('git', ['diff', '--name-only', beforeHash, afterHash]);
      } else {
        result = await this.safeExeca('git', ['diff', '--name-only']);
      }
      if (!result || result.exitCode !== 0) return undefined;
      const files = result.stdout
        .split('\n')
        .map((f) => f.trim())
        .filter((f) => f.length > 0);
      return files.length > 0 ? files : undefined;
    } catch (error) {
      this.log(`⚠️  ${formatErrorWithPrefix('Could not get changed files list', error)}`);
      return undefined;
    }
  }
  /**
   * Detects the AI's decision from the most recent commit message.
   * Maps conventional commit prefixes to decision labels.
   * @returns The decision string, or undefined if not detectable
   */
  private async detectDecisionFromCommit(): Promise<string | undefined> {
    const result = await this.safeExeca('git', ['log', '-1', '--format=%s']);
    if (!result || result.exitCode !== 0) return undefined;
    let msg = result.stdout.trim().toLowerCase();
    // Strip the [evolve] prefix if present so conventional-commit detection works
    if (msg.startsWith('[evolve]')) {
      msg = msg.slice('[evolve]'.length).trimStart();
    }
    if (msg.startsWith('fix:') || msg.startsWith('fix(')) return 'FIX';
    if (msg.startsWith('test:') || msg.startsWith('test(')) return 'TEST';
    if (msg.startsWith('refactor:') || msg.startsWith('refactor(')) return 'REFACTOR';
    if (msg.startsWith('feat:') || msg.startsWith('feat(')) return 'FEATURE';
    return undefined;
  }
  /**
   * Reverts changes (both staged and unstaged).
   * @returns true if revert succeeded, false otherwise
   */
  private async revert(): Promise<boolean> {
    // First reset any staged changes, then revert working tree
    const resetResult = await this.safeExeca('git', ['reset']);
    if (!resetResult || resetResult.exitCode !== 0) {
      this.log('⚠️  Git reset failed');
      return false;
    }
    const checkoutResult = await this.safeExeca('git', ['checkout', '.']);
    if (!checkoutResult || checkoutResult.exitCode !== 0) {
      this.log('⚠️  Git checkout failed');
      return false;
    }
    // Remove untracked files and directories to prevent accumulation across iterations
    // Skip if keepUntracked is true to preserve new files created during evolution
    if (!this.keepUntracked) {
      const cleanResult = await this.safeExeca('git', ['clean', '-fd']);
      if (!cleanResult || cleanResult.exitCode !== 0) {
        this.log('⚠️  Git clean failed');
        return false;
      }
    } else {
      this.log('ℹ️  Preserving untracked files (--keep-untracked)');
    }
    this.log('🔄 Reverted changes');
    return true;
  }
  /**
   * Sleeps for the specified duration.
   * Clears the timer if interrupted to prevent memory leaks.
   * Resolves immediately if cleanup has been called.
   */
  private sleep(ms: number): Promise<void> {
    // If already cleaned up, resolve immediately to prevent hanging
    if (this.cleanedUp) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      // Store the resolve function so cleanup can call it
      this.sleepResolve = resolve;
      this.sleepTimer = setTimeout(() => {
        this.sleepTimer = null;
        // Only resolve if not cancelled and resolve still exists
        if (!this.sleepCancelled && this.sleepResolve) {
          this.sleepResolve = null;
          resolve();
        }
      }, ms);
    });
  }
  /**
   * Gets the current status of the driver for debugging purposes.
   * @returns Object containing driver state information
   */
  getStatus(): {
    interrupted: boolean;
    cleanedUp: boolean;
    projectRoot: string;
    dryRun: boolean;
    once: boolean;
    consecutiveFailures: number;
    iterationCount: number;
    keepUntracked: boolean;
    lastIterationResult: IterationResult | null;
  } {
    return {
      interrupted: this.interrupted,
      cleanedUp: this.cleanedUp,
      projectRoot: this.projectRoot,
      dryRun: this.dryRun,
      once: this.once,
      consecutiveFailures: this.consecutiveFailures,
      iterationCount: this.iterationCount,
      keepUntracked: this.keepUntracked,
      lastIterationResult: this.lastIterationResult,
    };
  }
}
/**
 * Convenience function to run the self-evolution process.
 * @param options - Optional configuration for the self-evolution process
 */
export async function runSelfEvolution(options?: SelfEvolverOptions): Promise<void> {
  const driver = new SelfDriver(options);
  try {
    await driver.run();
  } finally {
    driver.cleanup();
  }
}
