import chalk from 'chalk';
import { Writable } from 'stream';

export interface LoggerOptions {
  prefix?: string;
  stdout?: Writable;
  stderr?: Writable;
  silent?: boolean;
}

export class Logger {
  private prefix: string;
  private stdout: Writable;
  private stderr: Writable;
  private silent: boolean;

  constructor(options: LoggerOptions = {}) {
    this.prefix = options.prefix || '';
    this.stdout = options.stdout || process.stdout;
    this.stderr = options.stderr || process.stderr;
    this.silent = options.silent || false;
  }

  private formatMessage(message: string): string {
    return this.prefix ? `[${this.prefix}] ${message}` : message;
  }

  info(message: string): void {
    if (this.silent) return;
    this.stdout.write(chalk.blue('ℹ') + ' ' + this.formatMessage(message) + '\n');
  }

  success(message: string): void {
    if (this.silent) return;
    this.stdout.write(chalk.green('✓') + ' ' + this.formatMessage(message) + '\n');
  }

  warning(message: string): void {
    if (this.silent) return;
    this.stdout.write(chalk.yellow('⚠') + ' ' + this.formatMessage(message) + '\n');
  }

  error(message: string): void {
    if (this.silent) return;
    this.stderr.write(chalk.red('✗') + ' ' + this.formatMessage(message) + '\n');
  }

  debug(message: string): void {
    if (this.silent) return;
    if (process.env.DEBUG) {
      this.stdout.write(chalk.gray('🔍') + ' ' + this.formatMessage(message) + '\n');
    }
  }

  progress(message: string): void {
    if (this.silent) return;
    this.stdout.write(chalk.cyan('»') + ' ' + this.formatMessage(message) + '\r');
  }

  clearProgress(): void {
    if (this.silent) return;
    const width = (this.stdout as any).columns || 80;
    this.stdout.write(' '.repeat(width) + '\r');
  }

  divider(): void {
    if (this.silent) return;
    const width = (this.stdout as any).columns || 80;
    this.stdout.write(chalk.gray('─'.repeat(Math.min(width, 80))) + '\n');
  }

  title(title: string): void {
    if (this.silent) return;
    this.stdout.write('\n' + chalk.bold.cyan(this.formatMessage(title)) + '\n');
    this.stdout.write(chalk.cyan('═'.repeat(title.length)) + '\n');
  }

  subTitle(subTitle: string): void {
    if (this.silent) return;
    this.stdout.write('\n' + chalk.bold(this.formatMessage(subTitle)) + '\n');
    this.stdout.write(chalk.gray('─'.repeat(subTitle.length)) + '\n');
  }

  json(data: unknown): void {
    if (this.silent) return;
    this.stdout.write(JSON.stringify(data, null, 2) + '\n');
  }

  write(data: string): void {
    if (this.silent) return;
    this.stdout.write(data);
  }

  writeError(data: string): void {
    if (this.silent) return;
    this.stderr.write(data);
  }

  // Static methods for backward compatibility (use default global logger)
  private static globalLogger = new Logger();

  static info(message: string): void {
    Logger.globalLogger.info(message);
  }

  static success(message: string): void {
    Logger.globalLogger.success(message);
  }

  static warning(message: string): void {
    Logger.globalLogger.warning(message);
  }

  static error(message: string): void {
    Logger.globalLogger.error(message);
  }

  static debug(message: string): void {
    Logger.globalLogger.debug(message);
  }

  static progress(message: string): void {
    Logger.globalLogger.progress(message);
  }

  static clearProgress(): void {
    Logger.globalLogger.clearProgress();
  }

  static divider(): void {
    Logger.globalLogger.divider();
  }

  static title(title: string): void {
    Logger.globalLogger.title(title);
  }

  static subTitle(subTitle: string): void {
    Logger.globalLogger.subTitle(subTitle);
  }

  static json(data: unknown): void {
    Logger.globalLogger.json(data);
  }
}
