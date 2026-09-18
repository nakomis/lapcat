import { authHeaders } from '@/api/auth-token';
import Config from '@/config/config';

export interface PoolLength {
  value: number;
  unit: 'm' | 'yd';
}

/** A row from GET /swims — the DynamoDB index row for one confirmed swim. */
export interface SwimSummary {
  swimId: string;
  startDate: string;
  endDate: string;
  poolLength: PoolLength;
  lapCount: number;
  distanceMetres: number;
  activeDurationSeconds: number;
  elapsedDurationSeconds: number;
  s3Key: string;
  uploadedAt: string;
}

export interface Lap {
  index: number;
  startDate: string;
  endDate: string;
  durationSeconds: number;
  strokeStyle?: string;
  strokeCount?: number;
  distanceMetres?: number;
}

export interface Pause {
  startDate: string;
  endDate: string;
}

export interface HeartRateSample {
  date: string;
  bpm: number;
}

export interface DepthSample {
  date: string;
  metres: number;
}

export interface TemperatureSample {
  date: string;
  celsius: number;
}

export interface Submersion {
  depth: DepthSample[];
  waterTemperature: TemperatureSample[];
}

/** The full swim JSON blob (schemaVersion 1), fetched from the presigned S3 URL. */
export interface SwimBlob {
  schemaVersion: number;
  swimId: string;
  startDate: string;
  endDate: string;
  poolLength: PoolLength;
  totals: {
    lapCount: number;
    distanceMetres?: number;
    activeDurationSeconds?: number;
    elapsedDurationSeconds?: number;
    strokeCount?: number;
    activeEnergyKcal?: number;
  };
  laps: Lap[];
  segments: { index: number; startDate: string; endDate: string; strokeStyle: string }[];
  pauses: Pause[];
  heartRate: HeartRateSample[];
  submersion?: Submersion;
  device?: { model: string; osVersion: string; appVersion: string };
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${Config.api.apiUrl}${path}`, {
    headers: { ...authHeaders() },
  });
  if (!res.ok) {
    throw new ApiError(`${path} returned ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}

/** GET /swims — the caller's swims, newest startDate first. */
export async function listSwims(): Promise<SwimSummary[]> {
  const { swims } = await apiFetch<{ swims: SwimSummary[] }>('/swims');
  return swims;
}

/** GET /swims/{swimId} — the summary plus a presigned download URL for the full blob. */
export async function getSwim(swimId: string): Promise<{ swim: SwimSummary; downloadUrl: string }> {
  return apiFetch<{ swim: SwimSummary; downloadUrl: string }>(
    `/swims/${encodeURIComponent(swimId)}`,
  );
}

/** Fetches the full swim JSON blob from its presigned S3 URL (no auth header — the URL is already signed). */
export async function fetchSwimBlob(downloadUrl: string): Promise<SwimBlob> {
  const res = await fetch(downloadUrl);
  if (!res.ok) {
    throw new ApiError(`downloadUrl returned ${res.status}`, res.status);
  }
  return (await res.json()) as SwimBlob;
}
