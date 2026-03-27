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
import { formatError } from '../utils/error';
import * as fs from 'fs-extra';
import * as path from 'path';

import { EVOLUTION_VERIFY_COMMANDS } from '../types/evolve';
import type { SelfEvolverOptions } from '../types/evolve';

export type { SelfEvolverOptions };

/** Default sleep duration between iterations in milliseconds */
const DEFAULT_SLEEP_MS = 5000;
/** Default timeout for verification checks in milliseconds */
const VERIFY_TIMEOUT_MS = 60000;
/** Default timeout for OpenCode execution in milliseconds */
const OPENCODE_TIMEOUT_MS = 600000;
/** Default maximum retry attempts on consecutive failures (-1 for unlimited) */
const DEFAULT_MAX_RETRIES = 5;
/** Minimum max listeners for process events */
const MIN_MAX_LISTENERS = 20;

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
    this.setupSignalHandlers();
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
      this.log(`⚠️  ${command} failed: ${formatError(error)}`);
      return null;
    }
  }

  /**
   * Sets up signal handlers for graceful interruption (Ctrl+C, SIGTERM).
   */
  private setupSignalHandlers(): void {
    this.sigintHandler = (): void => {
      this.interrupted = true;
      this.log('\n\n⚠️  Interrupted by user (Ctrl+C)');
    };
    this.sigtermHandler = (): void => {
      this.interrupted = true;
      this.log('\n\n⚠️  Interrupted by SIGTERM');
    };

    // Increase max listeners once to prevent memory leak warnings with multiple handlers
    // This is safe because we're properly cleaning up handlers in cleanup()
    const currentMax = process.getMaxListeners();
    if (currentMax < MIN_MAX_LISTENERS) {
      this.originalMaxListeners = currentMax;
      process.setMaxListeners(MIN_MAX_LISTENERS);
    }

    process.on('SIGINT', this.sigintHandler);
    process.on('SIGTERM', this.sigtermHandler);
  }

  /**
   * Cleans up signal handlers to prevent memory leaks.
   * Should be called when the driver is no longer needed.
   */
  cleanup(): void {
    if (this.cleanedUp) return; // Prevent double-cleanup
    this.cleanedUp = true;
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
    // Restore original max listeners if we changed it
    if (this.originalMaxListeners !== null) {
      process.setMaxListeners(this.originalMaxListeners);
      this.originalMaxListeners = null;
    }
    // Clear any pending sleep timer and resolve the sleep promise
    if (this.sleepTimer) {
      clearTimeout(this.sleepTimer);
      this.sleepTimer = null;
    }
    // Resolve any pending sleep to prevent hanging
    if (this.sleepResolve) {
      this.sleepResolve();
      this.sleepResolve = null;
    }
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
   * Runs the self-evolution loop - continues indefinitely until interrupted by user.
   */
  async run(): Promise<void> {
    // Reset state for potential re-run after cleanup
    this.sleepCancelled = false;

    const preFlightPassed = await this.runPreFlightChecks();
    if (!preFlightPassed) {
      this.cleanup();
      return;
    }

    if (this.dryRun) {
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
      this.cleanup();
      return;
    }

    this.log('🔄 Starting self-evolution...');
    this.log(`📁 Project: ${this.projectRoot}`);
    this.log('💡 Press Ctrl+C to stop\n');

    while (!this.interrupted) {
      this.iterationCount++;
      this.log(`\n📊 Iteration ${this.iterationCount} starting...`);

      // Capture git commit hash before evolution to detect if changes were committed
      const beforeCommitHash = await this.getHeadCommitHash();

      // 1. Read constitution file
      const constitution = await this.readConstitution();

      // 2. AI analyzes, executes, and commits autonomously
      this.log('\n🤖 AI analyzing and evolving...');
      const executed = await this.evolveWithOpenCode(constitution);

      if (!executed) {
        const shouldStop = this.handleEvolutionFailure('Evolution execution issue');
        if (shouldStop) {
          return;
        }
        await this.sleep(this.sleepMs);
        continue;
      }

      // 3. Verify (the only gate)
      this.log('\n🔍 Verifying changes...');
      const verified = await this.verify();

      if (!verified) {
        this.log('❌ Verification failed, reverting...');
        const revertSuccess = await this.revert();
        if (!this.handleRevertFailure(revertSuccess, 'Verification failed')) {
          return;
        }
      } else {
        // Verification passed, check if AI has committed by comparing commit hashes
        const isClean = await this.isWorkingTreeClean();
        const afterCommitHash = await this.getHeadCommitHash();

        // Track hash comparison state - null means we couldn't determine the hash
        const beforeHashError = beforeCommitHash === null;
        const afterHashError = afterCommitHash === null;
        const hashChanged =
          !beforeHashError && !afterHashError && beforeCommitHash !== afterCommitHash;

        const shouldContinue = await this.handlePostVerificationState(
          isClean,
          hashChanged,
          beforeHashError || afterHashError
        );
        if (!shouldContinue) {
          return;
        }
      }

      // Exit after one iteration if --once flag is set
      if (this.once) {
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
    } catch (error) {
      this.log(`⚠️  Could not read EVOLVE.md: ${formatError(error)}`);
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
   * Builds the evolution prompt for OpenCode with constitution and file tree.
   */
  private buildEvolutionPrompt(constitution: string, fileTree: string): string {
    return `${constitution}

## Current Codebase

Source files:
${fileTree}

## Your Task

Read and analyze the codebase, then decide:

1. FIX - Fix bugs, errors, or broken functionality
2. TEST - Add tests for uncovered code
3. REFACTOR - Simplify complex code
4. FEATURE - Add small, useful new functionality (only if base is solid)
5. SKIP - Codebase is healthy, no changes needed this round

Execute your decision. Make minimal, focused changes.

## After Changes

1. **Verify** all pass:
${EVOLUTION_VERIFY_COMMANDS.map((cmd) => `   - npx ts-node src/cli/index.ts ${cmd} --help`).join('\n')}

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

If verification fails, do NOT commit - the system will revert automatically.`;
  }

  /**
   * Invokes OpenCode to apply improvements.
   */
  private async evolveWithOpenCode(constitution: string): Promise<boolean> {
    const fileTree = await this.getFileTree();
    const prompt = this.buildEvolutionPrompt(constitution, fileTree);

    // Check if opencode command is available (reuse isOpenCodeInstalled method)
    const isOpenCodeAvailable = await this.isOpenCodeInstalled();
    if (!isOpenCodeAvailable) {
      this.log('❌ OpenCode is not installed or not in PATH');
      this.log('   Install it with: npm install -g opencode');
      return false;
    }

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
        const stderrPreview = result.stderr.slice(0, 5000);
        this.log(`OpenCode stderr: ${stderrPreview}`);
      }

      if (result.exitCode !== 0) {
        this.log(`⚠️  OpenCode exited with code ${result.exitCode}`);
        return false;
      }

      this.log('✅ OpenCode execution completed');
      return true;
    } catch (error) {
      this.log(`⚠️  OpenCode execution failed: ${formatError(error)}`);
      return false;
    }
  }

  /**
   * Comprehensive verification - includes self-verification.
   * Uses EVOLUTION_VERIFY_COMMANDS to dynamically check all CLI commands.
   * When adding new commands, add them to EVOLUTION_VERIFY_COMMANDS in types/evolve.ts.
   */
  private async verify(): Promise<boolean> {
    // Use ts-node for verification if enabled, otherwise use compiled dist/
    const commandChecks = this.useTsNode
      ? EVOLUTION_VERIFY_COMMANDS.map((cmd) => ({
          name: `${cmd.charAt(0).toUpperCase() + cmd.slice(1)} command`,
          file: 'npx',
          args: ['ts-node', 'src/cli/index.ts', cmd, '--help'],
        }))
      : EVOLUTION_VERIFY_COMMANDS.map((cmd) => ({
          name: `${cmd.charAt(0).toUpperCase() + cmd.slice(1)} command`,
          file: 'node',
          args: ['dist/cli/index.js', cmd, '--help'],
        }));

    const checks: Array<{ name: string; file: string; args: string[] }> = [
      { name: 'Build', file: 'npm', args: ['run', 'build'] },
      { name: 'Tests', file: 'npm', args: ['test'] },
      { name: 'Lint', file: 'npm', args: ['run', 'lint'] },
      ...commandChecks,
    ];

    for (const check of checks) {
      this.log(`  Checking ${check.name}...`);
      const result = await this.safeExeca(check.file, check.args, {
        timeout: this.verifyTimeoutMs,
      });

      if (!result || result.exitCode !== 0) {
        this.log(`  ❌ ${check.name} failed`);
        // Show error output for debugging
        if (result?.stderr) {
          const stderrPreview = result.stderr.slice(0, 2000);
          this.log(`     Error: ${stderrPreview}`);
        }
        if (result?.stdout) {
          const stdoutPreview = result.stdout.slice(0, 2000);
          if (stdoutPreview) {
            this.log(`     Output: ${stdoutPreview}`);
          }
        }
        return false;
      }
      this.log(`  ✅ ${check.name} passed`);
    }

    return true;
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
      const revertSuccess = await this.revert();
      if (!this.handleRevertFailure(revertSuccess, 'Uncommitted changes (hash error)')) {
        return false;
      }
      return true;
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

    // Not clean = changes made but not committed
    this.log('⚠️  Verification passed but AI did not commit changes');
    this.log('🔄 Reverting uncommitted changes...');
    const revertSuccess = await this.revert();
    if (!this.handleRevertFailure(revertSuccess, 'Uncommitted changes after verification')) {
      return false;
    }
    return true;
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
    const cleanResult = await this.safeExeca('git', ['clean', '-fd']);
    if (!cleanResult || cleanResult.exitCode !== 0) {
      this.log('⚠️  Git clean failed');
      return false;
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
  } {
    return {
      interrupted: this.interrupted,
      cleanedUp: this.cleanedUp,
      projectRoot: this.projectRoot,
      dryRun: this.dryRun,
      once: this.once,
      consecutiveFailures: this.consecutiveFailures,
    };
  }
}

/**
 * Convenience function to run the self-evolution process.
 * @param options - Optional configuration for the self-evolution process
 */
export async function runSelfEvolution(options?: SelfEvolverOptions): Promise<void> {
  const driver = new SelfDriver(options);
  await driver.run();
}
