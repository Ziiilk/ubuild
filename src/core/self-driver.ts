/**
 * Self-driving evolution engine for ubuild.
 *
 * Automated codebase improvement system that continuously diagnoses health,
 * generates improvement suggestions, and applies changes through OpenCode.
 * Runs in an infinite loop until interrupted by user.
 *
 * @module core/self-driver
 */

import { execa } from 'execa';
import { Logger } from '../utils/logger';

/** Options for configuring the self-evolution driver. */
export interface SelfEvolverOptions {
  /** Interval in milliseconds between evolution iterations (default: 5000) */
  interval?: number;
  /** API key for external AI services */
  apiKey?: string;
  /** AI model identifier to use for evolution */
  model?: string;
  /** Custom logger function for evolution output */
  logger?: (msg: string) => void;
}

/** Diagnosis of the current codebase health state. */
export interface Diagnosis {
  /** List of test file names that failed */
  testFailures: string[];
  /** List of lint error messages found */
  lintErrors: string[];
  /** ISO timestamp when the diagnosis was performed */
  timestamp: string;
}

/** Result of verifying the codebase health and functionality. */
export interface VerificationResult {
  /** Whether all verification checks passed */
  success: boolean;
  /** Whether the build completed successfully */
  buildSucceeds: boolean;
  /** Whether all tests passed */
  testsPass: boolean;
  /** Whether linting found no errors */
  lintClean: boolean;
  /** Whether the evolve command is functional */
  evolveFunctional: boolean;
  /** Whether core CLI commands work correctly */
  coreCommandsWork: boolean;
  /** List of error messages from failed checks */
  errors: string[];
}

/** Suggestion for code evolution with priority and effort estimation. */
export interface EvolutionSuggestion {
  /** Priority level: critical (must fix), high, medium, or low */
  priority: 'critical' | 'high' | 'medium' | 'low';
  /** Category of improvement: fix, test, docs, refactor, or feature */
  category: 'fix' | 'test' | 'docs' | 'refactor' | 'feature';
  /** Human-readable description of the suggested change */
  description: string;
  /** Explanation of why this change is recommended */
  reason: string;
  /** Estimated effort required: small, medium, or large */
  estimatedEffort: 'small' | 'medium' | 'large';
}

/** Result of the self-evolution process. */
export interface EvolutionResult {
  /** Whether the evolution process succeeded */
  success: boolean;
  /** Total number of iterations performed */
  iterations: number;
  /** List of improvement commit messages made */
  improvements: string[];
  /** List of errors encountered during evolution */
  errors: string[];
}

/**
 * Self-driving evolution engine for ubuild.
 *
 * Continuously analyzes the codebase health, identifies improvements,
 * and applies changes through an automated loop. Runs indefinitely
 * until interrupted by the user (Ctrl+C).
 *
 * The evolution process follows a conservative strategy:
 * 1. Diagnose - Check tests, lint, and build status
 * 2. Analyze - Generate improvement suggestions based on diagnosis
 * 3. Verify - Validate the codebase state
 * 4. Evolve - Apply improvements using OpenCode
 */
export class SelfDriver {
  private interval: number;
  private apiKey?: string;
  private model: string;
  private log: (msg: string) => void;
  private projectRoot: string;
  private iterationCount = 0;
  private improvementCount = 0;
  private interrupted = false;
  private signalHandlers: Array<() => void> = [];

  /**
   * Creates a new SelfDriver instance.
   * @param options - Configuration options for the evolution process
   */
  constructor(options: SelfEvolverOptions = {}) {
    this.interval = options.interval || 5000;
    this.apiKey = options.apiKey;
    this.model = options.model || '';
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

    const sigtermHandler = (): void => {
      this.interrupted = true;
      this.log('\n\n⚠️  Termination signal received');
    };

    process.setMaxListeners(100);
    process.on('SIGINT', sigintHandler);
    process.on('SIGTERM', sigtermHandler);

    this.signalHandlers.push(() => process.removeListener('SIGINT', sigintHandler));
    this.signalHandlers.push(() => process.removeListener('SIGTERM', sigtermHandler));
  }

