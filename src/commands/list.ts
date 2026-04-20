/**
 * List command for ubuild CLI
 *
 * Detects and displays information about Unreal Engine projects
 * in the current directory or specified path.
 *
 * @module commands/list
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { Writable } from 'stream';
import { ProjectDetector } from '../core/project-detector';
import { Logger } from '../utils/logger';
import { handleCommandError } from '../utils/error';

/** Options for the list command. */
export interface ListCommandOptions {
  /** Path to project directory or .uproject file */
  project?: string;
  /** Whether to search recursively for .uproject files */
  recursive?: boolean;
  /** Whether to output result as JSON */
  json?: boolean;
  /** Writable stream for stdout output */
  stdout?: Writable;
  /** Writable stream for stderr output */
  stderr?: Writable;
}

/**
 * Executes the list command to detect and display Unreal Engine project information.
 * @param options - Command execution options
 * @returns Promise that resolves when execution completes
 */
export async function executeList(options: ListCommandOptions): Promise<void> {
  const logger = Logger.fromStreams(options.stdout, options.stderr);

  const result = await ProjectDetector.detectProject({
    cwd: options.project || process.cwd(),
    recursive: options.recursive,
  });

  if (options.json) {
    logger.json(result);
    return;
  }

  logger.title('Project Detection');

  if (!result.isValid) {
    logger.error(result.error || 'Project detection failed');
    if (result.warnings.length > 0) {
      logger.warning('Warnings:');
      result.warnings.forEach((warning) => logger.write(`  • ${warning}\n`));
    }
    throw new Error(result.error || 'Project detection failed');
  }

  if (!result.project) {
    logger.error('No project found');
    throw new Error('No project found');
  }

  const project = result.project;

  logger.success(`Found project: ${chalk.bold(project.name)}`);
  logger.write('\n');

  logger.subTitle('Basic Information');
  logger.write(`  Path: ${project.path}\n`);
  logger.write(`  Source Directory: ${project.sourceDir || 'Not found'}\n`);
  logger.write(`  Engine Association: ${project.uproject.EngineAssociation}\n`);

  if (project.uproject.Modules && project.uproject.Modules.length > 0) {
    logger.subTitle('Modules');
    project.uproject.Modules.forEach((module) => {
      logger.write(`  • ${module.Name} (${module.Type}) - Loading: ${module.LoadingPhase}\n`);
    });
  }

  if (project.targets.length > 0) {
    logger.subTitle('Build Targets');
    project.targets.forEach((target) => {
      logger.write(`  • ${target.name} (${target.type})\n`);
    });
  }

  if (project.modules.length > 0) {
    logger.subTitle('Source Modules');
    project.modules.forEach((module) => {
      logger.write(`  • ${module.name}\n`);
    });
  }

  if (project.uproject.Plugins && project.uproject.Plugins.length > 0) {
    logger.subTitle('Plugins');
    project.uproject.Plugins.forEach((plugin) => {
      const status = plugin.Enabled ? chalk.green('Enabled') : chalk.gray('Disabled');
      logger.write(`  • ${plugin.Name} - ${status}\n`);
    });
  }

  if (result.warnings.length > 0) {
    logger.subTitle('Warnings');
    result.warnings.forEach((warning) => {
      logger.write(`  • ${warning}\n`);
    });
  }

  logger.write('\n');
  logger.success('Project detection complete');
}

/**
 * Registers the list command with the Commander program.
 * @param program - The Commander program instance
 */
export function listCommand(program: Command): void {
  program
    .command('list')
    .alias('ls')
    .description('Detect Unreal Engine project in current directory')
    .option('-p, --project <path>', 'Path to project directory or .uproject file')
    .option('-r, --recursive', 'Search recursively for .uproject files')
    .option('-j, --json', 'Output result as JSON')
    .action(async (options) => {
      try {
        await executeList({
          project: options.project,
          recursive: options.recursive,
          json: options.json,
        });
      } catch (error) {
        handleCommandError(error, 'List command failed');
      }
    });
}
