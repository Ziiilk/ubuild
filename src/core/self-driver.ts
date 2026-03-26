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

  /**
   * Creates a new SelfDriver instance.
   * @param options - Configuration options for the evolution process
   */
  constructor(options: SelfEvolverOptions = {}) {
    this.log = options.logger || ((msg: string) => Logger.info(msg));
    this.projectRoot = process.cwd();
    this.setupSignalHandlers();
  }

  /**
   * Sets up signal handlers for graceful interruption (Ctrl+C, SIGTERM).
   */
  private setupSignalHandlers(): void {
    const sigintHandler = (): void => {
      this.interrupted = true;
      this.log('\n\n⚠️  Interrupted by user (Ctrl+C)');
    };

    process.setMaxListeners(20);
    process.on('SIGINT', sigintHandler);
    process.on('SIGTERM', sigintHandler);
  }

  /**
   * Runs the self-evolution loop - continues indefinitely until interrupted by user.
   */
  async run(): Promise<void> {
    this.log('🔄 Starting self-evolution...');
    this.log(`📁 Project: ${this.projectRoot}`);
    this.log('💡 Press Ctrl+C to stop\n');

    while (!this.interrupted) {
      // 1. 读取宪法文件
      const constitution = await this.readConstitution();

      // 2. AI 自主分析 & 执行
      this.log('\n🤖 AI analyzing and evolving...');
      const executed = await this.evolveWithOpenCode(constitution);

      if (!executed) {
        this.log('⚠️  Evolution execution issue, retrying next iteration...');
        await this.sleep(5000);
        continue;
      }

      // 3. 验证（唯一关卡）
      this.log('\n🔍 Verifying changes...');
      const verified = await this.verify();

      if (verified && (await this.hasChanges())) {
        this.log('✅ Verification passed, committing...');
        await this.commit('evolve: auto-improvement');
      } else if (!verified) {
        this.log('❌ Verification failed, reverting...');
        await this.revert();
      } else {
        this.log('ℹ️  No changes made');
      }

      this.log('\n💤 Waiting 5s before next iteration...');
      await this.sleep(5000);
    }

    this.log('\n✨ Evolution stopped');
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
      return result.stdout || 'src/ directory';
    } catch {
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

Verify all pass:
- npm run build
- npm test
- npm run lint
- npx ts-node src/cli/index.ts evolve --help
- npx ts-node src/cli/index.ts list --help

Do NOT commit - just implement and verify.`;

    try {
      this.log('🚀 Executing OpenCode...');

      const result = await execa('opencode', ['run', prompt], {
        cwd: this.projectRoot,
        stdio: 'inherit',
        reject: false,
      });

      return result.exitCode === 0;
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
        name: 'Core command',
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
   * Checks if there are uncommitted changes.
   */
  private async hasChanges(): Promise<boolean> {
    try {
      const status = await execa('git', ['status', '--porcelain'], {
        cwd: this.projectRoot,
        reject: false,
      });
      return status.stdout.trim().length > 0;
    } catch (error) {
      this.log(`⚠️  Git status check failed: ${formatError(error)}`);
      return false;
    }
  }

  /**
   * Commits changes.
   */
  private async commit(message: string): Promise<void> {
    try {
      await execa('git', ['add', '-A'], { cwd: this.projectRoot });
      await execa('git', ['commit', '-m', message], {
        cwd: this.projectRoot,
        reject: false,
      });
      this.log(`📝 Committed: ${message}`);
    } catch (error) {
      this.log(`⚠️  Commit failed: ${formatError(error)}`);
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
