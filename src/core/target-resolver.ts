import { BuildExecutor } from './build-executor';

/** Represents a resolved build target with its name and type. */
export interface ResolvedTarget {
  /** Target name (e.g., 'MyProjectEditor') */
  name: string;
  /** Target type (Editor, Game, Client, or Server) */
  type: string;
}

const GENERIC_TARGETS = ['Editor', 'Game', 'Client', 'Server'] as const;

/**
 * Resolves generic build target names (like 'Editor') to actual project target names.
 * Maps user-friendly target types to specific .Target.cs files found in the project.
 */
export class TargetResolver {
  /**
   * Resolve a target string (which may be a generic type like 'Editor') to an actual target name.
   * If the target is a specific target name that exists in the project, it's used directly.
   * If the target is a generic type (Editor, Game, etc.), it looks for a matching target by type.
   * Returns undefined if no matching target is found.
   */
  static async resolveTargetName(projectPath: string, target: string): Promise<string | undefined> {
    const availableTargets = await BuildExecutor.getAvailableTargets(projectPath);

    if (availableTargets.length === 0) {
      return target;
    }

    const targetList = target.split(' ').filter(Boolean);
    const resolvedTargets: string[] = [];

    for (const requestedTarget of targetList) {
      const resolved = this.resolveSingleTarget(requestedTarget, availableTargets);
      if (resolved) {
        resolvedTargets.push(resolved);
      }
    }

    if (resolvedTargets.length === 0) {
      return undefined;
    }

    return resolvedTargets.join(' ');
  }

  /**
   * Resolve a target string and return it directly.
   * Returns the original target if no available targets exist, or if resolution fails.
   * Use this when you want the target to work even if project targets can't be determined.
   */
  static async resolveTarget(projectPath: string, target: string): Promise<string> {
    const resolved = await this.resolveTargetName(projectPath, target);
    return resolved ?? target;
  }

  /**
   * Resolves a single target request to an actual target name from available targets.
   * @param requestedTarget - The target name or generic type to resolve
   * @param availableTargets - Array of available targets in the project
   * @returns The resolved target name, or undefined if no match found
   */
  private static resolveSingleTarget(
    requestedTarget: string,
    availableTargets: ResolvedTarget[]
  ): string | undefined {
    const isGenericType = GENERIC_TARGETS.includes(
      requestedTarget as (typeof GENERIC_TARGETS)[number]
    );

    if (isGenericType) {
      // Look for a target with matching type
      const matchingTarget = availableTargets.find((t) => t.type === requestedTarget);
      if (matchingTarget) {
        return matchingTarget.name;
      }

      // Fallback: look for a target name containing the generic type
      const fallbackTarget = availableTargets.find((t) =>
        t.name.toLowerCase().includes(requestedTarget.toLowerCase())
      );
      if (fallbackTarget) {
        return fallbackTarget.name;
      }

      return undefined;
    }

    // Specific target name - check if it exists
    const targetExists = availableTargets.some((t) => t.name === requestedTarget);
    if (targetExists) {
      return requestedTarget;
    }

    return undefined;
  }

  /**
   * Checks if a target name is a generic type (Editor, Game, Client, Server).
   * Generic targets are resolved to specific project targets based on naming conventions.
   * @param target - The target name to check
   * @returns True if the target is a generic type
   */
  static isGenericTarget(target: string): boolean {
    return GENERIC_TARGETS.includes(target as (typeof GENERIC_TARGETS)[number]);
  }

  /**
   * Gets all available generic target types.
   * @returns Readonly array of generic target type names
   */
  static getGenericTargets(): readonly string[] {
    return GENERIC_TARGETS;
  }
}
