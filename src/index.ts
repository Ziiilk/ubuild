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
import { evolveCommand } from './commands/evolve';
import { cleanCommand } from './commands/clean';
import { versionCommand } from './commands/version';

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
  /** Register the 'evolve' command for self-evolution (development only) */
  evolveCommand,
  /** Register the 'clean' command for cleaning build artifacts */
  cleanCommand,
  /** Register the 'version' command for displaying version information */
  versionCommand,
};

// Development-only exports
/**
 * Runs the self-evolution process for ubuild.
 * Continuously analyzes the codebase, identifies improvements, and applies changes.
 * This is a development-only feature.
 *
 * @example
 * ```typescript
 * import { runSelfEvolution } from '@zitool/ubuild';
 *
 * await runSelfEvolution({
 *   interval: 5000,
 *   apiKey: process.env.OPENAI_API_KEY,
 *   model: 'gpt-4'
 * });
 * ```
 */
export { runSelfEvolution } from './core/self-driver';
