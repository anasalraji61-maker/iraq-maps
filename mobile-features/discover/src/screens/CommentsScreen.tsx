import { DiscoverComment } from '@iraq-maps/contracts';
import { useHaptics, useSession } from '@iraq-maps/mobile-kit';
import { type z } from 'zod';
import { useLocalSearchParams } from 'expo-router';
import { useState, useCallback, useEffect, useRef, type ReactElement } from 'react';
import {
  FlatList,
  I18nManager,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useDiscoverClient } from '../client';
import { t } from '../strings';
import { sharedStyles, COLORS, CommentCard, CommentInputRow, SkeletonBlock } from './shared';
import { GifPicker } from './GifPicker';
import type { MockGif } from '../mockGifs';

I18nManager.forceRTL(true);

// ─── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonCommentRow(): ReactElement {
  return (
    <View testID="skeleton-comment-row" style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <SkeletonBlock width={28} height={28} />
        <SkeletonBlock width={70} height={12} />
      </View>
      <SkeletonBlock width={220} height={12} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

type DiscoverCommentType = z.infer<typeof DiscoverComment>;


export function CommentsScreen(): ReactElement {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const api = useDiscoverClient();
  const session = useSession();
  const haptics = useHaptics();
  const currentUserId = session?.state.status === 'signedIn' ? session.state.user.id : undefined;
  const [comments, setComments] = useState<DiscoverCommentType[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [commentText, setCommentText] = useState('');
  const [replyingToAuthor, setReplyingToAuthor] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | undefined>();
  const [gifPickerVisible, setGifPickerVisible] = useState(false);
  const [selectedGif, setSelectedGif] = useState<MockGif | null>(null);
  const [pinnedCommentId, setPinnedCommentId] = useState<string | undefined>();
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput | null>(null);

  const loadComments = useCallback(async (isRefresh = false) => {
    if (!postId) return;
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(undefined);
    try {
      const res = await api.listComments({ params: { postId }, query: { limit: 20 } });
      if (res.status === 200) {
        setComments(res.body.items);
        setNextCursor(res.body.nextCursor);
      } else {
        setError(t('comments.loadError'));
      }
    } catch {
      setError(t('comments.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api, postId]);

  const loadMore = useCallback(async () => {
    if (!postId || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.listComments({ params: { postId }, query: { limit: 20, cursor: nextCursor } });
      if (res.status === 200) {
        setComments((prev) => [...prev, ...res.body.items]);
        setNextCursor(res.body.nextCursor);
      }
    } catch {
      // silent
    } finally {
      setLoadingMore(false);
    }
  }, [api, nextCursor, postId, loadingMore]);

  useEffect(() => { void loadComments(false); }, [loadComments]);

  const handleRefresh = useCallback(() => { void loadComments(true); }, [loadComments]);

  const handleReply = useCallback((authorId: string) => {
    setReplyingToAuthor(authorId);
    const prefix = `@${authorId} `;
    setCommentText(prefix);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleGifSelect = useCallback((gif: MockGif) => {
    setSelectedGif(gif);
    setGifPickerVisible(false);
  }, []);

  const handlePinComment = useCallback((commentId: string) => {
    // Local-only pin state — no API until endpoint is added to contracts
    setPinnedCommentId((prev) => (prev === commentId ? undefined : commentId));
  }, []);

  const handleSend = useCallback(async () => {
    const text = commentText.trim();
    if ((!text && !selectedGif) || sending || !postId) return;
    haptics.sent();
    setSending(true);
    setSendError(undefined);
    const bodyText = selectedGif ? `${text} ${selectedGif.url}`.trim() : text;
    try {
      const res = await api.createComment({ params: { postId }, body: { body: bodyText } });
      if (res.status === 201) {
        setCommentText('');
        setSelectedGif(null);
        setComments((prev) => [...prev, res.body]);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      } else {
        haptics.fail();
        setSendError(t('comments.sendError'));
      }
    } catch {
      haptics.fail();
      setSendError(t('comments.sendError'));
    } finally {
      setSending(false);
    setReplyingToAuthor(null);
    }
  }, [api, commentText, haptics, postId, sending]);

  const handleDeleteComment = useCallback(async (commentId: string) => {
    try {
      const res = await api.deleteComment({ params: { postId: postId ?? '', commentId } });
      if (res.status === 204) {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      } else {
        // Show error silently
      }
    } catch {
      // Show nothing — best effort
    }
  }, [api, postId]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={80}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('comments.title')}</Text>
      </View>

      {loading ? (
        <View>{[1, 2, 3, 4].map((k) => <SkeletonCommentRow key={k} />)}</View>
      ) : null}

      {error ? (
        <View style={styles.errorRow}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        data={[
          ...comments.filter((c) => c.id === pinnedCommentId),
          ...comments.filter((c) => c.id !== pinnedCommentId),
        ]}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} />
        }
        renderItem={({ item }) => (
          <View>
            {item.id === pinnedCommentId ? (
              <View style={styles.pinnedBanner}>
                <Text style={styles.pinnedBannerText}>{t('commentPin.pinnedLabel')}</Text>
              </View>
            ) : null}
            <CommentCard
              item={item}
              onReply={handleReply}
              onDelete={(id) => { void handleDeleteComment(id); }}
              onPin={(id) => handlePinComment(id)}
              pinnedCommentId={pinnedCommentId}
              currentUserId={currentUserId}
              t={t}
            />
          </View>
        )}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>{t('comments.empty')}</Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          nextCursor ? (
            <Pressable
              testID="comments.loadMore"
              style={styles.loadMoreBtn}
              onPress={() => { void loadMore(); }}
              disabled={loadingMore}
              accessibilityRole="button"
              accessibilityLabel={t('feed.loadMore')}
            >
              <Text style={styles.loadMoreText}>{loadingMore ? '...' : t('feed.loadMore')}</Text>
            </Pressable>
          ) : null
        }
      />

      {sendError ? (
        <View style={styles.sendErrorRow}>
          <Text style={styles.errorText}>{sendError}</Text>
        </View>
      ) : null}

      {replyingToAuthor ? (
        <View style={styles.replyBanner}>
          <Text style={styles.replyBannerText}>{t('comments.replyingTo', { author: replyingToAuthor })}</Text>
          <Pressable
            onPress={() => { setReplyingToAuthor(null); setCommentText(''); }}
            accessibilityRole="button"
            accessibilityLabel={t('comments.cancelReply')}
          >
            <Text style={styles.replyBannerClose}>{t('comments.cancelReplyIcon')}</Text>
          </Pressable>
        </View>
      ) : null}

      {selectedGif ? (
        <View style={styles.gifPreviewRow}>
          <Image source={{ uri: selectedGif.thumbUrl }} style={styles.gifPreview} resizeMode="cover" />
          <Pressable
            style={styles.gifRemoveBtn}
            onPress={() => setSelectedGif(null)}
            accessibilityRole="button"
            accessibilityLabel={t('video.removeVideo')}
          >
            <Text style={styles.gifRemoveText}>{t('create.removePhoto')}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.inputToolbar}>
        <Pressable
          style={styles.gifBtn}
          onPress={() => setGifPickerVisible(true)}
          accessibilityRole="button"
          accessibilityLabel={t('gif.addGif')}
        >
          <Text style={styles.gifBtnText}>{t('gif.label')}</Text>
        </Pressable>
        <View style={styles.inputFlex}>
          <CommentInputRow
            value={commentText}
            onChangeText={setCommentText}
            onSend={handleSend}
            sending={sending}
            inputRef={inputRef}
            t={t}
          />
        </View>
      </View>

      <GifPicker
        visible={gifPickerVisible}
        onClose={() => setGifPickerVisible(false)}
        onSelect={handleGifSelect}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: sharedStyles.container,
  header: sharedStyles.header,
  headerTitle: sharedStyles.headerTitle,
  loadingIndicator: { paddingVertical: 20 },
  errorRow: sharedStyles.errorRow,
  sendErrorRow: { backgroundColor: COLORS.errorBg, paddingHorizontal: 16, paddingVertical: 6 },
  errorText: sharedStyles.errorText,
  listContent: sharedStyles.listContent,
  commentCard: sharedStyles.commentCard,
  commentHeader: sharedStyles.commentHeader,
  avatarCircle: sharedStyles.avatarCircle,
  avatarText: sharedStyles.avatarText,
  commentMeta: sharedStyles.commentMeta,
  commentAuthor: sharedStyles.commentAuthor,
  commentDate: sharedStyles.commentDate,
  commentBody: sharedStyles.commentBody,
  commentActions: sharedStyles.commentActions,
  commentActionBtn: sharedStyles.commentActionBtn,
  commentActionBtnActive: sharedStyles.commentActionBtnActive,
  commentActionText: sharedStyles.commentActionText,
  commentActionTextActive: sharedStyles.commentActionTextActive,
  emptyContainer: sharedStyles.emptyContainer,
  emptyText: sharedStyles.emptyText,
  inputRow: sharedStyles.inputRow,
  input: sharedStyles.input,
  sendBtn: sharedStyles.sendBtn,
  sendBtnDisabled: sharedStyles.sendBtnDisabled,
  sendBtnText: sharedStyles.sendBtnText,
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: COLORS.primaryXLight,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.primaryLight,
  },
  replyBannerText: { fontSize: 12, color: COLORS.primaryDark, flex: 1 },
  replyBannerClose: { fontSize: 14, color: '#666', paddingHorizontal: 6 },
  loadMoreBtn: { alignItems: 'center', paddingVertical: 12 },
  loadMoreText: { fontSize: 14, color: COLORS.primary, fontWeight: '500' },
  pinnedBanner: {
    backgroundColor: COLORS.primaryXLight,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  pinnedBannerText: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '600',
  },
  inputToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  inputFlex: { flex: 1 },
  gifBtn: {
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  gifBtnText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '700',
  },
  gifPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: COLORS.inputBg,
  },
  gifPreview: {
    width: 60,
    height: 45,
    borderRadius: 6,
  },
  gifRemoveBtn: {
    marginStart: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.errorBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gifRemoveText: {
    fontSize: 11,
    color: COLORS.error,
    fontWeight: '700',
  },
});
