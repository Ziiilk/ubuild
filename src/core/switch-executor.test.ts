/**
 * Tests for SwitchExecutor module.
 */

import { SwitchExecutor } from './switch-executor';
import type { SwitchOptions } from '../types/switch';

const mockFsReadJson = jest.fn();
const mockFsWriteFile = jest.fn();
const mockFsPathExists = jest.fn();
const mockFsReadFile = jest.fn();

jest.mock('fs-extra', () => ({
  readJson: (...args: unknown[]) => mockFsReadJson(...args),
  writeFile: (...args: unknown[]) => mockFsWriteFile(...args),
  pathExists: (...args: unknown[]) => mockFsPathExists(...args),
  readFile: (...args: unknown[]) => mockFsReadFile(...args),
}));

const mockLoggerInstance = {
  info: jest.fn(),
  success: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  divider: jest.fn(),
  title: jest.fn(),
  subTitle: jest.fn(),
  json: jest.fn(),
  write: jest.fn(),
  writeError: jest.fn(),
  warning: jest.fn(),
  clearProgress: jest.fn(),
  progress: jest.fn(),
};

jest.mock('../utils/logger', () => ({
  Logger: jest.fn().mockImplementation(() => mockLoggerInstance),
  resolveLoggerStreams: jest.fn().mockImplementation((options?: { logger?: unknown }) => ({
    stdout: process.stdout,
    stderr: process.stderr,
    logger: options?.logger || mockLoggerInstance,
  })),
}));

jest.mock('./project-path-resolver', () => ({
  ProjectPathResolver: {
    resolveOrThrow: jest
      .fn()
      .mockResolvedValue('C:\\Projects\\TestProject\\TestProject.uproject'),
  },
}));

const mockFindEngineInstallations = jest.fn();
jest.mock('./engine-resolver', () => ({
  EngineResolver: {
    findEngineInstallations: (...args: unknown[]) => mockFindEngineInstallations(...args),
  },
}));

const mockIsValidEnginePath = jest.fn();
jest.mock('../utils/validator', () => ({
  Validator: {
    isValidEnginePath: (...args: unknown[]) => mockIsValidEnginePath(...args),
  },
}));

const mockPrompt = jest.fn();
jest.mock('inquirer', () => ({
  prompt: (...args: unknown[]) => mockPrompt(...args),
}));
import { ProjectPathResolver } from './project-path-resolver';

