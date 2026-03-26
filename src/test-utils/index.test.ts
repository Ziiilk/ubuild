import type {
  OutputCapture,
  FakeExecaResult,
  FakeExecaOptions,
  FakeExecaChild,
  TempDirHandle,
  CreateFakeProjectOptions,
  CreateFakeEngineOptions,
  FakeProjectFixture,
  FakeEngineFixture,
  FakeProjectModule,
  FakeProjectTarget,
} from './index';
import {
  CapturedWritable,
  createOutputCapture,
  createFakeExecaChild,
  createTempDir,
  withTempDir,
  createFakeProject,
  createFakeEngine,
} from './index';

describe('test-utils exports', () => {
  describe('capture-stream exports', () => {
    it('exports CapturedWritable class', () => {
      expect(CapturedWritable).toBeDefined();
      expect(typeof CapturedWritable).toBe('function');
    });

    it('exports createOutputCapture function', () => {
      expect(createOutputCapture).toBeDefined();
      expect(typeof createOutputCapture).toBe('function');
    });

    it('createOutputCapture returns OutputCapture interface', () => {
      const capture: OutputCapture = createOutputCapture();

      expect(capture.stdout).toBeDefined();
      expect(capture.stderr).toBeDefined();
      expect(typeof capture.clear).toBe('function');
      expect(typeof capture.getStdout).toBe('function');
      expect(typeof capture.getStderr).toBe('function');
      expect(typeof capture.getCombined).toBe('function');
    });

    it('CapturedWritable works as expected', () => {
      const captured = new CapturedWritable();

      expect(captured.columns).toBe(80);
      expect(captured.output).toBe('');

      captured.write('test data');
      expect(captured.output).toBe('test data');

      captured.clear();
      expect(captured.output).toBe('');
    });
  });

  describe('execa-child exports', () => {
    it('exports createFakeExecaChild function', () => {
      expect(createFakeExecaChild).toBeDefined();
      expect(typeof createFakeExecaChild).toBe('function');
    });

    it('createFakeExecaChild returns FakeExecaChild interface', async () => {
      const child: FakeExecaChild = createFakeExecaChild({ stdout: 'test', exitCode: 0 });

      expect(child.stdout).toBeDefined();
      expect(child.stderr).toBeDefined();
      expect(typeof child.on).toBe('function');
      expect(typeof child.unref).toBe('function');
      expect(typeof child.then).toBe('function');

      const result: FakeExecaResult = await child;
      expect(result.stdout).toBe('test');
      expect(result.exitCode).toBe(0);
    });

    it('createFakeExecaChild supports FakeExecaOptions', async () => {
      const options: FakeExecaOptions = { rejectWith: new Error('test error') };
      const child = createFakeExecaChild({}, options);

      await expect(child).rejects.toThrow('test error');
    });
  });

  describe('temp-dir exports', () => {
    it('exports createTempDir function', () => {
      expect(createTempDir).toBeDefined();
      expect(typeof createTempDir).toBe('function');
    });

    it('exports withTempDir function', () => {
      expect(withTempDir).toBeDefined();
      expect(typeof withTempDir).toBe('function');
    });

    it('createTempDir returns TempDirHandle interface', async () => {
      const tempDir: TempDirHandle = await createTempDir();

      expect(tempDir.path).toBeDefined();
      expect(typeof tempDir.path).toBe('string');
      expect(typeof tempDir.cleanup).toBe('function');

      await tempDir.cleanup();
    });

    it('withTempDir works correctly', async () => {
      const result = await withTempDir(async (tempDirPath) => {
        expect(typeof tempDirPath).toBe('string');
        return 'success';
      });

      expect(result).toBe('success');
    });
  });

  describe('unreal-fixtures exports', () => {
    it('exports createFakeProject function', () => {
      expect(createFakeProject).toBeDefined();
      expect(typeof createFakeProject).toBe('function');
    });

    it('exports createFakeEngine function', () => {
      expect(createFakeEngine).toBeDefined();
      expect(typeof createFakeEngine).toBe('function');
    });

    it('createFakeProject supports CreateFakeProjectOptions', async () => {
      const tempDir = await createTempDir();

      try {
        const options: CreateFakeProjectOptions = {
          projectName: 'TestGame',
          modules: [{ name: 'TestGame', type: 'Runtime' } as FakeProjectModule],
          targets: [{ name: 'TestGameEditor', type: 'Editor' } as FakeProjectTarget],
        };

        const project: FakeProjectFixture = await createFakeProject(tempDir.path, options);

        expect(project.projectDir).toBeDefined();
        expect(project.projectName).toBe('TestGame');
        expect(project.sourceDir).toBeDefined();
        expect(project.uproject).toBeDefined();
        expect(project.uprojectPath).toBeDefined();
        expect(Array.isArray(project.targetPaths)).toBe(true);
        expect(Array.isArray(project.modulePaths)).toBe(true);
      } finally {
        await tempDir.cleanup();
      }
    });

    it('createFakeEngine supports CreateFakeEngineOptions', async () => {
      const tempDir = await createTempDir();

      try {
        const options: CreateFakeEngineOptions = {
          versionInfo: { MajorVersion: 5, MinorVersion: 3 },
        };

        const engine: FakeEngineFixture = await createFakeEngine(tempDir.path, options);

        expect(engine.enginePath).toBeDefined();
        expect(engine.buildBatPath).toBeDefined();
        expect(engine.unrealBuildToolPath).toBeDefined();
        expect(engine.editorExecutablePath).toBeDefined();
        expect(engine.buildVersionPath).toBeDefined();
        expect(engine.editorVersionPath).toBeDefined();
        expect(engine.installation).toBeDefined();
        expect(engine.versionInfo).toBeDefined();
      } finally {
        await tempDir.cleanup();
      }
    });
  });
});
