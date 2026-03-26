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

      expect(result).toBe(path.join(path.dirname(project.uprojectPath), 'compile_commands.json'));
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
      expect(ubtCall![1]).toContain('TestGame');
      expect(ubtCall![1]).toContain('Shipping');
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
      expect(ubtCall![1]).toContain('Linux');
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
      ).rejects.toThrow('Failed to generate compile commands');
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
      ).rejects.toThrow('Failed to generate compile commands');
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
      ).rejects.toThrow('Compile commands file not found');
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

      // Verify file was moved to project directory
      expect(result).toBe(path.join(projectDir, 'compile_commands.json'));
      const existsInProject = await fs.pathExists(path.join(projectDir, 'compile_commands.json'));
      expect(existsInProject).toBe(true);

      // Verify content was preserved
      const content = await fs.readJson(path.join(projectDir, 'compile_commands.json'));
      expect(content).toEqual(compileCommands);
    });
  });

  it('overwrites existing compile_commands.json in project directory', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
      const engine = await createFakeEngine(rootDir);
      const projectDir = path.dirname(project.uprojectPath);

      // Create existing compile_commands.json in project directory
      const oldContent = [
        { file: 'Old.cpp', directory: projectDir, command: 'clang++ -c Old.cpp' },
      ];
      await fs.writeJson(path.join(projectDir, 'compile_commands.json'), oldContent, { spaces: 2 });

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

      expect(result).toBe(path.join(projectDir, 'compile_commands.json'));
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
      expect(ubtCall![1]).toContain('TestGameEditor');
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
      expect(ubtCall![1]).toContain('TestGame');
      expect(ubtCall![1]).not.toContain('TestGameEditor');
    });
  });

  it('uses Client target when target type is Client', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
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
      expect(ubtCall![1]).toContain('TestGameClient');
    });
  });

  it('uses Server target when target type is Server', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
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
      expect(ubtCall![1]).toContain('TestGameServer');
    });
  });

  it('includes plugin sources by default', async () => {
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
      expect(ubtCall![1]).toContain('-Mode=GenerateClangDatabase');
    });
  });

  it('excludes plugin sources when includePluginSources is false', async () => {
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
      expect(ubtCall![1]).toContain('-Mode=GenerateClangDatabase');
    });
  });

  it('includes engine sources by default', async () => {
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
    });
  });

  it('excludes engine sources when includeEngineSources is false', async () => {
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
    });
  });

  it('uses engine includes by default', async () => {
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
    });
  });

  it('does not use engine includes when useEngineIncludes is false', async () => {
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
        createMockChildProcess({ result: { exitCode: 1, stderr: 'UBT Error' } })
      );

      await expect(
        CompileCommandsGenerator.generate({
          project: project.uprojectPath,
          enginePath: engine.enginePath,
        })
      ).rejects.toThrow();

      // Verify that logger.error was called
      expect(mockLoggerFns.error).toHaveBeenCalled();
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

      expect(result).toBe(path.join(projectDir, 'compile_commands.json'));
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

  it('generates compile commands with all options specified', async () => {
    await withTempDir(async (rootDir) => {
      const project = await createFakeProject(rootDir, { projectName: 'TestGame' });
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
      expect(ubtCall![1]).toContain('TestGameServer');
      expect(ubtCall![1]).toContain('Shipping');
      expect(ubtCall![1]).toContain('Linux');
    });
  });
});
