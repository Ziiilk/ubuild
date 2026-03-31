/**
 * Type definitions for build operations.
 *
 * Provides TypeScript interfaces and type aliases for configuring and
 * executing Unreal Engine build operations, including build targets,
 * configurations, platforms, and result types.
 *
 * @module types/build
 * @see {@link BuildOptions} for build configuration options
 * @see {@link BuildResult} for build operation results
 */

import { Writable } from 'stream';
import { Logger } from '../utils/logger';
import { BUILD_TARGETS, BUILD_CONFIGS, BUILD_PLATFORMS } from '../utils/constants';

// Re-export the strict types from constants.ts for API consumers
export { BUILD_TARGETS, BUILD_CONFIGS, BUILD_PLATFORMS };

/**
 * Strict union type for valid build targets.
 *
 * Represents the standard Unreal Engine build targets that can be used
 * when building a project. For custom plugin-specific targets, use
 * {@link BuildTargetWithCustom} instead.
 *
 * @example
 * ```typescript
 * const target: BuildTarget = 'Editor';  // Valid
 * const target2: BuildTarget = 'Game';   // Valid
 * ```
 *
 * @see {@link BUILD_TARGETS} for the complete list of valid targets
 * @see {@link BuildTargetWithCustom} for targets including custom strings
 */
export type BuildTarget = (typeof BUILD_TARGETS)[number];

/**
 * Strict union type for valid build configurations.
 *
 * Represents the standard Unreal Engine build configurations that control
 * optimization levels and debugging features. Each configuration balances
 * between performance and debuggability differently.
 *
 * @example
 * ```typescript
 * const config: BuildConfiguration = 'Development'; // Development build with debugging
 * const config2: BuildConfiguration = 'Shipping';   // Optimized release build
 * ```
 *
 * @see {@link BUILD_CONFIGS} for the complete list of valid configurations
 * @see {@link BuildConfigurationWithCustom} for configurations including custom strings
 */
export type BuildConfiguration = (typeof BUILD_CONFIGS)[number];

/**
 * Strict union type for valid build platforms.
 *
 * Represents the target platforms supported by Unreal Engine for building.
 * Each platform requires the appropriate SDK to be installed.
 *
 * @example
 * ```typescript
 * const platform: BuildPlatform = 'Win64';  // Windows 64-bit build
 * const platform2: BuildPlatform = 'Linux'; // Linux build
 * ```
 *
 * @see {@link BUILD_PLATFORMS} for the complete list of valid platforms
 * @see {@link BuildPlatformWithCustom} for platforms including custom strings
 */
export type BuildPlatform = (typeof BUILD_PLATFORMS)[number];

/**
 * Build target allowing custom strings for plugin-specific targets.
 *
 * Extends {@link BuildTarget} to accept both standard targets and custom
 * target names that may be defined by plugins or project-specific needs.
 *
 * @example
 * ```typescript
 * const target: BuildTargetWithCustom = 'Editor';           // Standard target
 * const target2: BuildTargetWithCustom = 'MyPluginTarget';  // Custom plugin target
 * ```
 *
 * @see {@link BuildTarget} for the strict union of standard targets
 */
export type BuildTargetWithCustom = BuildTarget | string;

/**
 * Build configuration allowing custom strings.
 *
 * Extends {@link BuildConfiguration} to accept both standard configurations
 * and custom configuration names that may be project-specific.
 *
 * @example
 * ```typescript
 * const config: BuildConfigurationWithCustom = 'Development';     // Standard config
 * const config2: BuildConfigurationWithCustom = 'CustomConfig';   // Project-specific config
 * ```
 *
 * @see {@link BuildConfiguration} for the strict union of standard configurations
 */
export type BuildConfigurationWithCustom = BuildConfiguration | string;

/**
 * Build platform allowing custom strings.
 *
 * Extends {@link BuildPlatform} to accept both standard platforms and custom
 * platform identifiers that may be used for specialized build scenarios.
 *
 * @example
 * ```typescript
 * const platform: BuildPlatformWithCustom = 'Win64';           // Standard platform
 * const platform2: BuildPlatformWithCustom = 'CustomPlatform'; // Specialized platform
 * ```
 *
 * @see {@link BuildPlatform} for the strict union of standard platforms
 */
export type BuildPlatformWithCustom = BuildPlatform | string;

/**
 * Options for executing a build operation.
 *
 * @see {@link BuildResult} for the result type returned after building
 * @see {@link BuildTarget}, {@link BuildConfiguration}, {@link BuildPlatform} for valid values
 */
export interface BuildOptions {
  /** Build target (Editor, Game, Client, Server) */
  target?: BuildTargetWithCustom;
  /** Build configuration (Debug, DebugGame, Development, Shipping, Test) */
  config?: BuildConfigurationWithCustom;
  /** Target platform (Win64, Win32, Linux, Mac, Android, IOS) */
  platform?: BuildPlatformWithCustom;
  /** Path to project directory or .uproject file */
  projectPath?: string;
  /** Path to Unreal Engine installation */
  enginePath?: string;
  /** Whether to perform a clean build */
  clean?: boolean;
  /** Whether to enable verbose output */
  verbose?: boolean;
  /** Additional arguments to pass to the build tool */
  additionalArgs?: string[];
  /** Logger instance for output */
  logger?: Logger;
  /** Writable stream for stdout */
  stdout?: Writable;
  /** Writable stream for stderr */
  stderr?: Writable;
  /** Suppress all output */
  silent?: boolean;
}

/**
 * Result of a build operation.
 *
 * @see {@link BuildOptions} for the options used to configure the build
 */
export interface BuildResult {
  /** Whether the build succeeded */
  success: boolean;
  /** Exit code from the build process */
  exitCode: number;
  /** Standard output from the build */
  stdout: string;
  /** Standard error from the build */
  stderr: string;
  /** Build duration in milliseconds */
  duration: number;
  /** Error message if build failed */
  error?: string;
}
