import { Logger } from './logger';

/**
 * Shared utility for command output.
 * Provides a consistent way to write formatted output lines.
 */
export function writeLine(message = ''): void {
  Logger.write(`${message}\n`);
}
