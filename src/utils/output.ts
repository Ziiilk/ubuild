import { Logger } from './logger';

/**
 * Shared utility for command output.
 * Provides a consistent way to write formatted output lines.
 *
 * @example
 * ```typescript
 * import { writeLine } from './utils/output';
 *
 * writeLine('Processing complete');
 * writeLine();  // Empty line
 * ```
 *
 * @param message - The message to write (defaults to empty string)
 */
export function writeLine(message = ''): void {
  Logger.write(`${message}\n`);
}
