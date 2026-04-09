/**
 * Compile commands generator for IDE integration.
 *
 * Generates compile_commands.json files for clangd-based IDEs (VSCode, CLion, etc.)
 * to enable code completion, navigation, and IntelliSense for Unreal Engine projects.
 *
 * @module core/compile-commands-generator
 */

import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { execa } from 'execa';
import { EngineResolver } from './engine-resolver';
import { ProjectPathResolver } from './project-path-resolver';
import { Logger } from '../utils/logger';
import { TargetResolver } from './target-resolver';
import { formatError } from '../utils/error';
import { DEFAULTS } from '../utils/constants';
import { resolveUnrealBuildToolPath } from '../utils/unreal-paths';

/** Options for generating compile commands database. */
export interface CompileCommandsGenerateOptions {
  /** Build target (Editor, Game, Client, Server) */
  target?: string;
  /** Build configuration (Debug, DebugGame, Development, Shipping, Test) */
  config?: string;
  /** Target platform (Win64, Win32, Linux, Mac) */
  platform?: string;
  /** Path to project directory or .uproject file */
  project?: string;
  /** Path to Unreal Engine installation */
  enginePath?: string;
  /** Whether to include plugin sources in compile commands */
  includePluginSources?: boolean;
  /** Whether to include engine sources in compile commands */
  includeEngineSources?: boolean;
  /** Whether to use engine includes in compile commands */
  useEngineIncludes?: boolean;
  /** Suppress all output */
  silent?: boolean;
}

/**
 * Generates compile_commands.json for IDE integration (VSCode, CLion, etc.).
 * Uses UnrealBuildTool to generate the clang database for code completion and IntelliSense.
 */
export class CompileCommandsGenerator {
  /**
   * Generates compile_commands.json for the specified project and options.
   * @param options - Generation options including target, config, platform, and paths
   * @returns Promise resolving to the path of the generated compile_commands.json file
   * @throws Error if project file not found, UBT not found, or generation fails
   */
  static async generate(options: CompileCommandsGenerateOptions): Promise<string> {
    const projectPath = await ProjectPathResolver.resolveOrThrow(options.project || process.cwd());
    const silent = options.silent || false;
    const logger = new Logger({ silent });

    if (!(await fs.pathExists(projectPath))) {
      throw new Error(`Project file not found: ${projectPath}`);
    }

    const enginePath = await EngineResolver.resolveEnginePath({
      projectPath,
      enginePath: options.enginePath,
    });

    const projectDir = path.dirname(projectPath);
    const target = options.target || DEFAULTS.BUILD_TARGET;
    const platform = options.platform || DEFAULTS.BUILD_PLATFORM;
    const config = options.config || DEFAULTS.BUILD_CONFIG;
    const targetName = await this.resolveTargetName(projectPath, target);

    const ubtPath = await resolveUnrealBuildToolPath(enginePath);

    const targetNames = targetName.split(' ').filter(Boolean);

    const args = ['-mode=GenerateClangDatabase', `-Project=${projectPath}`];

    for (const resolvedTarget of targetNames) {
      args.push(`-Target="${resolvedTarget} ${platform} ${config}"`);
    }

    if (options.includePluginSources) {
      args.push('-IncludePluginSources');
    }

    if (options.includeEngineSources) {
      args.push('-IncludeEngineSources');
    }

    if (options.useEngineIncludes) {
      args.push('-UseEngineIncludes');
    }

    logger.info(
      `Generating compile commands for: ${chalk.bold(targetNames.join(', '))} | ${chalk.bold(platform)} | ${chalk.bold(config)}`
    );
    logger.info(`Project: ${projectPath}`);
    logger.info(`Engine: ${enginePath}`);
    logger.divider();

    logger.debug(`Executing: ${ubtPath} ${args.join(' ')}`);

    const childProcess = execa(ubtPath, args, {
      stdio: 'pipe',
      cwd: path.dirname(ubtPath),
      reject: false,
    });

    if (childProcess.stdout) {
      childProcess.stdout.on('data', (data: Buffer) => {
        logger.info(data.toString().trim());
      });
    }

    if (childProcess.stderr) {
      childProcess.stderr.on('data', (data: Buffer) => {
        logger.error(data.toString().trim());
      });
    }

    const result = await childProcess;

    if (!result || result.exitCode !== 0) {
      throw new Error(
        `Generate compile commands failed with exit code ${result?.exitCode ?? 'unknown'}`
      );
    }

    const vscodeDir = path.join(projectDir, '.vscode');
    await fs.ensureDir(vscodeDir);

    const targetCompileCommandsPath = path.join(vscodeDir, 'compile_commands.json');
    const engineCompileCommandsPath = path.join(enginePath, 'compile_commands.json');

    if (await fs.pathExists(engineCompileCommandsPath)) {
      logger.debug(
        'Found compile_commands.json at engine directory, copying to project .vscode directory'
      );
      await fs.copy(engineCompileCommandsPath, targetCompileCommandsPath);
      await fs.remove(engineCompileCommandsPath);
    }

    if (!(await fs.pathExists(targetCompileCommandsPath))) {
      throw new Error(
        `compile_commands.json not found at expected location: ${targetCompileCommandsPath}`
      );
    }

    await this.updateVSCodeSettings(projectDir, logger);

    return targetCompileCommandsPath;
  }

  /**
   * Resolves a generic target name (e.g., 'Editor', 'Game') to a specific project target.
   * Falls back to a default target if resolution fails.
   * @param projectPath - Path to the .uproject file
   * @param target - Generic target name to resolve
   * @returns Promise resolving to the resolved target name or a default target
   */
  private static async resolveTargetName(projectPath: string, target: string): Promise<string> {
    const resolved = await TargetResolver.resolveTargetName(projectPath, target);
    // If resolution fails (returns undefined), fall back to the original target
    return resolved ?? target;
  }

  /**
   * Updates VSCode settings to configure clangd and C/C++ extension for Unreal Engine development.
   * Creates or merges settings.json in the .vscode directory to point to the compile commands database.
   * @param projectDir - Path to the project directory
   * @param logger - Logger instance for output
   * @returns Promise resolving when settings have been updated
   */
  private static async updateVSCodeSettings(projectDir: string, logger: Logger): Promise<void> {
    const vscodeDir = path.join(projectDir, '.vscode');
    await fs.ensureDir(vscodeDir);
    const settingsPath = path.join(vscodeDir, 'settings.json');

    const clangdConfig = {
      'clangd.arguments': [
        '--compile-commands-dir=${workspaceFolder}/.vscode',
        '--background-index',
        '--j=8',
        '--index-store-path=.clangd/index',
        '--pch-storage=disk',
        '--limit-results=200',
        '--header-insertion=iwyu',
      ],
    };

    const cppConfig = {
      'C_Cpp.default.compileCommands': '${workspaceFolder}/.vscode/compile_commands.json',
      'C_Cpp.intelliSenseEngine': 'disabled',
    };

    let settings: Record<string, unknown> = {};

    if (await fs.pathExists(settingsPath)) {
      try {
        const content = await fs.readFile(settingsPath, 'utf-8');
        settings = JSON.parse(content);
      } catch (error) {
        logger.debug(
          `Failed to parse existing settings.json, starting fresh: ${formatError(error)}`
        );
        settings = {};
      }
    }

    settings = { ...settings, ...clangdConfig, ...cppConfig };

    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
    logger.success(`Updated VSCode settings: ${settingsPath}`);
  }
}
