#!/usr/bin/env node

/**
 * ubuild CLI entry point
 *
 * Main command-line interface for the ubuild tool. Registers all commands
 * and handles program initialization, argument parsing, and execution.
 *
 * @module cli/index
 * @example
 * ```bash
 * # Show help
 * ubuild --help
 *
 * # Detect project
 * ubuild list
 *
 * # Build project
 * ubuild build --target Editor --config Development
 * ```
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { Logger } from '../utils/logger';
import { formatError } from '../utils/error';
import { listCommand } from '../commands/list';
import { engineCommand } from '../commands/engine';
import { buildCommand } from '../commands/build';
import { generateCommand } from '../commands/generate';
import { initCommand } from '../commands/init';
import { runCommand } from '../commands/run';
import { updateCommand } from '../commands/update';
import { gencodebaseCommand } from '../commands/gencodebase';
import { cleanCommand } from '../commands/clean';
import { versionCommand } from '../commands/version';
import { version, description } from '../../package.json';

const program = new Command();

program
  .name('ubuild')
  .description(description)
  .version(version)
  .configureOutput({
    outputError: (str, write) => write(chalk.red(str)),
  });

listCommand(program);
engineCommand(program);
buildCommand(program);
generateCommand(program);
initCommand(program);
runCommand(program);
updateCommand(program);
gencodebaseCommand(program);
cleanCommand(program);
versionCommand(program);

program.configureHelp({
  sortSubcommands: true,
  subcommandTerm: (cmd) => cmd.name(),
});

async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    Logger.error(`Error: ${formatError(error)}`);
    process.exit(1);
  }
}

main();
