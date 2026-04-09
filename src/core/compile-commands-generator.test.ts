import path from 'path';
import { PassThrough } from 'stream';
import fs from 'fs-extra';

interface ExecaOptions {
  stdio: 'pipe';
  cwd: string;
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

const mockExeca = jest.fn<MockChildProcess, [string, string[], ExecaOptions]>();

jest.mock('execa', () => ({
  execa: (...args: [string, string[], ExecaOptions]) => mockExeca(...args),
}));

// Mock functions for Logger - defined before doMock
const mockLoggerFns = {
  info: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  debug: jest.fn(),
  divider: jest.fn(),
};

// Use doMock (not hoisted) to avoid initialization order issues
jest.doMock('../utils/logger', () => {
  // Mock class constructor that returns an instance with the mocked methods
  const MockLogger = jest
    .fn()
    .mockImplementation(() => mockLoggerFns) as unknown as typeof import('../utils/logger').Logger;

  // Add static methods to the mock class
  (MockLogger as unknown as Record<string, jest.Mock>).info = mockLoggerFns.info;
  (MockLogger as unknown as Record<string, jest.Mock>).error = mockLoggerFns.error;
  (MockLogger as unknown as Record<string, jest.Mock>).success = mockLoggerFns.success;
  (MockLogger as unknown as Record<string, jest.Mock>).debug = mockLoggerFns.debug;
  (MockLogger as unknown as Record<string, jest.Mock>).divider = mockLoggerFns.divider;

  return { Logger: MockLogger };
});

// Import modules AFTER mocking
import { CompileCommandsGenerator } from './compile-commands-generator';
import type { TargetResolver as TargetResolverType } from './target-resolver';
const TargetResolver = jest.requireActual('./target-resolver')
  .TargetResolver as typeof TargetResolverType;
import { createFakeEngine, createFakeProject, withTempDir } from '../test-utils';

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
    mockLoggerFns.info.mockClear();
    mockLoggerFns.error.mockClear();
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
        project: project.uprojectPath,
        enginePath: engine.enginePath,
      });

      expect(result).toBe(
        path.join(path.dirname(project.uprojectPath), '.vscode', 'compile_commands.json')
      );
      expect(mockExeca).toHaveBeenCalled();
    });
  });

  it('generates compile commands with custom target and config', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));

      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
        target: 'Game',
        config: 'Shipping',
      });

      const execaCalls = mockExeca.mock.calls;
      expect(execaCalls.length).toBeGreaterThan(0);

      const ubtCall = execaCalls.find((call) => call[0].includes('UnrealBuildTool'));
      expect(ubtCall).toBeDefined();
      expect(ubtCall![1]).toEqual(expect.arrayContaining([expect.stringContaining('TestGame')]));
      expect(ubtCall![1]).toEqual(expect.arrayContaining([expect.stringContaining('Shipping')]));
    });
  });

  it('generates compile commands with custom platform', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));

      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
        platform: 'Linux',
      });

      const ubtCall = mockExeca.mock.calls.find((call) => call[0].includes('UnrealBuildTool'));
      expect(ubtCall).toBeDefined();
      expect(ubtCall![1]).toEqual(expect.arrayContaining([expect.stringContaining('Linux')]));
    });
  });

  it('throws error when project file not found', async () => {
    await withTempDir(async (rootDir) => {
      const engine = await createFakeEngine(rootDir);

      await expect(
        CompileCommandsGenerator.generate({
          project: path.join(rootDir, 'NonExistent', 'TestGame.uproject'),
          enginePath: engine.enginePath,
        })
      ).rejects.toThrow('Project file not found');
    });
  });

  it('throws error when UBT execution fails', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(
        createMockChildProcess({ result: { exitCode: 1, stderr: 'UBT failed' } })
      );

      await expect(
        CompileCommandsGenerator.generate({
          project: project.uprojectPath,
          enginePath: engine.enginePath,
        })
      ).rejects.toThrow('Generate compile commands failed');
    });
  });

  it('throws error when UBT executable not found', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });

      // Create engine directory without UBT
      const enginePath = path.join(rootDir, 'UE_5.3');
      await fs.ensureDir(path.join(enginePath, 'Engine', 'Build'));

      await expect(
        CompileCommandsGenerator.generate({
          project: project.uprojectPath,
          enginePath: enginePath,
        })
      ).rejects.toThrow('UnrealBuildTool not found');
    });
  });

  it('throws error when engine path resolution fails', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, {
        projectName: 'TestGame',
        engineAssociation: '5.99.99',
      });

      await expect(
        CompileCommandsGenerator.generate({
          project: project.uprojectPath,
        })
      ).rejects.toThrow();
    });
  });

  it('handles UBT process error', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockRejectedValueOnce(new Error('Process spawn failed'));

      await expect(
        CompileCommandsGenerator.generate({
          project: project.uprojectPath,
          enginePath: engine.enginePath,
        })
      ).rejects.toThrow('Process spawn failed');
    });
  });

  it('handles compile_commands.json not found after generation', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));

      // Don't create compile_commands.json to simulate missing file

      await expect(
        CompileCommandsGenerator.generate({
          project: project.uprojectPath,
          enginePath: engine.enginePath,
        })
      ).rejects.toThrow('compile_commands.json not found');
    });
  });

  it('moves compile_commands.json from engine to project directory', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
      const engine = await createFakeEngine(rootDir);
      const projectDir = path.dirname(project.uprojectPath);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));

      // Create compile_commands.json at engine path (UBT default location)
      const compileCommands = [
        {
          file: 'TestGame.cpp',
          directory: projectDir,
          command: 'clang++ -c TestGame.cpp',
        },
      ];
      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), compileCommands, {
        spaces: 2,
      });

      const result = await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
      });

      // Verify file was moved to project .vscode directory
      expect(result).toBe(path.join(projectDir, '.vscode', 'compile_commands.json'));
      const existsInProject = await fs.pathExists(
        path.join(projectDir, '.vscode', 'compile_commands.json')
      );
      expect(existsInProject).toBe(true);

      // Verify content was preserved
      const content = await fs.readJson(path.join(projectDir, '.vscode', 'compile_commands.json'));
      expect(content).toEqual(compileCommands);
    });
  });

  it('overwrites existing compile_commands.json in project directory', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
      const engine = await createFakeEngine(rootDir);
      const projectDir = path.dirname(project.uprojectPath);

      // Create existing compile_commands.json in project .vscode directory
      const vscodeDir = path.join(projectDir, '.vscode');
      await fs.ensureDir(vscodeDir);
      const oldContent = [
        { file: 'Old.cpp', directory: projectDir, command: 'clang++ -c Old.cpp' },
      ];
      await fs.writeJson(path.join(vscodeDir, 'compile_commands.json'), oldContent, { spaces: 2 });

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));

      // Create new compile_commands.json at engine path
      const newContent = [
        { file: 'TestGame.cpp', directory: projectDir, command: 'clang++ -c TestGame.cpp' },
      ];
      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), newContent, {
        spaces: 2,
      });

      const result = await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
      });

      expect(result).toBe(path.join(projectDir, '.vscode', 'compile_commands.json'));
      const content = await fs.readJson(result);
      expect(content).toEqual(newContent);
    });
  });

  it('uses Editor target when target type is Editor', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));

      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
        target: 'Editor',
      });

      const ubtCall = mockExeca.mock.calls.find((call) => call[0].includes('UnrealBuildTool'));
      expect(ubtCall).toBeDefined();
      expect(ubtCall![1]).toEqual(
        expect.arrayContaining([expect.stringContaining('TestGameEditor')])
      );
    });
  });

  it('uses Game target when target type is Game', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));

      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
        target: 'Game',
      });

      const ubtCall = mockExeca.mock.calls.find((call) => call[0].includes('UnrealBuildTool'));
      expect(ubtCall).toBeDefined();
      expect(ubtCall![1]).toEqual(expect.arrayContaining([expect.stringContaining('TestGame')]));
      expect(ubtCall![1]).not.toEqual(
        expect.arrayContaining([expect.stringContaining('TestGameEditor')])
      );
    });
  });

  it('uses Client target when target type is Client', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, {
        projectName: 'TestGame',
        targets: [
          { name: 'TestGameEditor', type: 'Editor' },
          { name: 'TestGame', type: 'Game' },
          { name: 'TestGameClient', type: 'Client' },
        ],
      });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));

      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
        target: 'Client',
      });

      const ubtCall = mockExeca.mock.calls.find((call) => call[0].includes('UnrealBuildTool'));
      expect(ubtCall).toBeDefined();
      expect(ubtCall![1]).toEqual(
        expect.arrayContaining([expect.stringContaining('TestGameClient')])
      );
    });
  });

  it('uses Server target when target type is Server', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, {
        projectName: 'TestGame',
        targets: [
          { name: 'TestGameEditor', type: 'Editor' },
          { name: 'TestGame', type: 'Game' },
          { name: 'TestGameServer', type: 'Server' },
        ],
      });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));

      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
        target: 'Server',
      });

      const ubtCall = mockExeca.mock.calls.find((call) => call[0].includes('UnrealBuildTool'));
      expect(ubtCall).toBeDefined();
      expect(ubtCall![1]).toEqual(
        expect.arrayContaining([expect.stringContaining('TestGameServer')])
      );
    });
  });

  it('does not include -IncludePluginSources flag by default', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));

      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
      });

      const ubtCall = mockExeca.mock.calls.find((call) => call[0].includes('UnrealBuildTool'));
      expect(ubtCall).toBeDefined();
      expect(ubtCall![1]).not.toContain('-IncludePluginSources');
    });
  });

  it('includes -IncludePluginSources flag when includePluginSources is true', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));

      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
        includePluginSources: true,
      });

      const ubtCall = mockExeca.mock.calls.find((call) => call[0].includes('UnrealBuildTool'));
      expect(ubtCall).toBeDefined();
      expect(ubtCall![1]).toContain('-IncludePluginSources');
    });
  });

  it('does not include -IncludePluginSources flag when includePluginSources is false', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));

      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
        includePluginSources: false,
      });

      const ubtCall = mockExeca.mock.calls.find((call) => call[0].includes('UnrealBuildTool'));
      expect(ubtCall).toBeDefined();
      expect(ubtCall![1]).not.toContain('-IncludePluginSources');
    });
  });

  it('does not include -IncludeEngineSources flag by default', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));

      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
      });

      const ubtCall = mockExeca.mock.calls.find((call) => call[0].includes('UnrealBuildTool'));
      expect(ubtCall).toBeDefined();
      expect(ubtCall![1]).not.toContain('-IncludeEngineSources');
    });
  });

  it('includes -IncludeEngineSources flag when includeEngineSources is true', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));

      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
        includeEngineSources: true,
      });

      const ubtCall = mockExeca.mock.calls.find((call) => call[0].includes('UnrealBuildTool'));
      expect(ubtCall).toBeDefined();
      expect(ubtCall![1]).toContain('-IncludeEngineSources');
    });
  });

  it('does not include -IncludeEngineSources flag when includeEngineSources is false', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));

      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
        includeEngineSources: false,
      });

      const ubtCall = mockExeca.mock.calls.find((call) => call[0].includes('UnrealBuildTool'));
      expect(ubtCall).toBeDefined();
      expect(ubtCall![1]).not.toContain('-IncludeEngineSources');
    });
  });

  it('does not include -UseEngineIncludes flag by default', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));

      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
      });

      const ubtCall = mockExeca.mock.calls.find((call) => call[0].includes('UnrealBuildTool'));
      expect(ubtCall).toBeDefined();
      expect(ubtCall![1]).not.toContain('-UseEngineIncludes');
    });
  });

  it('includes -UseEngineIncludes flag when useEngineIncludes is true', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));

      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
        useEngineIncludes: true,
      });

      const ubtCall = mockExeca.mock.calls.find((call) => call[0].includes('UnrealBuildTool'));
      expect(ubtCall).toBeDefined();
      expect(ubtCall![1]).toContain('-UseEngineIncludes');
    });
  });

  it('does not include -UseEngineIncludes flag when useEngineIncludes is false', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));

      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
        useEngineIncludes: false,
      });

      const ubtCall = mockExeca.mock.calls.find((call) => call[0].includes('UnrealBuildTool'));
      expect(ubtCall).toBeDefined();
      expect(ubtCall![1]).not.toContain('-UseEngineIncludes');
    });
  });

  it('logs progress messages during generation', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));

      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
      });

      // Verify that logger.info was called
      expect(mockLoggerFns.info).toHaveBeenCalled();
    });
  });

  it('logs error messages on failure', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(
        createMockChildProcess({ result: { exitCode: 1 }, streamedStderr: ['UBT Error'] })
      );

      await expect(
        CompileCommandsGenerator.generate({
          project: project.uprojectPath,
          enginePath: engine.enginePath,
        })
      ).rejects.toThrow('Generate compile commands failed');
    });
  });

  it('does not log when silent mode is enabled', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));

      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
        silent: true,
      });

      // Silent mode should still instantiate logger but won't output
      expect(mockExeca).toHaveBeenCalled();
    });
  });

  it('streams stdout and stderr from the child process', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(
        createMockChildProcess({
          result: { exitCode: 0 },
          streamedStdout: ['Building TestGame...\n', 'Completed\n'],
          streamedStderr: ['Warning: deprecated\n'],
        })
      );

      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
      });

      expect(mockExeca).toHaveBeenCalled();
    });
  });

  it('handles project path resolution', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));

      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      // Test with directory path instead of .uproject file
      const projectDir = path.dirname(project.uprojectPath);
      const result = await CompileCommandsGenerator.generate({
        project: projectDir,
        enginePath: engine.enginePath,
      });

      expect(result).toBe(path.join(projectDir, '.vscode', 'compile_commands.json'));
    });
  });

  it('handles TargetResolver errors gracefully', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
      const engine = await createFakeEngine(rootDir);

      // Create a broken project structure that will cause TargetResolver to fail
      jest
        .spyOn(TargetResolver, 'resolveTargetName')
        .mockRejectedValueOnce(new Error('Target resolution failed'));

      await expect(
        CompileCommandsGenerator.generate({
          project: project.uprojectPath,
          enginePath: engine.enginePath,
        })
      ).rejects.toThrow('Target resolution failed');
    });
  });

  it('falls back to original target when TargetResolver returns undefined', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));

      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      // Simulate TargetResolver returning undefined (no targets found)
      jest
        .spyOn(TargetResolver, 'resolveTargetName')
        .mockResolvedValueOnce(undefined as unknown as string);

      const result = await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
      });

      expect(result).toBeDefined();

      // Should fall back to the original target ('Editor' by default)
      const ubtCall = mockExeca.mock.calls.find((call) => call[0].includes('UnrealBuildTool'));
      expect(ubtCall).toBeDefined();
      expect(ubtCall![1]).toEqual(expect.arrayContaining([expect.stringContaining('Editor')]));
    });
  });

  it('merges VSCode settings with existing valid settings.json', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
      const engine = await createFakeEngine(rootDir);
      const projectDir = path.dirname(project.uprojectPath);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));

      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      // Create existing .vscode/settings.json with custom settings
      const vscodeDir = path.join(projectDir, '.vscode');
      await fs.ensureDir(vscodeDir);
      const existingSettings = {
        'editor.fontSize': 14,
        'workbench.colorTheme': 'Dark+',
      };
      await fs.writeJson(path.join(vscodeDir, 'settings.json'), existingSettings, { spaces: 2 });

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
      });

      // Verify settings were merged, not replaced
      const mergedSettings = await fs.readJson(path.join(vscodeDir, 'settings.json'));
      expect(mergedSettings['editor.fontSize']).toBe(14);
      expect(mergedSettings['workbench.colorTheme']).toBe('Dark+');
      expect(mergedSettings['clangd.arguments']).toBeDefined();
      expect(mergedSettings['C_Cpp.default.compileCommands']).toBeDefined();
    });
  });

  it('replaces VSCode settings when existing settings.json is malformed', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
      const engine = await createFakeEngine(rootDir);
      const projectDir = path.dirname(project.uprojectPath);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));

      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      // Create existing .vscode/settings.json with invalid JSON
      const vscodeDir = path.join(projectDir, '.vscode');
      await fs.ensureDir(vscodeDir);
      await fs.writeFile(path.join(vscodeDir, 'settings.json'), '{ invalid json !!!');

      await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
      });

      // Should start fresh with only clangd/cpp settings
      const newSettings = await fs.readJson(path.join(vscodeDir, 'settings.json'));
      expect(newSettings['clangd.arguments']).toBeDefined();
      expect(newSettings['C_Cpp.default.compileCommands']).toBeDefined();
      // Should not have any remnants of the malformed settings
      expect(Object.keys(newSettings).length).toBe(3);
    });
  });

  it('resolves project from current working directory when project option is omitted', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
      const engine = await createFakeEngine(rootDir);
      const projectDir = path.dirname(project.uprojectPath);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));
      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(projectDir);
      try {
        const result = await CompileCommandsGenerator.generate({
          enginePath: engine.enginePath,
        });
        expect(result).toBe(path.join(projectDir, '.vscode', 'compile_commands.json'));
      } finally {
        cwdSpy.mockRestore();
      }
    });
  });

  it('handles null result from UBT process', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
      const engine = await createFakeEngine(rootDir);

      const stdout = new PassThrough();
      const stderr = new PassThrough();
      stdout.end();
      stderr.end();
      const nullChildProcess = Object.assign(Promise.resolve(null), { stdout, stderr });
      mockExeca.mockReturnValueOnce(nullChildProcess as unknown as MockChildProcess);

      await expect(
        CompileCommandsGenerator.generate({
          project: project.uprojectPath,
          enginePath: engine.enginePath,
        })
      ).rejects.toThrow('Generate compile commands failed with exit code unknown');
    });
  });

  it('generates compile commands with all options specified', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, {
        projectName: 'TestGame',
        targets: [
          { name: 'TestGameEditor', type: 'Editor' },
          { name: 'TestGame', type: 'Game' },
          { name: 'TestGameServer', type: 'Server' },
        ],
      });
      const engine = await createFakeEngine(rootDir);

      mockExeca.mockReturnValueOnce(createMockChildProcess({ result: { exitCode: 0 } }));

      await fs.writeJson(path.join(engine.enginePath, 'compile_commands.json'), [], { spaces: 2 });

      const result = await CompileCommandsGenerator.generate({
        project: project.uprojectPath,
        enginePath: engine.enginePath,
        target: 'Server',
        config: 'Shipping',
        platform: 'Linux',
        includePluginSources: true,
        includeEngineSources: true,
        useEngineIncludes: true,
        silent: false,
      });

      expect(result).toBeDefined();

      const ubtCall = mockExeca.mock.calls.find((call) => call[0].includes('UnrealBuildTool'));
      expect(ubtCall).toBeDefined();
      expect(ubtCall![1]).toEqual(
        expect.arrayContaining([expect.stringContaining('TestGameServer')])
      );
      expect(ubtCall![1]).toEqual(expect.arrayContaining([expect.stringContaining('Shipping')]));
      expect(ubtCall![1]).toEqual(expect.arrayContaining([expect.stringContaining('Linux')]));
    });
  }, 15000);
});
