import { useCallback, useEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '@/services/api';

export interface AsyncData<T> {
  data: T;
  /** True until the first load (and every reload) settles. */
  isLoading: boolean;
  /** Message of the last failed load (the API's own message), else null. */
  error: string | null;
  /** Fetch again (after a write, or from a retry button). */
  reload: () => void;
}

/**
 * FE-001: the finance services became async. This is the one place that turns
 * a loader into render state (data + loading + error + reload) so pages do not
 * each re-implement the effect/cancel dance. A response that arrives after the
 * component unmounted, or after a newer reload started, is ignored.
 */
export function useAsyncData<T>(loader: () => Promise<T>, initial: T): AsyncData<T> {
  const [data, setData] = useState<T>(initial);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    loaderRef
      .current()
      .then((value) => {
        if (cancelled) return;
        setData(value);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(apiErrorMessage(err, ''));
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data, isLoading, error, reload };
}
