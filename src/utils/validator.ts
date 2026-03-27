import path from 'path';
import fs from 'fs-extra';
import { Logger } from './logger';
import { formatError } from './error';
import {
  BUILD_TARGETS,
  BUILD_CONFIGS,
  BUILD_PLATFORMS,
  IDE_TYPES,
  PROJECT_TYPES,
  type BuildTarget,
  type BuildConfig,
  type BuildPlatform,
  type IDEType,
  type ProjectType,
} from './constants';

/**
 * Validation utilities for ubuild
 *
 * Provides standardized validation functions for project names, engine paths,
 * build configurations, and project files. Ensures consistent validation
 * across all commands and operations.
 *
 * @module utils/validator
 * @example
 * ```typescript
 * import { Validator } from '@zitool/ubuild';
 *
 * // Validate project name
 * if (Validator.isValidProjectName('MyProject')) {
 *   console.log('Valid project name');
 * }
 *
 * // Validate engine path
 * const isValid = await Validator.isValidEnginePath('/path/to/UE5');
 *
 * // Validate .uproject file
 * const isProject = await Validator.isValidUProjectFile('./MyProject.uproject');
 * ```
 */
export class Validator {
  /**
   * Parses and validates a positive integer option value.
   * @param value - The raw string value to parse
   * @param optionName - The name of the option for error messages
   * @param maxValue - Optional maximum allowed value
   * @returns The parsed positive integer
   * @throws Error if value is not a valid positive integer or exceeds maximum
   */
  static parsePositiveInt(value: string, optionName: string, maxValue?: number): number {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed <= 0) {
      throw new Error(`${optionName} must be a positive integer, got: ${value}`);
    }
    if (parsed !== parseFloat(value)) {
      throw new Error(`${optionName} must be an integer, got: ${value}`);
    }
    if (maxValue !== undefined && parsed > maxValue) {
      throw new Error(`${optionName} must be <= ${maxValue}, got: ${value}`);
    }
    return parsed;
  }

  /**
   * Validates a project name format (alphanumeric, underscores, hyphens).
   * @param name - The project name to validate
   * @returns True if the name is valid
   */
  static isValidProjectName(name: string): boolean {
    return /^[a-zA-Z0-9_-]+$/.test(name);
  }

  /**
   * Validates that an engine path exists and contains required directories.
   * @param enginePath - The path to validate
   * @returns Promise resolving to true if the path is a valid engine installation
   */
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
      Logger.debug(`isValidEnginePath failed: ${formatError(error)}`);
      return false;
    }
  }

  /**
   * Validates a build target name.
   * @param target - The target to validate
   * @returns True if valid or non-empty string for custom targets
   */
  static isValidBuildTarget(target: string): target is BuildTarget | string {
    // Accept known targets or any non-empty string (for custom targets)
    return (
      BUILD_TARGETS.includes(target as (typeof BUILD_TARGETS)[number]) || target.trim().length > 0
    );
  }

  /**
   * Validates a build configuration string.
   * @param config - The configuration to validate
   * @returns True if the configuration is valid
   */
  static isValidBuildConfig(config: string): config is BuildConfig {
    return BUILD_CONFIGS.includes(config as (typeof BUILD_CONFIGS)[number]);
  }

  /**
   * Validates a build platform string.
   * @param platform - The platform to validate
   * @returns True if the platform is valid
   */
  static isValidBuildPlatform(platform: string): platform is BuildPlatform {
    return BUILD_PLATFORMS.includes(platform as (typeof BUILD_PLATFORMS)[number]);
  }

  /**
   * Validates an IDE type string.
   * @param ide - The IDE type to validate
   * @returns True if the IDE type is valid
   */
  static isValidIDE(ide: string): ide is IDEType {
    return IDE_TYPES.includes(ide as (typeof IDE_TYPES)[number]);
  }

  /**
   * Validates a project type string.
   * @param type - The project type to validate
   * @returns True if the project type is valid
   */
  static isValidProjectType(type: string): type is ProjectType {
    return PROJECT_TYPES.includes(type as (typeof PROJECT_TYPES)[number]);
  }

  /**
   * Validates that a file is a valid .uproject file.
   * @param uprojectPath - Path to the .uproject file
   * @returns Promise resolving to true if the file is a valid project file
   */
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

      // Blueprint projects may not have Modules array, so make it optional
      const hasValidFileVersion = uproject.FileVersion === 3;
      const hasEngineAssociation =
        typeof uproject.EngineAssociation === 'string' && uproject.EngineAssociation.length > 0;
      const hasValidModules = !uproject.Modules || Array.isArray(uproject.Modules);

      return Boolean(hasValidFileVersion && hasEngineAssociation && hasValidModules);
    } catch (error) {
      Logger.debug(`isValidUProjectFile failed for ${uprojectPath}: ${formatError(error)}`);
      return false;
    }
  }

  /**
   * Checks if a directory is safe for project initialization.
   * @param directory - The directory to check
   * @param force - Whether to override safety checks
   * @returns Promise resolving to safety check result with message
   */
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
        message: `Failed to check directory: ${formatError(error)}`,
      };
    }
  }
}
