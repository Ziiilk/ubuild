import fs from 'fs-extra';
import os from 'os';
import path from 'path';

export interface TempDirHandle {
  path: string;
  cleanup(): Promise<void>;
}

export async function createTempDir(prefix = 'ubuild-test-'): Promise<TempDirHandle> {
  const tempDirPath = await fs.mkdtemp(path.join(os.tmpdir(), prefix));

  return {
    path: tempDirPath,
    async cleanup(): Promise<void> {
      await fs.remove(tempDirPath);
    },
  };
}

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
