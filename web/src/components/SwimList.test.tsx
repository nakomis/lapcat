import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { swimSummaries } from '@/test/fixtures';
import SwimList from './SwimList';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: ({
      children,
      to,
      params,
    }: {
      children: ReactNode;
      to: string;
      params?: { swimId: string };
    }) => <a href={to.replace('$swimId', params?.swimId ?? '')}>{children}</a>,
  };
});

describe('SwimList', () => {
  it('renders one row per swim, newest first, linking to its detail route', () => {
    render(<SwimList swims={swimSummaries()} />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAttribute('href', '/swims/swim-3');
  });

  it('shows pool length, laps, distance and pace', () => {
    render(<SwimList swims={swimSummaries()} />);
    expect(screen.getByText(/25 m/)).toBeInTheDocument();
    expect(screen.getByText(/20 laps/)).toBeInTheDocument();
    expect(screen.getAllByText('500 m')).toHaveLength(2);
  });
});
