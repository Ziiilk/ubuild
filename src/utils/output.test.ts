import { writeLine } from './output';
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
