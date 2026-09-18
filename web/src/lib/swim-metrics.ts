import type { Lap, Pause, SwimSummary } from '@/api/swims';

/** A yard is exactly this many metres. */
export const YARD_TO_METRE = 0.9144;

/** A pool's length converted to metres, whatever unit it's recorded in. */
export function poolLengthMetres(pool: { value: number; unit: 'm' | 'yd' }): number {
  return pool.unit === 'yd' ? pool.value * YARD_TO_METRE : pool.value;
}

/**
 * Pace in seconds per 100 m. `distanceMetres` on a swim summary is always
 * already in real metres (the backend/app compute it from the pool's native
 * unit), so no further yards conversion is needed here — this just guards
 * against a zero/undefined distance.
 */
export function paceSecondsPer100m(
  activeDurationSeconds: number,
  distanceMetres: number,
): number | undefined {
  if (!distanceMetres || distanceMetres <= 0 || !Number.isFinite(activeDurationSeconds)) {
    return undefined;
  }
  return (activeDurationSeconds / distanceMetres) * 100;
}

/** SWOLF for one lap: seconds + strokes. Undefined unless both are present. */
export function swolf(
  durationSeconds: number | undefined,
  strokeCount: number | undefined,
): number | undefined {
  if (durationSeconds === undefined || strokeCount === undefined) {
    return undefined;
  }
  return Math.round(durationSeconds + strokeCount);
}

export interface Last30DaysStats {
  swimCount: number;
  distanceMetres: number;
  activeDurationSeconds: number;
  averagePaceSecondsPer100m: number | undefined;
}

/** Rolls up swims from the last 30 days (inclusive) relative to `now`. */
export function last30DaysStats(swims: SwimSummary[], now: Date = new Date()): Last30DaysStats {
  const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const recent = swims.filter((s) => new Date(s.startDate).getTime() >= cutoff);

  const distanceMetres = recent.reduce((sum, s) => sum + s.distanceMetres, 0);
  const activeDurationSeconds = recent.reduce((sum, s) => sum + s.activeDurationSeconds, 0);

  return {
    swimCount: recent.length,
    distanceMetres,
    activeDurationSeconds,
    averagePaceSecondsPer100m: paceSecondsPer100m(activeDurationSeconds, distanceMetres),
  };
}

export interface WeeklyDistance {
  /** ISO date (Monday) of the start of the week, Europe/London-agnostic (calendar week from `now`). */
  weekStart: string;
  distanceMetres: number;
}

/**
 * Buckets swims into `weeks` trailing 7-day windows ending "today" (in `now`),
 * oldest first — a simple rolling week, not a Monday-aligned calendar week.
 */
export function weeklyDistanceBuckets(
  swims: SwimSummary[],
  weeks: number,
  now: Date = new Date(),
): WeeklyDistance[] {
  const dayMs = 24 * 60 * 60 * 1000;
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const buckets: WeeklyDistance[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const bucketEnd = endOfToday.getTime() - w * 7 * dayMs;
    const bucketStart = bucketEnd - 7 * dayMs;
    const distanceMetres = swims
      .filter((s) => {
        const t = new Date(s.startDate).getTime();
        return t > bucketStart && t <= bucketEnd;
      })
      .reduce((sum, s) => sum + s.distanceMetres, 0);
    buckets.push({ weekStart: new Date(bucketStart).toISOString(), distanceMetres });
  }
  return buckets;
}

export interface Rest {
  startDate: string;
  endDate: string;
  durationSeconds: number;
}

/** Rests between sets, derived from a swim's `pauses`. */
export function restsFromPauses(pauses: Pause[]): Rest[] {
  return pauses.map((p) => ({
    startDate: p.startDate,
    endDate: p.endDate,
    durationSeconds: (new Date(p.endDate).getTime() - new Date(p.startDate).getTime()) / 1000,
  }));
}

export interface LapWithSwolf extends Lap {
  swolf: number | undefined;
}

/** Laps annotated with SWOLF, for the per-lap table and splits chart. */
export function lapsWithSwolf(laps: Lap[]): LapWithSwolf[] {
  return laps.map((lap) => ({ ...lap, swolf: swolf(lap.durationSeconds, lap.strokeCount) }));
}
