import { createFakeExecaChild } from './execa-child';

describe('createFakeExecaChild', () => {
  describe('basic execution', () => {
    it('returns a promise-like object', async () => {
      const child = createFakeExecaChild();
      expect(child).toHaveProperty('then');
      expect(typeof child.then).toBe('function');
    });

    it('resolves with default result', async () => {
      const child = createFakeExecaChild();
      const result = await child;

      expect(result).toEqual({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });
    });

    it('resolves with custom result', async () => {
      const child = createFakeExecaChild({
        stdout: 'output',
        stderr: 'error',
        exitCode: 1,
      });
      const result = await child;

      expect(result).toEqual({
        stdout: 'output',
        stderr: 'error',
        exitCode: 1,
      });
    });
  });

  describe('streams', () => {
    it('has stdout stream', () => {
      const child = createFakeExecaChild();
      expect(child.stdout).toBeDefined();
      expect(child.stdout).not.toBeNull();
    });

    it('has stderr stream', () => {
      const child = createFakeExecaChild();
      expect(child.stderr).toBeDefined();
      expect(child.stderr).not.toBeNull();
    });

    it('emits data on stdout when emitStdout is provided', (done) => {
      const child = createFakeExecaChild({}, { emitStdout: 'test data' });

      child.stdout.on('data', (data: Buffer) => {
        expect(data.toString()).toBe('test data');
        done();
      });
    });

    it('emits data on stderr when emitStderr is provided', (done) => {
      const child = createFakeExecaChild({}, { emitStderr: 'error data' });

      child.stderr.on('data', (data: Buffer) => {
        expect(data.toString()).toBe('error data');
        done();
      });
    });

    it('emits data on both streams', (done) => {
      const stdoutData: string[] = [];
      const stderrData: string[] = [];

      const child = createFakeExecaChild(
        {},
        { emitStdout: 'stdout content', emitStderr: 'stderr content' }
      );

      child.stdout.on('data', (data: Buffer) => {
        stdoutData.push(data.toString());
      });

      child.stderr.on('data', (data: Buffer) => {
        stderrData.push(data.toString());
      });

      setTimeout(() => {
        expect(stdoutData).toContain('stdout content');
        expect(stderrData).toContain('stderr content');
        done();
      }, 10);
    });
  });

  describe('exit event', () => {
    it('emits exit event with exit code', (done) => {
      const child = createFakeExecaChild({ exitCode: 42 });

      child.on('exit', (code: number) => {
        expect(code).toBe(42);
        done();
      });
    });

    it('emits exit event with default code 0', (done) => {
      const child = createFakeExecaChild();

      child.on('exit', (code: number) => {
        expect(code).toBe(0);
        done();
      });
    });

    it('does not emit exit event when rejected', (done) => {
      const exitHandler = jest.fn();
      const child = createFakeExecaChild({}, { rejectWith: new Error('fail') });

      child.on('exit', exitHandler);

      child.catch(() => {
        setTimeout(() => {
          expect(exitHandler).not.toHaveBeenCalled();
          done();
        }, 10);
      });
    });
  });

  describe('unref', () => {
    it('has unref method', () => {
      const child = createFakeExecaChild();
      expect(typeof child.unref).toBe('function');
    });

    it('unref does not throw', () => {
      const child = createFakeExecaChild();
      expect(() => child.unref()).not.toThrow();
    });
  });

  describe('rejection', () => {
    it('rejects when rejectWith is provided', async () => {
      const error = new Error('Command failed');
      const child = createFakeExecaChild({}, { rejectWith: error });

      await expect(child).rejects.toThrow('Command failed');
    });

    it('rejects with custom error', async () => {
      const customError = new Error('Custom error message');
      const child = createFakeExecaChild({ stdout: 'data' }, { rejectWith: customError });

      await expect(child).rejects.toBe(customError);
    });
  });

  describe('emitted data in result', () => {
    it('includes emitted stdout in result', async () => {
      const child = createFakeExecaChild({}, { emitStdout: 'emitted output' });
      const result = await child;

      expect(result.stdout).toBe('emitted output');
    });

    it('includes emitted stderr in result', async () => {
      const child = createFakeExecaChild({}, { emitStderr: 'emitted error' });
      const result = await child;

      expect(result.stderr).toBe('emitted error');
    });

    it('prefers explicit result over emitted data', async () => {
      const child = createFakeExecaChild(
        { stdout: 'explicit', stderr: 'explicit err' },
        { emitStdout: 'emitted', emitStderr: 'emitted err' }
      );
      const result = await child;

      expect(result.stdout).toBe('explicit');
      expect(result.stderr).toBe('explicit err');
    });
  });

  describe('stream completion', () => {
    it('ends stdout stream after emitting data', (done) => {
      const child = createFakeExecaChild({}, { emitStdout: 'data' });

      // Consume the stream data to ensure 'end' event fires
      child.stdout.on('data', () => {});
      child.stdout.on('end', () => {
        done();
      });
    });

    it('ends stderr stream after emitting data', (done) => {
      const child = createFakeExecaChild({}, { emitStderr: 'data' });

      // Consume the stream data to ensure 'end' event fires
      child.stderr.on('data', () => {});
      child.stderr.on('end', () => {
        done();
      });
    });
  });

  describe('chaining', () => {
    it('returns same child from on() for method chaining', () => {
      const child = createFakeExecaChild();
      const returned = child.on('exit', () => {});

      expect(returned).toBe(child);
    });
  });
});
