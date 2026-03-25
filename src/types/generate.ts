/** Supported IDE types for project generation. */
export type IDE = 'sln' | 'vscode' | 'clion' | 'xcode' | 'vs2022';

/** Options for generating IDE project files.
 *
 * @example
 * ```typescript
 * const options: GenerateOptions = {
 *   ide: 'vscode',
 *   projectPath: './MyProject',
 *   force: true
 * };
 * ```
 */
export interface GenerateOptions {
  /** Target IDE type */
  ide?: IDE;
  /** Path to project directory or .uproject file */
  projectPath?: string;
  /** Path to Unreal Engine installation */
  enginePath?: string;
  /** Force regeneration of project files */
  force?: boolean;
}

/** Result of a project generation operation.
 *
 * @example
 * ```typescript
 * const result: GenerateResult = {
 *   success: true,
 *   generatedFiles: ['MyProject.sln', 'MyProject.vcxproj']
 * };
 * ```
 */
export interface GenerateResult {
  /** Whether generation succeeded */
  success: boolean;
  /** Array of paths to generated files */
  generatedFiles: string[];
  /** Error message if generation failed */
  error?: string;
}
