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
});
