/**
 * Centralized constants for valid option values.
 * Used across types, validators, and commands for consistency.
 */

export const BUILD_TARGETS = ['Editor', 'Game', 'Client', 'Server'] as const;
export const BUILD_CONFIGS = ['Debug', 'DebugGame', 'Development', 'Shipping', 'Test'] as const;
export const BUILD_PLATFORMS = ['Win64', 'Win32', 'Linux', 'Mac', 'Android', 'IOS'] as const;
export const PROJECT_TYPES = ['cpp', 'blueprint', 'blank'] as const;
export const IDE_TYPES = ['sln', 'vscode', 'clion', 'xcode', 'vs2022'] as const;

export type BuildTarget = (typeof BUILD_TARGETS)[number];
export type BuildConfig = (typeof BUILD_CONFIGS)[number];
export type BuildPlatform = (typeof BUILD_PLATFORMS)[number];
export type ProjectType = (typeof PROJECT_TYPES)[number];
export type IDEType = (typeof IDE_TYPES)[number];

export const DEFAULTS = {
  BUILD_TARGET: 'Editor',
  BUILD_CONFIG: 'Development',
  BUILD_PLATFORM: 'Win64',
  PROJECT_TYPE: 'cpp',
  IDE: 'sln',
  MAX_FIND_DEPTH: 3,
} as const;
