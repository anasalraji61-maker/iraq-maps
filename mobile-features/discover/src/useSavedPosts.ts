/**
 * useSavedPosts — client-side bookmark store backed by AsyncStorage.
 * Posts are saved by their UUID; the full post object is stored so
 * the Saved screen works offline.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import type { DiscoverPostType } from '@iraq-maps/contracts';

const STORAGE_KEY = 'discover:savedPosts:v1';

type SavedMap = Record<string, DiscoverPostType>;

async function readStorage(): Promise<SavedMap> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedMap) : {};
  } catch {
    return {};
  }
}

async function writeStorage(map: SavedMap): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // best-effort
  }
}

export interface UseSavedPosts {
  savedIds: ReadonlySet<string>;
  savedPosts: readonly DiscoverPostType[];
  isSaved: (postId: string) => boolean;
  toggleSave: (post: DiscoverPostType) => Promise<void>;
  loading: boolean;
}

export function useSavedPosts(): UseSavedPosts {
  const [map, setMap] = useState<SavedMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    readStorage().then((m) => {
      if (!cancelled) {
        setMap(m);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const savedIds = new Set(Object.keys(map));
  const savedPosts = Object.values(map).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const isSaved = useCallback((postId: string) => postId in map, [map]);

  const toggleSave = useCallback(
    async (post: DiscoverPostType) => {
      setMap((prev) => {
        const next = { ...prev };
        if (post.id in next) {
          delete next[post.id];
        } else {
          next[post.id] = post;
        }
        writeStorage(next);
        return next;
      });
    },
    [],
  );

  return { savedIds, savedPosts, isSaved, toggleSave, loading };
}
