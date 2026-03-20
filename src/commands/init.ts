import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { ProjectInitializer } from '../core/project-initializer';
import { InitOptions } from '../types/init';
import { Logger } from '../utils/logger';
import { Validator } from '../utils/validator';

type InitCommandActionOptions = InitOptions & {
  dryRun?: boolean;
};

function writeLine(message = ''): void {
  Logger.write(`${message}\n`);
}

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
        const projectType = options.type || 'cpp';

        Logger.title('Initialize Unreal Engine Project');

        if (options.dryRun) {
          await dryRunInit(options);
          return;
        }

        if (!Validator.isValidProjectName(options.name)) {
          Logger.error(`Invalid project name: ${options.name}`);
          Logger.info('Project name can only contain: a-z, A-Z, 0-9, _, -');
          process.exit(1);
        }

        if (!Validator.isValidProjectType(projectType)) {
          Logger.error(`Invalid project type: ${projectType}`);
          Logger.info('Valid types: cpp, blueprint, blank');
          process.exit(1);
        }

        Logger.info(
          `Initializing ${chalk.bold(options.name)} as ${projectType.toUpperCase()} project`
        );
        Logger.divider();

        const result = await ProjectInitializer.initialize({
          name: options.name,
          type: projectType,
          template: options.template,
          enginePath: options.enginePath,
          directory: options.directory,
          force: options.force,
        });

        Logger.divider();

        if (result.success) {
          Logger.success(`Project ${chalk.bold(options.name)} initialized successfully!`);

          Logger.subTitle('Project Structure');
          writeLine(`  ${result.projectPath}/`);
          writeLine(`  ├── ${options.name}.uproject`);
          writeLine('  ├── Config/');
          writeLine('  │   ├── DefaultEngine.ini');
          writeLine('  │   ├── DefaultGame.ini');
          writeLine('  │   └── DefaultEditor.ini');

          if (projectType === 'cpp') {
            writeLine('  ├── Source/');
            writeLine(`  │   ├── ${options.name}.Target.cs`);
            writeLine(`  │   ├── ${options.name}Editor.Target.cs`);
            writeLine(`  │   └── ${options.name}/`);
            writeLine(`  │       ├── ${options.name}.Build.cs`);
            writeLine('  │       ├── Public/');
            writeLine(`  │       │   ├── ${options.name}.h`);
            writeLine(`  │       │   └── ${options.name}GameModeBase.h`);
            writeLine('  │       └── Private/');
            writeLine(`  │           ├── ${options.name}.cpp`);
            writeLine(`  │           └── ${options.name}GameModeBase.cpp`);
            writeLine('  └── Content/');
          } else {
            writeLine('  └── Content/');
          }

          writeLine();
          Logger.subTitle('Next Steps');

          if (projectType === 'cpp') {
            writeLine(
              `  1. Generate project files: ${chalk.bold(`ubuild generate --project "${result.projectPath}"`)}`
            );
            writeLine(
              `  2. Build the project: ${chalk.bold(`ubuild build --project "${result.projectPath}"`)}`
            );
            writeLine(
              `  3. Open in editor: ${chalk.bold(`Double-click ${options.name}.uproject`)}`
            );
          } else {
            writeLine(
              `  1. Open in editor: ${chalk.bold(`Double-click ${options.name}.uproject`)}`
            );
            writeLine('  2. Start creating Blueprints in the Content directory');
          }

          writeLine();
          Logger.info(`Project location: ${result.projectPath}`);
          writeLine(`Engine association: ${result.engineAssociation}`);
        } else {
          Logger.error(`Failed to initialize project: ${result.error}`);
          process.exit(1);
        }
      } catch (error) {
        Logger.error(
          `Initialization failed: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }
    });
}

async function dryRunInit(options: InitCommandActionOptions): Promise<void> {
  Logger.subTitle('Dry Run - Project Initialization');

  writeLine(`  Project Name: ${options.name}`);
  writeLine(`  Project Type: ${options.type}`);
  writeLine(`  Template: ${options.template}`);
  writeLine(`  Directory: ${options.directory || `./${options.name}`}`);
  writeLine(`  Force: ${options.force ? 'Yes' : 'No'}`);

  if (options.enginePath) {
    writeLine(`  Engine Path: ${options.enginePath}`);
  } else {
    try {
      const { EngineResolver } = await import('../core/engine-resolver');
      const engines = await EngineResolver.findEngineInstallations();

      if (engines.length === 0) {
        writeLine(`  Engine: ${chalk.yellow('No engines found - will prompt for path')}`);
      } else if (engines.length === 1) {
        writeLine(`  Engine: ${engines[0].displayName || engines[0].associationId}`);
      } else {
        writeLine(
          `  Engine: ${chalk.yellow('Multiple engines available - will prompt for selection')}`
        );
        engines.forEach((engine, i) => {
          const version = engine.version
            ? `UE ${engine.version.MajorVersion}.${engine.version.MinorVersion}.${engine.version.PatchVersion}`
            : 'Unknown version';
          writeLine(`    ${i + 1}. ${engine.displayName || engine.associationId} (${version})`);
        });
      }
    } catch {
      writeLine(`  Engine: ${chalk.yellow('Detection failed - will prompt for path')}`);
    }
  }

  writeLine();
  Logger.subTitle('What would be created:');

  const directory = options.directory || path.join(process.cwd(), options.name);
  writeLine(`  ${directory}/`);
  writeLine(`  ├── ${options.name}.uproject`);
  writeLine('  ├── Config/');
  writeLine('  │   └── *.ini files');

  if (options.type === 'cpp') {
    writeLine('  ├── Source/');
    writeLine(`  │   ├── ${options.name}.Target.cs`);
    writeLine(`  │   ├── ${options.name}Editor.Target.cs`);
    writeLine(`  │   └── ${options.name}/`);
    writeLine(`  │       ├── ${options.name}.Build.cs`);
    writeLine('  │       ├── Public/');
    writeLine('  │       └── Private/');
    writeLine('  └── Content/');
  } else {
    writeLine('  └── Content/');
  }

  writeLine();
  Logger.info('This is a dry run - no files will be created');
  writeLine('To actually create the project, remove the --dry-run flag');
}
