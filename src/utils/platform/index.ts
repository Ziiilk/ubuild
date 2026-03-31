/**
 * Platform detection and path utilities for cross-platform compatibility.
 * Provides methods to detect the current operating system and handle platform-specific
 * path separators, file extensions, and path normalization.
 */
export class Platform {
  /**
   * Checks if the current platform is Windows.
   * @returns True if running on Windows
   */
  static isWindows(): boolean {
    return process.platform === 'win32';
  }

  /**
   * Checks if the current platform is Linux.
   * @returns True if running on Linux
   */
  static isLinux(): boolean {
    return process.platform === 'linux';
  }

  /**
   * Checks if the current platform is macOS.
   * @returns True if running on macOS
   */
  static isMac(): boolean {
    return process.platform === 'darwin';
  }

  /**
   * Gets the platform-specific path separator for environment variables.
   * @returns ';' on Windows, ':' on Unix-like systems
   */
  static pathSeparator(): string {
    return Platform.isWindows() ? ';' : ':';
  }

  /**
   * Gets the platform-specific executable file extension.
   * @returns '.exe' on Windows, empty string on Unix-like systems
   */
  static exeExtension(): string {
    return Platform.isWindows() ? '.exe' : '';
  }

  /**
   * Gets the platform-specific batch script file extension.
   * @returns '.bat' on Windows, '.sh' on Unix-like systems
   */
  static batExtension(): string {
    return Platform.isWindows() ? '.bat' : '.sh';
  }

  /**
   * Normalizes path separators to the platform-specific format.
   * On Windows: converts forward slashes to backslashes
   * On Unix: converts backslashes to forward slashes
   * @param p - The path to normalize
   * @returns The normalized path with correct separators
   */
  static normalizePath(p: string): string {
    if (Platform.isWindows()) {
      return p.replace(/\//g, '\\');
    } else {
      return p.replace(/\\/g, '/');
    }
  }
}
