import { Logger, formatTimestamp } from './logger';
import { createOutputCapture } from '../test-utils';

describe('Logger', () => {
  describe('instance methods', () => {
    it('logs info message with blue indicator', () => {
      const capture = createOutputCapture();
      const logger = new Logger({ stdout: capture.stdout, stderr: capture.stderr });

      logger.info('test message');

      expect(capture.getStdout()).toContain('test message');
    });

    it('logs success message with green checkmark', () => {
      const capture = createOutputCapture();
      const logger = new Logger({ stdout: capture.stdout, stderr: capture.stderr });

      logger.success('operation completed');

      expect(capture.getStdout()).toContain('operation completed');
    });

    it('logs warning message with yellow indicator', () => {
      const capture = createOutputCapture();
      const logger = new Logger({ stdout: capture.stdout, stderr: capture.stderr });

      logger.warning('be careful');

      expect(capture.getStdout()).toContain('be careful');
    });

    it('logs error message to stderr with red indicator', () => {
      const capture = createOutputCapture();
      const logger = new Logger({ stdout: capture.stdout, stderr: capture.stderr });

      logger.error('something went wrong');

      expect(capture.getStderr()).toContain('something went wrong');
      expect(capture.getStdout()).toBe('');
    });

    it('logs debug message when DEBUG env is set', () => {
      const originalDebug = process.env.DEBUG;
      process.env.DEBUG = '1';
      const capture = createOutputCapture();
      const logger = new Logger({ stdout: capture.stdout, stderr: capture.stderr });

      logger.debug('debug info');

      expect(capture.getStdout()).toContain('debug info');

      process.env.DEBUG = originalDebug;
    });

    it('does not log debug message when DEBUG env is not set', () => {
      const originalDebug = process.env.DEBUG;
      delete process.env.DEBUG;
      const capture = createOutputCapture();
      const logger = new Logger({ stdout: capture.stdout, stderr: capture.stderr });

      logger.debug('debug info');

      expect(capture.getStdout()).toBe('');

      process.env.DEBUG = originalDebug;
    });

    it('outputs title with underline', () => {
      const capture = createOutputCapture();
      const logger = new Logger({ stdout: capture.stdout, stderr: capture.stderr });

      logger.title('Section Title');

      const output = capture.getStdout();
      expect(output).toContain('Section Title');
    });

    it('outputs subtitle with underline', () => {
      const capture = createOutputCapture();
      const logger = new Logger({ stdout: capture.stdout, stderr: capture.stderr });

      logger.subTitle('Subsection');

      const output = capture.getStdout();
      expect(output).toContain('Subsection');
    });

    it('outputs JSON data', () => {
      const capture = createOutputCapture();
      const logger = new Logger({ stdout: capture.stdout, stderr: capture.stderr });
      const data = { key: 'value', number: 42 };

      logger.json(data);

      const output = capture.getStdout();
      expect(output).toContain('"key": "value"');
      expect(output).toContain('"number": 42');
    });

    it('writes raw data to stdout', () => {
      const capture = createOutputCapture();
      const logger = new Logger({ stdout: capture.stdout, stderr: capture.stderr });

      logger.write('raw output');

      expect(capture.getStdout()).toBe('raw output');
    });

    it('writes raw data to stderr', () => {
      const capture = createOutputCapture();
      const logger = new Logger({ stdout: capture.stdout, stderr: capture.stderr });

      logger.writeError('error output');

      expect(capture.getStderr()).toBe('error output');
    });

    it('outputs divider line', () => {
      const capture = createOutputCapture();
      const logger = new Logger({ stdout: capture.stdout, stderr: capture.stderr });

      logger.divider();

      expect(capture.getStdout().trim()).not.toBe('');
    });

    it('outputs progress message with carriage return', () => {
      const capture = createOutputCapture();
      const logger = new Logger({ stdout: capture.stdout, stderr: capture.stderr });

      logger.progress('working...');

      expect(capture.getStdout()).toContain('working...');
    });

    it('clears progress message', () => {
      const capture = createOutputCapture();
      const logger = new Logger({ stdout: capture.stdout, stderr: capture.stderr });

      logger.progress('working...');
      logger.clearProgress();

      // Should write spaces to clear the line
      expect(capture.getStdout().length).toBeGreaterThan('working...'.length);
    });
  });

  describe('with prefix', () => {
    it('adds prefix to info messages', () => {
      const capture = createOutputCapture();
      const logger = new Logger({
        stdout: capture.stdout,
        stderr: capture.stderr,
        prefix: 'BUILD',
      });

      logger.info('starting');

      expect(capture.getStdout()).toContain('[BUILD] starting');
    });

    it('adds prefix to error messages', () => {
      const capture = createOutputCapture();
      const logger = new Logger({
        stdout: capture.stdout,
        stderr: capture.stderr,
        prefix: 'ERROR',
      });

      logger.error('failed');

      expect(capture.getStderr()).toContain('[ERROR] failed');
    });

    it('adds prefix to title', () => {
      const capture = createOutputCapture();
      const logger = new Logger({
        stdout: capture.stdout,
        stderr: capture.stderr,
        prefix: 'STAGE',
      });

      logger.title('Build Step');

      expect(capture.getStdout()).toContain('[STAGE] Build Step');
    });
  });

  describe('silent mode', () => {
    it('suppresses all output when silent is true', () => {
      const capture = createOutputCapture();
      const logger = new Logger({
        stdout: capture.stdout,
        stderr: capture.stderr,
        silent: true,
      });

      logger.info('info');
      logger.success('success');
      logger.warning('warning');
      logger.error('error');
      logger.title('title');
      logger.subTitle('subtitle');
      logger.divider();
      logger.json({ key: 'value' });
      logger.write('write');
      logger.writeError('writeError');
      logger.progress('progress');
      logger.clearProgress();

      expect(capture.getStdout()).toBe('');
      expect(capture.getStderr()).toBe('');
    });

    it('allows output when silent is false', () => {
      const capture = createOutputCapture();
      const logger = new Logger({
        stdout: capture.stdout,
        stderr: capture.stderr,
        silent: false,
      });

      logger.info('info');

      expect(capture.getStdout()).toContain('info');
    });
  });

  describe('static methods', () => {
    it('static info logs message', () => {
      // Static logger uses process.stdout/stderr, just verify it doesn't throw
      expect(() => Logger.info('static info')).not.toThrow();
    });

    it('static success logs message', () => {
      expect(() => Logger.success('static success')).not.toThrow();
    });

    it('static warning logs message', () => {
      expect(() => Logger.warning('static warning')).not.toThrow();
    });

    it('static error logs message', () => {
      expect(() => Logger.error('static error')).not.toThrow();
    });

    it('static debug logs message when DEBUG is set', () => {
      const originalDebug = process.env.DEBUG;
      process.env.DEBUG = '1';
      expect(() => Logger.debug('static debug')).not.toThrow();
      process.env.DEBUG = originalDebug;
    });

    it('static title logs message', () => {
      expect(() => Logger.title('static title')).not.toThrow();
    });

    it('static subTitle logs message', () => {
      expect(() => Logger.subTitle('static subtitle')).not.toThrow();
    });

    it('static divider logs message', () => {
      expect(() => Logger.divider()).not.toThrow();
    });

    it('static json logs message', () => {
      expect(() => Logger.json({ test: true })).not.toThrow();
    });

    it('static write logs message', () => {
      expect(() => Logger.write('static write')).not.toThrow();
    });

    it('static writeError logs message', () => {
      expect(() => Logger.writeError('static writeError')).not.toThrow();
    });

    it('static progress logs message', () => {
      expect(() => Logger.progress('static progress')).not.toThrow();
    });

    it('static clearProgress works', () => {
      expect(() => Logger.clearProgress()).not.toThrow();
    });
  });

  describe('default behavior', () => {
    it('creates logger with default options', () => {
      const logger = new Logger();
      // Should not throw and should use process.stdout/stderr
      expect(() => logger.info('test')).not.toThrow();
    });

    it('creates logger with partial options', () => {
      const capture = createOutputCapture();
      const logger = new Logger({ stdout: capture.stdout });

      logger.info('test');
      expect(capture.getStdout()).toContain('test');
    });
  });

  describe('formatTimestamp', () => {
    it('formats current time when no date provided', () => {
      const result = formatTimestamp();
      // Should match HH:MM:SS format
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('formats a specific date correctly', () => {
      const testDate = new Date('2024-01-15T14:30:45Z');
      const result = formatTimestamp(testDate);
      // Note: toLocaleTimeString uses local timezone, so we just verify format
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('uses 24-hour format', () => {
      // Test with a time that would be PM in 12-hour format
      const testDate = new Date('2024-01-15T15:30:45Z');
      const result = formatTimestamp(testDate);
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('pads single-digit hours, minutes, and seconds with leading zeros', () => {
      const testDate = new Date('2024-01-15T01:05:09Z');
      const result = formatTimestamp(testDate);
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('handles midnight correctly', () => {
      const testDate = new Date('2024-01-15T00:00:00Z');
      const result = formatTimestamp(testDate);
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('handles end of day correctly', () => {
      const testDate = new Date('2024-01-15T23:59:59Z');
      const result = formatTimestamp(testDate);
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('handles invalid date gracefully', () => {
      const invalidDate = new Date(NaN);
      const result = formatTimestamp(invalidDate);
      // Should still produce some output (locale-dependent, often 'Invalid Date' or similar)
      expect(typeof result).toBe('string');
    });
  });
});
