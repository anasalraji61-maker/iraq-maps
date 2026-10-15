/**
 * useIncidents – fetches traffic incidents near a given location.
 * Polling interval: 60 s when online, no poll when offline.
 */
import type { Incident, LngLat } from '@iraq-maps/contracts';
import { useApi } from '@iraq-maps/mobile-kit';
import { useEffect, useRef, useState } from 'react';

const POLL_MS = 60_000;
const RADIUS_KM = 15;

export interface UseIncidentsResult {
  incidents: Incident[];
  refresh: () => void;
}

export function useIncidents(
  near: LngLat | null,
  isOnline: boolean,
): UseIncidentsResult {
  const api = useApi();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetch = async (loc: LngLat) => {
    try {
      const res = await api.incidents.list({
        query: { lat: loc[1], lng: loc[0], radiusKm: RADIUS_KM },
      });
      if (res.status === 200) {
        setIncidents(res.body.items);
      }
    } catch {
      // ignore – stale data is fine
    }
  };

  const refresh = () => {
    if (near && isOnline) void fetch(near);
  };

  useEffect(() => {
    if (!near || !isOnline) return;
    void fetch(near);

    timerRef.current = setInterval(() => {
      if (near && isOnline) void fetch(near);
    }, POLL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near?.[0], near?.[1], isOnline]);

  return { incidents, refresh };
}
