/**
 * Build command for ubuild CLI
 *
 * Builds Unreal Engine projects with various targets,
 * configurations, and platforms.
 *
 * @module commands/build
 */

import { Command } from 'commander';
import { ProjectBuilder } from '../core/project-builder';

/**
 * Project builder class for executing builds.
 * Re-exported from {@link ../core/project-builder}.
 * @see {@link ProjectBuilder} for implementation details
 */
export { ProjectBuilder } from '../core/project-builder';

/**
 * Execute a build operation.
 * Re-exported from {@link ../core/project-builder}.
 * @see {@link executeBuild} for implementation details
 */
export { executeBuild } from '../core/project-builder';

/**
 * Options for the build command.
 * Re-exported from {@link ../core/project-builder}.
 * @see {@link BuildCommandOptions} for details
 */
export type { BuildCommandOptions } from '../core/project-builder';

/**
 * Registers the build command with the Commander program.
 * @param program - The Commander program instance
 */
export function buildCommand(program: Command): void {
  program
    .command('build')
    .description('Build Unreal Engine project')
    .option('-t, --target <target>', 'Build target (Editor, Game, Client, Server)', 'Editor')
    .option(
      '-c, --config <config>',
      'Build configuration (Debug, DebugGame, Development, Shipping, Test)',
      'Development'
    )
    .option(
      '-p, --platform <platform>',
      'Build platform (Win64, Win32, Linux, Mac, Android, IOS)',
      'Win64'
    )
    .option('--project <path>', 'Path to project directory or .uproject file')
    .option('--engine-path <path>', 'Path to Unreal Engine installation')
    .option('--clean', 'Clean build (rebuild everything)')
    .option('--verbose', 'Verbose output')
    .option('--dry-run', 'Show what would be built without actually building')
    .option('--list-targets', 'List available build targets for project')
    .action(async (options) => {
      const builder = new ProjectBuilder();
      try {
        await builder.build(options);
      } catch (error) {
        builder
          .getLogger()
          .error(`Build failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });
}
