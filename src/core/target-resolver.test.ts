import { TargetResolver, ResolvedTarget } from './target-resolver';
import { BuildExecutor } from './build-executor';

// Mock BuildExecutor
jest.mock('./build-executor', () => ({
  BuildExecutor: {
    getAvailableTargets: jest.fn(),
  },
}));

describe('TargetResolver', () => {
  const mockGetAvailableTargets = jest.mocked(BuildExecutor.getAvailableTargets);

  beforeEach(() => {
    mockGetAvailableTargets.mockClear();
  });

  describe('resolveTargetName', () => {
    it('returns the original target when no available targets exist', async () => {
      mockGetAvailableTargets.mockResolvedValue([]);

      const result = await TargetResolver.resolveTargetName('/project', 'Editor');

      expect(result).toBe('Editor');
      expect(mockGetAvailableTargets).toHaveBeenCalledWith('/project');
    });

    it('resolves a generic Editor target to a matching target by type', async () => {
      const availableTargets: ResolvedTarget[] = [
        { name: 'MyGame', type: 'Game' },
        { name: 'MyGameEditor', type: 'Editor' },
      ];
      mockGetAvailableTargets.mockResolvedValue(availableTargets);

      const result = await TargetResolver.resolveTargetName('/project', 'Editor');

      expect(result).toBe('MyGameEditor');
    });

    it('resolves a generic Game target to a matching target by type', async () => {
      const availableTargets: ResolvedTarget[] = [
        { name: 'MyGame', type: 'Game' },
        { name: 'MyGameEditor', type: 'Editor' },
      ];
      mockGetAvailableTargets.mockResolvedValue(availableTargets);

      const result = await TargetResolver.resolveTargetName('/project', 'Game');

      expect(result).toBe('MyGame');
    });

    it('resolves a generic Client target to a matching target by type', async () => {
      const availableTargets: ResolvedTarget[] = [
        { name: 'MyGame', type: 'Game' },
        { name: 'MyGameClient', type: 'Client' },
      ];
      mockGetAvailableTargets.mockResolvedValue(availableTargets);

      const result = await TargetResolver.resolveTargetName('/project', 'Client');

      expect(result).toBe('MyGameClient');
    });

    it('resolves a generic Server target to a matching target by type', async () => {
      const availableTargets: ResolvedTarget[] = [
        { name: 'MyGame', type: 'Game' },
        { name: 'MyGameServer', type: 'Server' },
      ];
      mockGetAvailableTargets.mockResolvedValue(availableTargets);

      const result = await TargetResolver.resolveTargetName('/project', 'Server');

      expect(result).toBe('MyGameServer');
    });

    it('falls back to name matching when type matching fails', async () => {
      const availableTargets: ResolvedTarget[] = [
        { name: 'MyGame', type: 'Game' },
        { name: 'SomeRandomEditorTarget', type: 'Utility' },
      ];
      mockGetAvailableTargets.mockResolvedValue(availableTargets);

      const result = await TargetResolver.resolveTargetName('/project', 'Editor');

      expect(result).toBe('SomeRandomEditorTarget');
    });

    it('returns undefined when no matching target is found for generic type', async () => {
      const availableTargets: ResolvedTarget[] = [
        { name: 'MyGame', type: 'Game' },
        { name: 'AnotherGame', type: 'Game' },
      ];
      mockGetAvailableTargets.mockResolvedValue(availableTargets);

      const result = await TargetResolver.resolveTargetName('/project', 'Editor');

      expect(result).toBeUndefined();
    });

    it('returns the specific target name when it exists in available targets', async () => {
      const availableTargets: ResolvedTarget[] = [
        { name: 'MyGame', type: 'Game' },
        { name: 'MyGameEditor', type: 'Editor' },
      ];
      mockGetAvailableTargets.mockResolvedValue(availableTargets);

      const result = await TargetResolver.resolveTargetName('/project', 'MyGameEditor');

      expect(result).toBe('MyGameEditor');
    });

    it('returns undefined when specific target name does not exist', async () => {
      const availableTargets: ResolvedTarget[] = [
        { name: 'MyGame', type: 'Game' },
        { name: 'MyGameEditor', type: 'Editor' },
      ];
      mockGetAvailableTargets.mockResolvedValue(availableTargets);

      const result = await TargetResolver.resolveTargetName('/project', 'NonExistentTarget');

      expect(result).toBeUndefined();
    });

    it('resolves multiple space-separated targets', async () => {
      const availableTargets: ResolvedTarget[] = [
        { name: 'MyGame', type: 'Game' },
        { name: 'MyGameEditor', type: 'Editor' },
        { name: 'MyGameServer', type: 'Server' },
      ];
      mockGetAvailableTargets.mockResolvedValue(availableTargets);

      const result = await TargetResolver.resolveTargetName('/project', 'Editor Game Server');

      expect(result).toBe('MyGameEditor MyGame MyGameServer');
    });

    it('filters out unresolved targets when resolving multiple targets', async () => {
      const availableTargets: ResolvedTarget[] = [
        { name: 'MyGame', type: 'Game' },
        { name: 'MyGameEditor', type: 'Editor' },
      ];
      mockGetAvailableTargets.mockResolvedValue(availableTargets);

      const result = await TargetResolver.resolveTargetName('/project', 'Editor NonExistent');

      expect(result).toBe('MyGameEditor');
    });

    it('returns undefined when all targets fail to resolve', async () => {
      const availableTargets: ResolvedTarget[] = [
        { name: 'MyGame', type: 'Game' },
        { name: 'MyGameEditor', type: 'Editor' },
      ];
      mockGetAvailableTargets.mockResolvedValue(availableTargets);

      const result = await TargetResolver.resolveTargetName(
        '/project',
        'NonExistent1 NonExistent2'
      );

      expect(result).toBeUndefined();
    });

    it('handles empty target string', async () => {
      const availableTargets: ResolvedTarget[] = [{ name: 'MyGame', type: 'Game' }];
      mockGetAvailableTargets.mockResolvedValue(availableTargets);

      const result = await TargetResolver.resolveTargetName('/project', '');

      expect(result).toBeUndefined();
    });

    it('handles target string with only whitespace', async () => {
      const availableTargets: ResolvedTarget[] = [{ name: 'MyGame', type: 'Game' }];
      mockGetAvailableTargets.mockResolvedValue(availableTargets);

      const result = await TargetResolver.resolveTargetName('/project', '   ');

      expect(result).toBeUndefined();
    });

    it('performs case-insensitive fallback matching for generic types', async () => {
      const availableTargets: ResolvedTarget[] = [{ name: 'MySuperEditor', type: 'Utility' }];
      mockGetAvailableTargets.mockResolvedValue(availableTargets);

      // "Editor" is a generic type, so fallback name matching is case-insensitive
      const result = await TargetResolver.resolveTargetName('/project', 'Editor');

      expect(result).toBe('MySuperEditor');
    });
  });

  describe('resolveTarget', () => {
    it('returns resolved target when resolution succeeds', async () => {
      const availableTargets: ResolvedTarget[] = [
        { name: 'MyGame', type: 'Game' },
        { name: 'MyGameEditor', type: 'Editor' },
      ];
      mockGetAvailableTargets.mockResolvedValue(availableTargets);

      const result = await TargetResolver.resolveTarget('/project', 'Editor');

      expect(result).toBe('MyGameEditor');
    });

    it('returns original target when resolution returns undefined', async () => {
      const availableTargets: ResolvedTarget[] = [{ name: 'MyGame', type: 'Game' }];
      mockGetAvailableTargets.mockResolvedValue(availableTargets);

      const result = await TargetResolver.resolveTarget('/project', 'NonExistent');

      expect(result).toBe('NonExistent');
    });

    it('returns original target when no available targets exist', async () => {
      mockGetAvailableTargets.mockResolvedValue([]);

      const result = await TargetResolver.resolveTarget('/project', 'Editor');

      expect(result).toBe('Editor');
    });
  });

  describe('isGenericTarget', () => {
    it('returns true for Editor', () => {
      expect(TargetResolver.isGenericTarget('Editor')).toBe(true);
    });

    it('returns true for Game', () => {
      expect(TargetResolver.isGenericTarget('Game')).toBe(true);
    });

    it('returns true for Client', () => {
      expect(TargetResolver.isGenericTarget('Client')).toBe(true);
    });

    it('returns true for Server', () => {
      expect(TargetResolver.isGenericTarget('Server')).toBe(true);
    });

    it('returns false for specific target names', () => {
      expect(TargetResolver.isGenericTarget('MyGame')).toBe(false);
      expect(TargetResolver.isGenericTarget('MyGameEditor')).toBe(false);
      expect(TargetResolver.isGenericTarget('SomeOtherTarget')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(TargetResolver.isGenericTarget('')).toBe(false);
    });

    it('is case-sensitive (only exact case matches)', () => {
      expect(TargetResolver.isGenericTarget('editor')).toBe(false);
      expect(TargetResolver.isGenericTarget('EDITOR')).toBe(false);
      expect(TargetResolver.isGenericTarget('Editor')).toBe(true);
    });
  });

  describe('getGenericTargets', () => {
    it('returns all generic target types', () => {
      const targets = TargetResolver.getGenericTargets();

      expect(targets).toEqual(['Editor', 'Game', 'Client', 'Server']);
    });

    it('returns readonly array', () => {
      const targets = TargetResolver.getGenericTargets();

      // TypeScript should prevent modification at compile time
      // At runtime, we verify the array contains expected values
      expect(targets).toHaveLength(4);
      expect(targets).toContain('Editor');
      expect(targets).toContain('Game');
      expect(targets).toContain('Client');
      expect(targets).toContain('Server');
    });
  });
});
