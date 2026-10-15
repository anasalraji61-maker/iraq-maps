import { type DiscoverPostType } from '@iraq-maps/contracts';
import { useApi } from '@iraq-maps/mobile-kit';
import { useLocalSearchParams } from 'expo-router';
import { useState, useCallback, useEffect, useRef, type ReactElement } from 'react';
import {
  Animated,
  FlatList,
  I18nManager,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { type z } from 'zod';
import { DiscoverComment } from '@iraq-maps/contracts';
import { useDiscoverClient } from '../client';
import { t } from '../strings';
import { formatRelativeTime, getTypeBadgeColors, sharedStyles, COLORS, CommentCard, CommentInputRow } from './shared';

I18nManager.forceRTL(true);

// ─── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonBlock({ width, height }: { width: number; height: number }): ReactElement {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 600, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return <Animated.View style={[{ width, height, backgroundColor: '#E0E0E0', borderRadius: 6 }, { opacity }]} accessibilityElementsHidden />;
}

function PostDetailSkeleton(): ReactElement {
  return (
    <View testID="skeleton-post-detail" style={{ padding: 16, gap: 16 }}>
      <View style={{ backgroundColor: '#FFF', borderRadius: 12, padding: 14, gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <SkeletonBlock width={36} height={36} />
          <SkeletonBlock width={80} height={13} />
        </View>
        <SkeletonBlock width={280} height={14} />
        <SkeletonBlock width={200} height={14} />
        <SkeletonBlock width={100} height={11} />
      </View>
      {[1, 2, 3].map((k) => (
        <View key={k} style={{ backgroundColor: '#FFF', borderRadius: 10, padding: 12, gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <SkeletonBlock width={28} height={28} />
            <SkeletonBlock width={70} height={12} />
          </View>
          <SkeletonBlock width={220} height={12} />
        </View>
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

type DiscoverCommentType = z.infer<typeof DiscoverComment>;

function PostBody({ post, mediaUrls }: { post: DiscoverPostType; mediaUrls: Readonly<Record<string, string>> }): ReactElement {
  const badgeColors = getTypeBadgeColors(post.type);

  const handleShare = useCallback(() => {
    const message = t('post.shareText', { body: post.body, postId: post.id });
    void Share.share({ message });
  }, [post.body, post.id]);

  const images = post.mediaAssetIds
    .map((id) => ({ id, url: mediaUrls[id] }))
    .filter((img): img is { id: string; url: string } => !!img.url);

  return (
    <View style={styles.postCard}>
      <View style={styles.postHeader}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{post.authorId.slice(0, 1).toUpperCase()}</Text>
        </View>
        <Text style={styles.authorText}>{post.authorId.slice(0, 8)}</Text>
        <View style={[styles.typeBadge, { backgroundColor: badgeColors.bg }]}>
          <Text style={[styles.typeText, { color: badgeColors.text }]}>{post.type}</Text>
        </View>
      </View>
      {images.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageStrip} contentContainerStyle={styles.imageStripContent}>
          {images.map((img) => (
            <Image key={img.id} source={{ uri: img.url }} style={styles.detailImage} resizeMode="cover" accessibilityRole="image" />
          ))}
        </ScrollView>
      )}
      <Text style={styles.bodyText}>{post.body}</Text>
      <Text style={styles.postDate}>{formatRelativeTime(post.createdAt)}</Text>
      <Pressable style={styles.shareBtn} onPress={handleShare} accessibilityRole="button">
        <Text style={styles.shareBtnText}>{t('post.share')}</Text>
      </Pressable>
    </View>
  );
}


export function PostDetailScreen(): ReactElement {
  const { postId, postJson } = useLocalSearchParams<{ postId: string; postJson?: string }>();
  const api = useDiscoverClient();
  const extApi = useApi();

  // Parse post from navigation params (passed by DiscoverFeedScreen to avoid a redundant feed fetch)
  const initialPost = postJson ? (() => { try { return JSON.parse(postJson) as DiscoverPostType; } catch { return undefined; } })() : undefined;

  const [post] = useState<DiscoverPostType | undefined>(initialPost);
  const [comments, setComments] = useState<DiscoverCommentType[]>([]);
  const [loading, setLoading] = useState(!initialPost);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<Readonly<Record<string, string>>>({});
  const fetchingAssetIds = useRef(new Set<string>());
  const listRef = useRef<FlatList>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (!postId) return;
    if (isRefresh) setRefreshing(true); else if (!post) setLoading(true);
    setError(undefined);
    try {
      const commentsRes = await api.listComments({ params: { postId }, query: { limit: 20 } });
      if (commentsRes.status === 200) {
        setComments(commentsRes.body.items);
      }
    } catch {
      setError(t('postDetail.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api, post, postId]);

  useEffect(() => { void loadData(false); }, [loadData]);

  // Fetch signed read URLs for all media assets of this post
  useEffect(() => {
    if (!post || post.mediaAssetIds.length === 0) return;
    const assetIds = post.mediaAssetIds.filter((id) => !mediaUrls[id] && !fetchingAssetIds.current.has(id));
    if (assetIds.length === 0) return;
    assetIds.forEach((id) => fetchingAssetIds.current.add(id));
    void Promise.all(
      assetIds.map(async (assetId) => {
        try {
          const res = await extApi.media.readUrl({ params: { assetId }, query: { size: 'medium' } });
          if (res.status === 200) {
            setMediaUrls((prev) => ({ ...prev, [assetId]: res.body.url }));
          }
        } catch {
          // silent — image won't show
        } finally {
          fetchingAssetIds.current.delete(assetId);
        }
      }),
    );
  // post?.id as dep: re-fetch only when the post changes, not on every mediaUrls update
  }, [post?.id]); // extApi ref is stable; deliberate partial deps

  const handleRefresh = useCallback(() => { void loadData(true); }, [loadData]);

  const handleSend = useCallback(async () => {
    const text = commentText.trim();
    if (!text || sending || !postId) return;
    setSending(true);
    try {
      const res = await api.createComment({ params: { postId }, body: { body: text } });
      if (res.status === 201) {
        setCommentText('');
        setComments((prev) => [...prev, res.body]);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch {
      // silent
    } finally {
      setSending(false);
    }
  }, [api, commentText, postId, sending]);

  if (loading) {
    return <PostDetailSkeleton />;
  }

  if (error || !post) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error ?? t('postDetail.loadError')}</Text>
      </View>
    );
  }

  const sectionHeader = (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{t('postDetail.commentsSection')}</Text>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={80}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('postDetail.title')}</Text>
      </View>
      <FlatList
        ref={listRef}
        data={comments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#1976D2']} tintColor="#1976D2" />
        }
        ListHeaderComponent={
          <>
            <PostBody post={post} mediaUrls={mediaUrls} />
            {sectionHeader}
          </>
        }
        renderItem={({ item }) => <CommentCard item={item} smallAvatar t={t} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('comments.empty')}</Text>
          </View>
        }
      />
      <CommentInputRow
        value={commentText}
        onChangeText={setCommentText}
        onSend={handleSend}
        sending={sending}
        t={t}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: sharedStyles.container,
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: sharedStyles.header,
  headerTitle: sharedStyles.headerTitle,
  listContent: sharedStyles.listContent,
  postCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  avatarCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  commentAvatar: { width: 28, height: 28, borderRadius: 14 },
  avatarText: sharedStyles.avatarText,
  authorText: { flex: 1, fontSize: 14, color: COLORS.textSecondary, fontWeight: '500', textAlign: 'auto' },
  typeBadge: { backgroundColor: COLORS.primaryXLight, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  typeText: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },
  bodyText: { fontSize: 16, color: COLORS.textPrimary, lineHeight: 24, textAlign: 'auto', marginBottom: 8 },
  postDate: { fontSize: 12, color: COLORS.textMuted, textAlign: 'auto', marginBottom: 10 },
  imageStrip: { marginBottom: 10, marginHorizontal: -14 },
  imageStripContent: { paddingHorizontal: 14, gap: 8 },
  detailImage: { width: 240, height: 180, borderRadius: 10 },
  shareBtn: { alignSelf: 'flex-start', backgroundColor: COLORS.inputBg, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  shareBtnText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '500' },
  sectionHeader: { paddingHorizontal: 4, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border, marginBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#333', textAlign: 'auto' },
  commentCard: sharedStyles.commentCard,
  commentHeader: sharedStyles.commentHeader,
  commentMeta: sharedStyles.commentMeta,
  commentAuthor: sharedStyles.commentAuthor,
  commentDate: sharedStyles.commentDate,
  commentBody: sharedStyles.commentBody,
  commentActions: sharedStyles.commentActions,
  commentActionBtn: sharedStyles.commentActionBtn,
  commentActionBtnActive: sharedStyles.commentActionBtnActive,
  commentActionText: sharedStyles.commentActionText,
  commentActionTextActive: sharedStyles.commentActionTextActive,
  emptyContainer: { alignItems: 'center', paddingTop: 40 },
  emptyText: sharedStyles.emptyText,
  errorText: { fontSize: 15, color: COLORS.error, textAlign: 'center', padding: 16 },
  inputRow: sharedStyles.inputRow,
  input: sharedStyles.input,
  sendBtn: sharedStyles.sendBtn,
  sendBtnDisabled: sharedStyles.sendBtnDisabled,
  sendBtnText: sharedStyles.sendBtnText,
});
