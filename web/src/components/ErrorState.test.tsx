import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/swims';
import ErrorState from './ErrorState';

describe('ErrorState', () => {
  it('shows a re-sign-in prompt for a 401 ApiError', async () => {
    const onSignInAgain = vi.fn();
    render(<ErrorState error={new ApiError('nope', 401)} onSignInAgain={onSignInAgain} />);
    expect(screen.getByText(/session has expired/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Sign in again/ }));
    expect(onSignInAgain).toHaveBeenCalledOnce();
  });

  it('shows a generic retry message for anything else', () => {
    render(<ErrorState error={new Error('boom')} onSignInAgain={vi.fn()} />);
    expect(screen.getByText(/couldn't load your swims/i)).toBeInTheDocument();
  });

  it('treats a non-401 ApiError as a generic error', () => {
    render(<ErrorState error={new ApiError('server error', 500)} onSignInAgain={vi.fn()} />);
    expect(screen.getByText(/couldn't load your swims/i)).toBeInTheDocument();
  });
});
