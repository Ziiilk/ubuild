/**
 * Project initializer module for ubuild
 *
 * Initializes new Unreal Engine projects with support for C++, Blueprint,
 * and Blank project types. Handles project directory creation, template
 * selection, and engine association setup.
 *
 * @module core/project-initializer
 */

import crypto from 'crypto';
import path from 'path';
import fs from 'fs-extra';
import inquirer from 'inquirer';
import type { InitOptions, InitResult, ProjectType } from '../types/init';
import type { EngineInstallation, EngineVersionInfo } from '../types/engine';
import { Logger } from '../utils/logger';
import { Validator } from '../utils/validator';
import { formatError } from '../utils/error';
import { DEFAULTS } from '../utils/constants';
import { EngineResolver } from './engine-resolver';

/** Default engine version fallback when engine version detection fails. */
const DEFAULT_ENGINE_VERSION_FALLBACK = '5.1';

/**
 * Response from the engine selection interactive prompt.
 * Contains the user's chosen engine path or identifier.
 */
interface EngineSelectionPromptAnswer {
  /** The path or identifier of the selected Unreal Engine installation */
  selectedEngine: string;
}

/**
 * Initializes new Unreal Engine projects with various templates and configurations.
 * Supports C++, Blueprint, and blank project types.
 */
export class ProjectInitializer {
  /**
   * Initializes a new Unreal Engine project with the specified options.
   * @param options - Initialization options including name, type, and engine path
   * @returns Promise resolving to initialization result with created files
   */
  static async initialize(options: InitOptions): Promise<InitResult> {
    const createdFiles: string[] = [];

    try {
      const validatedOptions = await this.validateOptions(options);
      const { name, type, template, directory, enginePath, force } = validatedOptions;

      Logger.title(`Initializing ${name}`);

      await fs.ensureDir(directory);

      const safetyCheck = await Validator.isSafeForInit(directory, force);
      if (!safetyCheck.safe) {
        throw new Error(`Directory not safe for initialization: ${safetyCheck.message}`);
      }

      Logger.info(`Project directory: ${directory}`);
      Logger.info(`Project type: ${type}`);
      Logger.info(`Engine: ${enginePath}`);

      switch (type) {
        case 'cpp':
          await this.createCppProject(name, directory, enginePath);
          break;
        case 'blueprint':
        case 'blank':
          // Content directory is created later in initialize() with proper tracking
          break;
      }

      // Compute engine association once — getEngineAssociationId performs
      // expensive filesystem/registry lookups via EngineResolver.findEngineInstallations.
      const engineAssociation = await this.getEngineAssociationId(enginePath);

      const uprojectPath = await this.createUProjectFile(name, directory, engineAssociation, type);
      createdFiles.push(uprojectPath);

      if (type === 'cpp') {
        const sourceFiles = await this.createSourceFiles(name, directory, enginePath, template);
        createdFiles.push(...sourceFiles);
      }

      if (type === 'blueprint' || type === 'blank') {
        const contentDir = path.join(directory, 'Content');
        await fs.ensureDir(contentDir);
        createdFiles.push(contentDir);
      }

      const configDir = path.join(directory, 'Config');
      await fs.ensureDir(configDir);
      createdFiles.push(configDir);

      const configFiles = await this.createConfigFiles(directory);
      createdFiles.push(...configFiles);

      Logger.success(`Project ${name} initialized successfully`);

      return {
        success: true,
        projectPath: directory,
        uprojectPath,
        engineAssociation,
        createdFiles,
      };
    } catch (error) {
      return {
        success: false,
        projectPath: options.directory || '',
        uprojectPath: '',
        engineAssociation: '',
        createdFiles,
        error: formatError(error),
      };
    }
  }

