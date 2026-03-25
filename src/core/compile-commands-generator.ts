import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { execa } from 'execa';
import { EngineResolver } from './engine-resolver';
import { BuildExecutor } from './build-executor';
import { ProjectPathResolver } from './project-path-resolver';
import { Platform } from '../utils/platform';
import { Logger } from '../utils/logger';

export interface CompileCommandsGenerateOptions {
  target?: string;
  config?: string;
  platform?: string;
  project?: string;
  enginePath?: string;
  includePluginSources?: boolean;
  includeEngineSources?: boolean;
  useEngineIncludes?: boolean;
  silent?: boolean;
}

export class CompileCommandsGenerator {
  static async generate(options: CompileCommandsGenerateOptions): Promise<string> {
    const projectPath = await ProjectPathResolver.resolveOrThrow(options.project || process.cwd());
    const silent = options.silent || false;

    if (!(await fs.pathExists(projectPath))) {
      throw new Error(`Project file not found: ${projectPath}`);
    }

    const enginePath = await EngineResolver.resolveEnginePath({
      projectPath,
      enginePath: options.enginePath,
    });

    const projectDir = path.dirname(projectPath);
    const target = options.target || 'Editor';
    const platform = options.platform || 'Win64';
    const config = options.config || 'Development';
    const targetName = await this.resolveTargetName(projectPath, target);

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

    const targetNames = targetName.split(' ').filter(Boolean);

    const args = ['-mode=GenerateClangDatabase', `-Project="${projectPath}"`];

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

    if (!silent) {
      Logger.info(
        `Generating compile commands for: ${chalk.bold(targetNames.join(', '))} | ${chalk.bold(platform)} | ${chalk.bold(config)}`
      );
      Logger.info(`Project: ${projectPath}`);
      Logger.info(`Engine: ${enginePath}`);
      Logger.divider();
    }

    const command = `"${ubtPath}" ${args.join(' ')}`;
    if (!silent) {
      Logger.debug(`Executing: ${command}`);
    }

    const childProcess = execa(command, {
      stdio: 'pipe',
      cwd: path.dirname(ubtPath),
      shell: true,
    });

    if (childProcess.stdout) {
      childProcess.stdout.on('data', (data: Buffer) => {
        process.stdout.write(data.toString());
      });
    }

    if (childProcess.stderr) {
      childProcess.stderr.on('data', (data: Buffer) => {
        process.stderr.write(data.toString());
      });
    }

    const result = await childProcess;

    if (result.exitCode !== 0) {
      throw new Error(`Generate compile commands failed with exit code ${result.exitCode}`);
    }

    const vscodeDir = path.join(projectDir, '.vscode');
    await fs.ensureDir(vscodeDir);

    const targetCompileCommandsPath = path.join(vscodeDir, 'compile_commands.json');
    const engineCompileCommandsPath = path.join(enginePath, 'compile_commands.json');

    let actualCompileCommandsPath = targetCompileCommandsPath;

    if (await fs.pathExists(engineCompileCommandsPath)) {
      Logger.debug(
        'Found compile_commands.json at engine directory, copying to project .vscode directory'
      );
      await fs.copy(engineCompileCommandsPath, targetCompileCommandsPath);
      await fs.remove(engineCompileCommandsPath);
      actualCompileCommandsPath = targetCompileCommandsPath;
    }

    if (!(await fs.pathExists(actualCompileCommandsPath))) {
      throw new Error(
        `compile_commands.json not found at expected location: ${actualCompileCommandsPath}`
      );
    }

    await this.updateVSCodeSettings(projectDir, silent);

    return actualCompileCommandsPath;
  }

  private static async resolveTargetName(projectPath: string, target: string): Promise<string> {
    const availableTargets = await BuildExecutor.getAvailableTargets(projectPath);

    if (availableTargets.length === 0) {
      return target;
    }

    const targetList = target.split(' ').filter(Boolean);
    const resolvedTargets: string[] = [];

    const genericTypes = ['Editor', 'Game', 'Client', 'Server'];

    for (const requestedTarget of targetList) {
      const isGenericType = genericTypes.includes(requestedTarget);

      if (isGenericType) {
        const matchingTarget = availableTargets.find(
          (availableTarget) => availableTarget.type === requestedTarget
        );
        if (matchingTarget) {
          resolvedTargets.push(matchingTarget.name);
          continue;
        }

        const fallbackTarget = availableTargets.find((availableTarget) =>
          availableTarget.name.toLowerCase().includes(requestedTarget.toLowerCase())
        );
        if (fallbackTarget) {
          resolvedTargets.push(fallbackTarget.name);
          continue;
        }
      }

      const targetExists = availableTargets.some(
        (availableTarget) => availableTarget.name === requestedTarget
      );
      if (targetExists) {
        resolvedTargets.push(requestedTarget);
      } else if (availableTargets.length > 0) {
        resolvedTargets.push(availableTargets[0].name);
      }
    }

    if (resolvedTargets.length === 0) {
      return 'Editor Game';
    }

    return resolvedTargets.join(' ');
  }

  private static async updateVSCodeSettings(projectDir: string, silent = false): Promise<void> {
    const vscodeDir = path.join(projectDir, '.vscode');
    const settingsPath = path.join(vscodeDir, 'settings.json');

    const clangdConfig = {
      'clangd.arguments': ['--compile-commands-dir=${workspaceFolder}/.vscode'],
    };

    const cppConfig = {
      'C_Cpp.default.compileCommands': '${workspaceFolder}/.vscode/compile_commands.json',
    };

    let settings: Record<string, unknown> = {};

    if (await fs.pathExists(settingsPath)) {
      try {
        const content = await fs.readFile(settingsPath, 'utf-8');
        settings = JSON.parse(content);
      } catch {
        settings = {};
      }
    }

    settings = { ...settings, ...clangdConfig, ...cppConfig };

    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
    if (!silent) {
      Logger.success(`Updated VSCode settings: ${settingsPath}`);
    }
  }
}
