import path from 'path';
import fs from 'fs-extra';
import { Logger } from './logger';

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
    const validTargets = ['Editor', 'Game', 'Client', 'Server'];
    return validTargets.includes(target) || target.trim().length > 0;
  }

  static isValidBuildConfig(config: string): boolean {
    const validConfigs = ['Debug', 'DebugGame', 'Development', 'Shipping', 'Test'];
    return validConfigs.includes(config);
  }

  static isValidBuildPlatform(platform: string): boolean {
    const validPlatforms = ['Win64', 'Win32', 'Linux', 'Mac', 'Android', 'IOS'];
    return validPlatforms.includes(platform);
  }

  static isValidIDE(ide: string): boolean {
    const validIDEs = ['sln', 'vscode', 'clion', 'xcode', 'vs2022'];
    return validIDEs.includes(ide);
  }

  static isValidProjectType(type: string): boolean {
    const validTypes = ['cpp', 'blueprint', 'blank'];
    return validTypes.includes(type);
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

      return (
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
