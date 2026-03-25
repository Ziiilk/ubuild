/** Version information for an Unreal Engine installation. */
export interface EngineVersionInfo {
  /** Major version number (e.g., 5 for UE 5.x) */
  MajorVersion: number;
  /** Minor version number (e.g., 3 for UE 5.3) */
  MinorVersion: number;
  /** Patch version number */
  PatchVersion: number;
  /** Engine changelist number */
  Changelist: number;
  /** Compatible changelist for binary compatibility */
  CompatibleChangelist: number;
  /** Whether this is a licensee build */
  IsLicenseeVersion: number;
  /** Whether this is a promoted build */
  IsPromotedBuild: number;
  /** Source control branch name */
  BranchName: string;
  /** Build identifier string */
  BuildId: string;
}

/** Represents a detected Unreal Engine installation. */
export interface EngineInstallation {
  /** Absolute path to engine installation */
  path: string;
  /** Version information (if available) */
  version?: EngineVersionInfo;
  /** Association ID (GUID or version string) */
  associationId: string;
  /** Human-readable display name */
  displayName?: string;
  /** Installation date (ISO string) */
  installedDate?: string;
  /** Source of detection (registry, launcher, environment) */
  source?: 'registry' | 'launcher' | 'environment';
}

/** Engine association from a .uproject file. */
export interface EngineAssociation {
  /** Association GUID or version string */
  guid: string;
  /** Display name for the association */
  name?: string;
  /** Path to engine (if known) */
  path?: string;
  /** Version string (for non-GUID associations) */
  version?: string;
}

/** Result of an engine detection operation. */
export interface EngineDetectionResult {
  /** Detected engine installation */
  engine?: EngineInstallation;
  /** Engine association from project file */
  uprojectEngine?: EngineAssociation;
  /** Error message if detection failed */
  error?: string;
  /** Array of warning messages */
  warnings: string[];
}

/** Options for resolving engine paths. */
export interface EnginePathResolutionOptions {
  /** Path to project for context */
  projectPath?: string;
  /** Override engine path */
  enginePath?: string;
}
