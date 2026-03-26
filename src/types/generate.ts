/**
 * Supported IDE types for project file generation.
 *
 * These values represent the IDEs that can be targeted when generating
 * project files for Unreal Engine development.
 *
 * - 'sln' - Visual Studio solution file (default)
 * - 'vscode' - Visual Studio Code workspace and configuration
 * - 'clion' - JetBrains CLion CMake project
 * - 'xcode' - Apple Xcode project
 * - 'vs2022' - Visual Studio 2022 specific solution
 *
 * @example
 * ```typescript
 * const ide: IDE = 'vscode';  // Generate VSCode project files
 * const ide2: IDE = 'sln';    // Generate Visual Studio solution
 * ```
 *
 * @see {@link GenerateOptions} for options that use this type
 * @see {@link ProjectGenerator} for the generator implementation
 */
export type IDE = 'sln' | 'vscode' | 'clion' | 'xcode' | 'vs2022';

/**
 * Options for generating IDE project files.
 *
 * Configures how project files are generated for various IDEs including
 * Visual Studio, VSCode, CLion, and Xcode. Uses UnrealBuildTool to create
 * the appropriate project files for the specified IDE.
 *
 * @example
 * ```typescript
 * const options: GenerateOptions = {
 *   ide: 'vscode',
 *   projectPath: './MyProject',
 *   force: true
 * };
 * ```
 *
 * @see {@link GenerateResult} for the result returned after generation
 * @see {@link IDE} for valid IDE type values
 * @see {@link ProjectGenerator} for the generator implementation
 */
export interface GenerateOptions {
  /**
   * Target IDE type for project file generation.
   * @default 'sln' (Visual Studio solution)
   * @see {@link IDE} for valid values
   */
  ide?: IDE;

  /**
   * Path to project directory or .uproject file.
   * If a directory is provided, the first .uproject file found will be used.
   * @default process.cwd()
   */
  projectPath?: string;

  /**
   * Path to Unreal Engine installation.
   * If not provided, the engine will be auto-detected from the project association
   * or the system registry.
   */
  enginePath?: string;

  /**
   * Force regeneration of project files even if they already exist.
   * When true, deletes existing project files before regenerating.
   * @default false
   */
  force?: boolean;
}

/**
 * Result of a project generation operation.
 *
 * Contains information about the success of the generation and
 * a list of all files that were created or updated during the process.
 *
 * @example
 * ```typescript
 * const result: GenerateResult = {
 *   success: true,
 *   generatedFiles: [
 *     'MyProject.sln',
 *     'MyProject.vcxproj',
 *     'MyProject.vcxproj.filters'
 *   ]
 * };
 *
 * if (result.success) {
 *   console.log(`Generated ${result.generatedFiles.length} files`);
 * }
 * ```
 *
 * @see {@link GenerateOptions} for the options used to configure generation
 * @see {@link ProjectGenerator} for the generator that produces this result
 */
export interface GenerateResult {
  /**
   * Whether the generation operation succeeded.
   * True if all project files were generated successfully,
   * false if an error occurred during generation.
   */
  success: boolean;

  /**
   * Array of absolute or relative paths to generated files.
   * Contains all files created during the generation process,
   * including solution files, project files, and configuration files.
   */
  generatedFiles: string[];

  /**
   * Error message if generation failed.
   * Only present when success is false. Contains a human-readable
   * description of what went wrong during generation.
   */
  error?: string;
}
