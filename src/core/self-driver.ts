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
import { Logger } from '../utils/logger';
import { formatError } from '../utils/error';
import * as fs from 'fs-extra';
import * as path from 'path';

import { EVOLUTION_VERIFY_COMMANDS } from '../types/evolve';
import type { SelfEvolverOptions } from '../types/evolve';

export type { SelfEvolverOptions };

/**
 * Self-driving evolution engine for ubuild.
 *
 * Continuously analyzes the codebase and applies changes
 * through an automated loop. Runs indefinitely until
 * interrupted by the user (Ctrl+C).
 */
/** Default sleep duration between iterations in milliseconds */
const DEFAULT_SLEEP_MS = 5000;
/** Default timeout for verification checks in milliseconds */
const VERIFY_TIMEOUT_MS = 60000;
/** Default timeout for OpenCode execution in milliseconds */
const OPENCODE_TIMEOUT_MS = 600000;
/** Minimum max listeners for process events */
const MIN_MAX_LISTENERS = 20;

export class SelfDriver {
  private log: (msg: string) => void;
  private projectRoot: string;
  private interrupted = false;
  private once: boolean;
  private dryRun: boolean;
  private sigintHandler: (() => void) | null = null;
  private sigtermHandler: (() => void) | null = null;
  private originalMaxListeners: number | null = null;
  private sleepTimer: NodeJS.Timeout | null = null;

  /**
   * Creates a new SelfDriver instance.
   * @param options - Configuration options for the evolution process
   */
  constructor(options: SelfEvolverOptions = {}) {
    this.log = options.logger || ((msg: string) => Logger.info(msg));
    this.projectRoot = process.cwd();
    this.once = options.once || false;
    this.dryRun = options.dryRun || false;
    this.setupSignalHandlers();
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
    // Clear any pending sleep timer
    if (this.sleepTimer) {
      clearTimeout(this.sleepTimer);
      this.sleepTimer = null;
    }
  }