  /**
   * Validates and normalizes initialization options.
   * @param options - Raw initialization options from user input
   * @returns Promise resolving to validated and normalized options with defaults applied
   * @throws Error if project name is missing or invalid
   * @throws Error if no engine installations are found
   */
  private static async validateOptions(options: InitOptions): Promise<Required<InitOptions>> {
    const name = options.name;
    if (!name) {
      throw new Error('Project name is required');
    }

    if (!Validator.isValidProjectName(name)) {
      throw new Error(
        'Project name can only contain alphanumeric characters, underscores, and hyphens'
      );
    }

    const type: ProjectType = options.type || DEFAULTS.PROJECT_TYPE;
    if (!Validator.isValidProjectType(type)) {
      throw new Error(`Invalid project type: ${type}`);
    }

    const directory = options.directory || path.join(process.cwd(), name);
    const template = options.template || DEFAULTS.BUILD_TEMPLATE;

    let enginePath = options.enginePath;
    if (!enginePath) {
      const engines = await EngineResolver.findEngineInstallations();

      if (engines.length === 0) {
        throw new Error('No Unreal Engine installations found. Please specify --engine-path');
      } else if (engines.length === 1) {
        enginePath = engines[0].path;
        Logger.info(`Using engine: ${engines[0].displayName || engines[0].associationId}`);
      } else {
        enginePath = await this.promptForEngineSelection(engines);
      }
    }

    if (!(await Validator.isValidEnginePath(enginePath))) {
      throw new Error(
        `Invalid engine path: ${enginePath}. Make sure it points to a valid Unreal Engine installation.`
      );
    }

    const force = options.force || false;

    return {
      name,
      type,
      template,
      enginePath,
      directory,
      force,
    };
  }

  /**
   * Prompts the user to select an engine from available installations.
   * @param engines - Array of available engine installations
   * @returns Promise resolving to the selected engine path
   */
  private static async promptForEngineSelection(engines: EngineInstallation[]): Promise<string> {
    Logger.info('Multiple Unreal Engine installations found:');

    const choices = engines.map((engine, _index) => {
      let description = engine.path;
      if (engine.version) {
        description += ` (UE ${engine.version.MajorVersion}.${engine.version.MinorVersion}.${engine.version.PatchVersion})`;
      }
      if (engine.displayName) {
        description = `${engine.displayName} - ${description}`;
      }
      return {
        name: description,
        value: engine.path,
      };
    });

    const { selectedEngine } = await inquirer.prompt<EngineSelectionPromptAnswer>([
      {
        type: 'list',
        name: 'selectedEngine',
        message: 'Select engine to use:',
        choices,
      },
    ]);

    return selectedEngine;
  }

  /**
   * Creates the directory structure for a C++ project.
   * @param name - Project name
   * @param directory - Target directory for the project
   * @param _enginePath - Engine path (unused but kept for API consistency)
   */
  private static async createCppProject(
    name: string,
    directory: string,
    _enginePath: string
  ): Promise<void> {
    const sourceDir = path.join(directory, 'Source');
    await fs.ensureDir(sourceDir);

    const moduleDir = path.join(sourceDir, name);
    await fs.ensureDir(moduleDir);

    await fs.ensureDir(path.join(moduleDir, 'Public'));
    await fs.ensureDir(path.join(moduleDir, 'Private'));
  }

  /**
   * Creates the .uproject JSON file for the project.
   * @param name - Project name
   * @param directory - Target directory for the project
   * @param enginePath - Path to the Unreal Engine installation
   * @param type - Project type (cpp, blueprint, or blank)
   * @returns Promise resolving to the path of the created .uproject file
   */
  private static async createUProjectFile(
    name: string,
    directory: string,
    engineAssociation: string,
    type: ProjectType
  ): Promise<string> {
    const uprojectPath = path.join(directory, `${name}.uproject`);

    const uproject = {
      FileVersion: 3,
      EngineAssociation: engineAssociation,
      Category: '',
      Description: '',
      Modules:
        type === 'cpp'
          ? [
              {
                Name: name,
                Type: 'Runtime',
                LoadingPhase: 'Default',
              },
            ]
          : [],
      Plugins: [],
      TargetPlatforms: [],
    };

    await fs.writeFile(uprojectPath, JSON.stringify(uproject, null, 2), 'utf-8');
    return uprojectPath;
  }

