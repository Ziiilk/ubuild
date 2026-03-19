export class Platform {
  static isWindows(): boolean {
    return process.platform === 'win32';
  }

  static isLinux(): boolean {
    return process.platform === 'linux';
  }

  static isMac(): boolean {
    return process.platform === 'darwin';
  }

  static pathSeparator(): string {
    return Platform.isWindows() ? ';' : ':';
  }

  static exeExtension(): string {
    return Platform.isWindows() ? '.exe' : '';
  }

  static batExtension(): string {
    return Platform.isWindows() ? '.bat' : '.sh';
  }

  static normalizePath(p: string): string {
    if (Platform.isWindows()) {
      return p.replace(/\//g, '\\');
    } else {
      return p.replace(/\\/g, '/');
    }
  }
}
