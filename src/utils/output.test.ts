import { writeLine, writeSuccess, writeError, writeWarning, writeInfo } from './output';
import { Logger } from './logger';

describe('writeLine', () => {
  let writeSpy: jest.SpyInstance;

  beforeEach(() => {
    writeSpy = jest.spyOn(Logger, 'write').mockImplementation(() => {});
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it('writes message with newline to stdout', () => {
    writeLine('test message');

    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy).toHaveBeenCalledWith('test message\n');
  });

  it('writes empty line when no message provided', () => {
    writeLine();

    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy).toHaveBeenCalledWith('\n');
  });

  it('writes empty string when empty message provided', () => {
    writeLine('');

    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy).toHaveBeenCalledWith('\n');
  });

  it('writes message with special characters', () => {
    writeLine('message with\ttab and \n newline');

    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy).toHaveBeenCalledWith('message with\ttab and \n newline\n');
  });

  it('writes unicode message', () => {
    writeLine('Hello 世界 🌍');

    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy).toHaveBeenCalledWith('Hello 世界 🌍\n');
  });
});

describe('writeSuccess', () => {
  let successSpy: jest.SpyInstance;

  beforeEach(() => {
    successSpy = jest.spyOn(Logger, 'success').mockImplementation(() => {});
  });

  afterEach(() => {
    successSpy.mockRestore();
  });

  it('writes success message to stdout', () => {
    writeSuccess('Operation completed');

    expect(successSpy).toHaveBeenCalledTimes(1);
    expect(successSpy).toHaveBeenCalledWith('Operation completed');
  });

  it('handles empty success message', () => {
    writeSuccess('');

    expect(successSpy).toHaveBeenCalledTimes(1);
    expect(successSpy).toHaveBeenCalledWith('');
  });

  it('handles success message with special characters', () => {
    writeSuccess('Success: 100% complete!');

    expect(successSpy).toHaveBeenCalledTimes(1);
    expect(successSpy).toHaveBeenCalledWith('Success: 100% complete!');
  });
});

describe('writeError', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(Logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('writes error message to stderr', () => {
    writeError('Operation failed');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('Operation failed');
  });

  it('handles empty error message', () => {
    writeError('');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('');
  });

  it('handles error message with special characters', () => {
    writeError('Error: File not found at /path/to/file');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('Error: File not found at /path/to/file');
  });
});

describe('writeWarning', () => {
  let warningSpy: jest.SpyInstance;

  beforeEach(() => {
    warningSpy = jest.spyOn(Logger, 'warning').mockImplementation(() => {});
  });

  afterEach(() => {
    warningSpy.mockRestore();
  });

  it('writes warning message to stdout', () => {
    writeWarning('Deprecated feature used');

    expect(warningSpy).toHaveBeenCalledTimes(1);
    expect(warningSpy).toHaveBeenCalledWith('Deprecated feature used');
  });

  it('handles empty warning message', () => {
    writeWarning('');

    expect(warningSpy).toHaveBeenCalledTimes(1);
    expect(warningSpy).toHaveBeenCalledWith('');
  });

  it('handles warning message with special characters', () => {
    writeWarning('Warning: Config file "settings.json" not found');

    expect(warningSpy).toHaveBeenCalledTimes(1);
    expect(warningSpy).toHaveBeenCalledWith('Warning: Config file "settings.json" not found');
  });
});

describe('writeInfo', () => {
  let infoSpy: jest.SpyInstance;

  beforeEach(() => {
    infoSpy = jest.spyOn(Logger, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  it('writes info message to stdout', () => {
    writeInfo('Processing started');

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledWith('Processing started');
  });

  it('handles empty info message', () => {
    writeInfo('');

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledWith('');
  });

  it('handles info message with special characters', () => {
    writeInfo('Info: Found 42 files in /home/user/docs');

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledWith('Info: Found 42 files in /home/user/docs');
  });
});
