import fs from 'fs-extra';
import os from 'os';
import path from 'path';

/**
 * Handle for a temporary directory that can be automatically cleaned up.
 * Provides the directory path and a cleanup function.
 *
 * @example
 * ```typescript
 * const tempDir = await createTempDir('my-test-');
 * await fs.writeFile(path.join(tempDir.path, 'test.txt'), 'content');
 * // ... run tests ...
 * await tempDir.cleanup(); // Removes the directory
 * ```
 */
export interface TempDirHandle {
  /** Absolute path to the temporary directory */
  path: string;
  /**
   * Removes the temporary directory and all its contents.
   * @returns Promise that resolves when cleanup is complete
   */
  cleanup(): Promise<void>;
}

/**
 * Creates a temporary directory with an optional prefix.
 * The directory is created in the system's temp directory.
 *
 * @example
 * ```typescript
 * const tempDir = await createTempDir('ubuild-test-');
 * console.log(tempDir.path); // /tmp/ubuild-test-abc123
 * await tempDir.cleanup();
 * ```
 *
 * @param prefix - Optional prefix for the directory name (default: 'ubuild-test-')
 * @returns A handle to the temporary directory
 */
export async function createTempDir(prefix = 'ubuild-test-'): Promise<TempDirHandle> {
  const tempDirPath = await fs.mkdtemp(path.join(os.tmpdir(), prefix));

  return {
    path: tempDirPath,
    async cleanup(): Promise<void> {
      await fs.remove(tempDirPath);
    },
  };
}

/**
 * Executes a callback with a temporary directory that is automatically cleaned up.
 * The directory is created before the callback runs and deleted after,
 * even if the callback throws an error.
 *
 * @example
 * ```typescript
 * const result = await withTempDir(async (tempDirPath) => {
 *   await fs.writeFile(path.join(tempDirPath, 'file.txt'), 'content');
 *   return await processFile(tempDirPath);
 * });
 * // tempDir is automatically cleaned up
 * ```
 *
 * @param callback - Function to execute with the temp directory path
 * @param prefix - Optional prefix for the directory name
 * @returns The result of the callback function
 */
export async function withTempDir<T>(
  callback: (tempDirPath: string) => Promise<T> | T,
  prefix?: string
): Promise<T> {
  const tempDir = await createTempDir(prefix);

  try {
    return await callback(tempDir.path);
  } finally {
    await tempDir.cleanup();
  }
}
