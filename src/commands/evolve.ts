/**
 * Evolve command for ubuild CLI
 *
 * Runs self-evolution using OpenCode to continuously analyze and improve
 * the ubuild codebase. Development-only feature that runs until interrupted.
 *
 * @module commands/evolve
 */

import { Command } from 'commander';
import { Logger } from '../utils/logger';
import { runSelfEvolution } from '../core/self-driver';

/**
 * Options for the evolve command.
 * Controls the behavior of the self-evolution process including timing,
 * API authentication, and model selection.
 */
interface EvolveCommandOptions {
  /**
   * Interval between evolution iterations in milliseconds.
   * Values below 1000ms will be clamped to 5000ms.
   * @default '5000'
   */
  interval?: string;
  /**
   * OpenAI/Anthropic API key for evolution.
   * If not provided, uses OpenCode default model.
   */
  apiKey?: string;
  /**
   * Model identifier to use for evolution.
   * @default ''
   */
  model?: string;
}

/**
 * Register the 'evolve' command for self-evolution using OpenCode.
 *
 * This command runs a self-improvement loop that continuously analyzes
 * the codebase, identifies improvements, and applies changes.
 *
 * @param program - The Commander program instance
 *
 * @example
 * ```typescript
 * evolveCommand(program);
 * ```
 */
export function evolveCommand(program: Command): void {
  program
    .command('evolve')
    .description('Self-evolve ubuild using OpenCode (development only, runs forever until Ctrl+C)')
    .option(
      '--api-key <key>',
      'OpenAI/Anthropic API key (optional, uses OpenCode default model if not provided)'
    )
    .option('--model <model>', 'Model to use (default: OpenCode default)', '')
    .option('--interval <ms>', 'Interval between evolution iterations in milliseconds', '5000')
    .action(async (options: EvolveCommandOptions) => {
      Logger.title('ubuild Self-Evolution');
      Logger.info('Using OpenCode (default model)');
      Logger.info('Runs forever until Ctrl+C\n');

      try {
        const parsedInterval = parseInt(options.interval ?? '5000', 10);
        const interval = isNaN(parsedInterval) || parsedInterval < 1000 ? 5000 : parsedInterval;

        if (interval !== parsedInterval) {
          Logger.warning('Invalid interval value, using default of 5000ms');
        }

        const result = await runSelfEvolution({
          interval,
          apiKey: options.apiKey,
          model: options.model || '',
          logger: (msg: string) => Logger.info(msg),
        });

        Logger.subTitle('Evolution Summary');
        Logger.info(`Total iterations: ${result.iterations}`);
        Logger.info(`Improvements: ${result.improvements.length}`);

        if (result.improvements.length > 0) {
          Logger.success('Improvements made:');
          result.improvements.forEach((imp) => Logger.info(`  - ${imp}`));
        }

        if (result.errors.length > 0) {
          Logger.error('Errors:');
          result.errors.forEach((err) => Logger.error(`  - ${err}`));
        }

        process.exit(result.success ? 0 : 1);
      } catch (error) {
        Logger.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });
}
