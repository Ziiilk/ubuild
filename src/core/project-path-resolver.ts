import fs from 'fs-extra';
import path from 'path';
import { ProjectPathResolution } from '../types/project';

export class ProjectPathResolver {
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

  static async resolveOrThrow(projectPath: string = process.cwd()): Promise<string> {
    const resolution = await this.resolve(projectPath);

    if (resolution.isDirectory && !resolution.wasResolvedFromDirectory) {
      throw new Error(`No .uproject file found in project directory: ${resolution.inputPath}`);
    }

    return resolution.resolvedPath;
  }
}
