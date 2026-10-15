import { DiscoverComment } from '@iraq-maps/contracts';
import { useSession } from '@iraq-maps/mobile-kit';
import { type z } from 'zod';
import { useLocalSearchParams } from 'expo-router';
import { useState, useCallback, useEffect, useRef, type ReactElement } from 'react';
import {
  Animated,
  FlatList,
  I18nManager,
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
import { sharedStyles, COLORS, CommentCard, CommentInputRow } from './shared';

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
  const currentUserId = session?.state.status === 'signedIn' ? session.state.user.id : undefined;
  const [comments, setComments] = useState<DiscoverCommentType[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [commentText, setCommentText] = useState('');
  const [replyingToAuthor, setReplyingToAuthor] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | undefined>();
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

  useEffect(() => { void loadComments(false); }, [loadComments]);

  const handleRefresh = useCallback(() => { void loadComments(true); }, [loadComments]);

  const handleReply = useCallback((authorId: string) => {
    setReplyingToAuthor(authorId);
    const prefix = `@${authorId} `;
    setCommentText(prefix);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleSend = useCallback(async () => {
    const text = commentText.trim();
    if (!text || sending || !postId) return;
    setSending(true);
    setSendError(undefined);
    try {
      const res = await api.createComment({ params: { postId }, body: { body: text } });
      if (res.status === 201) {
        setCommentText('');
        setComments((prev) => [...prev, res.body]);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      } else {
        setSendError(t('comments.sendError'));
      }
    } catch {
      setSendError(t('comments.sendError'));
    } finally {
      setSending(false);
    setReplyingToAuthor(null);
    }
  }, [api, commentText, postId, sending]);

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
        data={comments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#1976D2']} tintColor="#1976D2" />
        }
        renderItem={({ item }) => <CommentCard item={item} onReply={handleReply} onDelete={(id) => { void handleDeleteComment(id); }} currentUserId={currentUserId} t={t} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>{t('comments.empty')}</Text>
            </View>
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
      <CommentInputRow
        value={commentText}
        onChangeText={setCommentText}
        onSend={handleSend}
        sending={sending}
        inputRef={inputRef}
        t={t}
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
});
