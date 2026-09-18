import { describe, expect, it } from 'vitest';
import {
  formatCompactNumber,
  formatDate,
  formatDateTime,
  formatDistanceMetres,
  formatDuration,
  formatPace,
  formatPoolLength,
} from './format';

describe('formatDuration', () => {
  it('formats seconds as m:ss', () => {
    expect(formatDuration(38)).toBe('0:38');
    expect(formatDuration(90)).toBe('1:30');
  });

  it('formats past an hour as h:mm:ss', () => {
    expect(formatDuration(3725)).toBe('1:02:05');
  });

  it('rounds to the nearest second and floors negatives at zero', () => {
    expect(formatDuration(38.6)).toBe('0:39');
    expect(formatDuration(-5)).toBe('0:00');
  });
});

describe('formatPace', () => {
  it('formats a pace in seconds as m:ss', () => {
    expect(formatPace(95)).toBe('1:35');
  });

  it('returns an em dash for undefined or non-finite pace', () => {
    expect(formatPace(undefined)).toBe('—');
    expect(formatPace(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('formatPoolLength', () => {
  it('shows the pool in its own native unit', () => {
    expect(formatPoolLength({ value: 25, unit: 'm' })).toBe('25 m');
    expect(formatPoolLength({ value: 25, unit: 'yd' })).toBe('25 yd');
  });
});

describe('formatDate / formatDateTime', () => {
  it('formats an ISO date in en-GB, Europe/London', () => {
    expect(formatDate('2026-09-18T08:30:00.000Z')).toMatch(/^18 Sept?\.? 2026$/);
  });

  it('formats date and time together', () => {
    expect(formatDateTime('2026-09-18T08:30:00.000Z')).toMatch(/^18 Sept?\.? 2026, \d{2}:\d{2}$/);
  });
});

describe('formatCompactNumber', () => {
  it('formats small numbers plainly', () => {
    expect(formatCompactNumber(42)).toBe('42');
  });

  it('compacts large numbers', () => {
    expect(formatCompactNumber(12900)).toMatch(/^12\.9K$/i);
  });
});

describe('formatDistanceMetres', () => {
  it('shows metres under a kilometre', () => {
    expect(formatDistanceMetres(750)).toBe('750 m');
  });

  it('shows kilometres from 1000 m up', () => {
    expect(formatDistanceMetres(1250)).toBe('1.25 km');
  });
});
