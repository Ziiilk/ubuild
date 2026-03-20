import { Command } from 'commander';
import chalk from 'chalk';
import { ProjectDetector } from '../core/project-detector';
import { Logger } from '../utils/logger';

function writeLine(message = ''): void {
  Logger.write(`${message}\n`);
}

export function listCommand(program: Command): void {
  program
    .command('list')
    .alias('ls')
    .description('Detect Unreal Engine project in current directory')
    .option('-r, --recursive', 'Search recursively for .uproject files')
    .option('-j, --json', 'Output result as JSON')
    .action(async (options) => {
      try {
        Logger.title('Project Detection');

        const result = await ProjectDetector.detectProject({
          cwd: process.cwd(),
          recursive: options.recursive,
        });

        if (options.json) {
          Logger.json(result);
          return;
        }

        if (!result.isValid) {
          Logger.error(result.error || 'Project detection failed');
          if (result.warnings.length > 0) {
            Logger.warning('Warnings:');
            result.warnings.forEach((warning) => writeLine(`  • ${warning}`));
          }
          process.exit(1);
        }

        if (!result.project) {
          Logger.error('No project found');
          process.exit(1);
        }

        const project = result.project;

        Logger.success(`Found project: ${chalk.bold(project.name)}`);
        writeLine();

        Logger.subTitle('Basic Information');
        writeLine(`  Path: ${project.path}`);
        writeLine(`  Source Directory: ${project.sourceDir || 'Not found'}`);
        writeLine(`  Engine Association: ${project.uproject.EngineAssociation}`);

        if (project.uproject.Modules.length > 0) {
          Logger.subTitle('Modules');
          project.uproject.Modules.forEach((module) => {
            writeLine(`  • ${module.Name} (${module.Type}) - Loading: ${module.LoadingPhase}`);
          });
        }

        if (project.targets.length > 0) {
          Logger.subTitle('Build Targets');
          project.targets.forEach((target) => {
            writeLine(`  • ${target.name} (${target.type})`);
          });
        }

        if (project.modules.length > 0) {
          Logger.subTitle('Source Modules');
          project.modules.forEach((module) => {
            writeLine(`  • ${module.name}`);
          });
        }

        if (project.uproject.Plugins && project.uproject.Plugins.length > 0) {
          Logger.subTitle('Plugins');
          project.uproject.Plugins.forEach((plugin) => {
            const status = plugin.Enabled ? chalk.green('Enabled') : chalk.gray('Disabled');
            writeLine(`  • ${plugin.Name} - ${status}`);
          });
        }

        if (result.warnings.length > 0) {
          Logger.subTitle('Warnings');
          result.warnings.forEach((warning) => {
            writeLine(`  • ${warning}`);
          });
        }

        writeLine();
        Logger.success('Project detection complete');
      } catch (error) {
        Logger.error(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });
}
