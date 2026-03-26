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
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  const maxLength = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < maxLength; i++) {
    const partA = partsA[i] || 0;
    const partB = partsB[i] || 0;

    if (partA !== partB) {
      return partA - partB;
    }
  }

  return 0;
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
