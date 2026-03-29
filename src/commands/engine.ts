/**
 * Engine command for ubuild CLI
 *
 * Displays information about the Unreal Engine installation
 * associated with the current project or specified path.
 *
 * @module commands/engine
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { Writable } from 'stream';
import { EngineResolver } from '../core/engine-resolver';
import { Logger } from '../utils/logger';
import { ProjectDetector } from '../core/project-detector';
import { handleCommandError } from '../utils/error';

/** Options for the engine command. */
export interface EngineCommandOptions {
  /** Path to project directory or .uproject file */
  project?: string;
  /** Output result as JSON */
  json?: boolean;
  /** Show verbose engine detection details */
  verbose?: boolean;
  /** Writable stream for standard output (defaults to process.stdout) */
  stdout?: Writable;
  /** Writable stream for error output (defaults to process.stderr) */
  stderr?: Writable;
}

/**
 * Executes the engine command to display engine information.
 *
 * Resolves the Unreal Engine installation for the current project and displays
 * detailed information about the engine including version, path, and association.
 *
 * @param options - Configuration options for the engine command
 * @returns Promise that resolves when the command completes
 *
 * @example
 * ```typescript
 * await executeEngine({ project: './MyProject', verbose: true });
 * ```
 */
export async function executeEngine(options: EngineCommandOptions): Promise<void> {
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;

  const logger = new Logger({ stdout, stderr });

  try {
    if (!options.json) {
      logger.title('Engine Information');
    }

    let projectPath = options.project || process.cwd();

    const projectResult = await ProjectDetector.detectProject({ cwd: projectPath });
    if (projectResult.project) {
      projectPath = projectResult.project.path;
    }

    const result = await EngineResolver.resolveEngine(projectPath);

    if (options.json) {
      logger.json(result);
      return;
    }

    if (options.verbose) {
      logger.subTitle('Engine Detection Details');
      const allInstallations = await EngineResolver.findEngineInstallations();
      logger.write(`Total engines detected: ${allInstallations.length}`);

      if (allInstallations.length > 0) {
        allInstallations.forEach((engine, index) => {
          logger.write(`\n  Engine ${index + 1}:`);
          logger.write(`    Path: ${engine.path}`);
          logger.write(`    Source: ${engine.source || 'unknown'}`);
          logger.write(`    Association ID: ${engine.associationId}`);
          logger.write(`    Display Name: ${engine.displayName || '(none)'}`);
          if (engine.version) {
            logger.write(
              `    Version: ${engine.version.MajorVersion}.${engine.version.MinorVersion}.${engine.version.PatchVersion}`
            );
          }
          if (engine.installedDate) {
            logger.write(`    Installed: ${engine.installedDate}`);
          }
        });
      }
      logger.write('\n');
    }

    if (result.error) {
      logger.error(result.error);
      throw new Error(result.error);
    }

    if (result.engine && result.uprojectEngine) {
      const engine = result.engine;
      logger.success(
        `Found engine for project: ${chalk.bold(engine.displayName || engine.associationId)}`
      );

      logger.subTitle('Engine Details');
      logger.write(`  Path: ${engine.path}`);

      if (engine.version) {
        logger.write(
          `  Version: ${engine.version.MajorVersion}.${engine.version.MinorVersion}.${engine.version.PatchVersion}`
        );
        logger.write(`  Build ID: ${engine.version.BuildId}`);
        logger.write(`  Branch: ${engine.version.BranchName}`);
        logger.write(`  Changelist: ${engine.version.Changelist}`);
        logger.write(`  Promoted Build: ${engine.version.IsPromotedBuild ? 'Yes' : 'No'}`);
      }

      logger.write(`  Association ID: ${engine.associationId}`);
      if (engine.installedDate) {
        logger.write(`  Installed: ${engine.installedDate}`);
      }
    } else if (!result.engine) {
      logger.warning('No engine installation found');
    }

    if (result.uprojectEngine) {
      logger.subTitle('Project Engine Association');
      logger.write(`  GUID: ${result.uprojectEngine.guid}`);
      if (result.uprojectEngine.name) {
        logger.write(`  Name: ${result.uprojectEngine.name}`);
      }
      if (result.uprojectEngine.path) {
        logger.write(`  Path: ${result.uprojectEngine.path}`);
      }
      if (result.uprojectEngine.version) {
        logger.write(`  Version: ${result.uprojectEngine.version}`);
      }

      if (!result.engine) {
        logger.warning(
          'Engine association found in project, but no matching engine installation detected'
        );
      }
    }

    if (result.warnings.length > 0) {
      logger.subTitle('Warnings');
      result.warnings.forEach((warning) => {
        logger.write(`  • ${warning}`);
      });
    }

    logger.write('\n');
    if (result.engine && result.uprojectEngine) {
      logger.success('Engine information retrieved successfully');
    } else if (!result.engine) {
      logger.warning('No engine installation found');
    }
  } catch (error) {
    throw error;
  }
}

/**
 * Registers the 'engine' command for displaying engine information.
 *
 * This command detects and displays information about the Unreal Engine
 * installation associated with the current project, including version,
 * installation path, and engine association details.
 *
 * @param program - The Commander program instance
 *
 * @example
 * ```typescript
 * engineCommand(program);
 * ```
 */
export function engineCommand(program: Command): void {
  program
    .command('engine')
    .description('Display engine information for the current project')
    .option('-p, --project <path>', 'Path to project directory or .uproject file')
    .option('-j, --json', 'Output result as JSON')
    .option('-v, --verbose', 'Show verbose engine detection details')
    .action(async (options) => {
      try {
        await executeEngine({
          project: options.project,
          json: options.json,
          verbose: options.verbose,
        });
      } catch (error) {
        handleCommandError(error, 'Engine command failed');
      }
    });
}
