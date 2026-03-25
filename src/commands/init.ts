import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { Writable } from 'stream';
import { ProjectInitializer } from '../core/project-initializer';
import { InitOptions, InitResult } from '../types/init';
import { Logger } from '../utils/logger';
import { Validator } from '../utils/validator';

/** Command line options specific to the init command. */
type InitCommandActionOptions = InitOptions & {
  /** Show what would be created without actually creating */
  dryRun?: boolean;
};

/** Options for executing the init command. */
export interface InitCommandOptions extends InitOptions {
  /** Show what would be created without actually creating */
  dryRun?: boolean;
  /** Writable stream for stdout output */
  stdout?: Writable;
  /** Writable stream for stderr output */
  stderr?: Writable;
}

/**
 * Executes the init command to initialize a new Unreal Engine project.
 * @param options - Command execution options
 * @returns Promise that resolves to the init result
 */
export async function executeInit(options: InitCommandOptions): Promise<InitResult> {
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;

  const logger = new Logger({ stdout, stderr });
  const projectType = options.type || 'cpp';

  logger.title('Initialize Unreal Engine Project');

  if (options.dryRun) {
    await dryRunInit(options, logger);
    return {
      success: true,
      projectPath: options.directory || path.join(process.cwd(), options.name),
      uprojectPath: '',
      engineAssociation: '',
      createdFiles: [],
    };
  }

  if (!Validator.isValidProjectName(options.name)) {
    logger.error(`Invalid project name: ${options.name}`);
    logger.info('Project name can only contain: a-z, A-Z, 0-9, _, -');
    throw new Error('Invalid project name');
  }

  if (!Validator.isValidProjectType(projectType)) {
    logger.error(`Invalid project type: ${projectType}`);
    logger.info('Valid types: cpp, blueprint, blank');
    throw new Error('Invalid project type');
  }

  logger.info(`Initializing ${chalk.bold(options.name)} as ${projectType.toUpperCase()} project`);
  logger.divider();

  const result = await ProjectInitializer.initialize({
    name: options.name,
    type: projectType,
    template: options.template,
    enginePath: options.enginePath,
    directory: options.directory,
    force: options.force,
  });

  logger.divider();

  if (result.success) {
    logger.success(`Project ${chalk.bold(options.name)} initialized successfully!`);

    logger.subTitle('Project Structure');
    logger.write(`  ${result.projectPath}/\n`);
    logger.write(`  ├── ${options.name}.uproject\n`);
    logger.write('  ├── Config/\n');
    logger.write('  │   ├── DefaultEngine.ini\n');
    logger.write('  │   ├── DefaultGame.ini\n');
    logger.write('  │   └── DefaultEditor.ini\n');

    if (projectType === 'cpp') {
      logger.write('  ├── Source/\n');
      logger.write(`  │   ├── ${options.name}.Target.cs\n`);
      logger.write(`  │   ├── ${options.name}Editor.Target.cs\n`);
      logger.write(`  │   └── ${options.name}/\n`);
      logger.write(`  │       ├── ${options.name}.Build.cs\n`);
      logger.write('  │       ├── Public/\n');
      logger.write(`  │       │   ├── ${options.name}.h\n`);
      logger.write(`  │       │   └── ${options.name}GameModeBase.h\n`);
      logger.write('  │       └── Private/\n');
      logger.write(`  │           ├── ${options.name}.cpp\n`);
      logger.write(`  │           └── ${options.name}GameModeBase.cpp\n`);
      logger.write('  └── Content/\n');
    } else {
      logger.write('  └── Content/\n');
    }

    logger.write('\n');
    logger.subTitle('Next Steps');

    if (projectType === 'cpp') {
      logger.write(
        `  1. Generate project files: ${chalk.bold(`ubuild generate --project "${result.projectPath}"`)}\n`
      );
      logger.write(
        `  2. Build the project: ${chalk.bold(`ubuild build --project "${result.projectPath}"`)}\n`
      );
      logger.write(`  3. Open in editor: ${chalk.bold(`Double-click ${options.name}.uproject`)}\n`);
    } else {
      logger.write(`  1. Open in editor: ${chalk.bold(`Double-click ${options.name}.uproject`)}\n`);
      logger.write('  2. Start creating Blueprints in the Content directory\n');
    }

    logger.write('\n');
    logger.info(`Project location: ${result.projectPath}`);
    logger.write(`Engine association: ${result.engineAssociation}\n`);
  } else {
    logger.error(`Failed to initialize project: ${result.error}`);
    throw new Error(result.error || 'Project initialization failed');
  }

  return result;
}

