import { Command } from 'commander';
import chalk from 'chalk';
import {
  CompileCommandsGenerator,
  type CompileCommandsGenerateOptions,
} from '../core/compile-commands-generator';
import { Logger } from '../utils/logger';

export type GencodebaseCommandOptions = CompileCommandsGenerateOptions & {
  json?: boolean;
};

export function gencodebaseCommand(program: Command): void {
  program
    .command('gencodebase')
    .description('Generate compile_commands.json for IDE (VSCode clangd, CLion, etc.)')
    .option(
      '-t, --target <target>',
      'Build targets (Editor is recommended for IDE code completion)',
      'Editor'
    )
    .option(
      '-c, --config <config>',
      'Build configuration (Debug, DebugGame, Development, Shipping, Test)',
      'Development'
    )
    .option('-p, --platform <platform>', 'Platform (Win64, Win32, Linux, Mac)', 'Win64')
    .option('--project <path>', 'Path to project directory or .uproject file')
    .option('--engine-path <path>', 'Path to Unreal Engine installation')
    .option('--include-plugin-sources', 'Include plugin sources in compile commands', true)
    .option('--no-include-plugin-sources', 'Exclude plugin sources')
    .option('--include-engine-sources', 'Include engine sources in compile commands', true)
    .option('--no-include-engine-sources', 'Exclude engine sources')
    .option('--use-engine-includes', 'Use engine includes in compile commands', true)
    .option('--no-use-engine-includes', 'Do not use engine includes')
    .option('--json', 'Output result as JSON')
    .action(async (options: GencodebaseCommandOptions) => {
      try {
        // When JSON output is requested, suppress non-JSON logging
        if (options.json) {
          options.silent = true;
        } else {
          Logger.title('Generate Compile Commands Database');
        }

        const compileCommandsPath = await CompileCommandsGenerator.generate(options);

        if (options.json) {
          Logger.json({ success: true, path: compileCommandsPath });
          return;
        }

        Logger.success(`Compile commands generated: ${chalk.bold(compileCommandsPath)}`);
        Logger.success('VSCode settings updated: .vscode/settings.json');
      } catch (error) {
        Logger.error(
          `Failed to generate compile commands: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }
    });
}
