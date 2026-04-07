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
import type { SelfEvolverOptions, IterationResult, EvolutionRecord } from '../types/evolve';

export type { SelfEvolverOptions, IterationResult, EvolutionRecord };

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
  private coverageBaseline: {
    branches: number;
    functions: number;
    lines: number;
    statements: number;
  } | null;

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
    this.coverageBaseline = options.coverageBaseline ?? null;

    // Validate options
    if (this.sleepMs <= 0) {
      throw new Error(`Invalid sleepMs: ${this.sleepMs}. Must be a positive number.`);
    }
    if (this.maxRetries < -1) {
      throw new Error(`Invalid maxRetries: ${this.maxRetries}. Must be >= -1 (-1 for unlimited).`);
    }
    if (this.verifyTimeoutMs <= 0) {
      throw new Error(
        `Invalid verifyTimeoutMs: ${this.verifyTimeoutMs}. Must be a positive number.`
      );
    }
    if (this.opencodeTimeoutMs <= 0) {
      throw new Error(
        `Invalid opencodeTimeoutMs: ${this.opencodeTimeoutMs}. Must be a positive number.`
      );
    }

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
   * Checks if a file path matches a glob pattern.
   * Supports exact match and directory prefix (ending with /**).
   */
  private matchesGlobPattern(filePath: string, pattern: string): boolean {
    const normalized = filePath.replace(/\\/g, '/');
    const normalizedPattern = pattern.replace(/\\/g, '/');

    // Exact match
    if (normalized === normalizedPattern) return true;

    // Directory glob: "dir/**" matches any file under that directory
    if (normalizedPattern.endsWith('/**')) {
      const prefix = normalizedPattern.slice(0, -2);
      if (normalized.startsWith(prefix)) return true;
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

    const result = await this.safeExeca('git', ['diff', '--name-only']);
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

    const violations: string[] = [];
    for (const file of changedFiles) {
      // Check forbidden paths (blacklist)
      let isForbidden = false;
      for (const pattern of this.forbiddenPaths) {
        if (this.matchesGlobPattern(file, pattern)) {
          violations.push(file);
          isForbidden = true;
          break;
        }
      }

      // Check allowed paths (whitelist) - only if not already forbidden
      if (!isForbidden && this.allowedPaths.length > 0) {
        const isAllowed = this.allowedPaths.some((pattern) =>
          this.matchesGlobPattern(file, pattern)
        );
        if (!isAllowed) {
          violations.push(file);
        }
      }
    }

    return { valid: violations.length === 0, violations };
  }

  /**
   * Checks if the total number of changed lines exceeds the configured limit.
   * Parses `git diff --shortstat` output like " 3 files changed, 10 insertions(+), 5 deletions(-)"
   * @returns Object with total changed lines and whether it's within the limit
   */
  private async checkDiffSize(): Promise<{ total: number; withinLimit: boolean }> {
    if (this.maxDiffLines <= 0) {
      return { total: 0, withinLimit: true };
    }

    const result = await this.safeExeca('git', ['diff', '--shortstat']);
    if (!result) {
      this.log('⚠️  Could not determine diff size, skipping size check');
      return { total: 0, withinLimit: true };
    }

    const output = result.stdout.trim();
    if (output.length === 0) {
      return { total: 0, withinLimit: true };
    }

    let insertions = 0;
    let deletions = 0;
    const insertMatch = output.match(/(\d+)\s+insertion/);
    const deleteMatch = output.match(/(\d+)\s+deletion/);
    if (insertMatch) insertions = parseInt(insertMatch[1], 10);
    if (deleteMatch) deletions = parseInt(deleteMatch[1], 10);

    const total = insertions + deletions;
    return { total, withinLimit: total <= this.maxDiffLines };
  }

  /**
   * Gathers code coverage metrics from the last test run's coverage summary.
   * Reads the coverage-summary.json generated by `npm test -- --coverage`.
   * @returns A formatted string of coverage metrics, or null if unavailable
   */
  private async gatherCoverageMetrics(): Promise<string | null> {
    try {
      const summaryPath = path.join(this.projectRoot, 'coverage', 'coverage-summary.json');
      if (!(await fs.pathExists(summaryPath))) {
        return null;
      }
      const raw = await fs.readFile(summaryPath, 'utf-8');
      const summary = JSON.parse(raw);
      const total = summary?.total;
      if (!total) return null;

      const b = total.branches?.pct ?? '?';
      const f = total.functions?.pct ?? '?';
      const l = total.lines?.pct ?? '?';
      const s = total.statements?.pct ?? '?';

      return `- Test Coverage: branches ${b}%, functions ${f}%, lines ${l}%, statements ${s}%`;
    } catch {
      return null;
    }
  }

  /**
   * Finds the files with the lowest line coverage from coverage-summary.json.
   * @param maxFiles - Maximum number of low-coverage files to return
   * @returns A formatted string listing low-coverage files, or null if unavailable
   */
  private async gatherLowestCoverageFiles(maxFiles = 5): Promise<string | null> {
    try {
      const summaryPath = path.join(this.projectRoot, 'coverage', 'coverage-summary.json');
      if (!(await fs.pathExists(summaryPath))) {
        return null;
      }
      const raw = await fs.readFile(summaryPath, 'utf-8');
      const summary = JSON.parse(raw);

      const fileEntries: Array<{ file: string; pct: number }> = [];
      for (const [key, value] of Object.entries(summary)) {
        if (key === 'total') continue;
        const entry = value as { lines?: { pct?: number } };
        const pct = entry?.lines?.pct;
        if (typeof pct === 'number' && pct < 100) {
          fileEntries.push({ file: key, pct });
        }
      }

      if (fileEntries.length === 0) return null;

      fileEntries.sort((a, b) => a.pct - b.pct);
      const lowest = fileEntries.slice(0, maxFiles);

      return `- Lowest Coverage Files:\n${lowest.map((f) => `  - ${f.file} (${f.pct}%)`).join('\n')}`;
    } catch {
      return null;
    }
  }

  /**
   * Gathers ESLint warning count from the project.
   * Runs eslint in JSON format and counts warnings.
   * @returns A formatted string of lint warnings, or null if unavailable
   */
  private async gatherLintWarnings(): Promise<string | null> {
    try {
      const result = await this.safeExeca('npx', ['eslint', 'src', '--ext', '.ts', '-f', 'json'], {
        timeout: this.verifyTimeoutMs,
      });
      if (!result) return null;

      const parsed = JSON.parse(result.stdout);
      if (!Array.isArray(parsed)) return null;

      let totalWarnings = 0;
      for (const file of parsed) {
        totalWarnings += file.warningCount ?? 0;
      }

      return `- ESLint Warnings: ${totalWarnings}`;
    } catch {
      return null;
    }
  }

  /**
   * Gathers code health metrics (coverage + lint warnings) for the evolution prompt.
   * Returns a formatted section string, or empty string if no metrics are available.
   */
  private async gatherCodeHealthMetrics(): Promise<string> {
    const [coverage, lint, lowestFiles] = await Promise.all([
      this.gatherCoverageMetrics(),
      this.gatherLintWarnings(),
      this.gatherLowestCoverageFiles(),
    ]);

    const lines: string[] = [];
    if (coverage) lines.push(coverage);
    if (lowestFiles) lines.push(lowestFiles);
    if (lint) lines.push(lint);

    if (lines.length === 0) return '';

    return `\n## Code Health Metrics\n${lines.join('\n')}\n\nPrioritize:\n- If coverage < 80% in any area → prefer TEST\n- If lint warnings > 0 → prefer FIX\n- If both healthy → prefer REFACTOR or SKIP`;
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

    try {
      const summaryPath = path.join(this.projectRoot, 'coverage', 'coverage-summary.json');
      if (!(await fs.pathExists(summaryPath))) {
        return { passed: false, details: 'coverage-summary.json not found' };
      }

      const raw = await fs.readFile(summaryPath, 'utf-8');
      const summary = JSON.parse(raw);
      const total = summary?.total;
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
    } catch {
      return { passed: false, details: 'failed to read coverage data' };
    }
  }

  /**
   * Safely executes a command with execa, catching errors and returning null on failure.
   * Logs errors with context for debugging.
   */
  private async safeExeca(
    command: string,
    args: string[],
    options?: { cwd?: string; reject?: boolean; timeout?: number }
  ): Promise<{ exitCode: number; stdout: string; stderr: string } | null> {
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

    // 1. Read constitution file
    const constitution = await this.readConstitution();

    // 2. AI analyzes, executes, and commits autonomously
    this.log('\n🤖 AI analyzing and evolving...');
    const executed = await this.evolveWithOpenCode(constitution);

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
        durationMs: Date.now() - this.iterationStartTime,
      });
      const shouldStop = this.handleEvolutionFailure('Evolution execution issue');
      return shouldStop ? 'stop' : 'retry';
    }

    // 3. Verify (the only gate)
    this.log('\n🔍 Verifying changes...');
    const verified = await this.verify();

    if (!verified) {
      this.lastIterationResult = {
        iteration: this.iterationCount,
        success: false,
        failureStage: 'verification',
        failureDetail: 'Build, test, or lint checks failed after AI changes',
      };
      await this.writeEvolutionRecord({
        iteration: this.iterationCount,
        timestamp: iterationTimestamp,
        success: false,
        failureStage: 'verification',
        failureDetail: 'Build, test, or lint checks failed after AI changes',
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

    const shouldContinue = await this.handlePostVerificationState(
      isClean,
      hashChanged,
      beforeHashError || afterHashError
    );

    // Gather changed files and decision for iteration context
    const filesChanged = await this.getChangedFilesList(beforeCommitHash, afterCommitHash);
    const decision = hashChanged ? await this.detectDecisionFromCommit() : undefined;

    const durationMs = Date.now() - this.iterationStartTime;
    if (isClean && hashChanged) {
      this.lastIterationResult = {
        iteration: this.iterationCount,
        success: true,
        decision,
        filesChanged,
      };
      await this.writeEvolutionRecord({
        iteration: this.iterationCount,
        timestamp: iterationTimestamp,
        success: true,
        commitHash: afterCommitHash ?? undefined,
        durationMs,
      });
    } else if (isClean && !hashChanged) {
      this.lastIterationResult = {
        iteration: this.iterationCount,
        success: true,
        decision: 'SKIP',
        failureDetail: 'AI made no changes (SKIP)',
      };
      await this.writeEvolutionRecord({
        iteration: this.iterationCount,
        timestamp: iterationTimestamp,
        success: true,
        durationMs,
      });
    } else {
      this.lastIterationResult = {
        iteration: this.iterationCount,
        success: false,
        failureStage: 'commit',
        failureDetail: 'Verification passed but AI did not commit changes properly',
        filesChanged,
      };
      await this.writeEvolutionRecord({
        iteration: this.iterationCount,
        timestamp: iterationTimestamp,
        success: false,
        failureStage: 'commit',
        failureDetail: 'Verification passed but AI did not commit changes properly',
        durationMs,
      });
    }

    return shouldContinue ? 'completed' : 'stop';
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
    if (this.maxDiffLines <= 0) {
      return '';
    }

    return [
      '',
      '## Change Size Limit',
      `Keep changes under ${this.maxDiffLines} lines (insertions + deletions combined).`,
      'One commit = one focused logical change.',
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
    metricsSection?: string
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

    return `${constitution}
## Current Codebase

Source files:
${fileTree}
${metricsSection || ''}## Your Task

Read and analyze the codebase, then decide:

1. FIX - Fix bugs, errors, or broken functionality
2. TEST - Add tests for uncovered code
3. REFACTOR - Simplify complex code
4. FEATURE - Add small, useful new functionality (only if base is solid)
5. SKIP - Codebase is healthy, no changes needed this round

Execute your decision. Make minimal, focused changes.
${fileRestrictionSection}${changeSizeLimitSection}## After Changes

1. **Verify** all pass:
   - npm run build
   - npm test
   - npm run lint
${cliVerifyCommands}

2. **Commit** if verification passes:
   \`\`\`bash
   git add -A
   git commit -m "type: description"
   \`\`\`

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
  private async evolveWithOpenCode(constitution: string): Promise<boolean> {
    const fileTree = await this.getFileTree();
    const metricsSection = await this.gatherCodeHealthMetrics();
    const prompt = this.buildEvolutionPrompt(
      constitution,
      fileTree,
      this.lastIterationResult,
      metricsSection
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
   */
  private async verify(): Promise<boolean> {
    // Check forbidden file changes before running expensive build/test/lint
    const { valid, violations } = await this.validateChangedFiles();
    if (!valid) {
      this.log(`  ❌ Forbidden file changes detected:`);
      for (const v of violations) {
        this.log(`     - ${v}`);
      }
      return false;
    }

    // Check diff size limit
    const { total, withinLimit } = await this.checkDiffSize();
    if (!withinLimit) {
      this.log(`  ❌ Change too large: ${total} lines changed (limit: ${this.maxDiffLines})`);
      return false;
    }

    const runner = this.getCommandRunner();
    const commandChecks = EVOLUTION_VERIFY_COMMANDS.map((cmd) => ({
      name: `${cmd.charAt(0).toUpperCase() + cmd.slice(1)} command`,
      file: runner.file,
      args: [...runner.prefixArgs, cmd, '--help'],
    }));

    // Stage 1: Build (must succeed first to produce dist/ artifacts)
    const buildCheck = { name: 'Build', file: 'npm', args: ['run', 'build'] };
    this.log(`  Checking ${buildCheck.name}...`);
    const buildResult = await this.safeExeca(buildCheck.file, buildCheck.args, {
      timeout: this.verifyTimeoutMs,
    });
    if (!buildResult || buildResult.exitCode !== 0) {
      this.logCheckFailure(buildCheck.name, buildResult);
      return false;
    }
    this.log(`  ✅ ${buildCheck.name} passed`);

    // Stage 2: Tests + Lint (independent, can run in parallel)
    const testArgs = this.coverageBaseline ? ['test', '--', '--coverage'] : ['test'];
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
        return false;
      }
      this.log(`  ✅ ${check.name} passed`);
    }

    // Stage 2.5: Coverage gate (runs after tests generate coverage data)
    if (this.coverageBaseline) {
      this.log(`  Checking coverage baseline...`);
      const { passed, details } = await this.checkCoverageBaseline();
      if (!passed) {
        this.log(`  ❌ Coverage gate failed: ${details}`);
        return false;
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
        return false;
      }
      this.log(`  ✅ ${check.name} passed`);
    }

    return true;
  }

  /**
   * Logs a check failure with error details.
   */
  private logCheckFailure(
    name: string,
    result: { exitCode: number; stdout: string; stderr: string } | null
  ): void {
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
   * Handles post-verification state by checking working tree cleanliness and commit status.
   * @param isClean - Whether the working tree is clean
   * @param hashChanged - Whether the commit hash changed (indicating AI committed)
   * @param hashError - Whether there was an error getting commit hashes
   * @returns true if evolution should continue, false if it should stop
   */
  private async handlePostVerificationState(
    isClean: boolean,
    hashChanged: boolean,
    hashError: boolean
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
    } else {
      this.log('⚠️  Verification passed but AI did not commit changes');
    }
    this.log('🔄 Reverting uncommitted changes...');
    const result = await this.revertOrFailOrResetFailures();
    if (result) {
      this.log('ℹ️  Reset failure counter (verification passed, commit missed)');
    }
    return result;
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
    } catch {
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
    const msg = result.stdout.trim().toLowerCase();
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
