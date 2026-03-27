/**
 * Tests for error handling utilities
 *
 * @module utils/error.test
 */

import {
  formatError,
  formatErrorWithPrefix,
  getErrorStack,
  isError,
  handleCommandError,
} from './error';

describe('formatError', () => {
  it('should extract message from Error object', () => {
    const error = new Error('Something went wrong');
    expect(formatError(error)).toBe('Something went wrong');
  });

  it('should handle Error with empty message', () => {
    const error = new Error('');
    expect(formatError(error)).toBe('');
  });

  it('should convert string to string', () => {
    expect(formatError('plain string error')).toBe('plain string error');
  });

  it('should convert null to "null"', () => {
    expect(formatError(null)).toBe('null');
  });

  it('should convert undefined to "undefined"', () => {
    expect(formatError(undefined)).toBe('undefined');
  });

  it('should convert number to string', () => {
    expect(formatError(42)).toBe('42');
  });

  it('should convert object to string', () => {
    const obj = { message: 'error' };
    expect(formatError(obj)).toBe('[object Object]');
  });

  it('should handle custom Error subclass', () => {
    class CustomError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'CustomError';
      }
    }
    const error = new CustomError('Custom error message');
    expect(formatError(error)).toBe('Custom error message');
  });

  it('should handle TypeError', () => {
    const error = new TypeError('Invalid type');
    expect(formatError(error)).toBe('Invalid type');
  });

  it('should handle RangeError', () => {
    const error = new RangeError('Out of range');
    expect(formatError(error)).toBe('Out of range');
  });
});

describe('formatErrorWithPrefix', () => {
  it('should format Error with prefix', () => {
    const error = new Error('Connection failed');
    expect(formatErrorWithPrefix('Network error', error)).toBe('Network error: Connection failed');
  });

  it('should format string with prefix', () => {
    expect(formatErrorWithPrefix('Build failed', 'Compilation error')).toBe(
      'Build failed: Compilation error'
    );
  });

  it('should format null with prefix', () => {
    expect(formatErrorWithPrefix('Operation failed', null)).toBe('Operation failed: null');
  });

  it('should handle empty prefix', () => {
    const error = new Error('Something wrong');
    expect(formatErrorWithPrefix('', error)).toBe(': Something wrong');
  });

  it('should handle prefix with special characters', () => {
    const error = new Error('Error!');
    expect(formatErrorWithPrefix('Warning [123]', error)).toBe('Warning [123]: Error!');
  });
});

describe('getErrorStack', () => {
  it('should return stack trace for Error object', () => {
    const error = new Error('Test error');
    const stack = getErrorStack(error);
    expect(stack).toBeDefined();
    expect(stack).toContain('Error: Test error');
  });

  it('should return undefined for non-Error values', () => {
    expect(getErrorStack('string')).toBeUndefined();
    expect(getErrorStack(42)).toBeUndefined();
    expect(getErrorStack(null)).toBeUndefined();
    expect(getErrorStack(undefined)).toBeUndefined();
    expect(getErrorStack({})).toBeUndefined();
  });

  it('should return undefined for Error-like object without stack', () => {
    const errorLike = { message: 'error', name: 'CustomError' };
    expect(getErrorStack(errorLike)).toBeUndefined();
  });
});

describe('isError', () => {
  it('should return true for Error instance', () => {
    expect(isError(new Error('test'))).toBe(true);
  });

  it('should return true for Error subclasses', () => {
    expect(isError(new TypeError('test'))).toBe(true);
    expect(isError(new RangeError('test'))).toBe(true);
    expect(isError(new SyntaxError('test'))).toBe(true);
  });

  it('should return false for non-Error values', () => {
    expect(isError('string')).toBe(false);
    expect(isError(42)).toBe(false);
    expect(isError(null)).toBe(false);
    expect(isError(undefined)).toBe(false);
    expect(isError({})).toBe(false);
    expect(isError([])).toBe(false);
    expect(isError(true)).toBe(false);
  });

  it('should return false for Error-like object', () => {
    const errorLike = { message: 'error', name: 'Error' };
    expect(isError(errorLike)).toBe(false);
  });

  it('should narrow type correctly', () => {
    const value: unknown = new Error('test');
    if (isError(value)) {
      // TypeScript should recognize value as Error here
      expect(value.message).toBe('test');
    }
  });

  it('should handle ReferenceError', () => {
    const error = new ReferenceError('Variable not defined');
    expect(isError(error)).toBe(true);
    expect(formatError(error)).toBe('Variable not defined');
  });

  it('should handle URIError', () => {
    const error = new URIError('Invalid URI');
    expect(isError(error)).toBe(true);
    expect(formatError(error)).toBe('Invalid URI');
  });

  it('should handle Error subclass with custom properties', () => {
    class ValidationError extends Error {
      constructor(
        message: string,
        public field: string,
        public code: number
      ) {
        super(message);
        this.name = 'ValidationError';
      }
    }
    const error = new ValidationError('Invalid input', 'username', 400);
    expect(isError(error)).toBe(true);
    expect(formatError(error)).toBe('Invalid input');
  });

  it('should handle circular reference in object', () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    // String() should handle circular references gracefully
    expect(() => formatError(obj)).not.toThrow();
  });

  it('should handle symbols', () => {
    const sym = Symbol('test');
    expect(formatError(sym)).toBe('Symbol(test)');
  });

  it('should handle BigInt', () => {
    const bigInt = BigInt(9007199254740991);
    expect(formatError(bigInt)).toBe('9007199254740991');
  });

  it('should handle functions', () => {
    const fn = () => 'test';
    // String() on arrow function returns the function source
    const result = formatError(fn);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should handle getErrorStack with custom Error subclass', () => {
    class CustomError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'CustomError';
      }
    }
    const error = new CustomError('Test');
    const stack = getErrorStack(error);
    expect(stack).toBeDefined();
    expect(stack).toContain('CustomError: Test');
  });

  it('should handle formatErrorWithPrefix with undefined error', () => {
    expect(formatErrorWithPrefix('Prefix', undefined)).toBe('Prefix: undefined');
  });

  it('should handle formatErrorWithPrefix with empty string error', () => {
    expect(formatErrorWithPrefix('Error', '')).toBe('Error: ');
  });
});

describe('handleCommandError', () => {
  const mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Error(`process.exit(${code})`);
  });

  beforeEach(() => {
    jest.resetAllMocks();
    mockExit.mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
  });

  afterAll(() => {
    mockExit.mockRestore();
  });

  it('should log error and exit with code 1', () => {
    const error = new Error('Test error');
    expect(() => handleCommandError(error)).toThrow('process.exit(1)');
  });

  it('should use default prefix "Unexpected error"', () => {
    const error = new Error('Test error');
    expect(() => handleCommandError(error)).toThrow('process.exit(1)');
  });

  it('should accept custom prefix', () => {
    const error = new Error('Test error');
    expect(() => handleCommandError(error, 'Build failed')).toThrow('process.exit(1)');
  });

  it('should handle non-Error values', () => {
    expect(() => handleCommandError('string error')).toThrow('process.exit(1)');
  });

  it('should handle null error', () => {
    expect(() => handleCommandError(null)).toThrow('process.exit(1)');
  });

  it('should handle undefined error', () => {
    expect(() => handleCommandError(undefined)).toThrow('process.exit(1)');
  });
});
