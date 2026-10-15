/**
 * GroupDetailScreen – shows messages in a group and lets the user send.
 */
import { useLocalSearchParams } from 'expo-router';
import { type ReactElement, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  I18nManager,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useGroupsClient } from '../client';
import { t } from '../strings';
import type { GroupMessageType } from '@iraq-maps/contracts';
import { useSession } from '@iraq-maps/mobile-kit';

I18nManager.forceRTL(true);

export function GroupDetailScreen(): ReactElement {
  const { groupId, groupName } = useLocalSearchParams<{ groupId: string; groupName?: string }>();
  const client = useGroupsClient();
  const { userId } = useSession();
  const [messages, setMessages] = useState<GroupMessageType[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    if (!groupId) return;
    try {
      const res = await client.listGroupMessages({
        params: { groupId: groupId as never },
        query: {},
      });
      if (res.status === 200) {
        setMessages(res.body.items.slice().reverse());
      }
    } finally {
      setLoading(false);
    }
  }, [groupId, client]);

  useEffect(() => { load(); }, [load]);

  const handleSend = async () => {
    if (!text.trim() || !groupId) return;
    setSending(true);
    const draft = text.trim();
    setText('');
    try {
      const res = await client.sendGroupMessage({
        params: { groupId: groupId as never },
        body: { text: draft },
      });
      if (res.status === 201) {
        setMessages((prev) => [...prev, res.body]);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
      }
    } finally {
      setSending(false);
    }
  };

  const renderItem = ({ item }: { item: GroupMessageType }) => {
    const isOwn = item.senderId === userId;
    return (
      <View style={[styles.bubble, isOwn ? styles.ownBubble : styles.otherBubble]}>
        {!isOwn && (
          <Text style={styles.senderName}>{item.senderId.slice(0, 8)}</Text>
        )}
        <Text style={[styles.msgText, isOwn && styles.ownMsgText]}>{item.text}</Text>
        <Text style={[styles.time, isOwn && styles.ownTime]}>
          {/* eslint-disable-next-line i18next/no-literal-string */}
          {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={88}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{groupName ?? t('groups.title')}</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.empty}>{t('groups.messagesEmpty')}</Text>}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      {/* Compose bar */}
      <View style={styles.compose}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={t('groups.sendPlaceholder')}
          placeholderTextColor="#9E9E9E"
          multiline
          maxLength={2000}
          textAlign={I18nManager.isRTL ? 'right' : 'left'}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
          accessibilityRole="button"
          accessibilityLabel={t('groups.send')}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={styles.sendBtnText}>{t('groups.send')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  listContent: { padding: 12, gap: 8, flexGrow: 1 },
  empty: { color: '#9E9E9E', textAlign: 'center', padding: 24, marginTop: 40 },
  bubble: {
    maxWidth: '75%',
    padding: 10,
    borderRadius: 12,
    marginBottom: 4,
  },
  ownBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#2196F3',
    borderBottomEndRadius: 2,
  },
  otherBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF',
    borderBottomStartRadius: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  senderName: { fontSize: 11, color: '#1565C0', fontWeight: '600', marginBottom: 2 },
  msgText: { fontSize: 15, color: '#212121', lineHeight: 20 },
  ownMsgText: { color: '#FFF' },
  time: { fontSize: 10, color: '#9E9E9E', alignSelf: 'flex-end', marginTop: 2 },
  ownTime: { color: 'rgba(255,255,255,0.7)' },
  compose: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 8,
    backgroundColor: '#FFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: 15,
    backgroundColor: '#FAFAFA',
  },
  sendBtn: {
    backgroundColor: '#2196F3',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#BDBDBD' },
  sendBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
});
