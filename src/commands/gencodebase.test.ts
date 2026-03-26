import fs from 'fs-extra';
import path from 'path';
import { Command } from 'commander';
import { gencodebaseCommand } from './gencodebase';
import { Logger } from '../utils/logger';
import {
  createFakeEngine,
  createFakeExecaChild,
  createFakeProject,
  withTempDir,
} from '../test-utils';

interface MockEngineResult {
  engine?: {
    path: string;
    displayName?: string;
  };
  warnings: string[];
  error?: string;
}

type GencodebaseExecaInvocation = [
  string,
  string[],
  {
    stdio: string;
    cwd: string;
  },
];

const mockResolveEngine = jest.fn<Promise<MockEngineResult>, [string]>();
const mockResolveEnginePath = jest.fn<
  Promise<string>,
  [{ projectPath?: string; enginePath?: string }]
>();
const mockGetAvailableTargets = jest.fn<Promise<Array<{ name: string; type: string }>>, [string]>();
const mockExeca = jest.fn<ReturnType<typeof createFakeExecaChild>, GencodebaseExecaInvocation>();

jest.mock('../core/engine-resolver', () => ({
  EngineResolver: {
    resolveEngine: (...args: [string]) => mockResolveEngine(...args),
    resolveEnginePath: (...args: [{ projectPath?: string; enginePath?: string }]) =>
      mockResolveEnginePath(...args),
  },
}));

jest.mock('../core/build-executor', () => ({
  BuildExecutor: {
    getAvailableTargets: (...args: [string]) => mockGetAvailableTargets(...args),
  },
}));

jest.mock('execa', () => ({
  execa: (...args: GencodebaseExecaInvocation) => mockExeca(...args),
}));

