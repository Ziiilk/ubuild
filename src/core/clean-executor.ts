/**
 * Clean executor module for ubuild
 *
 * Executes clean operations for Unreal Engine projects by removing build
 * artifacts including Binaries, Intermediate, and Saved directories.
 * Supports dry-run mode and selective cleaning.
 *
 * @module core/clean-executor
 */

import fs from 'fs-extra';
import path from 'path';
import { Writable } from 'stream';
import { CleanOptions, CleanResult } from '../types/clean';
import { formatError } from '../utils/error';
import { Logger } from '../utils/logger';
import { ProjectPathResolver } from './project-path-resolver';

/**
 * Executes clean operations for Unreal Engine projects.
 * Removes build artifacts including Binaries, Intermediate, and Saved directories.
 */
export class CleanExecutor {
  private logger: Logger;
  private stdout: Writable;
  private stderr: Writable;
  private silent: boolean;

  /**
   * Creates a new CleanExecutor instance.
   * @param options - Configuration options for logging and output streams
   */
  constructor(
    options: { logger?: Logger; stdout?: Writable; stderr?: Writable; silent?: boolean } = {}
  ) {
    this.stdout = options.stdout || process.stdout;
    this.stderr = options.stderr || process.stderr;
    this.silent = options.silent || false;
    this.logger =
      options.logger ||
      new Logger({
        stdout: this.stdout,
        stderr: this.stderr,
        silent: this.silent,
      });
  }

  /**
   * Executes a clean operation with the specified options.
   * Removes build artifacts from the project directory.
   * @param options - Clean configuration options
   * @returns Promise resolving to clean result with success status and deleted paths
   */
  async execute(options: CleanOptions): Promise<CleanResult> {
    const deletedPaths: string[] = [];
    const failedPaths: Array<{ path: string; error: string }> = [];

    try {
      const projectPath = await ProjectPathResolver.resolveOrThrow(
        options.projectPath || process.cwd()
      );

      const projectDir = path.dirname(projectPath);
      const projectName = path.basename(projectPath, '.uproject');

      // Define paths to clean
      const pathsToClean = this.getPathsToClean(projectDir, projectName, options.binariesOnly);

      if (!this.silent) {
        this.logger.info(`Cleaning project: ${projectName}`);
        this.logger.info(`Project directory: ${projectDir}`);

        if (options.binariesOnly) {
          this.logger.info('Mode: Binaries and Intermediate only');
        } else {
          this.logger.info('Mode: Full clean (Binaries, Intermediate, Saved, DerivedDataCache)');
        }

        if (options.dryRun) {
          this.logger.info('Dry run mode - no files will be deleted');
        }

        this.logger.divider();
      }

      // Clean each path
      for (const cleanPath of pathsToClean) {
        const result = await this.cleanPath(cleanPath, options.dryRun);
        if (result.deleted) {
          deletedPaths.push(cleanPath);
          if (!this.silent) {
            this.logger.success(`Removed: ${path.relative(projectDir, cleanPath)}`);
          }
        } else if (result.error) {
          failedPaths.push({ path: cleanPath, error: result.error });
          if (!this.silent) {
            this.logger.error(`Failed to remove: ${path.relative(projectDir, cleanPath)}`);
          }
        }
      }

      // Clean plugin directories
      const pluginResults = await this.cleanPluginDirectories(projectDir, options);
      deletedPaths.push(...pluginResults.deletedPaths);
      failedPaths.push(...pluginResults.failedPaths);

      // Check for failures BEFORE the silent block — success must not depend on logging mode
      if (failedPaths.length > 0) {
        if (!this.silent) {
          this.logger.divider();
        }
        return {
          success: false,
          deletedPaths,
          failedPaths,
          error: `Failed to clean ${failedPaths.length} path(s)`,
        };
      }

      if (!this.silent) {
        this.logger.divider();

        if (deletedPaths.length === 0) {
          this.logger.info('No build artifacts found to clean');
        } else {
          this.logger.success(`Cleaned ${deletedPaths.length} directory/directories`);
        }
      }

      return {
        success: true,
        deletedPaths,
        failedPaths,
      };
    } catch (error) {
      return {
        success: false,
        deletedPaths,
        failedPaths,
        error: formatError(error),
      };
    }
  }

