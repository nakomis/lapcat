import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { swimBlob } from '@/test/fixtures';
import DepthChart from './DepthChart';

describe('DepthChart', () => {
  it('renders depth samples', () => {
    const { container } = render(<DepthChart samples={swimBlob().submersion?.depth ?? []} />);
    expect(container.querySelector('.recharts-responsive-container')).toBeInTheDocument();
  });
});
