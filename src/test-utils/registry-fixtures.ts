/**
 * Registry mock utilities for testing Windows Registry-based engine detection.
 *
 * The EngineResolver queries the registry via `execa('reg', ['query', key, '/s'])`.
 * These helpers produce mock stdout strings matching the Windows `reg query` output
 * format so tests can simulate registry-based engine installations without touching
 * the real registry.
 *
 * @example
 * ```typescript
 * import { buildRegistryOutput, RegistryEngineEntry } from '../test-utils/registry-fixtures';
 *
 * const entries: RegistryEngineEntry[] = [
 *   { guid: '{ABC-123}', path: 'C:\\Epic\\UE_5.3' },
 *   { guid: '{DEF-456}', path: 'D:\\Engines\\UE_5.4' },
 * ];
 *
 * mockExeca.mockImplementation(async () => ({
 *   stdout: buildRegistryOutput('HKEY_CURRENT_USER\\SOFTWARE\\Epic Games\\Unreal Engine\\Builds', entries),
 * }));
 * ```
 */

/**
 * Represents a single engine entry in the Windows Registry.
 */
export interface RegistryEngineEntry {
  /** Engine GUID, e.g. '{12345678-1234-1234-1234-123456789012}' */
  guid: string;
  /** Absolute path to the engine installation */
  path: string;
  /** Whether to use multi-line format (GUID and REG_SZ on separate lines). Default: false */
  multiLine?: boolean;
}

/**
 * Builds a mock `reg query /s` stdout string from the given entries.
 *
 * @param registryKey - The registry key header, e.g. 'HKEY_CURRENT_USER\\SOFTWARE\\...'
 * @param entries - Array of engine entries to encode
 * @returns A string matching the format produced by `reg query`
 */
export function buildRegistryOutput(
  registryKey: string,
  entries: RegistryEngineEntry[]
): string {
  const lines: string[] = [registryKey];

  for (const entry of entries) {
    if (entry.multiLine) {
      lines.push(entry.guid);
      lines.push(`    REG_SZ    ${entry.path}`);
    } else {
      lines.push(`${entry.guid}    REG_SZ    ${entry.path}`);
    }
  }

  return lines.join('\n');
}

/**
 * Builds an empty `reg query` output that represents a key with no engine entries.
 *
 * @param registryKey - The registry key header
 * @returns A string containing only the key header
 */
export function buildEmptyRegistryOutput(registryKey: string): string {
  return registryKey;
}

/**
 * Creates a mock execa implementation that responds to `reg query` calls
 * with the provided registry data, keyed by registry path.
 *
 * Unknown registry keys will reject with a "unable to find the specified registry key" error,
 * matching real `reg query` behavior.
 *
 * @example
 * ```typescript
 * const mockImpl = createRegistryMock({
 *   'HKEY_CURRENT_USER\\SOFTWARE\\Epic Games\\Unreal Engine\\Builds': [
 *     { guid: '{ABC-123}', path: 'C:\\Epic\\UE_5.3' },
 *   ],
 * });
 * mockExeca.mockImplementation(mockImpl);
 * ```
 *
 * @param registryData - Map of registry key paths to their engine entries
 * @returns An async function suitable for use as a jest mock implementation
 */
export function createRegistryMock(
  registryData: Record<string, RegistryEngineEntry[]>
): (_cmd: string, args?: string[]) => Promise<{ stdout: string }> {
  return async (_cmd: string, args?: string[]) => {
    const key = args?.[1];
    if (key && key in registryData) {
      return { stdout: buildRegistryOutput(key, registryData[key]) };
    }
    throw new Error('ERROR: The system was unable to find the specified registry key or value.');
  };
}
