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
 * Options for configuring the self-evolution driver.
 *
 * @example
 * ```typescript
 * import type { SelfEvolverOptions } from '@zitool/ubuild/types';
 *
 * const options: SelfEvolverOptions = {
 *   once: true,
 *   dryRun: false,
 *   logger: (msg) => console.log(msg)
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
}
