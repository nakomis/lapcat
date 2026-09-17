import { afterEach, describe, expect, it } from 'vitest';
import { authHeaders, getIdToken, setIdToken } from './auth-token';

afterEach(() => {
  setIdToken(undefined);
});

describe('ID token holder', () => {
  it('starts undefined', () => {
    expect(getIdToken()).toBeUndefined();
  });

  it('stores and returns a token', () => {
    setIdToken('abc123');
    expect(getIdToken()).toBe('abc123');
  });

  it('clears the token when set to undefined', () => {
    setIdToken('abc123');
    setIdToken(undefined);
    expect(getIdToken()).toBeUndefined();
  });
});

describe('authHeaders', () => {
  it('returns a Bearer header when a token is set', () => {
    setIdToken('abc123');
    expect(authHeaders()).toEqual({ authorization: 'Bearer abc123' });
  });

  it('returns an empty object when there is no token', () => {
    expect(authHeaders()).toEqual({});
  });
});
