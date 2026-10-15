import { assistantTestIDs } from '@iraq-maps/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useRef, useEffect, type ReactElement } from 'react';
import {
  Animated,
  Clipboard,
  FlatList,
  I18nManager,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAssistantChat, loadPersistedSessionId, clearPersistedSessionId } from '../hooks/useAssistantChat';
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

const QUICK_REPLIES = [
  'quickReply1',
  'quickReply2',
  'quickReply3',
  'quickReply4',
] as const;

function TypingIndicator(): ReactElement {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 300, useNativeDriver: true }),
          Animated.delay(600 - delay),
        ]),
      );

    const a1 = pulse(dot1, 0);
    const a2 = pulse(dot2, 200);
    const a3 = pulse(dot3, 400);
    a1.start();
    a2.start();
    a3.start();
    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.typingRow}>
      <View style={styles.typingBubble}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View key={i} style={[styles.typingDot, { opacity: dot }]} />
        ))}
      </View>
    </View>
  );
}

function PlaceCards({
  placeIds,
  names,
  onPress,
}: {
  placeIds: string[];
  names?: Record<string, string>;
  onPress: (id: string) => void;
}): ReactElement {
  return (
    <View style={styles.placeCardsContainer}>
      {placeIds.map((id) => (
        <Pressable
          key={id}
          testID={`assistant.placeCard.${id}`}
          style={styles.placeCard}
          onPress={() => onPress(id)}
          accessibilityRole="button"
          accessibilityLabel={names?.[id] ?? id}
        >
          <View style={styles.placeCardInner}>
            <View style={styles.placeCardIcon}>
              <Text style={styles.placeCardIconText}>📍</Text>
            </View>
            <View style={styles.placeCardInfo}>
              <Text style={styles.placeCardName} numberOfLines={1}>
                {names?.[id] ?? id}
              </Text>
            </View>
            <Text style={styles.placeCardMapLabel}>{t('chat.viewOnMap')}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

export function AssistantChatScreen(): ReactElement {
  const [sessionId, setSessionId] = useState<string>(generateSessionId);
  const [inputText, setInputText] = useState('');
  const { messages, send, isLoading, historyLoaded, composeParams, focusPlaceId, focusPlaceIds, focusPlaceNames, error } =
    useAssistantChat(sessionId);
  const router = useRouter();
  const listRef = useRef<FlatList>(null);
  const { initialMessage } = useLocalSearchParams<{ initialMessage?: string }>();
  const initialMessageSent = useRef(false);

  const showQuickReplies = messages.length === 0 && !isLoading && historyLoaded;

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

  const handleQuickReply = (key: (typeof QUICK_REPLIES)[number]) => {
    setInputText(t(`chat.${key}`));
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

  const handlePlaceCardPress = (id: string) => {
    router.push(`/?focusPlaceId=${id}`);
  };

  const handleClearChat = () => {
    void clearPersistedSessionId();
    setSessionId(generateSessionId());
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={80}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('chat.title')}</Text>
        <Pressable
          onPress={handleClearChat}
          accessibilityRole="button"
          accessibilityLabel={t('chat.clearChatA11y')}
          style={styles.clearBtn}
          testID="assistant-clear-btn"
        >
          <Text style={styles.clearBtnText}>{t('chat.clearChat')}</Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(_, idx) => String(idx)}
        contentContainerStyle={styles.listContent}
        accessibilityLiveRegion="polite"
        renderItem={({ item, index }) => (
          <View
            style={[
              styles.messageRow,
              item.role === 'user' ? styles.messageRowEnd : styles.messageRowStart,
            ]}
          >
            <Pressable
              testID={assistantTestIDs.messageItem(index)}
              style={[
                styles.bubble,
                item.role === 'user' ? styles.userBubble : styles.assistantBubble,
              ]}
              accessibilityRole="text"
              accessibilityLabel={item.role === 'user' ? t('chat.msgFromUser', { content: item.content }) : t('chat.msgFromAssistant', { content: item.content })}
              onLongPress={() => { Clipboard.setString(item.content); }}
              delayLongPress={500}
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
            </Pressable>
          </View>
        )}
        ListFooterComponent={isLoading ? <TypingIndicator /> : null}
      />

      {error ? (
        <View style={styles.errorRow}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {focusPlaceIds && focusPlaceIds.length > 1 ? (
        <PlaceCards placeIds={focusPlaceIds} names={focusPlaceNames} onPress={handlePlaceCardPress} />
      ) : focusPlaceId ? (
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

      {showQuickReplies ? (
        <View style={styles.welcomeHero} accessibilityRole="header">
          <Text style={styles.welcomeTitle}>{t('chat.welcomeTitle')}</Text>
          <Text style={styles.welcomeSubtitle}>{t('chat.welcomeSubtitle')}</Text>
        </View>
      ) : null}

      {showQuickReplies ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickRepliesContent}
          style={styles.quickRepliesRow}
          keyboardShouldPersistTaps="handled"
        >
          {QUICK_REPLIES.map((key) => (
            <Pressable
              key={key}
              testID={`assistant.quickReply.${key}`}
              style={styles.quickChip}
              onPress={() => handleQuickReply(key)}
            >
              <Text style={styles.quickChipText}>{t(`chat.${key}`)}</Text>
            </Pressable>
          ))}
        </ScrollView>
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
          accessibilityRole="button"
          accessibilityLabel={t('chat.sendA11y')}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  clearBtnText: {
    color: '#FFF',
    fontSize: 13,
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
  // Typing indicator
  typingRow: {
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    borderBottomStartRadius: 4,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 5,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#757575',
  },
  // Place cards
  placeCardsContainer: {
    paddingHorizontal: 12,
    paddingBottom: 4,
    gap: 6,
  },
  placeCard: {
    backgroundColor: '#FFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E3F2FD',
    overflow: 'hidden',
  },
  placeCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  placeCardIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeCardIconText: {
    fontSize: 16,
  },
  placeCardInfo: {
    flex: 1,
  },
  placeCardName: {
    fontSize: 13,
    color: '#424242',
    fontWeight: '500',
  },
  placeCardMapLabel: {
    fontSize: 12,
    color: '#1976D2',
    fontWeight: '600',
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
  // Welcome hero (shown when chat is empty)
  welcomeHero: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
    gap: 8,
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  welcomeSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    color: '#666',
    lineHeight: 20,
  },
  // Quick replies
  quickRepliesRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DDD',
    backgroundColor: '#FFF',
  },
  quickRepliesContent: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  quickChip: {
    backgroundColor: '#E3F2FD',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#BBDEFB',
  },
  quickChipText: {
    color: '#1565C0',
    fontSize: 13,
    fontWeight: '500',
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
