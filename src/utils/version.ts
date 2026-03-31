/**
 * Version utility functions for semantic version comparison.
 *
 * Provides utilities for comparing semantic version strings following
 * the format "major.minor.patch" (e.g., "1.2.3").
 *
 * @module utils/version
 *
 * @example
 * ```typescript
 * import { compareVersions } from './utils/version';
 *
 * // Compare two versions
 * const result = compareVersions('1.2.3', '1.2.4');
 * // result is -1 (first version is lower)
 *
 * // Check if update is needed
 * if (compareVersions(latestVersion, currentVersion) > 0) {
 *   console.log('Update available');
 * }
 * ```
 */

/**
 * Compares two semantic version strings.
 *
 * Parses version strings in the format "major.minor.patch" (or with fewer/more parts)
 * and compares them numerically component by component.
 *
 * @param a - First version string (e.g., "1.2.3")
 * @param b - Second version string (e.g., "1.2.4")
 * @returns Negative number if a < b, positive number if a > b, 0 if equal
 *
 * @example
 * ```typescript
 * compareVersions('1.0.0', '1.0.1'); // Returns -1
 * compareVersions('2.0.0', '1.9.9'); // Returns 1
 * compareVersions('1.2.3', '1.2.3'); // Returns 0
 * compareVersions('1.2', '1.2.0');   // Returns 0 (missing parts treated as 0)
 * ```
 */
export function compareVersions(a: string, b: string): number {
  // Strip prerelease suffix (e.g., "1.0.0-rc.1" → "1.0.0") before splitting.
  // This prevents "-rc.1" from being split into ["0-rc", "1"] which would
  // produce an extra numeric component and skew the comparison.
  const partsA = a.split('-')[0].split('.').map(Number);
  const partsB = b.split('-')[0].split('.').map(Number);

  const maxLength = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < maxLength; i++) {
    // Use nullish coalescing (??) instead of logical OR (||) to correctly
    // distinguish between missing parts (undefined → 0) and NaN from
    // non-numeric segments. NaN ?? 0 still yields NaN, so we use a helper
    // that explicitly converts NaN to 0 for consistent comparison behavior.
    const partA = toNumericPart(partsA[i]);
    const partB = toNumericPart(partsB[i]);

    if (partA !== partB) {
      return partA - partB;
    }
  }

  return 0;
}

/**
 * Converts a version part to a numeric value for comparison.
 * Returns 0 for missing parts (undefined) and non-numeric segments (NaN),
 * ensuring consistent comparison behavior.
 *
 * @param value - The version part value (number, undefined, or NaN)
 * @returns The numeric value, or 0 if the part is missing or non-numeric
 */
function toNumericPart(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value)) {
    return 0;
  }
  return value;
}

/**
 * Checks if version a is greater than version b.
 *
 * @param a - First version string
 * @param b - Second version string
 * @returns True if a > b
 *
 * @example
 * ```typescript
 * isGreaterThan('2.0.0', '1.9.9'); // Returns true
 * isGreaterThan('1.0.0', '1.0.0'); // Returns false
 * ```
 */
export function isGreaterThan(a: string, b: string): boolean {
  return compareVersions(a, b) > 0;
}

/**
 * Checks if version a is less than version b.
 *
 * @param a - First version string
 * @param b - Second version string
 * @returns True if a < b
 *
 * @example
 * ```typescript
 * isLessThan('1.0.0', '1.0.1'); // Returns true
 * isLessThan('2.0.0', '1.9.9'); // Returns false
 * ```
 */
export function isLessThan(a: string, b: string): boolean {
  return compareVersions(a, b) < 0;
}

/**
 * Checks if two versions are equal.
 *
 * @param a - First version string
 * @param b - Second version string
 * @returns True if a === b
 *
 * @example
 * ```typescript
 * isEqual('1.2.3', '1.2.3'); // Returns true
 * isEqual('1.2.0', '1.2');   // Returns true (treated as equal)
 * ```
 */
export function isEqual(a: string, b: string): boolean {
  return compareVersions(a, b) === 0;
}