  /**
   * Retrieves version information from the engine's Build.version file.
   * @param enginePath - Path to the Unreal Engine installation
   * @returns Promise resolving to engine version info, or undefined if not found
   */
  private static async getEngineVersionInfo(
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

  /**
   * Determines the engine association ID for the .uproject file.
   * @param enginePath - Path to the Unreal Engine installation
   * @returns Promise resolving to the engine association identifier
   */
  private static async getEngineAssociationId(enginePath: string): Promise<string> {
    const engines = await EngineResolver.findEngineInstallations();
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

    return DEFAULT_ENGINE_VERSION_FALLBACK;
  }

  /**
   * Creates all source files for a C++ project including targets, modules, and game code.
   * @param name - Project name
   * @param directory - Target directory for the project
   * @param enginePath - Path to the Unreal Engine installation
   * @returns Promise resolving to array of created file paths
   */
  private static async createSourceFiles(
    name: string,
    directory: string,
    enginePath: string,
    template: string
  ): Promise<string[]> {
    const createdFiles: string[] = [];
    const sourceDir = path.join(directory, 'Source');
    const versionInfo = await this.getEngineVersionInfo(enginePath);
    if (versionInfo) {
      Logger.debug(
        `Engine version: ${versionInfo.MajorVersion}.${versionInfo.MinorVersion}.${versionInfo.PatchVersion}`
      );
    }

    const gameTarget = await this.createTargetFile(name, sourceDir, 'Game', versionInfo);
    const editorTarget = await this.createTargetFile(name, sourceDir, 'Editor', versionInfo);
    createdFiles.push(gameTarget, editorTarget);

    const buildCs = await this.createBuildCsFile(name, sourceDir);
    createdFiles.push(buildCs);

    const moduleDir = path.join(sourceDir, name);
    const publicDir = path.join(moduleDir, 'Public');
    const privateDir = path.join(moduleDir, 'Private');

    const moduleHeader = await this.createModuleHeader(name, publicDir);
    createdFiles.push(moduleHeader);

    const moduleSource = await this.createModuleSource(name, privateDir);
    createdFiles.push(moduleSource);

    const gameModeHeader = await this.createGameModeHeader(name, publicDir);
    createdFiles.push(gameModeHeader);

    const gameModeSource = await this.createGameModeSource(name, privateDir, template);
    createdFiles.push(gameModeSource);

    return createdFiles;
  }

  /**
   * Creates a Target.cs file for the project.
   * @param name - Project name
   * @param sourceDir - Source directory path
   * @param type - Target type (Game or Editor)
   * @param versionInfo - Optional engine version info for version-specific settings
   * @returns Promise resolving to the path of the created target file
   */
  private static async createTargetFile(
    name: string,
    sourceDir: string,
    type: 'Game' | 'Editor',
    versionInfo?: EngineVersionInfo
  ): Promise<string> {
    const fileName = type === 'Editor' ? `${name}Editor.Target.cs` : `${name}.Target.cs`;
    const filePath = path.join(sourceDir, fileName);

    const targetType = type === 'Editor' ? 'TargetType.Editor' : 'TargetType.Game';
    const extraModuleNames = type === 'Editor' ? `"${name}"` : '';

    const isUE5 = versionInfo && versionInfo.MajorVersion >= 5;

    const defaultBuildSettings = isUE5 ? 'BuildSettingsVersion.Latest' : 'BuildSettingsVersion.V2';
    const includeOrderLine = isUE5
      ? '        IncludeOrderVersion = EngineIncludeOrderVersion.Latest;'
      : '';

    const bodyLines = [
      `        Type = ${targetType};`,
      `        DefaultBuildSettings = ${defaultBuildSettings};`,
      includeOrderLine,
      extraModuleNames
        ? `        ExtraModuleNames.AddRange(new string[] { ${extraModuleNames} });`
        : '',
    ].filter(Boolean);
    const content = `using UnrealBuildTool;
using System.Collections.Generic;

public class ${name}${type === 'Editor' ? 'Editor' : ''}Target : TargetRules
{
    public ${name}${type === 'Editor' ? 'Editor' : ''}Target(TargetInfo Target) : base(Target)
    {
${bodyLines.join('\n')}
    }
}`;

    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
  }

  /**
   * Creates the Build.cs file for the project's module.
   * @param name - Project name
   * @param sourceDir - Source directory path
   * @returns Promise resolving to the path of the created Build.cs file
   */
  private static async createBuildCsFile(name: string, sourceDir: string): Promise<string> {
    const filePath = path.join(sourceDir, name, `${name}.Build.cs`);

    const content = `using UnrealBuildTool;

public class ${name} : ModuleRules
{
    public ${name}(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicDependencyModuleNames.AddRange(new string[] {
            "Core",
            "CoreUObject",
            "Engine",
            "InputCore"
        });

        PrivateDependencyModuleNames.AddRange(new string[] {
        });
    }
}`;

    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
  }

  /**
   * Creates the module header file.
   * @param name - Project name
   * @param publicDir - Public directory path
   * @returns Promise resolving to the path of the created header file
   */
  private static async createModuleHeader(name: string, publicDir: string): Promise<string> {
    const filePath = path.join(publicDir, `${name}.h`);

    const content = `#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleManager.h"

class F${name}Module : public IModuleInterface
{
public:
    virtual void StartupModule() override;
    virtual void ShutdownModule() override;
};`;

    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
  }

  /**
   * Creates the module source file.
   * @param name - Project name
   * @param privateDir - Private directory path
   * @returns Promise resolving to the path of the created source file
   */
  private static async createModuleSource(name: string, privateDir: string): Promise<string> {
    const filePath = path.join(privateDir, `${name}.cpp`);

    const content = `#include "${name}.h"
#include "Modules/ModuleManager.h"

IMPLEMENT_MODULE(F${name}Module, ${name})

void F${name}Module::StartupModule()
{
}

void F${name}Module::ShutdownModule()
{
}`;

    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
  }

  /**
   * Creates the game mode header file.
   * @param name - Project name
   * @param publicDir - Public directory path
   * @returns Promise resolving to the path of the created game mode header file
   */
  private static async createGameModeHeader(name: string, publicDir: string): Promise<string> {
    const filePath = path.join(publicDir, `${name}GameModeBase.h`);

    const content = `#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "${name}GameModeBase.generated.h"

UCLASS()
class A${name}GameModeBase : public AGameModeBase
{
    GENERATED_BODY()

public:
    A${name}GameModeBase();
};`;

    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
  }

  /**
   * Creates the game mode source file.
   * @param name - Project name
   * @param privateDir - Private directory path
   * @param template - Project template name (e.g. 'ThirdPerson', 'Basic')
   * @returns Promise resolving to the path of the created game mode source file
   */
  private static async createGameModeSource(
    name: string,
    privateDir: string,
    template: string
  ): Promise<string> {
    const filePath = path.join(privateDir, `${name}GameModeBase.cpp`);

    let constructorBody: string;
    if (template === 'ThirdPerson') {
      constructorBody = `    static ConstructorHelpers::FClassFinder<APawn> PlayerPawnBPClass(TEXT("/Game/ThirdPerson/Blueprints/BP_ThirdPersonCharacter"));
    if (PlayerPawnBPClass.Class != nullptr)
    {
        DefaultPawnClass = PlayerPawnBPClass.Class;
    }`;
    } else {
      constructorBody = '';
    }

    const content = `#include "${name}GameModeBase.h"

A${name}GameModeBase::A${name}GameModeBase()
{
${constructorBody}}`;

    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
  }

  /**
   * Creates default configuration files for the project.
   * @param directory - Project directory path
   * @returns Promise resolving when config files are created
   */
  private static async createConfigFiles(directory: string): Promise<string[]> {
    const configDir = path.join(directory, 'Config');
    const createdFiles: string[] = [];

    const defaultEngineContent = `[/Script/EngineSettings.GeneralProjectSettings]
ProjectID=${crypto.randomUUID()}

[/Script/Engine.Engine]
+ActiveGameNameRedirects=(OldGameName="/Script/Engine",NewGameName="/Script/Engine")
+ActiveGameNameRedirects=(OldGameName="/Script/CoreUObject",NewGameName="/Script/CoreUObject")
`;
    const defaultEnginePath = path.join(configDir, 'DefaultEngine.ini');
    await fs.writeFile(defaultEnginePath, defaultEngineContent, 'utf-8');
    createdFiles.push(defaultEnginePath);

    const defaultGameContent = `[/Script/Engine.GameSession]
`;
    const defaultGamePath = path.join(configDir, 'DefaultGame.ini');
    await fs.writeFile(defaultGamePath, defaultGameContent, 'utf-8');
    createdFiles.push(defaultGamePath);

    const defaultEditorContent = `[/Script/UnrealEd.EditorEngine]
+ActiveGameNameRedirects=(OldGameName="/Script/Engine",NewGameName="/Script/Engine")
+ActiveGameNameRedirects=(OldGameName="/Script/CoreUObject",NewGameName="/Script/CoreUObject")
`;
    const defaultEditorPath = path.join(configDir, 'DefaultEditor.ini');
    await fs.writeFile(defaultEditorPath, defaultEditorContent, 'utf-8');
    createdFiles.push(defaultEditorPath);

    return createdFiles;
  }
}
