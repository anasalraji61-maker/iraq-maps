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
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useDiscoverClient } from '../client';
import { t } from '../strings';

I18nManager.forceRTL(true);

type DiscoverCommentType = z.infer<typeof DiscoverComment>;

export function CommentsScreen(): ReactElement {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const api = useDiscoverClient();
  const [comments, setComments] = useState<DiscoverCommentType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | undefined>();
  const listRef = useRef<FlatList>(null);

  const loadComments = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
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
    }
  }, [api, postId]);

  useEffect(() => { void loadComments(); }, [loadComments]);

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
        renderItem={({ item }) => (
          <View style={styles.commentCard}>
            <Text style={styles.commentAuthor}>{item.authorId.slice(0, 8)}</Text>
            <Text style={styles.commentBody}>{item.body}</Text>
            <Text style={styles.commentDate}>{item.createdAt.slice(0, 10)}</Text>
          </View>
        )}
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
  commentAuthor: {
    fontSize: 12,
    color: '#1976D2',
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'auto',
  },
  commentBody: {
    fontSize: 14,
    color: '#222',
    lineHeight: 20,
    textAlign: 'auto',
    marginBottom: 4,
  },
  commentDate: {
    fontSize: 11,
    color: '#999',
    textAlign: 'auto',
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
});
