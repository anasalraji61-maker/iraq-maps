import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'iraq-maps:inquiry-outbox';

export interface OutboxEntry {
  id: string; // idempotencyKey (UUID)
  text: string;
  placeIds: string[];
  queuedAt: number;
  attempts: number;
  status: 'pending' | 'sent' | 'failed';
}

export class InquiryOutbox {
  private async load(): Promise<OutboxEntry[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as OutboxEntry[];
    } catch {
      return [];
    }
  }

  private async save(entries: OutboxEntry[]): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // best-effort
    }
  }

  async enqueue(entry: Omit<OutboxEntry, 'attempts' | 'status'>): Promise<void> {
    const entries = await this.load();
    // Idempotent: skip if already queued
    if (entries.some((e) => e.id === entry.id)) return;
    entries.push({ ...entry, attempts: 0, status: 'pending' });
    await this.save(entries);
  }

  async getPending(): Promise<OutboxEntry[]> {
    const entries = await this.load();
    return entries.filter((e) => e.status === 'pending');
  }

  async markSent(id: string): Promise<void> {
    const entries = await this.load();
    const updated = entries.map((e) => (e.id === id ? { ...e, status: 'sent' as const } : e));
    await this.save(updated);
  }

  async markFailed(id: string): Promise<void> {
    const entries = await this.load();
    const updated = entries.map((e) =>
      e.id === id ? { ...e, status: 'failed' as const, attempts: e.attempts + 1 } : e,
    );
    await this.save(updated);
  }

  /** Sends all pending entries in order. Each entry is sent exactly once per flush call (idempotency key prevents server duplicates). */
  async flush(sendFn: (entry: OutboxEntry) => Promise<void>): Promise<void> {
    const pending = await this.getPending();
    for (const entry of pending) {
      try {
        await sendFn(entry);
        await this.markSent(entry.id);
      } catch {
        await this.markFailed(entry.id);
      }
    }
  }
}
