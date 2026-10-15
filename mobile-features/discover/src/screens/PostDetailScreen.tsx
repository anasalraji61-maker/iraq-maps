import { type DiscoverPostType } from '@iraq-maps/contracts';
import { useApi, useSession } from '@iraq-maps/mobile-kit';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useCallback, useEffect, useRef, type ReactElement } from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  Alert,
  FlatList,
  I18nManager,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { type z } from 'zod';
import { DiscoverComment } from '@iraq-maps/contracts';
import { ZoomableImage } from '@iraq-maps/ui';
import { useDiscoverClient } from '../client';
import { t } from '../strings';
import { formatRelativeTime, getTypeBadgeColors, sharedStyles, COLORS, CommentCard, CommentInputRow, HashtagText, SkeletonBlock, TypingIndicator } from './shared';

I18nManager.forceRTL(true);

// ─── Skeleton ────────────────────────────────────────────────────────────────

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

function PostBody({ post, mediaUrls, onHashtagPress, isOwn, onMorePress, onReportPress }: { post: DiscoverPostType; mediaUrls: Readonly<Record<string, string>>; onHashtagPress: (tag: string) => void; isOwn: boolean; onMorePress: () => void; onReportPress: () => void }): ReactElement {
  const badgeColors = getTypeBadgeColors(post.type);
  const [linkCopied, setLinkCopied] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const handleShare = useCallback(() => {
    const message = t('post.shareText', { body: post.body, postId: post.id });
    void Share.share({ message });
  }, [post.body, post.id]);

  const handleCopyLink = useCallback(() => {
    const link = `iraqsmartmaps://discover/${post.id}`;
    void Clipboard.setStringAsync(link).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }, [post.id]);

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
            <ZoomableImage key={img.id} source={{ uri: img.url }} style={styles.detailImage} resizeMode="cover" />
          ))}
        </ScrollView>
      )}
      <Pressable
        onLongPress={() => {
          void Clipboard.setStringAsync(post.body).then(() => {
            setCopyFeedback(t('postDetail.bodyCopied'));
            setTimeout(() => setCopyFeedback(null), 2000);
          });
        }}
        accessibilityHint={t('postDetail.bodyLongPressHint')}
      >
        <HashtagText text={post.body} style={styles.bodyText} onHashtagPress={onHashtagPress} />
      </Pressable>
      {copyFeedback ? <Text style={styles.copyFeedback}>{copyFeedback}</Text> : null}
      <Text style={styles.postDate}>{formatRelativeTime(post.createdAt)}</Text>
      <View style={styles.actionRow}>
        <Pressable style={styles.shareBtn} onPress={handleShare} accessibilityRole="button" accessibilityLabel={t('post.share')}>
          <Text style={styles.shareBtnText}>{t('post.share')}</Text>
        </Pressable>
        <Pressable
          style={styles.shareBtn}
          onPress={handleCopyLink}
          accessibilityRole="button"
          accessibilityLabel={t('postDetail.copyLink')}
          testID={`post.copyLink.${post.id}`}
        >
          <Text style={styles.shareBtnText}>{linkCopied ? t('postDetail.linkCopied') : t('postDetail.copyLink')}</Text>
        </Pressable>
        {isOwn ? (
          <Pressable
            style={styles.shareBtn}
            onPress={onMorePress}
            accessibilityRole="button"
            accessibilityLabel={t('post.more')}
            testID={`post.more.${post.id}`}
          >
            <Text style={styles.shareBtnText}>{t('post.moreIcon')}</Text>
          </Pressable>
        ) : (
          <Pressable
            style={styles.shareBtn}
            onPress={onReportPress}
            accessibilityRole="button"
            accessibilityLabel={t('postDetail.report')}
            testID={`post.report.${post.id}`}
          >
            <Text style={styles.shareBtnText}>{t('postDetail.report')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}


export function PostDetailScreen(): ReactElement {
  const { postId, postJson } = useLocalSearchParams<{ postId: string; postJson?: string }>();
  const api = useDiscoverClient();
  const extApi = useApi();
  const router = useRouter();
  const session = useSession();
  const currentUserId = session.state.status === 'signedIn' ? session.state.user.id : undefined;
  const handleHashtagPress = useCallback((tag: string) => {
    router.push({ pathname: '/discover/hashtag/[tag]', params: { tag: tag.slice(1) } });
  }, [router]);

  // Parse post from navigation params (passed by DiscoverFeedScreen to avoid a redundant feed fetch)
  const initialPost = postJson ? (() => { try { return JSON.parse(postJson) as DiscoverPostType; } catch { return undefined; } })() : undefined;

  const [post, setPost] = useState<DiscoverPostType | undefined>(initialPost);
  const [editVisible, setEditVisible] = useState(false);
  const [editBody, setEditBody] = useState('');
  const [editSaving, setEditSaving] = useState(false);
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
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(undefined);
    try {
      // If we don't have the post (came from a deep link), fetch it first
      const [postRes, commentsRes] = await Promise.all([
        post && !isRefresh ? null : api.getPost({ params: { postId } }),
        api.listComments({ params: { postId }, query: { limit: 20 } }),
      ]);
      if (postRes && postRes.status === 200) setPost(postRes.body);
      if (commentsRes.status === 200) setComments(commentsRes.body.items);
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

  const handleLikeComment = useCallback((commentId: string, currentlyLiked: boolean) => {
    const fn = currentlyLiked
      ? api.unlikeComment({ params: { commentId: commentId as Parameters<typeof api.unlikeComment>[0]['params']['commentId'] } })
      : api.likeComment({ params: { commentId: commentId as Parameters<typeof api.likeComment>[0]['params']['commentId'] }, body: {} });
    void fn.then((res) => {
      if (res.status === 200) {
        setComments((prev) =>
          prev.map((c) =>
            c.id === commentId
              ? { ...c, likeCount: res.body.likeCount, isLikedByMe: !currentlyLiked }
              : c,
          ),
        );
      }
    }).catch(() => { /* silent */ });
  }, [api]);

  const handleSend = useCallback(async () => {
    const text = commentText.trim();
    if (!text || sending || !postId) return;
    setSending(true);
    try {
      const res = await api.createComment({ params: { postId }, body: { body: text } });
      if (res.status === 201) {
        setCommentText('');
        setComments((prev) => [...prev, res.body]);
        setPost((prev) => prev ? { ...prev, commentCount: prev.commentCount + 1 } : prev);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch {
      // silent
    } finally {
      setSending(false);
    }
  }, [api, commentText, postId, sending]);

  const handleMorePress = useCallback(() => {
    if (!post) return;
    Alert.alert(
      t('post.more'),
      undefined,
      [
        {
          text: t('post.edit'),
          onPress: () => { setEditBody(post.body); setEditVisible(true); },
        },
        {
          text: t('post.delete'),
          style: 'destructive' as const,
          onPress: () => Alert.alert(
            t('post.deleteConfirmTitle'),
            t('post.deleteConfirmMsg'),
            [
              { text: t('post.reportCancel'), style: 'cancel' as const },
              {
                text: t('post.deleteConfirmOk'),
                style: 'destructive' as const,
                onPress: () => {
                  void api.deletePost({ params: { postId: post.id } }).then(() => router.back()).catch(() => Alert.alert(t('post.deleteError')));
                },
              },
            ],
          ),
        },
        { text: t('post.reportCancel'), style: 'cancel' as const },
      ],
    );
  }, [post, api, router]);

  const handleDeleteComment = useCallback((commentId: string) => {
    if (!post) return;
    Alert.alert(
      t('postDetail.deleteCommentTitle'),
      t('postDetail.deleteCommentMsg'),
      [
        { text: t('post.reportCancel'), style: 'cancel' as const },
        {
          text: t('post.deleteConfirmOk'),
          style: 'destructive' as const,
          onPress: () => {
            void api.deleteComment({ params: { postId: post.id, commentId: commentId as Parameters<typeof api.deleteComment>[0]['params']['commentId'] } }).then((res) => {
              if (res.status === 204) {
                setComments((prev) => prev.filter((c) => c.id !== commentId));
                setPost((prev) => prev ? { ...prev, commentCount: Math.max(0, prev.commentCount - 1) } : prev);
              }
            }).catch(() => { /* silent */ });
          },
        },
      ],
    );
  }, [post, api]);

  const handleReportPress = useCallback(() => {
    if (!post) return;
    const reasons = ['spam', 'inappropriate', 'misinformation', 'other'] as const;
    Alert.alert(
      t('postDetail.reportTitle'),
      t('postDetail.reportBody'),
      [
        ...reasons.map((reason) => ({
          text: t(`postDetail.reason_${reason}`),
          onPress: () => {
            void extApi.discover.reportPost({ params: { postId: post.id }, body: { reason } }).catch(() => {
              Alert.alert(t('postDetail.reportError'));
            });
          },
        })),
        { text: t('post.reportCancel'), style: 'cancel' as const },
      ],
    );
  }, [post, extApi]);

  const handleSaveEdit = useCallback(async () => {
    if (!post || editBody.trim().length === 0) return;
    setEditSaving(true);
    try {
      const res = await api.updatePost({ params: { postId: post.id }, body: { body: editBody.trim() } });
      if (res.status === 200) {
        setPost((prev) => prev ? { ...prev, body: res.body.body } : prev);
        setEditVisible(false);
      } else {
        Alert.alert(t('post.editError'));
      }
    } catch {
      Alert.alert(t('post.editError'));
    } finally {
      setEditSaving(false);
    }
  }, [api, post, editBody]);

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
    <>
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
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} />
        }
        ListHeaderComponent={
          <>
            <PostBody post={post} mediaUrls={mediaUrls} onHashtagPress={handleHashtagPress} isOwn={currentUserId === post.authorId} onMorePress={handleMorePress} onReportPress={handleReportPress} />
            {sectionHeader}
          </>
        }
        renderItem={({ item }) => <CommentCard item={item} onLike={handleLikeComment} onDelete={handleDeleteComment} currentUserId={currentUserId ?? undefined} smallAvatar t={t} />}
        ListFooterComponent={commentText.trim().length > 0 ? <TypingIndicator t={t} /> : null}
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
    <Modal
      visible={editVisible} animationType="slide" transparent onRequestClose={() => setEditVisible(false)}>
      <View style={styles.editOverlay}>
        <View style={styles.editSheet}>
          <Text style={styles.editTitle}>{t('post.editTitle')}</Text>
          <TextInput
            style={styles.editInput}
            value={editBody}
            onChangeText={setEditBody}
            multiline
            maxLength={1000}
            placeholder={t('post.editPlaceholder')}
            accessibilityLabel={t('post.editTitle')}
            testID="post.editInput"
          />
          <Text style={styles.editCharCount}>{t('post.editCharCount', { n: 1000 - editBody.length })}</Text>
          <View style={styles.editActions}>
            <Pressable style={[styles.shareBtn, styles.editCancelBtn]} onPress={() => setEditVisible(false)} accessibilityRole="button">
              <Text style={styles.shareBtnText}>{t('post.editCancel')}</Text>
            </Pressable>
            <Pressable
              style={editSaving || editBody.trim().length === 0 ? [styles.shareBtn, styles.editSaveBtn, styles.editSaveBtnDisabled] : [styles.shareBtn, styles.editSaveBtn]}
              onPress={() => void handleSaveEdit()}
              accessibilityRole="button"
              disabled={editSaving || editBody.trim().length === 0}
              testID="post.editSave"
            >
              <Text style={[styles.shareBtnText, { color: '#FFF' }]}>{t('post.editSave')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
    </>
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
  copyFeedback: { fontSize: 12, color: COLORS.primary ?? '#1976D2', textAlign: 'auto', marginBottom: 4 },
  imageStrip: { marginBottom: 10, marginHorizontal: -14 },
  imageStripContent: { paddingHorizontal: 14, gap: 8 },
  detailImage: { width: 240, height: 180, borderRadius: 10 },
  actionRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  shareBtn: { backgroundColor: COLORS.inputBg, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
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
  editOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  editSheet: { backgroundColor: '#FFF', borderTopStartRadius: 16, borderTopEndRadius: 16, padding: 20, gap: 12 },
  editTitle: { fontSize: 18, fontWeight: '600', color: COLORS.textPrimary, textAlign: 'auto' },
  editInput: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 12, fontSize: 16, minHeight: 100, textAlignVertical: 'top', textAlign: 'auto' },
  editCharCount: { fontSize: 12, color: COLORS.textMuted, textAlign: 'auto' },
  editActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  editCancelBtn: {},
  editSaveBtn: { backgroundColor: COLORS.primary },
  editSaveBtnDisabled: { backgroundColor: COLORS.border },
});
