import { Writable } from 'stream';
import { Logger } from '../utils/logger';
import { BUILD_TARGETS, BUILD_CONFIGS, BUILD_PLATFORMS } from '../utils/constants';

// Re-export the strict types from constants.ts for API consumers
export { BUILD_TARGETS, BUILD_CONFIGS, BUILD_PLATFORMS };

// Strict union types for valid values
export type BuildTarget = (typeof BUILD_TARGETS)[number];
export type BuildConfiguration = (typeof BUILD_CONFIGS)[number];
export type BuildPlatform = (typeof BUILD_PLATFORMS)[number];

// Allow arbitrary string for custom/unknown targets (e.g., plugin-specific targets)
export type BuildTargetWithCustom = BuildTarget | string;
export type BuildConfigurationWithCustom = BuildConfiguration | string;
export type BuildPlatformWithCustom = BuildPlatform | string;

export interface BuildOptions {
  target?: BuildTargetWithCustom;
  config?: BuildConfigurationWithCustom;
  platform?: BuildPlatformWithCustom;
  projectPath?: string;
  enginePath?: string;
  clean?: boolean;
  verbose?: boolean;
  additionalArgs?: string[];
  logger?: Logger;
  stdout?: Writable;
  stderr?: Writable;
  silent?: boolean;
}

export interface BuildResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  error?: string;
}
