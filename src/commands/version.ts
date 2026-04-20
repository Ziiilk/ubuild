/**
 * Version command for ubuild CLI
 *
 * Displays the current version of ubuild and package information.
 *
 * @module commands/version
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { Writable } from 'stream';
import { Logger } from '../utils/logger';
import { formatError, handleCommandError } from '../utils/error';
import fs from 'fs-extra';
import path from 'path';

/** Options for the version command. */
export interface VersionCommandOptions {
  /** Whether to output result as JSON */
  json?: boolean;
  /** Writable stream for stdout output */
  stdout?: Writable;
  /** Writable stream for stderr output */
  stderr?: Writable;
}

/** Result of reading version information. */
export interface VersionInfo {
  /** Package version */
  version: string;
  /** Package name */
  name: string;
  /** Package description */
  description: string;
}

/**
 * Reads version information from package.json.
 * @returns Promise resolving to version information
 */
async function getVersionInfo(logger: Logger): Promise<VersionInfo> {
  // Traverse up from src/commands/ to find package.json
  const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');

  try {
    const packageJson = await fs.readJson(packageJsonPath);
    return {
      version: packageJson.version || 'unknown',
      name: packageJson.name || '@zitool/ubuild',
      description: packageJson.description || 'Unreal Engine project management CLI tool',
    };
  } catch (error) {
    logger.debug(`Failed to read package.json: ${formatError(error)}`);
    // Fallback if package.json cannot be read
    return {
      version: 'unknown',
      name: '@zitool/ubuild',
      description: 'Unreal Engine project management CLI tool',
    };
  }
}

/**
 * Executes the version command to display ubuild version information.
 * @param options - Command execution options
 * @returns Promise that resolves when execution completes
 */
export async function executeVersion(options: VersionCommandOptions = {}): Promise<void> {
  const logger = Logger.fromStreams(options.stdout, options.stderr);

  const info = await getVersionInfo(logger);

  if (options.json) {
    logger.json(info);
    return;
  }

  logger.title('ubuild - Unreal Engine Project Management');
  logger.write(`\n`);
  logger.write(`  Version: ${chalk.bold.cyan(info.version)}\n`);
  logger.write(`  Package: ${chalk.gray(info.name)}\n`);
  logger.write(`\n`);
  logger.write(`${info.description}\n`);
  logger.write(`\n`);
  logger.success('Version information retrieved successfully');
}

/**
 * Registers the version command with the Commander program.
 * @param program - The Commander program instance
 */
export function versionCommand(program: Command): void {
  program
    .command('version')
    .alias('v')
    .description('Display ubuild version information')
    .option('-j, --json', 'Output result as JSON')
    .action(async (options) => {
      try {
        await executeVersion({
          json: options.json,
        });
      } catch (error) {
        handleCommandError(error, 'Failed to retrieve version');
      }
    });
}
