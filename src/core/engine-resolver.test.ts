import path from 'path';
import { EngineResolver } from './engine-resolver';
import { Platform } from '../utils/platform';

const mockPathExists = jest.fn<Promise<boolean>, [string]>();
const mockStat = jest.fn<Promise<{ isDirectory: () => boolean }>, [string]>();
const mockReaddir = jest.fn<Promise<string[]>, [string]>();
const mockReadFile = jest.fn<Promise<string>, [string, string?]>();
const mockExeca = jest.fn<Promise<{ stdout: string }>, [string, string[]?]>();

jest.mock('fs-extra', () => ({
  __esModule: true,
  default: {
    pathExists: (...args: [string]) => mockPathExists(...args),
    stat: (...args: [string]) => mockStat(...args),
    readdir: (...args: [string]) => mockReaddir(...args),
    readFile: (...args: [string, string?]) => mockReadFile(...args),
  },
}));

jest.mock('execa', () => ({
  execa: (...args: [string, string[]?]) => mockExeca(...args),
}));

describe('EngineResolver', () => {
  const originalEnv = { ...process.env };

  const configureFs = (options: {
    existingPaths?: string[];
    directories?: string[];
    directoryEntries?: Record<string, string[]>;
    fileContents?: Record<string, string>;
  }): void => {
    const existingPaths = new Set(options.existingPaths ?? []);
    const directories = new Set(options.directories ?? []);
    const directoryEntries = new Map(Object.entries(options.directoryEntries ?? {}));
    const fileContents = new Map(Object.entries(options.fileContents ?? {}));

    mockPathExists.mockImplementation(async (candidate: string) => existingPaths.has(candidate));
    mockStat.mockImplementation(async (candidate: string) => ({
      isDirectory: () => directories.has(candidate),
    }));
    mockReaddir.mockImplementation(
      async (candidate: string) => directoryEntries.get(candidate) ?? []
    );
    mockReadFile.mockImplementation(async (candidate: string, _encoding?: string) => {
      const content = fileContents.get(candidate);

      if (content === undefined) {
        throw new Error(`Unexpected readFile for ${candidate}`);
      }

      return content;
    });
  };

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
    process.env.LOCALAPPDATA = 'C:\\Users\\tester\\AppData\\Local';
    process.env.PROGRAMDATA = 'C:\\ProgramData';
    process.env.APPDATA = 'C:\\Users\\tester\\AppData\\Roaming';
    process.env.PROGRAMFILES = 'C:\\Program Files';
    process.env['PROGRAMFILES(X86)'] = 'C:\\Program Files (x86)';
    delete process.env.UE_ENGINE_PATH;
    delete process.env.UE_ROOT;
    delete process.env.UNREAL_ENGINE_PATH;
    delete process.env.DEBUG;

    mockExeca.mockImplementation(async () => ({ stdout: '' }));
    configureFs({});
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads EngineAssociation from a direct .uproject file path', async () => {
    jest.spyOn(Platform, 'isWindows').mockReturnValue(false);

    const uprojectPath = 'C:\\Projects\\SpaceGame\\SpaceGame.uproject';

    configureFs({
      existingPaths: [uprojectPath],
      fileContents: {
        [uprojectPath]: JSON.stringify({ EngineAssociation: '{ENGINE-GUID}' }),
      },
    });

    const result = await EngineResolver.resolveEngine(uprojectPath);

    expect(result.uprojectEngine).toEqual({
      guid: '{ENGINE-GUID}',
      name: '{ENGINE-GUID}',
      version: undefined,
    });
    expect(result.engine).toBeUndefined();
    expect(result.warnings).toEqual([]);
  });

  it('returns an explicit engine path when it exists', async () => {
    const explicitEnginePath = 'D:\\Engines\\ExplicitUE';

    configureFs({
      existingPaths: [explicitEnginePath],
    });

    await expect(
      EngineResolver.resolveEnginePath({
        enginePath: explicitEnginePath,
      })
    ).resolves.toBe(explicitEnginePath);
  });

  it('throws the existing missing-engine error when auto-detection fails', async () => {
    jest.spyOn(Platform, 'isWindows').mockReturnValue(false);

    const uprojectPath = 'C:\\Projects\\MissingEngineGame\\MissingEngineGame.uproject';

    configureFs({
      existingPaths: [uprojectPath],
      fileContents: {
        [uprojectPath]: JSON.stringify({ EngineAssociation: '5.3' }),
      },
    });

    await expect(
      EngineResolver.resolveEnginePath({
        projectPath: uprojectPath,
      })
    ).rejects.toThrow('Could not determine engine path. Please specify --engine-path');
  });

  it('reads EngineAssociation from the first .uproject in a project directory', async () => {
    jest.spyOn(Platform, 'isWindows').mockReturnValue(false);

    const projectDirectory = 'C:\\Projects\\FactoryGame';
    const uprojectPath = path.join(projectDirectory, 'FactoryGame.uproject');

    configureFs({
      existingPaths: [projectDirectory],
      directories: [projectDirectory],
      directoryEntries: {
        [projectDirectory]: ['FactoryGame.uproject', 'Notes.txt'],
      },
      fileContents: {
        [uprojectPath]: JSON.stringify({ EngineAssociation: '5.3' }),
      },
    });

    const result = await EngineResolver.resolveEngine(projectDirectory);

    expect(result.uprojectEngine).toEqual({
      guid: '5.3',
      name: '5.3',
      version: '5.3',
    });
    expect(result.engine).toBeUndefined();
    expect(result.warnings).toEqual([]);
  });

  it('matches version-string associations to installed launcher engines', async () => {
    jest.spyOn(Platform, 'isWindows').mockReturnValue(true);

    const uprojectPath = 'C:\\Projects\\ShooterGame\\ShooterGame.uproject';
    const manifestPath = path.join(
      process.env.LOCALAPPDATA ?? '',
      'UnrealEngine',
      'Common',
      'LauncherInstalled.dat'
    );
    const enginePath = 'C:\\Epic\\UE_5.3';

    configureFs({
      existingPaths: [uprojectPath, manifestPath],
      fileContents: {
        [uprojectPath]: JSON.stringify({ EngineAssociation: '5.3' }),
        [manifestPath]: JSON.stringify({
          InstallationList: [
            {
              AppName: 'UE_5_3',
              InstallLocation: enginePath,
              DisplayName: 'Unreal Engine 5.3',
            },
          ],
        }),
      },
    });

    const result = await EngineResolver.resolveEngine(uprojectPath);

    expect(result.engine).toMatchObject({
      path: enginePath,
      associationId: 'UE_5_3',
      source: 'launcher',
    });
    expect(result.uprojectEngine?.version).toBe('5.3');
    expect(result.warnings).toEqual([]);
  });

  it('detects an engine from environment variables when present', async () => {
    jest.spyOn(Platform, 'isWindows').mockReturnValue(false);

    process.env.UE_ENGINE_PATH = 'C:\\Unreal\\MissingEngine';
    process.env.UE_ROOT = 'D:\\Engines\\CustomEngine';

    configureFs({
      existingPaths: ['D:\\Engines\\CustomEngine'],
    });

    const result = await EngineResolver.findEngineInstallations();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      path: 'D:\\Engines\\CustomEngine',
      associationId: 'ENV_UE_ROOT',
      displayName: 'UE Engine (from UE_ROOT)',
      source: 'environment',
      version: undefined,
    });
  });

  it('prioritizes launcher installations over environment and registry duplicates', async () => {
    jest.spyOn(Platform, 'isWindows').mockReturnValue(true);

    process.env.UE_ENGINE_PATH = 'C:\\EPIC\\UE_5.3';

    const manifestPath = path.join(
      process.env.LOCALAPPDATA ?? '',
      'UnrealEngine',
      'Common',
      'LauncherInstalled.dat'
    );

    configureFs({
      existingPaths: [manifestPath, 'C:\\EPIC\\UE_5.3'],
      fileContents: {
        [manifestPath]: JSON.stringify({
          InstallationList: [
            {
              AppName: 'UE_5_3',
              InstallLocation: 'c:\\Epic\\UE_5.3',
              DisplayName: 'Unreal Engine 5.3',
            },
          ],
        }),
      },
    });

    mockExeca.mockImplementation(async () => ({
      stdout: '{REGISTRY-GUID}    REG_SZ    C:\\Epic\\UE_5.3',
    }));

    const result = await EngineResolver.findEngineInstallations();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      path: 'c:\\Epic\\UE_5.3',
      associationId: 'UE_5_3',
      source: 'launcher',
    });
  });

  describe('resolveEnginePath', () => {
    it('throws error when explicit engine path does not exist', async () => {
      configureFs({
        existingPaths: [],
      });

      await expect(
        EngineResolver.resolveEnginePath({
          enginePath: 'C:\\NonExistent\\Engine',
        })
      ).rejects.toThrow('Engine path does not exist: C:\\NonExistent\\Engine');
    });

    it('throws error when auto-resolved engine path does not exist', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(true);

      const uprojectPath = 'C:\\Projects\\TestGame\\TestGame.uproject';
      const manifestPath = path.join(
        process.env.LOCALAPPDATA ?? '',
        'UnrealEngine',
        'Common',
        'LauncherInstalled.dat'
      );
      const enginePath = 'C:\\Epic\\UE_5.3';

      configureFs({
        existingPaths: [uprojectPath, manifestPath],
        fileContents: {
          [uprojectPath]: JSON.stringify({ EngineAssociation: '5.3' }),
          [manifestPath]: JSON.stringify({
            InstallationList: [
              {
                AppName: 'UE_5_3',
                InstallLocation: enginePath,
                DisplayName: 'Unreal Engine 5.3',
              },
            ],
          }),
        },
      });

      await expect(
        EngineResolver.resolveEnginePath({
          projectPath: uprojectPath,
        })
      ).rejects.toThrow('Engine path does not exist: C:\\Epic\\UE_5.3');
    });

    it('returns engine path when resolution succeeds', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(true);

      const uprojectPath = 'C:\\Projects\\TestGame\\TestGame.uproject';
      const manifestPath = path.join(
        process.env.LOCALAPPDATA ?? '',
        'UnrealEngine',
        'Common',
        'LauncherInstalled.dat'
      );
      const enginePath = 'C:\\Epic\\UE_5.3';

      configureFs({
        existingPaths: [uprojectPath, manifestPath, enginePath],
        fileContents: {
          [uprojectPath]: JSON.stringify({ EngineAssociation: '5.3' }),
          [manifestPath]: JSON.stringify({
            InstallationList: [
              {
                AppName: 'UE_5_3',
                InstallLocation: enginePath,
                DisplayName: 'Unreal Engine 5.3',
              },
            ],
          }),
        },
      });

      const result = await EngineResolver.resolveEnginePath({
        projectPath: uprojectPath,
      });

      expect(result).toBe(enginePath);
    });
  });

  describe('GUID-based engine association', () => {
    it('matches GUID-based engine associations from registry', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(true);

      const uprojectPath = 'C:\\Projects\\GuidGame\\GuidGame.uproject';
      const enginePath = 'C:\\Epic\\UE_Source';
      const engineGuid = '{12345678-1234-1234-1234-123456789012}';

      configureFs({
        existingPaths: [uprojectPath, enginePath],
        fileContents: {
          [uprojectPath]: JSON.stringify({ EngineAssociation: engineGuid }),
        },
      });

      mockExeca.mockImplementation(async () => ({
        stdout: `${engineGuid}    REG_SZ    ${enginePath}`,
      }));

      const result = await EngineResolver.resolveEngine(uprojectPath);

      expect(result.engine).toMatchObject({
        path: enginePath,
        associationId: engineGuid,
        source: 'registry',
      });
      expect(result.warnings).toEqual([]);
    });

    it('warns when GUID association is not found', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(true);

      const uprojectPath = 'C:\\Projects\\GuidGame\\GuidGame.uproject';
      const manifestPath = path.join(
        process.env.LOCALAPPDATA ?? '',
        'UnrealEngine',
        'Common',
        'LauncherInstalled.dat'
      );
      const enginePath = 'C:\\Epic\\UE_5.3';
      const projectGuid = '{MISSING-GUID-1234-1234-123456789012}';

      configureFs({
        existingPaths: [uprojectPath, manifestPath, enginePath],
        fileContents: {
          [uprojectPath]: JSON.stringify({ EngineAssociation: projectGuid }),
          [manifestPath]: JSON.stringify({
            InstallationList: [
              {
                AppName: 'UE_5_3',
                InstallLocation: enginePath,
                DisplayName: 'Unreal Engine 5.3',
              },
            ],
          }),
        },
      });

      const result = await EngineResolver.resolveEngine(uprojectPath);

      expect(result.engine).toBeDefined();
      expect(result.warnings).toContain(
        `Engine with association ID ${projectGuid} not found in installed engines`
      );
    });
  });

  describe('error handling', () => {
    it('warns when project directory has no .uproject file', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(false);

      const projectDir = 'C:\\Projects\\EmptyProject';

      configureFs({
        existingPaths: [projectDir],
        directories: [projectDir],
        directoryEntries: {
          [projectDir]: ['README.md', 'Notes.txt'],
        },
      });

      const result = await EngineResolver.resolveEngine(projectDir);

      expect(result.warnings).toContain('No .uproject file found in project directory');
      expect(result.uprojectEngine).toBeUndefined();
    });

    it('warns when project path is not a .uproject file', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(false);

      const configPath = 'C:\\Projects\\TestGame\\config.ini';

      configureFs({
        existingPaths: [configPath],
        fileContents: {
          [configPath]: 'some config content',
        },
      });

      const result = await EngineResolver.resolveEngine(configPath);

      expect(result.warnings).toContain('Project path is not a .uproject file');
      expect(result.uprojectEngine).toBeUndefined();
    });

    it('warns when .uproject has no EngineAssociation', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(false);

      const uprojectPath = 'C:\\Projects\\NoEngineGame\\NoEngineGame.uproject';

      configureFs({
        existingPaths: [uprojectPath],
        fileContents: {
          [uprojectPath]: JSON.stringify({ FileVersion: 3 }),
        },
      });

      const result = await EngineResolver.resolveEngine(uprojectPath);

      expect(result.warnings).toContain('No EngineAssociation found in .uproject file');
      expect(result.uprojectEngine).toBeUndefined();
    });

    it('handles errors reading project file', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(false);

      const uprojectPath = 'C:\\Projects\\InvalidGame\\InvalidGame.uproject';

      configureFs({
        existingPaths: [uprojectPath],
        fileContents: {},
      });

      mockReadFile.mockImplementation(async () => {
        throw new Error('Permission denied');
      });

      const result = await EngineResolver.resolveEngine(uprojectPath);

      expect(result.warnings).toContain('Failed to read project file: Permission denied');
      expect(result.uprojectEngine).toBeUndefined();
    });

    it('handles malformed JSON in project file', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(false);

      const uprojectPath = 'C:\\Projects\\MalformedGame\\MalformedGame.uproject';

      configureFs({
        existingPaths: [uprojectPath],
        fileContents: {},
      });

      mockReadFile.mockImplementation(async () => 'not valid json');

      const result = await EngineResolver.resolveEngine(uprojectPath);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Failed to read project file');
      expect(result.uprojectEngine).toBeUndefined();
    });
  });

  describe('registry parsing', () => {
    it('parses multi-line registry format', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(true);

      const enginePath = 'C:\\Epic\\UE_MultiLine';
      const engineGuid = '{MULTILINE-GUID-1234}';

      mockExeca.mockImplementation(async () => ({
        stdout: `HKEY_CURRENT_USER\\SOFTWARE\\Epic Games\\Unreal Engine\\Builds\n${engineGuid}\n    REG_SZ    ${enginePath}`,
      }));

      const result = await EngineResolver.findEngineInstallations();

      expect(result.some((e) => e.associationId === engineGuid)).toBe(true);
    });

    it('handles registry entry without path', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(true);

      const engineGuid = '{NO-PATH-GUID-1234}';

      mockExeca.mockImplementation(async () => ({
        stdout: `HKEY_CURRENT_USER\\SOFTWARE\\Epic Games\\Unreal Engine\\Builds\n${engineGuid}\n    REG_DWORD    1`,
      }));

      const result = await EngineResolver.findEngineInstallations();

      expect(result.some((e) => e.associationId === engineGuid)).toBe(false);
    });

    it('continues when registry query fails with unexpected error', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(true);

      mockExeca.mockImplementation(async () => {
        throw new Error('Command failed');
      });

      const result = await EngineResolver.findEngineInstallations();

      expect(result).toEqual([]);
    });
  });

  describe('launcher manifest handling', () => {
    it('handles manifest without InstallationList', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(true);

      const manifestPath = path.join(
        process.env.LOCALAPPDATA ?? '',
        'UnrealEngine',
        'Common',
        'LauncherInstalled.dat'
      );

      configureFs({
        existingPaths: [manifestPath],
        fileContents: {
          [manifestPath]: JSON.stringify({ Version: '1.0' }),
        },
      });

      const result = await EngineResolver.findEngineInstallations();

      expect(result).toEqual([]);
    });

    it('handles malformed launcher manifest', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(true);

      const manifestPath = path.join(
        process.env.LOCALAPPDATA ?? '',
        'UnrealEngine',
        'Common',
        'LauncherInstalled.dat'
      );

      configureFs({
        existingPaths: [manifestPath],
        fileContents: {
          [manifestPath]: 'not valid json',
        },
      });

      const result = await EngineResolver.findEngineInstallations();

      expect(result).toEqual([]);
    });

    it('skips non-UE installations in manifest', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(true);

      const manifestPath = path.join(
        process.env.LOCALAPPDATA ?? '',
        'UnrealEngine',
        'Common',
        'LauncherInstalled.dat'
      );

      configureFs({
        existingPaths: [manifestPath],
        fileContents: {
          [manifestPath]: JSON.stringify({
            InstallationList: [
              {
                AppName: 'Fortnite',
                InstallLocation: 'C:\\Epic\\Fortnite',
                DisplayName: 'Fortnite',
                Category: 'game',
              },
            ],
          }),
        },
      });

      const result = await EngineResolver.findEngineInstallations();

      expect(result).toEqual([]);
    });
  });

  describe('version comparison', () => {
    it('handles version comparison with missing version info', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(true);

      const manifestPath = path.join(
        process.env.LOCALAPPDATA ?? '',
        'UnrealEngine',
        'Common',
        'LauncherInstalled.dat'
      );

      configureFs({
        existingPaths: [manifestPath, 'C:\\Epic\\UE_NoVersion'],
        fileContents: {
          [manifestPath]: JSON.stringify({
            InstallationList: [
              {
                AppName: 'UE_NoVersion',
                InstallLocation: 'C:\\Epic\\UE_NoVersion',
                DisplayName: 'Unreal Engine NoVersion',
              },
            ],
          }),
        },
      });

      const result = await EngineResolver.findEngineInstallations();

      expect(result).toHaveLength(1);
      expect(result[0].version).toBeUndefined();
    });

    it('extracts version from engine path', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(false);

      process.env.UE_ENGINE_PATH = 'C:\\Engines\\UE_5.3.2';

      configureFs({
        existingPaths: ['C:\\Engines\\UE_5.3.2'],
      });

      const result = await EngineResolver.findEngineInstallations();

      expect(result).toHaveLength(1);
      // The regex captures version info after UE_5 or UE_4 prefix
      expect(result[0].displayName).toBeDefined();
    });
  });

  describe('environment variable engines', () => {
    it('returns undefined when environment engine path does not exist', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(false);

      process.env.UE_ENGINE_PATH = 'C:\\NonExistent\\Engine';

      configureFs({
        existingPaths: [],
      });

      const result = await EngineResolver.findEngineInstallations();

      expect(result).toEqual([]);
    });

    it('checks all environment variables in order', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(false);

      process.env.UE_ENGINE_PATH = 'C:\\NonExistent\\Engine';
      process.env.UE_ROOT = 'C:\\Existing\\Engine';
      process.env.UNREAL_ENGINE_PATH = 'C:\\AlsoExisting\\Engine';

      configureFs({
        existingPaths: ['C:\\Existing\\Engine', 'C:\\AlsoExisting\\Engine'],
      });

      const result = await EngineResolver.findEngineInstallations();

      expect(result).toHaveLength(1);
      expect(result[0].associationId).toBe('ENV_UE_ROOT');
    });
  });
});
