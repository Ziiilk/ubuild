import { Writable } from 'stream';
import { Logger } from '../utils/logger';
import { BUILD_TARGETS, BUILD_CONFIGS, BUILD_PLATFORMS } from '../utils/constants';

// Re-export the strict types from constants.ts for API consumers
export { BUILD_TARGETS, BUILD_CONFIGS, BUILD_PLATFORMS };

/** Strict union type for valid build targets. */
export type BuildTarget = (typeof BUILD_TARGETS)[number];
/** Strict union type for valid build configurations. */
export type BuildConfiguration = (typeof BUILD_CONFIGS)[number];
/** Strict union type for valid build platforms. */
export type BuildPlatform = (typeof BUILD_PLATFORMS)[number];

/** Build target allowing custom strings for plugin-specific targets. */
export type BuildTargetWithCustom = BuildTarget | string;
/** Build configuration allowing custom strings. */
export type BuildConfigurationWithCustom = BuildConfiguration | string;
/** Build platform allowing custom strings. */
export type BuildPlatformWithCustom = BuildPlatform | string;

/** Options for executing a build operation. */
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

/** Result of a build operation. */
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