/**
 * Registers the init command with the Commander program.
 * @param program - The Commander program instance
 */
export function initCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize a new Unreal Engine project')
    .requiredOption('-n, --name <name>', 'Project name (alphanumeric, underscores, hyphens)')
    .option('-t, --type <type>', 'Project type (cpp, blueprint, blank)', 'cpp')
    .option(
      '--template <template>',
      'Project template (Basic, FirstPerson, ThirdPerson, etc.)',
      'Basic'
    )
    .option('-d, --directory <path>', 'Directory to create project in (default: ./<name>)')
    .option('--engine-path <path>', 'Path to Unreal Engine installation')
    .option('--force', 'Force initialization even if directory is not empty')
    .option('--dry-run', 'Show what would be created without actually creating')
    .action(async (options: InitCommandActionOptions) => {
      try {
        await executeInit(options);
      } catch {
        process.exit(1);
      }
    });
}

/**
 * Displays a dry run preview of what would be created during project initialization.
 * @param options - Initialization options
 * @param logger - Logger instance for output
 * @returns Promise that resolves when preview is complete
 */
async function dryRunInit(options: InitCommandOptions, logger: Logger): Promise<void> {
  logger.subTitle('Dry Run - Project Initialization');

  logger.write(`  Project Name: ${options.name}\n`);
  logger.write(`  Project Type: ${options.type}\n`);
  logger.write(`  Template: ${options.template}\n`);
  logger.write(`  Directory: ${options.directory || `./${options.name}`}\n`);
  logger.write(`  Force: ${options.force ? 'Yes' : 'No'}\n`);

  if (options.enginePath) {
    logger.write(`  Engine Path: ${options.enginePath}\n`);
  } else {
    try {
      const { EngineResolver } = await import('../core/engine-resolver');
      const engines = await EngineResolver.findEngineInstallations();

      if (engines.length === 0) {
        logger.write(`  Engine: ${chalk.yellow('No engines found - will prompt for path')}\n`);
      } else if (engines.length === 1) {
        logger.write(`  Engine: ${engines[0].displayName || engines[0].associationId}\n`);
      } else {
        logger.write(
          `  Engine: ${chalk.yellow('Multiple engines available - will prompt for selection')}\n`
        );
        engines.forEach((engine, i) => {
          const version = engine.version
            ? `UE ${engine.version.MajorVersion}.${engine.version.MinorVersion}.${engine.version.PatchVersion}`
            : 'Unknown version';
          logger.write(
            `    ${i + 1}. ${engine.displayName || engine.associationId} (${version})\n`
          );
        });
      }
    } catch (error) {
      logger.debug(
        `Engine detection failed in dry-run: ${error instanceof Error ? error.message : String(error)}`
      );
      logger.write(`  Engine: ${chalk.yellow('Detection failed - will prompt for path')}\n`);
    }
  }

  logger.write('\n');
  logger.subTitle('What would be created:');

  const directory = options.directory || path.join(process.cwd(), options.name);
  logger.write(`  ${directory}/\n`);
  logger.write(`  ├── ${options.name}.uproject\n`);
  logger.write('  ├── Config/\n');
  logger.write('  │   └── *.ini files\n');

  if (options.type === 'cpp') {
    logger.write('  ├── Source/\n');
    logger.write(`  │   ├── ${options.name}.Target.cs\n`);
    logger.write(`  │   ├── ${options.name}Editor.Target.cs\n`);
    logger.write(`  │   └── ${options.name}/\n`);
    logger.write(`  │       ├── ${options.name}.Build.cs\n`);
    logger.write('  │       ├── Public/\n');
    logger.write('  │       └── Private/\n');
    logger.write('  └── Content/\n');
  } else {
    logger.write('  └── Content/\n');
  }

  logger.write('\n');
  logger.info('This is a dry run - no files will be created');
  logger.write('To actually create the project, remove the --dry-run flag\n');
}
