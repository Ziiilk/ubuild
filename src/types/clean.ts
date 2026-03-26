/**
 * Type definitions for clean operations.
 *
 * Provides TypeScript interfaces for configuring and executing clean
 * operations on Unreal Engine projects, including options for removing
 * build artifacts and the result structure.
 *
 * @module types/clean
 * @see {@link CleanOptions} for clean configuration options
 * @see {@link CleanResult} for clean operation results
 */

import { Writable } from 'stream';
import { Logger } from '../utils/logger';

/**
 * Options for executing a clean operation.
 *
 * Controls which files are removed and how the operation behaves.
 *
 * @example
 * ```typescript
 * const options: CleanOptions = {
 *   projectPath: './MyProject',
 *   dryRun: true,
 *   binariesOnly: false
 * };
 * ```
 *
 * @see {@link CleanResult} for the result type returned after cleaning
 */
export interface CleanOptions {
  /** Path to project directory or .uproject file */
  projectPath?: string;
  /** Path to Unreal Engine installation */
  enginePath?: string;
  /** If true, show what would be deleted without actually deleting */
  dryRun?: boolean;
  /** If true, only clean Binaries and Intermediate folders (keep Saved) */
  binariesOnly?: boolean;
  /** Logger instance for output (if not provided, uses console) */
  logger?: Logger;
  /** Writable stream for stdout output */
  stdout?: Writable;
  /** Writable stream for stderr output */
  stderr?: Writable;
  /** If true, suppress all output */
  silent?: boolean;
}

/**
 * Result of a clean operation.
 *
 * Contains details about what was deleted and any failures.
 *
 * @example
 * ```typescript
 * const result: CleanResult = {
 *   success: true,
 *   deletedPaths: [
 *     'C:/Projects/MyGame/Binaries',
 *     'C:/Projects/MyGame/Intermediate'
 *   ],
 *   failedPaths: []
 * };
 * ```
 *
 * @see {@link CleanOptions} for the options used to configure the clean operation
 */
export interface CleanResult {
  /** Whether the clean operation succeeded */
  success: boolean;
  /** Array of absolute paths that were successfully deleted */
  deletedPaths: string[];
  /** Array of paths that failed to delete with error details */
  failedPaths: Array<{ path: string; error: string }>;
  /** Error message if the overall operation failed */
  error?: string;
}
