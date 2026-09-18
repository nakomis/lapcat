import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LoadingSkeleton from './LoadingSkeleton';

describe('LoadingSkeleton', () => {
  it('renders the default number of placeholder rows', () => {
    render(<LoadingSkeleton />);
    const status = screen.getByRole('status', { name: 'Loading swims' });
    expect(status.children).toHaveLength(3);
  });

  it('renders a custom number of rows', () => {
    render(<LoadingSkeleton rows={5} />);
    const status = screen.getByRole('status', { name: 'Loading swims' });
    expect(status.children).toHaveLength(5);
  });
});
