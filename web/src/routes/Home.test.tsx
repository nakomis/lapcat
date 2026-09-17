import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAuth } from 'react-oidc-context';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signOut } from '@/lib/auth';
import Home from './Home';

vi.mock('react-oidc-context', () => ({ useAuth: vi.fn() }));
vi.mock('@/lib/auth', () => ({ signOut: vi.fn() }));

const mockUseAuth = vi.mocked(useAuth);

function authState(overrides: Record<string, unknown>) {
  return {
    isLoading: false,
    isAuthenticated: false,
    error: undefined,
    user: null,
    signinRedirect: vi.fn().mockResolvedValue(undefined),
    removeUser: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useAuth>;
}

describe('Home', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state', () => {
    mockUseAuth.mockReturnValue(authState({ isLoading: true }));
    render(<Home />);
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  it('shows an error message', () => {
    mockUseAuth.mockReturnValue(authState({ error: new Error('boom') }));
    render(<Home />);
    expect(screen.getByText(/Error: boom/)).toBeInTheDocument();
  });

  it('signed out: shows the sign-in screen, which starts the redirect', async () => {
    const state = authState({ isAuthenticated: false });
    mockUseAuth.mockReturnValue(state);
    render(<Home />);
    expect(screen.queryByRole('button', { name: /Sign out/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Sign in/ }));
    expect(state.signinRedirect).toHaveBeenCalledOnce();
  });

  it('signed in: greets the user by email, with placeholder, version and sign out', async () => {
    const state = authState({
      isAuthenticated: true,
      user: { profile: { email: 'swimmer@example.com' } },
    });
    mockUseAuth.mockReturnValue(state);
    render(<Home />);

    expect(screen.getByRole('heading', { name: 'Hello swimmer@example.com' })).toBeInTheDocument();
    expect(screen.getByText('Your swims will appear here')).toBeInTheDocument();
    expect(screen.getByText(/· Lapcat/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sign in/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Sign out/ }));
    expect(signOut).toHaveBeenCalledWith(state);
  });

  it('signed in without an email claim: still renders a greeting', () => {
    mockUseAuth.mockReturnValue(authState({ isAuthenticated: true, user: { profile: {} } }));
    render(<Home />);
    expect(screen.getByRole('heading', { name: 'Hello' })).toBeInTheDocument();
  });
});
