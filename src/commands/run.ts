import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { execa } from 'execa';
import { Writable } from 'stream';
import { Logger } from '../utils/logger';
import { Validator } from '../utils/validator';
import { BuildExecutor } from '../core/build-executor';
import { EngineResolver } from '../core/engine-resolver';

export interface RunOptions {
  target?: string;
  config?: string;
  platform?: string;
  project?: string;
  enginePath?: string;
  dryRun?: boolean;
  buildFirst?: boolean;
  noBuild?: boolean;
  args?: string[];
  logger?: Logger;
  stdout?: Writable;
  stderr?: Writable;
  silent?: boolean;
  detached?: boolean;
}

export function runCommand(program: Command): void {
  program
    .command('run')
    .description('Run Unreal Engine project (Editor or Game executable)')
    .option('-t, --target <target>', 'Run target (Editor, Game, Client, Server)', 'Editor')
    .option('-c, --config <config>', 'Build configuration (Debug, DebugGame, Development, Shipping, Test)', 'Development')
    .option('-p, --platform <platform>', 'Platform (Win64, Win32, Linux, Mac, Android, IOS)', 'Win64')
    .option('--project <path>', 'Path to project directory or .uproject file')
    .option('--engine-path <path>', 'Path to Unreal Engine installation')
    .option('--dry-run', 'Show what would be run without actually running')
    .option('--build-first', 'Build the project before running')
    .option('--no-build', 'Do not build, just run existing executable')
    .option('--detached', 'Run the process in detached mode (non-blocking)')
    .option('--args <args...>', 'Additional arguments to pass to the executable')
    .action(async (options) => {
      const runner = new ProjectRunner();
      try {
        await runner.run(options);
      } catch (error) {
        runner.getLogger().error(`Run failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });
}

export class ProjectRunner {
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

  async run(options: RunOptions): Promise<void> {
    this.logger.title('Run Unreal Engine Project');

    if (!Validator.isValidBuildTarget(options.target || 'Editor')) {
      this.logger.error(`Invalid run target: ${options.target}`);
      this.logger.info('Valid targets: Editor, Game, Client, Server');
      throw new Error('Invalid target');
    }

    if (!Validator.isValidBuildConfig(options.config || 'Development')) {
      this.logger.error(`Invalid build configuration: ${options.config}`);
      this.logger.info('Valid configurations: Debug, DebugGame, Development, Shipping, Test');
      throw new Error('Invalid config');
    }

    if (!Validator.isValidBuildPlatform(options.platform || 'Win64')) {
      this.logger.error(`Invalid platform: ${options.platform}`);
      this.logger.info('Valid platforms: Win64, Win32, Linux, Mac, Android, IOS');
      throw new Error('Invalid platform');
    }

    if (options.dryRun) {
      await this.dryRun(options);
      return;
    }

    await this.runProject(options);
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
        this.stdout.write(`  Engine: ${engineResult.engine.displayName || engineResult.engine.path}\n`);
      } else {
        this.stdout.write(`  Engine: ${chalk.yellow('Not detected - specify with --engine-path')}\n`);
      }
    } catch {
      this.stdout.write(`  Engine: ${chalk.yellow('Detection failed - specify with --engine-path')}\n`);
    }

    try {
      const executablePath = await this.findExecutable(options);
      if (executablePath && await fs.pathExists(executablePath)) {
        this.stdout.write(`  Executable: ${executablePath}\n`);
        this.stdout.write(`  Executable exists: ${chalk.green('Yes')}\n`);
      } else if (executablePath) {
        this.stdout.write(`  Executable: ${executablePath}\n`);
        this.stdout.write(`  Executable exists: ${chalk.yellow('No - may need to build first')}\n`);
      } else {
        this.stdout.write(`  Executable: ${chalk.yellow('Could not determine path')}\n`);
      }
    } catch {
      this.stdout.write(`  Executable: ${chalk.yellow('Path detection failed')}\n`);
    }

    this.stdout.write('\n');
    this.logger.info('This is a dry run - no actual run will be performed');
    this.stdout.write('To execute the run, remove the --dry-run flag\n');
  }

  private async runProject(options: RunOptions): Promise<void> {
    const startTime = Date.now();

    let projectPath = options.project || process.cwd();
    if (await fs.pathExists(projectPath) && (await fs.stat(projectPath)).isDirectory()) {
      const uprojectFiles = await fs.readdir(projectPath).then(files =>
        files.filter(f => f.endsWith('.uproject'))
      );
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
      this.logger.debug(`Resolved engine path: ${enginePath}`);
    }

    if (options.buildFirst === true) {
      this.logger.info('Building project before running...');
      const buildExecutor = new BuildExecutor({
        logger: this.logger,
        stdout: this.stdout,
        stderr: this.stderr
      });
      const buildResult = await buildExecutor.execute({
        target: options.target,
        config: options.config as any,
        platform: options.platform as any,
        projectPath: projectPath,
        enginePath: options.enginePath,
        verbose: false
      });

      if (!buildResult.success) {
        this.logger.error('Build failed. Cannot run project.');
        throw new Error(`Build failed with exit code ${buildResult.exitCode}`);
      }
    }

    options.enginePath = enginePath;
    const executablePath = await this.findExecutable(options);
    if (!executablePath) {
      throw new Error('Could not determine executable path');
    }

    if (!(await fs.pathExists(executablePath))) {
      throw new Error(`Executable not found: ${executablePath}\nTry building the project first with --build-first`);
    }

    this.logger.info(`Running: ${chalk.bold(path.basename(executablePath))}`);
    this.logger.divider();

    const args = options.args || [];

    const targetLower = (options.target || 'Editor').toLowerCase();
    if (targetLower.includes('editor')) {
      args.unshift(projectPath);
    }

    try {
      const execOptions: any = {
        stdio: options.detached ? 'ignore' : 'inherit',
        cwd: path.dirname(executablePath),
        detached: options.detached
      };

      if (options.detached) {
        const childProcess = execa(executablePath, args, execOptions);
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
        } else {
          this.logger.error(`Process exited with code ${code} after ${duration.toFixed(1)}s`);
        }
      });

      await childProcess;
    } catch (error) {
      throw new Error(`Failed to run executable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async findExecutable(options: RunOptions): Promise<string | null> {
    try {
      let projectPath = options.project || process.cwd();
      let projectDir = projectPath;
      let projectName = '';

      if (await fs.pathExists(projectPath) && (await fs.stat(projectPath)).isDirectory()) {
        const uprojectFiles = await fs.readdir(projectPath).then(files =>
          files.filter(f => f.endsWith('.uproject'))
        );
        if (uprojectFiles.length > 0) {
          projectName = path.basename(uprojectFiles[0], '.uproject');
        }
      } else if (projectPath.endsWith('.uproject')) {
        projectDir = path.dirname(projectPath);
        projectName = path.basename(projectPath, '.uproject');
      }

      if (!projectName) {
        return null;
      }

      let targetName = options.target || 'Editor';
      const availableTargets = await BuildExecutor.getAvailableTargets(projectPath);
      if (availableTargets.length > 0) {
        const genericTypes = ['Editor', 'Game', 'Client', 'Server'];
        const isGenericType = genericTypes.includes(options.target || '');
        if (isGenericType) {
          const matchingTarget = availableTargets.find(t => t.type === options.target);
          if (matchingTarget) {
            targetName = matchingTarget.name;
          }
        }
      }

      const isEditor = targetName.toLowerCase().includes('editor');

      if (isEditor) {
        let enginePath = options.enginePath;
        if (!enginePath) {
          const engineResult = await EngineResolver.resolveEngine(projectPath);
          if (!engineResult.engine) {
            this.logger.warning('Could not resolve engine path for editor target');
            return null;
          }
          enginePath = engineResult.engine.path;
        }

        const platform = options.platform || 'Win64';
        const editorExePath = path.join(
          enginePath,
          'Engine',
          'Binaries',
          platform,
          'UnrealEditor.exe'
        );

        if (await fs.pathExists(editorExePath)) {
          return editorExePath;
        } else {
          const alternativePaths = [
            path.join(enginePath, 'Engine', 'Binaries', platform, 'UnrealEditor-Cmd.exe'),
            path.join(enginePath, 'Engine', 'Binaries', platform, 'UE4Editor.exe'),
            path.join(enginePath, 'Engine', 'Binaries', platform, 'UE5Editor.exe'),
          ];

          for (const altPath of alternativePaths) {
            if (await fs.pathExists(altPath)) {
              return altPath;
            }
          }

          return editorExePath;
        }
      }

      const executableName = `${projectName}.exe`;
      const platform = options.platform || 'Win64';
      const config = options.config || 'Development';

      const possiblePaths = [
        path.join(projectDir, 'Binaries', platform, executableName),
        path.join(projectDir, 'Binaries', platform, `${projectName}-${platform}-${config}`, executableName),
        path.join(projectDir, 'Binaries', platform, `${targetName}.exe`),
        path.join(projectDir, 'Binaries', platform, `${targetName}-${platform}-${config}.exe`),
      ].filter(Boolean) as string[];

      for (const possiblePath of possiblePaths) {
        if (await fs.pathExists(possiblePath)) {
          return possiblePath;
        }
      }

      return path.join(projectDir, 'Binaries', platform, executableName);
    } catch {
      return null;
    }
  }
}

export async function runProject(options: RunOptions): Promise<void> {
  const runner = new ProjectRunner({
    logger: options.logger,
    stdout: options.stdout,
    stderr: options.stderr,
    silent: options.silent
  });
  return runner.run(options);
}
