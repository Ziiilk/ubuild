import path from 'path';
import fs from 'fs-extra';
import { Logger } from './logger';
import {
  BUILD_TARGETS,
  BUILD_CONFIGS,
  BUILD_PLATFORMS,
  IDE_TYPES,
  PROJECT_TYPES,
} from './constants';

export class Validator {
  static isValidProjectName(name: string): boolean {
    return /^[a-zA-Z0-9_-]+$/.test(name);
  }

  static async isValidEnginePath(enginePath: string): Promise<boolean> {
    try {
      const normalizedPath = path.normalize(enginePath);

      if (!(await fs.pathExists(normalizedPath))) {
        return false;
      }

      const requiredDirs = [
        path.join(normalizedPath, 'Engine'),
        path.join(normalizedPath, 'Engine', 'Binaries'),
      ];

      for (const dir of requiredDirs) {
        if (!(await fs.pathExists(dir))) {
          return false;
        }
      }

      return true;
    } catch (error) {
      Logger.debug(
        `isValidEnginePath failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  static isValidBuildTarget(target: string): boolean {
    // Accept known targets or any non-empty string (for custom targets)
    return (
      BUILD_TARGETS.includes(target as (typeof BUILD_TARGETS)[number]) || target.trim().length > 0
    );
  }

  static isValidBuildConfig(config: string): boolean {
    return BUILD_CONFIGS.includes(config as (typeof BUILD_CONFIGS)[number]);
  }

  static isValidBuildPlatform(platform: string): boolean {
    return BUILD_PLATFORMS.includes(platform as (typeof BUILD_PLATFORMS)[number]);
  }

  static isValidIDE(ide: string): boolean {
    return IDE_TYPES.includes(ide as (typeof IDE_TYPES)[number]);
  }

  static isValidProjectType(type: string): boolean {
    return PROJECT_TYPES.includes(type as (typeof PROJECT_TYPES)[number]);
  }

  static async isValidUProjectFile(uprojectPath: string): Promise<boolean> {
    try {
      if (!uprojectPath.endsWith('.uproject')) {
        return false;
      }

      if (!(await fs.pathExists(uprojectPath))) {
        return false;
      }

      const content = await fs.readFile(uprojectPath, 'utf-8');
      const uproject = JSON.parse(content);

      return Boolean(
        uproject.FileVersion === 3 && uproject.EngineAssociation && Array.isArray(uproject.Modules)
      );
    } catch (error) {
      Logger.debug(
        `isValidUProjectFile failed for ${uprojectPath}: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  static async isSafeForInit(
    directory: string,
    force = false
  ): Promise<{ safe: boolean; message: string }> {
    try {
      if (!(await fs.pathExists(directory))) {
        return { safe: true, message: 'Directory does not exist, will be created' };
      }

      const stat = await fs.stat(directory);
      if (!stat.isDirectory()) {
        return { safe: false, message: 'Path exists but is not a directory' };
      }

      const files = await fs.readdir(directory);
      const filteredFiles = files.filter((f) => !f.startsWith('.') && f !== '.git');

      if (filteredFiles.length === 0) {
        return { safe: true, message: 'Directory is empty or contains only hidden files' };
      }

      const uprojectFiles = files.filter((f) => f.endsWith('.uproject'));
      if (uprojectFiles.length > 0) {
        return {
          safe: false,
          message: `Directory already contains Unreal Engine project: ${uprojectFiles[0]}`,
        };
      }

      if (force) {
        return {
          safe: true,
          message: 'Directory is not empty, but force flag is set - proceeding anyway',
        };
      }

      return {
        safe: false,
        message: 'Directory is not empty. Use --force to override.',
      };
    } catch (error) {
      return {
        safe: false,
        message: `Failed to check directory: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
