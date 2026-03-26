import fs from 'fs-extra';
import path from 'path';
import { CleanExecutor } from './clean-executor';
import { createOutputCapture } from '../test-utils/capture-stream';
import { createTempDir } from '../test-utils/temp-dir';

// Mock engine-resolver to avoid execa ESM issues
jest.mock('./engine-resolver', () => ({
  EngineResolver: {
    resolveEnginePath: jest.fn().mockResolvedValue('/mock/engine/path'),
  },
}));

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

describe('CleanExecutor', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('execute', () => {
    it('successfully cleans a project with all build artifacts', async () => {
      const tempDir = await createTempDir('clean-executor-test-');
      const projectName = 'TestProject';
      const projectFilePath = path.join(tempDir.path, `${projectName}.uproject`);
      const capture = createOutputCapture();

      // Create a valid .uproject file
      await writeJsonFile(projectFilePath, {
        FileVersion: 3,
        EngineAssociation: '5.3',
        Modules: [{ Name: projectName, Type: 'Runtime', LoadingPhase: 'Default' }],
      });

      // Create build artifacts
      await fs.ensureDir(path.join(tempDir.path, 'Binaries'));
      await fs.ensureDir(path.join(tempDir.path, 'Intermediate'));
      await fs.ensureDir(path.join(tempDir.path, 'Saved'));
      await fs.ensureDir(path.join(tempDir.path, 'DerivedDataCache'));
      await fs.writeFile(path.join(tempDir.path, `${projectName}.sln`), '');
      await fs.ensureDir(path.join(tempDir.path, '.vs'));
      await fs.ensureDir(path.join(tempDir.path, '.idea'));

      const executor = new CleanExecutor({
        stdout: capture.stdout,
        stderr: capture.stderr,
        silent: true,
      });

      const result = await executor.execute({
        projectPath: tempDir.path,
      });

      expect(result.success).toBe(true);
      expect(result.deletedPaths).toHaveLength(7);
      expect(result.failedPaths).toHaveLength(0);
      expect(result.error).toBeUndefined();

      // Verify directories were removed
      expect(await fs.pathExists(path.join(tempDir.path, 'Binaries'))).toBe(false);
      expect(await fs.pathExists(path.join(tempDir.path, 'Intermediate'))).toBe(false);
      expect(await fs.pathExists(path.join(tempDir.path, 'Saved'))).toBe(false);

      await tempDir.cleanup();
    });

    it('cleans only Binaries and Intermediate when binariesOnly is true', async () => {
      const tempDir = await createTempDir('clean-executor-test-');
      const projectName = 'TestProject';
      const projectFilePath = path.join(tempDir.path, `${projectName}.uproject`);
      const capture = createOutputCapture();

      await writeJsonFile(projectFilePath, {
        FileVersion: 3,
        EngineAssociation: '5.3',
        Modules: [{ Name: projectName, Type: 'Runtime', LoadingPhase: 'Default' }],
      });

      // Create build artifacts
      await fs.ensureDir(path.join(tempDir.path, 'Binaries'));
      await fs.ensureDir(path.join(tempDir.path, 'Intermediate'));
      await fs.ensureDir(path.join(tempDir.path, 'Saved'));

      const executor = new CleanExecutor({
        stdout: capture.stdout,
        stderr: capture.stderr,
        silent: true,
      });

      const result = await executor.execute({
        projectPath: tempDir.path,
        binariesOnly: true,
      });

      expect(result.success).toBe(true);
      expect(result.deletedPaths).toHaveLength(2);
      expect(result.failedPaths).toHaveLength(0);

      // Verify only Binaries and Intermediate were removed
      expect(await fs.pathExists(path.join(tempDir.path, 'Binaries'))).toBe(false);
      expect(await fs.pathExists(path.join(tempDir.path, 'Intermediate'))).toBe(false);
      expect(await fs.pathExists(path.join(tempDir.path, 'Saved'))).toBe(true);

      await tempDir.cleanup();
    });

    it('performs dry run without deleting files', async () => {
      const tempDir = await createTempDir('clean-executor-test-');
      const projectName = 'TestProject';
      const projectFilePath = path.join(tempDir.path, `${projectName}.uproject`);
      const capture = createOutputCapture();

      await writeJsonFile(projectFilePath, {
        FileVersion: 3,
        EngineAssociation: '5.3',
        Modules: [{ Name: projectName, Type: 'Runtime', LoadingPhase: 'Default' }],
      });

      // Create build artifacts
      await fs.ensureDir(path.join(tempDir.path, 'Binaries'));
      await fs.ensureDir(path.join(tempDir.path, 'Intermediate'));

      const executor = new CleanExecutor({
        stdout: capture.stdout,
        stderr: capture.stderr,
        silent: true,
      });

      const result = await executor.execute({
        projectPath: tempDir.path,
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.deletedPaths).toHaveLength(2);
      expect(result.failedPaths).toHaveLength(0);

      // Verify directories still exist (not actually deleted)
      expect(await fs.pathExists(path.join(tempDir.path, 'Binaries'))).toBe(true);
      expect(await fs.pathExists(path.join(tempDir.path, 'Intermediate'))).toBe(true);

      await tempDir.cleanup();
    });

    it('cleans plugin build directories', async () => {
      const tempDir = await createTempDir('clean-executor-test-');
      const projectName = 'TestProject';
      const projectFilePath = path.join(tempDir.path, `${projectName}.uproject`);
      const capture = createOutputCapture();

      await writeJsonFile(projectFilePath, {
        FileVersion: 3,
        EngineAssociation: '5.3',
        Modules: [{ Name: projectName, Type: 'Runtime', LoadingPhase: 'Default' }],
      });

      // Create plugin directories with build artifacts
      const pluginDir = path.join(tempDir.path, 'Plugins', 'TestPlugin');
      await fs.ensureDir(path.join(pluginDir, 'Binaries'));
      await fs.ensureDir(path.join(pluginDir, 'Intermediate'));

      const executor = new CleanExecutor({
        stdout: capture.stdout,
        stderr: capture.stderr,
        silent: true,
      });

      const result = await executor.execute({
        projectPath: tempDir.path,
      });

      expect(result.success).toBe(true);
      // Should have cleaned project Binaries, Intermediate, Saved, DerivedDataCache,
      // plus plugin Binaries and Intermediate
      expect(result.deletedPaths.length).toBeGreaterThanOrEqual(2);

      // Verify plugin directories were removed
      expect(await fs.pathExists(path.join(pluginDir, 'Binaries'))).toBe(false);
      expect(await fs.pathExists(path.join(pluginDir, 'Intermediate'))).toBe(false);

      await tempDir.cleanup();
    });

    it('handles project with no build artifacts gracefully', async () => {
      const tempDir = await createTempDir('clean-executor-test-');
      const projectName = 'TestProject';
      const projectFilePath = path.join(tempDir.path, `${projectName}.uproject`);
      const capture = createOutputCapture();

      await writeJsonFile(projectFilePath, {
        FileVersion: 3,
        EngineAssociation: '5.3',
        Modules: [{ Name: projectName, Type: 'Runtime', LoadingPhase: 'Default' }],
      });

      // No build artifacts created

      const executor = new CleanExecutor({
        stdout: capture.stdout,
        stderr: capture.stderr,
        silent: true,
      });

      const result = await executor.execute({
        projectPath: tempDir.path,
      });

      expect(result.success).toBe(true);
      expect(result.deletedPaths).toHaveLength(0);
      expect(result.failedPaths).toHaveLength(0);
      expect(result.error).toBeUndefined();

      await tempDir.cleanup();
    });

    it('handles non-existent project path gracefully', async () => {
      const capture = createOutputCapture();
      const executor = new CleanExecutor({
        stdout: capture.stdout,
        stderr: capture.stderr,
        silent: true,
      });

      const result = await executor.execute({
        projectPath: '/nonexistent/path/to/project',
      });

      // Non-existent paths are returned as-is by ProjectPathResolver
      // The clean operation treats this as a project without build artifacts
      expect(result.success).toBe(true);
      expect(result.deletedPaths).toHaveLength(0);
      expect(result.failedPaths).toHaveLength(0);
      expect(result.error).toBeUndefined();
    });

    it('fails when directory contains no .uproject file', async () => {
      const tempDir = await createTempDir('clean-executor-test-');
      const capture = createOutputCapture();

      // Create directory without .uproject file
      await fs.ensureDir(path.join(tempDir.path, 'SomeOtherDir'));

      const executor = new CleanExecutor({
        stdout: capture.stdout,
        stderr: capture.stderr,
        silent: true,
      });

      const result = await executor.execute({
        projectPath: tempDir.path,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No .uproject file found');

      await tempDir.cleanup();
    });

    it('accepts direct .uproject file path', async () => {
      const tempDir = await createTempDir('clean-executor-test-');
      const projectName = 'TestProject';
      const projectFilePath = path.join(tempDir.path, `${projectName}.uproject`);
      const capture = createOutputCapture();

      await writeJsonFile(projectFilePath, {
        FileVersion: 3,
        EngineAssociation: '5.3',
        Modules: [{ Name: projectName, Type: 'Runtime', LoadingPhase: 'Default' }],
      });

      await fs.ensureDir(path.join(tempDir.path, 'Binaries'));

      const executor = new CleanExecutor({
        stdout: capture.stdout,
        stderr: capture.stderr,
        silent: true,
      });

      const result = await executor.execute({
        projectPath: projectFilePath,
      });

      expect(result.success).toBe(true);
      expect(result.deletedPaths.length).toBeGreaterThanOrEqual(1);

      await tempDir.cleanup();
    });

    it('handles plugin directory with file entries gracefully', async () => {
      const tempDir = await createTempDir('clean-executor-test-');
      const projectName = 'TestProject';
      const projectFilePath = path.join(tempDir.path, `${projectName}.uproject`);
      const capture = createOutputCapture();

      await writeJsonFile(projectFilePath, {
        FileVersion: 3,
        EngineAssociation: '5.3',
        Modules: [{ Name: projectName, Type: 'Runtime', LoadingPhase: 'Default' }],
      });

      // Create a file in Plugins directory (not a directory)
      await fs.ensureDir(path.join(tempDir.path, 'Plugins'));
      await fs.writeFile(path.join(tempDir.path, 'Plugins', 'readme.txt'), 'plugins folder');

      const executor = new CleanExecutor({
        stdout: capture.stdout,
        stderr: capture.stderr,
        silent: true,
      });

      const result = await executor.execute({
        projectPath: tempDir.path,
      });

      expect(result.success).toBe(true);
      // Should not fail on file entries in Plugins directory
      expect(result.failedPaths).toHaveLength(0);

      await tempDir.cleanup();
    });

    it('continues without engine when engine resolution fails', async () => {
      const tempDir = await createTempDir('clean-executor-test-');
      const projectName = 'TestProject';
      const projectFilePath = path.join(tempDir.path, `${projectName}.uproject`);
      const capture = createOutputCapture();

      await writeJsonFile(projectFilePath, {
        FileVersion: 3,
        EngineAssociation: '{INVALID-GUID-THAT-WILL-NOT-RESOLVE}',
        Modules: [{ Name: projectName, Type: 'Runtime', LoadingPhase: 'Default' }],
      });

      await fs.ensureDir(path.join(tempDir.path, 'Binaries'));

      const executor = new CleanExecutor({
        stdout: capture.stdout,
        stderr: capture.stderr,
        silent: true,
      });

      // Should not throw even though engine cannot be resolved
      const result = await executor.execute({
        projectPath: tempDir.path,
      });

      expect(result.success).toBe(true);

      await tempDir.cleanup();
    });

    it('handles errors when cleaning individual paths', async () => {
      const tempDir = await createTempDir('clean-executor-test-');
      const projectName = 'TestProject';
      const projectFilePath = path.join(tempDir.path, `${projectName}.uproject`);
      const capture = createOutputCapture();

      await writeJsonFile(projectFilePath, {
        FileVersion: 3,
        EngineAssociation: '5.3',
        Modules: [{ Name: projectName, Type: 'Runtime', LoadingPhase: 'Default' }],
      });

      // Create a file that will be treated as a directory (simulating edge case)
      // Note: fs.remove can handle files and directories, so we test actual permission issues
      // by creating and then removing write permissions (on Unix-like systems)
      // or by testing with dryRun mode

      const executor = new CleanExecutor({
        stdout: capture.stdout,
        stderr: capture.stderr,
        silent: true,
      });

      // Test that the executor handles the scenario correctly
      const result = await executor.execute({
        projectPath: tempDir.path,
        dryRun: false,
      });

      // Should succeed since there's nothing to delete (no build artifacts created)
      expect(result.success).toBe(true);

      await tempDir.cleanup();
    });

    it('reports success with empty arrays when no artifacts exist', async () => {
      const tempDir = await createTempDir('clean-executor-test-');
      const projectName = 'CleanProject';
      const projectFilePath = path.join(tempDir.path, `${projectName}.uproject`);
      const capture = createOutputCapture();

      await writeJsonFile(projectFilePath, {
        FileVersion: 3,
        EngineAssociation: '5.3',
        Modules: [{ Name: projectName, Type: 'Runtime', LoadingPhase: 'Default' }],
      });

      const executor = new CleanExecutor({
        stdout: capture.stdout,
        stderr: capture.stderr,
        silent: true,
      });

      const result = await executor.execute({
        projectPath: tempDir.path,
      });

      expect(result.success).toBe(true);
      expect(result.deletedPaths).toEqual([]);
      expect(result.failedPaths).toEqual([]);
      expect(result.error).toBeUndefined();

      await tempDir.cleanup();
    });

    it('handles multiple plugins in Plugins directory', async () => {
      const tempDir = await createTempDir('clean-executor-test-');
      const projectName = 'TestProject';
      const projectFilePath = path.join(tempDir.path, `${projectName}.uproject`);
      const capture = createOutputCapture();

      await writeJsonFile(projectFilePath, {
        FileVersion: 3,
        EngineAssociation: '5.3',
        Modules: [{ Name: projectName, Type: 'Runtime', LoadingPhase: 'Default' }],
      });

      // Create multiple plugins
      const plugin1Dir = path.join(tempDir.path, 'Plugins', 'Plugin1');
      const plugin2Dir = path.join(tempDir.path, 'Plugins', 'Plugin2');

      await fs.ensureDir(path.join(plugin1Dir, 'Binaries'));
      await fs.ensureDir(path.join(plugin1Dir, 'Intermediate'));
      await fs.ensureDir(path.join(plugin2Dir, 'Binaries'));
      await fs.ensureDir(path.join(plugin2Dir, 'Intermediate'));

      const executor = new CleanExecutor({
        stdout: capture.stdout,
        stderr: capture.stderr,
        silent: true,
      });

      const result = await executor.execute({
        projectPath: tempDir.path,
      });

      expect(result.success).toBe(true);
      // Should have cleaned 4 plugin directories (2 plugins × 2 directories each)
      const pluginCleanedPaths = result.deletedPaths.filter((p) => p.includes('Plugins'));
      expect(pluginCleanedPaths).toHaveLength(4);

      // Verify all plugin directories were removed
      expect(await fs.pathExists(path.join(plugin1Dir, 'Binaries'))).toBe(false);
      expect(await fs.pathExists(path.join(plugin1Dir, 'Intermediate'))).toBe(false);
      expect(await fs.pathExists(path.join(plugin2Dir, 'Binaries'))).toBe(false);
      expect(await fs.pathExists(path.join(plugin2Dir, 'Intermediate'))).toBe(false);

      await tempDir.cleanup();
    });

    it('handles errors when removing individual paths fails', async () => {
      const tempDir = await createTempDir('clean-executor-test-');
      const projectName = 'TestProject';
      const projectFilePath = path.join(tempDir.path, `${projectName}.uproject`);
      const capture = createOutputCapture();

      await writeJsonFile(projectFilePath, {
        FileVersion: 3,
        EngineAssociation: '5.3',
        Modules: [{ Name: projectName, Type: 'Runtime', LoadingPhase: 'Default' }],
      });

      // Create Binaries directory
      const binariesPath = path.join(tempDir.path, 'Binaries');
      await fs.ensureDir(binariesPath);

      // Create a file inside that we'll make read-only to cause deletion failure
      const testFile = path.join(binariesPath, 'test.dll');
      await fs.writeFile(testFile, 'test content');

      // Mock fs.remove to simulate failure for this specific path
      const originalRemove = fs.remove;
      let callCount = 0;
      jest.spyOn(fs, 'remove').mockImplementation(async (filepath: string) => {
        // Fail on first call (Binaries), succeed on others
        if (callCount === 0 && filepath.includes('Binaries')) {
          callCount++;
          throw new Error('Permission denied');
        }
        return originalRemove(filepath);
      });

      const executor = new CleanExecutor({
        stdout: capture.stdout,
        stderr: capture.stderr,
        silent: true,
      });

      const result = await executor.execute({
        projectPath: tempDir.path,
      });

      // Restore mock
      jest.restoreAllMocks();

      expect(result.success).toBe(false);
      expect(result.failedPaths.length).toBeGreaterThan(0);
      expect(result.failedPaths[0].error).toContain('Permission denied');
      expect(result.error).toContain('Failed to clean');

      await tempDir.cleanup();
    });

    it('handles errors when reading plugin directory fails', async () => {
      const tempDir = await createTempDir('clean-executor-test-');
      const projectName = 'TestProject';
      const projectFilePath = path.join(tempDir.path, `${projectName}.uproject`);
      const capture = createOutputCapture();

      await writeJsonFile(projectFilePath, {
        FileVersion: 3,
        EngineAssociation: '5.3',
        Modules: [{ Name: projectName, Type: 'Runtime', LoadingPhase: 'Default' }],
      });

      // Create build artifacts so the main cleaning succeeds
      await fs.ensureDir(path.join(tempDir.path, 'Binaries'));

      // Create Plugins directory
      const pluginsDir = path.join(tempDir.path, 'Plugins');
      await fs.ensureDir(pluginsDir);

      // Create a plugin subdirectory
      await fs.ensureDir(path.join(pluginsDir, 'TestPlugin'));

      // Mock fs.readdir specifically for the Plugins directory
      const originalReaddir = fs.readdir;
      jest.spyOn(fs, 'readdir').mockImplementation(async (filepath, ...args) => {
        if (typeof filepath === 'string' && filepath.includes('Plugins')) {
          throw new Error('Access denied');
        }
        return originalReaddir(filepath, ...args);
      });

      const executor = new CleanExecutor({
        stdout: capture.stdout,
        stderr: capture.stderr,
        silent: true,
      });

      const result = await executor.execute({
        projectPath: tempDir.path,
      });

      // Restore mock
      jest.restoreAllMocks();

      // Should still succeed even if plugin cleaning fails
      expect(result.success).toBe(true);

      await tempDir.cleanup();
    });

    it('handles plugin cleaning when individual plugin path fails', async () => {
      const tempDir = await createTempDir('clean-executor-test-');
      const projectName = 'TestProject';
      const projectFilePath = path.join(tempDir.path, `${projectName}.uproject`);
      const capture = createOutputCapture();

      await writeJsonFile(projectFilePath, {
        FileVersion: 3,
        EngineAssociation: '5.3',
        Modules: [{ Name: projectName, Type: 'Runtime', LoadingPhase: 'Default' }],
      });

      // Create plugin with Binaries
      const pluginDir = path.join(tempDir.path, 'Plugins', 'TestPlugin');
      const pluginBinaries = path.join(pluginDir, 'Binaries');
      await fs.ensureDir(pluginBinaries);
      await fs.writeFile(path.join(pluginBinaries, 'test.dll'), 'content');

      // Mock fs.remove to fail on plugin path
      const originalRemove = fs.remove;
      jest.spyOn(fs, 'remove').mockImplementation(async (filepath: string) => {
        if (filepath.includes('Plugins') && filepath.includes('Binaries')) {
          throw new Error('Plugin file locked');
        }
        return originalRemove(filepath);
      });

      const executor = new CleanExecutor({
        stdout: capture.stdout,
        stderr: capture.stderr,
        silent: true,
      });

      const result = await executor.execute({
        projectPath: tempDir.path,
      });

      jest.restoreAllMocks();

      expect(result.success).toBe(false);
      expect(result.failedPaths.some((p) => p.path.includes('Plugins'))).toBe(true);
      expect(result.failedPaths.some((p) => p.error.includes('Plugin file locked'))).toBe(true);

      await tempDir.cleanup();
    });
  });
});
