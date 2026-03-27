/**
 * Update command for ubuild CLI
 *
 * Updates ubuild to the latest version from npm registry.
 * Detects whether installed globally or locally and updates accordingly.
 *
 * @module commands/update
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';
import { Writable } from 'stream';
import { Logger } from '../utils/logger';
import { compareVersions } from '../utils/version';
import { formatError, handleCommandError } from '../utils/error';

export interface UpdateCommandOptions {
  /** Writable stream for standard output (defaults to process.stdout) */
  stdout?: Writable;
  /** Writable stream for error output (defaults to process.stderr) */
  stderr?: Writable;
}

/**
 * Reads the current version from package.json.
 * @returns Promise resolving to the current version string
 * @throws Error if package.json cannot be read or version is missing
 */
async function getCurrentVersion(): Promise<string> {
  const packageJsonPath = path.resolve(__dirname, '../../package.json');
  const packageJson = await fs.readJson(packageJsonPath);

  if (typeof packageJson !== 'object' || packageJson === null) {
    throw new Error('Invalid package.json format');
  }

  if (!('version' in packageJson) || typeof packageJson.version !== 'string') {
    throw new Error('Missing or invalid version in package.json');
  }

  return packageJson.version;
}

/**
 * Checks if ubuild is installed globally via npm.
 * @param logger - Logger instance for debug output
 * @returns Promise resolving to true if installed globally
 */
async function isGlobalInstall(logger: Logger): Promise<boolean> {
  try {
    const { stdout: listOutput } = await execa('npm', [
      'list',
      '-g',
      '@zitool/ubuild',
      '--depth=0',
    ]);
    return listOutput.includes('@zitool/ubuild');
  } catch (error) {
    logger.debug(`isGlobalInstall check failed: ${formatError(error)}`);
    return false;
  }
}

/**
 * Executes the update command to check for and install updates.
 * @param options - Configuration options for output streams
 */
export async function executeUpdate(options: UpdateCommandOptions = {}): Promise<void> {
  const logger = new Logger({ stdout: options.stdout, stderr: options.stderr });

  try {
    logger.title('Update ubuild');

    const currentVersion = await getCurrentVersion();
    logger.info(`Current version: ${chalk.bold(currentVersion)}`);

    logger.info('Checking for latest version...');

    const { stdout: npmViewOutput } = await execa('npm', ['view', '@zitool/ubuild', 'version']);
    const latestVersion = npmViewOutput.trim();

    if (!latestVersion) {
      logger.error('Unable to fetch latest version from npm');
      throw new Error('Unable to fetch latest version from npm');
    }

    logger.info(`Latest version: ${chalk.bold(latestVersion)}`);

    if (latestVersion === currentVersion) {
      logger.success('You are already using the latest version!');
      return;
    }

    const needsUpdate = compareVersions(latestVersion, currentVersion) > 0;

    if (!needsUpdate) {
      logger.success('You are already using the latest version!');
      return;
    }

    logger.warning(`Update available: ${currentVersion} → ${latestVersion}`);
    logger.info('Updating ubuild...');

    const isGlobal = await isGlobalInstall(logger);

    if (isGlobal) {
      logger.info('Detected global installation, updating globally...');
      await execa('npm', ['install', '-g', '@zitool/ubuild']);
    } else {
      logger.info('Detected local installation, updating locally...');
      await execa('npm', ['install', '@zitool/ubuild@latest']);
    }

    const { stdout: newVersionOutput } = await execa('npm', [
      'list',
      '@zitool/ubuild',
      '--depth=0',
    ]);
    const newVersionMatch = newVersionOutput.match(/@zitool\/ubuild@([0-9.]+)/);
    const newVersion = newVersionMatch ? newVersionMatch[1] : latestVersion;

    logger.success(`Successfully updated to version ${chalk.bold(newVersion)}!`);
    logger.info('You may need to restart your terminal for changes to take effect.');
  } catch (error) {
    // Add hint to error message for context
    const enhancedError = new Error(
      `${formatError(error)}\nYou can manually update using: npm install -g @zitool/ubuild`
    );
    throw enhancedError;
  }
}

/**
 * Registers the 'update' command for updating ubuild.
 *
 * This command checks for the latest version of ubuild on npm and updates
 * the installation (global or local) to the latest version.
 *
 * @param program - The Commander program instance
 *
 * @example
 * ```typescript
 * updateCommand(program);
 * ```
 */
export function updateCommand(program: Command): void {
  program
    .command('update')
    .description('Update ubuild to the latest version')
    .action(async () => {
      try {
        await executeUpdate();
      } catch (error) {
        handleCommandError(error, 'Update failed');
      }
    });
}
