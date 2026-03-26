/** Represents the structure of a .uproject file.
 *
 * This interface matches the JSON structure of Unreal Engine project files.
 *
 * @see {@link ProjectInfo} for the detected project information derived from a UProject
 * @see {@link ProjectDetectionResult} for the result of project detection operations
 *
 * @example
 * ```typescript
 * const project: UProject = {
 *   FileVersion: 3,
 *   EngineAssociation: 'UE_5.3',
 *   Category: 'Games',
 *   Description: 'My awesome game',
 *   Modules: [
 *     {
 *       Name: 'MyGame',
 *       Type: 'Runtime',
 *       LoadingPhase: 'Default'
 *     }
 *   ],
 *   Plugins: [
 *     {
 *       Name: 'MyPlugin',
 *       Enabled: true
 *     }
 *   ]
 * };
 * ```
 */
export interface UProject {
  /** File format version (typically 3 for UE4/UE5) */
  FileVersion: number;
  /** Engine identifier (GUID or version string like "UE_5.3") */
  EngineAssociation: string;
  /** Project category (e.g., "Games", "Simulations") */
  Category?: string;
  /** Project description */
  Description?: string;
  /** Array of project modules with build configuration */
  Modules: Array<{
    /** Module name */
    Name: string;
    /** Module type determining when/how it loads */
    Type: 'Runtime' | 'Editor' | 'Developer' | 'Program' | 'Server';
    /** Loading phase for module initialization */
    LoadingPhase: 'Default' | 'PostConfigInit' | 'PreDefault' | string;
  }>;
  /** Optional array of plugins used by the project */
  Plugins?: Array<{
    /** Plugin name */
    Name: string;
    /** Whether the plugin is enabled */
    Enabled: boolean;
    /** Optional list of allowed target types */
    TargetAllowList?: string[];
  }>;
}

/** Information about a detected Unreal Engine project.
 *
 * @see {@link UProject} for the underlying project file structure
 * @see {@link ProjectDetectionResult} for the result containing this information
 *
 * @example
 * ```typescript
 * const info: ProjectInfo = {
 *   name: 'MyGame',
 *   path: 'C:/Projects/MyGame',
 *   uproject: { ... },
 *   sourceDir: 'C:/Projects/MyGame/Source',
 *   targets: [
 *     { name: 'MyGameEditor', type: 'Editor', path: '...' }
 *   ],
 *   modules: [
 *     { name: 'MyGame', path: '...' }
 *   ]
 * };
 * ```
 */
export interface ProjectInfo {
  /** Project name (derived from .uproject filename) */
  name: string;
  /** Absolute path to project directory */
  path: string;
  /** Parsed .uproject file contents */
  uproject: UProject;
  /** Path to Source directory (empty string if no Source folder) */
  sourceDir: string;
  /** Available build targets found in Source directory */
  targets: Array<{
    /** Target name (e.g., "MyGameEditor") */
    name: string;
    /** Target type */
    type: 'Editor' | 'Game' | 'Client' | 'Server';
    /** Absolute path to .Target.cs file */
    path: string;
  }>;
  /** Project modules found in Source directory */
  modules: Array<{
    /** Module name */
    name: string;
    /** Absolute path to module directory */
    path: string;
  }>;
}

/** Options for project detection operations.
 *
 * @see {@link ProjectDetectionResult} for the result type returned after detection
 * @see {@link ProjectPathResolution} for path resolution information
 *
 * @example
 * ```typescript
 * const options: ProjectDetectionOptions = {
 *   cwd: '/projects',
 *   recursive: true
 * };
 * ```
 */
export interface ProjectDetectionOptions {
  /** Working directory for detection (defaults to process.cwd()) */
  cwd?: string;
  /** Whether to search recursively for .uproject files */
  recursive?: boolean;
}

/** Result of a project detection operation.
 *
 * @see {@link ProjectInfo} for the detected project information
 * @see {@link ProjectDetectionOptions} for the options used to configure detection
 * @see {@link ProjectPathResolution} for path resolution results
 *
 * @example
 * ```typescript
 * const result: ProjectDetectionResult = {
 *   isValid: true,
 *   project: { ... },
 *   warnings: []
 * };
 * ```
 */
export interface ProjectDetectionResult {
  /** Whether a valid project was detected */
  isValid: boolean;
  /** Detected project info (if valid) */
  project?: ProjectInfo;
  /** Error message if detection failed */
  error?: string;
  /** Array of warning messages */
  warnings: string[];
}

/** Result of project path resolution.
 *
 * Contains information about how a project path was resolved from
 * the original input to the final absolute path.
 *
 * @see {@link ProjectDetectionResult} for the full detection result using this resolution
 * @see {@link ProjectDetectionOptions} for the options used when detecting projects
 *
 * @example
 * ```typescript
 * const resolution: ProjectPathResolution = {
 *   inputPath: './MyProject',
 *   resolvedPath: 'C:/Projects/MyProject/MyProject.uproject',
 *   isDirectory: false,
 *   wasResolvedFromDirectory: true,
 *   hasUProjectExtension: true
 * };
 * ```
 */
export interface ProjectPathResolution {
  /** Original input path as provided by user */
  inputPath: string;
  /** Resolved absolute path to .uproject file or directory */
  resolvedPath: string;
  /** Whether the resolved path is a directory */
  isDirectory: boolean;
  /** Whether resolution required finding .uproject inside a directory */
  wasResolvedFromDirectory: boolean;
  /** Whether the path has .uproject extension */
  hasUProjectExtension: boolean;
}
