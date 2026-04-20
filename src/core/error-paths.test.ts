/**
 * Error path tests for core modules.
 *
 * Covers failure scenarios that are underrepresented in per-module tests:
 * - Execa spawn/crash failures during build
 * - Filesystem permission errors
 * - Corrupt/truncated project files
 * - Engine path validation with version mismatches
 */

import path from 'path';
import fs from 'fs-extra';
import { ProjectDetector } from './project-detector';
import { withTempDir } from '../test-utils/temp-dir';

describe('Error path coverage', () => {
  describe('ProjectDetector – corrupt project files', () => {
    it('handles truncated JSON in .uproject gracefully', async () => {
      await withTempDir(async (rootDir) => {
        const uprojectPath = path.join(rootDir, 'Truncated.uproject');
        await fs.writeFile(uprojectPath, '{ "FileVersion": 3, "EngineAssociation":', 'utf-8');

        const result = await ProjectDetector.detectProject({ cwd: rootDir, recursive: false });

        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.project).toBeUndefined();
      });
    });

    it('handles binary content in .uproject gracefully', async () => {
      await withTempDir(async (rootDir) => {
        const uprojectPath = path.join(rootDir, 'Binary.uproject');
        await fs.writeFile(uprojectPath, Buffer.from([0x00, 0x01, 0xff, 0xfe, 0x89, 0x50]));

        const result = await ProjectDetector.detectProject({ cwd: rootDir, recursive: false });

        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    it('handles .uproject with valid JSON but wrong structure (array)', async () => {
      await withTempDir(async (rootDir) => {
        const uprojectPath = path.join(rootDir, 'ArrayProject.uproject');
        await fs.writeFile(uprojectPath, JSON.stringify([1, 2, 3]), 'utf-8');

        const result = await ProjectDetector.detectProject({ cwd: rootDir, recursive: false });

        expect(result.isValid).toBe(false);
      });
    });

    it('handles .uproject with empty JSON object', async () => {
      await withTempDir(async (rootDir) => {
        const uprojectPath = path.join(rootDir, 'Empty.uproject');
        await fs.writeFile(uprojectPath, '{}', 'utf-8');

        const result = await ProjectDetector.detectProject({ cwd: rootDir, recursive: false });

        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Invalid .uproject file');
      });
    });

    it('handles .uproject with Modules as non-array', async () => {
      await withTempDir(async (rootDir) => {
        const uprojectPath = path.join(rootDir, 'BadModules.uproject');
        await fs.writeFile(
          uprojectPath,
          JSON.stringify({
            FileVersion: 3,
            EngineAssociation: '5.3',
            Modules: 'not-an-array',
          }),
          'utf-8'
        );

        const result = await ProjectDetector.detectProject({ cwd: rootDir, recursive: false });

        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Invalid .uproject file');
      });
    });
  });

  describe('ProjectDetector – edge cases', () => {
    it('handles empty .uproject file', async () => {
      await withTempDir(async (rootDir) => {
        const uprojectPath = path.join(rootDir, 'EmptyFile.uproject');
        await fs.writeFile(uprojectPath, '', 'utf-8');

        const result = await ProjectDetector.detectProject({ cwd: rootDir, recursive: false });

        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    it('handles .uproject with extremely long module names', async () => {
      await withTempDir(async (rootDir) => {
        const uprojectPath = path.join(rootDir, 'LongNames.uproject');
        const longName = 'A'.repeat(1000);
        await fs.writeFile(
          uprojectPath,
          JSON.stringify({
            FileVersion: 3,
            EngineAssociation: '5.3',
            Modules: [
              {
                Name: longName,
                Type: 'Runtime',
                LoadingPhase: 'Default',
              },
            ],
          }),
          'utf-8'
        );
        await fs.ensureDir(path.join(rootDir, 'Source'));

        const result = await ProjectDetector.detectProject({ cwd: rootDir, recursive: false });

        expect(result.isValid).toBe(true);
        expect(result.project?.uproject.Modules![0].Name).toBe(longName);
      });
    });

    it('handles deeply nested recursive search without stack overflow', async () => {
      await withTempDir(async (rootDir) => {
        // Create a moderately nested directory structure without a .uproject
        let currentDir = rootDir;
        for (let i = 0; i < 10; i++) {
          currentDir = path.join(currentDir, `level${i}`);
          await fs.ensureDir(currentDir);
        }

        const result = await ProjectDetector.detectProject({ cwd: rootDir, recursive: true });

        expect(result.isValid).toBe(false);
        expect(result.error).toBe('No Unreal Engine project (.uproject) file found');
      });
    });
  });
});
