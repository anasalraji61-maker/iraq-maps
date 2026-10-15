/**
 * useCollections — client-side named collections for saved posts,
 * backed by AsyncStorage. Each collection stores post IDs only;
 * the full post objects live in the useSavedPosts store.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'discover:collections:v1';

export interface Collection {
  id: string;
  name: string;
  postIds: string[];
  createdAt: string;
}

type CollectionMap = Record<string, Collection>;

async function readStorage(): Promise<CollectionMap> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CollectionMap) : {};
  } catch {
    return {};
  }
}

async function writeStorage(map: CollectionMap): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // best-effort
  }
}

function generateId(): string {
  return `col_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export interface UseCollections {
  collections: readonly Collection[];
  loading: boolean;
  createCollection: (name: string) => Promise<Collection>;
  deleteCollection: (id: string) => Promise<void>;
  addPostToCollection: (collectionId: string, postId: string) => Promise<void>;
  removePostFromCollection: (collectionId: string, postId: string) => Promise<void>;
  getCollectionsForPost: (postId: string) => Collection[];
}

export function useCollections(): UseCollections {
  const [map, setMap] = useState<CollectionMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    readStorage().then((m) => {
      if (!cancelled) {
        setMap(m);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const collections = Object.values(map).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const createCollection = useCallback(async (name: string): Promise<Collection> => {
    const col: Collection = {
      id: generateId(),
      name: name.trim(),
      postIds: [],
      createdAt: new Date().toISOString(),
    };
    setMap((prev) => {
      const next = { ...prev, [col.id]: col };
      void writeStorage(next);
      return next;
    });
    return col;
  }, []);

  const deleteCollection = useCallback(async (id: string): Promise<void> => {
    setMap((prev) => {
      const next = { ...prev };
      delete next[id];
      void writeStorage(next);
      return next;
    });
  }, []);

  const addPostToCollection = useCallback(async (collectionId: string, postId: string): Promise<void> => {
    setMap((prev) => {
      const col = prev[collectionId];
      if (!col) return prev;
      if (col.postIds.includes(postId)) return prev;
      const updated = { ...col, postIds: [...col.postIds, postId] };
      const next = { ...prev, [collectionId]: updated };
      void writeStorage(next);
      return next;
    });
  }, []);

  const removePostFromCollection = useCallback(async (collectionId: string, postId: string): Promise<void> => {
    setMap((prev) => {
      const col = prev[collectionId];
      if (!col) return prev;
      const updated = { ...col, postIds: col.postIds.filter((id) => id !== postId) };
      const next = { ...prev, [collectionId]: updated };
      void writeStorage(next);
      return next;
    });
  }, []);

  const getCollectionsForPost = useCallback((postId: string): Collection[] => {
    return Object.values(map).filter((c) => c.postIds.includes(postId));
  }, [map]);

  return {
    collections,
    loading,
    createCollection,
    deleteCollection,
    addPostToCollection,
    removePostFromCollection,
    getCollectionsForPost,
  };
}
