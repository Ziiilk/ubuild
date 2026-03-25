import { Command } from 'commander';
import { Logger } from '../utils/logger';
import { runSelfEvolution } from '../core/self-driver';

interface EvolveCommandOptions {
  interval?: string;
  apiKey?: string;
  model?: string;
}

export function evolveCommand(program: Command): void {
  program
    .command('evolve')
    .description('Self-evolve ubuild using OpenCode (development only, runs forever until Ctrl+C)')
    .option(
      '--api-key <key>',
      'OpenAI/Anthropic API key (optional, uses OpenCode default model if not provided)'
    )
    .option('--model <model>', 'Model to use (default: OpenCode default)', '')
    .action(async (options: EvolveCommandOptions) => {
      Logger.title('ubuild Self-Evolution');
      Logger.info('Using OpenCode (default model)');
      Logger.info('Runs forever until Ctrl+C\n');

      try {
        const result = await runSelfEvolution({
          interval: parseInt(options.interval || '5000', 10),
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
