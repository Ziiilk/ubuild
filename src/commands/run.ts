import { Command } from 'commander';
import { ProjectRunner } from '../core/project-runner';

export { ProjectRunner, runProject } from '../core/project-runner';
export type { RunOptions } from '../core/project-runner';

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
      const runner = new ProjectRunner();
      try {
        await runner.run(options);
      } catch (error) {
        runner
          .getLogger()
          .error(`Run failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });
}