describe('SwitchExecutor', () => {
  let executor: SwitchExecutor;

  const mockUProject = {
    FileVersion: 3,
    EngineAssociation: '5.3',
    Category: '',
    Description: '',
    Modules: [{ Name: 'TestProject', Type: 'Runtime', LoadingPhase: 'Default' }],
    Plugins: [],
  };

  const mockEngines = [
    {
      path: 'C:\\Program Files\\Epic Games\\UE_5.3',
      associationId: '5.3',
      displayName: 'Unreal Engine 5.3',
      source: 'launcher' as const,
      version: { MajorVersion: 5, MinorVersion: 3, PatchVersion: 0, Changelist: 0, CompatibleChangelist: 0, IsLicenseeVersion: 0, IsPromotedBuild: 0, BranchName: '', BuildId: '' },
    },
    {
      path: 'C:\\Program Files\\Epic Games\\UE_5.4',
      associationId: '5.4',
      displayName: 'Unreal Engine 5.4',
      source: 'launcher' as const,
      version: { MajorVersion: 5, MinorVersion: 4, PatchVersion: 0, Changelist: 0, CompatibleChangelist: 0, IsLicenseeVersion: 0, IsPromotedBuild: 0, BranchName: '', BuildId: '' },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockFsReadJson.mockResolvedValue({ ...mockUProject });
    mockFsWriteFile.mockResolvedValue(undefined);
    mockFindEngineInstallations.mockResolvedValue([...mockEngines]);
    mockIsValidEnginePath.mockResolvedValue(true);
    executor = new SwitchExecutor();
  });

  describe('constructor', () => {
    it('creates executor with default options', () => {
      expect(executor).toBeDefined();
    });
  });

  describe('execute', () => {
    it('switches engine when engine path is provided', async () => {
      const options: SwitchOptions = {
        enginePath: 'C:\\Program Files\\Epic Games\\UE_5.4',
      };

      const result = await executor.execute(options);

      expect(result.success).toBe(true);
      expect(result.previousAssociation).toBe('5.3');
      expect(result.newAssociation).toBe('5.4');
      expect(mockFsWriteFile).toHaveBeenCalledWith(
        'C:\\Projects\\TestProject\\TestProject.uproject',
        expect.stringContaining('"EngineAssociation": "5.4"'),
        'utf-8'
      );
    });

    it('prompts for selection when no engine path is provided', async () => {
      mockPrompt.mockResolvedValue({
        selectedEngine: 'C:\\Program Files\\Epic Games\\UE_5.4',
      });

      const result = await executor.execute({});

      expect(mockPrompt).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.newAssociation).toBe('5.4');
    });

    it('returns failure when no engines are found', async () => {
      mockFindEngineInstallations.mockResolvedValue([]);

      const result = await executor.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('No Unreal Engine installations found');
    });

    it('returns failure when engine path is invalid', async () => {
      mockIsValidEnginePath.mockResolvedValue(false);

      const result = await executor.execute({
        enginePath: 'C:\\invalid\\path',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid engine path');
    });

    it('does not write file when association is unchanged', async () => {
      const options: SwitchOptions = {
        enginePath: 'C:\\Program Files\\Epic Games\\UE_5.3',
      };

      const result = await executor.execute(options);

      expect(result.success).toBe(true);
      expect(result.previousAssociation).toBe('5.3');
      expect(result.newAssociation).toBe('5.3');
      expect(mockFsWriteFile).not.toHaveBeenCalled();
    });

    it('preserves existing .uproject fields when switching', async () => {
      const options: SwitchOptions = {
        enginePath: 'C:\\Program Files\\Epic Games\\UE_5.4',
      };

      await executor.execute(options);

      const writtenContent = mockFsWriteFile.mock.calls[0][1];
      const parsed = JSON.parse(writtenContent);
      expect(parsed.FileVersion).toBe(3);
      expect(parsed.Modules).toEqual(mockUProject.Modules);
      expect(parsed.EngineAssociation).toBe('5.4');
    });

    it('uses association ID for registry engines', async () => {
      mockFindEngineInstallations.mockResolvedValue([
        {
          path: 'D:\\CustomEngine',
          associationId: '{ABCD-1234}',
          displayName: 'Custom Engine',
          source: 'registry',
        },
      ]);
      mockPrompt.mockResolvedValue({
        selectedEngine: 'D:\\CustomEngine',
      });

      const result = await executor.execute({});

      expect(result.success).toBe(true);
      expect(result.newAssociation).toBe('{ABCD-1234}');
    });

    it('falls back to version file when engine not in installations list', async () => {
      mockIsValidEnginePath.mockResolvedValue(true);
      mockFindEngineInstallations.mockResolvedValue([...mockEngines]);
      mockFsPathExists.mockResolvedValue(true);
      mockFsReadFile.mockResolvedValue(
        JSON.stringify({ MajorVersion: 5, MinorVersion: 5, PatchVersion: 0 })
      );

      const result = await executor.execute({
        enginePath: 'D:\\SomeOtherEngine',
      });

      expect(result.success).toBe(true);
      expect(result.newAssociation).toBe('5.5');
    });

    it('propagates error when project path resolution fails', async () => {
      (ProjectPathResolver.resolveOrThrow as jest.Mock).mockRejectedValue(
        new Error('No .uproject file found')
      );

      await expect(executor.execute({})).rejects.toThrow('No .uproject file found');
    });
  });
});
