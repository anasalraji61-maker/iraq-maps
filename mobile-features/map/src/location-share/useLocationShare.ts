/**
 * useLocationShare – polls the GET endpoint every 5s to get the
 * current position from a live location share link.
 */
import type { LocationShare } from '@iraq-maps/contracts';
import { useApi } from '@iraq-maps/mobile-kit';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseLocationShareResult {
  share: LocationShare | null;
  expired: boolean;
  loading: boolean;
  error: string | null;
}

const POLL_INTERVAL_MS = 5_000;

export function useLocationShare(shareId: string | null): UseLocationShareResult {
  const api = useApi();
  const [share, setShare] = useState<LocationShare | null>(null);
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchShare = useCallback(async () => {
    if (!shareId) return;
    try {
      const res = await api.locationShare.get({ params: { shareId } });
      if (res.status === 200) {
        setShare(res.body);
        setExpired(false);
        setError(null);
      } else if (res.status === 410) {
        setExpired(true);
        if (intervalRef.current) clearInterval(intervalRef.current);
      } else {
        setError('not_found');
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    } catch {
      setError('network_error');
    }
  }, [api, shareId]);

  useEffect(() => {
    if (!shareId) return;
    setLoading(true);
    void fetchShare().finally(() => setLoading(false));
    intervalRef.current = setInterval(() => void fetchShare(), POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [shareId, fetchShare]);

  return { share, expired, loading, error };
}
