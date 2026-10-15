/**
 * M57: Local read-receipt tracking.
 * M72: Also syncs read status to the server via markInquiryRead endpoint.
 *
 * When a user opens an inquiry detail, we record the timestamp locally in
 * AsyncStorage (for instant UI feedback) and also notify the server so that
 * the backend can track read state for analytics / provider notifications.
 */
import { type InquiryId } from '@iraq-maps/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMessagingClient } from '../client';
import { loadReceipts, saveReceipts } from './readReceiptsStore';

/** Returns the ISO timestamp the user last viewed this inquiry, or null. */
export function useReadAt(inquiryId: string | undefined): string | null {
  const [readAt, setReadAt] = useState<string | null>(null);

  useEffect(() => {
    if (!inquiryId) return;
    void loadReceipts().then((r) => setReadAt(r[inquiryId] ?? null));
  }, [inquiryId]);

  return readAt;
}

/** Marks the inquiry as read locally and on the server. Returns the stored timestamp. */
export function useMarkRead(inquiryId: string | undefined): () => Promise<string> {
  const api = useMessagingClient();
  // Keep a ref so the callback is stable across re-renders; avoids infinite effect loops.
  const apiRef = useRef(api);
  apiRef.current = api;
  return useCallback(async () => {
    if (!inquiryId) return '';
    const now = new Date().toISOString();
    const receipts = await loadReceipts();
    if (!receipts[inquiryId]) {
      receipts[inquiryId] = now;
      await saveReceipts(receipts);
    }
    // Best-effort server sync — never block the UI on this
    void apiRef.current.markInquiryRead({ params: { id: inquiryId as InquiryId }, body: {} }).catch(() => undefined);
    return receipts[inquiryId]!;
  }, [inquiryId]);
}

/** Returns a map of inquiryId → readAt for the given ids (for the list screen). */
export function useReadReceiptsMap(
  inquiryIds: string[],
): Record<string, string | undefined> {
  const [map, setMap] = useState<Record<string, string | undefined>>({});

  const key = inquiryIds.join(',');
  useEffect(() => {
    if (key === '') return;
    const ids = key.split(',');
    void loadReceipts().then((all) => {
      const subset: Record<string, string | undefined> = {};
      for (const id of ids) subset[id] = all[id];
      setMap(subset);
    });
  }, [key]);

  return map;
}
