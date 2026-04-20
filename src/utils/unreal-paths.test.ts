import path from 'path';
import fs from 'fs-extra';
import { resolveUnrealBuildToolPath } from './unreal-paths';
import { withTempDir } from '../test-utils';
import { formatError } from './error';

describe('resolveUnrealBuildToolPath', () => {
  it('resolves UBT path when the executable exists', async () => {
    await withTempDir(async (tempDir) => {
      const enginePath = path.join(tempDir, 'UE_5.3');
      const ubtDir = path.join(enginePath, 'Engine', 'Binaries', 'DotNET', 'UnrealBuildTool');
      await fs.ensureDir(ubtDir);
      const exeName = `UnrealBuildTool${process.platform === 'win32' ? '.exe' : ''}`;
      const ubtExe = path.join(ubtDir, exeName);
      await fs.writeFile(ubtExe, '');

      const result = await resolveUnrealBuildToolPath(enginePath);

      expect(result).toBe(ubtExe);
    });
  });

  it('throws when UnrealBuildTool is not found', async () => {
    await withTempDir(async (tempDir) => {
      const enginePath = path.join(tempDir, 'UE_5.3');
      await fs.ensureDir(enginePath);

      await expect(resolveUnrealBuildToolPath(enginePath)).rejects.toThrow(
        'UnrealBuildTool not found'
      );
    });
  });

  it('constructs the correct relative path structure', async () => {
    await withTempDir(async (tempDir) => {
      const enginePath = path.join(tempDir, 'MyEngine');
      const ubtDir = path.join(enginePath, 'Engine', 'Binaries', 'DotNET', 'UnrealBuildTool');
      await fs.ensureDir(ubtDir);
      const exeName = `UnrealBuildTool${process.platform === 'win32' ? '.exe' : ''}`;
      await fs.writeFile(path.join(ubtDir, exeName), '');

      const result = await resolveUnrealBuildToolPath(enginePath);

      expect(result).toContain(path.join('Engine', 'Binaries', 'DotNET', 'UnrealBuildTool'));
    });
  });

  it('includes the platform-specific extension in the resolved path', async () => {
    await withTempDir(async (tempDir) => {
      const enginePath = path.join(tempDir, 'UE_5.4');
      const ubtDir = path.join(enginePath, 'Engine', 'Binaries', 'DotNET', 'UnrealBuildTool');
      await fs.ensureDir(ubtDir);
      const exeName = `UnrealBuildTool${process.platform === 'win32' ? '.exe' : ''}`;
      await fs.writeFile(path.join(ubtDir, exeName), '');

      const result = await resolveUnrealBuildToolPath(enginePath);

      if (process.platform === 'win32') {
        expect(result).toContain('UnrealBuildTool.exe');
      } else {
        expect(result).toContain('UnrealBuildTool');
        expect(result).not.toContain('UnrealBuildTool.exe');
      }
    });
  });

  it('throws for a non-existent engine path', async () => {
    await expect(resolveUnrealBuildToolPath('/non/existent/engine/path')).rejects.toThrow(
      'UnrealBuildTool not found'
    );
  });

  it('falls back to flat DotNET layout when subdirectory layout is absent', async () => {
    await withTempDir(async (tempDir) => {
      const enginePath = path.join(tempDir, 'UE_5.1');
      // Create the older flat layout: Engine/Binaries/DotNET/UnrealBuildTool.exe
      const dotnetDir = path.join(enginePath, 'Engine', 'Binaries', 'DotNET');
      await fs.ensureDir(dotnetDir);
      const exeName = `UnrealBuildTool${process.platform === 'win32' ? '.exe' : ''}`;
      const flatUbtExe = path.join(dotnetDir, exeName);
      await fs.writeFile(flatUbtExe, '');

      const result = await resolveUnrealBuildToolPath(enginePath);

      expect(result).toBe(flatUbtExe);
      expect(result).toContain(path.join('Engine', 'Binaries', 'DotNET', exeName));
    });
  });

  it('prefers subdirectory layout over flat layout when both exist', async () => {
    await withTempDir(async (tempDir) => {
      const enginePath = path.join(tempDir, 'UE_5.3');
      const exeName = `UnrealBuildTool${process.platform === 'win32' ? '.exe' : ''}`;

      // Create both layouts
      const subDir = path.join(enginePath, 'Engine', 'Binaries', 'DotNET', 'UnrealBuildTool');
      await fs.ensureDir(subDir);
      await fs.writeFile(path.join(subDir, exeName), '');

      const flatDir = path.join(enginePath, 'Engine', 'Binaries', 'DotNET');
      await fs.ensureDir(flatDir);
      await fs.writeFile(path.join(flatDir, exeName), '');

      const result = await resolveUnrealBuildToolPath(enginePath);

      // Should prefer the subdirectory layout
      expect(result).toBe(path.join(subDir, exeName));
    });
  });

  it('lists all attempted paths in error message when not found', async () => {
    await withTempDir(async (tempDir) => {
      const enginePath = path.join(tempDir, 'UE_Missing');
      await fs.ensureDir(enginePath);

      try {
        await resolveUnrealBuildToolPath(enginePath);
        fail('Expected an error to be thrown');
      } catch (error) {
        const message = formatError(error);
        expect(message).toContain('UnrealBuildTool not found');
        // Should mention both locations in the error
        expect(message).toContain('DotNET');
      }
    });
  });
});
