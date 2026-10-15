/**
 * Client-side archive store for conversations.
 * Archived inquiry IDs are stored in AsyncStorage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const ARCHIVE_KEY = '@iraq-maps/messages/archive';

async function loadArchived(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(ARCHIVE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(parsed);
  } catch {
    return new Set();
  }
}

async function saveArchived(ids: Set<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(ARCHIVE_KEY, JSON.stringify([...ids]));
  } catch {
    // Best-effort
  }
}

/** Returns the set of archived inquiry IDs and toggle/check helpers. */
export function useArchive(): {
  archivedIds: Set<string>;
  toggle: (id: string) => Promise<void>;
  isArchived: (id: string) => boolean;
} {
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    void loadArchived().then(setArchivedIds);
  }, []);

  const toggle = useCallback(async (id: string) => {
    const current = await loadArchived();
    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
    }
    await saveArchived(current);
    setArchivedIds(new Set(current));
  }, []);

  const isArchived = useCallback(
    (id: string) => archivedIds.has(id),
    [archivedIds],
  );

  return { archivedIds, toggle, isArchived };
}
