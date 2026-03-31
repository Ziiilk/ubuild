/**
 * Project detector module for ubuild
 *
 * Detects and validates Unreal Engine projects from .uproject files.
 * Provides methods to find, parse, and validate project configurations
 * including modules, plugins, and target files.
 *
 * @module core/project-detector
 */

import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import {
  UProject,
  ProjectInfo,
  ProjectDetectionOptions,
  ProjectDetectionResult,
} from '../types/project';
import { formatError } from '../utils/error';
import { inferTargetType } from '../utils/target-helpers';

/**
 * Detects and validates Unreal Engine projects from .uproject files.
 * Provides methods to find, parse, and validate project configurations.
 */
export class ProjectDetector {
  /**
   * Detects an Unreal Engine project in the specified directory.
   * @param options - Detection options including cwd and recursive search flag
   * @returns Promise resolving to project detection result with validation status
   */
  static async detectProject(
    options: ProjectDetectionOptions = {}
  ): Promise<ProjectDetectionResult> {
    const cwd = options.cwd || process.cwd();
    const warnings: string[] = [];

    try {
      const uprojectFiles = await this.findUProjectFiles(cwd, options.recursive);

      if (uprojectFiles.length === 0) {
        return {
          isValid: false,
          error: 'No Unreal Engine project (.uproject) file found',
          warnings,
        };
      }

      const uprojectPath = uprojectFiles[0];
      const projectDir = path.dirname(uprojectPath);

      const uproject = await this.parseUProject(uprojectPath);

      const validationResult = this.validateUProject(uproject);
      if (!validationResult.isValid) {
        return {
          isValid: false,
          error: `Invalid .uproject file: ${validationResult.error}`,
          warnings: [...warnings, ...validationResult.warnings],
        };
      }

      // Merge validation warnings (e.g., unexpected FileVersion) into the result
      warnings.push(...validationResult.warnings);

      const projectName = path.basename(uprojectPath, '.uproject');

      const sourceDir = path.join(projectDir, 'Source');
      const hasSourceDir = await fs.pathExists(sourceDir);

      if (!hasSourceDir) {
        warnings.push('Source directory not found - this may be a blueprint-only project');
      }

      const targets = hasSourceDir ? await this.findTargetFiles(sourceDir) : [];

      const modules = hasSourceDir ? await this.findModuleFiles(sourceDir) : [];

      const projectInfo: ProjectInfo = {
        name: projectName,
        path: projectDir,
        uproject,
        sourceDir: hasSourceDir ? sourceDir : '',
        targets,
        modules,
      };

      return {
        isValid: true,
        project: projectInfo,
        warnings,
      };
    } catch (error) {
      return {
        isValid: false,
        error: formatError(error),
        warnings,
      };
    }
  }

  /**
   * Finds .uproject files in the specified directory.
   * @param cwd - The directory to search in
   * @param recursive - Whether to search recursively in subdirectories
   * @returns Promise resolving to array of absolute paths to .uproject files
   */
  private static async findUProjectFiles(cwd: string, recursive?: boolean): Promise<string[]> {
    const pattern = recursive ? '**/*.uproject' : '*.uproject';
    return await glob(pattern, { cwd, absolute: true });
  }

  /**
   * Parses a .uproject file and returns its contents as a UProject object.
   * @param uprojectPath - Absolute path to the .uproject file
   * @returns Promise resolving to the parsed UProject object
   * @throws Error if the file cannot be read or contains invalid JSON
   */
  private static async parseUProject(uprojectPath: string): Promise<UProject> {
    const content = await fs.readFile(uprojectPath, 'utf-8');
    try {
      return JSON.parse(content);
    } catch (parseError) {
      throw new Error(`Invalid JSON in .uproject file: ${formatError(parseError)}`);
    }
  }

  /**
   * Validates that a parsed UProject object has all required fields.
   * @param uproject - The UProject object to validate
   * @returns Validation result with isValid flag, optional error message, and warnings array
   */
  private static validateUProject(uproject: UProject): {
    isValid: boolean;
    error?: string;
    warnings: string[];
  } {
    const warnings: string[] = [];

    if (uproject.FileVersion === undefined) {
      return { isValid: false, error: 'Missing FileVersion field', warnings };
    }

    if (uproject.FileVersion !== 3) {
      warnings.push(`Unexpected FileVersion: ${uproject.FileVersion}. Expected 3.`);
    }

    if (!uproject.EngineAssociation) {
      return { isValid: false, error: 'Missing EngineAssociation field', warnings };
    }

    if (!uproject.Modules || !Array.isArray(uproject.Modules)) {
      return { isValid: false, error: 'Missing or invalid Modules array', warnings };
    }

    return { isValid: true, warnings };
  }

  /**
   * Finds .Target.cs files in the Source directory and extracts target information.
   * @param sourceDir - Absolute path to the Source directory
   * @returns Promise resolving to array of target objects with name, type, and path
   */
  private static async findTargetFiles(sourceDir: string): Promise<ProjectInfo['targets']> {
    const files = await glob('*.Target.cs', { cwd: sourceDir, absolute: false });

    const targets = files.map((file) => {
      const fileName = path.basename(file, '.Target.cs');
      const type = inferTargetType(fileName);

      return {
        name: fileName,
        type,
        path: path.join(sourceDir, file),
      };
    });

    return targets;
  }

  /**
   * Finds .Build.cs files in the Source directory and extracts module information.
   * @param sourceDir - Absolute path to the Source directory
   * @returns Promise resolving to array of module objects with name and path
   */
  private static async findModuleFiles(sourceDir: string): Promise<ProjectInfo['modules']> {
    const files = await glob('**/*.Build.cs', { cwd: sourceDir, absolute: false });

    const modules = files.map((file) => {
      const moduleName = path.basename(file, '.Build.cs');
      return {
        name: moduleName,
        path: path.join(sourceDir, file),
      };
    });

    return modules;
  }
}
