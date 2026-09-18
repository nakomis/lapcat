import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PaceTrendChart from './PaceTrendChart';

describe('PaceTrendChart', () => {
  it('renders a line chart, skipping points with no computable pace', () => {
    const { container } = render(
      <PaceTrendChart
        data={[
          { startDate: '2026-09-01T08:00:00.000Z', paceSecondsPer100m: 95 },
          { startDate: '2026-09-08T08:00:00.000Z', paceSecondsPer100m: undefined },
        ]}
      />,
    );
    expect(container.querySelector('.recharts-responsive-container')).toBeInTheDocument();
  });
});
