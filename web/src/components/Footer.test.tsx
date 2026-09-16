import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import versionData from '@/version.json';
import Footer from './Footer';

describe('Footer', () => {
  it('renders the app version from version.json', () => {
    render(<Footer />);
    expect(screen.getByText(`v${versionData.version} · Lapcat`)).toBeInTheDocument();
  });
});
