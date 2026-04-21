/**
 * Switch command for ubuild CLI
 *
 * Switches the Unreal Engine association for a project by updating
 * the EngineAssociation field in the .uproject file.
 *
 * @module commands/switch
 */

import { Command } from 'commander';
import { Writable } from 'stream';
import { SwitchResult } from '../types/switch';
import { SwitchExecutor } from '../core/switch-executor';
import { Logger } from '../utils/logger';
import { handleCommandError } from '../utils/error';

/** Options for the switch command. */
export interface SwitchCommandOptions {
  /** Path to project directory or .uproject file */
  project?: string;
  /** Path to the target Unreal Engine installation */
  enginePath?: string;
  /** Writable stream for stdout output */
  stdout?: Writable;
  /** Writable stream for stderr output */
  stderr?: Writable;
}

/**
 * Executes the switch command to change engine association.
 * @param options - Command execution options
 * @returns Promise that resolves to the switch result
 */
export async function executeSwitch(options: SwitchCommandOptions): Promise<SwitchResult> {
  const executor = new SwitchExecutor({
    stdout: options.stdout,
    stderr: options.stderr,
  });

  return executor.execute({
    projectPath: options.project,
    enginePath: options.enginePath,
    stdout: options.stdout,
    stderr: options.stderr,
  });
}

/**
 * Registers the switch command with the Commander program.
 * @param program - The Commander program instance
 */
export function switchCommand(program: Command): void {
  program
    .command('switch')
    .description('Switch Unreal Engine association for the current project')
    .option('-p, --project <path>', 'Path to project directory or .uproject file')
    .option('--engine-path <path>', 'Path to target Unreal Engine installation')
    .action(async (options) => {
      const logger = new Logger({
        stdout: options.stdout || process.stdout,
        stderr: options.stderr || process.stderr,
      });

      try {
        logger.title('Switch Engine');

        const result = await executeSwitch({
          project: options.project,
          enginePath: options.enginePath,
        });

        if (!result.success) {
          throw new Error(result.error || 'Unknown error');
        }
      } catch (error) {
        handleCommandError(error, 'Switch command failed');
      }
    });
}
