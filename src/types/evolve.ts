/**
 * Type definitions for the evolve command.
 *
 * Provides TypeScript interfaces for configuring and executing
 * self-evolution operations using OpenCode.
 *
 * @module types/evolve
 * @see {@link SelfEvolverOptions} for evolution configuration options
 */

/**
 * Commands to verify during self-evolution.
 * These commands are checked with `--help` to ensure they work correctly.
 * When adding new commands, add them here to include them in verification.
 */
export const EVOLUTION_VERIFY_COMMANDS: string[] = [
  'list',
  'engine',
  'build',
  'generate',
  'init',
  'run',
  'clean',
  'update',
  'version',
  'gencodebase',
  'evolve',
];

/**
 * Options for configuring the self-evolution driver.
 *
 * @example
 * ```typescript
 * import type { SelfEvolverOptions } from '@zitool/ubuild/types';
 *
 * const options: SelfEvolverOptions = {
 *   once: true,
 *   dryRun: false,
 *   logger: (msg) => console.log(msg),
 *   verifyTimeoutMs: 120000,
 *   opencodeTimeoutMs: 900000
 * };
 * ```
 */
export interface SelfEvolverOptions {
  /** Custom logger function for evolution output */
  logger?: (msg: string) => void;
  /** Run only one iteration and exit (default: false - run forever) */
  once?: boolean;
  /** Show what would be done without actually executing */
  dryRun?: boolean;
  /** Timeout for verification checks in milliseconds (default: 60000) */
  verifyTimeoutMs?: number;
  /** Timeout for OpenCode execution in milliseconds (default: 600000) */
  opencodeTimeoutMs?: number;
  /** Sleep duration between iterations in milliseconds (default: 5000) */
  sleepMs?: number;
  /** Use ts-node for verification instead of compiled dist (default: false) */
  useTsNode?: boolean;
}
