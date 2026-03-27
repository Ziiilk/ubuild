/**
 * Tests for evolve types
 *
 * @module types/evolve.test
 */

import type { SelfEvolverOptions } from './evolve';
import { EVOLUTION_VERIFY_COMMANDS } from './evolve';

describe('SelfEvolverOptions interface', () => {
  it('accepts valid options with all properties', () => {
    const mockLogger = jest.fn();
    const options: SelfEvolverOptions = {
      logger: mockLogger,
      once: true,
      dryRun: false,
      verifyTimeoutMs: 120000,
      opencodeTimeoutMs: 900000,
      sleepMs: 10000,
    };

    expect(options.logger).toBeDefined();
    expect(options.once).toBe(true);
    expect(options.dryRun).toBe(false);
    expect(options.verifyTimeoutMs).toBe(120000);
    expect(options.opencodeTimeoutMs).toBe(900000);
    expect(options.sleepMs).toBe(10000);
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

    const optionsWithSleepMs: SelfEvolverOptions = {
      sleepMs: 10000,
    };
    expect(optionsWithSleepMs.sleepMs).toBe(10000);
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

describe('EVOLUTION_VERIFY_COMMANDS', () => {
  it('contains all expected CLI commands', () => {
    expect(EVOLUTION_VERIFY_COMMANDS).toContain('list');
    expect(EVOLUTION_VERIFY_COMMANDS).toContain('engine');
    expect(EVOLUTION_VERIFY_COMMANDS).toContain('build');
    expect(EVOLUTION_VERIFY_COMMANDS).toContain('generate');
    expect(EVOLUTION_VERIFY_COMMANDS).toContain('init');
    expect(EVOLUTION_VERIFY_COMMANDS).toContain('run');
    expect(EVOLUTION_VERIFY_COMMANDS).toContain('clean');
    expect(EVOLUTION_VERIFY_COMMANDS).toContain('update');
    expect(EVOLUTION_VERIFY_COMMANDS).toContain('version');
    expect(EVOLUTION_VERIFY_COMMANDS).toContain('gencodebase');
    expect(EVOLUTION_VERIFY_COMMANDS).toContain('evolve');
  });

  it('has correct number of commands', () => {
    expect(EVOLUTION_VERIFY_COMMANDS).toHaveLength(11);
  });

  it('is defined as a readonly tuple', () => {
    // Verify the constant exists and has the expected structure
    expect(Array.isArray(EVOLUTION_VERIFY_COMMANDS)).toBe(true);
    expect(EVOLUTION_VERIFY_COMMANDS.every((cmd) => typeof cmd === 'string')).toBe(true);
  });
});
