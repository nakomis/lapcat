// Shared types + validation for the swim blob (schemaVersion 1) and the DynamoDB
// index row derived from it. Kept dependency-free so every handler can import it.

// A generic UUID (any RFC 4122 version/variant) — the iOS app mints these with
// Foundation's `UUID()`, which is v4, but we deliberately don't pin the version
// digit here in case that ever changes.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string | undefined): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** The S3 key a swim's raw JSON blob is stored under. */
export function swimKey(userId: string, swimId: string): string {
  return `users/${userId}/swims/${swimId}.json`;
}

export interface PoolLength {
  value: number;
  unit: 'm' | 'yd';
}

export interface SwimTotals {
  lapCount: number;
  distanceMetres?: number;
  activeDurationSeconds?: number;
  elapsedDurationSeconds?: number;
  [key: string]: unknown;
}

/** The swim blob as uploaded by the app (schemaVersion 1). Only the fields the
 * backend validates/reads are typed here — the rest (laps, segments, pauses,
 * heartRate, submersion, device, …) is stored as-is and never inspected. */
export interface SwimBlob {
  schemaVersion: number;
  swimId: string;
  startDate: string;
  endDate: string;
  poolLength: PoolLength;
  totals: SwimTotals;
  [key: string]: unknown;
}

/** The DynamoDB index row, minus the userId partition key. */
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

/** Result of validating an uploaded swim blob against the path's swimId. */
export type ValidationResult =
  | { valid: true }
  | { valid: false; detail: string };

function isIsoDateString(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export function validateSwimBlob(blob: unknown, expectedSwimId: string): ValidationResult {
  if (typeof blob !== 'object' || blob === null) {
    return { valid: false, detail: 'body is not a JSON object' };
  }
  const b = blob as Record<string, unknown>;

  if (b.schemaVersion !== 1) {
    return { valid: false, detail: 'schemaVersion must be 1' };
  }
  if (b.swimId !== expectedSwimId) {
    return { valid: false, detail: 'swimId does not match path' };
  }
  if (!isIsoDateString(b.startDate)) {
    return { valid: false, detail: 'startDate must be an ISO date string' };
  }
  if (!isIsoDateString(b.endDate)) {
    return { valid: false, detail: 'endDate must be an ISO date string' };
  }

  const poolLength = b.poolLength as PoolLength | undefined;
  if (typeof poolLength !== 'object' || poolLength === null || typeof poolLength.value !== 'number') {
    return { valid: false, detail: 'poolLength.value must be a number' };
  }
  if (poolLength.unit !== 'm' && poolLength.unit !== 'yd') {
    return { valid: false, detail: 'poolLength.unit must be "m" or "yd"' };
  }

  const totals = b.totals as SwimTotals | undefined;
  if (typeof totals !== 'object' || totals === null
    || !Number.isInteger(totals.lapCount) || totals.lapCount < 0) {
    return { valid: false, detail: 'totals.lapCount must be an integer >= 0' };
  }

  return { valid: true };
}

/** Builds the DynamoDB index row from a validated blob. */
export function toSummary(blob: SwimBlob, s3Key: string, uploadedAt: string): SwimSummary {
  return {
    swimId: blob.swimId,
    startDate: blob.startDate,
    endDate: blob.endDate,
    poolLength: blob.poolLength,
    lapCount: blob.totals.lapCount,
    distanceMetres: blob.totals.distanceMetres ?? 0,
    activeDurationSeconds: blob.totals.activeDurationSeconds ?? 0,
    elapsedDurationSeconds: blob.totals.elapsedDurationSeconds ?? 0,
    s3Key,
    uploadedAt,
  };
}
