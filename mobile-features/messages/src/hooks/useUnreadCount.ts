/**
 * M60: Polls the unread inquiry count for the messages tab badge.
 *
 * Compares the list of inquiry IDs from the API against locally-stored read
 * receipts and returns the number that have not been viewed yet.
 */
import { messagingContract } from '@iraq-maps/contracts';
import { useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { initClient } from '@ts-rest/core';
import { useEffect, useRef, useState } from 'react';
import { loadReceipts } from './readReceiptsStore';

const POLL_MS = 60_000;

export function useUnreadMessagesCount(): number {
  const baseUrl = useApiBaseUrl();
  const [count, setCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const client = initClient(messagingContract, { baseUrl, baseHeaders: {} });

    const fetch = async () => {
      try {
        const res = await client.listInquiries({ query: {} });
        if (res.status !== 200) return;
        const receipts = await loadReceipts();
        const unread = res.body.items.filter((i) => !receipts[i.id]).length;
        setCount(unread);
      } catch {
        // network error — keep previous count
      }
    };

    void fetch();
    timerRef.current = setInterval(() => void fetch(), POLL_MS);
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
    };
  }, [baseUrl]);

  return count;
}
