#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { Logger } from '../utils/logger';
import { listCommand } from '../commands/list';
import { engineCommand } from '../commands/engine';
import { buildCommand } from '../commands/build';
import { generateCommand } from '../commands/generate';
import { initCommand } from '../commands/init';
import { runCommand } from '../commands/run';
import { updateCommand } from '../commands/update';
import { gencodebaseCommand } from '../commands/gencodebase';
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

// Conditionally register evolve command (development only or when evolve is requested)
const isEvolveRequested = process.argv.slice(2).includes('evolve');
const isDevMode =
  process.env.NODE_ENV === 'development' || process.env.UBUILD_EVOLVE_ENABLED === 'true';

// console.log('[DEBUG] isEvolveRequested:', isEvolveRequested, 'isDevMode:', isDevMode, 'argv:', process.argv);

if (isEvolveRequested || isDevMode) {
  // Require synchronously to register command before parsing
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { evolveCommand } = require('../commands/evolve');
    evolveCommand(program);
  } catch (error) {
    // Evolve command is optional - ignore if module not available
    Logger.debug(
      `Evolve command not available: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

program.configureHelp({
  sortSubcommands: true,
  subcommandTerm: (cmd) => cmd.name(),
});

try {
  program.parse(process.argv);
} catch (error) {
  console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
  process.exit(1);
}
