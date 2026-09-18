import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DistancePerWeekChart from './DistancePerWeekChart';

describe('DistancePerWeekChart', () => {
  it('renders a bar chart from weekly distance buckets', () => {
    const { container } = render(
      <DistancePerWeekChart
        data={[
          { weekStart: '2026-09-01T00:00:00.000Z', distanceMetres: 1000 },
          { weekStart: '2026-09-08T00:00:00.000Z', distanceMetres: 1500 },
        ]}
      />,
    );
    expect(container.querySelector('.recharts-responsive-container')).toBeInTheDocument();
  });

  it('renders with no data without crashing', () => {
    const { container } = render(<DistancePerWeekChart data={[]} />);
    expect(container.querySelector('.recharts-responsive-container')).toBeInTheDocument();
  });
});
