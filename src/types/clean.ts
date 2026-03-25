import { Writable } from 'stream';
import { Logger } from '../utils/logger';

/** Options for executing a clean operation. */
export interface CleanOptions {
  /** Path to project directory or .uproject file */
  projectPath?: string;
  /** Path to Unreal Engine installation */
  enginePath?: string;
  /** Whether to perform a dry run without actually deleting files */
  dryRun?: boolean;
  /** Whether to clean only Binaries and Intermediate folders */
  binariesOnly?: boolean;
  /** Logger instance for output */
  logger?: Logger;
  /** Writable stream for stdout */
  stdout?: Writable;
  /** Writable stream for stderr */
  stderr?: Writable;
  /** Suppress all output */
  silent?: boolean;
}

/** Result of a clean operation. */
export interface CleanResult {
  /** Whether the clean operation succeeded */
  success: boolean;
  /** Array of paths that were deleted */
  deletedPaths: string[];
  /** Array of paths that failed to delete */
  failedPaths: Array<{ path: string; error: string }>;
  /** Error message if operation failed */
  error?: string;
}