describe('gencodebaseCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveEnginePath.mockResolvedValue('');
    jest.spyOn(Logger, 'title').mockImplementation(() => undefined);
    jest.spyOn(Logger, 'success').mockImplementation(() => undefined);
    jest.spyOn(Logger, 'subTitle').mockImplementation(() => undefined);
    jest.spyOn(Logger, 'info').mockImplementation(() => undefined);
    jest.spyOn(Logger, 'json').mockImplementation(() => undefined);
    jest.spyOn(Logger, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger, 'divider').mockImplementation(() => undefined);
    jest.spyOn(Logger, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('prints JSON output for successful compile command generation', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'NebulaGame' });
      const engine = await createFakeEngine(rootDir);
      const generatedPath = path.join(project.projectDir, '.vscode', 'compile_commands.json');

      await fs.writeFile(path.join(engine.enginePath, 'compile_commands.json'), '[]', 'utf-8');

      mockResolveEngine.mockResolvedValue({
        engine: {
          path: engine.enginePath,
          displayName: engine.installation.displayName,
        },
        warnings: [],
      });
      mockResolveEnginePath.mockResolvedValue(engine.enginePath);
      mockGetAvailableTargets.mockResolvedValue([
        { name: `${project.projectName}Editor`, type: 'Editor' },
      ]);
      mockExeca.mockReturnValue(createFakeExecaChild({ exitCode: 0 }));

      await runRegisteredCommand(['gencodebase', '--project', project.projectDir, '--json']);

      expect(mockExeca).toHaveBeenCalledWith(
        expect.stringContaining('UnrealBuildTool'),
        expect.arrayContaining([`-Target="${project.projectName}Editor Win64 Development"`]),
        expect.objectContaining({
          stdio: 'pipe',
          cwd: path.dirname(engine.unrealBuildToolPath),
        })
      );
      expect(Logger.json).toHaveBeenCalledWith({ success: true, path: generatedPath });
      expect(Logger.success).not.toHaveBeenCalled();
      expect(await fs.pathExists(generatedPath)).toBe(true);
    });
  });

  it('logs a command-shaped failure message and exits non-zero when generation fails', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'NebulaGame' });
      const engine = await createFakeEngine(rootDir);
      const exitSpy = jest
        .spyOn(process, 'exit')
        .mockImplementation((code?: string | number | null): never => {
          throw new Error(`process.exit:${code}`);
        });

      mockGetAvailableTargets.mockResolvedValue([
        { name: `${project.projectName}Editor`, type: 'Editor' },
      ]);
      mockResolveEnginePath.mockResolvedValue(engine.enginePath);
      mockExeca.mockReturnValue(createFakeExecaChild({ exitCode: 7 }));

      await expect(
        runRegisteredCommand([
          'gencodebase',
          '--project',
          project.projectDir,
          '--engine-path',
          engine.enginePath,
        ])
      ).rejects.toThrow('process.exit:1');

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(Logger.error).toHaveBeenCalledWith(
        'Failed to generate compile commands: Generate compile commands failed with exit code 7'
      );
    });
  });

  it('displays success message in non-JSON mode', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'NebulaGame' });
      const engine = await createFakeEngine(rootDir);

      await fs.writeFile(path.join(engine.enginePath, 'compile_commands.json'), '[]', 'utf-8');

      mockResolveEngine.mockResolvedValue({
        engine: {
          path: engine.enginePath,
          displayName: engine.installation.displayName,
        },
        warnings: [],
      });
      mockResolveEnginePath.mockResolvedValue(engine.enginePath);
      mockGetAvailableTargets.mockResolvedValue([
        { name: `${project.projectName}Editor`, type: 'Editor' },
      ]);
      mockExeca.mockReturnValue(createFakeExecaChild({ exitCode: 0 }));

      await runRegisteredCommand(['gencodebase', '--project', project.projectDir]);

      expect(Logger.title).toHaveBeenCalledWith('Generate Compile Commands Database');
      expect(Logger.success).toHaveBeenCalledWith(
        expect.stringContaining('Compile commands generated:')
      );
      expect(Logger.success).toHaveBeenCalledWith('VSCode settings updated: .vscode/settings.json');
      expect(Logger.json).not.toHaveBeenCalled();
    });
  });

  it('passes custom target, config, and platform options to UBT', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'NebulaGame' });
      const engine = await createFakeEngine(rootDir);

      await fs.writeFile(path.join(engine.enginePath, 'compile_commands.json'), '[]', 'utf-8');

      mockResolveEngine.mockResolvedValue({
        engine: {
          path: engine.enginePath,
          displayName: engine.installation.displayName,
        },
        warnings: [],
      });
      mockResolveEnginePath.mockResolvedValue(engine.enginePath);
      mockGetAvailableTargets.mockResolvedValue([
        { name: `${project.projectName}Game`, type: 'Game' },
      ]);
      mockExeca.mockReturnValue(createFakeExecaChild({ exitCode: 0 }));

      await runRegisteredCommand([
        'gencodebase',
        '--project',
        project.projectDir,
        '--target',
        'Game',
        '--config',
        'Shipping',
        '--platform',
        'Linux',
      ]);

      expect(mockExeca).toHaveBeenCalledWith(
        expect.stringContaining('UnrealBuildTool'),
        expect.arrayContaining(['-Target="NebulaGameGame Linux Shipping"']),
        expect.any(Object)
      );
    });
  });

  it('excludes plugin sources flag when --no-include-plugin-sources is set', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'NebulaGame' });
      const engine = await createFakeEngine(rootDir);

      await fs.writeFile(path.join(engine.enginePath, 'compile_commands.json'), '[]', 'utf-8');

      mockResolveEngine.mockResolvedValue({
        engine: {
          path: engine.enginePath,
          displayName: engine.installation.displayName,
        },
        warnings: [],
      });
      mockResolveEnginePath.mockResolvedValue(engine.enginePath);
      mockGetAvailableTargets.mockResolvedValue([
        { name: `${project.projectName}Editor`, type: 'Editor' },
      ]);
      mockExeca.mockReturnValue(createFakeExecaChild({ exitCode: 0 }));

      await runRegisteredCommand([
        'gencodebase',
        '--project',
        project.projectDir,
        '--no-include-plugin-sources',
      ]);

      const args = mockExeca.mock.calls[0][1] as string[];
      expect(args).not.toContain('-IncludePluginSources');
      expect(args).toContain('-IncludeEngineSources');
      expect(args).toContain('-UseEngineIncludes');
    });
  });

  it('excludes engine sources flag when --no-include-engine-sources is set', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'NebulaGame' });
      const engine = await createFakeEngine(rootDir);

      await fs.writeFile(path.join(engine.enginePath, 'compile_commands.json'), '[]', 'utf-8');

      mockResolveEngine.mockResolvedValue({
        engine: {
          path: engine.enginePath,
          displayName: engine.installation.displayName,
        },
        warnings: [],
      });
      mockResolveEnginePath.mockResolvedValue(engine.enginePath);
      mockGetAvailableTargets.mockResolvedValue([
        { name: `${project.projectName}Editor`, type: 'Editor' },
      ]);
      mockExeca.mockReturnValue(createFakeExecaChild({ exitCode: 0 }));

      await runRegisteredCommand([
        'gencodebase',
        '--project',
        project.projectDir,
        '--no-include-engine-sources',
      ]);

      const args = mockExeca.mock.calls[0][1] as string[];
      expect(args).toContain('-IncludePluginSources');
      expect(args).not.toContain('-IncludeEngineSources');
      expect(args).toContain('-UseEngineIncludes');
    });
  });

  it('excludes engine includes flag when --no-use-engine-includes is set', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'NebulaGame' });
      const engine = await createFakeEngine(rootDir);

      await fs.writeFile(path.join(engine.enginePath, 'compile_commands.json'), '[]', 'utf-8');

      mockResolveEngine.mockResolvedValue({
        engine: {
          path: engine.enginePath,
          displayName: engine.installation.displayName,
        },
        warnings: [],
      });
      mockResolveEnginePath.mockResolvedValue(engine.enginePath);
      mockGetAvailableTargets.mockResolvedValue([
        { name: `${project.projectName}Editor`, type: 'Editor' },
      ]);
      mockExeca.mockReturnValue(createFakeExecaChild({ exitCode: 0 }));

      await runRegisteredCommand([
        'gencodebase',
        '--project',
        project.projectDir,
        '--no-use-engine-includes',
      ]);

      const args = mockExeca.mock.calls[0][1] as string[];
      expect(args).toContain('-IncludePluginSources');
      expect(args).toContain('-IncludeEngineSources');
      expect(args).not.toContain('-UseEngineIncludes');
    });
  });

  it('handles errors thrown by CompileCommandsGenerator gracefully', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'NebulaGame' });
      const engine = await createFakeEngine(rootDir);
      const exitSpy = jest
        .spyOn(process, 'exit')
        .mockImplementation((code?: string | number | null): never => {
          throw new Error(`process.exit:${code}`);
        });

      mockGetAvailableTargets.mockResolvedValue([
        { name: `${project.projectName}Editor`, type: 'Editor' },
      ]);
      mockResolveEnginePath.mockResolvedValue(engine.enginePath);
      mockExeca.mockRejectedValue(new Error('UBT execution failed: out of memory'));

      await expect(
        runRegisteredCommand(['gencodebase', '--project', project.projectDir])
      ).rejects.toThrow('process.exit:1');

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(Logger.error).toHaveBeenCalledWith(
        'Failed to generate compile commands: UBT execution failed: out of memory'
      );
    });
  });

  it('handles errors from EngineResolver gracefully', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'NebulaGame' });
      const exitSpy = jest
        .spyOn(process, 'exit')
        .mockImplementation((code?: string | number | null): never => {
          throw new Error(`process.exit:${code}`);
        });

      mockResolveEnginePath.mockRejectedValue(new Error('Engine not found at specified path'));

      await expect(
        runRegisteredCommand(['gencodebase', '--project', project.projectDir])
      ).rejects.toThrow('process.exit:1');

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(Logger.error).toHaveBeenCalledWith(
        'Failed to generate compile commands: Engine not found at specified path'
      );
    });
  });
});

async function runRegisteredCommand(args: string[]): Promise<void> {
  const program = new Command();
  gencodebaseCommand(program);
  await program.parseAsync(['node', 'ubuild', ...args]);
}
