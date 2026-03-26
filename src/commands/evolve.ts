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
    .action(async (options) => {
      Logger.title('ubuild Self-Evolution');
      Logger.info('Using OpenCode (default model)');

      if (options.once) {
        Logger.info('Mode: Single iteration (--once)\n');
      } else {
        Logger.info('Runs forever until Ctrl+C\n');
      }

      try {
        await runSelfEvolution({
          logger: (msg: string) => Logger.info(msg),
          once: options.once,
        });
      } catch (error) {
        Logger.error(`Error: ${formatError(error)}`);
        process.exit(1);
      }
    });
}
