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
import { formatRelativeTime, getTypeBadgeColors, sharedStyles, COLORS, CommentCard, CommentInputRow } from './shared';

I18nManager.forceRTL(true);

type DiscoverCommentType = z.infer<typeof DiscoverComment>;

function PostBody({ post }: { post: DiscoverPostType }): ReactElement {
  const badgeColors = getTypeBadgeColors(post.type);

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


export function PostDetailScreen(): ReactElement {
  const { postId, postJson } = useLocalSearchParams<{ postId: string; postJson?: string }>();
  const api = useDiscoverClient();

  // Parse post from navigation params (passed by DiscoverFeedScreen to avoid a redundant feed fetch)
  const initialPost = postJson ? (() => { try { return JSON.parse(postJson) as DiscoverPostType; } catch { return undefined; } })() : undefined;

  const [post] = useState<DiscoverPostType | undefined>(initialPost);
  const [comments, setComments] = useState<DiscoverCommentType[]>([]);
  const [loading, setLoading] = useState(!initialPost);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);
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