  /**
   * Checks if current directory is a git repository.
   */
  private async isGitRepository(): Promise<boolean> {
    try {
      const result = await execa('git', ['rev-parse', '--git-dir'], {
        cwd: this.projectRoot,
        reject: false,
      });
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  /**
   * Runs the self-evolution loop - continues indefinitely until interrupted by user.
   */
  async run(): Promise<void> {
    // Pre-flight check: must be in a git repository
    const isGitRepo = await this.isGitRepository();
    if (!isGitRepo) {
      this.log('❌ Error: Not a git repository');
      this.log('   Self-evolution requires a git repository to track and revert changes.');
      this.log(`   Current directory: ${this.projectRoot}`);
      this.cleanup();
      return;
    }

    // Pre-flight check: working tree must be clean to prevent data loss
    const isClean = await this.isWorkingTreeClean();
    if (!isClean) {
      this.log('❌ Error: Working tree has uncommitted changes');
      this.log('   Self-evolution may revert changes using `git checkout .`');
      this.log('   Commit or stash your changes before running evolve.');
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
        this.log('  Would loop every 5 seconds');
      }
      this.log('\n✨ Dry run complete - no changes made');
      this.cleanup();
      return;
    }

    this.log('🔄 Starting self-evolution...');
    this.log(`📁 Project: ${this.projectRoot}`);
    this.log('💡 Press Ctrl+C to stop\n');

    while (!this.interrupted) {
      // 1. Read constitution file
      const constitution = await this.readConstitution();

      // 2. AI analyzes, executes, and commits autonomously
      this.log('\n🤖 AI analyzing and evolving...');
      const executed = await this.evolveWithOpenCode(constitution);

      if (!executed) {
        this.log('⚠️  Evolution execution issue, retrying next iteration...');
        await this.sleep(DEFAULT_SLEEP_MS);
        continue;
      }

      // 3. Verify (the only gate)
      this.log('\n🔍 Verifying changes...');
      const verified = await this.verify();

      if (!verified) {
        this.log('❌ Verification failed, reverting...');
        await this.revert();
      } else {
        // Verification passed, check if AI has committed
        const isClean = await this.isWorkingTreeClean();
        if (isClean) {
          this.log('✅ Changes committed by AI');
        } else {
          this.log('⚠️  Working tree not clean after verification - AI should have committed');
          this.log('🔄 Reverting...');
          await this.revert();
        }
      }

      // Exit after one iteration if --once flag is set
      if (this.once) {
        this.log('\n✨ Single iteration complete (--once flag set)');
        this.cleanup();
        return;
      }

      this.log(`\n💤 Waiting ${DEFAULT_SLEEP_MS / 1000}s before next iteration...`);
      await this.sleep(DEFAULT_SLEEP_MS);
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
   * Gets the source file tree for context.
   */
  private async getFileTree(): Promise<string> {
    try {
      const result = await execa('git', ['ls-files', 'src/'], {
        cwd: this.projectRoot,
        reject: false,
      });

      if (!result || result.exitCode !== 0) {
        this.log(`⚠️  Failed to get file tree: ${result?.stderr || 'git ls-files failed'}`);
        return 'src/ directory';
      }

      return result.stdout || 'src/ directory';
    } catch (error) {
      this.log(`⚠️  Error getting file tree: ${formatError(error)}`);
      return 'src/ directory';
    }
  }

  /**
   * Invokes OpenCode to apply improvements.
   */
  private async evolveWithOpenCode(constitution: string): Promise<boolean> {
    const fileTree = await this.getFileTree();

    const prompt = `${constitution}

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
   - npm run build
   - npm test
   - npm run lint
   - npx ts-node src/cli/index.ts evolve --help
   - npx ts-node src/cli/index.ts list --help

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

    // Check if opencode command is available
    try {
      await execa('opencode', ['--version'], { cwd: this.projectRoot });
    } catch {
      this.log('❌ OpenCode is not installed or not in PATH');
      this.log('   Install it with: npm install -g opencode');
      return false;
    }

    try {
      this.log('🚀 Executing OpenCode...');

      const result = await execa('opencode', ['run', prompt], {
        cwd: this.projectRoot,
        stdio: 'inherit',
        reject: false,
        timeout: OPENCODE_TIMEOUT_MS, // 10 minutes timeout to prevent indefinite hangs
      });

      if (!result || result.exitCode !== 0) {
        this.log(`⚠️  OpenCode exited with code ${result?.exitCode ?? 'unknown'}`);
        return false;
      }

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
    const checks: Array<{ name: string; file: string; args: string[] }> = [
      { name: 'Build', file: 'npm', args: ['run', 'build'] },
      { name: 'Tests', file: 'npm', args: ['test'] },
      { name: 'Lint', file: 'npm', args: ['run', 'lint'] },
      // Dynamically generate command checks from EVOLUTION_VERIFY_COMMANDS
      // Use ts-node with source file to match the AI prompt expectations
      ...EVOLUTION_VERIFY_COMMANDS.map((cmd) => ({
        name: `${cmd.charAt(0).toUpperCase() + cmd.slice(1)} command`,
        file: 'npx',
        args: ['ts-node', 'src/cli/index.ts', cmd, '--help'],
      })),
    ];

    for (const check of checks) {
      try {
        this.log(`  Checking ${check.name}...`);
        const result = await execa(check.file, check.args, {
          cwd: this.projectRoot,
          reject: false,
          timeout: VERIFY_TIMEOUT_MS,
        });

        if (!result || result.exitCode !== 0) {
          this.log(`  ❌ ${check.name} failed`);
          return false;
        }
        this.log(`  ✅ ${check.name} passed`);
      } catch (error) {
        this.log(`  ❌ ${check.name} error: ${formatError(error)}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Checks if working tree is clean (all changes committed).
   */
  private async isWorkingTreeClean(): Promise<boolean> {
    try {
      const status = await execa('git', ['status', '--porcelain'], {
        cwd: this.projectRoot,
        reject: false,
      });
      return status.stdout.trim().length === 0;
    } catch (error) {
      this.log(`⚠️  Git status check failed: ${formatError(error)}`);
      return false;
    }
  }

  /**
   * Reverts changes.
   */
  private async revert(): Promise<void> {
    try {
      await execa('git', ['checkout', '.'], { cwd: this.projectRoot });
      this.log('🔄 Reverted changes');
    } catch (error) {
      this.log(`⚠️  Revert failed: ${formatError(error)}`);
    }
  }

  /**
   * Sleeps for the specified duration.
   * Clears the timer if interrupted to prevent memory leaks.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.sleepTimer = setTimeout(() => {
        this.sleepTimer = null;
        resolve();
      }, ms);
    });
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
