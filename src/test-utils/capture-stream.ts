import { Writable } from 'stream';

export class CapturedWritable extends Writable {
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

  get output(): string {
    return this.chunks.join('');
  }

  get lines(): string[] {
    return this.output.split(/\r?\n/);
  }

  clear(): void {
    this.chunks.length = 0;
  }
}

export interface OutputCapture {
  stdout: CapturedWritable;
  stderr: CapturedWritable;
  clear(): void;
  getStdout(): string;
  getStderr(): string;
  getCombined(): string;
}

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
