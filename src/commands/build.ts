import { Command } from 'commander';
import chalk from 'chalk';
import { Writable } from 'stream';
import { BuildExecutor } from '../core/build-executor';
import { Logger } from '../utils/logger';
import { Validator } from '../utils/validator';

export interface BuildCommandOptions {
  target?: string;
  config?: string;
  platform?: string;
  project?: string;
  enginePath?: string;
  clean?: boolean;
  verbose?: boolean;
  dryRun?: boolean;
  listTargets?: boolean;
  logger?: Logger;
  stdout?: Writable;
  stderr?: Writable;
  silent?: boolean;
}

export function buildCommand(program: Command): void {
  program
    .command('build')
    .description('Build Unreal Engine project')
    .option('-t, --target <target>', 'Build target (Editor, Game, Client, Server)', 'Editor')
    .option('-c, --config <config>', 'Build configuration (Debug, DebugGame, Development, Shipping, Test)', 'Development')
    .option('-p, --platform <platform>', 'Build platform (Win64, Win32, Linux, Mac, Android, IOS)', 'Win64')
    .option('--project <path>', 'Path to project directory or .uproject file')
    .option('--engine-path <path>', 'Path to Unreal Engine installation')
    .option('--clean', 'Clean build (rebuild everything)')
    .option('--verbose', 'Verbose output')
    .option('--dry-run', 'Show what would be built without actually building')
    .option('--list-targets', 'List available build targets for project')
    .action(async (options) => {
      const builder = new ProjectBuilder();
      try {
        await builder.build(options);
      } catch (error) {
        builder.getLogger().error(`Build failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });
}

export class ProjectBuilder {
  private logger: Logger;
  private stdout: Writable;
  private stderr: Writable;

  constructor(options: { logger?: Logger; stdout?: Writable; stderr?: Writable; silent?: boolean } = {}) {
    this.stdout = options.stdout || process.stdout;
    this.stderr = options.stderr || process.stderr;
    this.logger = options.logger || new Logger({
      stdout: this.stdout,
      stderr: this.stderr,
      silent: options.silent
    });
  }

  getLogger(): Logger {
    return this.logger;
  }

  async build(options: BuildCommandOptions): Promise<void> {
    this.logger.title('Unreal Engine Build');

    // List targets if requested
    if (options.listTargets) {
      await this.listAvailableTargets(options.project);
      return;
    }

    // Validate options
    if (!Validator.isValidBuildTarget(options.target || 'Editor')) {
      this.logger.error(`Invalid build target: ${options.target}`);
      this.logger.info('Valid generic targets: Editor, Game, Client, Server');
      this.logger.info('Use --list-targets to see available project-specific targets');
      throw new Error('Invalid target');
    }

    if (!Validator.isValidBuildConfig(options.config || 'Development')) {
      this.logger.error(`Invalid build configuration: ${options.config}`);
      this.logger.info('Valid configurations: Debug, DebugGame, Development, Shipping, Test');
      throw new Error('Invalid config');
    }

    if (!Validator.isValidBuildPlatform(options.platform || 'Win64')) {
      this.logger.error(`Invalid build platform: ${options.platform}`);
      this.logger.info('Valid platforms: Win64, Win32, Linux, Mac, Android, IOS');
      throw new Error('Invalid platform');
    }

    // Dry run
    if (options.dryRun) {
      await this.dryRunBuild(options);
      return;
    }

    // Execute build
    this.logger.info(`Preparing to build: ${chalk.bold(options.target)} | ${chalk.bold(options.platform)} | ${chalk.bold(options.config)}`);
    this.logger.divider();

    const startTime = Date.now();
    const buildExecutor = new BuildExecutor({
      logger: this.logger,
      stdout: this.stdout,
      stderr: this.stderr
    });

    const result = await buildExecutor.execute({
      target: options.target,
      config: options.config as any,
      platform: options.platform as any,
      projectPath: options.project,
      enginePath: options.enginePath,
      clean: options.clean,
      verbose: options.verbose
    });

    this.logger.divider();
    const duration = (Date.now() - startTime) / 1000;

    if (result.success) {
      this.logger.success(`Build completed successfully in ${duration.toFixed(1)}s`);
      const outputMatch = result.stdout.match(/Output path: (.+)/);
      if (outputMatch) {
        this.logger.info(`Output directory: ${outputMatch[1]}`);
      }
    } else {
      this.logger.error(`Build failed after ${duration.toFixed(1)}s`);
      if (result.error) {
        this.logger.error(result.error);
      }

      // Show error summary
      if (result.stderr) {
        const errorLines = result.stderr.split('\n').filter(line =>
          line.toLowerCase().includes('error') ||
          line.toLowerCase().includes('failed') ||
          line.toLowerCase().includes('fatal')
        );

        if (errorLines.length > 0) {
          this.logger.subTitle('Error Summary');
          errorLines.slice(0, 10).forEach(line => {
            this.stdout.write(`  ${chalk.red('•')} ${line.trim()}\n`);
          });

          if (errorLines.length > 10) {
            this.stdout.write(`  ${chalk.gray(`... and ${errorLines.length - 10} more errors`)}\n`);
          }
        }
      }

      throw new Error(`Build failed with exit code ${result.exitCode}`);
    }
  }

  private async listAvailableTargets(projectPath?: string): Promise<void> {
    try {
      const cwd = projectPath || process.cwd();
      const targets = await BuildExecutor.getAvailableTargets(cwd);

      this.logger.subTitle('Available Build Targets');

      if (targets.length === 0) {
        this.stdout.write('  No build targets found\n');
        this.stdout.write('\n');
        this.stdout.write('Make sure:\n');
        this.stdout.write('  • You are in a Unreal Engine project directory\n');
        this.stdout.write('  • The project has Source/*.Target.cs files\n');
        this.stdout.write('  • The project is a C++ project (Blueprint-only projects have no build targets)\n');
      } else {
        targets.forEach(target => {
          const typeLabel = chalk.gray(`(${target.type})`);
          this.stdout.write(`  • ${chalk.bold(target.name)} ${typeLabel}\n`);
        });

        this.stdout.write('\n');
        this.stdout.write('Use: ubuild build --target <target>\n');
      }
    } catch (error) {
      this.logger.error(`Failed to list targets: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async dryRunBuild(options: BuildCommandOptions): Promise<void> {
    this.logger.subTitle('Dry Run - Build Configuration');

    this.stdout.write(`  Project: ${options.project || 'Current directory'}\n`);
    this.stdout.write(`  Target: ${options.target}\n`);
    this.stdout.write(`  Configuration: ${options.config}\n`);
    this.stdout.write(`  Platform: ${options.platform}\n`);
    this.stdout.write(`  Clean Build: ${options.clean ? 'Yes' : 'No'}\n`);
    this.stdout.write(`  Verbose: ${options.verbose ? 'Yes' : 'No'}\n`);

    // Try to detect engine
    try {
      const { EngineResolver } = await import('../core/engine-resolver');
      const engineResult = await EngineResolver.resolveEngine(options.project);
      if (engineResult.engine) {
        this.stdout.write(`  Engine: ${engineResult.engine.displayName || engineResult.engine.path}\n`);
      } else {
        this.stdout.write(`  Engine: ${chalk.yellow('Not detected - specify with --engine-path')}\n`);
      }
    } catch {
      this.stdout.write(`  Engine: ${chalk.yellow('Detection failed - specify with --engine-path')}\n`);
    }

    this.stdout.write('\n');
    this.logger.info('This is a dry run - no actual build will be performed');
    this.stdout.write('To execute the build, remove the --dry-run flag\n');
  }
}

// Backward compatibility: static build method
export async function executeBuild(options: BuildCommandOptions): Promise<void> {
  const builder = new ProjectBuilder({
    logger: options.logger,
    stdout: options.stdout,
    stderr: options.stderr,
    silent: options.silent
  });
  return builder.build(options);
}
