/**
 * Centralized constants for valid option values.
 * Used across types, validators, and commands for consistency.
 *
 * @module utils/constants
 *
 * @example
 * ```typescript
 * import { BUILD_TARGETS, DEFAULTS } from './utils/constants';
 *
 * if (BUILD_TARGETS.includes(target)) {
 *   console.log(`Valid target: ${target}`);
 * }
 * ```
 */

/** Valid build targets for Unreal Engine projects. */
export const BUILD_TARGETS = ['Editor', 'Game', 'Client', 'Server'] as const;

/** Valid build configurations for Unreal Engine projects. */
export const BUILD_CONFIGS = ['Debug', 'DebugGame', 'Development', 'Shipping', 'Test'] as const;

/** Valid build platforms for Unreal Engine projects. */
export const BUILD_PLATFORMS = ['Win64', 'Win32', 'Linux', 'Mac', 'Android', 'IOS'] as const;

/** Valid project types for initialization. */
export const PROJECT_TYPES = ['cpp', 'blueprint', 'blank'] as const;

/** Valid IDE types for project generation. */
export const IDE_TYPES = ['sln', 'vscode', 'clion', 'xcode', 'vs2022'] as const;

/** Union type of valid build target names. */
export type BuildTarget = (typeof BUILD_TARGETS)[number];

/** Union type of valid build configuration names. */
export type BuildConfig = (typeof BUILD_CONFIGS)[number];

/** Union type of valid build platform names. */
export type BuildPlatform = (typeof BUILD_PLATFORMS)[number];

/** Union type of valid project type names. */
export type ProjectType = (typeof PROJECT_TYPES)[number];

/** Union type of valid IDE type names. */
export type IDEType = (typeof IDE_TYPES)[number];

/**
 * Default values for various options across the CLI.
 * Used when options are not explicitly specified by the user.
 */
export const DEFAULTS = {
  /** Default build target when none specified. */
  BUILD_TARGET: 'Editor',
  /** Default build configuration when none specified. */
  BUILD_CONFIG: 'Development',
  /** Default build platform when none specified. */
  BUILD_PLATFORM: 'Win64',
  /** Default project type for initialization. */
  PROJECT_TYPE: 'cpp',
  /** Default project template for initialization. */
  BUILD_TEMPLATE: 'Basic',
  /** Default IDE type for project generation. */
  IDE: 'sln',
  /** Maximum depth for recursive file searches. */
  MAX_FIND_DEPTH: 3,
} as const;
