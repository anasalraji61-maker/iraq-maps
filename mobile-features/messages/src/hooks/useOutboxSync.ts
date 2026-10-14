import { InquiryOutbox, type OutboxEntry } from '@iraq-maps/mobile-kit';
import { useEffect } from 'react';
import { useMessagingClient } from '../client';
import { addNetInfoListener } from '../netinfo';

/** On mount and on NetInfo reconnect, flushes the offline outbox via the messaging API. */
export function useOutboxSync(): void {
  const api = useMessagingClient();

  useEffect(() => {
    const outbox = new InquiryOutbox();
    const sendFn = async (entry: OutboxEntry) => {
      const res = await api.createInquiry({
        headers: { 'idempotency-key': entry.id },
        body: {
          text: entry.text,
          placeIds: entry.placeIds as [string, ...string[]],
          confirm: true,
        },
      });
      if (res.status !== 201) throw new Error(`createInquiry failed: ${res.status}`);
    };

    // Flush on mount
    void outbox.flush(sendFn);

    // Flush on reconnect
    return addNetInfoListener((state) => {
      if (state.isConnected) {
        void outbox.flush(sendFn);
      }
    });
  }, [api]);
}
