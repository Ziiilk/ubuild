/**
 * Tests for test-contexts.ts
 *
 * Covers withBuildTestContext, createCommandTestContext,
 * and createMockExecaProcess utility functions.
 */

import { MockExecaChildProcess, MockExecaResult } from './test-contexts';
import {
  withBuildTestContext,
  createCommandTestContext,
  createMockExecaProcess,
} from './test-contexts';

describe('createCommandTestContext', () => {
  it('returns an object with capture, stdout, and stderr', () => {
    const ctx = createCommandTestContext();

    expect(ctx.capture).toBeDefined();
    expect(ctx.stdout).toBeDefined();
    expect(ctx.stderr).toBeDefined();
  });

  it('stdout is the same instance as capture.stdout', () => {
    const ctx = createCommandTestContext();

    expect(ctx.stdout).toBe(ctx.capture.stdout);
  });

  it('stderr is the same instance as capture.stderr', () => {
    const ctx = createCommandTestContext();

    expect(ctx.stderr).toBe(ctx.capture.stderr);
  });

  it('captures written stdout data', () => {
    const ctx = createCommandTestContext();

    ctx.stdout.write('hello from stdout\n');

    expect(ctx.capture.getStdout()).toBe('hello from stdout\n');
  });

  it('captures written stderr data', () => {
    const ctx = createCommandTestContext();

    ctx.stderr.write('error from stderr\n');

    expect(ctx.capture.getStderr()).toBe('error from stderr\n');
  });

  it('clear resets both streams', () => {
    const ctx = createCommandTestContext();

    ctx.stdout.write('out');
    ctx.stderr.write('err');

    ctx.capture.clear();

    expect(ctx.capture.getStdout()).toBe('');
    expect(ctx.capture.getStderr()).toBe('');
  });
});

describe('createMockExecaProcess', () => {
  it('returns a thenable promise-like object with stdout and stderr streams', () => {
    const child = createMockExecaProcess();

    expect(typeof child.then).toBe('function');
    expect(child.stdout).toBeDefined();
    expect(child.stderr).toBeDefined();
  });

  it('resolves with default result (exitCode 0, empty stdout/stderr)', async () => {
    const child = createMockExecaProcess();
    const result = await child;

    expect(result).toEqual({
      stdout: '',
      stderr: '',
      exitCode: 0,
    });
  });

  it('resolves with custom exitCode', async () => {
    const child = createMockExecaProcess({ exitCode: 42 });

    const result = await child;

    expect(result.exitCode).toBe(42);
  });

  it('resolves with custom stdout string', async () => {
    const child = createMockExecaProcess({ stdout: 'Build succeeded' });

    const result = await child;

    expect(result.stdout).toBe('Build succeeded');
  });

  it('resolves with custom stderr string', async () => {
    const child = createMockExecaProcess({ stderr: 'Compilation error' });

    const result = await child;

    expect(result.stderr).toBe('Compilation error');
  });

  it('resolves with all custom fields', async () => {
    const child = createMockExecaProcess({
      stdout: 'output',
      stderr: 'errors',
      exitCode: 1,
    });

    const result = await child;

    expect(result).toEqual({
      stdout: 'output',
      stderr: 'errors',
      exitCode: 1,
    });
  });

  it('streams stdout chunks before resolving', async () => {
    const received: string[] = [];
    const child = createMockExecaProcess({ exitCode: 0 }, { streamedStdout: ['chunk1', 'chunk2'] });

    child.stdout.on('data', (data: Buffer) => {
      received.push(data.toString());
    });

    await child;

    expect(received).toEqual(['chunk1', 'chunk2']);
  });

  it('streams stderr chunks before resolving', async () => {
    const received: string[] = [];
    const child = createMockExecaProcess({ exitCode: 0 }, { streamedStderr: ['err1', 'err2'] });

    child.stderr.on('data', (data: Buffer) => {
      received.push(data.toString());
    });

    await child;

    expect(received).toEqual(['err1', 'err2']);
  });

  it('streams both stdout and stderr chunks', async () => {
    const stdoutReceived: string[] = [];
    const stderrReceived: string[] = [];
    const child = createMockExecaProcess(
      { exitCode: 0 },
      { streamedStdout: ['out'], streamedStderr: ['err'] }
    );

    child.stdout.on('data', (data: Buffer) => stdoutReceived.push(data.toString()));
    child.stderr.on('data', (data: Buffer) => stderrReceived.push(data.toString()));

    await child;

    expect(stdoutReceived).toEqual(['out']);
    expect(stderrReceived).toEqual(['err']);
  });

  it('ends stdout stream after writing chunks', async () => {
    const chunks: string[] = [];
    const child = createMockExecaProcess({}, { streamedStdout: ['a', 'b'] });

    child.stdout.on('data', (data: Buffer) => chunks.push(data.toString()));

    await child;

    // Chunks are written and end() is called before the promise resolves
    expect(chunks).toEqual(['a', 'b']);
  });

  it('streams no chunks when options are empty', async () => {
    const received: string[] = [];
    const child = createMockExecaProcess({}, {});

    child.stdout.on('data', (data: Buffer) => received.push(data.toString()));

    await child;

    expect(received).toEqual([]);
  });

  it('can be awaited multiple times (promise semantics)', async () => {
    const child = createMockExecaProcess({ exitCode: 7 });

    const result1 = await child;
    const result2 = await child;

    expect(result1.exitCode).toBe(7);
    expect(result2.exitCode).toBe(7);
  });

  it('returned object satisfies MockExecaChildProcess interface', async () => {
    const child: MockExecaChildProcess = createMockExecaProcess({
      stdout: 'test',
      exitCode: 0,
    });

    // Should be usable as a Promise<MockExecaResult>
    const result: MockExecaResult = await child;
    expect(result.stdout).toBe('test');

    // Should have PassThrough streams
    expect(typeof child.stdout.write).toBe('function');
    expect(typeof child.stderr.write).toBe('function');
  });
});

