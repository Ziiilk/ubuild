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
  {
    stdio: string;
    cwd: string;
    shell: boolean;
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
        expect.stringContaining(`-Target="${project.projectName}Editor Win64 Development"`),
        expect.objectContaining({
          stdio: 'pipe',
          cwd: path.dirname(engine.unrealBuildToolPath),
          shell: true,
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
});

async function runRegisteredCommand(args: string[]): Promise<void> {
  const program = new Command();
  gencodebaseCommand(program);
  await program.parseAsync(['node', 'ubuild', ...args]);
}
