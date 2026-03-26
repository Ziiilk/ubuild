/**
 * Error handling utilities for ubuild
 *
 * Provides standardized error formatting and normalization functions
 * to ensure consistent error messages across the codebase.
 *
 * @module utils/error
 */

/**
 * Formats an unknown error value into a human-readable string.
 *
 * This utility standardizes error message extraction across the codebase,
 * handling both Error objects and primitive values consistently.
 *
 * @param error - The error value to format (Error object, string, or unknown)
 * @returns A formatted error message string
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   Logger.error(formatError(error));
 * }
 *
 * // With Error object
 * formatError(new Error('Something failed')) // => 'Something failed'
 *
 * // With string
 * formatError('plain error message') // => 'plain error message'
 *
 * // With null/undefined
 * formatError(null) // => 'null'
 * formatError(undefined) // => 'undefined'
 * ```
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Formats an error with a custom prefix for context.
 *
 * Useful when you want to add context to an error message while
 * maintaining consistent formatting.
 *
 * @param prefix - The context prefix to add
 * @param error - The error value to format
 * @returns A formatted error message with prefix
 *
 * @example
 * ```typescript
 * try {
 *   await buildProject();
 * } catch (error) {
 *   throw new Error(formatErrorWithPrefix('Build failed', error));
 * }
 * // => 'Build failed: Compilation error in Module.cpp'
 * ```
 */
export function formatErrorWithPrefix(prefix: string, error: unknown): string {
  return `${prefix}: ${formatError(error)}`;
}

/**
 * Safely extracts the stack trace from an error if available.
 *
 * @param error - The error value
 * @returns The stack trace string, or undefined if not available
 *
 * @example
 * ```typescript
 * try {
 *   await operation();
 * } catch (error) {
 *   const stack = getErrorStack(error);
 *   if (stack) {
 *     Logger.debug(stack);
 *   }
 * }
 * ```
 */
export function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }
  return undefined;
}

/**
 * Checks if a value is an Error instance.
 *
 * Type guard that narrows unknown to Error.
 *
 * @param value - The value to check
 * @returns True if the value is an Error instance
 *
 * @example
 * ```typescript
 * const result = await operation();
 * if (isError(result)) {
 *   Logger.error(result.message);
 * }
 * ```
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}
