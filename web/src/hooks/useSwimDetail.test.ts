import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fetchSwimBlob, getSwim } from '@/api/swims';
import { swimBlob, swimSummaries } from '@/test/fixtures';
import { useSwimDetail } from './useSwimDetail';

vi.mock('@/api/swims', () => ({ getSwim: vi.fn(), fetchSwimBlob: vi.fn() }));

describe('useSwimDetail', () => {
  it('loads the summary, then the full blob', async () => {
    const [summary] = swimSummaries();
    vi.mocked(getSwim).mockResolvedValue({ swim: summary, downloadUrl: 'https://s3/x' });
    vi.mocked(fetchSwimBlob).mockResolvedValue(swimBlob());

    const { result } = renderHook(() => useSwimDetail(summary.swimId));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.summary).toEqual(summary);
    expect(result.current.blob).toEqual(swimBlob());
    expect(fetchSwimBlob).toHaveBeenCalledWith('https://s3/x');
  });

  it('reports an error when the summary fetch fails', async () => {
    vi.mocked(getSwim).mockRejectedValue(new Error('not found'));

    const { result } = renderHook(() => useSwimDetail('missing'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.summary).toBeUndefined();
    expect(fetchSwimBlob).not.toHaveBeenCalled();
  });
});
