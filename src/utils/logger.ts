/**
 * Logger utility for structured console output.
 *
 * Provides a flexible logging system with multiple log levels, colorized output,
 * and support for both instance-based and static method usage. The Logger class
 * offers formatted output with visual indicators for different message types.
 *
 * @module utils/logger
 *
 * @example
 * ```typescript
 * import { Logger } from './utils/logger';
 *
 * // Create a logger instance
 * const logger = new Logger({ prefix: 'Build' });
 * logger.info('Starting build process');
 * logger.success('Build completed successfully');
 * logger.error('Build failed');
 *
 * // Use static methods for global logging
 * Logger.info('System ready');
 * Logger.warning('Low disk space');
 * ```
 */

import chalk from 'chalk';
import { Writable } from 'stream';

/** Configuration options for the Logger class. */
export interface LoggerOptions {
  /** Optional prefix added to all log messages */
  prefix?: string;
  /** Writable stream for standard output (defaults to process.stdout) */
  stdout?: Writable;
  /** Writable stream for error output (defaults to process.stderr) */
  stderr?: Writable;
  /** When true, suppresses all log output */
  silent?: boolean;
}

interface WidthAwareWritable extends Writable {
  columns?: number;
}

/**
 * Formats a timestamp for log messages in HH:MM:SS format.
 * @param date - The date to format (defaults to now)
 * @returns Formatted timestamp string
 */
