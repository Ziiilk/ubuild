/**
 * Unreal Engine path resolution utilities.
 *
 * Provides shared helpers for resolving paths to Unreal Engine build tools,
 * eliminating duplication across core modules that interact with UnrealBuildTool.
 *
 * @module utils/unreal-paths
 */

import path from 'path';
import fs from 'fs-extra';
import { Platform } from './platform';

/**
 * Resolves the path to the UnrealBuildTool executable within an engine installation
 * and validates that it exists on disk.
 *
 * This function centralizes the UBT path construction that was previously duplicated
 * across BuildExecutor, ProjectGenerator, and CompileCommandsGenerator.
 *
 * @param enginePath - Root path of the Unreal Engine installation
 * @returns Promise resolving to the absolute path of the UnrealBuildTool executable
 * @throws Error if the UnrealBuildTool executable is not found at the expected location
 *
 * @example
 * ```typescript
 * const ubtPath = await resolveUnrealBuildToolPath('C:\\Program Files\\Epic Games\\UE_5.3');
 * // ubtPath: 'C:\\Program Files\\Epic Games\\UE_5.3\\Engine\\Binaries\\DotNET\\UnrealBuildTool\\UnrealBuildTool.exe'
 * ```
 */
export async function resolveUnrealBuildToolPath(enginePath: string): Promise<string> {
  const ubtPath = path.join(
    enginePath,
    'Engine',
    'Binaries',
    'DotNET',
    'UnrealBuildTool',
    `UnrealBuildTool${Platform.exeExtension()}`
  );

  if (!(await fs.pathExists(ubtPath))) {
    throw new Error(`UnrealBuildTool not found at: ${ubtPath}`);
  }

  return ubtPath;
}
