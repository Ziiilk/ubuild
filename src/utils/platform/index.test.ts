import { Platform } from './index';

describe('Platform', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    // Restore original platform after each test
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
  });

  describe('isWindows', () => {
    it('should return true when platform is win32', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });
      expect(Platform.isWindows()).toBe(true);
    });

    it('should return false when platform is linux', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });
      expect(Platform.isWindows()).toBe(false);
    });

    it('should return false when platform is darwin', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
      });
      expect(Platform.isWindows()).toBe(false);
    });
  });

  describe('isLinux', () => {
    it('should return true when platform is linux', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });
      expect(Platform.isLinux()).toBe(true);
    });

    it('should return false when platform is win32', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });
      expect(Platform.isLinux()).toBe(false);
    });

    it('should return false when platform is darwin', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
      });
      expect(Platform.isLinux()).toBe(false);
    });
  });

  describe('isMac', () => {
    it('should return true when platform is darwin', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
      });
      expect(Platform.isMac()).toBe(true);
    });

    it('should return false when platform is win32', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });
      expect(Platform.isMac()).toBe(false);
    });

    it('should return false when platform is linux', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });
      expect(Platform.isMac()).toBe(false);
    });
  });

  describe('pathSeparator', () => {
    it('should return semicolon on Windows', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });
      expect(Platform.pathSeparator()).toBe(';');
    });

    it('should return colon on Linux', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });
      expect(Platform.pathSeparator()).toBe(':');
    });

    it('should return colon on macOS', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
      });
      expect(Platform.pathSeparator()).toBe(':');
    });
  });

  describe('exeExtension', () => {
    it('should return .exe on Windows', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });
      expect(Platform.exeExtension()).toBe('.exe');
    });

    it('should return empty string on Linux', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });
      expect(Platform.exeExtension()).toBe('');
    });

    it('should return empty string on macOS', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
      });
      expect(Platform.exeExtension()).toBe('');
    });
  });

  describe('batExtension', () => {
    it('should return .bat on Windows', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });
      expect(Platform.batExtension()).toBe('.bat');
    });

    it('should return .sh on Linux', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });
      expect(Platform.batExtension()).toBe('.sh');
    });

    it('should return .sh on macOS', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
      });
      expect(Platform.batExtension()).toBe('.sh');
    });
  });

  describe('normalizePath', () => {
    it('should convert forward slashes to backslashes on Windows', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });
      expect(Platform.normalizePath('path/to/file')).toBe('path\\to\\file');
    });

    it('should keep backslashes on Windows', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });
      expect(Platform.normalizePath('path\\to\\file')).toBe('path\\to\\file');
    });

    it('should convert backslashes to forward slashes on Linux', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });
      expect(Platform.normalizePath('path\\to\\file')).toBe('path/to/file');
    });

    it('should keep forward slashes on Linux', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });
      expect(Platform.normalizePath('path/to/file')).toBe('path/to/file');
    });

    it('should convert backslashes to forward slashes on macOS', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
      });
      expect(Platform.normalizePath('path\\to\\file')).toBe('path/to/file');
    });

    it('should keep forward slashes on macOS', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
      });
      expect(Platform.normalizePath('path/to/file')).toBe('path/to/file');
    });

    it('should handle mixed path separators on Windows', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });
      expect(Platform.normalizePath('path/to\\file/name')).toBe('path\\to\\file\\name');
    });

    it('should handle mixed path separators on Unix', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });
      expect(Platform.normalizePath('path/to\\file/name')).toBe('path/to/file/name');
    });

    it('should handle empty string', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });
      expect(Platform.normalizePath('')).toBe('');
    });

    it('should handle absolute Windows paths', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });
      expect(Platform.normalizePath('C:/Users/test/file.txt')).toBe('C:\\Users\\test\\file.txt');
    });

    it('should handle absolute Unix paths', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });
      expect(Platform.normalizePath('/home/user/file.txt')).toBe('/home/user/file.txt');
    });
  });
});