export function formatTimestamp(date: Date = new Date()): string {
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Provides structured logging with colorized output and multiple log levels.
 * Supports both instance methods and static methods for global logging.
 */
export class Logger {
  private prefix: string;
  private stdout: Writable;
  private stderr: Writable;
  private silent: boolean;

  /**
   * Creates a new Logger instance.
   * @param options - Configuration options for the logger
   */
  constructor(options: LoggerOptions = {}) {
    this.prefix = options.prefix || '';
    this.stdout = options.stdout || process.stdout;
    this.stderr = options.stderr || process.stderr;
    this.silent = options.silent || false;
  }

  private formatMessage(message: string): string {
    return this.prefix ? `[${this.prefix}] ${message}` : message;
  }

  private getOutputWidth(stream: Writable): number {
    return (stream as WidthAwareWritable).columns || 80;
  }

  /**
   * Logs an informational message with blue indicator.
   * @param message - The message to log
   */
  info(message: string): void {
    if (this.silent) return;
    this.stdout.write(chalk.blue('ℹ') + ' ' + this.formatMessage(message) + '\n');
  }

  /**
   * Logs a success message with green checkmark.
   * @param message - The message to log
   */
  success(message: string): void {
    if (this.silent) return;
    this.stdout.write(chalk.green('✓') + ' ' + this.formatMessage(message) + '\n');
  }

  /**
   * Logs a warning message with yellow indicator.
   * @param message - The message to log
   */
  warning(message: string): void {
    if (this.silent) return;
    this.stdout.write(chalk.yellow('⚠') + ' ' + this.formatMessage(message) + '\n');
  }

  /**
   * Logs an error message with red indicator to stderr.
   * @param message - The message to log
   */
  error(message: string): void {
    if (this.silent) return;
    this.stderr.write(chalk.red('✗') + ' ' + this.formatMessage(message) + '\n');
  }

  /**
   * Logs a debug message when DEBUG environment variable is set.
   * @param message - The message to log
   */
  debug(message: string): void {
    if (this.silent) return;
    if (process.env.DEBUG) {
      this.stdout.write(chalk.gray('🔍') + ' ' + this.formatMessage(message) + '\n');
    }
  }

  /**
   * Displays a progress message that can be overwritten.
   * @param message - The progress message to display
   */
  progress(message: string): void {
    if (this.silent) return;
    this.stdout.write(chalk.cyan('»') + ' ' + this.formatMessage(message) + '\r');
  }

  /** Clears the current progress message. */
  clearProgress(): void {
    if (this.silent) return;
    const width = this.getOutputWidth(this.stdout);
    this.stdout.write(' '.repeat(width) + '\r');
  }

  /** Outputs a horizontal divider line. */
  divider(): void {
    if (this.silent) return;
    const width = this.getOutputWidth(this.stdout);
    this.stdout.write(chalk.gray('─'.repeat(Math.min(width, 80))) + '\n');
  }

  /**
   * Outputs a formatted title with underline.
   * @param title - The title text to display
   */
  title(title: string): void {
    if (this.silent) return;
    const formatted = this.formatMessage(title);
    this.stdout.write('\n' + chalk.bold.cyan(formatted) + '\n');
    this.stdout.write(chalk.cyan('═'.repeat(formatted.length)) + '\n');
  }

  /**
   * Outputs a formatted subtitle with underline.
   * @param subTitle - The subtitle text to display
   */
  subTitle(subTitle: string): void {
    if (this.silent) return;
    const formatted = this.formatMessage(subTitle);
    this.stdout.write('\n' + chalk.bold(formatted) + '\n');
    this.stdout.write(chalk.gray('─'.repeat(formatted.length)) + '\n');
  }

  /**
   * Outputs data as formatted JSON.
   * @param data - The data to stringify and output
   */
  json(data: unknown): void {
    if (this.silent) return;
    this.stdout.write(JSON.stringify(data, null, 2) + '\n');
  }

  /**
   * Writes raw data to stdout.
   * @param data - The data to write
   */
  write(data: string): void {
    if (this.silent) return;
    this.stdout.write(data);
  }

  /**
   * Writes raw data to stderr.
   * @param data - The data to write
   */
  writeError(data: string): void {
    if (this.silent) return;
    this.stderr.write(data);
  }

  private static globalLogger = new Logger();

  /**
   * Logs an informational message using the global logger.
   * @param message - The message to log
   */
  static info(message: string): void {
    Logger.globalLogger.info(message);
  }

  /**
   * Logs a success message using the global logger.
   * @param message - The message to log
   */
  static success(message: string): void {
    Logger.globalLogger.success(message);
  }

  /**
   * Logs a warning message using the global logger.
   * @param message - The message to log
   */
  static warning(message: string): void {
    Logger.globalLogger.warning(message);
  }

  /**
   * Logs an error message using the global logger.
   * @param message - The message to log
   */
  static error(message: string): void {
    Logger.globalLogger.error(message);
  }

  /**
   * Logs a debug message using the global logger.
   * @param message - The message to log
   */
  static debug(message: string): void {
    Logger.globalLogger.debug(message);
  }

  /**
   * Displays a progress message using the global logger.
   * @param message - The progress message to display
   */
  static progress(message: string): void {
    Logger.globalLogger.progress(message);
  }

  /** Clears the current progress message using the global logger. */
  static clearProgress(): void {
    Logger.globalLogger.clearProgress();
  }

  /** Outputs a horizontal divider using the global logger. */
  static divider(): void {
    Logger.globalLogger.divider();
  }

  /**
   * Outputs a formatted title using the global logger.
   * @param title - The title text to display
   */
  static title(title: string): void {
    Logger.globalLogger.title(title);
  }

  /**
   * Outputs a formatted subtitle using the global logger.
   * @param subTitle - The subtitle text to display
   */
  static subTitle(subTitle: string): void {
    Logger.globalLogger.subTitle(subTitle);
  }

  /**
   * Outputs data as formatted JSON using the global logger.
   * @param data - The data to stringify and output
   */
  static json(data: unknown): void {
    Logger.globalLogger.json(data);
  }

  /**
   * Writes raw data to stdout using the global logger.
   * @param data - The data to write
   */
  static write(data: string): void {
    Logger.globalLogger.write(data);
  }

  /**
   * Writes raw data to stderr using the global logger.
   * @param data - The data to write
   */
  static writeError(data: string): void {
    Logger.globalLogger.writeError(data);
  }
}
