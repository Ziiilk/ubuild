/**
 * Gencodebase command for ubuild CLI
 *
 * Generates compile_commands.json for IDE integration with clangd-based
 * language servers (VSCode, CLion, etc.) to enable code completion and navigation.
 *
 * @module commands/gencodebase
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { CompileCommandsGenerator } from '../core/compile-commands-generator';
import type { CompileCommandsGenerateOptions } from '../core/compile-commands-generator';
import { Logger } from '../utils/logger';
import { handleCommandError } from '../utils/error';

/**
 * Options for the gencodebase command.
 *
 * Extends the base compile commands generation options with CLI-specific
 * settings for output formatting and user interaction.
 *
 * @example
 * ```typescript
 * const options: GencodebaseCommandOptions = {
 *   target: 'Editor',
 *   config: 'Development',
 *   platform: 'Win64',
 *   json: true
 * };
 * ```
 */
export type GencodebaseCommandOptions = CompileCommandsGenerateOptions & {
  /**
   * Output result as JSON instead of formatted text.
   * When true, suppresses all non-JSON logging output for programmatic consumption.
   * @default false
   */
  json?: boolean;
};

/**
 * Executes the gencodebase command to generate compile_commands.json.
 *
 * @param options - Configuration options for generating compile commands
 * @returns Promise resolving to the path of the generated compile_commands.json file
 * @throws Error if generation fails
 *
 * @example
 * ```typescript
 * const compileCommandsPath = await executeGencodebase({
 *   target: 'Editor',
 *   config: 'Development',
 *   platform: 'Win64',
 *   json: false
 * });
 * console.log(`Generated: ${compileCommandsPath}`);
 * ```
 */
export async function executeGencodebase(options: GencodebaseCommandOptions): Promise<string> {
  // When JSON output is requested, suppress non-JSON logging
  if (options.json) {
    options.silent = true;
  } else {
    Logger.title('Generate Compile Commands Database');
  }

  const compileCommandsPath = await CompileCommandsGenerator.generate(options);

  if (options.json) {
    Logger.json({ success: true, path: compileCommandsPath });
    return compileCommandsPath;
  }

  Logger.success(`Compile commands generated: ${chalk.bold(compileCommandsPath)}`);
  Logger.success('VSCode settings updated: .vscode/settings.json');

  return compileCommandsPath;
}

/**
 * Registers the 'gencodebase' command for generating compile_commands.json.
 *
 * This command generates a compile_commands.json file for IDE integration,
 * enabling features like code completion and navigation in VSCode with clangd,
 * CLion, and other language servers.
 *
 * @param program - The Commander program instance
 *
 * @example
 * ```typescript
 * gencodebaseCommand(program);
 * ```
 */
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
        await executeGencodebase(options);
      } catch (error) {
        handleCommandError(error, 'Failed to generate compile commands');
      }
    });
}
