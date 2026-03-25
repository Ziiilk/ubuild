import { Command } from 'commander';
import chalk from 'chalk';
import { Writable } from 'stream';
import { ProjectGenerator } from '../core/project-generator';
import { Logger } from '../utils/logger';
import { Validator } from '../utils/validator';
import { IDE } from '../types/generate';

export interface GenerateCommandOptions {
  ide?: string;
  projectPath?: string;
  enginePath?: string;
  force?: boolean;
  listIdes?: boolean;
  stdout?: Writable;
  stderr?: Writable;
}

export async function executeGenerate(options: GenerateCommandOptions): Promise<void> {
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;

  const logger = new Logger({ stdout, stderr });

  try {
    logger.title('Generate Project Files');

    if (options.listIdes) {
      listAvailableIDEs(logger);
      return;
    }

    const ide = options.ide || 'sln';

    if (!Validator.isValidIDE(ide)) {
      logger.error(`Invalid IDE type: ${ide}`);
      listAvailableIDEs(logger);
      process.exit(1);
    }

    logger.info(`Generating ${ide.toUpperCase()} project files...`);
    logger.divider();

    const result = await ProjectGenerator.generate({
      ide: ide as IDE,
      projectPath: options.projectPath,
      enginePath: options.enginePath,
      force: options.force,
    });

    logger.divider();

    if (result.success) {
      logger.success('Project files generated successfully');

      if (result.generatedFiles.length > 0) {
        logger.subTitle('Generated Files');
        result.generatedFiles.forEach((file) => {
          logger.write(`  • ${file}\n`);
        });
      }

      if (ide === 'sln' || ide === 'vs2022') {
        logger.write('\n');
        logger.write(`Open ${chalk.bold('.sln')} file in Visual Studio to build and debug.\n`);
      } else if (ide === 'vscode') {
        logger.write('\n');
        logger.write(
          `Open the ${chalk.bold('.code-workspace')} file in Visual Studio Code (UBT 生成的方案).\n`
        );
      }
    } else {
      logger.error(`Failed to generate project files: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    logger.error(`Generation failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

export function generateCommand(program: Command): void {
  program
    .command('generate')
    .alias('gen')
    .description('Generate IDE project files')
    .option('-i, --ide <ide>', 'IDE type (sln, vscode, clion, xcode, vs2022)', 'sln')
    .option('--project <path>', 'Path to project directory or .uproject file')
    .option('--engine-path <path>', 'Path to Unreal Engine installation')
    .option('--force', 'Force regeneration of project files')
    .option('--list-ides', 'List available IDE types')
    .action(async (options) => {
      await executeGenerate({
        ide: options.ide,
        projectPath: options.project,
        enginePath: options.enginePath,
        force: options.force,
        listIdes: options.listIdes,
      });
    });
}

function listAvailableIDEs(logger: Logger): void {
  logger.subTitle('Available IDE Types');

  const ides = [
    {
      id: 'sln',
      name: 'Visual Studio Solution',
      description: 'Standard .sln file for Visual Studio',
    },
    { id: 'vs2022', name: 'Visual Studio 2022', description: 'Visual Studio 2022 solution files' },
    {
      id: 'vscode',
      name: 'Visual Studio Code',
      description: '.vscode configuration files with build tasks',
    },
    { id: 'clion', name: 'CLion', description: 'CMake project for CLion' },
    { id: 'xcode', name: 'Xcode', description: 'Xcode project files (macOS only)' },
  ];

  ides.forEach((ide) => {
    logger.write(`  ${chalk.bold(ide.id.padEnd(8))} ${ide.name}\n`);
    logger.write(`            ${chalk.gray(ide.description)}\n`);
    logger.write('\n');
  });

  logger.write('Use: ubuild generate --ide <type>\n');
}
