import { useEffect, useState } from 'react';
import { fetchSwimBlob, getSwim, type SwimBlob, type SwimSummary } from '@/api/swims';

export interface UseSwimDetailResult {
  summary: SwimSummary | undefined;
  blob: SwimBlob | undefined;
  loading: boolean;
  error: unknown;
}

/** Loads a swim's summary, then its full JSON blob from the presigned download URL. */
export function useSwimDetail(swimId: string): UseSwimDetailResult {
  const [summary, setSummary] = useState<SwimSummary>();
  const [blob, setBlob] = useState<SwimBlob>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(undefined);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    setSummary(undefined);
    setBlob(undefined);

    (async () => {
      const { swim, downloadUrl } = await getSwim(swimId);
      if (cancelled) return;
      setSummary(swim);
      const fullBlob = await fetchSwimBlob(downloadUrl);
      if (cancelled) return;
      setBlob(fullBlob);
    })()
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
  }, [swimId]);

  return { summary, blob, loading, error };
}
