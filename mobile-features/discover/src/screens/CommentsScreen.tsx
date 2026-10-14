import { DiscoverComment } from '@iraq-maps/contracts';
import { type z } from 'zod';
import { useLocalSearchParams } from 'expo-router';
import { useState, useCallback, useEffect, useRef, type ReactElement } from 'react';
import {
  ActivityIndicator,
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

type DiscoverCommentType = z.infer<typeof DiscoverComment>;


export function CommentsScreen(): ReactElement {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const api = useDiscoverClient();
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
        <ActivityIndicator style={styles.loadingIndicator} size="large" color="#1976D2" />
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
        renderItem={({ item }) => <CommentCard item={item} onReply={handleReply} t={t} />}
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
