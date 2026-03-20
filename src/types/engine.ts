export interface EngineVersionInfo {
  MajorVersion: number;
  MinorVersion: number;
  PatchVersion: number;
  Changelist: number;
  CompatibleChangelist: number;
  IsLicenseeVersion: number;
  IsPromotedBuild: number;
  BranchName: string;
  BuildId: string;
}

export interface EngineInstallation {
  path: string;
  version?: EngineVersionInfo;
  associationId: string;
  displayName?: string;
  installedDate?: string;
  source?: 'registry' | 'launcher' | 'environment';
}

export interface EngineAssociation {
  guid: string;
  name?: string;
  path?: string;
  version?: string;
}

export interface EngineDetectionResult {
  engine?: EngineInstallation;
  uprojectEngine?: EngineAssociation;
  error?: string;
  warnings: string[];
}

export interface EnginePathResolutionOptions {
  projectPath?: string;
  enginePath?: string;
}