  /**
   * Gets the list of paths to clean based on the clean mode.
   * @param projectDir - The project directory path
   * @param projectName - The name of the project
   * @param binariesOnly - Whether to clean only Binaries and Intermediate
   * @returns Array of absolute paths to clean
   */
  private getPathsToClean(
    projectDir: string,
    projectName: string,
    binariesOnly?: boolean
  ): string[] {
    const paths: string[] = [
      path.join(projectDir, 'Binaries'),
      path.join(projectDir, 'Intermediate'),
    ];

    if (!binariesOnly) {
      paths.push(
        path.join(projectDir, 'Saved'),
        path.join(projectDir, 'DerivedDataCache'),
        path.join(projectDir, `${projectName}.sln`),
        path.join(projectDir, '.vs'),
        path.join(projectDir, '.idea')
      );
    }

    return paths;
  }

  /**
   * Cleans a single path (file or directory).
   * @param cleanPath - The path to clean
   * @param dryRun - Whether to perform a dry run
   * @returns Object indicating whether the path was deleted or an error occurred
   */
  private async cleanPath(
    cleanPath: string,
    dryRun?: boolean
  ): Promise<{ deleted?: boolean; error?: string }> {
    try {
      const exists = await fs.pathExists(cleanPath);
      if (!exists) {
        return { deleted: false };
      }

      if (!dryRun) {
        await fs.remove(cleanPath);
      }

      return { deleted: true };
    } catch (error) {
      return {
        deleted: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Cleans build directories from plugin folders.
   * @param projectDir - The project directory path
   * @param options - Clean options
   * @returns Object containing arrays of deleted and failed paths
   */
  private async cleanPluginDirectories(
    projectDir: string,
    options: CleanOptions
  ): Promise<{ deletedPaths: string[]; failedPaths: Array<{ path: string; error: string }> }> {
    const deletedPaths: string[] = [];
    const failedPaths: Array<{ path: string; error: string }> = [];

    const pluginsDir = path.join(projectDir, 'Plugins');
    const pluginsExist = await fs.pathExists(pluginsDir);

    if (!pluginsExist) {
      return { deletedPaths, failedPaths };
    }

    try {
      const pluginDirs = await fs.readdir(pluginsDir);

      for (const pluginDir of pluginDirs) {
        const fullPluginPath = path.join(pluginsDir, pluginDir);
        const stat = await fs.stat(fullPluginPath);

        if (!stat.isDirectory()) {
          continue;
        }

        // Clean Binaries and Intermediate in each plugin
        const pluginBinaries = path.join(fullPluginPath, 'Binaries');
        const pluginIntermediate = path.join(fullPluginPath, 'Intermediate');

        for (const cleanPath of [pluginBinaries, pluginIntermediate]) {
          const result = await this.cleanPath(cleanPath, options.dryRun);
          if (result.deleted) {
            deletedPaths.push(cleanPath);
            if (!this.silent) {
              this.logger.success(`Removed: ${path.relative(projectDir, cleanPath)}`);
            }
          } else if (result.error) {
            failedPaths.push({ path: cleanPath, error: result.error });
            if (!this.silent) {
              this.logger.error(`Failed to remove: ${path.relative(projectDir, cleanPath)}`);
            }
          }
        }
      }
    } catch (error) {
      const errorMsg = formatError(error);
      if (!this.silent) {
        this.logger.warning(`Failed to clean plugins: ${errorMsg}`);
      }
      failedPaths.push({ path: pluginsDir, error: errorMsg });
    }

    return { deletedPaths, failedPaths };
  }
}
