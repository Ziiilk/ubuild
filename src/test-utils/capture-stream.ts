import { Writable } from 'stream';

/**
 * A Writable stream that captures all written data for testing purposes.
 * Used to capture stdout/stderr output from commands during testing.
 *
 * @example
 * ```typescript
 * const captured = new CapturedWritable();
 * const logger = new Logger({ stdout: captured });
 * logger.info('test message');
 * console.log(captured.output); // 'ℹ test message\n'
 * ```
 */
export class CapturedWritable extends Writable {
  /** Terminal width for formatting (fixed at 80 columns) */
  readonly columns = 80;

  private readonly chunks: string[] = [];

  constructor() {
    super();
  }

  override _write(
    chunk: string | Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    const value = typeof chunk === 'string' ? chunk : chunk.toString();
    this.chunks.push(value);
    callback();
  }

  /**
   * Gets the complete captured output as a single string.
   * @returns All written data concatenated together
   */
  get output(): string {
    return this.chunks.join('');
  }

  /**
   * Gets the captured output split into lines.
   * Handles both Unix (\n) and Windows (\r\n) line endings.
   * @returns Array of output lines
   */
  get lines(): string[] {
    return this.output.split(/\r?\n/);
  }

  /**
   * Clears all captured data.
   * Resets the internal buffer to empty.
   */
  clear(): void {
    this.chunks.length = 0;
  }
}

/**
 * Interface for captured output from both stdout and stderr streams.
 * Provides convenient methods to access and clear captured data.
 */
export interface OutputCapture {
  /** Captured stdout stream */
  stdout: CapturedWritable;
  /** Captured stderr stream */
  stderr: CapturedWritable;
  /** Clears both stdout and stderr buffers */
  clear(): void;
  /** Gets the captured stdout content */
  getStdout(): string;
  /** Gets the captured stderr content */
  getStderr(): string;
  /** Gets combined stdout and stderr content */
  getCombined(): string;
}

/**
 * Creates an output capture pair for testing command output.
 * Returns both stdout and stderr capture streams with helper methods.
 *
 * @example
 * ```typescript
 * const capture = createOutputCapture();
 * const command = new MyCommand({ stdout: capture.stdout, stderr: capture.stderr });
 * await command.execute();
 *
 * expect(capture.getStdout()).toContain('Success');
 * expect(capture.getStderr()).toBe('');
 * ```
 *
 * @returns An OutputCapture object with stdout, stderr streams and helper methods
 */
export function createOutputCapture(): OutputCapture {
  const stdout = new CapturedWritable();
  const stderr = new CapturedWritable();

  return {
    stdout,
    stderr,
    clear(): void {
      stdout.clear();
      stderr.clear();
    },
    getStdout(): string {
      return stdout.output;
    },
    getStderr(): string {
      return stderr.output;
    },
    getCombined(): string {
      return stdout.output + stderr.output;
    },
  };
}
