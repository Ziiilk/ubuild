/**
 * Evolve command for ubuild CLI
 *
 * Runs self-evolution using OpenCode to continuously analyze and improve
 * the ubuild codebase. Runs forever until interrupted by user.
 *
 * @module commands/evolve
 */

import { Command } from 'commander';
import { Logger } from '../utils/logger';
import { formatError } from '../utils/error';
import { runSelfEvolution } from '../core/self-driver';
import * as fs from 'fs-extra';
import * as path from 'path';

/**
 * Register the 'evolve' command for self-evolution using OpenCode.
 *
 * This command runs a self-improvement loop that continuously analyzes
 * the codebase, identifies improvements, and applies changes.
 *
 * @param program - The Commander program instance
 */
export function evolveCommand(program: Command): void {
  program
    .command('evolve')
    .description('Self-evolve ubuild using OpenCode (runs forever until Ctrl+C)')
    .option('--once', 'Run only one iteration and exit (default: run forever)')
    .option('--dry-run', 'Show what would be done without actually executing')
    .action(async (options) => {
      Logger.title('ubuild Self-Evolution');
      Logger.info('Using OpenCode (default model)');

      if (options.once) {
        Logger.info('Mode: Single iteration (--once)\n');
      } else {
        Logger.info('Runs forever until Ctrl+C\n');
      }

      // Pre-flight check: EVOLVE.md should exist (warn only)
      const projectRoot = process.cwd();
      const constitutionPath = path.join(projectRoot, 'EVOLVE.md');
      if (!(await fs.pathExists(constitutionPath))) {
        Logger.warning('Warning: EVOLVE.md not found in project root');
        Logger.warning('  Evolution will proceed without constitution guidance');
      }

      try {
        await runSelfEvolution({
          logger: (msg: string) => Logger.info(msg),
          once: options.once,
          dryRun: options.dryRun,
        });
      } catch (error) {
        Logger.error(`Error: ${formatError(error)}`);
        process.exit(1);
      }
    });
}
