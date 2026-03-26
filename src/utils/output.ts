import { Logger } from './logger';

/**
 * Output utilities for formatted console writing.
 *
 * This module provides simple utilities for writing formatted output to the console.
 * It serves as a thin wrapper around {@link Logger} for common output patterns.
 *
 * These utilities are designed for scenarios where simple line-based output is needed
 * without the overhead of creating a Logger instance. For more complex logging
 * scenarios with prefixes, colors, or multiple log levels, use {@link Logger} directly.
 *
 * @module utils/output
 *
 * @example
 * ```typescript
 * import { writeLine, writeSuccess, writeError, writeWarning, writeInfo } from './utils/output';
 *
 * // Write a message with newline
 * writeLine('Processing complete');
 *
 * // Write an empty line for spacing
 * writeLine();
 *
 * // Write multiple lines
 * writeLine('Step 1: Complete');
 * writeLine('Step 2: In progress...');
 *
 * // Write formatted messages with indicators
 * writeSuccess('Operation completed successfully');
 * writeError('Failed to connect to server');
 * writeWarning('Configuration file not found, using defaults');
 * writeInfo('Processing 42 items...');
 * ```
 */

/**
 * Writes a message to stdout followed by a newline character.
 *
 * This utility serves as a thin wrapper around {@link Logger.write} for simple
 * line-based output. It automatically appends a newline character (`\n`) to each
 * message, making it convenient for writing single lines of output.
 *
 * Use this function when you need:
 * - Simple line-based output without prefixes or formatting
 * - Quick console output in utility functions
 * - Compatibility with the project's logging infrastructure
 *
 * For features like prefixes, colors, error output, or different log levels,
 * use {@link Logger} instead for more control over formatting.
 *
 * @param message - The message to write to stdout. Defaults to an empty string
 *                 if not provided, which results in just a newline being written.
 *
 * @example
 * ```typescript
 * // Write a simple message
 * writeLine('Operation completed successfully');
 *
 * // Write an empty line (just a newline)
 * writeLine();
 *
 * // Write formatted content
 * writeLine(`Found ${count} files in directory`);
 * ```
 *
 * @see {@link Logger} For advanced logging with prefixes, colors, and levels
 */
export function writeLine(message = ''): void {
  Logger.write(`${message}\n`);
}

/**
 * Writes a success message with a green checkmark indicator.
 *
 * This utility provides a convenient way to output success messages with
 * visual feedback. The message is prefixed with a green checkmark (✓) and
 * written to stdout followed by a newline.
 *
 * Use this function when you need:
 * - To indicate successful completion of an operation
 * - Positive feedback for user actions
 * - Consistent success messaging across the CLI
 *
 * @param message - The success message to display
 *
 * @example
 * ```typescript
 * // After a successful operation
 * writeSuccess('Project built successfully');
 *
 * // After saving a file
 * writeSuccess('Configuration saved');
 *
 * // After completing a step
 * writeSuccess('Download complete');
 * ```
 *
 * @see {@link Logger.success} For success logging with prefix support
 */
export function writeSuccess(message: string): void {
  Logger.success(message);
}

/**
 * Writes an error message with a red indicator to stderr.
 *
 * This utility provides a convenient way to output error messages with
 * visual feedback. The message is prefixed with a red X (✗) and written
 * to stderr followed by a newline.
 *
 * Use this function when you need:
 * - To indicate a failure or error condition
 * - To output error messages that should be captured separately from stdout
 * - Consistent error messaging across the CLI
 *
 * @param message - The error message to display
 *
 * @example
 * ```typescript
 * // When an operation fails
 * writeError('Failed to connect to server');
 *
 * // When validation fails
 * writeError('Invalid project name specified');
 *
 * // When a file cannot be read
 * writeError('Cannot read configuration file');
 * ```
 *
 * @see {@link Logger.error} For error logging with prefix support
 */
export function writeError(message: string): void {
  Logger.error(message);
}

/**
 * Writes a warning message with a yellow indicator.
 *
 * This utility provides a convenient way to output warning messages with
 * visual feedback. The message is prefixed with a yellow warning symbol (⚠)
 * and written to stdout followed by a newline.
 *
 * Use this function when you need:
 * - To alert users about potential issues that don't prevent operation
 * - To indicate deprecated features or suboptimal configurations
 * - Consistent warning messaging across the CLI
 *
 * @param message - The warning message to display
 *
 * @example
 * ```typescript
 * // When using a deprecated feature
 * writeWarning('This option is deprecated and will be removed in v2.0');
 *
 * // When configuration is incomplete
 * writeWarning('Engine path not specified, attempting auto-detection');
 *
 * // When a non-critical error occurs
 * writeWarning('Cache is stale, rebuilding...');
 * ```
 *
 * @see {@link Logger.warning} For warning logging with prefix support
 */
export function writeWarning(message: string): void {
  Logger.warning(message);
}

/**
 * Writes an informational message with a blue indicator.
 *
 * This utility provides a convenient way to output informational messages with
 * visual feedback. The message is prefixed with a blue info symbol (ℹ) and
 * written to stdout followed by a newline.
 *
 * Use this function when you need:
 * - To provide status updates during long-running operations
 * - To display helpful information to the user
 * - Consistent info messaging across the CLI
 *
 * @param message - The informational message to display
 *
 * @example
 * ```typescript
 * // During a long operation
 * writeInfo('Downloading dependencies...');
 *
 * // Providing context
 * writeInfo('Using engine version 5.3');
 *
 * // Status update
 * writeInfo('Processing 42 of 100 files...');
 * ```
 *
 * @see {@link Logger.info} For info logging with prefix support
 */
export function writeInfo(message: string): void {
  Logger.info(message);
}
