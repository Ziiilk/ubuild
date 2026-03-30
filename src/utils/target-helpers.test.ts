import { inferTargetType, isGenericTarget } from './target-helpers';
import { BUILD_TARGETS } from './constants';

describe('inferTargetType', () => {
  it('infers Editor from names containing "editor"', () => {
    expect(inferTargetType('MyProjectEditor')).toBe('Editor');
    expect(inferTargetType('UnrealEditor')).toBe('Editor');
    expect(inferTargetType('MyProjectEDITOR')).toBe('Editor');
    expect(inferTargetType('editor')).toBe('Editor');
  });

  it('infers Client from names containing "client"', () => {
    expect(inferTargetType('MyProjectClient')).toBe('Client');
    expect(inferTargetType('GameClient')).toBe('Client');
    expect(inferTargetType('CLIENT')).toBe('Client');
    expect(inferTargetType('client')).toBe('Client');
  });

  it('infers Server from names containing "server"', () => {
    expect(inferTargetType('MyProjectServer')).toBe('Server');
    expect(inferTargetType('DedicatedServer')).toBe('Server');
    expect(inferTargetType('SERVER')).toBe('Server');
    expect(inferTargetType('server')).toBe('Server');
  });

  it('defaults to Game for names without known type keywords', () => {
    expect(inferTargetType('MyProject')).toBe('Game');
    expect(inferTargetType('Game')).toBe('Game');
    expect(inferTargetType('Standalone')).toBe('Game');
    expect(inferTargetType('')).toBe('Game');
  });

  it('is case-insensitive', () => {
    expect(inferTargetType('MyProjectEditor')).toBe('Editor');
    expect(inferTargetType('MyProjectEDITOR')).toBe('Editor');
    expect(inferTargetType('myprojecteditor')).toBe('Editor');
    expect(inferTargetType('MyProjectClient')).toBe('Client');
    expect(inferTargetType('MYPROJECTCLIENT')).toBe('Client');
    expect(inferTargetType('MyProjectServer')).toBe('Server');
    expect(inferTargetType('MYPROJECTSERVER')).toBe('Server');
  });

  it('prioritizes Editor over Client and Server when multiple keywords present', () => {
    // "editor" is checked first in the function
    expect(inferTargetType('EditorClientServer')).toBe('Editor');
    expect(inferTargetType('ClientEditor')).toBe('Editor');
  });

  it('prioritizes Client over Server when both keywords present (no Editor)', () => {
    // "client" is checked before "server"
    expect(inferTargetType('ClientServer')).toBe('Client');
  });

  it('handles names with underscores and hyphens', () => {
    expect(inferTargetType('My_Project_Editor')).toBe('Editor');
    expect(inferTargetType('my-project-client')).toBe('Client');
    expect(inferTargetType('my_project_server')).toBe('Server');
    expect(inferTargetType('my-project-game')).toBe('Game');
  });

  it('handles names with numbers', () => {
    expect(inferTargetType('Project2Editor')).toBe('Editor');
    expect(inferTargetType('Client3D')).toBe('Client');
    expect(inferTargetType('Server42')).toBe('Server');
    expect(inferTargetType('Game2D')).toBe('Game');
  });
});

describe('isGenericTarget', () => {
  it('returns true for all standard BUILD_TARGETS', () => {
    for (const target of BUILD_TARGETS) {
      expect(isGenericTarget(target)).toBe(true);
    }
  });

  it('returns true for Editor', () => {
    expect(isGenericTarget('Editor')).toBe(true);
  });

  it('returns true for Game', () => {
    expect(isGenericTarget('Game')).toBe(true);
  });

  it('returns true for Client', () => {
    expect(isGenericTarget('Client')).toBe(true);
  });

  it('returns true for Server', () => {
    expect(isGenericTarget('Server')).toBe(true);
  });

  it('returns false for custom target names', () => {
    expect(isGenericTarget('MyCustomTarget')).toBe(false);
    expect(isGenericTarget('MyPluginTarget')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isGenericTarget('')).toBe(false);
  });

  it('returns false for case-variant of standard targets', () => {
    expect(isGenericTarget('editor')).toBe(false);
    expect(isGenericTarget('GAME')).toBe(false);
    expect(isGenericTarget('client')).toBe(false);
    expect(isGenericTarget('SERVER')).toBe(false);
  });

  it('returns false for target names that contain but are not exact matches', () => {
    expect(isGenericTarget('EditorGame')).toBe(false);
    expect(isGenericTarget('GameClient')).toBe(false);
    expect(isGenericTarget('ServerHost')).toBe(false);
  });

  it('acts as a type guard (narrows to BuildTarget)', () => {
    const value: string = 'Editor';
    if (isGenericTarget(value)) {
      // TypeScript should narrow value to BuildTarget here
      const _assigned: 'Editor' | 'Game' | 'Client' | 'Server' = value;
      expect(_assigned).toBe('Editor');
    } else {
      fail('Expected isGenericTarget to return true for "Editor"');
    }
  });
});
