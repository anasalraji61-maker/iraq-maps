import { assistantTestIDs } from '@iraq-maps/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useRef, useEffect, type ReactElement } from 'react';
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
import { useAssistantChat, loadPersistedSessionId } from '../hooks/useAssistantChat';
import { t } from '../strings';

// Force RTL for Arabic
I18nManager.forceRTL(true);

function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

export function AssistantChatScreen(): ReactElement {
  const [sessionId, setSessionId] = useState<string>(generateSessionId);
  const [inputText, setInputText] = useState('');
  const { messages, send, isLoading, composeParams, focusPlaceId, error } =
    useAssistantChat(sessionId);
  const router = useRouter();
  const listRef = useRef<FlatList>(null);
  const { initialMessage } = useLocalSearchParams<{ initialMessage?: string }>();
  const initialMessageSent = useRef(false);

  // Resume the persisted session on mount
  useEffect(() => {
    loadPersistedSessionId().then((saved) => {
      if (saved) setSessionId(saved);
    });
  }, []);

  // Auto-send initialMessage from deep-link (e.g. map search → assistant)
  useEffect(() => {
    if (initialMessage && messages.length === 0 && !initialMessageSent.current) {
      initialMessageSent.current = true;
      void send(decodeURIComponent(initialMessage));
    }
  }, []);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;
    setInputText('');
    await send(text);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const handleCompose = () => {
    if (!composeParams) return;
    router.push({
      pathname: '/messages/compose',
      params: {
        text: composeParams.text,
        placeIds: composeParams.placeIds?.join(','),
      },
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={80}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('chat.title')}</Text>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(_, idx) => String(idx)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => (
          <View
            style={[
              styles.messageRow,
              item.role === 'user' ? styles.messageRowEnd : styles.messageRowStart,
            ]}
          >
            <View
              testID={assistantTestIDs.messageItem(index)}
              style={[
                styles.bubble,
                item.role === 'user' ? styles.userBubble : styles.assistantBubble,
              ]}
            >
              <Text
                style={[
                  styles.bubbleText,
                  item.role === 'user' ? styles.userText : styles.assistantText,
                ]}
              >
                {item.content}
              </Text>
              <Text
                style={[
                  styles.timestamp,
                  item.role === 'user' ? styles.timestampUser : styles.timestampAssistant,
                ]}
              >
                {formatTime(item.timestamp)}
              </Text>
            </View>
          </View>
        )}
        ListFooterComponent={
          isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#555" />
              <Text style={styles.loadingText}>{t('chat.loading')}</Text>
            </View>
          ) : null
        }
      />

      {error ? (
        <View style={styles.errorRow}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {focusPlaceId ? (
        <Pressable
          testID="assistant.map.deeplink"
          style={styles.mapBtn}
          onPress={() => router.push(`/?focusPlaceId=${focusPlaceId}`)}
        >
          <Text style={styles.mapBtnText}>{t('chat.showOnMap')}</Text>
        </Pressable>
      ) : null}

      {composeParams ? (
        <Pressable
          testID={assistantTestIDs.composeDeepLink}
          style={styles.composeBtn}
          onPress={handleCompose}
        >
          <Text style={styles.composeBtnText}>{t('chat.compose')}</Text>
        </Pressable>
      ) : null}

      <View style={styles.inputRow}>
        <TextInput
          testID={assistantTestIDs.chatInput}
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder={t('chat.placeholder')}
          placeholderTextColor="#999"
          multiline
          returnKeyType="send"
          onSubmitEditing={handleSend}
        />
        <Pressable
          testID={assistantTestIDs.sendButton}
          style={[styles.sendBtn, (!inputText.trim() || isLoading) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim() || isLoading}
        >
          <Text style={styles.sendBtnText}>{t('chat.send')}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
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
  listContent: {
    padding: 12,
    paddingBottom: 8,
  },
  messageRow: {
    marginVertical: 4,
  },
  messageRowEnd: {
    alignItems: 'flex-end',
  },
  messageRowStart: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  userBubble: {
    backgroundColor: '#1565C0',
    borderBottomEndRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#F5F5F5',
    borderBottomStartRadius: 4,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
  },
  userText: {
    color: '#FFF',
    textAlign: 'auto',
  },
  assistantText: {
    color: '#212121',
    textAlign: 'auto',
  },
  timestamp: {
    fontSize: 11,
    marginTop: 4,
  },
  timestampUser: {
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'auto',
  },
  timestampAssistant: {
    color: '#9E9E9E',
    textAlign: 'auto',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  loadingText: {
    color: '#666',
    fontSize: 13,
  },
  errorRow: {
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  errorText: {
    color: '#C62828',
    fontSize: 13,
    textAlign: 'auto',
  },
  mapBtn: {
    marginHorizontal: 12,
    marginBottom: 4,
    backgroundColor: '#1976D2',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  mapBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  composeBtn: {
    marginHorizontal: 12,
    marginBottom: 4,
    backgroundColor: '#388E3C',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  composeBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
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
    maxHeight: 120,
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
