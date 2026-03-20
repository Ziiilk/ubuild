import { Command } from 'commander';
import chalk from 'chalk';
import { EngineResolver } from '../core/engine-resolver';
import { Logger } from '../utils/logger';
import { ProjectDetector } from '../core/project-detector';

function writeLine(message = ''): void {
  Logger.write(`${message}\n`);
}

export function engineCommand(program: Command): void {
  program
    .command('engine')
    .description('Display engine information for the current project')
    .option('-p, --project <path>', 'Path to project directory or .uproject file')
    .option('-j, --json', 'Output result as JSON')
    .option('-v, --verbose', 'Show verbose engine detection details')
    .action(async (options) => {
      try {
        Logger.title('Engine Information');

        let projectPath = options.project || process.cwd();

        const projectResult = await ProjectDetector.detectProject({ cwd: projectPath });
        if (projectResult.project) {
          projectPath = projectResult.project.path;
        }

        const result = await EngineResolver.resolveEngine(projectPath);

        if (options.json) {
          Logger.json(result);
          return;
        }

        if (options.verbose) {
          Logger.subTitle('Engine Detection Details');
          const allInstallations = await EngineResolver.findEngineInstallations();
          writeLine(`Total engines detected: ${allInstallations.length}`);

          if (allInstallations.length > 0) {
            allInstallations.forEach((engine, index) => {
              writeLine(`\n  Engine ${index + 1}:`);
              writeLine(`    Path: ${engine.path}`);
              writeLine(`    Source: ${engine.source || 'unknown'}`);
              writeLine(`    Association ID: ${engine.associationId}`);
              writeLine(`    Display Name: ${engine.displayName || '(none)'}`);
              if (engine.version) {
                writeLine(
                  `    Version: ${engine.version.MajorVersion}.${engine.version.MinorVersion}.${engine.version.PatchVersion}`
                );
              }
              if (engine.installedDate) {
                writeLine(`    Installed: ${engine.installedDate}`);
              }
            });
          }
          writeLine();
        }

        if (result.error) {
          Logger.error(result.error);
          process.exit(1);
        }

        if (result.engine && result.uprojectEngine) {
          const engine = result.engine;
          Logger.success(
            `Found engine for project: ${chalk.bold(engine.displayName || engine.associationId)}`
          );

          Logger.subTitle('Engine Details');
          writeLine(`  Path: ${engine.path}`);

          if (engine.version) {
            writeLine(
              `  Version: ${engine.version.MajorVersion}.${engine.version.MinorVersion}.${engine.version.PatchVersion}`
            );
            writeLine(`  Build ID: ${engine.version.BuildId}`);
            writeLine(`  Branch: ${engine.version.BranchName}`);
            writeLine(`  Changelist: ${engine.version.Changelist}`);
            writeLine(`  Promoted Build: ${engine.version.IsPromotedBuild ? 'Yes' : 'No'}`);
          }

          writeLine(`  Association ID: ${engine.associationId}`);
          if (engine.installedDate) {
            writeLine(`  Installed: ${engine.installedDate}`);
          }
        } else if (!result.engine) {
          Logger.warning('No engine installation found');
        }

        if (result.uprojectEngine) {
          Logger.subTitle('Project Engine Association');
          writeLine(`  GUID: ${result.uprojectEngine.guid}`);
          if (result.uprojectEngine.name) {
            writeLine(`  Name: ${result.uprojectEngine.name}`);
          }
          if (result.uprojectEngine.path) {
            writeLine(`  Path: ${result.uprojectEngine.path}`);
          }
          if (result.uprojectEngine.version) {
            writeLine(`  Version: ${result.uprojectEngine.version}`);
          }

          if (!result.engine) {
            Logger.warning(
              'Engine association found in project, but no matching engine installation detected'
            );
          }
        }

        if (result.warnings.length > 0) {
          Logger.subTitle('Warnings');
          result.warnings.forEach((warning) => {
            writeLine(`  • ${warning}`);
          });
        }

        writeLine();
        if (result.engine && result.uprojectEngine) {
          Logger.success('Engine information retrieved successfully');
        } else if (!result.engine) {
          Logger.warning('No engine installation found');
        }
      } catch (error) {
        Logger.error(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });
}
