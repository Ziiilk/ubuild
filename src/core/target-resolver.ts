import { BuildExecutor } from './build-executor';

export interface ResolvedTarget {
  name: string;
  type: string;
}

const GENERIC_TARGETS = ['Editor', 'Game', 'Client', 'Server'] as const;

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
   * Resolve a single target request to an actual target name.
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
   * Check if a target name is a generic type (Editor, Game, Client, Server).
   */
  static isGenericTarget(target: string): boolean {
    return GENERIC_TARGETS.includes(target as (typeof GENERIC_TARGETS)[number]);
  }

  /**
   * Get all generic target types.
   */
  static getGenericTargets(): readonly string[] {
    return GENERIC_TARGETS;
  }
}
