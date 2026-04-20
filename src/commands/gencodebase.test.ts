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

jest.mock('../core/engine-resolver', () => {
  const { ProjectPathResolver } = jest.requireActual('../core/project-path-resolver');
  return {
    EngineResolver: {
      resolveEngine: (...args: [string]) => mockResolveEngine(...args),
      resolveEnginePath: (...args: [{ projectPath?: string; enginePath?: string }]) =>
        mockResolveEnginePath(...args),
      resolveProjectAndEngine: async (
        ...args: [{ projectPath?: string; enginePath?: string }]
      ) => {
        const projectPath = await ProjectPathResolver.resolveOrThrow(
          args[0]?.projectPath || process.cwd()
        );
        const enginePath = await mockResolveEnginePath({
          projectPath,
          enginePath: args[0]?.enginePath,
        });
        return { projectPath, enginePath };
      },
    },
  };
});

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
    jest.spyOn(Logger.prototype, 'title').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'success').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'subTitle').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'info').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'json').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'divider').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
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
      expect(Logger.prototype.json).toHaveBeenCalledWith({ success: true, path: generatedPath });
      expect(Logger.prototype.success).not.toHaveBeenCalledWith(
        expect.stringContaining('Compile commands generated:')
      );
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
      expect(Logger.prototype.error).toHaveBeenCalledWith(
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

      expect(Logger.prototype.title).toHaveBeenCalledWith('Generate Compile Commands Database');
      expect(Logger.prototype.success).toHaveBeenCalledWith(
        expect.stringContaining('Compile commands generated:')
      );
      expect(Logger.prototype.success).toHaveBeenCalledWith('VSCode settings updated: .vscode/settings.json');
      expect(Logger.prototype.json).not.toHaveBeenCalled();
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
      expect(Logger.prototype.error).toHaveBeenCalledWith(
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
      expect(Logger.prototype.error).toHaveBeenCalledWith(
        'Failed to generate compile commands: Engine not found at specified path'
      );
    });
  });

  it('excludes all include flags when all --no flags are set together', async () => {
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
        '--no-include-engine-sources',
        '--no-use-engine-includes',
      ]);

      const args = mockExeca.mock.calls[0][1] as string[];
      expect(args).not.toContain('-IncludePluginSources');
      expect(args).not.toContain('-IncludeEngineSources');
      expect(args).not.toContain('-UseEngineIncludes');
    });
  });

  it('uses Game target type when specified', async () => {
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
      ]);

      expect(mockExeca).toHaveBeenCalledWith(
        expect.stringContaining('UnrealBuildTool'),
        expect.arrayContaining([expect.stringContaining('NebulaGameGame')]),
        expect.any(Object)
      );
    });
  });

  it('uses Client target type when specified', async () => {
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
        { name: `${project.projectName}Client`, type: 'Client' },
      ]);
      mockExeca.mockReturnValue(createFakeExecaChild({ exitCode: 0 }));

      await runRegisteredCommand([
        'gencodebase',
        '--project',
        project.projectDir,
        '--target',
        'Client',
      ]);

      expect(mockExeca).toHaveBeenCalledWith(
        expect.stringContaining('UnrealBuildTool'),
        expect.arrayContaining([expect.stringContaining('NebulaGameClient')]),
        expect.any(Object)
      );
    });
  });

  it('uses Server target type when specified', async () => {
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
        { name: `${project.projectName}Server`, type: 'Server' },
      ]);
      mockExeca.mockReturnValue(createFakeExecaChild({ exitCode: 0 }));

      await runRegisteredCommand([
        'gencodebase',
        '--project',
        project.projectDir,
        '--target',
        'Server',
      ]);

      expect(mockExeca).toHaveBeenCalledWith(
        expect.stringContaining('UnrealBuildTool'),
        expect.arrayContaining([expect.stringContaining('NebulaGameServer')]),
        expect.any(Object)
      );
    });
  });

  it('handles compile_commands.json not found after generation', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'NebulaGame' });
      const engine = await createFakeEngine(rootDir);

      // Don't create the compile_commands.json file to simulate failure

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

      const exitSpy = jest
        .spyOn(process, 'exit')
        .mockImplementation((code?: string | number | null): never => {
          throw new Error(`process.exit:${code}`);
        });

      await expect(
        runRegisteredCommand(['gencodebase', '--project', project.projectDir])
      ).rejects.toThrow('process.exit:1');

      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  it('moves compile_commands.json from engine to project directory', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'NebulaGame' });
      const engine = await createFakeEngine(rootDir);
      const compileCommandsContent = JSON.stringify([
        { file: 'test.cpp', command: 'clang++ test.cpp' },
      ]);

      await fs.writeFile(
        path.join(engine.enginePath, 'compile_commands.json'),
        compileCommandsContent,
        'utf-8'
      );

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

      const projectCompileCommandsPath = path.join(
        project.projectDir,
        '.vscode',
        'compile_commands.json'
      );
      expect(await fs.pathExists(projectCompileCommandsPath)).toBe(true);
      const content = await fs.readFile(projectCompileCommandsPath, 'utf-8');
      expect(content).toBe(compileCommandsContent);
    });
  });

  it('overwrites existing compile_commands.json in project directory', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'NebulaGame' });
      const engine = await createFakeEngine(rootDir);
      const oldContent = JSON.stringify([{ file: 'old.cpp', command: 'clang++ old.cpp' }]);
      const newContent = JSON.stringify([{ file: 'new.cpp', command: 'clang++ new.cpp' }]);

      const vscodeDir = path.join(project.projectDir, '.vscode');
      await fs.ensureDir(vscodeDir);
      await fs.writeFile(path.join(vscodeDir, 'compile_commands.json'), oldContent, 'utf-8');
      await fs.writeFile(
        path.join(engine.enginePath, 'compile_commands.json'),
        newContent,
        'utf-8'
      );

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

      const projectCompileCommandsPath = path.join(vscodeDir, 'compile_commands.json');
      const content = await fs.readFile(projectCompileCommandsPath, 'utf-8');
      expect(content).toBe(newContent);
    });
  });
});

describe('executeGencodebase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveEnginePath.mockResolvedValue('');
    jest.spyOn(Logger.prototype, 'title').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'success').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'subTitle').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'info').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'json').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'divider').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the compile commands path on success', async () => {
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

      const { executeGencodebase } = await import('./gencodebase');
      const result = await executeGencodebase({
        project: project.projectDir,
        target: 'Editor',
        config: 'Development',
        platform: 'Win64',
      });

      expect(result).toBe(path.join(project.projectDir, '.vscode', 'compile_commands.json'));
    });
  });

  it('throws error when generation fails', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'NebulaGame' });
      const engine = await createFakeEngine(rootDir);

      mockGetAvailableTargets.mockResolvedValue([
        { name: `${project.projectName}Editor`, type: 'Editor' },
      ]);
      mockResolveEnginePath.mockResolvedValue(engine.enginePath);
      mockExeca.mockReturnValue(createFakeExecaChild({ exitCode: 5 }));

      const { executeGencodebase } = await import('./gencodebase');

      await expect(
        executeGencodebase({
          project: project.projectDir,
          target: 'Editor',
          config: 'Development',
          platform: 'Win64',
        })
      ).rejects.toThrow('Generate compile commands failed with exit code 5');
    });
  });
});

async function runRegisteredCommand(args: string[]): Promise<void> {
  const program = new Command();
  gencodebaseCommand(program);
  await program.parseAsync(['node', 'ubuild', ...args]);
}
