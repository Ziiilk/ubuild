import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import type { InitOptions } from '../types/init';
import type { EngineInstallation, EngineVersionInfo } from '../types/engine';

// Mock dependencies before importing the modules that use them
const mockExeca = jest.fn<Promise<{ stdout: string }>, [string, string[]?]>();

jest.mock('execa', () => ({
  execa: (...args: [string, string[]?]) => mockExeca(...args),
}));

jest.mock('./engine-resolver');
jest.mock('../utils/validator');
jest.mock('inquirer', () => ({
  prompt: jest.fn(),
}));

import { ProjectInitializer } from './project-initializer';
import { EngineResolver } from './engine-resolver';
import { Validator } from '../utils/validator';
import inquirer from 'inquirer';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((tempDir) => fs.remove(tempDir)));
  tempDirs.length = 0;
  jest.clearAllMocks();
});

async function createTempDir(): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-initializer-'));
  tempDirs.push(tempDir);
  return tempDir;
}

function createMockEngineInstallation(overrides?: Partial<EngineInstallation>): EngineInstallation {
  return {
    path: 'C:/UnrealEngine',
    associationId: '5.3',
    source: 'registry',
    displayName: 'Unreal Engine 5.3',
    version: {
      MajorVersion: 5,
      MinorVersion: 3,
      PatchVersion: 2,
      Changelist: 12345,
      CompatibleChangelist: 12345,
      IsLicenseeVersion: 0,
      IsPromotedBuild: 1,
      BranchName: '++UE5+Release-5.3',
      BuildId: '5.3.2-12345+++UE5+Release-5.3',
    },
    ...overrides,
  };
}

async function createMockEngineStructure(enginePath: string): Promise<void> {
  await fs.ensureDir(path.join(enginePath, 'Engine', 'Binaries'));
  const versionFile = path.join(enginePath, 'Engine', 'Build', 'Build.version');
  await fs.ensureDir(path.dirname(versionFile));
  const versionInfo: EngineVersionInfo = {
    MajorVersion: 5,
    MinorVersion: 3,
    PatchVersion: 2,
    Changelist: 12345,
    CompatibleChangelist: 12345,
    IsLicenseeVersion: 0,
    IsPromotedBuild: 1,
    BranchName: '++UE5+Release-5.3',
    BuildId: '5.3.2-12345+++UE5+Release-5.3',
  };
  await fs.writeFile(versionFile, JSON.stringify(versionInfo), 'utf-8');
}

