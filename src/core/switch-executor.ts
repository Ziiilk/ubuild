/**
 * Engine switch executor for ubuild.
 *
 * Handles switching an Unreal Engine project's engine association
 * by updating the EngineAssociation field in the .uproject file.
 *
 * @module core/switch-executor
 */

import fs from 'fs-extra';
import path from 'path';
import inquirer from 'inquirer';
import { SwitchOptions, SwitchResult } from '../types/switch';
import { EngineInstallation, EngineVersionInfo } from '../types/engine';
import { UProject } from '../types/project';
import { EngineResolver } from './engine-resolver';
import { ProjectPathResolver } from './project-path-resolver';
import { Logger, resolveLoggerStreams, type LoggableOptions } from '../utils/logger';
import { Validator } from '../utils/validator';
import { formatError } from '../utils/error';
import { formatEngineVersion } from '../utils/version';

/**
 * Executes engine switch operations on Unreal Engine projects.
 *
 * Reads the current .uproject file, resolves the target engine,
 * and updates the EngineAssociation field.
 *
 * @example
 * ```typescript
 * const executor = new SwitchExecutor({ stdout: process.stdout });
 * const result = await executor.execute({ projectPath: './MyGame' });
 * ```
 */
export class SwitchExecutor {
  private readonly logger: Logger;

  constructor(options: LoggableOptions = {}) {
    this.logger = resolveLoggerStreams(options).logger;
  }

  /**
   * Executes the engine switch operation.
   * @param options - Switch configuration options
   * @returns Promise resolving to the switch result
   */
  async execute(options: SwitchOptions): Promise<SwitchResult> {
    const uprojectPath = await ProjectPathResolver.resolveOrThrow(options.projectPath);
    const projectName = path.basename(uprojectPath, '.uproject');

    this.logger.info(`Project: ${projectName} (${uprojectPath})`);

    const uproject: UProject = await fs.readJson(uprojectPath);
    const previousAssociation = uproject.EngineAssociation;

    this.logger.info(`Current engine association: ${previousAssociation}`);

    const engines = await EngineResolver.findEngineInstallations();
    if (engines.length === 0) {
      return {
        success: false,
        previousAssociation,
        newAssociation: previousAssociation,
        uprojectPath,
        error: 'No Unreal Engine installations found',
      };
    }

    let enginePath: string;
    if (options.enginePath) {
      enginePath = options.enginePath;
      if (!(await Validator.isValidEnginePath(enginePath))) {
        return {
          success: false,
          previousAssociation,
          newAssociation: previousAssociation,
          uprojectPath,
          error: `Invalid engine path: ${enginePath}`,
        };
      }
    } else {
      enginePath = await this.promptForEngineSelection(engines, previousAssociation);
    }

    const newAssociation = await this.getEngineAssociationId(enginePath, engines);

    if (newAssociation === previousAssociation) {
      this.logger.info('Engine association is already set to the selected engine. No changes made.');
      return {
        success: true,
        previousAssociation,
        newAssociation,
        uprojectPath,
      };
    }

    uproject.EngineAssociation = newAssociation;
    await fs.writeFile(uprojectPath, JSON.stringify(uproject, null, 2), 'utf-8');

    this.logger.success(
      `Switched engine association: ${previousAssociation} → ${newAssociation}`
    );

    return {
      success: true,
      previousAssociation,
      newAssociation,
      uprojectPath,
    };
  }

  /**
   * Prompts the user to select an engine from available installations.
   * @param engines - Array of available engine installations
   * @param currentAssociation - Current engine association for highlighting
   * @returns Promise resolving to the selected engine path
   */
  private async promptForEngineSelection(
    engines: EngineInstallation[],
    currentAssociation: string
  ): Promise<string> {
    this.logger.info('Available Unreal Engine installations:');

    const choices = engines.map((engine) => {
      let description = engine.path;
      if (engine.version) {
        description += ` (UE ${formatEngineVersion(engine.version)})`;
      }
      if (engine.displayName) {
        description = `${engine.displayName} - ${description}`;
      }
      const isCurrent = engine.associationId === currentAssociation;
      if (isCurrent) {
        description += ' [current]';
      }
      return {
        name: description,
        value: engine.path,
      };
    });

    const { selectedEngine } = await inquirer.prompt<{ selectedEngine: string }>([
      {
        type: 'list',
        name: 'selectedEngine',
        message: 'Select engine to switch to:',
        choices,
      },
    ]);

    return selectedEngine;
  }

  /**
   * Determines the engine association ID for the .uproject file.
   * @param enginePath - Path to the Unreal Engine installation
   * @param engines - Already detected engine installations
   * @returns Promise resolving to the engine association identifier
   */
  private async getEngineAssociationId(
    enginePath: string,
    engines: EngineInstallation[]
  ): Promise<string> {
    const matchingEngine = engines.find((engine) => engine.path === enginePath);

    if (matchingEngine) {
      if (matchingEngine.source === 'launcher' && matchingEngine.version) {
        return `${matchingEngine.version.MajorVersion}.${matchingEngine.version.MinorVersion}`;
      }
      if (matchingEngine.associationId) {
        return matchingEngine.associationId;
      }
    }

    const versionInfo = await this.getEngineVersionInfo(enginePath);
    if (versionInfo) {
      return `${versionInfo.MajorVersion}.${versionInfo.MinorVersion}`;
    }

    return '';
  }

  /**
   * Retrieves version information from the engine's Build.version file.
   * @param enginePath - Path to the Unreal Engine installation
   * @returns Promise resolving to engine version info, or undefined if not found
   */
  private async getEngineVersionInfo(
    enginePath: string
  ): Promise<EngineVersionInfo | undefined> {
    try {
      const versionFile = path.join(enginePath, 'Engine', 'Build', 'Build.version');
      if (!(await fs.pathExists(versionFile))) {
        return undefined;
      }
      const content = await fs.readFile(versionFile, 'utf-8');
      const versionInfo: EngineVersionInfo = JSON.parse(content);
      return versionInfo;
    } catch (error) {
      Logger.debug(`getEngineVersionInfo failed: ${formatError(error)}`);
      return undefined;
    }
  }
}
