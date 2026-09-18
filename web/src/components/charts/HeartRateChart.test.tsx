import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { swimBlob } from '@/test/fixtures';
import HeartRateChart from './HeartRateChart';

describe('HeartRateChart', () => {
  it('renders heart rate with shaded rest periods', () => {
    const blob = swimBlob();
    const { container } = render(
      <HeartRateChart heartRate={blob.heartRate} pauses={blob.pauses} />,
    );
    expect(container.querySelector('.recharts-responsive-container')).toBeInTheDocument();
  });

  it('renders with no rests', () => {
    const { container } = render(<HeartRateChart heartRate={swimBlob().heartRate} pauses={[]} />);
    expect(container.querySelector('.recharts-responsive-container')).toBeInTheDocument();
  });
});
