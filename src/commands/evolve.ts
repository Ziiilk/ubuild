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
 * Parses and validates a positive integer option value.
 * @param value - The raw string value from CLI
 * @param optionName - The name of the option for error messages
 * @returns The parsed positive integer
 * @throws Error if value is not a valid positive integer
 */
function parsePositiveInt(value: string, optionName: string): number {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(`${optionName} must be a positive integer, got: ${value}`);
  }
  if (parsed !== parseFloat(value)) {
    throw new Error(`${optionName} must be an integer, got: ${value}`);
  }
  return parsed;
}

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
      (value) => parsePositiveInt(value, '--sleep')
    )
    .option('--use-ts-node', 'Use ts-node for verification instead of compiled dist')
    .option(
      '--verify-timeout <ms>',
      'Timeout for verification checks in milliseconds (default: 60000)',
      (value) => parsePositiveInt(value, '--verify-timeout')
    )
    .option(
      '--opencode-timeout <ms>',
      'Timeout for OpenCode execution in milliseconds (default: 600000)',
      (value) => parsePositiveInt(value, '--opencode-timeout')
    )
    .option(
      '--max-retries <n>',
      'Maximum consecutive retry attempts on failure (default: 5, use -1 for unlimited)',
      (value) => {
        const parsed = parseInt(value, 10);
        if (isNaN(parsed)) {
          throw new Error(`--max-retries must be a number, got: ${value}`);
        }
        if (parsed !== parseFloat(value)) {
          throw new Error(`--max-retries must be an integer, got: ${value}`);
        }
        if (parsed < -1) {
          throw new Error(`--max-retries must be >= -1, got: ${value}`);
        }
        return parsed;
      }
    )
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
          logger: Logger.info,
          once: options.once,
          dryRun: options.dryRun,
          sleepMs: options.sleep,
          useTsNode: options.useTsNode,
          verifyTimeoutMs: options.verifyTimeout,
          opencodeTimeoutMs: options.opencodeTimeout,
          maxRetries: options.maxRetries,
        });
      } catch (error) {
        Logger.error(`Error: ${formatError(error)}`);
        process.exit(1);
      }
    });
}
