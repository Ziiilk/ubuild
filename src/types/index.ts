/**
 * Type definitions for ubuild
 *
 * Central export point for all TypeScript interfaces and types used throughout
 * the ubuild CLI tool. Import types from this module for cleaner imports.
 *
 * @example
 * ```typescript
 * import type {
 *   BuildOptions,
 *   BuildResult,
 *   ProjectInfo,
 *   EngineInstallation
 * } from '@zitool/ubuild/types';
 * ```
 */

// Build types
export type {
  BuildTarget,
  BuildConfiguration,
  BuildPlatform,
  BuildTargetWithCustom,
  BuildConfigurationWithCustom,
  BuildPlatformWithCustom,
  BuildOptions,
  BuildResult,
} from './build';
export { BUILD_TARGETS, BUILD_CONFIGS, BUILD_PLATFORMS } from './build';

// Engine types
export type {
  EngineVersionInfo,
  EngineInstallation,
  EngineAssociation,
  EngineDetectionResult,
  EnginePathResolutionOptions,
} from './engine';

// Generate types
export type { IDE, GenerateOptions, GenerateResult } from './generate';

// Init types
export type { ProjectType, InitOptions, InitResult } from './init';

// Project types
export type {
  UProject,
  ProjectInfo,
  ProjectDetectionOptions,
  ProjectDetectionResult,
  ProjectPathResolution,
} from './project';
