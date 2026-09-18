import type { SwimBlob, SwimSummary } from '@/api/swims';

/** A handful of summaries shaped like infra/scripts/seed-sandbox-swims.py output. */
export function swimSummaries(): SwimSummary[] {
  return [
    {
      swimId: 'swim-3',
      startDate: '2026-09-17T07:00:00.000Z',
      endDate: '2026-09-17T07:30:00.000Z',
      poolLength: { value: 25, unit: 'm' },
      lapCount: 20,
      distanceMetres: 500,
      activeDurationSeconds: 900,
      elapsedDurationSeconds: 1800,
      s3Key: 'users/sub/swims/swim-3.json',
      uploadedAt: '2026-09-17T07:31:00.000Z',
    },
    {
      swimId: 'swim-2',
      startDate: '2026-09-10T07:00:00.000Z',
      endDate: '2026-09-10T07:30:00.000Z',
      poolLength: { value: 50, unit: 'm' },
      lapCount: 10,
      distanceMetres: 500,
      activeDurationSeconds: 950,
      elapsedDurationSeconds: 1800,
      s3Key: 'users/sub/swims/swim-2.json',
      uploadedAt: '2026-09-10T07:31:00.000Z',
    },
    {
      swimId: 'swim-1',
      startDate: '2026-06-01T07:00:00.000Z',
      endDate: '2026-06-01T07:30:00.000Z',
      poolLength: { value: 25, unit: 'yd' },
      lapCount: 16,
      distanceMetres: 365.76,
      activeDurationSeconds: 800,
      elapsedDurationSeconds: 1800,
      s3Key: 'users/sub/swims/swim-1.json',
      uploadedAt: '2026-06-01T07:31:00.000Z',
    },
  ];
}

/** A full blob for the detail route, with heart rate, a rest, and submersion data. */
export function swimBlob(): SwimBlob {
  return {
    schemaVersion: 1,
    swimId: 'swim-3',
    startDate: '2026-09-17T07:00:00.000Z',
    endDate: '2026-09-17T07:30:00.000Z',
    poolLength: { value: 25, unit: 'm' },
    totals: {
      lapCount: 2,
      distanceMetres: 50,
      activeDurationSeconds: 80,
      elapsedDurationSeconds: 200,
      strokeCount: 45,
      activeEnergyKcal: 60.5,
    },
    laps: [
      {
        index: 0,
        startDate: '2026-09-17T07:00:05.000Z',
        endDate: '2026-09-17T07:00:43.000Z',
        durationSeconds: 38,
        strokeStyle: 'freestyle',
        strokeCount: 22,
        distanceMetres: 25,
      },
      {
        index: 1,
        startDate: '2026-09-17T07:00:43.000Z',
        endDate: '2026-09-17T07:01:25.000Z',
        durationSeconds: 42,
        strokeStyle: 'breaststroke',
        strokeCount: 23,
        distanceMetres: 25,
      },
    ],
    segments: [
      {
        index: 0,
        startDate: '2026-09-17T07:00:05.000Z',
        endDate: '2026-09-17T07:01:25.000Z',
        strokeStyle: 'mixed',
      },
    ],
    pauses: [{ startDate: '2026-09-17T07:10:00.000Z', endDate: '2026-09-17T07:11:30.000Z' }],
    heartRate: [
      { date: '2026-09-17T07:00:10.000Z', bpm: 120 },
      { date: '2026-09-17T07:00:15.000Z', bpm: 128 },
    ],
    submersion: {
      depth: [{ date: '2026-09-17T07:00:10.000Z', metres: 1.1 }],
      waterTemperature: [{ date: '2026-09-17T07:00:10.000Z', celsius: 28.4 }],
    },
    device: { model: 'Watch8,1', osVersion: '27.0', appVersion: '0.1.2 (17)' },
  };
}
