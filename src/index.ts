/**
 * ubuild - Unreal Engine project management CLI tool
 *
 * Main entry point for programmatic API usage.
 * Provides command registration functions and core utilities.
 *
 * @example
 * ```typescript
 * import { buildCommand, initCommand } from '@zitool/ubuild';
 *
 * // Register commands with your Commander program
 * buildCommand(program);
 * initCommand(program);
 * ```
 */

import { listCommand } from './commands/list';
import { engineCommand } from './commands/engine';
import { buildCommand } from './commands/build';
import { generateCommand } from './commands/generate';
import { initCommand } from './commands/init';
import { runCommand } from './commands/run';
import { updateCommand } from './commands/update';
import { gencodebaseCommand } from './commands/gencodebase';

// Command registration functions
export {
  /** Register the 'list' command for project detection */
  listCommand,
  /** Register the 'engine' command for engine information */
  engineCommand,
  /** Register the 'build' command for building projects */
  buildCommand,
  /** Register the 'generate' command for IDE project file generation */
  generateCommand,
  /** Register the 'init' command for project initialization */
  initCommand,
  /** Register the 'run' command for running projects */
  runCommand,
  /** Register the 'update' command for self-updates */
  updateCommand,
  /** Register the 'gencodebase' command for compile commands generation */
  gencodebaseCommand,
};

// Development-only exports
export { runSelfEvolution } from './core/self-driver';