describe('ProjectInitializer', () => {
  describe('initialize', () => {
    it('successfully initializes a C++ project', async () => {
      const tempDir = await createTempDir();
      const enginePath = path.join(tempDir, 'Engine');
      await createMockEngineStructure(enginePath);

      const mockEngine = createMockEngineInstallation({ path: enginePath });
      jest.mocked(EngineResolver.findEngineInstallations).mockResolvedValue([mockEngine]);
      jest.mocked(Validator.isValidProjectName).mockReturnValue(true);
      jest.mocked(Validator.isValidProjectType).mockReturnValue(true);
      jest.mocked(Validator.isValidEnginePath).mockResolvedValue(true);
      jest.mocked(Validator.isSafeForInit).mockResolvedValue({
        safe: true,
        message: 'Directory is safe',
      });

      const options: InitOptions = {
        name: 'TestProject',
        type: 'cpp',
        directory: path.join(tempDir, 'project'),
        enginePath,
      };

      const result = await ProjectInitializer.initialize(options);

      expect(result.success).toBe(true);
      expect(result.projectPath).toBe(options.directory);
      expect(result.uprojectPath).toBe(path.join(options.directory!, 'TestProject.uproject'));
      expect(result.createdFiles.length).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();

      // Verify key files were created
      expect(await fs.pathExists(result.uprojectPath)).toBe(true);
      expect(await fs.pathExists(path.join(options.directory!, 'Source'))).toBe(true);
      expect(await fs.pathExists(path.join(options.directory!, 'Config'))).toBe(true);

      // Verify .uproject content
      const uprojectContent = await fs.readJson(result.uprojectPath);
      expect(uprojectContent.FileVersion).toBe(3);
      expect(uprojectContent.Modules).toHaveLength(1);
      expect(uprojectContent.Modules[0].Name).toBe('TestProject');
    });

    it('successfully initializes a blueprint project', async () => {
      const tempDir = await createTempDir();
      const enginePath = path.join(tempDir, 'Engine');
      await createMockEngineStructure(enginePath);

      const mockEngine = createMockEngineInstallation({ path: enginePath });
      jest.mocked(EngineResolver.findEngineInstallations).mockResolvedValue([mockEngine]);
      jest.mocked(Validator.isValidProjectName).mockReturnValue(true);
      jest.mocked(Validator.isValidProjectType).mockReturnValue(true);
      jest.mocked(Validator.isValidEnginePath).mockResolvedValue(true);
      jest.mocked(Validator.isSafeForInit).mockResolvedValue({
        safe: true,
        message: 'Directory is safe',
      });

      const options: InitOptions = {
        name: 'BlueprintProject',
        type: 'blueprint',
        directory: path.join(tempDir, 'project'),
        enginePath,
      };

      const result = await ProjectInitializer.initialize(options);

      expect(result.success).toBe(true);
      expect(result.createdFiles.length).toBeGreaterThan(0);

      // Verify Content directory was created for blueprint projects
      expect(await fs.pathExists(path.join(options.directory!, 'Content'))).toBe(true);

      // Verify .uproject has no modules for blueprint projects
      const uprojectContent = await fs.readJson(result.uprojectPath);
      expect(uprojectContent.Modules).toHaveLength(0);

      // Verify no Source directory for blueprint projects
      expect(await fs.pathExists(path.join(options.directory!, 'Source'))).toBe(false);
    });

    it('successfully initializes a blank project', async () => {
      const tempDir = await createTempDir();
      const enginePath = path.join(tempDir, 'Engine');
      await createMockEngineStructure(enginePath);

      const mockEngine = createMockEngineInstallation({ path: enginePath });
      jest.mocked(EngineResolver.findEngineInstallations).mockResolvedValue([mockEngine]);
      jest.mocked(Validator.isValidProjectName).mockReturnValue(true);
      jest.mocked(Validator.isValidProjectType).mockReturnValue(true);
      jest.mocked(Validator.isValidEnginePath).mockResolvedValue(true);
      jest.mocked(Validator.isSafeForInit).mockResolvedValue({
        safe: true,
        message: 'Directory is safe',
      });

      const options: InitOptions = {
        name: 'BlankProject',
        type: 'blank',
        directory: path.join(tempDir, 'project'),
        enginePath,
      };

      const result = await ProjectInitializer.initialize(options);

      expect(result.success).toBe(true);
      expect(result.createdFiles.length).toBeGreaterThan(0);
      expect(await fs.pathExists(path.join(options.directory!, 'Content'))).toBe(true);
      expect(await fs.pathExists(path.join(options.directory!, 'Source'))).toBe(false);
    });

    it('fails when project name is missing', async () => {
      const options: InitOptions = {
        name: '',
        type: 'cpp',
        enginePath: 'C:/Engine',
      };

      const result = await ProjectInitializer.initialize(options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Project name is required');
    });

    it('fails when project name is invalid', async () => {
      jest.mocked(Validator.isValidProjectName).mockReturnValue(false);

      const options: InitOptions = {
        name: 'Invalid Project Name!',
        type: 'cpp',
        enginePath: 'C:/Engine',
      };

      const result = await ProjectInitializer.initialize(options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Project name can only contain');
    });

    it('fails when project type is invalid', async () => {
      jest.mocked(Validator.isValidProjectName).mockReturnValue(true);
      jest.mocked(Validator.isValidProjectType).mockReturnValue(false);

      const options: InitOptions = {
        name: 'TestProject',
        type: 'invalid' as 'cpp',
        enginePath: 'C:/Engine',
      };

      const result = await ProjectInitializer.initialize(options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid project type');
    });

    it('fails when no engine installations are found', async () => {
      jest.mocked(Validator.isValidProjectName).mockReturnValue(true);
      jest.mocked(Validator.isValidProjectType).mockReturnValue(true);
      jest.mocked(EngineResolver.findEngineInstallations).mockResolvedValue([]);

      const options: InitOptions = {
        name: 'TestProject',
        type: 'cpp',
      };

      const result = await ProjectInitializer.initialize(options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No Unreal Engine installations found');
    });

    it('prompts for engine selection when multiple engines are available', async () => {
      const tempDir = await createTempDir();
      const enginePath1 = path.join(tempDir, 'Engine1');
      const enginePath2 = path.join(tempDir, 'Engine2');
      await createMockEngineStructure(enginePath1);
      await createMockEngineStructure(enginePath2);

      const mockEngine1 = createMockEngineInstallation({
        path: enginePath1,
        displayName: 'Unreal Engine 5.2',
        associationId: '5.2',
      });
      const mockEngine2 = createMockEngineInstallation({
        path: enginePath2,
        displayName: 'Unreal Engine 5.3',
        associationId: '5.3',
      });

      jest
        .mocked(EngineResolver.findEngineInstallations)
        .mockResolvedValue([mockEngine1, mockEngine2]);
      jest.mocked(Validator.isValidProjectName).mockReturnValue(true);
      jest.mocked(Validator.isValidProjectType).mockReturnValue(true);
      jest.mocked(Validator.isValidEnginePath).mockResolvedValue(true);
      jest.mocked(Validator.isSafeForInit).mockResolvedValue({
        safe: true,
        message: 'Directory is safe',
      });

      // Mock inquirer to select the second engine
      jest.mocked(inquirer.prompt).mockResolvedValue({ selectedEngine: enginePath2 });

      const options: InitOptions = {
        name: 'TestProject',
        type: 'blueprint',
        directory: path.join(tempDir, 'project'),
      };

      const result = await ProjectInitializer.initialize(options);

      expect(result.success).toBe(true);
      expect(inquirer.prompt).toHaveBeenCalledTimes(1);
      expect(result.engineAssociation).toBe('5.3');
    });

    it('fails when engine path is invalid', async () => {
      jest.mocked(Validator.isValidProjectName).mockReturnValue(true);
      jest.mocked(Validator.isValidProjectType).mockReturnValue(true);
      jest.mocked(Validator.isValidEnginePath).mockResolvedValue(false);

      const options: InitOptions = {
        name: 'TestProject',
        type: 'cpp',
        enginePath: 'C:/Invalid/Engine/Path',
      };

      const result = await ProjectInitializer.initialize(options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid engine path');
    });

    it('fails when directory is not safe for initialization', async () => {
      const tempDir = await createTempDir();
      const enginePath = path.join(tempDir, 'Engine');
      await createMockEngineStructure(enginePath);

      const mockEngine = createMockEngineInstallation({ path: enginePath });
      jest.mocked(EngineResolver.findEngineInstallations).mockResolvedValue([mockEngine]);
      jest.mocked(Validator.isValidProjectName).mockReturnValue(true);
      jest.mocked(Validator.isValidProjectType).mockReturnValue(true);
      jest.mocked(Validator.isValidEnginePath).mockResolvedValue(true);
      jest.mocked(Validator.isSafeForInit).mockResolvedValue({
        safe: false,
        message: 'Directory already contains Unreal Engine project: Existing.uproject',
      });

      const options: InitOptions = {
        name: 'TestProject',
        type: 'cpp',
        directory: path.join(tempDir, 'project'),
        enginePath,
      };

      const result = await ProjectInitializer.initialize(options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Directory not safe for initialization');
    });

    it('allows initialization with force flag when directory is not empty', async () => {
      const tempDir = await createTempDir();
      const enginePath = path.join(tempDir, 'Engine');
      await createMockEngineStructure(enginePath);

      const mockEngine = createMockEngineInstallation({ path: enginePath });
      jest.mocked(EngineResolver.findEngineInstallations).mockResolvedValue([mockEngine]);
      jest.mocked(Validator.isValidProjectName).mockReturnValue(true);
      jest.mocked(Validator.isValidProjectType).mockReturnValue(true);
      jest.mocked(Validator.isValidEnginePath).mockResolvedValue(true);
      jest.mocked(Validator.isSafeForInit).mockResolvedValue({
        safe: true,
        message: 'Force flag is set - proceeding anyway',
      });

      const options: InitOptions = {
        name: 'TestProject',
        type: 'blueprint',
        directory: path.join(tempDir, 'project'),
        enginePath,
        force: true,
      };

      const result = await ProjectInitializer.initialize(options);

      expect(result.success).toBe(true);
    });

    it('defaults to cpp project type when type is not specified', async () => {
      const tempDir = await createTempDir();
      const enginePath = path.join(tempDir, 'Engine');
      await createMockEngineStructure(enginePath);

      const mockEngine = createMockEngineInstallation({ path: enginePath });
      jest.mocked(EngineResolver.findEngineInstallations).mockResolvedValue([mockEngine]);
      jest.mocked(Validator.isValidProjectName).mockReturnValue(true);
      jest.mocked(Validator.isValidProjectType).mockReturnValue(true);
      jest.mocked(Validator.isValidEnginePath).mockResolvedValue(true);
      jest.mocked(Validator.isSafeForInit).mockResolvedValue({
        safe: true,
        message: 'Directory is safe',
      });

      const options: InitOptions = {
        name: 'TestProject',
        directory: path.join(tempDir, 'project'),
        enginePath,
        // type is not specified, should default to 'cpp'
      };

      const result = await ProjectInitializer.initialize(options);

      expect(result.success).toBe(true);
      // Verify C++ specific files were created
      expect(await fs.pathExists(path.join(options.directory!, 'Source'))).toBe(true);
    });

    it('defaults to project name as directory when directory is not specified', async () => {
      const tempDir = await createTempDir();
      const enginePath = path.join(tempDir, 'Engine');
      await createMockEngineStructure(enginePath);

      const mockEngine = createMockEngineInstallation({ path: enginePath });
      jest.mocked(EngineResolver.findEngineInstallations).mockResolvedValue([mockEngine]);
      jest.mocked(Validator.isValidProjectName).mockReturnValue(true);
      jest.mocked(Validator.isValidProjectType).mockReturnValue(true);
      jest.mocked(Validator.isValidEnginePath).mockResolvedValue(true);
      jest.mocked(Validator.isSafeForInit).mockResolvedValue({
        safe: true,
        message: 'Directory is safe',
      });

      const originalCwd = process.cwd();
      process.chdir(tempDir);

      try {
        const options: InitOptions = {
          name: 'MyProject',
          type: 'blueprint',
          enginePath,
          // directory is not specified
        };

        const result = await ProjectInitializer.initialize(options);

        expect(result.success).toBe(true);
        expect(result.projectPath).toBe(path.join(tempDir, 'MyProject'));
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('creates correct C++ source files structure', async () => {
      const tempDir = await createTempDir();
      const enginePath = path.join(tempDir, 'Engine');
      await createMockEngineStructure(enginePath);

      const mockEngine = createMockEngineInstallation({ path: enginePath });
      jest.mocked(EngineResolver.findEngineInstallations).mockResolvedValue([mockEngine]);
      jest.mocked(Validator.isValidProjectName).mockReturnValue(true);
      jest.mocked(Validator.isValidProjectType).mockReturnValue(true);
      jest.mocked(Validator.isValidEnginePath).mockResolvedValue(true);
      jest.mocked(Validator.isSafeForInit).mockResolvedValue({
        safe: true,
        message: 'Directory is safe',
      });

      const projectName = 'MyGame';
      const options: InitOptions = {
        name: projectName,
        type: 'cpp',
        directory: path.join(tempDir, 'project'),
        enginePath,
      };

      const result = await ProjectInitializer.initialize(options);

      expect(result.success).toBe(true);

      // Verify target files
      const sourceDir = path.join(options.directory!, 'Source');
      expect(await fs.pathExists(path.join(sourceDir, `${projectName}.Target.cs`))).toBe(true);
      expect(await fs.pathExists(path.join(sourceDir, `${projectName}Editor.Target.cs`))).toBe(
        true
      );

      // Verify module files
      const moduleDir = path.join(sourceDir, projectName);
      expect(await fs.pathExists(path.join(moduleDir, `${projectName}.Build.cs`))).toBe(true);
      expect(await fs.pathExists(path.join(moduleDir, 'Public', `${projectName}.h`))).toBe(true);
      expect(await fs.pathExists(path.join(moduleDir, 'Private', `${projectName}.cpp`))).toBe(true);
      expect(
        await fs.pathExists(path.join(moduleDir, 'Public', `${projectName}GameModeBase.h`))
      ).toBe(true);
      expect(
        await fs.pathExists(path.join(moduleDir, 'Private', `${projectName}GameModeBase.cpp`))
      ).toBe(true);
    });

    it('creates config files for all project types', async () => {
      const tempDir = await createTempDir();
      const enginePath = path.join(tempDir, 'Engine');
      await createMockEngineStructure(enginePath);

      const mockEngine = createMockEngineInstallation({ path: enginePath });
      jest.mocked(EngineResolver.findEngineInstallations).mockResolvedValue([mockEngine]);
      jest.mocked(Validator.isValidProjectName).mockReturnValue(true);
      jest.mocked(Validator.isValidProjectType).mockReturnValue(true);
      jest.mocked(Validator.isValidEnginePath).mockResolvedValue(true);
      jest.mocked(Validator.isSafeForInit).mockResolvedValue({
        safe: true,
        message: 'Directory is safe',
      });

      const options: InitOptions = {
        name: 'TestProject',
        type: 'blank',
        directory: path.join(tempDir, 'project'),
        enginePath,
      };

      const result = await ProjectInitializer.initialize(options);

      expect(result.success).toBe(true);

      const configDir = path.join(options.directory!, 'Config');
      expect(await fs.pathExists(path.join(configDir, 'DefaultEngine.ini'))).toBe(true);
      expect(await fs.pathExists(path.join(configDir, 'DefaultGame.ini'))).toBe(true);
      expect(await fs.pathExists(path.join(configDir, 'DefaultEditor.ini'))).toBe(true);
    });

    it('generates correct engine association from engine version', async () => {
      const tempDir = await createTempDir();
      const enginePath = path.join(tempDir, 'Engine');
      await createMockEngineStructure(enginePath);

      const mockEngine = createMockEngineInstallation({
        path: enginePath,
        source: 'registry',
        associationId: '',
      });
      jest.mocked(EngineResolver.findEngineInstallations).mockResolvedValue([mockEngine]);
      jest.mocked(Validator.isValidProjectName).mockReturnValue(true);
      jest.mocked(Validator.isValidProjectType).mockReturnValue(true);
      jest.mocked(Validator.isValidEnginePath).mockResolvedValue(true);
      jest.mocked(Validator.isSafeForInit).mockResolvedValue({
        safe: true,
        message: 'Directory is safe',
      });

      const options: InitOptions = {
        name: 'TestProject',
        type: 'blueprint',
        directory: path.join(tempDir, 'project'),
        enginePath,
      };

      const result = await ProjectInitializer.initialize(options);

      expect(result.success).toBe(true);
      expect(result.engineAssociation).toBe('5.3');

      const uprojectContent = await fs.readJson(result.uprojectPath);
      expect(uprojectContent.EngineAssociation).toBe('5.3');
    });
  });
});
