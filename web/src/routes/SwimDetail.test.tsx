import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { useAuth } from 'react-oidc-context';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/swims';
import { useSwimDetail } from '@/hooks/useSwimDetail';
import { swimBlob, swimSummaries } from '@/test/fixtures';
import SwimDetail from './SwimDetail';

vi.mock('react-oidc-context', () => ({ useAuth: vi.fn() }));
vi.mock('@/hooks/useSwimDetail', () => ({ useSwimDetail: vi.fn() }));
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useParams: () => ({ swimId: 'swim-3' }),
    Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  };
});

const mockUseAuth = vi.mocked(useAuth);
const mockUseSwimDetail = vi.mocked(useSwimDetail);

function authState(overrides: Record<string, unknown> = {}) {
  return {
    isLoading: false,
    signinRedirect: vi.fn().mockResolvedValue(undefined),
    removeUser: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useAuth>;
}

describe('SwimDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while auth resolves', () => {
    mockUseAuth.mockReturnValue(authState({ isLoading: true }));
    mockUseSwimDetail.mockReturnValue({
      summary: undefined,
      blob: undefined,
      loading: true,
      error: undefined,
    });
    render(<SwimDetail />);
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  it('shows a skeleton while the swim is loading', () => {
    mockUseAuth.mockReturnValue(authState());
    mockUseSwimDetail.mockReturnValue({
      summary: undefined,
      blob: undefined,
      loading: true,
      error: undefined,
    });
    render(<SwimDetail />);
    expect(screen.getByRole('status', { name: 'Loading swims' })).toBeInTheDocument();
  });

  it('shows the re-sign-in prompt on a 401', async () => {
    const auth = authState();
    mockUseAuth.mockReturnValue(auth);
    mockUseSwimDetail.mockReturnValue({
      summary: undefined,
      blob: undefined,
      loading: false,
      error: new ApiError('nope', 401),
    });
    render(<SwimDetail />);
    await userEvent.click(screen.getByRole('button', { name: /Sign in again/ }));
    expect(auth.signinRedirect).toHaveBeenCalledOnce();
  });

  it('renders stat tiles, charts, and the lap table once summary and blob load', () => {
    mockUseAuth.mockReturnValue(authState());
    const [summary] = swimSummaries();
    mockUseSwimDetail.mockReturnValue({
      summary,
      blob: swimBlob(),
      loading: false,
      error: undefined,
    });
    render(<SwimDetail />);

    expect(screen.getByText(/swim$/)).toBeInTheDocument();
    expect(screen.getByText('Lap splits')).toBeInTheDocument();
    expect(screen.getByText('Heart rate')).toBeInTheDocument();
    expect(screen.getByText('Water temperature & depth')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Laps', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Shaded areas mark rest periods.')).toBeInTheDocument();
  });

  it('omits the submersion section when the blob has no submersion data', () => {
    mockUseAuth.mockReturnValue(authState());
    const [summary] = swimSummaries();
    const blob = swimBlob();
    delete blob.submersion;
    mockUseSwimDetail.mockReturnValue({ summary, blob, loading: false, error: undefined });
    render(<SwimDetail />);

    expect(screen.queryByText('Water temperature & depth')).not.toBeInTheDocument();
  });
});
