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
 * Known UnrealBuildTool locations within an engine installation, ordered by preference.
 *
 * UE5.3+ moved UBT into a subdirectory, while earlier versions placed it directly
 * under DotNET. Checking all locations ensures compatibility across UE5 releases.
 */
const UBT_RELATIVE_PATHS = [
  // UE5.3+ (newer layout with subdirectory)
  ['Engine', 'Binaries', 'DotNET', 'UnrealBuildTool'],
  // UE5.0–5.2 (flat layout under DotNET)
  ['Engine', 'Binaries', 'DotNET'],
] as const;

/**
 * Resolves the path to the UnrealBuildTool executable within an engine installation
 * and validates that it exists on disk.
 *
 * Tries multiple known UBT locations to support different UE5 versions:
 * - UE5.3+: `Engine/Binaries/DotNET/UnrealBuildTool/UnrealBuildTool.exe`
 * - UE5.0–5.2: `Engine/Binaries/DotNET/UnrealBuildTool.exe`
 *
 * This function centralizes the UBT path construction that was previously duplicated
 * across BuildExecutor, ProjectGenerator, and CompileCommandsGenerator.
 *
 * @param enginePath - Root path of the Unreal Engine installation
 * @returns Promise resolving to the absolute path of the UnrealBuildTool executable
 * @throws Error if the UnrealBuildTool executable is not found at any expected location
 *
 * @example
 * ```typescript
 * const ubtPath = await resolveUnrealBuildToolPath('C:\\Program Files\\Epic Games\\UE_5.3');
 * // ubtPath: 'C:\\Program Files\\Epic Games\\UE_5.3\\Engine\\Binaries\\DotNET\\UnrealBuildTool\\UnrealBuildTool.exe'
 * ```
 */
export async function resolveUnrealBuildToolPath(enginePath: string): Promise<string> {
  const exeName = `UnrealBuildTool${Platform.exeExtension()}`;

  for (const segments of UBT_RELATIVE_PATHS) {
    const candidate = path.join(enginePath, ...segments, exeName);
    if (await fs.pathExists(candidate)) {
      return candidate;
    }
  }

  // Build a descriptive error listing all attempted locations
  const tried = UBT_RELATIVE_PATHS.map((s) => path.join(enginePath, ...s, exeName));
  throw new Error(`UnrealBuildTool not found. Tried:\n${tried.map((p) => `  - ${p}`).join('\n')}`);
}
