/**
 * Type definitions for engine switch operations.
 *
 * Provides TypeScript interfaces for configuring and executing engine
 * switch operations on Unreal Engine projects, including options for
 * specifying the target engine and the result structure.
 *
 * @module types/switch
 * @see {@link SwitchOptions} for switch configuration options
 * @see {@link SwitchResult} for switch operation results
 */

import { Writable } from 'stream';

/**
 * Options for executing an engine switch operation.
 *
 * @example
 * ```typescript
 * const options: SwitchOptions = {
 *   projectPath: './MyProject',
 *   enginePath: 'C:/Program Files/Epic Games/UE_5.4',
 * };
 * ```
 *
 * @see {@link SwitchResult} for the result type returned after switching
 */
export interface SwitchOptions {
  /** Path to project directory or .uproject file */
  projectPath?: string;
  /** Path to the target Unreal Engine installation */
  enginePath?: string;
  /** Writable stream for stdout output */
  stdout?: Writable;
  /** Writable stream for stderr output */
  stderr?: Writable;
}

/**
 * Result of an engine switch operation.
 *
 * @example
 * ```typescript
 * const result: SwitchResult = {
 *   success: true,
 *   previousAssociation: '5.3',
 *   newAssociation: '5.4',
 *   uprojectPath: 'C:/Projects/MyGame/MyGame.uproject',
 * };
 * ```
 *
 * @see {@link SwitchOptions} for the options used to configure the switch operation
 */
export interface SwitchResult {
  /** Whether the switch operation succeeded */
  success: boolean;
  /** Previous EngineAssociation value */
  previousAssociation: string;
  /** New EngineAssociation value */
  newAssociation: string;
  /** Absolute path to the .uproject file that was modified */
  uprojectPath: string;
  /** Error message if the operation failed */
  error?: string;
}
