/**
 * Tests for evolve types
 *
 * @module types/evolve.test
 */

import type { SelfEvolverOptions } from './evolve';

describe('SelfEvolverOptions interface', () => {
  it('accepts valid options with all properties', () => {
    const mockLogger = jest.fn();
    const options: SelfEvolverOptions = {
      logger: mockLogger,
      once: true,
      dryRun: false,
      verifyTimeoutMs: 120000,
      opencodeTimeoutMs: 900000,
    };

    expect(options.logger).toBeDefined();
    expect(options.once).toBe(true);
    expect(options.dryRun).toBe(false);
    expect(options.verifyTimeoutMs).toBe(120000);
    expect(options.opencodeTimeoutMs).toBe(900000);
  });

  it('accepts empty options object', () => {
    const options: SelfEvolverOptions = {};
    expect(options).toBeDefined();
  });

  it('accepts partial options', () => {
    const optionsWithLogger: SelfEvolverOptions = {
      logger: jest.fn(),
    };
    expect(optionsWithLogger.logger).toBeDefined();

    const optionsWithOnce: SelfEvolverOptions = {
      once: true,
    };
    expect(optionsWithOnce.once).toBe(true);

    const optionsWithDryRun: SelfEvolverOptions = {
      dryRun: true,
    };
    expect(optionsWithDryRun.dryRun).toBe(true);

    const optionsWithVerifyTimeout: SelfEvolverOptions = {
      verifyTimeoutMs: 120000,
    };
    expect(optionsWithVerifyTimeout.verifyTimeoutMs).toBe(120000);

    const optionsWithOpencodeTimeout: SelfEvolverOptions = {
      opencodeTimeoutMs: 900000,
    };
    expect(optionsWithOpencodeTimeout.opencodeTimeoutMs).toBe(900000);
  });

  it('logger function can be called', () => {
    const mockLogger = jest.fn();
    const options: SelfEvolverOptions = {
      logger: mockLogger,
    };

    options.logger?.('test message');
    expect(mockLogger).toHaveBeenCalledWith('test message');
  });
});
