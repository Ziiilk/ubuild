import { Command } from 'commander';
import { Writable } from 'stream';
import { CleanOptions, CleanResult } from '../types/clean';
import { CleanExecutor } from '../core/clean-executor';
import { Logger } from '../utils/logger';

/** Options for the clean command. */
export interface CleanCommandOptions {
  /** Path to project directory or .uproject file */
  project?: string;
  /** Path to Unreal Engine installation */
  enginePath?: string;
  /** Show what would be cleaned without actually deleting */
  dryRun?: boolean;
  /** Clean only Binaries and Intermediate folders */
  binariesOnly?: boolean;
  /** Writable stream for stdout output */
  stdout?: Writable;
  /** Writable stream for stderr output */
  stderr?: Writable;
  /** Suppress all output */
  silent?: boolean;
}

/**
 * Executes the clean command to remove build artifacts from an Unreal Engine project.
 * @param options - Command execution options
 * @returns Promise that resolves to the clean result
 */
export async function executeClean(options: CleanCommandOptions): Promise<CleanResult> {
  const cleanOptions: CleanOptions = {
    projectPath: options.project,
    enginePath: options.enginePath,
    dryRun: options.dryRun,
    binariesOnly: options.binariesOnly,
    stdout: options.stdout,
    stderr: options.stderr,
    silent: options.silent,
  };

  const executor = new CleanExecutor({
    stdout: options.stdout,
    stderr: options.stderr,
    silent: options.silent,
  });

  return executor.execute(cleanOptions);
}

/**
 * Registers the clean command with the Commander program.
 * @param program - The Commander program instance
 */
export function cleanCommand(program: Command): void {
  program
    .command('clean')
    .description('Clean build artifacts from Unreal Engine project')
    .option('-p, --project <path>', 'Path to project directory or .uproject file')
    .option('--engine-path <path>', 'Path to Unreal Engine installation')
    .option('--dry-run', 'Show what would be cleaned without actually deleting')
    .option('--binaries-only', 'Clean only Binaries and Intermediate folders')
    .action(async (options) => {
      const logger = new Logger();

      try {
        logger.title('Clean Project');

        const result = await executeClean({
          project: options.project,
          enginePath: options.enginePath,
          dryRun: options.dryRun,
          binariesOnly: options.binariesOnly,
        });

        if (!result.success) {
          logger.error(`Clean failed: ${result.error || 'Unknown error'}`);
          if (result.failedPaths.length > 0) {
            logger.subTitle('Failed to clean:');
            result.failedPaths.forEach((item) => {
              logger.write(`  • ${item.path}: ${item.error}\n`);
            });
          }
          process.exit(1);
        }

        if (result.deletedPaths.length > 0) {
          logger.success(`Successfully cleaned ${result.deletedPaths.length} item(s)`);
        } else {
          logger.info('No build artifacts found to clean');
        }
      } catch (error) {
        logger.error(`Clean failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });
}
