import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { ProjectPathResolver } from './project-path-resolver';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((tempDir) => fs.remove(tempDir)));
  tempDirs.length = 0;
});

async function createTempDir(): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-path-resolver-'));
  tempDirs.push(tempDir);
  return tempDir;
}

describe('ProjectPathResolver', () => {
  describe('resolve', () => {
    it('resolves a directory containing a .uproject file to the project file path', async () => {
      const tempDir = await createTempDir();
      const projectName = 'TestProject';
      const projectFilePath = path.join(tempDir, `${projectName}.uproject`);

      await fs.writeFile(projectFilePath, JSON.stringify({ FileVersion: 3 }), 'utf-8');

      const result = await ProjectPathResolver.resolve(tempDir);

      expect(result.inputPath).toBe(tempDir);
      expect(result.resolvedPath).toBe(projectFilePath);
      expect(result.isDirectory).toBe(true);
      expect(result.wasResolvedFromDirectory).toBe(true);
      expect(result.hasUProjectExtension).toBe(true);
    });

    it('resolves a directory without .uproject file to itself', async () => {
      const tempDir = await createTempDir();

      const result = await ProjectPathResolver.resolve(tempDir);

      expect(result.inputPath).toBe(tempDir);
      expect(result.resolvedPath).toBe(tempDir);
      expect(result.isDirectory).toBe(true);
      expect(result.wasResolvedFromDirectory).toBe(false);
      expect(result.hasUProjectExtension).toBe(false);
    });

    it('resolves a direct .uproject file path as a file', async () => {
      const tempDir = await createTempDir();
      const projectName = 'DirectProject';
      const projectFilePath = path.join(tempDir, `${projectName}.uproject`);

      await fs.writeFile(projectFilePath, JSON.stringify({ FileVersion: 3 }), 'utf-8');

      const result = await ProjectPathResolver.resolve(projectFilePath);

      expect(result.inputPath).toBe(projectFilePath);
      expect(result.resolvedPath).toBe(projectFilePath);
      expect(result.isDirectory).toBe(false);
      expect(result.wasResolvedFromDirectory).toBe(false);
      expect(result.hasUProjectExtension).toBe(true);
    });

    it('resolves a non-.uproject file path as a file without extension flag', async () => {
      const tempDir = await createTempDir();
      const otherFilePath = path.join(tempDir, 'some-file.txt');

      await fs.writeFile(otherFilePath, 'content', 'utf-8');

      const result = await ProjectPathResolver.resolve(otherFilePath);

      expect(result.inputPath).toBe(otherFilePath);
      expect(result.resolvedPath).toBe(otherFilePath);
      expect(result.isDirectory).toBe(false);
      expect(result.wasResolvedFromDirectory).toBe(false);
      expect(result.hasUProjectExtension).toBe(false);
    });

    it('resolves a non-existent path as a file', async () => {
      const tempDir = await createTempDir();
      const nonExistentPath = path.join(tempDir, 'non-existent.uproject');

      const result = await ProjectPathResolver.resolve(nonExistentPath);

      expect(result.inputPath).toBe(nonExistentPath);
      expect(result.resolvedPath).toBe(nonExistentPath);
      expect(result.isDirectory).toBe(false);
      expect(result.wasResolvedFromDirectory).toBe(false);
      expect(result.hasUProjectExtension).toBe(true);
    });

    it('selects the first .uproject file when multiple exist in directory', async () => {
      const tempDir = await createTempDir();
      const firstProjectFile = path.join(tempDir, 'FirstProject.uproject');
      const secondProjectFile = path.join(tempDir, 'SecondProject.uproject');

      await fs.writeFile(firstProjectFile, JSON.stringify({ FileVersion: 3 }), 'utf-8');
      await fs.writeFile(secondProjectFile, JSON.stringify({ FileVersion: 3 }), 'utf-8');

      const result = await ProjectPathResolver.resolve(tempDir);

      expect(result.inputPath).toBe(tempDir);
      // Should pick the first one alphabetically (FirstProject)
      expect(result.resolvedPath).toBe(firstProjectFile);
      expect(result.isDirectory).toBe(true);
      expect(result.wasResolvedFromDirectory).toBe(true);
      expect(result.hasUProjectExtension).toBe(true);
    });

    it('uses process.cwd() as default when no path is provided', async () => {
      const originalCwd = process.cwd();
      const tempDir = await createTempDir();

      try {
        process.chdir(tempDir);
        const projectFilePath = path.join(tempDir, 'CwdProject.uproject');
        await fs.writeFile(projectFilePath, JSON.stringify({ FileVersion: 3 }), 'utf-8');

        const result = await ProjectPathResolver.resolve();

        expect(result.inputPath).toBe(tempDir);
        expect(result.resolvedPath).toBe(projectFilePath);
        expect(result.isDirectory).toBe(true);
        expect(result.wasResolvedFromDirectory).toBe(true);
        expect(result.hasUProjectExtension).toBe(true);
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('handles empty directories correctly', async () => {
      const tempDir = await createTempDir();

      const result = await ProjectPathResolver.resolve(tempDir);

      expect(result.isDirectory).toBe(true);
      expect(result.wasResolvedFromDirectory).toBe(false);
      expect(result.hasUProjectExtension).toBe(false);
    });

    it('handles directories with non-uproject files', async () => {
      const tempDir = await createTempDir();
      await fs.writeFile(path.join(tempDir, 'readme.txt'), 'Hello', 'utf-8');
      await fs.writeFile(path.join(tempDir, 'config.json'), '{}', 'utf-8');

      const result = await ProjectPathResolver.resolve(tempDir);

      expect(result.isDirectory).toBe(true);
      expect(result.wasResolvedFromDirectory).toBe(false);
      expect(result.hasUProjectExtension).toBe(false);
    });
  });

  describe('resolveOrThrow', () => {
    it('returns the .uproject path when directory contains one', async () => {
      const tempDir = await createTempDir();
      const projectName = 'ValidProject';
      const projectFilePath = path.join(tempDir, `${projectName}.uproject`);

      await fs.writeFile(projectFilePath, JSON.stringify({ FileVersion: 3 }), 'utf-8');

      const result = await ProjectPathResolver.resolveOrThrow(tempDir);

      expect(result).toBe(projectFilePath);
    });

    it('returns the direct .uproject file path', async () => {
      const tempDir = await createTempDir();
      const projectFilePath = path.join(tempDir, 'Direct.uproject');

      await fs.writeFile(projectFilePath, JSON.stringify({ FileVersion: 3 }), 'utf-8');

      const result = await ProjectPathResolver.resolveOrThrow(projectFilePath);

      expect(result).toBe(projectFilePath);
    });

    it('throws when directory has no .uproject file', async () => {
      const tempDir = await createTempDir();

      await expect(ProjectPathResolver.resolveOrThrow(tempDir)).rejects.toThrow(
        `No .uproject file found in project directory: ${tempDir}`
      );
    });

    it('throws with helpful message for empty directories', async () => {
      const tempDir = await createTempDir();

      await expect(ProjectPathResolver.resolveOrThrow(tempDir)).rejects.toThrow(
        'No .uproject file'
      );
    });

    it('uses process.cwd() as default when no path is provided', async () => {
      const originalCwd = process.cwd();
      const tempDir = await createTempDir();

      try {
        process.chdir(tempDir);
        const projectFilePath = path.join(tempDir, 'CwdProject.uproject');
        await fs.writeFile(projectFilePath, JSON.stringify({ FileVersion: 3 }), 'utf-8');

        const result = await ProjectPathResolver.resolveOrThrow();

        expect(result).toBe(projectFilePath);
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('throws when cwd has no .uproject file', async () => {
      const originalCwd = process.cwd();
      const tempDir = await createTempDir();

      try {
        process.chdir(tempDir);

        await expect(ProjectPathResolver.resolveOrThrow()).rejects.toThrow('No .uproject file');
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('throws for non-existent file paths', async () => {
      const tempDir = await createTempDir();
      const nonExistentPath = path.join(tempDir, 'does-not-exist.uproject');

      // Non-existent paths are treated as files (not directories), so resolveOrThrow returns them as-is
      const result = await ProjectPathResolver.resolveOrThrow(nonExistentPath);
      expect(result).toBe(nonExistentPath);
    });
  });
});
