import { SwitchOptions, SwitchResult } from './switch';
import { Writable } from 'stream';

describe('Switch Types', () => {
  describe('SwitchOptions interface', () => {
    it('can be constructed with minimal properties', () => {
      const options: SwitchOptions = {};
      expect(options).toBeDefined();
    });

    it('can be constructed with all properties', () => {
      const stdout = new Writable({ write: () => {} });
      const stderr = new Writable({ write: () => {} });

      const options: SwitchOptions = {
        projectPath: '/path/to/project',
        enginePath: '/path/to/engine',
        stdout,
        stderr,
      };

      expect(options.projectPath).toBe('/path/to/project');
      expect(options.enginePath).toBe('/path/to/engine');
      expect(options.stdout).toBe(stdout);
      expect(options.stderr).toBe(stderr);
    });
  });

  describe('SwitchResult interface', () => {
    it('can be constructed for successful switch', () => {
      const result: SwitchResult = {
        success: true,
        previousAssociation: '5.3',
        newAssociation: '5.4',
        uprojectPath: 'C:/Projects/MyGame/MyGame.uproject',
      };

      expect(result.success).toBe(true);
      expect(result.previousAssociation).toBe('5.3');
      expect(result.newAssociation).toBe('5.4');
      expect(result.uprojectPath).toBe('C:/Projects/MyGame/MyGame.uproject');
      expect(result.error).toBeUndefined();
    });

    it('can be constructed for failed switch', () => {
      const result: SwitchResult = {
        success: false,
        previousAssociation: '5.3',
        newAssociation: '5.3',
        uprojectPath: 'C:/Projects/MyGame/MyGame.uproject',
        error: 'No engines found',
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe('No engines found');
    });

    it('can be constructed for no-op switch', () => {
      const result: SwitchResult = {
        success: true,
        previousAssociation: '5.3',
        newAssociation: '5.3',
        uprojectPath: 'C:/Projects/MyGame/MyGame.uproject',
      };

      expect(result.success).toBe(true);
      expect(result.previousAssociation).toBe(result.newAssociation);
    });
  });
});
