import path from 'path';
import fs from 'fs-extra';
import inquirer from 'inquirer';
import type { InitOptions, InitResult, ProjectType } from '../types/init';
import type { EngineInstallation, EngineVersionInfo } from '../types/engine';
import { Logger } from '../utils/logger';
import { Validator } from '../utils/validator';
import { EngineResolver } from './engine-resolver';

interface EngineSelectionPromptAnswer {
  selectedEngine: string;
}

export class ProjectInitializer {
  static async initialize(options: InitOptions): Promise<InitResult> {
    const createdFiles: string[] = [];

    try {
      const validatedOptions = await this.validateOptions(options);
      const { name, type, directory, enginePath, force } = validatedOptions;

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
          await this.createBlueprintProject(name, directory, enginePath);
          break;
        case 'blank':
          await this.createBlankProject(name, directory, enginePath);
          break;
      }

      const uprojectPath = await this.createUProjectFile(name, directory, enginePath, type);
      createdFiles.push(uprojectPath);

      if (type === 'cpp') {
        const sourceFiles = await this.createSourceFiles(name, directory, enginePath);
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

      await this.createConfigFiles(directory);
      createdFiles.push(path.join(configDir, 'DefaultEngine.ini'));

      Logger.success(`Project ${name} initialized successfully`);

      return {
        success: true,
        projectPath: directory,
        uprojectPath,
        engineAssociation: await this.getEngineAssociationId(enginePath),
        createdFiles,
      };
    } catch (error) {
      return {
        success: false,
        projectPath: options.directory || '',
        uprojectPath: '',
        engineAssociation: '',
        createdFiles,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

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

    const type: ProjectType = options.type || 'cpp';
    if (!Validator.isValidProjectType(type)) {
      throw new Error(`Invalid project type: ${type}`);
    }

    const directory = options.directory || path.join(process.cwd(), name);
    const template = options.template || 'Basic';

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

  private static async createBlueprintProject(
    _name: string,
    directory: string,
    _enginePath: string
  ): Promise<void> {
    const contentDir = path.join(directory, 'Content');
    await fs.ensureDir(contentDir);
  }

  private static async createBlankProject(
    _name: string,
    directory: string,
    _enginePath: string
  ): Promise<void> {
    const contentDir = path.join(directory, 'Content');
    await fs.ensureDir(contentDir);
  }

  private static async createUProjectFile(
    name: string,
    directory: string,
    enginePath: string,
    type: ProjectType
  ): Promise<string> {
    const uprojectPath = path.join(directory, `${name}.uproject`);

    const engineAssociation = await this.getEngineAssociationId(enginePath);

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
      Logger.debug(
        `getEngineVersionInfo failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return undefined;
    }
  }

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

    try {
      const versionFile = path.join(enginePath, 'Engine', 'Build', 'Build.version');
      if (await fs.pathExists(versionFile)) {
        const content = await fs.readFile(versionFile, 'utf-8');
        const versionInfo: EngineVersionInfo = JSON.parse(content);
        return `${versionInfo.MajorVersion}.${versionInfo.MinorVersion}`;
      }
    } catch (error) {
      Logger.debug(
        `getEngineAssociationId failed, using default: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return '5.1';
  }

  private static async createSourceFiles(
    name: string,
    directory: string,
    enginePath: string
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

    const gameModeSource = await this.createGameModeSource(name, privateDir);
    createdFiles.push(gameModeSource);

    return createdFiles;
  }

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

  private static async createGameModeSource(name: string, privateDir: string): Promise<string> {
    const filePath = path.join(privateDir, `${name}GameModeBase.cpp`);

    const content = `#include "${name}GameModeBase.h"

A${name}GameModeBase::A${name}GameModeBase()
{
    static ConstructorHelpers::FClassFinder<APawn> PlayerPawnBPClass(TEXT("/Game/ThirdPerson/Blueprints/BP_ThirdPersonCharacter"));
    if (PlayerPawnBPClass.Class != nullptr)
    {
        DefaultPawnClass = PlayerPawnBPClass.Class;
    }
}`;

    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
  }

  private static async createConfigFiles(directory: string): Promise<void> {
    const configDir = path.join(directory, 'Config');

    const defaultEngineContent = `[/Script/EngineSettings.GeneralProjectSettings]
ProjectID=00000000000000000000000000000000

[/Script/Engine.Engine]
+ActiveGameNameRedirects=(OldGameName="/Script/Engine",NewGameName="/Script/Engine")
+ActiveGameNameRedirects=(OldGameName="/Script/CoreUObject",NewGameName="/Script/CoreUObject")
`;
    await fs.writeFile(path.join(configDir, 'DefaultEngine.ini'), defaultEngineContent, 'utf-8');

    const defaultGameContent = `[/Script/Engine.GameSession]
`;
    await fs.writeFile(path.join(configDir, 'DefaultGame.ini'), defaultGameContent, 'utf-8');

    const defaultEditorContent = `[/Script/UnrealEd.EditorEngine]
+ActiveGameNameRedirects=(OldGameName="/Script/Engine",NewGameName="/Script/Engine")
+ActiveGameNameRedirects=(OldGameName="/Script/CoreUObject",NewGameName="/Script/CoreUObject")
`;
    await fs.writeFile(path.join(configDir, 'DefaultEditor.ini'), defaultEditorContent, 'utf-8');
  }
}
