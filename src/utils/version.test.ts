import { compareVersions, isGreaterThan, isLessThan, isEqual } from './version';

describe('Version utilities', () => {
  describe('compareVersions', () => {
    it('returns 0 for identical versions', () => {
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
      expect(compareVersions('2.5.3', '2.5.3')).toBe(0);
    });

    it('returns negative when first version is lower', () => {
      expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
      expect(compareVersions('1.0.0', '1.1.0')).toBeLessThan(0);
      expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0);
    });

    it('returns positive when first version is higher', () => {
      expect(compareVersions('1.0.1', '1.0.0')).toBeGreaterThan(0);
      expect(compareVersions('1.1.0', '1.0.0')).toBeGreaterThan(0);
      expect(compareVersions('2.0.0', '1.0.0')).toBeGreaterThan(0);
    });

    it('handles different version lengths', () => {
      expect(compareVersions('1.0', '1.0.0')).toBe(0);
      expect(compareVersions('1', '1.0.0')).toBe(0);
      expect(compareVersions('1.0.0.0', '1.0.0')).toBe(0);
    });

    it('treats missing parts as 0', () => {
      expect(compareVersions('1.0', '1.0.1')).toBeLessThan(0);
      expect(compareVersions('1.0.1', '1.0')).toBeGreaterThan(0);
    });

    it('handles multi-digit version components', () => {
      expect(compareVersions('10.0.0', '2.0.0')).toBeGreaterThan(0);
      expect(compareVersions('1.20.0', '1.5.0')).toBeGreaterThan(0);
      expect(compareVersions('1.0.100', '1.0.99')).toBeGreaterThan(0);
    });

    it('handles complex version comparisons', () => {
      expect(compareVersions('0.0.8', '0.0.9')).toBeLessThan(0);
      expect(compareVersions('0.0.8', '0.0.8')).toBe(0);
      expect(compareVersions('0.0.8', '0.0.7')).toBeGreaterThan(0);
    });

    it('handles version strings with many parts', () => {
      expect(compareVersions('1.2.3.4.5', '1.2.3.4.5')).toBe(0);
      expect(compareVersions('1.2.3.4.5', '1.2.3.4.4')).toBeGreaterThan(0);
      expect(compareVersions('1.2.3.4.4', '1.2.3.4.5')).toBeLessThan(0);
    });

    it('treats non-numeric parts as NaN (falsy → 0)', () => {
      // Number('alpha') = NaN, NaN || 0 = 0
      // This documents the current behavior: non-numeric segments collapse to 0
      expect(compareVersions('1.0.0-alpha', '1.0.0')).toBe(0);
      expect(compareVersions('1.0.0-beta', '1.0.0')).toBe(0);
      expect(compareVersions('1.0.0-rc.1', '1.0.0')).toBe(0);
    });

    it('treats two non-numeric versions as equal', () => {
      // Both collapse to NaN → 0, so they compare as equal
      expect(compareVersions('alpha', 'beta')).toBe(0);
      expect(compareVersions('prerelease', '0.0.0')).toBe(0);
    });

    it('handles single-component versions', () => {
      expect(compareVersions('5', '5')).toBe(0);
      expect(compareVersions('5', '4')).toBeGreaterThan(0);
      expect(compareVersions('4', '5')).toBeLessThan(0);
    });

    it('handles leading zeros in version parts', () => {
      // Number('01') = 1, so '01' and '1' are equivalent
      expect(compareVersions('01.0', '1.0')).toBe(0);
      expect(compareVersions('1.01', '1.1')).toBe(0);
    });

    it('handles very large version numbers', () => {
      expect(compareVersions('999999.0.0', '1000000.0.0')).toBeLessThan(0);
      expect(compareVersions('1000000.0.0', '999999.0.0')).toBeGreaterThan(0);
    });
  });

  describe('isGreaterThan', () => {
    it('returns true when first version is greater', () => {
      expect(isGreaterThan('2.0.0', '1.0.0')).toBe(true);
      expect(isGreaterThan('1.1.0', '1.0.0')).toBe(true);
      expect(isGreaterThan('1.0.1', '1.0.0')).toBe(true);
    });

    it('returns false when versions are equal', () => {
      expect(isGreaterThan('1.0.0', '1.0.0')).toBe(false);
    });

    it('returns false when first version is lower', () => {
      expect(isGreaterThan('1.0.0', '2.0.0')).toBe(false);
    });
  });

  describe('isLessThan', () => {
    it('returns true when first version is lower', () => {
      expect(isLessThan('1.0.0', '2.0.0')).toBe(true);
      expect(isLessThan('1.0.0', '1.1.0')).toBe(true);
      expect(isLessThan('1.0.0', '1.0.1')).toBe(true);
    });

    it('returns false when versions are equal', () => {
      expect(isLessThan('1.0.0', '1.0.0')).toBe(false);
    });

    it('returns false when first version is greater', () => {
      expect(isLessThan('2.0.0', '1.0.0')).toBe(false);
    });
  });

  describe('isEqual', () => {
    it('returns true for identical versions', () => {
      expect(isEqual('1.0.0', '1.0.0')).toBe(true);
      expect(isEqual('2.5.3', '2.5.3')).toBe(true);
    });

    it('returns true for equivalent versions with different lengths', () => {
      expect(isEqual('1.0', '1.0.0')).toBe(true);
      expect(isEqual('1', '1.0.0')).toBe(true);
    });

    it('returns false for different versions', () => {
      expect(isEqual('1.0.0', '1.0.1')).toBe(false);
      expect(isEqual('2.0.0', '1.0.0')).toBe(false);
    });
  });

  describe('prerelease version handling', () => {
    describe('compareVersions', () => {
      it('treats prerelease as equal to its release version', () => {
        expect(compareVersions('1.0.0-rc.1', '1.0.0')).toBe(0);
        expect(compareVersions('1.0.0', '1.0.0-rc.1')).toBe(0);
        expect(compareVersions('2.5.3-alpha', '2.5.3')).toBe(0);
      });

      it('treats different prerelease tags on same version as equal', () => {
        expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBe(0);
        expect(compareVersions('1.0.0-rc.1', '1.0.0-rc.2')).toBe(0);
      });

      it('compares prerelease against different release versions correctly', () => {
        expect(compareVersions('2.0.0-rc.1', '1.0.0')).toBeGreaterThan(0);
        expect(compareVersions('1.0.0-rc.1', '1.0.1')).toBeLessThan(0);
        expect(compareVersions('3.0.0-beta.1', '2.9.9')).toBeGreaterThan(0);
      });

      it('handles versions with multiple hyphen segments', () => {
        expect(compareVersions('1.0.0-rc.1+build', '1.0.0')).toBe(0);
      });
    });

    describe('isGreaterThan with prerelease', () => {
      it('returns false when prerelease equals release', () => {
        expect(isGreaterThan('1.0.0-rc.1', '1.0.0')).toBe(false);
      });

      it('returns true when prerelease of higher version vs lower release', () => {
        expect(isGreaterThan('2.0.0-beta', '1.0.0')).toBe(true);
      });

      it('returns false when prerelease of lower version vs higher release', () => {
        expect(isGreaterThan('1.0.0-alpha', '2.0.0')).toBe(false);
      });
    });

    describe('isLessThan with prerelease', () => {
      it('returns false when prerelease equals release', () => {
        expect(isLessThan('1.0.0-rc.1', '1.0.0')).toBe(false);
      });

      it('returns true when prerelease of lower version vs higher release', () => {
        expect(isLessThan('1.0.0-alpha', '1.0.1')).toBe(true);
      });
    });

    describe('isEqual with prerelease', () => {
      it('returns true when prerelease matches release', () => {
        expect(isEqual('1.0.0-rc.1', '1.0.0')).toBe(true);
        expect(isEqual('2.5.3-beta.2', '2.5.3')).toBe(true);
      });

      it('returns true when both versions have prerelease tags', () => {
        expect(isEqual('1.0.0-alpha', '1.0.0-beta')).toBe(true);
      });

      it('returns false when prerelease version differs from release', () => {
        expect(isEqual('1.0.0-rc.1', '1.0.1')).toBe(false);
      });
    });
  });
});
