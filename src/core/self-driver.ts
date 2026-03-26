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

/** Options for configuring the self-evolution driver. */
export interface SelfEvolverOptions {
  /** Custom logger function for evolution output */
  logger?: (msg: string) => void;
  /** Run only one iteration and exit (default: false - run forever) */
  once?: boolean;
  /** Show what would be done without actually executing */
  dryRun?: boolean;
}

/**
 * Self-driving evolution engine for ubuild.
 *
 * Continuously analyzes the codebase and applies changes
 * through an automated loop. Runs indefinitely until
 * interrupted by the user (Ctrl+C).
 */
export class SelfDriver {
  private log: (msg: string) => void;
  private projectRoot: string;
  private interrupted = false;
  private once: boolean;
  private dryRun: boolean;
  private sigintHandler: (() => void) | null = null;
  private sigtermHandler: (() => void) | null = null;

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
    if (currentMax < 20) {
      process.setMaxListeners(20);
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
  }

  /**
   * Runs the self-evolution loop - continues indefinitely until interrupted by user.
   */
  async run(): Promise<void> {
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
        await this.sleep(5000);
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

      this.log('\n💤 Waiting 5s before next iteration...');
      await this.sleep(5000);
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

      if (result.exitCode !== 0) {
        this.log(`⚠️  Failed to get file tree: ${result.stderr || 'git ls-files failed'}`);
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
        timeout: 600000, // 10 minutes timeout to prevent indefinite hangs
      });

      if (result.exitCode !== 0) {
        this.log(`⚠️  OpenCode exited with code ${result.exitCode}`);
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
   */
  private async verify(): Promise<boolean> {
    const checks: Array<{ name: string; file: string; args: string[] }> = [
      { name: 'Build', file: 'npm', args: ['run', 'build'] },
      { name: 'Tests', file: 'npm', args: ['test'] },
      { name: 'Lint', file: 'npm', args: ['run', 'lint'] },
      {
        name: 'Evolve command',
        file: 'npx',
        args: ['ts-node', 'src/cli/index.ts', 'evolve', '--help'],
      },
      {
        name: 'List command',
        file: 'npx',
        args: ['ts-node', 'src/cli/index.ts', 'list', '--help'],
      },
    ];

    for (const check of checks) {
      try {
        this.log(`  Checking ${check.name}...`);
        const result = await execa(check.file, check.args, {
          cwd: this.projectRoot,
          reject: false,
          timeout: 60000,
        });

        if (result.exitCode !== 0) {
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
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
