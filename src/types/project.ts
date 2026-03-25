/** Represents the structure of a .uproject file. */
export interface UProject {
  /** File format version (typically 3) */
  FileVersion: number;
  /** Engine identifier (GUID or version string) */
  EngineAssociation: string;
  /** Project category */
  Category?: string;
  /** Project description */
  Description?: string;
  /** Array of project modules */
  Modules: Array<{
    Name: string;
    Type: 'Runtime' | 'Editor' | 'Developer' | 'Program' | 'Server';
    LoadingPhase: 'Default' | 'PostConfigInit' | 'PreDefault' | string;
  }>;
  /** Optional array of plugins */
  Plugins?: Array<{
    Name: string;
    Enabled: boolean;
    TargetAllowList?: string[];
  }>;
}

/** Information about a detected Unreal Engine project. */
export interface ProjectInfo {
  /** Project name */
  name: string;
  /** Absolute path to project directory */
  path: string;
  /** Parsed .uproject file contents */
  uproject: UProject;
  /** Path to Source directory (empty if none) */
  sourceDir: string;
  /** Available build targets */
  targets: Array<{
    name: string;
    type: 'Editor' | 'Game' | 'Client' | 'Server';
    path: string;
  }>;
  /** Project modules */
  modules: Array<{
    name: string;
    path: string;
  }>;
}

/** Options for project detection operations. */
export interface ProjectDetectionOptions {
  /** Working directory for detection (defaults to process.cwd()) */
  cwd?: string;
  /** Whether to search recursively for .uproject files */
  recursive?: boolean;
}

/** Result of a project detection operation. */
export interface ProjectDetectionResult {
  /** Whether a valid project was detected */
  isValid: boolean;
  /** Detected project info (if valid) */
  project?: ProjectInfo;
  /** Error message (if invalid) */
  error?: string;
  /** Array of warning messages */
  warnings: string[];
}

/** Result of project path resolution. */
export interface ProjectPathResolution {
  /** Original input path */
  inputPath: string;
  /** Resolved absolute path */
  resolvedPath: string;
  /** Whether the resolved path is a directory */
  isDirectory: boolean;
  /** Whether resolution required finding .uproject in directory */
  wasResolvedFromDirectory: boolean;
  /** Whether the path has .uproject extension */
  hasUProjectExtension: boolean;
}
