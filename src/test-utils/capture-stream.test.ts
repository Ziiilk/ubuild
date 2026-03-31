import { Logger } from '../utils/logger';
import { CapturedWritable, createOutputCapture } from './capture-stream';

describe('CapturedWritable', () => {
  describe('constructor', () => {
    it('creates a writable stream', () => {
      const captured = new CapturedWritable();
      expect(captured).toBeInstanceOf(CapturedWritable);
      expect(captured.columns).toBe(80);
    });
  });

  describe('output', () => {
    it('captures string chunks', () => {
      const captured = new CapturedWritable();
      captured.write('Hello ');
      captured.write('World');
      expect(captured.output).toBe('Hello World');
    });

    it('captures Buffer chunks', () => {
      const captured = new CapturedWritable();
      captured.write(Buffer.from('Buffer '));
      captured.write(Buffer.from('data'));
      expect(captured.output).toBe('Buffer data');
    });

    it('captures mixed string and Buffer chunks', () => {
      const captured = new CapturedWritable();
      captured.write('String ');
      captured.write(Buffer.from('Buffer'));
      expect(captured.output).toBe('String Buffer');
    });
  });

  describe('lines', () => {
    it('splits output by Unix line endings', () => {
      const captured = new CapturedWritable();
      captured.write('Line 1\nLine 2\nLine 3');
      expect(captured.lines).toEqual(['Line 1', 'Line 2', 'Line 3']);
    });

    it('splits output by Windows line endings', () => {
      const captured = new CapturedWritable();
      captured.write('Line 1\r\nLine 2\r\nLine 3');
      expect(captured.lines).toEqual(['Line 1', 'Line 2', 'Line 3']);
    });

    it('handles mixed line endings', () => {
      const captured = new CapturedWritable();
      captured.write('Unix\nWindows\r\nUnix\n');
      expect(captured.lines).toEqual(['Unix', 'Windows', 'Unix', '']);
    });

    it('returns single element array when no newlines', () => {
      const captured = new CapturedWritable();
      captured.write('Single line');
      expect(captured.lines).toEqual(['Single line']);
    });
  });

  describe('clear', () => {
    it('removes all captured data', () => {
      const captured = new CapturedWritable();
      captured.write('Data to clear');
      expect(captured.output).toBe('Data to clear');

      captured.clear();
      expect(captured.output).toBe('');
      expect(captured.lines).toEqual(['']);
    });

    it('allows writing after clear', () => {
      const captured = new CapturedWritable();
      captured.write('First');
      captured.clear();
      captured.write('Second');
      expect(captured.output).toBe('Second');
    });
  });
});

describe('createOutputCapture', () => {
  describe('return value', () => {
    it('returns stdout and stderr streams', () => {
      const capture = createOutputCapture();
      expect(capture.stdout).toBeInstanceOf(CapturedWritable);
      expect(capture.stderr).toBeInstanceOf(CapturedWritable);
    });

    it('returns clear function', () => {
      const capture = createOutputCapture();
      expect(typeof capture.clear).toBe('function');
    });

    it('returns getter functions', () => {
      const capture = createOutputCapture();
      expect(typeof capture.getStdout).toBe('function');
      expect(typeof capture.getStderr).toBe('function');
      expect(typeof capture.getCombined).toBe('function');
    });
  });

  describe('clear', () => {
    it('clears both stdout and stderr', () => {
      const capture = createOutputCapture();
      capture.stdout.write('stdout data');
      capture.stderr.write('stderr data');

      capture.clear();

      expect(capture.getStdout()).toBe('');
      expect(capture.getStderr()).toBe('');
    });
  });

  describe('getStdout', () => {
    it('returns stdout content', () => {
      const capture = createOutputCapture();
      capture.stdout.write('stdout content');
      capture.stderr.write('stderr content');

      expect(capture.getStdout()).toBe('stdout content');
    });
  });

  describe('getStderr', () => {
    it('returns stderr content', () => {
      const capture = createOutputCapture();
      capture.stdout.write('stdout content');
      capture.stderr.write('stderr content');

      expect(capture.getStderr()).toBe('stderr content');
    });
  });

  describe('getCombined', () => {
    it('returns concatenated stdout and stderr', () => {
      const capture = createOutputCapture();
      capture.stdout.write('stdout ');
      capture.stderr.write('stderr');

      expect(capture.getCombined()).toBe('stdout stderr');
    });

    it('returns empty string when both are empty', () => {
      const capture = createOutputCapture();
      expect(capture.getCombined()).toBe('');
    });
  });

  describe('integration with Logger', () => {
    it('captures Logger output', () => {
      const capture = createOutputCapture();
      const logger = new Logger({ stdout: capture.stdout, stderr: capture.stderr });

      logger.info('Info message');
      logger.error('Error message');

      expect(capture.getStdout()).toContain('Info message');
      expect(capture.getStderr()).toContain('Error message');
    });
  });
});
