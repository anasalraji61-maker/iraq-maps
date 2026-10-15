/**
 * HashtagFeedScreen — shows posts whose body contains a specific #hashtag.
 * Uses searchPosts with the hashtag as query.
 */
import { type DiscoverPostType } from '@iraq-maps/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  FlatList,
  I18nManager,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useDiscoverClient } from '../client';
import { t } from '../strings';
import { COLORS, sharedStyles } from './shared';

I18nManager.forceRTL(true);

export function HashtagFeedScreen(): ReactElement {
  const { tag } = useLocalSearchParams<{ tag: string }>();
  const hashtag = `#${tag ?? ''}`;
  const api = useDiscoverClient();
  const router = useRouter();

  const [posts, setPosts] = useState<DiscoverPostType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const cursor = useRef<string | undefined>(undefined);

  const load = useCallback(async (reset: boolean) => {
    if (reset) {
      setLoading(true);
      setError(null);
      cursor.current = undefined;
    } else {
      setLoadingMore(true);
    }
    try {
      const res = await api.searchPosts({ query: { q: hashtag, cursor: cursor.current, limit: 10 } });
      if (res.status === 200) {
        const { items, nextCursor: nc } = res.body;
        setPosts((prev) => (reset ? items : [...prev, ...items]));
        cursor.current = nc;
        setNextCursor(nc);
      } else {
        setError(t('feed.loadError'));
      }
    } catch {
      setError(t('feed.networkError'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [api, hashtag]);

  useEffect(() => { void load(true); }, [load]);

  const handleEndReached = useCallback(() => {
    if (!loadingMore && nextCursor) void load(false);
  }, [load, loadingMore, nextCursor]);

  return (
    <View style={sharedStyles.container}>
      <View style={sharedStyles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          style={styles.backBtn}
        >
          <Text style={styles.backText}>{'‹'}</Text>
        </Pressable>
        <Text style={sharedStyles.headerTitle}>{hashtag}</Text>
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} size="large" color={COLORS.primary} />
      ) : error ? (
        <View style={sharedStyles.emptyContainer}>
          <Text style={[sharedStyles.emptyText, { color: COLORS.error }]}>{error}</Text>
          <Pressable onPress={() => void load(true)} accessibilityRole="button" style={styles.retryBtn}>
            <Text style={styles.retryText}>{t('feed.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={sharedStyles.listContent}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/discover/post/[postId]', params: { postId: item.id } })}
              accessibilityRole="button"
              style={styles.postCard}
            >
              <Text style={styles.postMeta}>{item.authorId.slice(0, 8)} · {item.createdAt.slice(0, 10)}</Text>
              <Text style={styles.postBody}>{item.body}</Text>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={sharedStyles.emptyContainer}>
              <Text style={sharedStyles.emptyText}>{t('hashtag.empty', { tag: hashtag })}</Text>
            </View>
          }
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={{ paddingVertical: 12 }} size="small" color={COLORS.primary} /> : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backBtn: { position: 'absolute', start: 12, top: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: 8 },
  backText: { color: '#FFF', fontSize: 28, lineHeight: 32 },
  retryBtn: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 8, backgroundColor: COLORS.primary, borderRadius: 8 },
  retryText: { color: '#FFF', fontWeight: '600' },
  postCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  postMeta: { fontSize: 11, color: COLORS.textMuted, marginBottom: 4, textAlign: 'auto' },
  postBody: { fontSize: 14, color: COLORS.textPrimary, lineHeight: 20, textAlign: 'auto' },
});
