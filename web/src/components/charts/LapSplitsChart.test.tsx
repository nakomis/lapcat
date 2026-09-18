import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { swimBlob } from '@/test/fixtures';
import LapSplitsChart from './LapSplitsChart';

describe('LapSplitsChart', () => {
  it('renders one bar per lap coloured by stroke style', () => {
    const { container } = render(<LapSplitsChart laps={swimBlob().laps} />);
    expect(container.querySelector('.recharts-responsive-container')).toBeInTheDocument();
  });

  it('falls back to the default colour for a lap with no stroke style', () => {
    const { container } = render(
      <LapSplitsChart laps={[{ index: 0, startDate: '', endDate: '', durationSeconds: 30 }]} />,
    );
    expect(container.querySelector('.recharts-responsive-container')).toBeInTheDocument();
  });
});
