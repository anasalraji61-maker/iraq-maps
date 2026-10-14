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

I18nManager.forceRTL(true);

type DiscoverCommentType = z.infer<typeof DiscoverComment>;

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return '< 1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function CommentItem({ item, onReply }: { item: DiscoverCommentType; onReply: (authorId: string) => void }): ReactElement {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);

  const handleLike = useCallback(() => {
    setLiked((prev) => !prev);
    setLikeCount((prev) => (liked ? prev - 1 : prev + 1));
  }, [liked]);

  const handleReply = useCallback(() => {
    onReply(item.authorId.slice(0, 8));
  }, [item.authorId, onReply]);

  return (
    <View style={styles.commentCard}>
      <View style={styles.commentHeader}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{item.authorId.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={styles.commentMeta}>
          <Text style={styles.commentAuthor}>{item.authorId.slice(0, 8)}</Text>
          <Text style={styles.commentDate}>{formatRelativeTime(item.createdAt)}</Text>
        </View>
      </View>
      <Text style={styles.commentBody}>{item.body}</Text>
      <View style={styles.commentActions}>
        <Pressable
          style={[styles.commentActionBtn, liked && styles.commentActionBtnActive]}
          onPress={handleLike}
          accessibilityRole="button"
          accessibilityLabel={t('comments.likeA11y')}
        >
          <Text style={[styles.commentActionText, liked && styles.commentActionTextActive]}>
            {t('comments.likeComment')}{likeCount > 0 ? ` ${likeCount}` : ''}
          </Text>
        </Pressable>
        <Pressable
          style={styles.commentActionBtn}
          onPress={handleReply}
          accessibilityRole="button"
          accessibilityLabel={t('comments.replyA11y')}
        >
          <Text style={styles.commentActionText}>{t('comments.replyComment')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

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
        renderItem={({ item }) => <CommentItem item={item} onReply={handleReply} />}
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
            <Text style={styles.replyBannerClose}>✕</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={commentText}
          onChangeText={(text) => setCommentText(text.slice(0, 500))}
          placeholder={t('comments.placeholder')}
          placeholderTextColor="#999"
          multiline
          maxLength={500}
        />
        <Pressable
          style={[styles.sendBtn, (!commentText.trim() || sending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!commentText.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Text style={styles.sendBtnText}>{t('comments.send')}</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: '#1976D2',
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  loadingIndicator: {
    paddingVertical: 20,
  },
  errorRow: {
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sendErrorRow: {
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  errorText: {
    color: '#C62828',
    fontSize: 13,
    textAlign: 'auto',
  },
  listContent: {
    padding: 12,
    paddingBottom: 8,
  },
  commentCard: {
    backgroundColor: '#FFF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1976D2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  commentMeta: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  commentAuthor: {
    fontSize: 13,
    color: '#1976D2',
    fontWeight: '600',
    textAlign: 'auto',
  },
  commentDate: {
    fontSize: 11,
    color: '#999',
    textAlign: 'auto',
  },
  commentBody: {
    fontSize: 14,
    color: '#222',
    lineHeight: 20,
    textAlign: 'auto',
    marginBottom: 8,
  },
  commentActions: {
    flexDirection: 'row',
    gap: 8,
  },
  commentActionBtn: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#F0F0F0',
  },
  commentActionBtnActive: {
    backgroundColor: '#BBDEFB',
  },
  commentActionText: {
    fontSize: 12,
    color: '#555',
    fontWeight: '500',
  },
  commentActionTextActive: {
    color: '#1565C0',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 15,
    color: '#999',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 8,
    backgroundColor: '#FFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DDD',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: '#F0F0F0',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    textAlign: 'auto',
    color: '#222',
  },
  sendBtn: {
    backgroundColor: '#1976D2',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 64,
  },
  sendBtnDisabled: {
    backgroundColor: '#B0BEC5',
  },
  sendBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#E3F2FD',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#BBDEFB',
  },
  replyBannerText: {
    fontSize: 12,
    color: '#1565C0',
    flex: 1,
  },
  replyBannerClose: {
    fontSize: 14,
    color: '#666',
    paddingHorizontal: 6,
  },
});
