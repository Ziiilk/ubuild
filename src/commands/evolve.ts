/**
 * Evolve command for ubuild CLI
 *
 * Runs self-evolution using OpenCode to continuously analyze and improve
 * the ubuild codebase. Runs forever until interrupted by user.
 *
 * @module commands/evolve
 */

import { Command } from 'commander';
import { Logger, formatTimestamp } from '../utils/logger';
import { runSelfEvolution } from '../core/self-driver';
import { Validator } from '../utils/validator';
import { handleCommandError } from '../utils/error';
import * as fs from 'fs-extra';
import * as path from 'path';

/**
 * Self-driver class for evolution.
 * Re-exported from {@link ../core/self-driver}.
 * @see {@link runSelfEvolution} for implementation details
 */
export { runSelfEvolution } from '../core/self-driver';

/**
 * Options for the evolve command.
 * Re-exported from {@link ../types/evolve}.
 * @see {@link SelfEvolverOptions} for details
 */
export type { SelfEvolverOptions } from '../types/evolve';

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
    .option(
      '--sleep <ms>',
      'Sleep duration between iterations in milliseconds (default: 5000)',
      (value) => Validator.parsePositiveInt(value, '--sleep', 3600000) // Max 1 hour
    )
    .option('--use-ts-node', 'Use ts-node for verification instead of compiled dist')
    .option(
      '--verify-timeout <ms>',
      'Timeout for verification checks in milliseconds (default: 60000)',
      (value) => Validator.parsePositiveInt(value, '--verify-timeout', 600000) // Max 10 minutes
    )
    .option(
      '--opencode-timeout <ms>',
      'Timeout for OpenCode execution in milliseconds (default: 600000)',
      (value) => Validator.parsePositiveInt(value, '--opencode-timeout', 3600000) // Max 1 hour
    )
    .option(
      '--max-retries <n>',
      'Maximum consecutive retry attempts on failure (default: 5, use -1 for unlimited)',
      (value) => Validator.parseBoundedInt(value, '--max-retries', { min: -1 })
    )
    .action(async (options) => {
      try {
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

        await runSelfEvolution({
          logger: (msg: string) => Logger.info(`[${formatTimestamp()}] ${msg}`),
          once: options.once,
          dryRun: options.dryRun,
          sleepMs: options.sleep,
          useTsNode: options.useTsNode,
          verifyTimeoutMs: options.verifyTimeout,
          opencodeTimeoutMs: options.opencodeTimeout,
          maxRetries: options.maxRetries,
        });
      } catch (error) {
        handleCommandError(error);
      }
    });
}
