import { Command } from 'commander';
import chalk from 'chalk';
import { execa } from 'execa';
import inquirer from 'inquirer';
import { Logger } from '../utils/logger';

export function updateCommand(program: Command): void {
  program
    .command('update')
    .description('Update ubuild to the latest version')
    .option('-g, --global', 'Update globally installed ubuild')
    .option('-y, --yes', 'Skip confirmation and update automatically')
    .action(async (options) => {
      try {
        Logger.title('Update ubuild');

        // Get current version
        const currentVersion = require('../../package.json').version;
        Logger.info(`Current version: ${chalk.bold(currentVersion)}`);

        // Fetch latest version from npm
        Logger.info('Checking for latest version...');

        try {
          const { stdout: npmViewOutput } = await execa('npm', [
            'view',
            '@zitool/ubuild',
            'version',
          ]);
          const latestVersion = npmViewOutput.trim();

          if (!latestVersion) {
            Logger.error('Unable to fetch latest version from npm');
            process.exit(1);
          }

          Logger.info(`Latest version: ${chalk.bold(latestVersion)}`);

          // Compare versions
          if (latestVersion === currentVersion) {
            Logger.success('You are already using the latest version!');
            return;
          }

          // Check if update is needed
          const needsUpdate = compareVersions(latestVersion, currentVersion) > 0;

          if (!needsUpdate) {
            Logger.success('You are already using the latest version!');
            return;
          }

          Logger.warning(`Update available: ${currentVersion} → ${latestVersion}`);

          // Confirm update unless -y flag is set
          if (!options.yes) {
            const answers = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'confirm',
                message: 'Do you want to update now?',
                default: true,
              },
            ]);

            if (!answers.confirm) {
              Logger.info('Update cancelled');
              return;
            }
          }

          // Perform update
          Logger.info('Updating ubuild...');

          if (options.global) {
            await execa('npm', ['install', '-g', '@zitool/ubuild']);
          } else {
            await execa('npm', ['install', '@zitool/ubuild@latest']);
          }

          // Get new version
          const { stdout: newVersionOutput } = await execa('npm', [
            'list',
            '@zitool/ubuild',
            '--depth=0',
          ]);
          const newVersionMatch = newVersionOutput.match(/@zitool\/ubuild@([0-9.]+)/);
          const newVersion = newVersionMatch ? newVersionMatch[1] : latestVersion;

          Logger.success(`Successfully updated to version ${chalk.bold(newVersion)}!`);
          Logger.info('You may need to restart your terminal for changes to take effect.');
        } catch (npmError) {
          Logger.error(
            `Failed to check npm: ${npmError instanceof Error ? npmError.message : String(npmError)}`
          );
          Logger.info('You can manually update using: npm install -g @zitool/ubuild');
          process.exit(1);
        }
      } catch (error) {
        Logger.error(`Update failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });
}

function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const partA = partsA[i] || 0;
    const partB = partsB[i] || 0;
    if (partA !== partB) {
      return partA - partB;
    }
  }
  return 0;
}
