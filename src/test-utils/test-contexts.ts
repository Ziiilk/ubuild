import { PassThrough } from 'stream';
import { createOutputCapture, OutputCapture } from './capture-stream';
import {
  createFakeProject,
  createFakeEngine,
  CreateFakeProjectOptions,
  CreateFakeEngineOptions,
  FakeProjectFixture,
  FakeEngineFixture,
} from './unreal-fixtures';
import { withTempDir } from './temp-dir';

/**
 * Options for creating a build executor test context.
 */
export interface BuildTestContextOptions {
  /** Options for the fake project */
  project?: CreateFakeProjectOptions;
  /** Options for the fake engine */
  engine?: CreateFakeEngineOptions;
  /** Default execa result (exitCode, stdout, stderr) */
  execaResult?: {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
  };
  /** Data chunks to stream on stdout */
  streamedStdout?: string[];
  /** Data chunks to stream on stderr */
  streamedStderr?: string[];
}

/**
 * A ready-to-use test context for build executor tests.
 * Bundles project fixtures, engine fixtures, output capture, and mock execa.
 */
export interface BuildTestContext {
  /** Fake project fixture */
  project: FakeProjectFixture;
  /** Fake engine fixture */
  engine: FakeEngineFixture;
  /** Output capture for stdout/stderr */
  capture: OutputCapture;
}

/**
 * Creates a complete build test context inside a temporary directory.
 * Runs the provided callback with the fully initialized context, then cleans up.
 *
 * @example
 * ```typescript
 * await withBuildTestContext(async (ctx) => {
 *   const result = await BuildExecutor.execute({
 *     projectPath: ctx.project.projectDir,
 *     enginePath: ctx.engine.enginePath,
 *     target: 'Editor',
 *     silent: true,
 *   });
 *   expect(result.success).toBe(true);
 *   expect(ctx.capture.getStdout()).toContain('Build');
 * });
 * ```
 *
 * @param callback - Async function receiving the test context
 * @param options - Configuration for the fake project, engine, and execa behavior
 */
export async function withBuildTestContext(
  callback: (ctx: BuildTestContext) => Promise<void>,
  options: BuildTestContextOptions = {}
): Promise<void> {
  await withTempDir(async (rootDir) => {
    const project = await createFakeProject(rootDir, options.project);
    const engine = await createFakeEngine(rootDir, options.engine);
    const capture = createOutputCapture();

    await callback({ project, engine, capture });
  });
}

/**
 * Options for a command test context.
 */
export interface CommandTestContextOptions {
  /** Project path to pass to the command */
  project?: string;
  /** Engine path override */
  enginePath?: string;
}

/**
 * A ready-to-use test context for command-level tests.
 * Provides output capture and common defaults.
 */
export interface CommandTestContext {
  /** Output capture for stdout/stderr */
  capture: OutputCapture;
  /** Shortcut to capture.stdout */
  stdout: OutputCapture['stdout'];
  /** Shortcut to capture.stderr */
  stderr: OutputCapture['stderr'];
}

/**
 * Creates a command test context with output capture.
 *
 * @example
 * ```typescript
 * const ctx = createCommandTestContext();
 * await executeBuild({
 *   project: 'C:\\Projects\\MyGame',
 *   target: 'Editor',
 *   stdout: ctx.stdout,
 *   stderr: ctx.stderr,
 * });
 * expect(ctx.capture.getStdout()).toContain('Success');
 * ```
 *
 * @returns A command test context with capture streams
 */
export function createCommandTestContext(): CommandTestContext {
  const capture = createOutputCapture();
  return {
    capture,
    stdout: capture.stdout,
    stderr: capture.stderr,
  };
}

/**
 * Result shape for mock execa child processes used in build tests.
 */
export interface MockExecaResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Creates a mock execa child process that resolves with the given result.
 * The returned object has both a promise interface and stdout/stderr PassThrough streams.
 *
 * @example
 * ```typescript
 * mockExeca.mockReturnValueOnce(
 *   createMockExecaProcess({ exitCode: 0, stdout: 'Build succeeded' })
 * );
 * ```
 *
 * @param result - Partial result to resolve with (defaults: exitCode 0, empty stdout/stderr)
 * @param options - Optional streaming configuration
 * @returns A mock child process with streams and promise interface
 */
export function createMockExecaProcess(
  result: Partial<MockExecaResult> = {},
  options: { streamedStdout?: string[]; streamedStderr?: string[] } = {}
): MockExecaChildProcess {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const resolved: MockExecaResult = {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.exitCode ?? 0,
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
    return resolved;
  });

  return Object.assign(promise, { stdout, stderr });
}

/**
 * Interface for a mock execa child process.
 */
export interface MockExecaChildProcess extends Promise<MockExecaResult> {
  stdout: PassThrough;
  stderr: PassThrough;
}
