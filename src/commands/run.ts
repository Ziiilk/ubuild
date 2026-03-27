/**
 * Run command for ubuild CLI
 *
 * Runs Unreal Engine projects in Editor or Game mode
 * with configurable targets and configurations.
 *
 * @module commands/run
 */

import { Command } from 'commander';
import { handleCommandError } from '../utils/error';
import { ProjectRunner } from '../core/project-runner';

/**
 * Project runner class for executing projects.
 * Re-exported from {@link ../core/project-runner}.
 * @see {@link ProjectRunner} for implementation details
 */
export { ProjectRunner } from '../core/project-runner';

/**
 * Run a project with the specified options.
 * Re-exported from {@link ../core/project-runner}.
 * @see {@link runProject} for implementation details
 */
export { runProject } from '../core/project-runner';

/**
 * Options for the run command.
 * Re-exported from {@link ../core/project-runner}.
 * @see {@link RunOptions} for details
 */
export type { RunOptions } from '../core/project-runner';

/**
 * Registers the run command with the Commander program.
 * @param program - The Commander program instance
 */
export function runCommand(program: Command): void {
  program
    .command('run')
    .description('Run Unreal Engine project (Editor or Game executable)')
    .option('-t, --target <target>', 'Run target (Editor, Game, Client, Server)', 'Editor')
    .option(
      '-c, --config <config>',
      'Build configuration (Debug, DebugGame, Development, Shipping, Test)',
      'Development'
    )
    .option(
      '-p, --platform <platform>',
      'Platform (Win64, Win32, Linux, Mac, Android, IOS)',
      'Win64'
    )
    .option('--project <path>', 'Path to project directory or .uproject file')
    .option('--engine-path <path>', 'Path to Unreal Engine installation')
    .option('--dry-run', 'Show what would be run without actually running')
    .option('--build-first', 'Build the project before running')
    .option('--no-build', 'Do not build, just run existing executable')
    .option('--detached', 'Run the process in detached mode (non-blocking)')
    .option('--args <args...>', 'Additional arguments to pass to the executable')
    .action(async (options) => {
      try {
        const runner = new ProjectRunner();
        await runner.run(options);
      } catch (error) {
        handleCommandError(error);
      }
    });
}
