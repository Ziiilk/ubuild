import { execa } from 'execa';
import { Logger } from '../utils/logger';

export interface SelfEvolverOptions {
  interval?: number;
  apiKey?: string;
  model?: string;
  logger?: (msg: string) => void;
}

export interface Diagnosis {
  testFailures: string[];
  lintErrors: string[];
  timestamp: string;
}

export interface EvolutionResult {
  success: boolean;
  iterations: number;
  improvements: string[];
  errors: string[];
}

export class SelfDriver {
  private interval: number;
  private apiKey?: string;
  private model: string;
  private log: (msg: string) => void;
  private projectRoot: string;
  private iterationCount = 0;
  private improvementCount = 0;

  constructor(options: SelfEvolverOptions = {}) {
    this.interval = options.interval || 5000; // 失败后等待5秒
    this.apiKey = options.apiKey;
    this.model = options.model || '';
    this.log = options.logger || ((msg: string) => Logger.info(msg));
    this.projectRoot = process.cwd();
  }

  /**
   * 运行自进化循环 - 无限循环，直到用户中断
   * 失败则重试，成功则提交，永不停止
   */
  async run(): Promise<EvolutionResult> {
    this.log('🔄 Starting self-evolution...');
    this.log(`📁 Project: ${this.projectRoot}`);
    this.log('💡 Press Ctrl+C to stop\n');
    this.log('═══════════════════════════════════════');

    const improvements: string[] = [];
    const errors: string[] = [];

    // 无限循环，直到用户中断
    while (true) {
      this.iterationCount++;

      // 检查用户是否中断
      if (this.isInterrupted()) {
        this.log('\n\n⚠️  Evolution stopped by user');
        break;
      }

      this.log(`\n📍 Iteration ${this.iterationCount}`);
      this.log('───────────────────────────────────────');

      // Step 1: 诊断当前状态
      const diagnosis = await this.diagnose();
      const hasIssues = diagnosis.testFailures.length > 0 || diagnosis.lintErrors.length > 0;

      if (hasIssues) {
        this.log('📊 Issues found:');
        diagnosis.testFailures.forEach((f) => this.log(`  ❌ Test: ${f}`));
        diagnosis.lintErrors.forEach((e) => this.log(`  ⚠️  Lint: ${e}`));
      } else {
        this.log('✅ No issues found, seeking improvements...');
      }

      // Step 2: 调用 OpenCode 进行改进
      this.log('\n🤖 Asking OpenCode for improvements...');
      const executed = await this.evolveWithOpenCode(diagnosis);

      if (!executed) {
        this.log('❌ OpenCode execution failed, retrying next iteration...');
        await this.sleep(this.interval);
        continue; // 直接进入下一轮
      }

      // Step 3: 验证
      const verified = await this.verify();

      if (verified) {
        // 检查是否有实际改动
        const hasChanges = await this.hasChanges();

        if (hasChanges) {
          this.log('✅ Verified: all tests pass, lint clean');

          // Step 4: 提交 (不 push)
          const commitMsg = this.generateCommitMessage(diagnosis);
          await this.commit(commitMsg);
          improvements.push(commitMsg);
          this.improvementCount++;

          this.log(`\n📈 Total improvements: ${this.improvementCount}`);
        } else {
          this.log('ℹ️  No changes made this iteration');
        }
      } else {
        this.log('❌ Verification failed, reverting and retrying...');
        await this.revert();
      }

      // 短暂等待后继续下一轮
      this.log(`\n💤 Waiting 5s before next iteration...`);
      await this.sleep(this.interval);
    }

    this.log(`\n✨ Evolution stopped`);
    this.log(`📊 Total iterations: ${this.iterationCount}`);
    this.log(`📊 Total improvements: ${improvements.length}`);

    return {
      success: improvements.length > 0,
      iterations: this.iterationCount,
      improvements,
      errors,
    };
  }

  /**
   * 检查是否被用户中断
   */
  private isInterrupted(): boolean {
    // 检查是否收到 SIGINT 信号
    // 在实际运行时，用户按 Ctrl+C 会触发
    return false; // 让循环自然继续
  }

