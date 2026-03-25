import fs from 'fs-extra';
import path from 'path';
import { createTempDir, withTempDir } from './temp-dir';

describe('createTempDir', () => {
  it('creates a temporary directory', async () => {
    const tempDir = await createTempDir();

    expect(tempDir.path).toBeDefined();
    expect(await fs.pathExists(tempDir.path)).toBe(true);
    expect((await fs.stat(tempDir.path)).isDirectory()).toBe(true);

    await tempDir.cleanup();
  });

  it('uses default prefix when not specified', async () => {
    const tempDir = await createTempDir();

    expect(path.basename(tempDir.path)).toMatch(/^ubuild-test-/);

    await tempDir.cleanup();
  });

  it('uses custom prefix when specified', async () => {
    const customPrefix = 'custom-test-';
    const tempDir = await createTempDir(customPrefix);

    expect(path.basename(tempDir.path)).toMatch(/^custom-test-/);

    await tempDir.cleanup();
  });

  it('creates unique directories for multiple calls', async () => {
    const tempDir1 = await createTempDir();
    const tempDir2 = await createTempDir();

    expect(tempDir1.path).not.toBe(tempDir2.path);

    await tempDir1.cleanup();
    await tempDir2.cleanup();
  });

  describe('cleanup', () => {
    it('removes the directory and all contents', async () => {
      const tempDir = await createTempDir();
      const testFile = path.join(tempDir.path, 'test.txt');

      await fs.writeFile(testFile, 'test content');
      expect(await fs.pathExists(testFile)).toBe(true);

      await tempDir.cleanup();

      expect(await fs.pathExists(tempDir.path)).toBe(false);
    });

    it('removes nested directories', async () => {
      const tempDir = await createTempDir();
      const nestedDir = path.join(tempDir.path, 'level1', 'level2');

      await fs.ensureDir(nestedDir);
      await fs.writeFile(path.join(nestedDir, 'file.txt'), 'content');

      await tempDir.cleanup();

      expect(await fs.pathExists(tempDir.path)).toBe(false);
    });

    it('does not throw if directory does not exist', async () => {
      const tempDir = await createTempDir();
      await tempDir.cleanup();

      await expect(tempDir.cleanup()).resolves.not.toThrow();
    });
  });
});

describe('withTempDir', () => {
  it('creates temp directory and passes path to callback', async () => {
    let receivedPath: string | null = null;

    await withTempDir(async (tempDirPath) => {
      receivedPath = tempDirPath;
      expect(await fs.pathExists(tempDirPath)).toBe(true);
      expect((await fs.stat(tempDirPath)).isDirectory()).toBe(true);
    });

    expect(receivedPath).not.toBeNull();
    expect(await fs.pathExists(receivedPath!)).toBe(false);
  });

  it('returns callback result', async () => {
    const result = await withTempDir(async (tempDirPath) => {
      return { path: tempDirPath, success: true };
    });

    expect(result).toEqual({ path: expect.any(String), success: true });
  });

  it('cleans up after callback completes', async () => {
    let tempPath: string = '';

    await withTempDir(async (tempDirPath) => {
      tempPath = tempDirPath;
      await fs.writeFile(path.join(tempDirPath, 'file.txt'), 'content');
      expect(await fs.pathExists(tempDirPath)).toBe(true);
    });

    expect(await fs.pathExists(tempPath)).toBe(false);
  });

  it('cleans up even if callback throws', async () => {
    let tempPath: string = '';

    await expect(
      withTempDir(async (tempDirPath) => {
        tempPath = tempDirPath;
        await fs.writeFile(path.join(tempDirPath, 'file.txt'), 'content');
        throw new Error('Test error');
      })
    ).rejects.toThrow('Test error');

    expect(await fs.pathExists(tempPath)).toBe(false);
  });

  it('uses custom prefix when specified', async () => {
    let tempPath: string = '';

    await withTempDir(async (tempDirPath) => {
      tempPath = tempDirPath;
    }, 'my-prefix-');

    expect(path.basename(tempPath)).toMatch(/^my-prefix-/);
  });

  it('supports synchronous callbacks', async () => {
    const result = await withTempDir((tempDirPath) => {
      return `path: ${tempDirPath}`;
    });

    expect(result).toMatch(/^path: /);
  });
});
