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

  describe('registry error handling', () => {
    it('handles "unable to find the specified registry key" error silently', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(true);

      mockExeca.mockImplementation(async () => {
        const error = new Error('unable to find the specified registry key');
        throw error;
      });

      const result = await EngineResolver.findEngineInstallations();

      expect(result).toEqual([]);
    });

    it('handles other registry errors with debug logging', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(true);

      mockExeca.mockImplementation(async () => {
        throw new Error('Permission denied accessing registry');
      });

      const result = await EngineResolver.findEngineInstallations();

      expect(result).toEqual([]);
    });
  });

  describe('launcher manifest Category engine matching', () => {
    it('includes engines with Category === engine', async () => {
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
                AppName: 'SomeGameEngine',
                InstallLocation: 'C:\\Epic\\SomeEngine',
                DisplayName: 'Some Game Engine',
                Category: 'engine',
              },
            ],
          }),
        },
      });

      const result = await EngineResolver.findEngineInstallations();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        path: 'C:\\Epic\\SomeEngine',
        associationId: 'SomeGameEngine',
        source: 'launcher',
      });
    });

    it('skips non-UE installations without engine category', async () => {
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
                AppName: 'RandomApp',
                InstallLocation: 'C:\\Epic\\RandomApp',
                DisplayName: 'Random Application',
                Category: 'application',
              },
            ],
          }),
        },
      });

      const result = await EngineResolver.findEngineInstallations();

      expect(result).toEqual([]);
    });
  });

  describe('version file parsing', () => {
    it('handles malformed version file gracefully', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(false);

      process.env.UE_ENGINE_PATH = 'C:\\Engines\\UE_Test';

      configureFs({
        existingPaths: [
          'C:\\Engines\\UE_Test',
          'C:\\Engines\\UE_Test\\Engine\\Binaries\\Win64\\UnrealEditor.version',
        ],
        fileContents: {
          'C:\\Engines\\UE_Test\\Engine\\Binaries\\Win64\\UnrealEditor.version': 'not valid json',
        },
      });

      const result = await EngineResolver.findEngineInstallations();

      expect(result).toHaveLength(1);
      expect(result[0].version).toBeUndefined();
    });

    it('reads version from Build.version file', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(false);

      process.env.UE_ENGINE_PATH = 'C:\\Engines\\UE_Test';

      configureFs({
        existingPaths: [
          'C:\\Engines\\UE_Test',
          'C:\\Engines\\UE_Test\\Engine\\Build\\Build.version',
        ],
        fileContents: {
          'C:\\Engines\\UE_Test\\Engine\\Build\\Build.version': JSON.stringify({
            MajorVersion: 5,
            MinorVersion: 4,
            PatchVersion: 1,
            Changelist: 12345,
            CompatibleChangelist: 12345,
            IsLicenseeVersion: 0,
            IsPromotedBuild: 1,
            BranchName: '++UE5+Release-5.4',
            BuildId: 'abc123',
          }),
        },
      });

      const result = await EngineResolver.findEngineInstallations();

      expect(result).toHaveLength(1);
      expect(result[0].version).toEqual({
        MajorVersion: 5,
        MinorVersion: 4,
        PatchVersion: 1,
        Changelist: 12345,
        CompatibleChangelist: 12345,
        IsLicenseeVersion: 0,
        IsPromotedBuild: 1,
        BranchName: '++UE5+Release-5.4',
        BuildId: 'abc123',
      });
      expect(result[0].displayName).toBe('UE 5.4.1');
    });
  });

  describe('duplicate engine removal', () => {
    it('keeps existing engine when new engine has lower priority', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(true);

      process.env.UE_ENGINE_PATH = 'C:\\Epic\\UE_5.3';

      const manifestPath = path.join(
        process.env.LOCALAPPDATA ?? '',
        'UnrealEngine',
        'Common',
        'LauncherInstalled.dat'
      );

      configureFs({
        existingPaths: [manifestPath, 'C:\\Epic\\UE_5.3'],
        fileContents: {
          [manifestPath]: JSON.stringify({
            InstallationList: [
              {
                AppName: 'UE_5_3',
                InstallLocation: 'C:\\Epic\\UE_5.3',
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
      expect(result[0].source).toBe('launcher');
    });

    it('replaces environment engine with launcher engine at same path', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(true);

      process.env.UE_ENGINE_PATH = 'c:\\epic\\ue_5.3';

      const manifestPath = path.join(
        process.env.LOCALAPPDATA ?? '',
        'UnrealEngine',
        'Common',
        'LauncherInstalled.dat'
      );

      configureFs({
        existingPaths: [manifestPath, 'C:\\Epic\\UE_5.3'],
        fileContents: {
          [manifestPath]: JSON.stringify({
            InstallationList: [
              {
                AppName: 'UE_5_3',
                InstallLocation: 'C:\\Epic\\UE_5.3',
                DisplayName: 'Unreal Engine 5.3',
              },
            ],
          }),
        },
      });

      const result = await EngineResolver.findEngineInstallations();

      expect(result).toHaveLength(1);
      expect(result[0].source).toBe('launcher');
    });
  });

  describe('version comparison edge cases', () => {
    it('handles compareVersions with both undefined', async () => {
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
                AppName: 'UE_A',
                InstallLocation: 'C:\\Epic\\UE_A',
                DisplayName: 'UE A',
              },
              {
                AppName: 'UE_B',
                InstallLocation: 'C:\\Epic\\UE_B',
                DisplayName: 'UE B',
              },
            ],
          }),
        },
      });

      const result = await EngineResolver.findEngineInstallations();

      expect(result).toHaveLength(2);
    });

    it('handles version string comparison with underscore separators', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(true);

      const uprojectPath = 'C:\\Projects\\TestGame\\TestGame.uproject';
      const manifestPath = path.join(
        process.env.LOCALAPPDATA ?? '',
        'UnrealEngine',
        'Common',
        'LauncherInstalled.dat'
      );

      configureFs({
        existingPaths: [uprojectPath, manifestPath],
        fileContents: {
          [uprojectPath]: JSON.stringify({ EngineAssociation: '5_3' }),
          [manifestPath]: JSON.stringify({
            InstallationList: [
              {
                AppName: 'UE_5_3',
                InstallLocation: 'C:\\Epic\\UE_5.3',
                DisplayName: 'Unreal Engine 5.3',
              },
            ],
          }),
        },
      });

      const result = await EngineResolver.resolveEngine(uprojectPath);

      expect(result.engine).toBeDefined();
      expect(result.engine?.associationId).toBe('UE_5_3');
    });

    it('handles version string comparison with different lengths', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(true);

      const uprojectPath = 'C:\\Projects\\TestGame\\TestGame.uproject';
      const manifestPath = path.join(
        process.env.LOCALAPPDATA ?? '',
        'UnrealEngine',
        'Common',
        'LauncherInstalled.dat'
      );

      configureFs({
        existingPaths: [uprojectPath, manifestPath],
        fileContents: {
          [uprojectPath]: JSON.stringify({ EngineAssociation: '5.3.2' }),
          [manifestPath]: JSON.stringify({
            InstallationList: [
              {
                AppName: 'UE_5_3',
                InstallLocation: 'C:\\Epic\\UE_5.3',
                DisplayName: 'Unreal Engine 5.3',
              },
            ],
          }),
        },
      });

      const result = await EngineResolver.resolveEngine(uprojectPath);

      expect(result.engine).toBeDefined();
    });
  });

  describe('resolveEngine edge cases', () => {
    it('handles exceptions from getEngineAssociationFromProject gracefully', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(false);

      const uprojectPath = 'C:\\Projects\\TestGame\\TestGame.uproject';

      // Create a malformed setup that will cause readFile to throw
      configureFs({
        existingPaths: [uprojectPath],
        fileContents: {},
      });

      mockReadFile.mockImplementation(async () => {
        throw new Error('Permission denied reading project file');
      });

      const result = await EngineResolver.resolveEngine(uprojectPath);

      // The function catches errors and returns them as warnings, not as error field
      expect(result.warnings).toContain(
        'Failed to read project file: Permission denied reading project file'
      );
      expect(result.uprojectEngine).toBeUndefined();
    });

    it('uses default engine when no project engine association', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(true);

      const uprojectPath = 'C:\\Projects\\TestGame\\TestGame.uproject';
      const manifestPath = path.join(
        process.env.LOCALAPPDATA ?? '',
        'UnrealEngine',
        'Common',
        'LauncherInstalled.dat'
      );
      const enginePath = 'C:\\Epic\\UE_5.3';
      const versionFilePath = path.join(enginePath, 'Engine', 'Build', 'Build.version');

      configureFs({
        existingPaths: [uprojectPath, manifestPath, enginePath, versionFilePath],
        fileContents: {
          [uprojectPath]: JSON.stringify({ FileVersion: 3 }),
          [manifestPath]: JSON.stringify({
            InstallationList: [
              {
                AppName: 'UE_5_3',
                InstallLocation: enginePath,
                DisplayName: 'Unreal Engine 5.3',
              },
            ],
          }),
          [versionFilePath]: JSON.stringify({
            MajorVersion: 5,
            MinorVersion: 3,
            PatchVersion: 2,
            Changelist: 12345,
            CompatibleChangelist: 12345,
            IsLicenseeVersion: 0,
            IsPromotedBuild: 1,
            BranchName: '++UE5+Release-5.3',
            BuildId: 'abc123',
          }),
        },
      });

      const result = await EngineResolver.resolveEngine(uprojectPath);

      expect(result.engine).toBeDefined();
      expect(result.warnings).toContain('No EngineAssociation found in .uproject file');
      expect(result.warnings).toContain('Using engine UE 5.3.2 (not associated with project)');
    });

    it('returns no engine when no installations found', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(false);

      const uprojectPath = 'C:\\Projects\\TestGame\\TestGame.uproject';

      configureFs({
        existingPaths: [uprojectPath],
        fileContents: {
          [uprojectPath]: JSON.stringify({ EngineAssociation: '5.3' }),
        },
      });

      const result = await EngineResolver.resolveEngine(uprojectPath);

      expect(result.engine).toBeUndefined();
      expect(result.warnings).toEqual([]);
    });
  });

  describe('registry parsing edge cases', () => {
    it('handles multi-line registry format with path on next line', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(true);

      const engineGuid = '{NEXTLINE-GUID-1234}';
      const enginePath = 'C:\\Epic\\UE_NextLine';

      mockExeca.mockImplementation(async () => ({
        stdout: `HKEY_CURRENT_USER\\SOFTWARE\\Epic Games\\Unreal Engine\\Builds\n${engineGuid}\n    REG_SZ    ${enginePath}`,
      }));

      const result = await EngineResolver.findEngineInstallations();

      expect(result.some((e) => e.associationId === engineGuid)).toBe(true);
    });

    it('handles registry line with GUID but no REG_SZ on same line', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(true);

      const engineGuid = '{MULTILINE-GUID-TEST}';
      const enginePath = 'C:\\Epic\\UE_Multi';

      mockExeca.mockImplementation(async () => ({
        stdout: `HKEY_CURRENT_USER\\SOFTWARE\\Epic Games\\Unreal Engine\\Builds\n${engineGuid}\n    REG_SZ    ${enginePath}`,
      }));

      const result = await EngineResolver.findEngineInstallations();

      expect(result.some((e) => e.associationId === engineGuid)).toBe(true);
    });

    it('stops scanning when registry key header is encountered', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(true);

      const firstGuid = '{STOP-GUID-1234}';

      // Mock registry output where:
      // - First GUID has no path on its line
      // - Next line is a registry key header (contains the key path)
      // The code should stop scanning for first GUID's path when it hits the key header
      mockExeca.mockImplementation(async () => ({
        stdout: [
          'HKEY_CURRENT_USER\\SOFTWARE\\Epic Games\\Unreal Engine\\Builds',
          firstGuid,
          '    REG_SZ',
          'HKEY_CURRENT_USER\\SOFTWARE\\Epic Games\\Unreal Engine\\Builds',
          '{ANOTHER-GUID}    REG_SZ    C:\\Epic\\UE_Other',
        ].join('\n'),
      }));

      const result = await EngineResolver.findEngineInstallations();

      // First GUID has no path because scanning stopped at key header line
      const firstEngine = result.find((e) => e.associationId === firstGuid);
      expect(firstEngine).toBeUndefined();
    });

    it('handles malformed GUID in registry output', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(true);

      // Mock registry output with malformed GUID (no closing brace)
      mockExeca.mockImplementation(async () => ({
        stdout: [
          'HKEY_CURRENT_USER\\SOFTWARE\\Epic Games\\Unreal Engine\\Builds',
          '{MALFORMED-GUID    REG_SZ    C:\\Epic\\UE_Malformed',
        ].join('\n'),
      }));

      const result = await EngineResolver.findEngineInstallations();

      // Malformed GUID should be skipped
      expect(result).toHaveLength(0);
    });

    it('handles registry line without opening brace', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(true);

      // Mock registry output with line that doesn't start with {
      mockExeca.mockImplementation(async () => ({
        stdout: [
          'HKEY_CURRENT_USER\\SOFTWARE\\Epic Games\\Unreal Engine\\Builds',
          'NOT-A-GUID    REG_SZ    C:\\Epic\\UE_NotGuid',
        ].join('\n'),
      }));

      const result = await EngineResolver.findEngineInstallations();

      // Line without opening brace should be skipped
      expect(result).toHaveLength(0);
    });
  });

  describe('launcher manifest error handling', () => {
    it('handles file read errors gracefully', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(true);

      const manifestPath = path.join(
        process.env.LOCALAPPDATA ?? '',
        'UnrealEngine',
        'Common',
        'LauncherInstalled.dat'
      );

      // Mock fs.pathExists to return true but readFile to throw
      configureFs({
        existingPaths: [manifestPath],
      });

      mockReadFile.mockImplementation(async () => {
        throw new Error('Permission denied reading manifest');
      });

      const result = await EngineResolver.findEngineInstallations();

      // Should return empty array, not throw
      expect(result).toHaveLength(0);
    });

    it('handles malformed JSON in launcher manifest gracefully', async () => {
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
          [manifestPath]: 'not valid json at all {{{',
        },
      });

      const result = await EngineResolver.findEngineInstallations();

      // Should return empty array, not throw
      expect(result).toHaveLength(0);
    });
  });

  describe('version loading error handling', () => {
    it('handles errors when loading engine version info gracefully', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(false);

      process.env.UE_ENGINE_PATH = 'C:\\Engines\\UE_Error';

      // Mock path exists but stat will throw when trying to read version file
      configureFs({
        existingPaths: ['C:\\Engines\\UE_Error'],
      });

      // Make stat throw for version file paths
      mockStat.mockImplementation(async (candidate: string) => {
        if (candidate.includes('version')) {
          throw new Error('Cannot access version file');
        }
        return { isDirectory: () => true };
      });

      const result = await EngineResolver.findEngineInstallations();

      // Should still return the engine, just without version info
      expect(result).toHaveLength(1);
      expect(result[0].version).toBeUndefined();
      expect(result[0].displayName).toBe('UE Engine (from UE_ENGINE_PATH)');
    });
  });

  describe('version comparison comprehensive tests', () => {
    it('compares different major versions', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(true);

      const manifestPath = path.join(
        process.env.LOCALAPPDATA ?? '',
        'UnrealEngine',
        'Common',
        'LauncherInstalled.dat'
      );

      const enginePath427 = 'C:\\Engines\\UE_4_27';
      const enginePath53 = 'C:\\Engines\\UE_5_3';
      const versionFile427 = path.join(enginePath427, 'Engine', 'Build', 'Build.version');
      const versionFile53 = path.join(enginePath53, 'Engine', 'Build', 'Build.version');

      configureFs({
        existingPaths: [manifestPath, enginePath427, enginePath53, versionFile427, versionFile53],
        fileContents: {
          [manifestPath]: JSON.stringify({
            InstallationList: [
              {
                AppName: 'UE_4_27',
                InstallLocation: enginePath427,
                DisplayName: 'UE 4.27',
              },
              {
                AppName: 'UE_5_3',
                InstallLocation: enginePath53,
                DisplayName: 'UE 5.3',
              },
            ],
          }),
          [versionFile427]: JSON.stringify({
            MajorVersion: 4,
            MinorVersion: 27,
            PatchVersion: 0,
            Changelist: 1000,
            CompatibleChangelist: 1000,
            IsLicenseeVersion: 0,
            IsPromotedBuild: 1,
            BranchName: '++UE4+Release-4.27',
            BuildId: 'ue4-1000',
          }),
          [versionFile53]: JSON.stringify({
            MajorVersion: 5,
            MinorVersion: 3,
            PatchVersion: 0,
            Changelist: 2000,
            CompatibleChangelist: 2000,
            IsLicenseeVersion: 0,
            IsPromotedBuild: 1,
            BranchName: '++UE5+Release-5.3',
            BuildId: 'ue5-2000',
          }),
        },
      });

      const result = await EngineResolver.findEngineInstallations();

      // Should have both engines with version info loaded from files
      expect(result).toHaveLength(2);
      expect(result.some((r) => r.version?.MajorVersion === 5)).toBe(true);
      expect(result.some((r) => r.version?.MajorVersion === 4)).toBe(true);
    });

    it('compares different patch versions when major and minor are equal', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(true);

      const manifestPath = path.join(
        process.env.LOCALAPPDATA ?? '',
        'UnrealEngine',
        'Common',
        'LauncherInstalled.dat'
      );

      const enginePath531 = 'C:\\Engines\\UE531';
      const enginePath532 = 'C:\\Engines\\UE532';
      const versionFile531 = path.join(enginePath531, 'Engine', 'Build', 'Build.version');
      const versionFile532 = path.join(enginePath532, 'Engine', 'Build', 'Build.version');

      configureFs({
        existingPaths: [manifestPath, enginePath531, enginePath532, versionFile531, versionFile532],
        fileContents: {
          [manifestPath]: JSON.stringify({
            InstallationList: [
              {
                AppName: 'UE_5_3_1',
                InstallLocation: enginePath531,
                DisplayName: 'UE 5.3.1',
              },
              {
                AppName: 'UE_5_3_2',
                InstallLocation: enginePath532,
                DisplayName: 'UE 5.3.2',
              },
            ],
          }),
          [versionFile531]: JSON.stringify({
            MajorVersion: 5,
            MinorVersion: 3,
            PatchVersion: 1,
            Changelist: 1000,
            CompatibleChangelist: 1000,
            IsLicenseeVersion: 0,
            IsPromotedBuild: 1,
            BranchName: '++UE5+Release-5.3.1',
            BuildId: 'ue5-31',
          }),
          [versionFile532]: JSON.stringify({
            MajorVersion: 5,
            MinorVersion: 3,
            PatchVersion: 2,
            Changelist: 1000,
            CompatibleChangelist: 1000,
            IsLicenseeVersion: 0,
            IsPromotedBuild: 1,
            BranchName: '++UE5+Release-5.3.2',
            BuildId: 'ue5-32',
          }),
        },
      });

      const result = await EngineResolver.findEngineInstallations();

      // Should have both engines with correct patch versions
      expect(result).toHaveLength(2);
      const patch1 = result.find((r) => r.version?.PatchVersion === 1);
      const patch2 = result.find((r) => r.version?.PatchVersion === 2);
      expect(patch1).toBeDefined();
      expect(patch2).toBeDefined();
    });

    it('compares different changelists when versions are equal', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(true);

      const manifestPath = path.join(
        process.env.LOCALAPPDATA ?? '',
        'UnrealEngine',
        'Common',
        'LauncherInstalled.dat'
      );

      const versionFile1 = 'C:\\Epic\\UE_5.3.0\\Engine\\Build\\Build.version';

      configureFs({
        existingPaths: [manifestPath, 'C:\\Epic\\UE_5.3.0', versionFile1],
        fileContents: {
          [manifestPath]: JSON.stringify({
            InstallationList: [
              {
                AppName: 'UE_5_3_CL1000',
                InstallLocation: 'C:\\Epic\\UE_5.3.0',
                DisplayName: 'UE 5.3.0 CL1000',
              },
              {
                AppName: 'UE_5_3_CL2000',
                InstallLocation: 'C:\\Epic\\UE_5.3.0',
                DisplayName: 'UE 5.3.0 CL2000',
              },
            ],
          }),
          [versionFile1]: JSON.stringify({
            MajorVersion: 5,
            MinorVersion: 3,
            PatchVersion: 0,
            Changelist: 1000,
            CompatibleChangelist: 1000,
            IsLicenseeVersion: 0,
            IsPromotedBuild: 1,
            BranchName: '++UE5+Release-5.3.0',
            BuildId: 'ue5-cl1000',
          }),
        },
      });

      // Mock execa to return two registry entries at same path with different changelists
      mockExeca.mockImplementation(async () => ({
        stdout: [
          'HKEY_CURRENT_USER\\SOFTWARE\\Epic Games\\Unreal Engine\\Builds',
          '{CL1000-GUID}    REG_SZ    C:\\Epic\\UE_5.3.0',
          '{CL2000-GUID}    REG_SZ    C:\\Epic\\UE_5.3.0',
        ].join('\n'),
      }));

      const result = await EngineResolver.findEngineInstallations();

      // Should prefer launcher source and sort by version
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('compareVersionString edge cases', () => {
    it('handles identical version strings correctly', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(true);

      const manifestPath = path.join(
        process.env.LOCALAPPDATA ?? '',
        'UnrealEngine',
        'Common',
        'LauncherInstalled.dat'
      );

      const enginePath = 'C:\\Engines\\UE_Version';
      const versionFile = path.join(enginePath, 'Engine', 'Build', 'Build.version');

      configureFs({
        existingPaths: [manifestPath, enginePath, versionFile],
        fileContents: {
          [manifestPath]: JSON.stringify({
            InstallationList: [
              {
                AppName: 'UE_Test',
                InstallLocation: enginePath,
                DisplayName: 'UE Test',
              },
            ],
          }),
          [versionFile]: JSON.stringify({
            MajorVersion: 5,
            MinorVersion: 3,
            PatchVersion: 2,
            Changelist: 1000,
            CompatibleChangelist: 1000,
            IsLicenseeVersion: 0,
            IsPromotedBuild: 1,
            BranchName: '++UE5+Release-5.3.2',
            BuildId: 'test-1000',
          }),
        },
      });

      const result = await EngineResolver.findEngineInstallations();

      expect(result).toHaveLength(1);
      expect(result[0].version).toEqual({
        MajorVersion: 5,
        MinorVersion: 3,
        PatchVersion: 2,
        Changelist: 1000,
        CompatibleChangelist: 1000,
        IsLicenseeVersion: 0,
        IsPromotedBuild: 1,
        BranchName: '++UE5+Release-5.3.2',
        BuildId: 'test-1000',
      });
    });

    it('handles version strings with different segment counts', async () => {
      jest.spyOn(Platform, 'isWindows').mockReturnValue(true);

      const uprojectPath = 'C:\\Projects\\TestGame\\TestGame.uproject';

      configureFs({
        existingPaths: [uprojectPath],
        fileContents: {
          [uprojectPath]: JSON.stringify({ EngineAssociation: '5.3.2.1' }),
        },
      });

      const manifestPath = path.join(
        process.env.LOCALAPPDATA ?? '',
        'UnrealEngine',
        'Common',
        'LauncherInstalled.dat'
      );

      configureFs({
        existingPaths: [uprojectPath, manifestPath],
        fileContents: {
          [uprojectPath]: JSON.stringify({ EngineAssociation: '5.3.2.1' }),
          [manifestPath]: JSON.stringify({
            InstallationList: [
              {
                AppName: 'UE_5_3',
                InstallLocation: 'C:\\Epic\\UE_5.3',
                DisplayName: 'UE 5.3',
              },
            ],
          }),
        },
      });

      const result = await EngineResolver.resolveEngine(uprojectPath);

      // Should handle 4-segment vs 3-segment version comparison
      expect(result.engine).toBeDefined();
    });
  });
});
