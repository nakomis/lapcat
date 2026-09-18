import { describe, expect, it } from 'vitest';
import type { SwimSummary } from '@/api/swims';
import {
  lapsWithSwolf,
  last30DaysStats,
  paceSecondsPer100m,
  poolLengthMetres,
  restsFromPauses,
  swolf,
  weeklyDistanceBuckets,
  YARD_TO_METRE,
} from './swim-metrics';

function summary(overrides: Partial<SwimSummary>): SwimSummary {
  return {
    swimId: 'id',
    startDate: '2026-09-01T08:00:00.000Z',
    endDate: '2026-09-01T08:30:00.000Z',
    poolLength: { value: 25, unit: 'm' },
    lapCount: 10,
    distanceMetres: 250,
    activeDurationSeconds: 500,
    elapsedDurationSeconds: 1800,
    s3Key: 'key',
    uploadedAt: '2026-09-01T08:31:00.000Z',
    ...overrides,
  };
}

describe('poolLengthMetres', () => {
  it('passes metres through unchanged', () => {
    expect(poolLengthMetres({ value: 25, unit: 'm' })).toBe(25);
  });

  it('converts yards to metres', () => {
    expect(poolLengthMetres({ value: 25, unit: 'yd' })).toBeCloseTo(25 * YARD_TO_METRE);
  });
});

describe('paceSecondsPer100m', () => {
  it('computes seconds per 100 m', () => {
    expect(paceSecondsPer100m(500, 250)).toBe(200);
  });

  it('is undefined for zero or missing distance', () => {
    expect(paceSecondsPer100m(500, 0)).toBeUndefined();
    expect(paceSecondsPer100m(500, undefined as unknown as number)).toBeUndefined();
  });
});

describe('swolf', () => {
  it('sums duration and strokes', () => {
    expect(swolf(38.2, 22)).toBe(60);
  });

  it('is undefined when either input is missing', () => {
    expect(swolf(undefined, 22)).toBeUndefined();
    expect(swolf(38.2, undefined)).toBeUndefined();
  });
});

describe('last30DaysStats', () => {
  const now = new Date('2026-09-18T12:00:00.000Z');

  it('includes only swims within the last 30 days', () => {
    const swims = [
      summary({
        startDate: '2026-09-17T08:00:00.000Z',
        distanceMetres: 1000,
        activeDurationSeconds: 1000,
      }),
      summary({
        startDate: '2026-06-01T08:00:00.000Z',
        distanceMetres: 5000,
        activeDurationSeconds: 5000,
      }),
    ];
    const stats = last30DaysStats(swims, now);
    expect(stats.swimCount).toBe(1);
    expect(stats.distanceMetres).toBe(1000);
    expect(stats.averagePaceSecondsPer100m).toBe(100);
  });

  it('handles no recent swims', () => {
    const stats = last30DaysStats([], now);
    expect(stats.swimCount).toBe(0);
    expect(stats.averagePaceSecondsPer100m).toBeUndefined();
  });
});

describe('weeklyDistanceBuckets', () => {
  const now = new Date('2026-09-18T12:00:00.000Z');

  it('buckets swims into trailing weekly windows, oldest first', () => {
    const swims = [
      summary({ startDate: '2026-09-17T08:00:00.000Z', distanceMetres: 1000 }), // this week
      summary({ startDate: '2026-09-05T08:00:00.000Z', distanceMetres: 500 }), // ~2 weeks ago
    ];
    const buckets = weeklyDistanceBuckets(swims, 3, now);
    expect(buckets).toHaveLength(3);
    expect(buckets[2].distanceMetres).toBe(1000);
    expect(buckets.reduce((sum, b) => sum + b.distanceMetres, 0)).toBe(1500);
  });

  it('returns zeroed buckets when there are no swims', () => {
    const buckets = weeklyDistanceBuckets([], 4, now);
    expect(buckets.every((b) => b.distanceMetres === 0)).toBe(true);
  });
});

describe('restsFromPauses', () => {
  it('computes rest duration from start/end', () => {
    const rests = restsFromPauses([
      { startDate: '2026-09-01T08:00:00.000Z', endDate: '2026-09-01T08:01:30.000Z' },
    ]);
    expect(rests[0].durationSeconds).toBe(90);
  });
});

describe('lapsWithSwolf', () => {
  it('annotates each lap with SWOLF where possible', () => {
    const laps = lapsWithSwolf([
      { index: 0, startDate: '', endDate: '', durationSeconds: 38, strokeCount: 22 },
      { index: 1, startDate: '', endDate: '', durationSeconds: 40 },
    ]);
    expect(laps[0].swolf).toBe(60);
    expect(laps[1].swolf).toBeUndefined();
  });
});
