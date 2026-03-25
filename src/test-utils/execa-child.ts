import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

/**
 * Result returned by a fake execa child process.
 * Contains stdout, stderr, and exit code.
 */
export interface FakeExecaResult {
  /** Standard output content */
  stdout?: string;
  /** Standard error content */
  stderr?: string;
  /** Process exit code (0 for success) */
  exitCode?: number;
}

/**
 * Options for configuring fake execa child process behavior.
 * Controls emitted data and error simulation.
 */
export interface FakeExecaOptions {
  /** Data to emit on stdout stream */
  emitStdout?: string;
  /** Data to emit on stderr stream */
  emitStderr?: string;
  /** Error to reject the promise with (simulates execution failure) */
  rejectWith?: Error;
}

/**
 * Fake execa child process interface for testing.
 * Mimics the behavior of execa's child process with streams and events.
 *
 * @example
 * ```typescript
 * const fakeChild = createFakeExecaChild(
 *   { stdout: 'success', exitCode: 0 },
 *   { emitStdout: 'streaming data' }
 * );
 *
 * fakeChild.on('exit', (code) => console.log(code)); // 0
 * ```
 */
export interface FakeExecaChild extends Promise<FakeExecaResult> {
  /** Standard output stream */
  stdout: PassThrough;
  /** Standard error stream */
  stderr: PassThrough;
  /**
   * Registers an event listener for process exit.
   * @param event - Event name ('exit')
   * @param listener - Callback receiving exit code
   */
  on(event: 'exit', listener: (code: number) => void): FakeExecaChild;
  /**
   * Marks the process as unreferenced (no-op for tests).
   */
  unref(): void;
}

/**
 * Creates a fake execa child process for testing async command execution.
 * Simulates stdout/stderr streams, exit events, and process completion.
 *
 * @example
 * ```typescript
 * // Simulate successful execution
 * const success = createFakeExecaChild({ stdout: 'output', exitCode: 0 });
 *
 * // Simulate failed execution
 * const failure = createFakeExecaChild({ exitCode: 1, stderr: 'error' });
 *
 * // Simulate streaming output
 * const streaming = createFakeExecaChild(
 *   {},
 *   { emitStdout: 'chunk1', emitStderr: 'chunk2' }
 * );
 *
 * // Simulate execution error
 * const error = createFakeExecaChild(
 *   {},
 *   { rejectWith: new Error('spawn failed') }
 * );
 * ```
 *
 * @param result - The result to return when the process completes
 * @param options - Options for controlling stream behavior and errors
 * @returns A fake execa child process with streams and promise interface
 */
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
