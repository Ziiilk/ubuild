import path from 'path';
import fs from 'fs-extra';
import { resolveUnrealBuildToolPath } from './unreal-paths';
import { withTempDir } from '../test-utils';

describe('resolveUnrealBuildToolPath', () => {
  it('resolves UBT path when the executable exists', async () => {
    await withTempDir(async (tempDir) => {
      const enginePath = path.join(tempDir, 'UE_5.3');
      const ubtDir = path.join(
        enginePath,
        'Engine',
        'Binaries',
        'DotNET',
        'UnrealBuildTool'
      );
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
        'UnrealBuildTool not found at'
      );
    });
  });

  it('constructs the correct relative path structure', async () => {
    await withTempDir(async (tempDir) => {
      const enginePath = path.join(tempDir, 'MyEngine');
      const ubtDir = path.join(
        enginePath,
        'Engine',
        'Binaries',
        'DotNET',
        'UnrealBuildTool'
      );
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
      const ubtDir = path.join(
        enginePath,
        'Engine',
        'Binaries',
        'DotNET',
        'UnrealBuildTool'
      );
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
    await expect(
      resolveUnrealBuildToolPath('/non/existent/engine/path')
    ).rejects.toThrow('UnrealBuildTool not found at');
  });
});