  /**
   * 诊断当前问题
   */
  private async diagnose(): Promise<Diagnosis> {
    const diagnosis: Diagnosis = {
      testFailures: [],
      lintErrors: [],
      timestamp: new Date().toISOString(),
    };

    // 运行测试
    try {
      const testResult = await execa('npm', ['test'], {
        cwd: this.projectRoot,
        reject: false,
      });

      if (testResult.exitCode !== 0) {
        const output = testResult.stdout + testResult.stderr;
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.includes('FAIL') || line.includes('✕') || line.includes('failed')) {
            const match = line.match(/(\S+\.test\.ts)/);
            if (match) {
              diagnosis.testFailures.push(match[1]);
            }
          }
        }
      }
    } catch (error) {
      diagnosis.testFailures.push(
        `Test execution failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // 运行 lint
    try {
      const lintResult = await execa('npm', ['run', 'lint'], {
        cwd: this.projectRoot,
        reject: false,
      });

      if (lintResult.exitCode !== 0) {
        const output = lintResult.stdout + lintResult.stderr;
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.includes('error') && !line.includes('warning')) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('>') && !trimmed.includes('MODULE_TYPELESS')) {
              diagnosis.lintErrors.push(trimmed.substring(0, 150));
            }
          }
        }
      }
    } catch (error) {
      diagnosis.lintErrors.push(
        `Lint execution failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return diagnosis;
  }

  /**
   * 调用 OpenCode 进行改进
   */
  private async evolveWithOpenCode(diagnosis: Diagnosis): Promise<boolean> {
    const prompt = this.buildPrompt(diagnosis);

    try {
      const args: string[] = ['run'];

      if (this.apiKey) {
        args.push('--api-key', this.apiKey);
      }

      if (this.model) {
        args.push('--model', this.model);
      }

      args.push(prompt);

      this.log('🤖 Executing OpenCode...');

      const result = await execa('opencode', args, {
        cwd: this.projectRoot,
        stdio: 'inherit',
        env: this.buildEnv(),
      });

      return result.exitCode === 0;
    } catch (error) {
      this.log(`⚠️  OpenCode exited: ${error instanceof Error ? error.message : String(error)}`);
      return true; // 让验证阶段判断
    }
  }

  /**
   * 构建环境变量
   */
  private buildEnv(): Record<string, string> {
    const env: Record<string, string> = {};

    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        env[key] = value;
      }
    }

    if (this.model) {
      env.OPENCODE_MODEL = this.model;
    }

    return env;
  }

  /**
   * 构建发送给 OpenCode 的 prompt
   */
  private buildPrompt(diagnosis: Diagnosis): string {
    const issues: string[] = [];

    if (diagnosis.testFailures.length > 0) {
      issues.push('Current test failures:');
      diagnosis.testFailures.forEach((f) => issues.push(`  - ${f}`));
    }

    if (diagnosis.lintErrors.length > 0) {
      issues.push('Current lint errors:');
      diagnosis.lintErrors.forEach((e) => issues.push(`  - ${e}`));
    }

    const issueSection = issues.length > 0 ? issues.join('\n') : 'No current issues found.';

    return `You are an expert software engineer helping to evolve this ubuild project.

## Current Project Status
${issueSection}

## Your Task
1. Analyze the codebase thoroughly
2. Look for improvements: code quality, type safety, test coverage, architecture, dead code, etc.
3. If there are issues, fix them
4. If there are no issues, find and implement at least one improvement
5. After making changes, run 'npm test' to verify all tests pass
6. Run 'npm run lint' to verify no lint errors
7. Do NOT commit - just fix/improve the code

## Constraints
- Do NOT use 'as any' or '@ts-ignore' to suppress errors
- Fix root causes, not symptoms
- Maintain existing code style and architecture

Your goal: Make meaningful improvements. If no issues, find at least one improvement to make.`;
  }

  /**
   * 验证修复是否成功
   */
  private async verify(): Promise<boolean> {
    try {
      const testResult = await execa('npm', ['test'], {
        cwd: this.projectRoot,
        reject: false,
      });

      if (testResult.exitCode !== 0) {
        this.log(`❌ Tests failed`);
        return false;
      }

      const lintResult = await execa('npm', ['run', 'lint'], {
        cwd: this.projectRoot,
        reject: false,
      });

      if (lintResult.exitCode !== 0) {
        this.log(`❌ Lint failed`);
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * 检查是否有未提交的更改
   */
  private async hasChanges(): Promise<boolean> {
    try {
      const status = await execa('git', ['status', '--porcelain'], {
        cwd: this.projectRoot,
        reject: false,
      });
      return status.stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * 提交更改 (不 push)
   */
  private async commit(message: string): Promise<void> {
    try {
      const status = await execa('git', ['status', '--porcelain'], {
        cwd: this.projectRoot,
        reject: false,
      });

      if (!status.stdout.trim()) {
        this.log('⚠️  No changes to commit');
        return;
      }

      await execa('git', ['add', '-A'], { cwd: this.projectRoot });

      await execa('git', ['commit', '-m', message], {
        cwd: this.projectRoot,
        reject: false,
      });

      this.log(`📝 Committed: ${message}`);
    } catch (error) {
      this.log(`⚠️  Commit failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 回滚更改
   */
  private async revert(): Promise<void> {
    try {
      await execa('git', ['checkout', '.'], { cwd: this.projectRoot });
      this.log('🔄 Reverted changes');
    } catch (error) {
      this.log(`⚠️  Revert failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 生成提交消息
   */
  private generateCommitMessage(diagnosis: Diagnosis): string {
    const parts: string[] = [];

    if (diagnosis.testFailures.length > 0) {
      parts.push(`fix: ${diagnosis.testFailures.length} test failure(s)`);
    }

    if (diagnosis.lintErrors.length > 0) {
      parts.push(`fix: ${diagnosis.lintErrors.length} lint error(s)`);
    }

    if (parts.length === 0) {
      parts.push('refactor: improve code quality');
    }

    return parts.join(', ');
  }

  /**
   * 休眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * 便捷函数：运行自进化
 */
export async function runSelfEvolution(options?: SelfEvolverOptions): Promise<EvolutionResult> {
  const driver = new SelfDriver(options);
  return driver.run();
}
