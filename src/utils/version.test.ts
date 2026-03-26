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
});
