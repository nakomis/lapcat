import { useEffect, useState } from 'react';
import { listSwims, type SwimSummary } from '@/api/swims';

export interface UseSwimsResult {
  swims: SwimSummary[] | undefined;
  loading: boolean;
  error: unknown;
}

/** Loads the caller's swims once on mount. */
export function useSwims(): UseSwimsResult {
  const [swims, setSwims] = useState<SwimSummary[]>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(undefined);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    listSwims()
      .then((result) => {
        if (!cancelled) {
          setSwims(result);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { swims, loading, error };
}
