/**
 * Project generator for IDE project files.
 *
 * Generates IDE-specific project files (Visual Studio, VSCode, CLion, Xcode)
 * using UnrealBuildTool to enable development workflow integration.
 *
 * @module core/project-generator
 */

import { execa } from 'execa';
import path from 'path';
import fs from 'fs-extra';
import type { GenerateOptions, GenerateResult, IDE } from '../types/generate';
import { EngineResolver } from './engine-resolver';
import { Logger } from '../utils/logger';
import { formatError } from '../utils/error';
import { Platform } from '../utils/platform';
import { ProjectPathResolver } from './project-path-resolver';

/**
 * Represents a VSCode task definition in tasks.json.
 * Used for parsing and validating VSCode workspace task configurations.
 */
interface VSCodeTaskDefinition {
  /** The display label for the task */
  label?: string;
}

/**
 * Represents the structure of a VSCode tasks.json file.
 * Used for reading and validating VSCode workspace task configurations.
 */
interface VSCodeTasksFile {
  /** The version of the tasks file format */
  version?: string;
  /** Array of task definitions */
  tasks?: VSCodeTaskDefinition[];
}

/**
 * Type guard to check if a value is a valid VSCodeTaskDefinition.
 * Validates that the task has the expected structure with optional label property.
 * @param task - The value to check
 * @returns True if the value is a valid VSCodeTaskDefinition
 */
function isVSCodeTaskDefinition(task: unknown): task is VSCodeTaskDefinition {
  if (typeof task !== 'object' || task === null) {
    return false;
  }

  const candidate = task as VSCodeTaskDefinition;
  return candidate.label === undefined || typeof candidate.label === 'string';
}

/**
 * Type guard to check if a value is a valid VSCodeTasksFile.
 * Validates that the file has the expected structure with optional version and tasks array.
 * @param value - The value to check
 * @returns True if the value is a valid VSCodeTasksFile
 */
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

/**
 * Generates IDE project files for Unreal Engine projects.
 * Supports Visual Studio, VSCode, CLion, and Xcode through UBT integration.
 */
export class ProjectGenerator {
  /**
   * Generates project files for the specified IDE.
   * @param options - Generation options including IDE type and project path
   * @returns Promise resolving to generation result with list of created files
   */
  static async generate(options: GenerateOptions): Promise<GenerateResult> {
    const generatedFiles: string[] = [];
    const silent = options.silent || false;
    const logger = new Logger({ silent });

    try {
      const validatedOptions = await this.validateOptions(options);
      const { ide, projectPath, enginePath, force } = validatedOptions;

      logger.info(`Generating ${ide.toUpperCase()} project files`);
      logger.info(`Project: ${projectPath}`);
      logger.info(`Engine: ${enginePath}`);

      await this.generateWithUBT(enginePath, projectPath, force, ide, logger);

      // Collect IDE-specific generated files
      generatedFiles.push(...(await this.findGeneratedSolutionFiles(projectPath)));

      if (ide === 'vscode') {
        generatedFiles.push(...(await this.findVSCodeWorkspaceFiles(projectPath)));
        generatedFiles.push(...(await this.findVSCodeConfigFiles(projectPath)));

        const tasksFile = await this.generateVSCodeTasks(projectPath);
        if (tasksFile) {
          generatedFiles.push(tasksFile);
        }
      } else if (ide === 'clion') {
        generatedFiles.push(...(await this.findGeneratedCLionFiles(projectPath)));
      } else if (ide === 'xcode') {
        generatedFiles.push(...(await this.findGeneratedXcodeFiles(projectPath)));
      }

      return {
        success: true,
        generatedFiles,
      };
    } catch (error) {
      return {
        success: false,
        generatedFiles,
        error: formatError(error),
      };
    }
  }

  /**
   * Validates and normalizes generation options.
   * @param options - Raw generation options from user input
   * @returns Promise resolving to validated and normalized options with defaults applied
   * @throws Error if project path cannot be resolved
   * @throws Error if engine path cannot be resolved
   */
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

    const silent = options.silent || false;

    return {
      ide,
      projectPath,
      enginePath,
      force,
      silent,
    };
  }

  /**
   * Generates project files using UnrealBuildTool.
   * @param enginePath - Path to the Unreal Engine installation
   * @param projectPath - Path to the .uproject file
   * @param force - Whether to force regeneration
   * @param ide - IDE type to generate files for
   * @returns Promise resolving when generation is complete
   * @throws Error if UnrealBuildTool is not found
   * @throws Error if generation fails
   */
  private static async generateWithUBT(
    enginePath: string,
    projectPath: string,
    force: boolean,
    ide: IDE,
    logger: Logger
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

    const childProcess = execa(ubtPath, args, {
      stdio: 'pipe',
      cwd: path.dirname(ubtPath),
    });

    if (childProcess.stdout) {
      childProcess.stdout.on('data', (data: Buffer) => {
        const output = data.toString();
        if (!output.includes('Log file created')) {
          logger.write(output);
        }
      });
    }

    if (childProcess.stderr) {
      childProcess.stderr.on('data', (data: Buffer) => {
        logger.writeError(data.toString());
      });
    }

    const result = await childProcess;

    if (!result || result.exitCode !== 0) {
      throw new Error(`Project generation failed with exit code ${result?.exitCode ?? 'unknown'}`);
    }

    Logger.success('Project files generated successfully');
  }

  /**
   * Finds generated Visual Studio solution files.
   * @param projectPath - Path to the .uproject file
   * @returns Promise resolving to array of generated solution file paths
   */
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

  /**
   * Finds generated CLion/CMake files.
   * @param projectPath - Path to the .uproject file
   * @returns Promise resolving to array of generated CLion file paths
   */
  private static async findGeneratedCLionFiles(projectPath: string): Promise<string[]> {
    const projectDir = path.dirname(projectPath);
    const cmakePath = path.join(projectDir, 'CMakeLists.txt');
    if (await fs.pathExists(cmakePath)) {
      return [cmakePath];
    }
    return [];
  }

  /**
   * Finds generated Xcode project files.
   * @param projectPath - Path to the .uproject file
   * @returns Promise resolving to array of generated Xcode file paths
   */
  private static async findGeneratedXcodeFiles(projectPath: string): Promise<string[]> {
    const projectDir = path.dirname(projectPath);
    const entries = await fs.readdir(projectDir, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isDirectory() && e.name.endsWith('.xcodeproj'))
      .map((e) => path.join(projectDir, e.name));
    return files;
  }

  /**
   * Finds generated VSCode workspace files.
   * @param projectPath - Path to the .uproject file
   * @returns Promise resolving to array of generated workspace file paths
   */
  private static async findVSCodeWorkspaceFiles(projectPath: string): Promise<string[]> {
    const projectDir = path.dirname(projectPath);
    const files = await fs
      .readdir(projectDir)
      .then((list) =>
        list.filter((f) => f.endsWith('.code-workspace')).map((f) => path.join(projectDir, f))
      );
    return files;
  }

  /**
   * Finds VSCode configuration files in the .vscode directory.
   * @param projectPath - Path to the .uproject file
   * @returns Promise resolving to array of VSCode config file paths
   */
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

  /**
   * Generates or updates VSCode tasks.json with ubuild tasks.
   * @param projectPath - Path to the .uproject file
   * @returns Promise resolving to the tasks.json path, or null if not generated
   */
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
      } catch (parseError) {
        Logger.debug(
          `Failed to parse existing tasks.json, regenerating: ${formatError(parseError)}`
        );
      }
    }

    await fs.writeJson(tasksPath, tasksConfig, { spaces: 2 });
    return tasksPath;
  }
}
