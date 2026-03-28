import { resolveUnrealBuildToolPath } from './unreal-paths';
import path from 'path';

const mockFsPathExists = jest.fn();

jest.mock('fs-extra', () => ({
  pathExists: (...args: unknown[]) => mockFsPathExists(...args),
}));

const mockExeExtension = jest.fn().mockReturnValue('.exe');

jest.mock('./platform', () => ({
  Platform: {
    exeExtension: (...args: unknown[]) => mockExeExtension(...args),
    isWindows: jest.fn().mockReturnValue(true),
  },
}));

describe('resolveUnrealBuildToolPath', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExeExtension.mockReturnValue('.exe');
  });

  it('resolves UBT path when executable exists', async () => {
    mockFsPathExists.mockResolvedValue(true);

    const result = await resolveUnrealBuildToolPath('C:\\Engine\\UE_5.3');

    expect(result).toBe(
      path.join(
        'C:\\Engine\\UE_5.3',
        'Engine',
        'Binaries',
        'DotNET',
        'UnrealBuildTool',
        'UnrealBuildTool.exe'
      )
    );
    expect(mockFsPathExists).toHaveBeenCalledTimes(1);
  });

  it('throws error when UBT executable does not exist', async () => {
    mockFsPathExists.mockResolvedValue(false);

    const expectedPath = path.join(
      'C:\\Engine\\UE_5.3',
      'Engine',
      'Binaries',
      'DotNET',
      'UnrealBuildTool',
      'UnrealBuildTool.exe'
    );

    await expect(resolveUnrealBuildToolPath('C:\\Engine\\UE_5.3')).rejects.toThrow(
      `UnrealBuildTool not found at: ${expectedPath}`
    );
  });

  it('handles fs.pathExists errors gracefully', async () => {
    mockFsPathExists.mockRejectedValue(new Error('Permission denied'));

    await expect(resolveUnrealBuildToolPath('C:\\Engine\\UE_5.3')).rejects.toThrow(
      'Permission denied'
    );
  });

  it('works with relative engine paths', async () => {
    mockFsPathExists.mockResolvedValue(true);

    const result = await resolveUnrealBuildToolPath('./engine');

    expect(result).toContain('Engine');
    expect(result).toContain('Binaries');
    expect(result).toContain('DotNET');
    expect(result).toContain('UnrealBuildTool');
    expect(result).toContain('UnrealBuildTool.exe');
  });

  it('constructs correct path on non-Windows platforms', async () => {
    mockExeExtension.mockReturnValue('');
    mockFsPathExists.mockResolvedValue(true);

    const result = await resolveUnrealBuildToolPath('/opt/UE_5.3');

    expect(result).toBe(
      path.join('/opt/UE_5.3', 'Engine', 'Binaries', 'DotNET', 'UnrealBuildTool', 'UnrealBuildTool')
    );
  });

  it('includes all expected path segments', async () => {
    mockFsPathExists.mockResolvedValue(true);

    const result = await resolveUnrealBuildToolPath('C:\\UE');

    const segments = result.split(path.sep);
    expect(segments).toContain('Engine');
    expect(segments).toContain('Binaries');
    expect(segments).toContain('DotNET');
    expect(segments).toContain('UnrealBuildTool');
  });

  it('passes constructed path to pathExists for validation', async () => {
    mockFsPathExists.mockResolvedValue(true);

    await resolveUnrealBuildToolPath('C:\\Engine');

    const checkedPath = mockFsPathExists.mock.calls[0][0] as string;
    expect(checkedPath).toContain('UnrealBuildTool');
    expect(checkedPath).toContain('DotNET');
    expect(checkedPath).toContain('Engine');
  });
});
