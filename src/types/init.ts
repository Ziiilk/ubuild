/** Supported project types for initialization. */
export type ProjectType = 'cpp' | 'blueprint' | 'blank';

/** Options for initializing a new project. */
export interface InitOptions {
  /** Project name (alphanumeric, underscores, hyphens) */
  name: string;
  /** Project type (cpp, blueprint, blank) */
  type?: ProjectType;
  /** Project template name */
  template?: string;
  /** Path to Unreal Engine installation */
  enginePath?: string;
  /** Directory to create project in */
  directory?: string;
  /** Force initialization even if directory is not empty */
  force?: boolean;
}

/** Result of a project initialization operation. */
export interface InitResult {
  /** Whether initialization succeeded */
  success: boolean;
  /** Path to created project directory */
  projectPath: string;
  /** Path to created .uproject file */
  uprojectPath: string;
  /** Engine association ID used in project */
  engineAssociation: string;
  /** Array of paths to created files */
  createdFiles: string[];
  /** Error message if initialization failed */
  error?: string;
}
