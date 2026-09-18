import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StrokeStyleLegend from './StrokeStyleLegend';

describe('StrokeStyleLegend', () => {
  it('lists each unique stroke style once', () => {
    render(<StrokeStyleLegend strokeStyles={['freestyle', 'freestyle', 'breaststroke']} />);
    expect(screen.getByText('freestyle')).toBeInTheDocument();
    expect(screen.getByText('breaststroke')).toBeInTheDocument();
  });

  it('renders nothing when there are no stroke styles', () => {
    const { container } = render(<StrokeStyleLegend strokeStyles={['', '']} />);
    expect(container).toBeEmptyDOMElement();
  });
});
