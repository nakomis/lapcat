import type { PoolLength } from '@/api/swims';

const LONDON_TZ = 'Europe/London';

/** `m:ss`, or `h:mm:ss` once it runs past an hour. Rounds to the nearest second. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  }
  return `${m}:${ss}`;
}

/** Pace as `m:ss` (per 100 m), or `—` when it can't be computed. */
export function formatPace(secondsPer100m: number | undefined): string {
  if (secondsPer100m === undefined || !Number.isFinite(secondsPer100m)) {
    return '—';
  }
  return formatDuration(secondsPer100m);
}

/** `25 m`, `50 m`, `25 yd` — the pool's own native unit, never converted. */
export function formatPoolLength(pool: PoolLength): string {
  return `${pool.value} ${pool.unit}`;
}

/** en-GB date, e.g. "18 Sep 2026", rendered in Europe/London. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: LONDON_TZ,
  });
}

/** en-GB date + time, e.g. "18 Sep 2026, 07:15", rendered in Europe/London. */
export function formatDateTime(iso: string): string {
  const datePart = formatDate(iso);
  const timePart = new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: LONDON_TZ,
  });
  return `${datePart}, ${timePart}`;
}

/** Compact number formatting for stat-tile values: 1,284 / 12.9K. */
export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

/** `HH:mm` in Europe/London, from an epoch ms number or an ISO string. */
export function formatTimeOfDay(value: number | string): string {
  return new Date(value).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: LONDON_TZ,
  });
}

/** Distance with a fixed unit suffix, e.g. "1,250 m" or "1.3 km" past 1000 m. */
export function formatDistanceMetres(metres: number): string {
  if (metres >= 1000) {
    return `${(metres / 1000).toLocaleString('en-GB', { maximumFractionDigits: 2 })} km`;
  }
  return `${Math.round(metres).toLocaleString('en-GB')} m`;
}
