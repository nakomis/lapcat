import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StatTile from './StatTile';

describe('StatTile', () => {
  it('shows the label and value', () => {
    render(<StatTile label="Distance" value="1,250 m" />);
    expect(screen.getByText('Distance')).toBeInTheDocument();
    expect(screen.getByText('1,250 m')).toBeInTheDocument();
  });

  it('shows an optional unit beside the value', () => {
    render(<StatTile label="Avg pace" value="1:40" unit="/100 m" />);
    expect(screen.getByText('/100 m')).toBeInTheDocument();
  });
});
