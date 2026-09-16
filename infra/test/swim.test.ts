import { isValidUuid, swimKey, validateSwimBlob, toSummary, SwimBlob } from '../lambda/shared/swim';

describe('isValidUuid', () => {
  it('accepts a well-formed UUID', () => {
    expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('accepts an upper-case UUID', () => {
    expect(isValidUuid('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
  });

  it('rejects undefined', () => {
    expect(isValidUuid(undefined)).toBe(false);
  });

  it('rejects a non-UUID string', () => {
    expect(isValidUuid('not-a-uuid')).toBe(false);
    expect(isValidUuid('')).toBe(false);
    expect(isValidUuid('550e8400-e29b-41d4-a716')).toBe(false);
  });
});

describe('swimKey', () => {
  it('builds the users/{userId}/swims/{swimId}.json convention', () => {
    expect(swimKey('user-42', 'swim-1')).toBe('users/user-42/swims/swim-1.json');
  });
});

const validBlob: SwimBlob = {
  schemaVersion: 1,
  swimId: '550e8400-e29b-41d4-a716-446655440000',
  startDate: '2026-09-16T10:00:00.000Z',
  endDate: '2026-09-16T10:30:00.000Z',
  poolLength: { value: 25, unit: 'm' },
  totals: { lapCount: 40, distanceMetres: 1000, activeDurationSeconds: 1500, elapsedDurationSeconds: 1800 },
};
const SWIM_ID = validBlob.swimId;

describe('validateSwimBlob', () => {
  it('accepts a valid blob', () => {
    expect(validateSwimBlob(validBlob, SWIM_ID)).toEqual({ valid: true });
  });

  it('rejects a non-object body', () => {
    expect(validateSwimBlob('nope', SWIM_ID).valid).toBe(false);
    expect(validateSwimBlob(null, SWIM_ID).valid).toBe(false);
  });

  it('rejects a wrong schemaVersion', () => {
    const result = validateSwimBlob({ ...validBlob, schemaVersion: 2 }, SWIM_ID);
    expect(result).toEqual({ valid: false, detail: 'schemaVersion must be 1' });
  });

  it('rejects a swimId mismatch', () => {
    const result = validateSwimBlob(validBlob, 'a-different-id');
    expect(result).toEqual({ valid: false, detail: 'swimId does not match path' });
  });

  it('rejects a non-ISO startDate', () => {
    const result = validateSwimBlob({ ...validBlob, startDate: 'not-a-date' }, SWIM_ID);
    expect(result).toEqual({ valid: false, detail: 'startDate must be an ISO date string' });
  });

  it('rejects a non-ISO endDate', () => {
    const result = validateSwimBlob({ ...validBlob, endDate: 'not-a-date' }, SWIM_ID);
    expect(result).toEqual({ valid: false, detail: 'endDate must be an ISO date string' });
  });

  it('rejects a missing poolLength.value', () => {
    const result = validateSwimBlob({ ...validBlob, poolLength: { unit: 'm' } }, SWIM_ID);
    expect(result).toEqual({ valid: false, detail: 'poolLength.value must be a number' });
  });

  it('rejects an invalid poolLength.unit', () => {
    const result = validateSwimBlob({ ...validBlob, poolLength: { value: 25, unit: 'ft' } }, SWIM_ID);
    expect(result).toEqual({ valid: false, detail: 'poolLength.unit must be "m" or "yd"' });
  });

  it('accepts a yard pool', () => {
    const result = validateSwimBlob({ ...validBlob, poolLength: { value: 25, unit: 'yd' } }, SWIM_ID);
    expect(result).toEqual({ valid: true });
  });

  it('rejects a non-integer lapCount', () => {
    const result = validateSwimBlob({ ...validBlob, totals: { ...validBlob.totals, lapCount: 1.5 } }, SWIM_ID);
    expect(result).toEqual({ valid: false, detail: 'totals.lapCount must be an integer >= 0' });
  });

  it('rejects a negative lapCount', () => {
    const result = validateSwimBlob({ ...validBlob, totals: { ...validBlob.totals, lapCount: -1 } }, SWIM_ID);
    expect(result).toEqual({ valid: false, detail: 'totals.lapCount must be an integer >= 0' });
  });

  it('accepts a zero lapCount', () => {
    const result = validateSwimBlob({ ...validBlob, totals: { lapCount: 0 } }, SWIM_ID);
    expect(result).toEqual({ valid: true });
  });
});

describe('toSummary', () => {
  it('extracts the summary fields and defaults missing totals to 0', () => {
    const blob: SwimBlob = { ...validBlob, totals: { lapCount: 40 } };
    const summary = toSummary(blob, 'users/u1/swims/s1.json', '2026-09-16T10:31:00.000Z');
    expect(summary).toEqual({
      swimId: SWIM_ID,
      startDate: validBlob.startDate,
      endDate: validBlob.endDate,
      poolLength: { value: 25, unit: 'm' },
      lapCount: 40,
      distanceMetres: 0,
      activeDurationSeconds: 0,
      elapsedDurationSeconds: 0,
      s3Key: 'users/u1/swims/s1.json',
      uploadedAt: '2026-09-16T10:31:00.000Z',
    });
  });

  it('carries through totals present in the blob', () => {
    const summary = toSummary(validBlob, 'users/u1/swims/s1.json', '2026-09-16T10:31:00.000Z');
    expect(summary.distanceMetres).toBe(1000);
    expect(summary.activeDurationSeconds).toBe(1500);
    expect(summary.elapsedDurationSeconds).toBe(1800);
  });
});