  /**
   * Cleans up signal handlers to prevent memory leaks.
   */
  private cleanupSignalHandlers(): void {
    for (const cleanup of this.signalHandlers) {
      cleanup();
    }
    this.signalHandlers = [];
  }

  /**
   * Runs the self-evolution loop - continues indefinitely until interrupted by user.
   * Retries on failure, commits on success, never stops.
   */
  async run(): Promise<EvolutionResult> {
    this.log('🔄 Starting self-evolution...');
    this.log(`📁 Project: ${this.projectRoot}`);
    this.log('💡 Press Ctrl+C to stop\n');
    this.log('═══════════════════════════════════════');

    const improvements: string[] = [];
    const errors: string[] = [];

    while (true) {
      this.iterationCount++;

      if (this.isInterrupted()) {
        this.log('\n\n⚠️  Evolution stopped by user');
        break;
      }

      this.log(`\n📍 Iteration ${this.iterationCount}`);
      this.log('───────────────────────────────────────');

      // Step 1: 全面诊断
      const diagnosis = await this.diagnose();
      const suggestions = await this.analyzeEvolutionSuggestions(diagnosis);

      this.logDiagnosis(diagnosis, suggestions);

      // Step 2: 调用 OpenCode 进行改进
      this.log('\n🤖 Asking OpenCode for improvements...');
      const executed = await this.evolveWithOpenCode(diagnosis, suggestions);

      if (!executed) {
        this.log('❌ OpenCode execution failed, retrying next iteration...');
        await this.sleep(this.interval);
        continue;
      }

      // Step 3: 全面验证（包含自我验证）
      const verification = await this.verify();

      if (verification.success) {
        const hasChanges = await this.hasChanges();

        if (hasChanges) {
          this.log('✅ Verified: all quality gates pass');

          const commitMsg = this.generateCommitMessage(diagnosis, suggestions);
          await this.commit(commitMsg);
          improvements.push(commitMsg);
          this.improvementCount++;

          this.log(`\n📈 Total improvements: ${this.improvementCount}`);
        } else {
          this.log('ℹ️  No changes made this iteration');
        }
      } else {
        this.log('❌ Verification failed, reverting and retrying...');
        this.log(`   Errors: ${verification.errors.join(', ')}`);
        await this.revert();
      }

      this.log(`\n💤 Waiting 5s before next iteration...`);
      await this.sleep(this.interval);
    }

    this.cleanupSignalHandlers();

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
   * Checks if the process has been interrupted by the user.
   */
  private isInterrupted(): boolean {
    return this.interrupted;
  }

  /**
   * Diagnoses current codebase health issues.
   */
  private async diagnose(): Promise<Diagnosis> {
    const diagnosis: Diagnosis = {
      testFailures: [],
      lintErrors: [],
      timestamp: new Date().toISOString(),
    };

    // Run tests
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

    // Run lint
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
   * Analyzes codebase health and generates conservative evolution suggestions.
   * Dynamically generates suggestions based on code health without relying on external roadmaps.
   */
  private async analyzeEvolutionSuggestions(diagnosis: Diagnosis): Promise<EvolutionSuggestion[]> {
    const suggestions: EvolutionSuggestion[] = [];

    // 1. Highest priority: fix existing issues
    if (diagnosis.testFailures.length > 0) {
      suggestions.push({
        priority: 'critical',
        category: 'fix',
        description: `Fix ${diagnosis.testFailures.length} test failure(s)`,
        reason: 'Broken tests indicate regressions or bugs',
        estimatedEffort: 'medium',
      });
    }

    if (diagnosis.lintErrors.length > 0) {
      suggestions.push({
        priority: 'critical',
        category: 'fix',
        description: `Fix ${diagnosis.lintErrors.length} lint error(s)`,
        reason: 'Lint errors may indicate type safety or style issues',
        estimatedEffort: 'small',
      });
    }

    // 2. Check build health
    try {
      const buildResult = await execa('npm', ['run', 'build'], {
        cwd: this.projectRoot,
        reject: false,
      });

      if (buildResult.exitCode !== 0) {
        suggestions.push({
          priority: 'critical',
          category: 'fix',
          description: 'Fix TypeScript compilation errors',
          reason: 'Project does not build successfully',
          estimatedEffort: 'medium',
        });
      }
    } catch {
      suggestions.push({
        priority: 'critical',
        category: 'fix',
        description: 'Fix build configuration issues',
        reason: 'Build command failed to execute',
        estimatedEffort: 'small',
      });
    }

    // 3. 检查自我进化能力
    try {
      const evolveCheck = await execa('npx', ['ts-node', 'src/cli/index.ts', 'evolve', '--help'], {
        cwd: this.projectRoot,
        reject: false,
        timeout: 30000,
      });

      if (evolveCheck.exitCode !== 0) {
        suggestions.push({
          priority: 'critical',
          category: 'fix',
          description: 'Fix self-evolution command functionality',
          reason: 'Evolve command is broken - core feature compromised',
          estimatedEffort: 'medium',
        });
      }
    } catch {
      suggestions.push({
        priority: 'critical',
        category: 'fix',
        description: 'Restore evolve command functionality',
        reason: 'Evolve command cannot be executed',
        estimatedEffort: 'large',
      });
    }

    // 4. 检查核心命令可用性
    const coreCommands = ['list', 'build', 'engine'];
    for (const cmd of coreCommands) {
      try {
        const result = await execa('npx', ['ts-node', 'src/cli/index.ts', cmd, '--help'], {
          cwd: this.projectRoot,
          reject: false,
          timeout: 10000,
        });

        if (result.exitCode !== 0) {
          suggestions.push({
            priority: 'high',
            category: 'fix',
            description: `Fix '${cmd}' command functionality`,
            reason: `Core command '${cmd}' is not working`,
            estimatedEffort: 'medium',
          });
        }
      } catch {
        suggestions.push({
          priority: 'high',
          category: 'fix',
          description: `Restore '${cmd}' command`,
          reason: `Core command '${cmd}' execution failed`,
          estimatedEffort: 'medium',
        });
      }
    }

    // 注意：不再生成硬编码建议。当没有严重问题时，AI将自主分析代码库
    // 并基于实际代码状态决定改进方向（包括fix/test/docs/refactor/feature）

    return suggestions.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Logs the diagnosis results.
   */
  private logDiagnosis(diagnosis: Diagnosis, suggestions: EvolutionSuggestion[]): void {
    const hasIssues = diagnosis.testFailures.length > 0 || diagnosis.lintErrors.length > 0;

    if (hasIssues) {
      this.log('📊 Issues found:');
      diagnosis.testFailures.forEach((f) => this.log(`  ❌ Test: ${f}`));
      diagnosis.lintErrors.forEach((e) => this.log(`  ⚠️  Lint: ${e}`));
    } else {
      this.log('✅ No immediate issues found');
    }

    if (suggestions.length > 0) {
      this.log('\n📋 Evolution suggestions (conservative):');
      suggestions.slice(0, 3).forEach((s) => {
        const icon = s.priority === 'critical' ? '🔴' : s.priority === 'high' ? '🟡' : '🟢';
        this.log(`  ${icon} [${s.category}] ${s.description}`);
        this.log(`     Why: ${s.reason}`);
      });
    }
  }

  /**
   * Invokes OpenCode to apply improvements.
   */
  private async evolveWithOpenCode(
    diagnosis: Diagnosis,
    suggestions: EvolutionSuggestion[]
  ): Promise<boolean> {
    const prompt = this.buildPrompt(diagnosis, suggestions);

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
      return true;
    }
  }

  /**
   * Builds environment variables for OpenCode execution.
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
   * Builds the prompt sent to OpenCode.
   * Adopts a conservative strategy: fix > test > docs > refactor > feature
   */
  private buildPrompt(diagnosis: Diagnosis, suggestions: EvolutionSuggestion[]): string {
    const criticalIssues: string[] = [];
    const highPriority: string[] = [];
    const improvements: string[] = [];

    // 分类问题
    if (diagnosis.testFailures.length > 0) {
      criticalIssues.push(`Test failures: ${diagnosis.testFailures.join(', ')}`);
    }
    if (diagnosis.lintErrors.length > 0) {
      criticalIssues.push(`Lint errors: ${diagnosis.lintErrors.length} errors`);
    }

    // 分类建议
    suggestions.forEach((s) => {
      const line = `[${s.category}] ${s.description} (${s.estimatedEffort} effort)`;
      if (s.priority === 'critical') {
        criticalIssues.push(line);
      } else if (s.priority === 'high') {
        highPriority.push(line);
      } else {
        improvements.push(line);
      }
    });

    const hasCriticalIssues = criticalIssues.length > 0;
    const hasSuggestions = suggestions.length > 0;

    return `You are maintaining the ubuild project. Follow CONSERVATIVE evolution strategy with INTELLIGENT analysis.

${hasCriticalIssues ? '⚠️  CRITICAL ISSUES MUST BE FIXED FIRST ⚠️' : '✅ No critical issues - analyze codebase for improvement opportunities'}

## Current Health Status
- Test failures: ${diagnosis.testFailures.length > 0 ? diagnosis.testFailures.join(', ') : 'None'}
- Lint errors: ${diagnosis.lintErrors.length > 0 ? diagnosis.lintErrors.length + ' errors' : 'None'}

${
  hasCriticalIssues
    ? `## Critical Issues (FIX IMMEDIATELY)
${criticalIssues.join('\n')}`
    : ''
}

${
  hasSuggestions && !hasCriticalIssues
    ? `## Detected Improvement Opportunities
${suggestions.map((s) => `- [${s.category}] ${s.description} (${s.priority} priority)`).join('\n')}`
    : ''
}

## YOUR TASK
${
  hasCriticalIssues
    ? 'FIX ALL CRITICAL ISSUES FIRST. Do not do anything else.'
    : `ANALYZE the codebase and choose ONE improvement to implement:

1. EXPLORE the source code structure (src/commands/, src/core/, src/utils/)
2. IDENTIFY what could be improved:
   - Missing test coverage for critical paths?
   - Incomplete error handling?
   - Missing functionality that would be valuable?
   - Code that could be cleaner or more robust?
   - Small feature gaps that could be filled?
3. SELECT the most valuable improvement based on:
   - Impact: How much does it improve the project?
   - Risk: How likely is it to break existing functionality?
   - Effort: Can it be done in a focused change?

Choose from these categories (in priority order):
- FIX: Broken functionality, bugs, errors
- TEST: Add tests for uncovered or critical code
- DOCS: Improve documentation where it's lacking
- REFACTOR: Clean up code, improve types, simplify
- FEATURE: Add small, well-defined capabilities that fit naturally`
}

## CONSERVATIVE PRINCIPLES
- Prefer fixing over adding
- Prefer testing over refactoring  
- Prefer small improvements over large changes
- Only add features when codebase is solid and the feature is clearly valuable
- When in doubt, choose the safer option

## VERIFICATION CHECKLIST (MUST ALL PASS)
After making changes:
- [ ] npm run build (compiles without errors)
- [ ] npm test (all tests pass)
- [ ] npm run lint (no lint errors)
- [ ] npx ts-node src/cli/index.ts evolve --help (evolve works)
- [ ] npx ts-node src/cli/index.ts list --help (core commands work)

## CONSTRAINTS
- Do NOT use 'as any' or '@ts-ignore'
- Fix root causes, not symptoms
- Maintain existing code style
- Make minimal, focused changes (one improvement per iteration)
- Do NOT commit - just implement
- If you add a feature, ensure it has basic tests

Goal: ${hasCriticalIssues ? 'Restore system to working state' : 'Make one intelligent, conservative improvement based on actual code analysis'}`;
  }

  /**
   * Comprehensive verification - includes self-verification.
   */
  private async verify(): Promise<VerificationResult> {
    const errors: string[] = [];

    // 1. 验证构建
    let buildSucceeds = false;
    try {
      const buildResult = await execa('npm', ['run', 'build'], {
        cwd: this.projectRoot,
        reject: false,
      });
      buildSucceeds = buildResult.exitCode === 0;
      if (!buildSucceeds) {
        errors.push('Build failed');
      }
    } catch (error) {
      errors.push(`Build error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 2. 验证测试
    let testsPass = false;
    try {
      const testResult = await execa('npm', ['test'], {
        cwd: this.projectRoot,
        reject: false,
      });
      testsPass = testResult.exitCode === 0;
      if (!testsPass) {
        errors.push('Tests failed');
      }
    } catch (error) {
      errors.push(`Test error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 3. 验证 lint
    let lintClean = false;
    try {
      const lintResult = await execa('npm', ['run', 'lint'], {
        cwd: this.projectRoot,
        reject: false,
      });
      lintClean = lintResult.exitCode === 0;
      if (!lintClean) {
        errors.push('Lint errors found');
      }
    } catch (error) {
      errors.push(`Lint error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 4. ⭐ 自我验证：evolve 命令是否工作
    let evolveFunctional = false;
    try {
      const evolveResult = await execa('npx', ['ts-node', 'src/cli/index.ts', 'evolve', '--help'], {
        cwd: this.projectRoot,
        reject: false,
        timeout: 30000,
      });
      evolveFunctional = evolveResult.exitCode === 0;
      if (!evolveFunctional) {
        errors.push('Evolve command broken');
      }
    } catch (error) {
      errors.push(`Evolve check failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 5. ⭐ 核心命令验证
    let coreCommandsWork = true;
    const coreCommands = ['list', 'engine', 'build'];
    for (const cmd of coreCommands) {
      try {
        const result = await execa('npx', ['ts-node', 'src/cli/index.ts', cmd, '--help'], {
          cwd: this.projectRoot,
          reject: false,
          timeout: 15000,
        });
        if (result.exitCode !== 0) {
          coreCommandsWork = false;
          errors.push(`Core command '${cmd}' broken`);
        }
      } catch (error) {
        coreCommandsWork = false;
        errors.push(
          `Command '${cmd}' error: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    const success = buildSucceeds && testsPass && lintClean && evolveFunctional && coreCommandsWork;

    return {
      success,
      buildSucceeds,
      testsPass,
      lintClean,
      evolveFunctional,
      coreCommandsWork,
      errors,
    };
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
    } catch {
      return false;
    }
  }

  /**
   * Commits changes (without pushing).
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
   * Reverts changes.
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
   * Generates the commit message.
   */
  private generateCommitMessage(diagnosis: Diagnosis, suggestions: EvolutionSuggestion[]): string {
    const parts: string[] = [];

    // 优先描述修复的问题
    if (diagnosis.testFailures.length > 0) {
      parts.push(`fix: ${diagnosis.testFailures.length} test failure(s)`);
    }

    if (diagnosis.lintErrors.length > 0) {
      parts.push(`fix: ${diagnosis.lintErrors.length} lint error(s)`);
    }

    // 如果没问题，描述主要改进
    if (parts.length === 0 && suggestions.length > 0) {
      const topSuggestion = suggestions[0];
      const prefix =
        topSuggestion.category === 'test'
          ? 'test'
          : topSuggestion.category === 'docs'
            ? 'docs'
            : 'refactor';
      parts.push(`${prefix}: ${topSuggestion.description.toLowerCase()}`);
    }

    if (parts.length === 0) {
      parts.push('refactor: improve code quality');
    }

    return parts.join(', ');
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
 * @returns Promise that resolves with the evolution result
 */
export async function runSelfEvolution(options?: SelfEvolverOptions): Promise<EvolutionResult> {
  const driver = new SelfDriver(options);
  return driver.run();
}
