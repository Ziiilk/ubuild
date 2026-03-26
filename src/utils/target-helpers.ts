import type { BuildTarget } from '../types/build';

/**
 * Target type helper functions for Unreal Engine build targets.
 * Centralizes target type inference logic used across multiple modules.
 */

/**
 * Infers the target type from a target name based on naming conventions.
 * @param name - The target name (e.g., "MyProjectEditor", "MyProjectClient")
 * @returns The inferred target type: 'Editor', 'Client', 'Server', or 'Game'
 *
 * @example
 * inferTargetType('MyProjectEditor') // returns 'Editor'
 * inferTargetType('MyProjectClient') // returns 'Client'
 * inferTargetType('MyProjectServer') // returns 'Server'
 * inferTargetType('MyProject') // returns 'Game'
 */
export function inferTargetType(name: string): BuildTarget {
  const lower = name.toLowerCase();
  if (lower.includes('editor')) {
    return 'Editor';
  }
  if (lower.includes('client')) {
    return 'Client';
  }
  if (lower.includes('server')) {
    return 'Server';
  }
  return 'Game';
}

/**
 * Checks if a target name represents a generic target type.
 * @param target - The target name to check
 * @returns True if the target is one of the generic types
 */
export function isGenericTarget(target: string): target is BuildTarget {
  return ['Editor', 'Game', 'Client', 'Server'].includes(target);
}
