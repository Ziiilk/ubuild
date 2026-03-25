import { execa } from 'execa';
import path from 'path';
import fs from 'fs-extra';
import type { GenerateOptions, GenerateResult, IDE } from '../types/generate';
import { EngineResolver } from './engine-resolver';
import { Logger } from '../utils/logger';
import { Platform } from '../utils/platform';
import { ProjectPathResolver } from './project-path-resolver';

interface VSCodeTaskDefinition {
  label?: string;
}

interface VSCodeTasksFile {
  version?: string;
  tasks?: VSCodeTaskDefinition[];
}

function isVSCodeTaskDefinition(task: unknown): task is VSCodeTaskDefinition {
  if (typeof task !== 'object' || task === null) {
    return false;
  }

  const candidate = task as VSCodeTaskDefinition;
  return candidate.label === undefined || typeof candidate.label === 'string';
}

function isVSCodeTasksFile(value: unknown): value is VSCodeTasksFile {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as VSCodeTasksFile;
  return (
    candidate.tasks === undefined ||
    (Array.isArray(candidate.tasks) && candidate.tasks.every(isVSCodeTaskDefinition))
  );
}

export class ProjectGenerator {
  static async generate(options: GenerateOptions): Promise<GenerateResult> {
    const generatedFiles: string[] = [];

    try {
      const validatedOptions = await this.validateOptions(options);
      const { ide, projectPath, enginePath, force } = validatedOptions;

      Logger.info(`Generating ${ide.toUpperCase()} project files`);
      Logger.info(`Project: ${projectPath}`);
      Logger.info(`Engine: ${enginePath}`);

      if (ide === 'sln' || ide === 'vs2022') {
        await this.generateWithUBT(enginePath, projectPath, force, ide);
        generatedFiles.push(...(await this.findGeneratedSolutionFiles(projectPath)));
      } else if (ide === 'vscode') {
        await this.generateWithUBT(enginePath, projectPath, force, ide);
        generatedFiles.push(...(await this.findGeneratedSolutionFiles(projectPath)));
        generatedFiles.push(...(await this.findVSCodeWorkspaceFiles(projectPath)));
        generatedFiles.push(...(await this.findVSCodeConfigFiles(projectPath)));

        const tasksFile = await this.generateVSCodeTasks(projectPath);
        if (tasksFile) {
          generatedFiles.push(tasksFile);
        }
      } else if (ide === 'clion') {
        await this.generateWithUBT(enginePath, projectPath, force, ide);
        generatedFiles.push(...(await this.findGeneratedCLionFiles(projectPath)));
      } else if (ide === 'xcode') {
        await this.generateWithUBT(enginePath, projectPath, force, ide);
        generatedFiles.push(...(await this.findGeneratedXcodeFiles(projectPath)));
      } else {
        await this.generateWithUBT(enginePath, projectPath, force, ide);
        generatedFiles.push(...(await this.findGeneratedSolutionFiles(projectPath)));
      }

      return {
        success: true,
        generatedFiles,
      };
    } catch (error) {
      return {
        success: false,
        generatedFiles,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private static async validateOptions(
    options: GenerateOptions
  ): Promise<Required<GenerateOptions>> {
    const ide: IDE = options.ide || 'sln';
    const force = options.force || false;

    const projectPath = await ProjectPathResolver.resolveOrThrow(
      options.projectPath || process.cwd()
    );

    const enginePath = await EngineResolver.resolveEnginePath({
      projectPath,
      enginePath: options.enginePath,
    });

    return {
      ide,
      projectPath,
      enginePath,
      force,
    };
  }

  private static async generateWithUBT(
    enginePath: string,
    projectPath: string,
    force: boolean,
    ide: IDE
  ): Promise<void> {
    const ubtPath = path.join(
      enginePath,
      'Engine',
      'Binaries',
      'DotNET',
      'UnrealBuildTool',
      `UnrealBuildTool${Platform.exeExtension()}`
    );

    if (!(await fs.pathExists(ubtPath))) {
      throw new Error(`UnrealBuildTool not found at: ${ubtPath}`);
    }

    const args = ['-projectfiles', `-project="${projectPath}"`, '-game', '-engine'];

    if (ide === 'vscode') {
      args.push('-VSCode');
    } else if (ide === 'clion') {
      args.push('-CLion');
    } else if (ide === 'xcode') {
      args.push('-XCodeProjectFiles');
    }

    if (force) {
      args.push('-force');
    }

    Logger.debug(`Executing: ${ubtPath} ${args.join(' ')}`);

    const command = `"${ubtPath}" ${args.join(' ')}`;
    const childProcess = execa(command, {
      stdio: 'pipe',
      cwd: path.dirname(ubtPath),
      shell: true,
    });

    if (childProcess.stdout) {
      childProcess.stdout.on('data', (data: Buffer) => {
        const output = data.toString();
        if (!output.includes('Log file created')) {
          process.stdout.write(output);
        }
      });
    }

    if (childProcess.stderr) {
      childProcess.stderr.on('data', (data: Buffer) => {
        process.stderr.write(data.toString());
      });
    }

    const result = await childProcess;

    if (result.exitCode !== 0) {
      throw new Error(`Project generation failed with exit code ${result.exitCode}`);
    }

    Logger.success('Project files generated successfully');
  }

  private static async findGeneratedSolutionFiles(projectPath: string): Promise<string[]> {
    const projectDir = path.dirname(projectPath);
    const solutionFiles: string[] = [];

    const slnFiles = await fs
      .readdir(projectDir)
      .then((files) => files.filter((f) => f.endsWith('.sln')));

    solutionFiles.push(...slnFiles.map((f) => path.join(projectDir, f)));

    const filterFiles = await fs
      .readdir(projectDir)
      .then((files) => files.filter((f) => f.endsWith('.vcxproj.filters')));

    solutionFiles.push(...filterFiles.map((f) => path.join(projectDir, f)));

    const vcxprojFiles = await fs
      .readdir(projectDir)
      .then((files) => files.filter((f) => f.endsWith('.vcxproj')));

    solutionFiles.push(...vcxprojFiles.map((f) => path.join(projectDir, f)));

    return solutionFiles;
  }

  private static async findGeneratedCLionFiles(projectPath: string): Promise<string[]> {
    const projectDir = path.dirname(projectPath);
    const cmakePath = path.join(projectDir, 'CMakeLists.txt');
    if (await fs.pathExists(cmakePath)) {
      return [cmakePath];
    }
    return [];
  }

  private static async findGeneratedXcodeFiles(projectPath: string): Promise<string[]> {
    const projectDir = path.dirname(projectPath);
    const entries = await fs.readdir(projectDir, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isDirectory() && e.name.endsWith('.xcodeproj'))
      .map((e) => path.join(projectDir, e.name));
    return files;
  }

  private static async findVSCodeWorkspaceFiles(projectPath: string): Promise<string[]> {
    const projectDir = path.dirname(projectPath);
    const files = await fs
      .readdir(projectDir)
      .then((list) =>
        list.filter((f) => f.endsWith('.code-workspace')).map((f) => path.join(projectDir, f))
      );
    return files;
  }

  private static async findVSCodeConfigFiles(projectPath: string): Promise<string[]> {
    const projectDir = path.dirname(projectPath);
    const vscodeDir = path.join(projectDir, '.vscode');

    if (!(await fs.pathExists(vscodeDir))) {
      return [];
    }

    const vscodeFiles = await fs
      .readdir(vscodeDir)
      .then((files) => files.map((f) => path.join(vscodeDir, f)));

    return vscodeFiles;
  }

  private static async generateVSCodeTasks(projectPath: string): Promise<string | null> {
    const projectDir = path.dirname(projectPath);
    const vscodeDir = path.join(projectDir, '.vscode');
    const tasksPath = path.join(vscodeDir, 'tasks.json');

    await fs.ensureDir(vscodeDir);

    const tasksConfig = {
      version: '2.0.0',
      tasks: [
        {
          label: 'ubuild: Build Project',
          type: 'shell',
          command: 'ubuild',
          args: ['build'],
          group: 'build',
          problemMatcher: ['$msCompile'],
          detail: 'Build Unreal Engine project using ubuild',
        },
        {
          label: 'ubuild: Run Project',
          type: 'shell',
          command: 'ubuild',
          args: ['run', '--build-first'],
          group: 'build',
          detail: 'Build and run Unreal Engine project using ubuild',
        },
      ],
    };

    if (await fs.pathExists(tasksPath)) {
      try {
        const existingContent = await fs.readJson(tasksPath);
        if (isVSCodeTasksFile(existingContent) && existingContent.tasks) {
          existingContent.tasks = existingContent.tasks.filter(
            (task) => !(task.label && task.label.startsWith('ubuild:'))
          );
          existingContent.tasks.push(...tasksConfig.tasks);
          await fs.writeJson(tasksPath, existingContent, { spaces: 2 });
          return tasksPath;
        }
      } catch {
        // Ignore invalid existing tasks.json and overwrite it below.
      }
    }

    await fs.writeJson(tasksPath, tasksConfig, { spaces: 2 });
    return tasksPath;
  }
}
