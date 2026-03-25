import chalk from 'chalk';
import { Writable } from 'stream';
import { BuildConfiguration, BuildPlatform } from '../types/build';
import { Logger } from '../utils/logger';
import { Validator } from '../utils/validator';
import { BuildExecutor } from './build-executor';
import { EngineResolver } from './engine-resolver';

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

export class ProjectBuilder {
  private logger: Logger;
  private stdout: Writable;
  private stderr: Writable;

  constructor(
    options: { logger?: Logger; stdout?: Writable; stderr?: Writable; silent?: boolean } = {}
  ) {
    this.stdout = options.stdout || process.stdout;
    this.stderr = options.stderr || process.stderr;
    this.logger =
      options.logger ||
      new Logger({
        stdout: this.stdout,
        stderr: this.stderr,
        silent: options.silent,
      });
  }

  getLogger(): Logger {
    return this.logger;
  }

  async build(options: BuildCommandOptions): Promise<void> {
    this.logger.title('Unreal Engine Build');

    if (options.listTargets) {
      await this.listAvailableTargets(options.project);
      return;
    }

    if (!Validator.isValidBuildTarget(this.getTarget(options))) {
      this.logger.error(`Invalid build target: ${options.target}`);
      this.logger.info('Valid generic targets: Editor, Game, Client, Server');
      this.logger.info('Use --list-targets to see available project-specific targets');
      throw new Error('Invalid target');
    }

    if (!Validator.isValidBuildConfig(this.getConfigValue(options))) {
      this.logger.error(`Invalid build configuration: ${options.config}`);
      this.logger.info('Valid configurations: Debug, DebugGame, Development, Shipping, Test');
      throw new Error('Invalid config');
    }

    if (!Validator.isValidBuildPlatform(this.getPlatformValue(options))) {
      this.logger.error(`Invalid build platform: ${options.platform}`);
      this.logger.info('Valid platforms: Win64, Win32, Linux, Mac, Android, IOS');
      throw new Error('Invalid platform');
    }

    if (options.dryRun) {
      await this.dryRunBuild(options);
      return;
    }

    this.logger.info(
      `Preparing to build: ${chalk.bold(this.getTarget(options))} | ${chalk.bold(this.getPlatformValue(options))} | ${chalk.bold(this.getConfigValue(options))}`
    );
    this.logger.divider();

    const startTime = Date.now();
    const buildExecutor = new BuildExecutor({
      logger: this.logger,
      stdout: this.stdout,
      stderr: this.stderr,
    });

    const result = await buildExecutor.execute({
      target: this.getTarget(options),
      config: this.getConfig(options),
      platform: this.getPlatform(options),
      projectPath: options.project,
      enginePath: options.enginePath,
      clean: options.clean,
      verbose: options.verbose,
    });

    this.logger.divider();
    const duration = (Date.now() - startTime) / 1000;

    if (result.success) {
      this.logger.success(`Build completed successfully in ${duration.toFixed(1)}s`);
      const outputMatch = result.stdout.match(/Output path: (.+)/);
      if (outputMatch) {
        this.logger.info(`Output directory: ${outputMatch[1]}`);
      }
      return;
    }

    this.logger.error(`Build failed after ${duration.toFixed(1)}s`);
    if (result.error) {
      this.logger.error(result.error);
    }

    if (result.stderr) {
      const errorLines = result.stderr.split('\n').filter((line) => {
        const normalizedLine = line.toLowerCase();
        return (
          normalizedLine.includes('error') ||
          normalizedLine.includes('failed') ||
          normalizedLine.includes('fatal')
        );
      });

      if (errorLines.length > 0) {
        this.logger.subTitle('Error Summary');
        errorLines.slice(0, 10).forEach((line) => {
          this.stdout.write(`  ${chalk.red('•')} ${line.trim()}\n`);
        });

        if (errorLines.length > 10) {
          this.stdout.write(`  ${chalk.gray(`... and ${errorLines.length - 10} more errors`)}\n`);
        }
      }
    }

    throw new Error(`Build failed with exit code ${result.exitCode}`);
  }

  private getTarget(options: BuildCommandOptions): string {
    return options.target || 'Editor';
  }

  private getConfigValue(options: BuildCommandOptions): string {
    return options.config || 'Development';
  }

  private getPlatformValue(options: BuildCommandOptions): string {
    return options.platform || 'Win64';
  }

  private getConfig(options: BuildCommandOptions): BuildConfiguration {
    return this.getConfigValue(options) as BuildConfiguration;
  }

  private getPlatform(options: BuildCommandOptions): BuildPlatform {
    return this.getPlatformValue(options) as BuildPlatform;
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
        this.stdout.write(
          '  • The project is a C++ project (Blueprint-only projects have no build targets)\n'
        );
        return;
      }

      targets.forEach((target) => {
        const typeLabel = chalk.gray(`(${target.type})`);
        this.stdout.write(`  • ${chalk.bold(target.name)} ${typeLabel}\n`);
      });

      this.stdout.write('\n');
      this.stdout.write('Use: ubuild build --target <target>\n');
    } catch (error) {
      this.logger.error(
        `Failed to list targets: ${error instanceof Error ? error.message : String(error)}`
      );
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

    try {
      const engineResult = await EngineResolver.resolveEngine(options.project);
      if (engineResult.engine) {
        this.stdout.write(
          `  Engine: ${engineResult.engine.displayName || engineResult.engine.path}\n`
        );
      } else {
        this.stdout.write(
          `  Engine: ${chalk.yellow('Not detected - specify with --engine-path')}\n`
        );
      }
    } catch (error) {
      this.logger.debug(
        `Engine resolution failed: ${error instanceof Error ? error.message : String(error)}`
      );
      this.stdout.write(
        `  Engine: ${chalk.yellow('Detection failed - specify with --engine-path')}\n`
      );
    }

    this.stdout.write('\n');
    this.logger.info('This is a dry run - no actual build will be performed');
    this.stdout.write('To execute the build, remove the --dry-run flag\n');
  }
}

export async function executeBuild(options: BuildCommandOptions): Promise<void> {
  const builder = new ProjectBuilder({
    logger: options.logger,
    stdout: options.stdout,
    stderr: options.stderr,
    silent: options.silent,
  });
  return builder.build(options);
}
