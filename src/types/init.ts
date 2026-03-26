/**
 * Supported project types for initialization.
 *
 * Defines the type of Unreal Engine project to create during initialization.
 * Each type determines the project structure and initial files created.
 *
 * - 'cpp' - C++ project with Source directory, module files, and build scripts
 * - 'blueprint' - Blueprint-only project with Content directory for assets
 * - 'blank' - Minimal empty project with basic structure
 *
 * @example
 * ```typescript
 * const type: ProjectType = 'cpp';       // Create C++ project
 * const type2: ProjectType = 'blueprint'; // Create Blueprint project
 * ```
 *
 * @see {@link InitOptions} for options that use this type
 * @see {@link ProjectInitializer} for the initialization implementation
 */
export type ProjectType = 'cpp' | 'blueprint' | 'blank';

/**
 * Options for initializing a new Unreal Engine project.
 *
 * Configures the creation of a new Unreal Engine project including
 * the project name, type, template, and target directory. The project
 * type determines the initial structure and files created.
 *
 * @example
 * ```typescript
 * const options: InitOptions = {
 *   name: 'MyGame',
 *   type: 'cpp',
 *   template: 'ThirdPerson'
 * };
 * ```
 *
 * @see {@link InitResult} for the result returned after initialization
 * @see {@link ProjectType} for valid project type values
 * @see {@link ProjectInitializer} for the initialization implementation
 */
export interface InitOptions {
  /**
   * Project name (required).
   * Must contain only alphanumeric characters, underscores, and hyphens.
   * This name will be used for the project directory, .uproject file,
   * and as the default module name for C++ projects.
   * @example 'MyGame', 'ThirdPersonShooter', 'My_Project-2'
   */
  name: string;

  /**
   * Project type determining the initial structure.
   * - 'cpp' - Creates Source directory with module and target files
   * - 'blueprint' - Creates Content directory for Blueprint assets
   * - 'blank' - Minimal project structure
   * @default 'cpp'
   * @see {@link ProjectType}
   */
  type?: ProjectType;

  /**
   * Project template name.
   * Specifies which template to use as a starting point for the project.
   * Common templates include 'Basic', 'FirstPerson', 'ThirdPerson', etc.
   * @default 'Basic'
   */
  template?: string;

  /**
   * Path to Unreal Engine installation.
   * If not provided, the engine will be auto-detected from available
   * installations or the user will be prompted to select one.
   */
  enginePath?: string;

  /**
   * Directory to create the project in.
   * If not provided, defaults to './{name}' (current working directory
   * with the project name as subdirectory).
   * @default process.cwd() + '/' + name
   */
  directory?: string;

  /**
   * Force initialization even if the target directory is not empty.
   * When true, existing files may be overwritten. Use with caution.
   * @default false
   */
  force?: boolean;
}

/**
 * Result of a project initialization operation.
 *
 * Contains information about the success of the initialization and
 * details about the created project including paths to all generated files.
 *
 * @example
 * ```typescript
 * const result: InitResult = {
 *   success: true,
 *   projectPath: '/projects/MyGame',
 *   uprojectPath: '/projects/MyGame/MyGame.uproject',
 *   engineAssociation: '5.3',
 *   createdFiles: [
 *     'MyGame.uproject',
 *     'Source/MyGame/MyGame.Build.cs',
 *     'Source/MyGame/MyGame.Target.cs'
 *   ]
 * };
 *
 * if (result.success) {
 *   console.log(`Created project at ${result.projectPath}`);
 *   console.log(`Using engine ${result.engineAssociation}`);
 * }
 * ```
 *
 * @see {@link InitOptions} for the options used to configure initialization
 * @see {@link ProjectInitializer} for the initializer that produces this result
 */
export interface InitResult {
  /**
   * Whether the initialization operation succeeded.
   * True if all project files were created successfully,
   * false if an error occurred during initialization.
   */
  success: boolean;

  /**
   * Absolute path to the created project directory.
   * This is the root directory containing the .uproject file
   * and all project subdirectories (Source, Content, Config, etc.).
   */
  projectPath: string;

  /**
   * Absolute path to the created .uproject file.
   * This is the main project file that Unreal Engine uses to
   * identify and open the project.
   */
  uprojectPath: string;

  /**
   * Engine association ID used in the .uproject file.
   * This identifier links the project to a specific Unreal Engine
   * installation (e.g., '5.3', '{GUID}', or 'UE_5.3').
   */
  engineAssociation: string;

  /**
   * Array of absolute paths to all created files and directories.
   * Includes the .uproject file, source files (for C++ projects),
   * configuration files, and created directories.
   */
  createdFiles: string[];

  /**
   * Error message if initialization failed.
   * Only present when success is false. Contains a human-readable
   * description of what went wrong during initialization.
   */
  error?: string;
}
