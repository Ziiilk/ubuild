/**
 * Tests for evolution-reporter.
 */

import {
  parseEvolutionLog,
  buildReport,
  formatHistorySummary,
  readEvolutionReport,
} from './evolution-reporter';
import type { EvolutionRecord } from '../types/evolve';
import { withTempDir } from '../test-utils';

// ---------------------------------------------------------------------------
// parseEvolutionLog
// ---------------------------------------------------------------------------

describe('parseEvolutionLog', () => {
  it('parses valid JSONL lines', () => {
    const content = [
      JSON.stringify({
        iteration: 1,
        timestamp: '2025-01-01T00:00:00Z',
        success: true,
        durationMs: 1000,
      }),
      JSON.stringify({
        iteration: 2,
        timestamp: '2025-01-01T00:01:00Z',
        success: false,
        durationMs: 2000,
      }),
    ].join('\n');

    const records = parseEvolutionLog(content);
    expect(records).toHaveLength(2);
    expect(records[0].iteration).toBe(1);
    expect(records[1].success).toBe(false);
  });

  it('skips blank lines and malformed JSON', () => {
    const content = [
      '',
      'not json',
      JSON.stringify({ iteration: 1, timestamp: 'ts', success: true, durationMs: 100 }),
      '   ',
    ].join('\n');

    const records = parseEvolutionLog(content);
    expect(records).toHaveLength(1);
  });

  it('returns empty array for empty input', () => {
    expect(parseEvolutionLog('')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildReport
// ---------------------------------------------------------------------------

function makeRecord(overrides: Partial<EvolutionRecord> = {}): EvolutionRecord {
  return {
    iteration: 1,
    timestamp: '2025-01-01T00:00:00Z',
    success: true,
    durationMs: 5000,
    ...overrides,
  };
}

describe('buildReport', () => {
  it('computes correct totals for mixed results', () => {
    const records: EvolutionRecord[] = [
      makeRecord({ iteration: 1, success: true, decision: 'FIX', durationMs: 3000 }),
      makeRecord({
        iteration: 2,
        success: false,
        decision: 'TEST',
        failureStage: 'verification',
        durationMs: 2000,
      }),
      makeRecord({ iteration: 3, success: true, decision: 'TEST', durationMs: 4000 }),
      makeRecord({
        iteration: 4,
        success: false,
        decision: 'FIX',
        failureStage: 'commit',
        failureDetail: 'size exceeded',
        durationMs: 1000,
      }),
    ];

    const report = buildReport(records);

    expect(report.totalIterations).toBe(4);
    expect(report.successCount).toBe(2);
    expect(report.failureCount).toBe(2);
    expect(report.successRate).toBe(0.5);
    expect(report.decisionDistribution['FIX'].count).toBe(2);
    expect(report.decisionDistribution['FIX'].successes).toBe(1);
    expect(report.decisionDistribution['TEST'].count).toBe(2);
    expect(report.failureStages['verification']).toBe(1);
    expect(report.failureStages['commit']).toBe(1);
    expect(report.topFailureReasons).toHaveLength(2);
    expect(report.totalDurationMs).toBe(10000);
    expect(report.averageDurationMs).toBe(2500);
  });

  it('handles empty input', () => {
    const report = buildReport([]);

    expect(report.totalIterations).toBe(0);
    expect(report.successRate).toBe(0);
    expect(report.averageDurationMs).toBe(0);
    expect(report.recentWindow.size).toBe(0);
  });

  it('computes average metric deltas from successful iterations only', () => {
    const records: EvolutionRecord[] = [
      makeRecord({
        iteration: 1,
        success: true,
        metricDelta: { branches: 2, functions: 1, lines: 0.5, statements: 0.5, lintWarnings: -1 },
      }),
      makeRecord({
        iteration: 2,
        success: false,
        metricDelta: {
          branches: -10,
          functions: -10,
          lines: -10,
          statements: -10,
          lintWarnings: 5,
        },
      }),
      makeRecord({
        iteration: 3,
        success: true,
        metricDelta: { branches: 4, functions: 3, lines: 1.5, statements: 1.5, lintWarnings: -3 },
      }),
    ];

    const report = buildReport(records);

    expect(report.averageMetricDelta.branches).toBe(3);
    expect(report.averageMetricDelta.functions).toBe(2);
    expect(report.averageMetricDelta.lintWarnings).toBe(-2);
  });

  it('computes recent window separately from full history', () => {
    const records: EvolutionRecord[] = [];
    for (let i = 1; i <= 20; i++) {
      records.push(
        makeRecord({
          iteration: i,
          success: i <= 5 ? false : true,
          decision: i <= 5 ? 'TEST' : 'FIX',
          durationMs: 1000,
        })
      );
    }

    const report = buildReport(records, 10);

    // Full history: 15 success / 20 total
    expect(report.successRate).toBe(0.75);
    // Recent 10 (iterations 11-20): all success
    expect(report.recentWindow.size).toBe(10);
    expect(report.recentWindow.successRate).toBe(1.0);
    expect(report.recentWindow.decisionDistribution['FIX']).toBe(10);
  });

  it('groups unknown decisions when decision field is missing', () => {
    const records: EvolutionRecord[] = [
      makeRecord({ iteration: 1, decision: undefined }),
      makeRecord({ iteration: 2, decision: undefined }),
    ];

    const report = buildReport(records);
    expect(report.decisionDistribution['UNKNOWN'].count).toBe(2);
  });

  it('truncates long failure reasons', () => {
    const longReason = 'A'.repeat(120);
    const records: EvolutionRecord[] = [
      makeRecord({
        iteration: 1,
        success: false,
        failureStage: 'execution',
        failureDetail: longReason,
      }),
    ];

    const report = buildReport(records);
    expect(report.topFailureReasons[0].reason.length).toBeLessThanOrEqual(81); // 80 chars + ellipsis
  });
});

// ---------------------------------------------------------------------------
// formatReport
// ---------------------------------------------------------------------------

describe('formatHistorySummary', () => {
  it('produces factual summary with key sections', () => {
    const records: EvolutionRecord[] = [
      makeRecord({ iteration: 1, success: true, decision: 'FIX', durationMs: 60000 }),
      makeRecord({
        iteration: 2,
        success: false,
        decision: 'TEST',
        failureStage: 'verification',
        failureDetail: 'Tests failed',
        durationMs: 30000,
      }),
    ];
    const report = buildReport(records);
    const output = formatHistorySummary(report);

    expect(output).toContain('Evolution History');
    expect(output).toContain('2 iterations');
    expect(output).toContain('1 success');
    expect(output).toContain('FIX');
    expect(output).toContain('TEST');
    expect(output).toContain('50% success rate');
  });

  it('does not contain directive language', () => {
    const records: EvolutionRecord[] = [
      makeRecord({ iteration: 1, success: true, decision: 'TEST' }),
      makeRecord({ iteration: 2, success: false, decision: 'TEST', failureStage: 'commit' }),
    ];
    const report = buildReport(records);
    const output = formatHistorySummary(report);

    // Should not contain directives or conclusions
    expect(output).not.toMatch(/should|must|prefer|reduce|increase|avoid/i);
  });

  it('includes recent window data', () => {
    const records: EvolutionRecord[] = [];
    for (let i = 1; i <= 15; i++) {
      records.push(makeRecord({ iteration: i, success: true, decision: 'FIX', durationMs: 1000 }));
    }
    const report = buildReport(records);
    const output = formatHistorySummary(report);

    expect(output).toContain('Recent 10 iterations');
  });

  it('handles report with metric deltas', () => {
    const records: EvolutionRecord[] = [
      makeRecord({
        iteration: 1,
        success: true,
        decision: 'TEST',
        metricDelta: { branches: 2.5, lintWarnings: -1 },
      }),
    ];
    const report = buildReport(records);
    const output = formatHistorySummary(report);

    expect(output).toContain('branches');
    expect(output).toContain('lint');
  });

  it('omits decision breakdown when report has no records', () => {
    const report = buildReport([]);
    const output = formatHistorySummary(report);

    expect(output).not.toContain('Decision breakdown');
  });

  it('formats negative metric deltas with sign prefix in recent window', () => {
    const records: EvolutionRecord[] = [];
    for (let i = 1; i <= 12; i++) {
      records.push(
        makeRecord({
          iteration: i,
          success: true,
          decision: 'FIX',
          durationMs: 1000,
          metricDelta:
            i > 2 ? { branches: -1.5, lintWarnings: 2.0 } : { branches: 0.5, lintWarnings: -0.5 },
        })
      );
    }
    const report = buildReport(records);
    const output = formatHistorySummary(report);

    expect(output).toContain('-1.50%');
    expect(output).toContain('+2.0 warnings');
  });

  it('omits avg impact line when recent window has no metric deltas', () => {
    const records: EvolutionRecord[] = [];
    for (let i = 1; i <= 12; i++) {
      records.push(makeRecord({ iteration: i, success: true, decision: 'FIX', durationMs: 1000 }));
    }
    const report = buildReport(records);
    const output = formatHistorySummary(report);

    expect(output).not.toContain('Avg impact per success');
  });
});

// ---------------------------------------------------------------------------
// readEvolutionReport
// ---------------------------------------------------------------------------

describe('readEvolutionReport', () => {
  it('returns null when file does not exist', async () => {
    await withTempDir(async (dir) => {
      const result = await readEvolutionReport(`${dir}/nonexistent.jsonl`);
      expect(result).toBeNull();
    });
  });

  it('returns null when file exists but contains no valid records', async () => {
    await withTempDir(async (dir) => {
      const { ensureFile, writeFile } = await import('fs-extra');
      const logPath = `${dir}/empty.jsonl`;
      await ensureFile(logPath);
      await writeFile(logPath, '\n\n  \n', 'utf-8');

      const result = await readEvolutionReport(logPath);
      expect(result).toBeNull();
    });
  });

  it('returns report when file has valid records', async () => {
    await withTempDir(async (dir) => {
      const { writeFile } = await import('fs-extra');
      const logPath = `${dir}/history.jsonl`;
      const content = [
        JSON.stringify(
          makeRecord({ iteration: 1, success: true, decision: 'FIX', durationMs: 1000 })
        ),
        JSON.stringify(
          makeRecord({
            iteration: 2,
            success: false,
            decision: 'TEST',
            failureStage: 'verification',
            durationMs: 2000,
          })
        ),
      ].join('\n');
      await writeFile(logPath, content, 'utf-8');

      const result = await readEvolutionReport(logPath);
      expect(result).not.toBeNull();
      expect(result!.totalIterations).toBe(2);
      expect(result!.successCount).toBe(1);
    });
  });
});
