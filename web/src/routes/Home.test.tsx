import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { useAuth } from 'react-oidc-context';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/swims';
import { useSwims } from '@/hooks/useSwims';
import { signOut } from '@/lib/auth';
import { swimSummaries } from '@/test/fixtures';
import Home from './Home';

vi.mock('react-oidc-context', () => ({ useAuth: vi.fn() }));
vi.mock('@/lib/auth', () => ({ signOut: vi.fn() }));
vi.mock('@/hooks/useSwims', () => ({ useSwims: vi.fn() }));
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  };
});

const mockUseAuth = vi.mocked(useAuth);
const mockUseSwims = vi.mocked(useSwims);

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

function signedInState() {
  return authState({
    isAuthenticated: true,
    user: { profile: { email: 'swimmer@example.com' } },
  });
}

describe('Home', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(new Date('2026-09-18T12:00:00.000Z'));
  });

  it('shows a loading state while auth resolves', () => {
    mockUseAuth.mockReturnValue(authState({ isLoading: true }));
    mockUseSwims.mockReturnValue({ swims: undefined, loading: true, error: undefined });
    render(<Home />);
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  it('shows an auth error message', () => {
    mockUseAuth.mockReturnValue(authState({ error: new Error('boom') }));
    mockUseSwims.mockReturnValue({ swims: undefined, loading: true, error: undefined });
    render(<Home />);
    expect(screen.getByText(/Error: boom/)).toBeInTheDocument();
  });

  it('signed out: shows the sign-in screen, which starts the redirect', async () => {
    const state = authState({ isAuthenticated: false });
    mockUseAuth.mockReturnValue(state);
    mockUseSwims.mockReturnValue({ swims: undefined, loading: true, error: undefined });
    render(<Home />);
    expect(screen.queryByRole('button', { name: /Sign out/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Sign in/ }));
    expect(state.signinRedirect).toHaveBeenCalledOnce();
  });

  it('signed in, swims loading: shows a skeleton', () => {
    mockUseAuth.mockReturnValue(signedInState());
    mockUseSwims.mockReturnValue({ swims: undefined, loading: true, error: undefined });
    render(<Home />);
    expect(screen.getByRole('heading', { name: 'Hello swimmer@example.com' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading swims' })).toBeInTheDocument();
  });

  it('signed in, no swims yet: shows the empty state', () => {
    mockUseAuth.mockReturnValue(signedInState());
    mockUseSwims.mockReturnValue({ swims: [], loading: false, error: undefined });
    render(<Home />);
    expect(screen.getByText('Your swims will appear here')).toBeInTheDocument();
  });

  it('signed in, an ApiError 401: shows the re-sign-in prompt', async () => {
    const state = signedInState();
    mockUseAuth.mockReturnValue(state);
    mockUseSwims.mockReturnValue({
      swims: undefined,
      loading: false,
      error: new ApiError('nope', 401),
    });
    render(<Home />);
    expect(screen.getByText(/session has expired/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Sign in again/ }));
    expect(state.signinRedirect).toHaveBeenCalledOnce();
  });

  it('signed in, a generic error: shows a retry message', () => {
    mockUseAuth.mockReturnValue(signedInState());
    mockUseSwims.mockReturnValue({
      swims: undefined,
      loading: false,
      error: new Error('network down'),
    });
    render(<Home />);
    expect(screen.getByText(/couldn't load your swims/i)).toBeInTheDocument();
  });

  it('signed in with swims: shows stat tiles, trends, and the swim list', async () => {
    const state = signedInState();
    mockUseAuth.mockReturnValue(state);
    mockUseSwims.mockReturnValue({ swims: swimSummaries(), loading: false, error: undefined });
    render(<Home />);

    expect(screen.getByText('Last 30 days')).toBeInTheDocument();
    expect(screen.getByText('Distance per week')).toBeInTheDocument();
    expect(screen.getByText('Pace over time')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Swims', level: 2 })).toBeInTheDocument();
    expect(screen.getByText(/· Lapcat/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Sign out/ }));
    expect(signOut).toHaveBeenCalledWith(state);
  });

  it('signed in without an email claim: still renders a greeting', () => {
    mockUseAuth.mockReturnValue(authState({ isAuthenticated: true, user: { profile: {} } }));
    mockUseSwims.mockReturnValue({ swims: [], loading: false, error: undefined });
    render(<Home />);
    expect(screen.getByRole('heading', { name: 'Hello' })).toBeInTheDocument();
  });
});
