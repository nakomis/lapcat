import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SignInScreen from './SignInScreen';

describe('SignInScreen', () => {
  it('shows the Lapcat heading and logo', () => {
    render(<SignInScreen onSignIn={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Lapcat' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Lapcat logo' })).toBeInTheDocument();
  });

  it('calls onSignIn when the button is clicked', async () => {
    const onSignIn = vi.fn();
    render(<SignInScreen onSignIn={onSignIn} />);
    await userEvent.click(screen.getByRole('button', { name: /Sign in/ }));
    expect(onSignIn).toHaveBeenCalledOnce();
  });
});
