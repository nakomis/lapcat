import { render } from '@testing-library/react';
import { useAuth } from 'react-oidc-context';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getIdToken, setIdToken } from '@/api/auth-token';
import AuthTokenSync from './AuthTokenSync';

vi.mock('react-oidc-context', () => ({ useAuth: vi.fn() }));
const mockUseAuth = vi.mocked(useAuth);

function authState(overrides: Record<string, unknown>) {
  return overrides as unknown as ReturnType<typeof useAuth>;
}

describe('AuthTokenSync', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => setIdToken(undefined));

  it('pushes the ID token (not the access token) into the holder', () => {
    mockUseAuth.mockReturnValue(
      authState({ user: { id_token: 'id-1', access_token: 'access-1' } }),
    );
    render(<AuthTokenSync />);
    expect(getIdToken()).toBe('id-1');
  });

  it('clears the holder when there is no user', () => {
    setIdToken('stale');
    mockUseAuth.mockReturnValue(authState({ user: null }));
    render(<AuthTokenSync />);
    expect(getIdToken()).toBeUndefined();
  });
});
