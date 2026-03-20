import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

export interface FakeExecaResult {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}

export interface FakeExecaOptions {
  emitStdout?: string;
  emitStderr?: string;
  rejectWith?: Error;
}

export interface FakeExecaChild extends Promise<FakeExecaResult> {
  stdout: PassThrough;
  stderr: PassThrough;
  on(event: 'exit', listener: (code: number) => void): FakeExecaChild;
  unref(): void;
}

export function createFakeExecaChild(
  result: FakeExecaResult = {},
  options: FakeExecaOptions = {}
): FakeExecaChild {
  const emitter = new EventEmitter();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const resolvedResult: FakeExecaResult = {
    stdout: result.stdout ?? options.emitStdout ?? '',
    stderr: result.stderr ?? options.emitStderr ?? '',
    exitCode: result.exitCode ?? 0,
  };

  const promise = options.rejectWith
    ? Promise.reject(options.rejectWith)
    : Promise.resolve(resolvedResult);

  let child = promise as FakeExecaChild;

  child = Object.assign(child, {
    stdout,
    stderr,
    on(event: 'exit', listener: (code: number) => void): FakeExecaChild {
      emitter.on(event, listener);
      return child;
    },
    unref(): void {
      // no-op for tests
    },
  });

  queueMicrotask(() => {
    if (options.emitStdout) {
      stdout.emit('data', Buffer.from(options.emitStdout));
    }

    if (options.emitStderr) {
      stderr.emit('data', Buffer.from(options.emitStderr));
    }

    stdout.end();
    stderr.end();

    if (!options.rejectWith) {
      emitter.emit('exit', resolvedResult.exitCode ?? 0);
    }
  });

  return child;
}
