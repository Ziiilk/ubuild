import {
  EngineVersionInfo,
  EngineInstallation,
  EngineAssociation,
  EngineDetectionResult,
  EnginePathResolutionOptions,
} from './engine';

describe('Engine Types', () => {
  describe('EngineVersionInfo interface', () => {
    it('can be constructed with all required properties', () => {
      const version: EngineVersionInfo = {
        MajorVersion: 5,
        MinorVersion: 3,
        PatchVersion: 2,
        Changelist: 12345,
        CompatibleChangelist: 12340,
        IsLicenseeVersion: 0,
        IsPromotedBuild: 1,
        BranchName: '++UE5+Release-5.3',
        BuildId: '5.3.2-12345+++UE5+Release-5.3',
      };

      expect(version.MajorVersion).toBe(5);
      expect(version.MinorVersion).toBe(3);
      expect(version.PatchVersion).toBe(2);
      expect(version.Changelist).toBe(12345);
      expect(version.CompatibleChangelist).toBe(12340);
      expect(version.IsLicenseeVersion).toBe(0);
      expect(version.IsPromotedBuild).toBe(1);
      expect(version.BranchName).toBe('++UE5+Release-5.3');
      expect(version.BuildId).toBe('5.3.2-12345+++UE5+Release-5.3');
    });

    it('handles different version numbers', () => {
      const version: EngineVersionInfo = {
        MajorVersion: 4,
        MinorVersion: 27,
        PatchVersion: 0,
        Changelist: 99999,
        CompatibleChangelist: 99990,
        IsLicenseeVersion: 1,
        IsPromotedBuild: 0,
        BranchName: '++UE4+Release-4.27',
        BuildId: '4.27.0-99999+++UE4+Release-4.27',
      };

      expect(version.MajorVersion).toBe(4);
      expect(version.MinorVersion).toBe(27);
    });
  });

  describe('EngineInstallation interface', () => {
    it('can be constructed with minimal required properties', () => {
      const engine: EngineInstallation = {
        path: 'C:/Program Files/Epic Games/UE_5.3',
        associationId: 'UE_5.3',
      };

      expect(engine.path).toBe('C:/Program Files/Epic Games/UE_5.3');
      expect(engine.associationId).toBe('UE_5.3');
      expect(engine.version).toBeUndefined();
      expect(engine.displayName).toBeUndefined();
      expect(engine.installedDate).toBeUndefined();
      expect(engine.source).toBeUndefined();
    });

    it('can be constructed with all properties', () => {
      const version: EngineVersionInfo = {
        MajorVersion: 5,
        MinorVersion: 3,
        PatchVersion: 0,
        Changelist: 10000,
        CompatibleChangelist: 9999,
        IsLicenseeVersion: 0,
        IsPromotedBuild: 1,
        BranchName: '++UE5+Release-5.3',
        BuildId: '5.3.0-10000',
      };

      const engine: EngineInstallation = {
        path: 'C:/Program Files/Epic Games/UE_5.3',
        version: version,
        associationId: '{12345678-1234-1234-1234-123456789012}',
        displayName: 'Unreal Engine 5.3',
        installedDate: '2024-01-15T10:30:00Z',
        source: 'launcher',
      };

      expect(engine.path).toBe('C:/Program Files/Epic Games/UE_5.3');
      expect(engine.version).toEqual(version);
      expect(engine.associationId).toBe('{12345678-1234-1234-1234-123456789012}');
      expect(engine.displayName).toBe('Unreal Engine 5.3');
      expect(engine.installedDate).toBe('2024-01-15T10:30:00Z');
      expect(engine.source).toBe('launcher');
    });

    it('supports different source types', () => {
      const sources: Array<'registry' | 'launcher' | 'environment' | undefined> = [
        'registry',
        'launcher',
        'environment',
        undefined,
      ];

      sources.forEach((source) => {
        const engine: EngineInstallation = {
          path: 'C:/Engine',
          associationId: 'UE_5.3',
          source: source,
        };
        expect(engine.source).toBe(source);
      });
    });

    it('supports GUID-based association IDs', () => {
      const engine: EngineInstallation = {
        path: 'C:/CustomEngine',
        associationId: '{87654321-4321-4321-4321-210987654321}',
        displayName: 'Custom Engine',
      };

      expect(engine.associationId).toBe('{87654321-4321-4321-4321-210987654321}');
    });
  });

  describe('EngineAssociation interface', () => {
    it('can be constructed with minimal required properties', () => {
      const association: EngineAssociation = {
        guid: 'UE_5.3',
      };

      expect(association.guid).toBe('UE_5.3');
      expect(association.name).toBeUndefined();
      expect(association.path).toBeUndefined();
      expect(association.version).toBeUndefined();
    });

    it('can be constructed with all properties', () => {
      const association: EngineAssociation = {
        guid: '5.3',
        name: 'UE 5.3',
        path: 'C:/Program Files/Epic Games/UE_5.3',
        version: '5.3.0',
      };

      expect(association.guid).toBe('5.3');
      expect(association.name).toBe('UE 5.3');
      expect(association.path).toBe('C:/Program Files/Epic Games/UE_5.3');
      expect(association.version).toBe('5.3.0');
    });

    it('handles GUID format associations', () => {
      const association: EngineAssociation = {
        guid: '{12345678-1234-1234-1234-123456789012}',
        name: 'Epic Games Launcher Engine',
      };

      expect(association.guid).toBe('{12345678-1234-1234-1234-123456789012}');
    });
  });

  describe('EngineDetectionResult interface', () => {
    it('can be constructed for successful detection', () => {
      const engine: EngineInstallation = {
        path: 'C:/Program Files/Epic Games/UE_5.3',
        associationId: 'UE_5.3',
        displayName: 'Unreal Engine 5.3',
      };

      const uprojectEngine: EngineAssociation = {
        guid: 'UE_5.3',
        version: '5.3',
      };

      const result: EngineDetectionResult = {
        engine: engine,
        uprojectEngine: uprojectEngine,
        warnings: [],
      };

      expect(result.engine).toEqual(engine);
      expect(result.uprojectEngine).toEqual(uprojectEngine);
      expect(result.warnings).toHaveLength(0);
      expect(result.error).toBeUndefined();
    });

    it('can be constructed with warnings', () => {
      const result: EngineDetectionResult = {
        engine: {
          path: 'C:/Engine',
          associationId: 'UE_5.3',
        },
        warnings: ['Multiple engine versions found', 'Engine path contains spaces'],
      };

      expect(result.warnings).toHaveLength(2);
      expect(result.warnings[0]).toBe('Multiple engine versions found');
    });

    it('can be constructed for failed detection', () => {
      const result: EngineDetectionResult = {
        warnings: [],
        error: 'No engine installation found',
      };

      expect(result.engine).toBeUndefined();
      expect(result.error).toBe('No engine installation found');
    });

    it('can be constructed without uproject engine info', () => {
      const result: EngineDetectionResult = {
        engine: {
          path: 'C:/Engine',
          associationId: 'UE_5.3',
        },
        warnings: [],
      };

      expect(result.uprojectEngine).toBeUndefined();
    });
  });

  describe('EnginePathResolutionOptions interface', () => {
    it('can be constructed with minimal properties', () => {
      const options: EnginePathResolutionOptions = {};
      expect(options).toBeDefined();
    });

    it('can be constructed with all properties', () => {
      const options: EnginePathResolutionOptions = {
        projectPath: './MyProject',
        enginePath: '/custom/engine/path',
      };

      expect(options.projectPath).toBe('./MyProject');
      expect(options.enginePath).toBe('/custom/engine/path');
    });

    it('can be constructed with only project path', () => {
      const options: EnginePathResolutionOptions = {
        projectPath: './MyProject',
      };

      expect(options.projectPath).toBe('./MyProject');
      expect(options.enginePath).toBeUndefined();
    });

    it('can be constructed with only engine path override', () => {
      const options: EnginePathResolutionOptions = {
        enginePath: '/custom/engine',
      };

      expect(options.enginePath).toBe('/custom/engine');
      expect(options.projectPath).toBeUndefined();
    });
  });
});
