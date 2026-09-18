import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { listSwims } from '@/api/swims';
import { swimSummaries } from '@/test/fixtures';
import { useSwims } from './useSwims';

vi.mock('@/api/swims', () => ({ listSwims: vi.fn() }));

describe('useSwims', () => {
  it('loads swims and reports the result', async () => {
    vi.mocked(listSwims).mockResolvedValue(swimSummaries());
    const { result } = renderHook(() => useSwims());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.swims).toEqual(swimSummaries());
    expect(result.current.error).toBeUndefined();
  });

  it('reports an error when the fetch fails', async () => {
    vi.mocked(listSwims).mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useSwims());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.swims).toBeUndefined();
  });
});
