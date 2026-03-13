import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { execa } from 'execa';
import { EngineResolver } from '../core/engine-resolver';
import { Logger } from '../utils/logger';
import { Platform } from '../utils/platform';
import { BuildExecutor } from '../core/build-executor';

export function gencodebaseCommand(program: Command): void {
  program
    .command('gencodebase')
    .description('Generate compile_commands.json for IDE (VSCode clangd, CLion, etc.)')
    .option(
      '-t, --target <target>',
      'Build targets (Editor is recommended for IDE code completion)',
      'Editor'
    )
    .option(
      '-c, --config <config>',
      'Build configuration (Debug, DebugGame, Development, Shipping, Test)',
      'Development'
    )
    .option('-p, --platform <platform>', 'Platform (Win64, Win32, Linux, Mac)', 'Win64')
    .option('--project <path>', 'Path to project directory or .uproject file')
    .option('--engine-path <path>', 'Path to Unreal Engine installation')
    .option('--include-plugin-sources', 'Include plugin sources in compile commands', true)
    .option('--no-include-plugin-sources', 'Exclude plugin sources')
    .option('--include-engine-sources', 'Include engine sources in compile commands', true)
    .option('--no-include-engine-sources', 'Exclude engine sources')
    .option('--use-engine-includes', 'Use engine includes in compile commands', true)
    .option('--no-use-engine-includes', 'Do not use engine includes')
    .option('--json', 'Output result as JSON')
    .action(async (options) => {
      try {
        Logger.title('Generate Compile Commands Database');

        const compileCommandsPath = await generateCompileCommands(options);

        if (options.json) {
          console.log(JSON.stringify({ success: true, path: compileCommandsPath }, null, 2));
          return;
        }

        Logger.success(`Compile commands generated: ${chalk.bold(compileCommandsPath)}`);
        console.log();
        Logger.subTitle('Usage with VSCode clangd:');
        console.log(`  Add to .vscode/settings.json:`);
        console.log(`  ${chalk.gray('{')}`);
        console.log(
          `    "clangd.arguments": ["--compile-commands-dir=${path.dirname(compileCommandsPath)}"],`
        );
        console.log(`    "C_Cpp.default.compileCommands": "${compileCommandsPath}"`);
        console.log(`  ${chalk.gray('}')}`);
        console.log();
        Logger.info(
          'Or use the C/C++ extension with: "C_Cpp.default.compileCommands": "${workspaceFolder}/compile_commands.json"'
        );
      } catch (error) {
        Logger.error(
          `Failed to generate compile commands: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }
    });
}

async function generateCompileCommands(options: any): Promise<string> {
  let projectPath = options.project || process.cwd();

  if ((await fs.pathExists(projectPath)) && (await fs.stat(projectPath)).isDirectory()) {
    const uprojectFiles = await fs
      .readdir(projectPath)
      .then((files) => files.filter((f) => f.endsWith('.uproject')));
    if (uprojectFiles.length > 0) {
      projectPath = path.join(projectPath, uprojectFiles[0]);
    } else {
      throw new Error(`No .uproject file found in project directory: ${projectPath}`);
    }
  }

  if (!(await fs.pathExists(projectPath))) {
    throw new Error(`Project file not found: ${projectPath}`);
  }

  let enginePath = options.enginePath;
  if (!enginePath) {
    const engineResult = await EngineResolver.resolveEngine(projectPath);
    if (!engineResult.engine) {
      throw new Error('Could not determine engine path. Please specify --engine-path');
    }
    enginePath = engineResult.engine.path;
  }

  if (!(await fs.pathExists(enginePath))) {
    throw new Error(`Engine path does not exist: ${enginePath}`);
  }

  const projectDir = path.dirname(projectPath);
  const targetName = await resolveTargetName(projectPath, options.target, options.platform);

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

  for (const target of targetNames) {
    args.push(`-Target="${target} ${options.platform} ${options.config}"`);
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

  Logger.info(
    `Generating compile commands for: ${chalk.bold(targetNames.join(', '))} | ${chalk.bold(options.platform)} | ${chalk.bold(options.config)}`
  );
  Logger.info(`Project: ${projectPath}`);
  Logger.info(`Engine: ${enginePath}`);
  Logger.divider();

  const command = `"${ubtPath}" ${args.join(' ')}`;
  Logger.debug(`Executing: ${command}`);

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
      `Found compile_commands.json at engine directory, copying to project .vscode directory`
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

  return actualCompileCommandsPath;
}

async function resolveTargetName(
  projectPath: string,
  target: string,
  _platform: string
): Promise<string> {
  const availableTargets = await BuildExecutor.getAvailableTargets(projectPath);

  if (availableTargets.length === 0) {
    return target;
  }

  const targetList = target.split(' ').filter(Boolean);
  const resolvedTargets: string[] = [];

  const genericTypes = ['Editor', 'Game', 'Client', 'Server'];

  for (const t of targetList) {
    const isGenericType = genericTypes.includes(t);

    if (isGenericType) {
      const matchingTarget = availableTargets.find((at) => at.type === t);
      if (matchingTarget) {
        resolvedTargets.push(matchingTarget.name);
        continue;
      }
      const fallbackTarget = availableTargets.find((at) =>
        at.name.toLowerCase().includes(t.toLowerCase())
      );
      if (fallbackTarget) {
        resolvedTargets.push(fallbackTarget.name);
        continue;
      }
    }

    const targetExists = availableTargets.some((at) => at.name === t);
    if (targetExists) {
      resolvedTargets.push(t);
    } else if (availableTargets.length > 0) {
      resolvedTargets.push(availableTargets[0].name);
    }
  }

  if (resolvedTargets.length === 0) {
    return 'Editor Game';
  }

  return resolvedTargets.join(' ');
}
