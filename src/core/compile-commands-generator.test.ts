import path from 'path';
import { PassThrough } from 'stream';
import fs from 'fs-extra';
import { CompileCommandsGenerator } from './compile-commands-generator';
import { EngineResolver } from './engine-resolver';
import { ProjectPathResolver } from './project-path-resolver';
import { TargetResolver } from './target-resolver';
import { createFakeEngine, createFakeProject, withTempDir } from '../test-utils';

interface ExecaOptions {
  stdio: 'pipe';
  cwd: string;
  shell: true;
}

interface ExecaResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface MockChildProcess extends Promise<ExecaResult> {
  stdout: PassThrough;
  stderr: PassThrough;
}

interface MockExecaProcessOptions {
  result?: Partial<ExecaResult>;
  streamedStdout?: string[];
  streamedStderr?: string[];
}

const mockExeca = jest.fn<MockChildProcess, [string, ExecaOptions]>();

jest.mock('execa', () => ({
  execa: (...args: [string, ExecaOptions]) => mockExeca(...args),
}));

const mockLoggerInfo = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerSuccess = jest.fn();
const mockLoggerDebug = jest.fn();
const mockLoggerDivider = jest.fn();

jest.mock('../utils/logger', () => ({
  Logger: {
    info: (...args: unknown[]) => mockLoggerInfo(...args),
    error: (...args: unknown[]) => mockLoggerError(...args),
    success: (...args: unknown[]) => mockLoggerSuccess(...args),
    debug: (...args: unknown[]) => mockLoggerDebug(...args),
    divider: (...args: unknown[]) => mockLoggerDivider(...args),
  },
}));

function createMockChildProcess(options: MockExecaProcessOptions = {}): MockChildProcess {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const result: ExecaResult = {
    stdout: options.result?.stdout ?? '',
    stderr: options.result?.stderr ?? '',
    exitCode: options.result?.exitCode ?? 0,
  };

  const promise = Promise.resolve().then(() => {
    for (const chunk of options.streamedStdout ?? []) {
      stdout.write(chunk);
    }

    for (const chunk of options.streamedStderr ?? []) {
      stderr.write(chunk);
    }

    stdout.end();
    stderr.end();

    return result;
  });

  return Object.assign(promise, { stdout, stderr });
}

