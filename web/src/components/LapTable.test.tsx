import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { swimBlob } from '@/test/fixtures';
import LapTable from './LapTable';

describe('LapTable', () => {
  it('renders one row per lap with stroke, time, strokes and SWOLF', () => {
    render(<LapTable laps={swimBlob().laps} />);
    expect(screen.getByText('freestyle')).toBeInTheDocument();
    expect(screen.getByText('breaststroke')).toBeInTheDocument();
    expect(screen.getByText('0:38')).toBeInTheDocument();
    expect(screen.getByText('60')).toBeInTheDocument(); // SWOLF: 38 + 22
  });

  it('shows an em dash when stroke count (and so SWOLF) is missing', () => {
    render(<LapTable laps={[{ index: 0, startDate: '', endDate: '', durationSeconds: 30 }]} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2); // stroke style and SWOLF
  });
});
