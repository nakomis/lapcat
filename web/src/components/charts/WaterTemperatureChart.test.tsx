import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { swimBlob } from '@/test/fixtures';
import WaterTemperatureChart from './WaterTemperatureChart';

describe('WaterTemperatureChart', () => {
  it('renders water temperature samples', () => {
    const { container } = render(
      <WaterTemperatureChart samples={swimBlob().submersion?.waterTemperature ?? []} />,
    );
    expect(container.querySelector('.recharts-responsive-container')).toBeInTheDocument();
  });
});
