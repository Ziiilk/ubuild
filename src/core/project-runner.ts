/**
 * Project runner for executing Unreal Engine projects.
 *
 * Finds and runs the appropriate executable (Editor or Game) with support
 * for various configurations, platforms, and optional pre-build steps.
 *
 * @module core/project-runner
 */

import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { execa } from 'execa';
import { Writable } from 'stream';
import { Logger } from '../utils/logger';
import { Validator } from '../utils/validator';
import { formatError } from '../utils/error';
import { BuildExecutor } from './build-executor';
import { EngineResolver } from './engine-resolver';
import { ProjectPathResolver } from './project-path-resolver';
import { TargetResolver } from './target-resolver';
import { Platform } from '../utils/platform';
import { DEFAULTS } from '../utils/constants';

/** Options for running an Unreal Engine project executable. */
export interface RunOptions {
  /** Target to run (Editor, Game, Client, Server) */
  target?: string;
  /** Build configuration (Debug, DebugGame, Development, Shipping, Test) */
  config?: string;
  /** Target platform (Win64, Win32, Linux, Mac, Android, IOS) */
  platform?: string;
  /** Path to project directory or .uproject file */
  project?: string;
  /** Path to Unreal Engine installation */
  enginePath?: string;
  /** Show what would be run without executing */
  dryRun?: boolean;
  /** Build the project before running */
  buildFirst?: boolean;
  /** Skip building, just run existing executable */
  noBuild?: boolean;
  /** Additional arguments to pass to the executable */
  args?: string[];
  /** Logger instance for output */
  logger?: Logger;
  /** Writable stream for stdout */
  stdout?: Writable;
  /** Writable stream for stderr */
  stderr?: Writable;
  /** Suppress all output */
  silent?: boolean;
  /** Run process in detached mode */
  detached?: boolean;
}

/**
 * Runs Unreal Engine projects by finding and executing the appropriate executable.
 * Supports Editor and Game targets with various configurations.
 */
export class ProjectRunner {
  private logger: Logger;
  private stdout: Writable;
  private stderr: Writable;

  /**
   * Creates a new ProjectRunner instance.
   * @param options - Configuration options for logging and output streams
   */
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

  /**
   * Gets the logger instance used by this runner.
   * @returns The Logger instance
   */
  getLogger(): Logger {
    return this.logger;
  }

  /**
   * Runs the project with the specified options.
   * @param options - Run configuration options
   * @returns Promise that resolves when the run completes
   * @throws Error if validation fails or executable cannot be found
   */
  async run(options: RunOptions): Promise<void> {
    this.logger.title('Run Unreal Engine Project');

    // Validate and apply defaults for run options
    const { target, config, platform } = Validator.validateBuildOptions(options, this.logger);

    // Create validated options with proper types
    const validatedOptions: RunOptions = {
      ...options,
      target,
      config,
      platform,
    };

    if (options.dryRun) {
      await this.dryRun(validatedOptions);
      return;
    }

    await this.runProject(validatedOptions);
  }

  private async dryRun(options: RunOptions): Promise<void> {
    this.logger.subTitle('Dry Run - Run Configuration');

    this.stdout.write(`  Project: ${options.project || 'Current directory'}\n`);
    this.stdout.write(`  Target: ${options.target}\n`);
    this.stdout.write(`  Configuration: ${options.config}\n`);
    this.stdout.write(`  Platform: ${options.platform}\n`);
    this.stdout.write(`  Build First: ${options.buildFirst ? 'Yes' : 'No'}\n`);
    this.stdout.write(`  Detached: ${options.detached ? 'Yes' : 'No'}\n`);
    this.stdout.write(`  Additional Args: ${options.args ? options.args.join(' ') : 'None'}\n`);

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
      this.logger.debug(`Engine detection failed: ${formatError(error)}`);
      this.stdout.write(
        `  Engine: ${chalk.yellow('Detection failed - specify with --engine-path')}\n`
      );
    }

    try {
      const executablePath = await this.findExecutable(options);
      if (executablePath && (await fs.pathExists(executablePath))) {
        this.stdout.write(`  Executable: ${executablePath}\n`);
        this.stdout.write(`  Executable exists: ${chalk.green('Yes')}\n`);
      } else if (executablePath) {
        this.stdout.write(`  Executable: ${executablePath}\n`);
        this.stdout.write(`  Executable exists: ${chalk.yellow('No - may need to build first')}\n`);
      } else {
        this.stdout.write(`  Executable: ${chalk.yellow('Could not determine path')}\n`);
      }
    } catch (error) {
      this.logger.debug(`Executable path detection failed: ${formatError(error)}`);
      this.stdout.write(`  Executable: ${chalk.yellow('Path detection failed')}\n`);
    }

