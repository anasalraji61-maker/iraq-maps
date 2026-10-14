import { type DiscoverPostType } from '@iraq-maps/contracts';
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
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { type z } from 'zod';
import { DiscoverComment } from '@iraq-maps/contracts';
import { useDiscoverClient } from '../client';
import { t } from '../strings';

I18nManager.forceRTL(true);

type DiscoverCommentType = z.infer<typeof DiscoverComment>;

const TYPE_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  photo: { bg: '#E3F2FD', text: '#1976D2' },
  tip:   { bg: '#E8F5E9', text: '#388E3C' },
  event: { bg: '#FFF3E0', text: '#F57C00' },
  offer: { bg: '#FFEBEE', text: '#D32F2F' },
};

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return '< 1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function PostBody({ post }: { post: DiscoverPostType }): ReactElement {
  const badgeColors = TYPE_BADGE_COLORS[post.type] ?? { bg: '#E3F2FD', text: '#1976D2' };

  const handleShare = useCallback(() => {
    const message = t('post.shareText', { body: post.body, postId: post.id });
    void Share.share({ message });
  }, [post.body, post.id]);

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
      <Text style={styles.bodyText}>{post.body}</Text>
      <Text style={styles.postDate}>{formatRelativeTime(post.createdAt)}</Text>
      <Pressable style={styles.shareBtn} onPress={handleShare} accessibilityRole="button">
        <Text style={styles.shareBtnText}>{t('post.share')}</Text>
      </Pressable>
    </View>
  );
}

function CommentRow({ item }: { item: DiscoverCommentType }): ReactElement {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);

  const handleLike = useCallback(() => {
    setLiked((prev) => !prev);
    setLikeCount((prev) => (liked ? prev - 1 : prev + 1));
  }, [liked]);

  return (
    <View style={styles.commentCard}>
      <View style={styles.commentHeader}>
        <View style={[styles.avatarCircle, styles.commentAvatar]}>
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
        <Pressable style={styles.commentActionBtn} accessibilityRole="button" accessibilityLabel={t('comments.replyA11y')}>
          <Text style={styles.commentActionText}>{t('comments.replyComment')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function PostDetailScreen(): ReactElement {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const api = useDiscoverClient();
  const [post, setPost] = useState<DiscoverPostType | undefined>();
  const [comments, setComments] = useState<DiscoverCommentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (!postId) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(undefined);
    try {
      const [feedRes, commentsRes] = await Promise.all([
        api.listFeed({ query: { limit: 1 } }),
        api.listComments({ params: { postId }, query: { limit: 20 } }),
      ]);
      if (feedRes.status === 200) {
        const found = feedRes.body.items.find((p) => p.id === postId);
        if (found) setPost(found);
      }
      if (commentsRes.status === 200) {
        setComments(commentsRes.body.items);
      }
    } catch {
      setError(t('postDetail.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api, postId]);

  useEffect(() => { void loadData(false); }, [loadData]);

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
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
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
            <PostBody post={post} />
            {sectionHeader}
          </>
        }
        renderItem={({ item }) => <CommentRow item={item} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('comments.empty')}</Text>
          </View>
        }
      />
      <View style={styles.inputRow}>
        <TextInput
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
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    backgroundColor: '#1976D2',
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '600' },
  listContent: { padding: 12, paddingBottom: 8 },
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
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1976D2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatar: { width: 28, height: 28, borderRadius: 14 },
  avatarText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  authorText: { flex: 1, fontSize: 14, color: '#555', fontWeight: '500', textAlign: 'auto' },
  typeBadge: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  typeText: { fontSize: 12, color: '#1976D2', fontWeight: '600' },
  bodyText: {
    fontSize: 16,
    color: '#222',
    lineHeight: 24,
    textAlign: 'auto',
    marginBottom: 8,
  },
  postDate: { fontSize: 12, color: '#999', textAlign: 'auto', marginBottom: 10 },
  shareBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  shareBtnText: { fontSize: 13, color: '#555', fontWeight: '500' },
  sectionHeader: {
    paddingHorizontal: 4,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DDD',
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#333', textAlign: 'auto' },
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
  commentMeta: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  commentAuthor: { fontSize: 13, color: '#1976D2', fontWeight: '600', textAlign: 'auto' },
  commentDate: { fontSize: 11, color: '#999' },
  commentBody: {
    fontSize: 14,
    color: '#222',
    lineHeight: 20,
    textAlign: 'auto',
    marginBottom: 8,
  },
  commentActions: { flexDirection: 'row', gap: 8 },
  commentActionBtn: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#F0F0F0',
  },
  commentActionBtnActive: { backgroundColor: '#BBDEFB' },
  commentActionText: { fontSize: 12, color: '#555', fontWeight: '500' },
  commentActionTextActive: { color: '#1565C0' },
  emptyContainer: { alignItems: 'center', paddingTop: 40 },
  emptyText: { fontSize: 15, color: '#999' },
  errorText: { fontSize: 15, color: '#C62828', textAlign: 'center', padding: 16 },
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
  sendBtnDisabled: { backgroundColor: '#B0BEC5' },
  sendBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
});
