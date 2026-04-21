/**
 * Type definitions for ubuild
 *
 * Central export point for all TypeScript interfaces and types used throughout
 * the ubuild CLI tool. Import types from this module for cleaner imports.
 *
 * This module aggregates all type definitions organized by functional area:
 * - Build types: targets, configurations, platforms, options, and results
 * - Engine types: engine installations, associations, and detection results
 * - Generate types: IDE project generation options and results
 * - Init types: project initialization options and results
 * - Project types: .uproject file structure and detection results
 * - Clean types: cleanup operation options and results
 *
 * @module
 * @file Central type export point for the ubuild CLI tool
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

/**
 * Build types for compiling Unreal Engine projects.
 *
 * These types define the build targets (Editor, Game, Client, Server),
 * configurations (Debug, Development, Shipping, etc.), and platforms
 * (Win64, Linux, Mac, etc.) supported by the build system.
 *
 * @example
 * ```typescript
 * import type { BuildOptions, BuildResult, BuildTarget } from '@zitool/ubuild/types';
 *
 * const options: BuildOptions = {
 *   target: 'Editor',
 *   config: 'Development',
 *   platform: 'Win64'
 * };
 * ```
 */
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

/**
 * Constants for valid build configurations.
 *
 * Use these constants to validate build parameters or iterate over
 * all available options.
 *
 * @example
 * ```typescript
 * import { BUILD_TARGETS, BUILD_CONFIGS, BUILD_PLATFORMS } from '@zitool/ubuild/types';
 *
 * console.log('Available targets:', BUILD_TARGETS); // ['Editor', 'Game', 'Client', 'Server']
 * ```
 */
export { BUILD_TARGETS, BUILD_CONFIGS, BUILD_PLATFORMS } from './build';

/**
 * Engine types for Unreal Engine installation detection and resolution.
 *
 * These types handle engine associations from .uproject files,
 * registry-based engine lookups, and version information.
 *
 * @example
 * ```typescript
 * import type { EngineInstallation, EngineDetectionResult } from '@zitool/ubuild/types';
 *
 * const engine: EngineInstallation = {
 *   path: 'C:/Program Files/Epic Games/UE_5.3',
 *   version: '5.3.2',
 *   source: 'launcher'
 * };
 * ```
 */
export type {
  EngineVersionInfo,
  EngineInstallation,
  EngineAssociation,
  EngineDetectionResult,
  EnginePathResolutionOptions,
} from './engine';

/**
 * Project file generation types for IDE integration.
 *
 * Supports generating project files for Visual Studio, VSCode,
 * CLion, Xcode, and other supported IDEs.
 *
 * @example
 * ```typescript
 * import type { GenerateOptions, IDE } from '@zitool/ubuild/types';
 *
 * const options: GenerateOptions = {
 *   ide: 'vscode',
 *   projectPath: './MyGame.uproject'
 * };
 * ```
 */
export type { IDE, GenerateOptions, GenerateResult } from './generate';

/**
 * Project initialization types for creating new Unreal Engine projects.
 *
 * Supports C++, Blueprint, and Blank project templates with
 * configurable engine associations.
 *
 * @example
 * ```typescript
 * import type { InitOptions, ProjectType } from '@zitool/ubuild/types';
 *
 * const options: InitOptions = {
 *   name: 'MyProject',
 *   type: 'cpp',
 *   template: 'ThirdPerson'
 * };
 * ```
 */
export type { ProjectType, InitOptions, InitResult } from './init';

/**
 * Project detection and information types.
 *
 * Defines the structure of .uproject files, project metadata,
 * and detection results for analyzing Unreal Engine projects.
 *
 * @example
 * ```typescript
 * import type { UProject, ProjectInfo, ProjectDetectionResult } from '@zitool/ubuild/types';
 *
 * // UProject represents the parsed .uproject JSON structure
 * const project: UProject = {
 *   FileVersion: 3,
 *   EngineAssociation: '5.3',
 *   Category: '',
 *   Description: ''
 * };
 * ```
 */
export type {
  UProject,
  ProjectInfo,
  ProjectDetectionOptions,
  ProjectDetectionResult,
  ProjectPathResolution,
} from './project';

/**
 * Clean operation types for removing build artifacts.
 *
 * Defines options and results for cleaning Binaries, Intermediate,
 * and Saved directories from Unreal Engine projects.
 *
 * @example
 * ```typescript
 * import type { CleanOptions, CleanResult } from '@zitool/ubuild/types';
 *
 * const options: CleanOptions = {
 *   projectPath: './MyGame',
 *   binariesOnly: false,
 *   dryRun: true
 * };
 * ```
 */
export type { CleanOptions, CleanResult } from './clean';

/**
 * Engine switch types for changing project engine associations.
 *
 * Defines options and results for switching an Unreal Engine project
 * to a different engine installation.
 *
 * @example
 * ```typescript
 * import type { SwitchOptions, SwitchResult } from '@zitool/ubuild/types';
 *
 * const options: SwitchOptions = {
 *   projectPath: './MyGame',
 *   enginePath: 'C:/Program Files/Epic Games/UE_5.4',
 * };
 * ```
 */
export type { SwitchOptions, SwitchResult } from './switch';
