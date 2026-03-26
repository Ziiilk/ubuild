/**
 * Build executor module for ubuild
 *
 * Executes Unreal Engine project builds using UnrealBuildTool or Build.bat.
 * Supports various build targets, configurations, and platforms with proper
 * logging and error handling.
 *
 * @module core/build-executor
 */

import { execa } from 'execa';
import path from 'path';
import fs from 'fs-extra';
import { Writable } from 'stream';
import { BuildOptions, BuildResult } from '../types/build';
import { EngineResolver } from './engine-resolver';
import { Logger } from '../utils/logger';
import { formatError } from '../utils/error';
import { Platform } from '../utils/platform';
import { ProjectPathResolver } from './project-path-resolver';
import { TargetResolver } from './target-resolver';

/**
 * Executes Unreal Engine project builds using UnrealBuildTool or Build.bat.
 * Supports various build targets, configurations, and platforms.
 */
export class BuildExecutor {
  private logger: Logger;
  private stdout: Writable;
  private stderr: Writable;

  /**
   * Creates a new BuildExecutor instance.
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
   * Executes a build with the specified options.
   * @param options - Build configuration options
   * @returns Promise resolving to build result with success status and output
   */
  async execute(options: BuildOptions): Promise<BuildResult> {
    const startTime = Date.now();

    try {
      const validatedOptions = await this.validateOptions(options);
      const { target, config, platform, projectPath, enginePath } = validatedOptions;

      this.logger.info(`Starting build: ${target} | ${platform} | ${config}`);
      this.logger.info(`Project: ${projectPath}`);
      this.logger.info(`Engine: ${enginePath}`);

      const buildBatPath = path.join(enginePath, 'Engine', 'Build', 'BatchFiles', 'Build.bat');
      const buildScriptExists = await fs.pathExists(buildBatPath);

      let stdout = '';
      let stderr = '';
      let exitCode = 0;

      if (buildScriptExists) {
        const result = await this.executeBuildBat(buildBatPath, validatedOptions);
        stdout = result.stdout;
        stderr = result.stderr;
        exitCode = result.exitCode;
      } else {
        const result = await this.executeUnrealBuildTool(enginePath, validatedOptions);
        stdout = result.stdout;
        stderr = result.stderr;
        exitCode = result.exitCode;
      }

      const duration = Date.now() - startTime;
      const success = exitCode === 0;

      const buildResult: BuildResult = {
        success,
        exitCode,
        stdout,
        stderr,
        duration,
      };

      if (!success) {
        buildResult.error = `Build failed with exit code ${exitCode}`;
      }

      return buildResult;
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: formatError(error),
        duration,
        error: 'Build execution failed',
      };
    }
  }

  /**
   * Validates and normalizes build options.
   * @param options - Raw build options from user input
   * @returns Promise resolving to validated and normalized options with defaults applied
   * @throws Error if project path cannot be resolved
   * @throws Error if engine path cannot be resolved
   * @throws Error if target cannot be resolved
   */
  private async validateOptions(options: BuildOptions): Promise<Required<BuildOptions>> {
    const target: string = options.target || 'Editor';
    const config: string = options.config || 'Development';
    const platform: string = options.platform || 'Win64';
    const clean = options.clean || false;
    const verbose = options.verbose || false;
    const additionalArgs = options.additionalArgs || [];

    const projectPath = await ProjectPathResolver.resolveOrThrow(
      options.projectPath || process.cwd()
    );

    const enginePath = await EngineResolver.resolveEnginePath({
      projectPath,
      enginePath: options.enginePath,
    });

    let resolvedTarget = target;
    const availableTargets = await BuildExecutor.getAvailableTargets(projectPath);

    if (availableTargets.length > 0) {
      const result = await TargetResolver.resolveTarget(projectPath, target);
      if (result && result !== target) {
        // Target was resolved to a different name (generic -> specific)
        resolvedTarget = result;
        this.logger.debug(`Resolved target "${target}" to "${resolvedTarget}"`);
      } else if (TargetResolver.isGenericTarget(target) && availableTargets.length > 0) {
        // Generic target that couldn't be resolved and we have targets - error
        throw new Error(
          `No ${target} target found in project. Available targets: ${availableTargets.map((t) => t.name).join(', ')}`
        );
      } else {
        // Specific target name - check if it exists
        const targetExists = availableTargets.some((t) => t.name === target);
        if (!targetExists) {
          throw new Error(
            `No ${target} target found in project. Available targets: ${availableTargets.map((t) => t.name).join(', ')}`
          );
        }
      }
    } else {
      this.logger.debug('No target files found, using generic target name');
    }

    return {
      target: resolvedTarget,
      config,
      platform,
      projectPath,
      enginePath,
      clean,
      verbose,
      additionalArgs,
      logger: options.logger || this.logger,
      stdout: options.stdout || this.stdout,
      stderr: options.stderr || this.stderr,
      silent: options.silent || false,
    };
  }

  /**
   * Executes the build using Build.bat script.
   * @param buildBatPath - Path to the Build.bat script
   * @param options - Validated build options
   * @returns Promise resolving to execution result with stdout, stderr, and exit code
   */
  private async executeBuildBat(
    buildBatPath: string,
    options: Required<BuildOptions>
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const args = [
      options.target,
      options.platform,
      options.config,
      `-project="${options.projectPath}"`,
      '-NoMutex',
    ];

    if (options.clean) {
      args.push('-clean');
    }

    if (options.verbose) {
      args.push('-verbose');
    }

    args.push(...options.additionalArgs);

    const command = `"${buildBatPath}" ${args.join(' ')}`;
    this.logger.debug(`Executing: ${command}`);

    const childProcess = execa(command, {
      stdio: 'pipe',
      cwd: path.dirname(buildBatPath),
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    if (childProcess.stdout) {
      childProcess.stdout.on('data', (data: Buffer) => {
        const str = data.toString();
        stdout += str;
        this.stdout.write(str);
      });
    }

    if (childProcess.stderr) {
      childProcess.stderr.on('data', (data: Buffer) => {
        const str = data.toString();
        stderr += str;
        this.stderr.write(str);
      });
    }

    const result = await childProcess;
    return {
      stdout: result.stdout || stdout,
      stderr: result.stderr || stderr,
      exitCode: result.exitCode ?? 0,
    };
  }

  /**
   * Executes the build using UnrealBuildTool directly.
   * @param enginePath - Path to the Unreal Engine installation
   * @param options - Validated build options
   * @returns Promise resolving to execution result with stdout, stderr, and exit code
   * @throws Error if UnrealBuildTool executable is not found
   */
  private async executeUnrealBuildTool(
    enginePath: string,
    options: Required<BuildOptions>
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const ubtPath = path.join(
      enginePath,
      'Engine',
      'Binaries',
      'DotNET',
      'UnrealBuildTool',
      `UnrealBuildTool${Platform.exeExtension()}`
    );

    if (!(await fs.pathExists(ubtPath))) {
      throw new Error(`UnrealBuildTool not found at: ${ubtPath}`);
    }

    const args = [
      options.target,
      options.platform,
      options.config,
      `-project="${options.projectPath}"`,
      '-NoMutex',
    ];

    if (options.clean) {
      args.push('-clean');
    }

    if (options.verbose) {
      args.push('-verbose');
    }

    args.push(...options.additionalArgs);

    const command = `"${ubtPath}" ${args.join(' ')}`;
    this.logger.debug(`Executing: ${command}`);

    const childProcess = execa(command, {
      stdio: 'pipe',
      cwd: path.dirname(ubtPath),
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    if (childProcess.stdout) {
      childProcess.stdout.on('data', (data: Buffer) => {
        const str = data.toString();
        stdout += str;
        this.stdout.write(str);
      });
    }

    if (childProcess.stderr) {
      childProcess.stderr.on('data', (data: Buffer) => {
        const str = data.toString();
        stderr += str;
        this.stderr.write(str);
      });
    }

    const result = await childProcess;
    return {
      stdout: result.stdout || stdout,
      stderr: result.stderr || stderr,
      exitCode: result.exitCode ?? 0,
    };
  }

  /**
   * Gets available build targets for a project by scanning .Target.cs files.
   * @param projectPath - Path to the project directory or .uproject file
   * @returns Promise resolving to array of available targets with names and types
   */
  static async getAvailableTargets(
    projectPath: string
  ): Promise<Array<{ name: string; type: string }>> {
    try {
      let projectDir = projectPath;
      if (projectPath.endsWith('.uproject')) {
        projectDir = path.dirname(projectPath);
      }

      const sourceDir = path.join(projectDir, 'Source');
      if (!(await fs.pathExists(sourceDir))) {
        return [];
      }

      const targetFiles = await fs
        .readdir(sourceDir)
        .then((files) => files.filter((f) => f.endsWith('.Target.cs')));

      return targetFiles.map((file) => {
        const name = path.basename(file, '.Target.cs');
        let type = 'Game';
        if (name.toLowerCase().includes('editor')) {
          type = 'Editor';
        } else if (name.toLowerCase().includes('client')) {
          type = 'Client';
        } else if (name.toLowerCase().includes('server')) {
          type = 'Server';
        }

        return { name, type };
      });
    } catch (error) {
      Logger.debug(`getAvailableTargets failed: ${formatError(error)}`);
      return [];
    }
  }

  /**
   * Gets default build options based on available project targets.
   * @param projectPath - Path to the project directory or .uproject file
   * @returns Promise resolving to partial build options with sensible defaults
   */
  static async getDefaultOptions(projectPath: string): Promise<Partial<BuildOptions>> {
    const targets = await BuildExecutor.getAvailableTargets(projectPath);
    const hasEditorTarget = targets.some((t) => t.type === 'Editor');

    return {
      target: hasEditorTarget ? 'Editor' : 'Game',
      config: 'Development',
      platform: 'Win64',
    };
  }

  /**
   * Static helper to execute a build without creating an instance.
   * @param options - Build configuration options
   * @returns Promise resolving to build result
   */
  static async execute(options: BuildOptions): Promise<BuildResult> {
    const executor = new BuildExecutor({
      logger: options.logger,
      stdout: options.stdout,
      stderr: options.stderr,
      silent: options.silent,
    });
    return executor.execute(options);
  }

  /**
   * Instance method wrapper for getAvailableTargets.
   * Gets available build targets for a project by scanning .Target.cs files.
   * @param projectPath - Path to the project directory or .uproject file
   * @returns Promise resolving to array of available targets with names and types
   */
  async getAvailableTargetsInstance(
    projectPath: string
  ): Promise<Array<{ name: string; type: string }>> {
    return BuildExecutor.getAvailableTargets(projectPath);
  }

  /**
   * Instance method wrapper for getDefaultOptions.
   * Gets default build options based on available project targets.
   * @param projectPath - Path to the project directory or .uproject file
   * @returns Promise resolving to partial build options with sensible defaults
   */
  async getDefaultOptionsInstance(projectPath: string): Promise<Partial<BuildOptions>> {
    return BuildExecutor.getDefaultOptions(projectPath);
  }
}
