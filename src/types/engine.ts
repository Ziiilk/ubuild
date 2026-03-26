/**
 * Version information for an Unreal Engine installation.
 *
 * @see {@link EngineInstallation} for the engine installation containing this version info
 */
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
  /** Whether this is a licensee build (0 = no, 1 = yes) */
  IsLicenseeVersion: number;
  /** Whether this is a promoted build (0 = no, 1 = yes) */
  IsPromotedBuild: number;
  /** Source control branch name (e.g., "++UE5+Release-5.3") */
  BranchName: string;
  /** Build identifier string */
  BuildId: string;
}

/** Represents a detected Unreal Engine installation.
 *
 * @see {@link EngineVersionInfo} for detailed version information
 * @see {@link EngineDetectionResult} for the detection result containing this installation
 * @see {@link EngineAssociation} for engine association from .uproject files
 *
 * @example
 * ```typescript
 * const engine: EngineInstallation = {
 *   path: 'C:/Program Files/Epic Games/UE_5.3',
 *   associationId: '{12345678-1234-1234-1234-123456789012}',
 *   displayName: 'Unreal Engine 5.3',
 *   source: 'launcher'
 * };
 * ```
 */
export interface EngineInstallation {
  /** Absolute path to engine installation directory */
  path: string;
  /** Version information (if available from engine) */
  version?: EngineVersionInfo;
  /** Association ID (GUID or version string like "UE_5.3") */
  associationId: string;
  /** Human-readable display name for the engine */
  displayName?: string;
  /** Installation date as ISO string (if available) */
  installedDate?: string;
  /** Source of engine detection */
  source?: 'registry' | 'launcher' | 'environment';
}

/** Engine association from a .uproject file.
 *
 * @see {@link EngineDetectionResult} for the detection result containing this association
 *
 * @example
 * ```typescript
 * const association: EngineAssociation = {
 *   guid: '5.3',
 *   name: 'UE 5.3',
 *   path: 'C:/Program Files/Epic Games/UE_5.3'
 * };
 * ```
 */
export interface EngineAssociation {
  /** Association GUID or version string from .uproject */
  guid: string;
  /** Display name for the association */
  name?: string;
  /** Path to engine (if known/resolved) */
  path?: string;
  /** Version string (for non-GUID associations like "UE_5.3") */
  version?: string;
}

/** Result of an engine detection operation.
 *
 * @see {@link EngineInstallation} for the detected engine information
 * @see {@link EngineAssociation} for the engine association from the project
 * @see {@link EnginePathResolutionOptions} for options to configure path resolution
 *
 * @example
 * ```typescript
 * const result: EngineDetectionResult = {
 *   engine: {
 *     path: 'C:/Program Files/Epic Games/UE_5.3',
 *     associationId: 'UE_5.3',
 *     displayName: 'Unreal Engine 5.3'
 *   },
 *   uprojectEngine: {
 *     guid: 'UE_5.3',
 *     version: '5.3'
 *   },
 *   warnings: []
 * };
 * ```
 */
export interface EngineDetectionResult {
  /** Detected engine installation (if found) */
  engine?: EngineInstallation;
  /** Engine association from project file */
  uprojectEngine?: EngineAssociation;
  /** Error message if detection failed */
  error?: string;
  /** Array of warning messages during detection */
  warnings: string[];
}

/** Options for resolving engine paths.
 *
 * @see {@link EngineDetectionResult} for the result of detection using these options
 *
 * @example
 * ```typescript
 * const options: EnginePathResolutionOptions = {
 *   projectPath: './MyProject',
 *   enginePath: '/custom/engine/path'
 * };
 * ```
 */
export interface EnginePathResolutionOptions {
  /** Path to project for context (to read .uproject association) */
  projectPath?: string;
  /** Override engine path (bypasses auto-detection) */
  enginePath?: string;
}