describe('CompileCommandsGenerator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoggerInfo.mockClear();
    mockLoggerError.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('generates compile commands with default options', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));

      // Create compile_commands.json at engine path to simulate UBT output
      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      const result = await CompileCommandsGenerator.generate({
        project: project.projectDir,
        enginePath: engine.enginePath,
        silent: true,
      });

      expect(result).toBe(path.join(project.projectDir, '.vscode', 'compile_commands.json'));
      expect(mockExeca).toHaveBeenCalledTimes(1);
      expect(mockExeca.mock.calls[0][0]).toContain('UnrealBuildTool');
      expect(mockExeca.mock.calls[0][0]).toContain('-mode=GenerateClangDatabase');
      expect(mockExeca.mock.calls[0][0]).toContain(`-Project="${project.uprojectPath}"`);
    });
  });

  it('generates compile commands with custom target, config, and platform', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'CustomGame' });
      const engine = await createFakeEngine(rootDir);

      jest.spyOn(TargetResolver, 'resolveTargetName').mockResolvedValue('CustomGame');
      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));

      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
        target: 'Game',
        config: 'Shipping',
        platform: 'Linux',
        silent: true,
      });

      expect(mockExeca.mock.calls[0][0]).toContain('-Target="CustomGame Linux Shipping"');
    });
  });

  it('handles multiple targets separated by spaces', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'MultiTargetGame' });
      const engine = await createFakeEngine(rootDir);

      jest
        .spyOn(TargetResolver, 'resolveTargetName')
        .mockResolvedValue('MultiTargetGameEditor MultiTargetGame');
      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));

      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
        silent: true,
      });

      const command = mockExeca.mock.calls[0][0];
      expect(command).toContain('-Target="MultiTargetGameEditor Win64 Development"');
      expect(command).toContain('-Target="MultiTargetGame Win64 Development"');
    });
  });

  it('passes inclusion flags when specified', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'FlagGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));
      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
        includePluginSources: true,
        includeEngineSources: true,
        useEngineIncludes: true,
        silent: true,
      });

      const command = mockExeca.mock.calls[0][0];
      expect(command).toContain('-IncludePluginSources');
      expect(command).toContain('-IncludeEngineSources');
      expect(command).toContain('-UseEngineIncludes');
    });
  });

  it('does not pass inclusion flags when disabled', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'NoFlagGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));
      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
        includePluginSources: false,
        includeEngineSources: false,
        useEngineIncludes: false,
        silent: true,
      });

      const command = mockExeca.mock.calls[0][0];
      expect(command).not.toContain('-IncludePluginSources');
      expect(command).not.toContain('-IncludeEngineSources');
      expect(command).not.toContain('-UseEngineIncludes');
    });
  });

  it('throws error when project file does not exist', async () => {
    await withTempDir(async (rootDir) => {
      const engine = await createFakeEngine(rootDir);
      const nonExistentPath = path.join(rootDir, 'NonExistent', 'Game.uproject');

      jest.spyOn(ProjectPathResolver, 'resolveOrThrow').mockResolvedValue(nonExistentPath);

      await expect(
        CompileCommandsGenerator.generate({
          project: nonExistentPath,
          enginePath: engine.enginePath,
          silent: true,
        })
      ).rejects.toThrow('Project file not found');

      expect(mockExeca).not.toHaveBeenCalled();
    });
  });

  it('throws error when UnrealBuildTool is not found', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'MissingUBTGame' });
      const engine = await createFakeEngine(rootDir, { includeUnrealBuildTool: false });

      await expect(
        CompileCommandsGenerator.generate({
          project: project.uprojectPath,
          enginePath: engine.enginePath,
          silent: true,
        })
      ).rejects.toThrow('UnrealBuildTool not found');

      expect(mockExeca).not.toHaveBeenCalled();
    });
  });

  it('throws error when UBT exits with non-zero code', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'FailedGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(
        createMockChildProcess({
          result: {
            exitCode: 1,
            stderr: 'Compilation failed',
          },
        })
      );

      await expect(
        CompileCommandsGenerator.generate({
          project: project.uprojectPath,
          enginePath: engine.enginePath,
          silent: true,
        })
      ).rejects.toThrow('Generate compile commands failed with exit code 1');
    });
  });

  it('throws error when compile_commands.json is not generated', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'MissingOutputGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));

      // Don't create the compile_commands.json file

      await expect(
        CompileCommandsGenerator.generate({
          project: project.uprojectPath,
          enginePath: engine.enginePath,
          silent: true,
        })
      ).rejects.toThrow('compile_commands.json not found');
    });
  });

  it('uses fallback target name when TargetResolver returns undefined', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'FallbackGame' });
      const engine = await createFakeEngine(rootDir);

      jest.spyOn(TargetResolver, 'resolveTargetName').mockResolvedValue(undefined);
      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));
      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
        silent: true,
      });

      const command = mockExeca.mock.calls[0][0];
      expect(command).toContain('-Target="Editor Win64 Development"');
      expect(command).toContain('-Target="Game Win64 Development"');
    });
  });

  it('updates VSCode settings with clangd configuration', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'SettingsGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));
      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
        silent: true,
      });

      const settingsPath = path.join(project.projectDir, '.vscode', 'settings.json');
      expect(await fs.pathExists(settingsPath)).toBe(true);

      const settings = await fs.readJson(settingsPath);
      expect(settings['clangd.arguments']).toEqual([
        '--compile-commands-dir=${workspaceFolder}/.vscode',
      ]);
      expect(settings['C_Cpp.default.compileCommands']).toBe(
        '${workspaceFolder}/.vscode/compile_commands.json'
      );
    });
  });

  it('merges with existing VSCode settings instead of overwriting', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'MergeGame' });
      const engine = await createFakeEngine(rootDir);
      const vscodeDir = path.join(project.projectDir, '.vscode');
      const settingsPath = path.join(vscodeDir, 'settings.json');

      await fs.ensureDir(vscodeDir);
      await fs.writeJson(
        settingsPath,
        {
          'editor.tabSize': 2,
          'files.exclude': { '*.tmp': true },
        },
        { spaces: 2 }
      );

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));
      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
        silent: true,
      });

      const settings = await fs.readJson(settingsPath);
      expect(settings['editor.tabSize']).toBe(2);
      expect(settings['files.exclude']).toEqual({ '*.tmp': true });
      expect(settings['clangd.arguments']).toEqual([
        '--compile-commands-dir=${workspaceFolder}/.vscode',
      ]);
    });
  });

  it('handles malformed existing settings.json gracefully', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'MalformedGame' });
      const engine = await createFakeEngine(rootDir);
      const vscodeDir = path.join(project.projectDir, '.vscode');
      const settingsPath = path.join(vscodeDir, 'settings.json');

      await fs.ensureDir(vscodeDir);
      await fs.writeFile(settingsPath, 'not valid json {{{');

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));
      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
        silent: true,
      });

      const settings = await fs.readJson(settingsPath);
      expect(settings['clangd.arguments']).toEqual([
        '--compile-commands-dir=${workspaceFolder}/.vscode',
      ]);
    });
  });

  it('logs info messages when not in silent mode', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'VerboseGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));
      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
        silent: false,
      });

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.stringContaining('Generating compile commands')
      );
      expect(mockLoggerInfo).toHaveBeenCalledWith(expect.stringContaining(project.uprojectPath));
      expect(mockLoggerInfo).toHaveBeenCalledWith(expect.stringContaining(engine.enginePath));
      expect(mockLoggerDivider).toHaveBeenCalled();
    });
  });

  it('logs debug message with command when not in silent mode', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'DebugGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));
      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
        silent: false,
      });

      expect(mockLoggerDebug).toHaveBeenCalledWith(expect.stringContaining('Executing:'));
      expect(mockLoggerDebug).toHaveBeenCalledWith(expect.stringContaining('UnrealBuildTool'));
    });
  });

  it('logs success message when updating VSCode settings', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'SuccessGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));
      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
        silent: false,
      });

      expect(mockLoggerSuccess).toHaveBeenCalledWith(
        expect.stringContaining('Updated VSCode settings')
      );
    });
  });

  it('resolves engine path using EngineResolver when not provided', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'AutoEngineGame' });
      const engine = await createFakeEngine(rootDir);

      jest.spyOn(EngineResolver, 'resolveEnginePath').mockResolvedValue(engine.enginePath);
      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));
      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        silent: true,
      });

      expect(EngineResolver.resolveEnginePath).toHaveBeenCalledWith({
        projectPath: project.uprojectPath,
        enginePath: undefined,
      });
    });
  });

  it('streams stdout and stderr from the child process', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'StreamGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(
        createMockChildProcess({
          result: { exitCode: 0 },
          streamedStdout: ['Processing target\n', 'Done\n'],
          streamedStderr: ['Warning: something\n'],
        })
      );
      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
        silent: true,
      });

      // Wait for microtasks to complete
      await new Promise(process.nextTick);

      expect(mockLoggerInfo).toHaveBeenCalledWith('Processing target');
      expect(mockLoggerInfo).toHaveBeenCalledWith('Done');
      expect(mockLoggerError).toHaveBeenCalledWith('Warning: something');
    });
  });
});
