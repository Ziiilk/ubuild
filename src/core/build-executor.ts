import { execa } from 'execa';
import path from 'path';
import fs from 'fs-extra';
import { Writable } from 'stream';
import { BuildOptions, BuildResult, BuildTarget, BuildConfiguration, BuildPlatform } from '../types/build';
import { Logger } from '../utils/logger';
import { Platform } from '../utils/platform';

export class BuildExecutor {
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

  /**
   * Execute Unreal Engine build (instance method)
   */
  async execute(options: BuildOptions): Promise<BuildResult> {
    const startTime = Date.now();

    try {
      // Validate options
      const validatedOptions = await this.validateOptions(options);
      const { target, config, platform, projectPath, enginePath } = validatedOptions;

      this.logger.info(`Starting build: ${target} | ${platform} | ${config}`);
      this.logger.info(`Project: ${projectPath}`);
      this.logger.info(`Engine: ${enginePath}`);

      // Check if Build.bat exists
      const buildBatPath = path.join(enginePath, 'Engine', 'Build', 'BatchFiles', 'Build.bat');
      const buildScriptExists = await fs.pathExists(buildBatPath);

      let stdout = '';
      let stderr = '';
      let exitCode = 0;

      if (buildScriptExists) {
        // Use Build.bat
        const result = await this.executeBuildBat(buildBatPath, validatedOptions);
        stdout = result.stdout;
        stderr = result.stderr;
        exitCode = result.exitCode;
      } else {
        // Fallback to UnrealBuildTool directly
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
        duration
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
        stderr: error instanceof Error ? error.message : String(error),
        duration,
        error: 'Build execution failed'
      };
    }
  }

  /**
   * Validate and complete build options
   */
  private async validateOptions(options: BuildOptions): Promise<Required<BuildOptions>> {
    const target: BuildTarget = options.target || 'Editor';
    const config: BuildConfiguration = options.config || 'Development';
    const platform: BuildPlatform = options.platform || 'Win64';
    const clean = options.clean || false;
    const verbose = options.verbose || false;
    const additionalArgs = options.additionalArgs || [];

    // Validate project path
    let projectPath = options.projectPath || process.cwd();
    if (await fs.pathExists(projectPath) && (await fs.stat(projectPath)).isDirectory()) {
      // Look for .uproject file
      const uprojectFiles = await fs.readdir(projectPath).then(files =>
        files.filter(f => f.endsWith('.uproject'))
      );

      if (uprojectFiles.length > 0) {
        projectPath = path.join(projectPath, uprojectFiles[0]);
      } else {
        throw new Error(`No .uproject file found in project directory: ${projectPath}`);
      }
    }

    // Validate engine path
    let enginePath = options.enginePath;
    if (!enginePath) {
      // Try to resolve engine path
      const { EngineResolver } = await import('./engine-resolver');
      const engineResult = await EngineResolver.resolveEngine(projectPath);
      if (!engineResult.engine) {
        throw new Error('Could not determine engine path. Please specify --engine-path');
      }
      enginePath = engineResult.engine.path;
    }

    // Validate engine path exists
    if (!(await fs.pathExists(enginePath))) {
      throw new Error(`Engine path does not exist: ${enginePath}`);
    }

    // Resolve target name from generic type to project-specific target
    let resolvedTarget = target;
    const availableTargets = await BuildExecutor.getAvailableTargets(projectPath);

    if (availableTargets.length > 0) {
      // Check if target is a generic type (Editor, Game, Client, Server)
      const genericTypes = ['Editor', 'Game', 'Client', 'Server'];
      const isGenericType = genericTypes.includes(target);

      if (isGenericType) {
        // Find a target matching the generic type
        const matchingTarget = availableTargets.find(t => t.type === target);
        if (matchingTarget) {
          resolvedTarget = matchingTarget.name;
          this.logger.debug(`Resolved generic target "${target}" to "${resolvedTarget}"`);
        } else {
          // No matching target found, try to find any target with the type in name
          const fallbackTarget = availableTargets.find(t =>
            t.name.toLowerCase().includes(target.toLowerCase())
          );
          if (fallbackTarget) {
            resolvedTarget = fallbackTarget.name;
            this.logger.debug(`Fallback: resolved target "${target}" to "${resolvedTarget}"`);
          } else {
            throw new Error(`No ${target} target found in project. Available targets: ${availableTargets.map(t => t.name).join(', ')}`);
          }
        }
      } else {
        // Target is already a specific name, verify it exists
        const targetExists = availableTargets.some(t => t.name === target);
        if (!targetExists) {
          throw new Error(`Target "${target}" not found in project. Available targets: ${availableTargets.map(t => t.name).join(', ')}`);
        }
      }
    } else {
      // No target files found, might be a blueprint-only project
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
      silent: options.silent || false
    };
  }

