/**
 * Project path resolver module for ubuild
 *
 * Resolves project paths to .uproject files.
 * Handles both directory paths (finding the .uproject inside) and direct .uproject file paths.
 *
 * @module core/project-path-resolver
 */

import fs from 'fs-extra';
import path from 'path';
import { ProjectPathResolution } from '../types/project';

/**
 * Resolves project paths to .uproject files.
 * Handles both directory paths (finding the .uproject inside) and direct .uproject file paths.
 */
export class ProjectPathResolver {
  /**
   * Resolves a project path to a .uproject file path.
   * If the input is a directory containing a .uproject file, returns the path to that file.
   * If the input is already a .uproject file path, returns it as-is.
   * @param projectPath - Path to project directory or .uproject file (defaults to current working directory)
   * @returns Promise resolving to path resolution result with metadata
   */
  static async resolve(projectPath: string = process.cwd()): Promise<ProjectPathResolution> {
    if ((await fs.pathExists(projectPath)) && (await fs.stat(projectPath)).isDirectory()) {
      const uprojectFiles = await fs
        .readdir(projectPath)
        .then((files) => files.filter((file) => file.endsWith('.uproject')));

      if (uprojectFiles.length > 0) {
        return {
          inputPath: projectPath,
          resolvedPath: path.join(projectPath, uprojectFiles[0]),
          isDirectory: true,
          wasResolvedFromDirectory: true,
          hasUProjectExtension: true,
        };
      }

      return {
        inputPath: projectPath,
        resolvedPath: projectPath,
        isDirectory: true,
        wasResolvedFromDirectory: false,
        hasUProjectExtension: false,
      };
    }

    return {
      inputPath: projectPath,
      resolvedPath: projectPath,
      isDirectory: false,
      wasResolvedFromDirectory: false,
      hasUProjectExtension: projectPath.endsWith('.uproject'),
    };
  }

  /**
   * Resolves a project path and throws an error if no .uproject file is found.
   * @param projectPath - Path to project directory or .uproject file (defaults to current working directory)
   * @returns Promise resolving to the resolved .uproject file path
   * @throws Error if the path is a directory without a .uproject file
   */
  static async resolveOrThrow(projectPath: string = process.cwd()): Promise<string> {
    const resolution = await this.resolve(projectPath);

    if (resolution.isDirectory && !resolution.wasResolvedFromDirectory) {
      throw new Error(`No .uproject file found in project directory: ${resolution.inputPath}`);
    }

    return resolution.resolvedPath;
  }
}