    this.stdout.write('\n');
    this.logger.info('This is a dry run - no actual run will be performed');
    this.stdout.write('To execute the run, remove the --dry-run flag\n');
  }

  private async runProject(options: RunOptions): Promise<void> {
    const startTime = Date.now();

    const projectPath = await ProjectPathResolver.resolveOrThrow(options.project || process.cwd());

    if (!(await fs.pathExists(projectPath))) {
      throw new Error(`Project file not found: ${projectPath}`);
    }

    const enginePath = await EngineResolver.resolveEnginePath({
      projectPath,
      enginePath: options.enginePath,
    });
    this.logger.debug(`Resolved engine path: ${enginePath}`);

    if (options.noBuild) {
      this.logger.debug('Skipping build (--no-build flag set)');
    } else if (options.buildFirst === true) {
      this.logger.info('Building project before running...');
      const buildExecutor = new BuildExecutor({
        logger: this.logger,
        stdout: this.stdout,
        stderr: this.stderr,
      });
      const buildResult = await buildExecutor.execute({
        target: options.target || DEFAULTS.BUILD_TARGET,
        config: options.config || DEFAULTS.BUILD_CONFIG,
        platform: options.platform || DEFAULTS.BUILD_PLATFORM,
        projectPath,
        enginePath,
        verbose: false,
      });

      if (!buildResult.success) {
        this.logger.error('Build failed. Cannot run project.');
        throw new Error(`Build failed with exit code ${buildResult.exitCode}`);
      }
    }

    const resolvedOptions: RunOptions = {
      ...options,
      enginePath,
    };

    const executablePath = await this.findExecutable(resolvedOptions);
    if (!executablePath) {
      throw new Error('Could not determine executable path');
    }

    if (!(await fs.pathExists(executablePath))) {
      throw new Error(
        `Executable not found: ${executablePath}\nTry building the project first with --build-first`
      );
    }

    this.logger.info(`Running: ${chalk.bold(path.basename(executablePath))}`);
    this.logger.divider();

    const args = options.args ? [...options.args] : [];

    if ((options.target || DEFAULTS.BUILD_TARGET).toLowerCase().includes('editor')) {
      args.unshift(projectPath);
    }

    try {
      const execOptions = {
        stdio: options.detached ? 'ignore' : 'inherit',
        cwd: path.dirname(executablePath),
        detached: options.detached,
      } as const;

      if (options.detached) {
        const childProcess = execa(executablePath, args, execOptions);
        // Prevent unhandled rejection when the child process fails to spawn
        // or exits with an error — the parent process has already moved on
        childProcess.catch(() => {});
        childProcess.unref();
        this.logger.success(`Started process in detached mode: ${path.basename(executablePath)}`);
        return;
      }

      const childProcess = execa(executablePath, args, execOptions);

      childProcess.on('exit', (code) => {
        this.logger.divider();
        const duration = (Date.now() - startTime) / 1000;
        if (code === 0) {
          this.logger.success(`Process completed successfully in ${duration.toFixed(1)}s`);
        } else if (code === null) {
          this.logger.error(`Process terminated abnormally after ${duration.toFixed(1)}s`);
        } else {
          this.logger.error(`Process exited with code ${code} after ${duration.toFixed(1)}s`);
        }
      });

      await childProcess;
    } catch (error) {
      throw new Error(`Failed to run executable: ${formatError(error)}`);
    }
  }

  private async findExecutable(options: RunOptions): Promise<string | null> {
    try {
      const projectPathResolution = await ProjectPathResolver.resolve(
        options.project || process.cwd()
      );
      const projectPath = projectPathResolution.resolvedPath;
      let projectDir = projectPath;
      let projectName = '';

      if (projectPathResolution.hasUProjectExtension) {
        projectDir = path.dirname(projectPath);
        projectName = path.basename(projectPath, '.uproject');
      }

      if (!projectName) {
        return null;
      }

      let targetName = options.target || DEFAULTS.BUILD_TARGET;
      const resolvedTarget = await TargetResolver.resolveTarget(projectPath, targetName);
      targetName = resolvedTarget;

      const exeExt = Platform.exeExtension();

      if (targetName.toLowerCase().includes('editor')) {
        let enginePath: string;
        try {
          enginePath = await EngineResolver.resolveEnginePath({
            projectPath,
            enginePath: options.enginePath,
          });
        } catch (error) {
          this.logger.debug(`Engine path resolution failed: ${formatError(error)}`);
          this.logger.warning('Could not resolve engine path for editor target');
          return null;
        }

        const platform = options.platform || DEFAULTS.BUILD_PLATFORM;
        const editorExePath = path.join(
          enginePath,
          'Engine',
          'Binaries',
          platform,
          `UnrealEditor${exeExt}`
        );

        if (await fs.pathExists(editorExePath)) {
          return editorExePath;
        }

        const alternativePaths = [
          path.join(enginePath, 'Engine', 'Binaries', platform, `UnrealEditor-Cmd${exeExt}`),
          path.join(enginePath, 'Engine', 'Binaries', platform, `UE4Editor${exeExt}`),
          path.join(enginePath, 'Engine', 'Binaries', platform, `UE5Editor${exeExt}`),
        ];

        for (const alternativePath of alternativePaths) {
          if (await fs.pathExists(alternativePath)) {
            return alternativePath;
          }
        }

        return editorExePath;
      }

      const executableName = `${projectName}${exeExt}`;
      const platform = options.platform || DEFAULTS.BUILD_PLATFORM;
      const config = options.config || DEFAULTS.BUILD_CONFIG;

      const possiblePaths = [
        path.join(projectDir, 'Binaries', platform, executableName),
        path.join(
          projectDir,
          'Binaries',
          platform,
          `${projectName}-${platform}-${config}`,
          executableName
        ),
        path.join(projectDir, 'Binaries', platform, `${targetName}${exeExt}`),
        path.join(projectDir, 'Binaries', platform, `${targetName}-${platform}-${config}${exeExt}`),
      ];

      for (const possiblePath of possiblePaths) {
        if (await fs.pathExists(possiblePath)) {
          return possiblePath;
        }
      }

      return path.join(projectDir, 'Binaries', platform, executableName);
    } catch (error) {
      this.logger.debug(`findExecutable failed: ${formatError(error)}`);
      return null;
    }
  }
}

/**
 * Convenience function to run a project without creating a ProjectRunner instance.
 * @param options - Run configuration options
 * @returns Promise that resolves when the run completes
 */
export async function runProject(options: RunOptions): Promise<void> {
  const runner = new ProjectRunner({
    logger: options.logger,
    stdout: options.stdout,
    stderr: options.stderr,
    silent: options.silent,
  });
  return runner.run(options);
}
