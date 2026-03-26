import { inferTargetType, isGenericTarget } from './target-helpers';

describe('target-helpers', () => {
  describe('inferTargetType', () => {
    it('returns Editor for names containing editor', () => {
      expect(inferTargetType('MyProjectEditor')).toBe('Editor');
      expect(inferTargetType('editor')).toBe('Editor');
      expect(inferTargetType('EDITOR')).toBe('Editor');
      expect(inferTargetType('MyEditorTarget')).toBe('Editor');
    });

    it('returns Client for names containing client', () => {
      expect(inferTargetType('MyProjectClient')).toBe('Client');
      expect(inferTargetType('client')).toBe('Client');
      expect(inferTargetType('CLIENT')).toBe('Client');
      expect(inferTargetType('MyClientTarget')).toBe('Client');
    });

    it('returns Server for names containing server', () => {
      expect(inferTargetType('MyProjectServer')).toBe('Server');
      expect(inferTargetType('server')).toBe('Server');
      expect(inferTargetType('SERVER')).toBe('Server');
      expect(inferTargetType('MyServerTarget')).toBe('Server');
    });

    it('returns Game for names without type keywords', () => {
      expect(inferTargetType('MyProject')).toBe('Game');
      expect(inferTargetType('game')).toBe('Game');
      expect(inferTargetType('SomeRandomTarget')).toBe('Game');
    });

    it('handles empty string', () => {
      expect(inferTargetType('')).toBe('Game');
    });

    it('is case-insensitive', () => {
      expect(inferTargetType('myprojecteditor')).toBe('Editor');
      expect(inferTargetType('MYPROJECTEDITOR')).toBe('Editor');
      expect(inferTargetType('MyProjectEditor')).toBe('Editor');
    });

    it('prioritizes editor over client and server', () => {
      expect(inferTargetType('MyEditorClient')).toBe('Editor');
      expect(inferTargetType('MyEditorServer')).toBe('Editor');
    });

    it('prioritizes client over server', () => {
      expect(inferTargetType('MyClientServer')).toBe('Client');
    });
  });

  describe('isGenericTarget', () => {
    it('returns true for standard target types', () => {
      expect(isGenericTarget('Editor')).toBe(true);
      expect(isGenericTarget('Game')).toBe(true);
      expect(isGenericTarget('Client')).toBe(true);
      expect(isGenericTarget('Server')).toBe(true);
    });

    it('returns false for custom target names', () => {
      expect(isGenericTarget('MyProject')).toBe(false);
      expect(isGenericTarget('MyProjectEditor')).toBe(false);
      expect(isGenericTarget('CustomTarget')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isGenericTarget('')).toBe(false);
    });

    it('is case-sensitive', () => {
      expect(isGenericTarget('editor')).toBe(false);
      expect(isGenericTarget('EDITOR')).toBe(false);
      expect(isGenericTarget('Editor')).toBe(true);
    });
  });
});
