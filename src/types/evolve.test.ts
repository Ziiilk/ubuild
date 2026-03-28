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
      useTsNode: true,
      maxRetries: 3,
      projectRoot: '/custom/project/path',
      keepUntracked: true,
    };

    expect(options.logger).toBeDefined();
    expect(options.once).toBe(true);
    expect(options.dryRun).toBe(false);
    expect(options.verifyTimeoutMs).toBe(120000);
    expect(options.opencodeTimeoutMs).toBe(900000);
    expect(options.sleepMs).toBe(10000);
    expect(options.useTsNode).toBe(true);
    expect(options.maxRetries).toBe(3);
    expect(options.projectRoot).toBe('/custom/project/path');
    expect(options.keepUntracked).toBe(true);
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

    const optionsWithUseTsNode: SelfEvolverOptions = {
      useTsNode: true,
    };
    expect(optionsWithUseTsNode.useTsNode).toBe(true);

    const optionsWithMaxRetries: SelfEvolverOptions = {
      maxRetries: 10,
    };
    expect(optionsWithMaxRetries.maxRetries).toBe(10);

    const optionsWithUnlimitedRetries: SelfEvolverOptions = {
      maxRetries: -1,
    };
    expect(optionsWithUnlimitedRetries.maxRetries).toBe(-1);

    const optionsWithProjectRoot: SelfEvolverOptions = {
      projectRoot: '/custom/project/path',
    };
    expect(optionsWithProjectRoot.projectRoot).toBe('/custom/project/path');

    const optionsWithKeepUntracked: SelfEvolverOptions = {
      keepUntracked: true,
    };
    expect(optionsWithKeepUntracked.keepUntracked).toBe(true);

    const optionsWithKeepUntrackedFalse: SelfEvolverOptions = {
      keepUntracked: false,
    };
    expect(optionsWithKeepUntrackedFalse.keepUntracked).toBe(false);
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

  it('contains no duplicate commands', () => {
    const uniqueCommands = new Set(EVOLUTION_VERIFY_COMMANDS);
    expect(uniqueCommands.size).toBe(EVOLUTION_VERIFY_COMMANDS.length);
  });

  it('contains no empty or whitespace-only commands', () => {
    expect(EVOLUTION_VERIFY_COMMANDS.every((cmd) => cmd.trim().length > 0)).toBe(true);
  });

  it('includes evolve command for self-verification', () => {
    expect(EVOLUTION_VERIFY_COMMANDS).toContain('evolve');
  });
});