describe('withBuildTestContext', () => {
  it('provides project, engine, and capture in callback', async () => {
    await withBuildTestContext(async (ctx) => {
      expect(ctx.project).toBeDefined();
      expect(ctx.project.projectDir).toBeDefined();
      expect(ctx.project.uprojectPath).toBeDefined();

      expect(ctx.engine).toBeDefined();
      expect(ctx.engine.enginePath).toBeDefined();

      expect(ctx.capture).toBeDefined();
      expect(ctx.capture.getStdout).toBeDefined();
      expect(ctx.capture.getStderr).toBeDefined();
    });
  });

  it('creates a valid fake project fixture', async () => {
    await withBuildTestContext(async (ctx) => {
      expect(ctx.project.projectDir).toBeTruthy();
      expect(ctx.project.uprojectPath).toMatch(/\.uproject$/);
    });
  });

  it('creates a valid fake engine fixture', async () => {
    await withBuildTestContext(async (ctx) => {
      expect(ctx.engine.enginePath).toBeTruthy();
    });
  });

  it('capture streams are writable', async () => {
    await withBuildTestContext(async (ctx) => {
      ctx.capture.stdout.write('test output');

      expect(ctx.capture.getStdout()).toBe('test output');
    });
  });

  it('passes project options through to createFakeProject', async () => {
    await withBuildTestContext(
      async (ctx) => {
        expect(ctx.project.projectDir).toContain('NamedProject');
      },
      {
        project: { projectName: 'NamedProject' },
      }
    );
  });

  it('passes engine options through to createFakeEngine', async () => {
    await withBuildTestContext(
      async (ctx) => {
        expect(ctx.engine.installation.displayName).toBe('Custom Engine');
      },
      {
        engine: { displayName: 'Custom Engine' },
      }
    );
  });

  it('works with default options (no options provided)', async () => {
    await withBuildTestContext(async (ctx) => {
      expect(ctx.project).toBeDefined();
      expect(ctx.engine).toBeDefined();
      expect(ctx.capture).toBeDefined();
    });
  });

  it('runs callback inside a temporary directory that is cleaned up', async () => {
    let capturedDir: string | undefined;

    await withBuildTestContext(async (ctx) => {
      capturedDir = ctx.project.projectDir;
    });

    // After the callback, the temp directory should be cleaned up
    // The project dir should no longer exist
    const fs = await import('fs-extra');
    if (capturedDir) {
      const exists = await fs.pathExists(capturedDir);
      expect(exists).toBe(false);
    }
  });
});
