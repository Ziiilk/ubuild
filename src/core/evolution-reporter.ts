/**
 * Evolution history aggregation.
 *
 * Reads `.evolve-history.jsonl` and produces an {@link EvolutionReport}
 * used internally by SelfDriver to inject factual history context into
 * the AI prompt and adjust decision scoring weights.
 *
 * @module core/evolution-reporter
 */

import fs from 'fs-extra';
import type { EvolutionRecord, EvolutionReport, MetricDelta } from '../types/evolve';

/** Default number of recent iterations to include in the trend window. */
const DEFAULT_RECENT_WINDOW = 10;

/**
 * Parse a JSONL file into an array of {@link EvolutionRecord} objects.
 * Malformed lines are silently skipped.
 */
export function parseEvolutionLog(content: string): EvolutionRecord[] {
  const records: EvolutionRecord[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed) as EvolutionRecord);
    } catch {
      // skip malformed lines
    }
  }
  return records;
}

/**
 * Build an {@link EvolutionReport} from a list of evolution records.
 */
export function buildReport(
  records: EvolutionRecord[],
  recentWindowSize: number = DEFAULT_RECENT_WINDOW
): EvolutionReport {
  const total = records.length;
  const successes = records.filter((r) => r.success);
  const failures = records.filter((r) => !r.success);

  // Decision distribution
  const decisionDistribution: Record<
    string,
    { count: number; successes: number; failures: number }
  > = {};
  for (const r of records) {
    const key = r.decision ?? 'UNKNOWN';
    if (!decisionDistribution[key]) {
      decisionDistribution[key] = { count: 0, successes: 0, failures: 0 };
    }
    decisionDistribution[key].count++;
    if (r.success) {
      decisionDistribution[key].successes++;
    } else {
      decisionDistribution[key].failures++;
    }
  }

  // Failure stages
  const failureStages: Record<string, number> = {};
  for (const r of failures) {
    const stage = r.failureStage ?? 'unknown';
    failureStages[stage] = (failureStages[stage] ?? 0) + 1;
  }

  // Top failure reasons
  const reasonCounts: Record<string, number> = {};
  for (const r of failures) {
    const reason = r.failureDetail ?? 'no detail';
    const normalized = reason.length > 80 ? reason.slice(0, 80) + '…' : reason;
    reasonCounts[normalized] = (reasonCounts[normalized] ?? 0) + 1;
  }
  const topFailureReasons = Object.entries(reasonCounts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Average metric delta (from successful iterations only)
  const averageMetricDelta = computeAverageMetricDelta(successes);

  // Duration stats
  const totalDurationMs = records.reduce((sum, r) => sum + (r.durationMs ?? 0), 0);
  const averageDurationMs = total > 0 ? totalDurationMs / total : 0;

  // Recent window
  const recentRecords = records.slice(-recentWindowSize);
  const recentSuccesses = recentRecords.filter((r) => r.success);
  const recentDecisionDist: Record<string, number> = {};
  for (const r of recentRecords) {
    const key = r.decision ?? 'UNKNOWN';
    recentDecisionDist[key] = (recentDecisionDist[key] ?? 0) + 1;
  }

  return {
    totalIterations: total,
    successCount: successes.length,
    failureCount: failures.length,
    successRate: total > 0 ? successes.length / total : 0,
    decisionDistribution,
    failureStages,
    topFailureReasons,
    averageMetricDelta,
    averageDurationMs,
    totalDurationMs,
    recentWindow: {
      size: recentRecords.length,
      successRate: recentRecords.length > 0 ? recentSuccesses.length / recentRecords.length : 0,
      decisionDistribution: recentDecisionDist,
      averageMetricDelta: computeAverageMetricDelta(recentSuccesses),
    },
  };
}

function computeAverageMetricDelta(records: EvolutionRecord[]): MetricDelta {
  const deltas = records.filter((r) => r.metricDelta).map((r) => r.metricDelta!);
  if (deltas.length === 0) return {};

  const avg = (values: (number | undefined)[]) => {
    const nums = values.filter((v): v is number => v !== undefined);
    return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : undefined;
  };

  return {
    branches: avg(deltas.map((d) => d.branches)),
    functions: avg(deltas.map((d) => d.functions)),
    lines: avg(deltas.map((d) => d.lines)),
    statements: avg(deltas.map((d) => d.statements)),
    lintWarnings: avg(deltas.map((d) => d.lintWarnings)),
  };
}

/**
 * Format an {@link EvolutionReport} as a factual prompt section.
 * Contains only data — no conclusions or directives.
 */
export function formatHistorySummary(report: EvolutionReport): string {
  const lines: string[] = [];

  lines.push('## Evolution History (factual summary)');
  lines.push('');
  lines.push(
    `Total: ${report.totalIterations} iterations, ${report.successCount} success, ${report.failureCount} failed (${(report.successRate * 100).toFixed(0)}% success rate)`
  );

  // Decision distribution
  const decisions = Object.entries(report.decisionDistribution).sort(
    ([, a], [, b]) => b.count - a.count
  );
  if (decisions.length > 0) {
    lines.push('');
    lines.push('Decision breakdown (all time):');
    for (const [decision, stats] of decisions) {
      const rate = stats.count > 0 ? ((stats.successes / stats.count) * 100).toFixed(0) : '-';
      lines.push(
        `  ${decision}: ${stats.count} total, ${stats.successes} accepted, ${stats.failures} reverted (${rate}% success)`
      );
    }
  }

  // Top failure reasons (helps AI avoid repeating past mistakes)
  if (report.topFailureReasons.length > 0) {
    lines.push('');
    lines.push('Top failure reasons:');
    for (const entry of report.topFailureReasons.slice(0, 5)) {
      lines.push(`  - ${entry.reason} (${entry.count}×)`);
    }
  }

  // Recent window
  const w = report.recentWindow;
  if (w.size > 0) {
    lines.push('');
    lines.push(`Recent ${w.size} iterations: ${(w.successRate * 100).toFixed(0)}% success rate`);
    const recentDecisions = Object.entries(w.decisionDistribution).sort(([, a], [, b]) => b - a);
    if (recentDecisions.length > 0) {
      lines.push(`  Decisions: ${recentDecisions.map(([k, v]) => `${k}=${v}`).join(', ')}`);
    }
    const rd = w.averageMetricDelta;
    const deltaParts: string[] = [];
    if (rd.branches !== undefined)
      deltaParts.push(`branches ${rd.branches >= 0 ? '+' : ''}${rd.branches.toFixed(2)}%`);
    if (rd.lintWarnings !== undefined)
      deltaParts.push(
        `lint ${rd.lintWarnings >= 0 ? '+' : ''}${rd.lintWarnings.toFixed(1)} warnings`
      );
    if (deltaParts.length > 0) {
      lines.push(`  Avg impact per success: ${deltaParts.join(', ')}`);
    }
  }

  return lines.join('\n');
}

/**
 * Read evolution history from a JSONL file and build a report.
 * Returns null if the file does not exist or is empty.
 */
export async function readEvolutionReport(
  logPath: string,
  recentWindowSize: number = DEFAULT_RECENT_WINDOW
): Promise<EvolutionReport | null> {
  if (!(await fs.pathExists(logPath))) return null;

  const content = await fs.readFile(logPath, 'utf-8');
  const records = parseEvolutionLog(content);
  if (records.length === 0) return null;

  return buildReport(records, recentWindowSize);
}
