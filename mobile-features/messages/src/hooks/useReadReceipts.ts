/**
 * M57: Local read-receipt tracking.
 *
 * When a user opens an inquiry detail, we record the timestamp locally in
 * AsyncStorage so the list screen can show an unread dot and the detail screen
 * can display "seen at <time>".  There is no server-side markRead endpoint in
 * the current contract; this is client-side UX only.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = '@iraq-maps/messages/read-receipts';

interface ReadReceipts {
  [inquiryId: string]: string; // ISO timestamp
}

async function loadReceipts(): Promise<ReadReceipts> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ReadReceipts) : {};
  } catch {
    return {};
  }
}

async function saveReceipts(receipts: ReadReceipts): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(receipts));
  } catch {
    // best-effort
  }
}

/** Returns the ISO timestamp the user last viewed this inquiry, or null. */
export function useReadAt(inquiryId: string | undefined): string | null {
  const [readAt, setReadAt] = useState<string | null>(null);

  useEffect(() => {
    if (!inquiryId) return;
    void loadReceipts().then((r) => setReadAt(r[inquiryId] ?? null));
  }, [inquiryId]);

  return readAt;
}

/** Marks the inquiry as read (stores current ISO timestamp). Returns the stored timestamp. */
export function useMarkRead(inquiryId: string | undefined): () => Promise<string> {
  return useCallback(async () => {
    if (!inquiryId) return '';
    const now = new Date().toISOString();
    const receipts = await loadReceipts();
    if (!receipts[inquiryId]) {
      receipts[inquiryId] = now;
      await saveReceipts(receipts);
    }
    return receipts[inquiryId];
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