  /**
   * Execute build using Build.bat
   */
  private async executeBuildBat(
    buildBatPath: string,
    options: Required<BuildOptions>
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    // Build command string with proper quoting
    const args = [
      options.target,
      options.platform,
      options.config,
      `-project="${options.projectPath}"`,
      '-NoMutex'  // Allow concurrent UBT instances
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
      shell: true // Still need shell for .bat files
    });

    let stdout = '';
    let stderr = '';

    // Stream output to both logger and capture
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
      exitCode: result.exitCode ?? 0
    };
  }

  /**
   * Execute build using UnrealBuildTool directly
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

    // Build command arguments
    const args = [
      options.target,
      options.platform,
      options.config,
      `-project="${options.projectPath}"`,
      '-NoMutex'  // Allow concurrent UBT instances
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
      shell: true // Need shell for .exe on Windows
    });

    let stdout = '';
    let stderr = '';

    // Stream output to both logger and capture
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
      exitCode: result.exitCode ?? 0
    };
  }

  /**
   * Get available build targets from project (static method)
   */
  static async getAvailableTargets(projectPath: string): Promise<Array<{ name: string; type: string }>> {
    try {
      // Determine project directory: if path ends with .uproject, use its parent directory
      let projectDir = projectPath;
      if (projectPath.endsWith('.uproject')) {
        projectDir = path.dirname(projectPath);
      }

      const sourceDir = path.join(projectDir, 'Source');
      if (!(await fs.pathExists(sourceDir))) {
        return [];
      }

      const targetFiles = await fs.readdir(sourceDir).then(files =>
        files.filter(f => f.endsWith('.Target.cs'))
      );

      return targetFiles.map(file => {
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
    } catch {
      return [];
    }
  }

  /**
   * Get default build options for project (static method)
   */
  static async getDefaultOptions(projectPath: string): Promise<Partial<BuildOptions>> {
    const targets = await BuildExecutor.getAvailableTargets(projectPath);
    const hasEditorTarget = targets.some(t => t.type === 'Editor');

    return {
      target: hasEditorTarget ? 'Editor' : 'Game',
      config: 'Development',
      platform: 'Win64'
    };
  }

  /**
   * Execute Unreal Engine build (static method for backward compatibility)
   */
  static async execute(options: BuildOptions): Promise<BuildResult> {
    const executor = new BuildExecutor({
      logger: options.logger,
      stdout: options.stdout,
      stderr: options.stderr,
      silent: options.silent
    });
    return executor.execute(options);
  }

  /**
   * Get available build targets from project (instance method)
   */
  async getAvailableTargetsInstance(projectPath: string): Promise<Array<{ name: string; type: string }>> {
    return BuildExecutor.getAvailableTargets(projectPath);
  }

  /**
   * Get default build options for project (instance method)
   */
  async getDefaultOptionsInstance(projectPath: string): Promise<Partial<BuildOptions>> {
    return BuildExecutor.getDefaultOptions(projectPath);
  }
}
