/**
 * AssistantScreen — full-featured AI chat with:
 * - Context chips (near me / currently viewing place)
 * - Itinerary request quick action
 * - "Summarize reviews" quick action when viewing a place
 * - Voice input waveform visual
 * - Suggested follow-up questions after each reply
 * - Copy and share per-message buttons
 * - RTL Arabic-first UI
 */
import { assistantTestIDs } from '@iraq-maps/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useRef, useEffect, useCallback, type ReactElement } from 'react';
import {
  Alert,
  Animated,
  Clipboard,
  FlatList,
  I18nManager,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  useAssistantChat,
  loadPersistedSessionId,
  clearPersistedSessionId,
  clearPersistedHistory,
  type ChatMessage as BaseChatMessage,
} from '../hooks/useAssistantChat';
import { t } from '../strings';
import { ChatBubble, type ChatMessage as RichChatMessage } from '../components/ChatBubble';
import { AssistantTyping } from '../components/AssistantTyping';
import { QuickReplies, type QuickReply } from '../components/QuickReplies';

// ─── Follow-up question suggestions ──────────────────────────────────────────
// Heuristic: detect intent keywords in the last assistant reply and
// surface 2–3 follow-up chips the user can tap to continue the conversation.

function inferFollowUps(assistantReply: string, currentPlaceName?: string): string[] {
  const suggestions: string[] = [];
  if (/مطعم|أكل|غداء|عشاء|إفطار/.test(assistantReply)) {
    suggestions.push('ما هي أوقات العمل؟', 'أرني على الخريطة', 'كيف أصل إليه؟');
  } else if (/فندق|إقامة|حجز/.test(assistantReply)) {
    suggestions.push('ما السعر التقريبي؟', 'أرني على الخريطة', 'هل يوجد بديل أرخص؟');
  } else if (/طريق|اتجاهات|كيف أصل/.test(assistantReply)) {
    suggestions.push('هل يوجد موقف سيارات؟', 'كم يستغرق الطريق؟', 'طريق بديل؟');
  } else if (/معلم|سياحي|تاريخ/.test(assistantReply)) {
    suggestions.push('متى يُفضّل الزيارة؟', 'ما مجاور هذا المكان؟', 'خطط لي يوماً هناك');
  } else if (currentPlaceName) {
    suggestions.push(`ما تقييمات ${currentPlaceName}؟`, `كيف أصل إلى ${currentPlaceName}؟`);
  }
  return suggestions.slice(0, 3);
}

// ─── Waveform visual (voice recording indicator) ─────────────────────────────

function VoiceWaveform({ active }: { active: boolean }): ReactElement | null {
  if (!active) return null;
  const bars = [0.4, 0.7, 1.0, 0.6, 0.8, 0.5, 0.9, 0.4];
  return (
    <View style={waveStyles.container} accessibilityLabel={t('voice.waveformA11y')}>
      {bars.map((h, i) => (
        <View
          key={i}
          style={[waveStyles.bar, { height: 24 * h, opacity: 0.7 + 0.3 * h }]}
        />
      ))}
    </View>
  );
}

const waveStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
  },
  bar: {
    width: 4,
    borderRadius: 2,
    backgroundColor: '#1565C0',
  },
});

// ─── Context chip row ─────────────────────────────────────────────────────────

interface ContextChipRowProps {
  currentPlaceName?: string;
  onChipPress: (text: string) => void;
}

function ContextChipRow({ currentPlaceName, onChipPress }: ContextChipRowProps): ReactElement {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={chipStyles.scroll}
      contentContainerStyle={chipStyles.content}
    >
      <Pressable
        style={chipStyles.chip}
        onPress={() => onChipPress('ماذا يوجد قريباً مني؟')}
        accessibilityRole="button"
      >
        <Text style={chipStyles.chipText}>📍 قريباً مني</Text>
      </Pressable>
      {currentPlaceName ? (
        <>
          <Pressable
            style={[chipStyles.chip, chipStyles.chipActive]}
            onPress={() => onChipPress(`أخبرني أكثر عن ${currentPlaceName}`)}
            accessibilityRole="button"
          >
            <Text style={[chipStyles.chipText, chipStyles.chipTextActive]}>
              📌 {currentPlaceName}
            </Text>
          </Pressable>
          <Pressable
            style={chipStyles.chip}
            onPress={() => onChipPress(`لخّص تقييمات ${currentPlaceName}`)}
            accessibilityRole="button"
          >
            <Text style={chipStyles.chipText}>⭐ تقييمات {currentPlaceName}</Text>
          </Pressable>
        </>
      ) : null}
      <Pressable
        style={chipStyles.chip}
        onPress={() => onChipPress('خطط لي جولة اليوم')}
        accessibilityRole="button"
      >
        <Text style={chipStyles.chipText}>🗓️ خطط ليومي</Text>
      </Pressable>
    </ScrollView>
  );
}

const chipStyles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  content: { paddingHorizontal: 12, paddingVertical: 6, gap: 8, flexDirection: 'row' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F0F4FF',
    borderWidth: 1,
    borderColor: '#B3C3F0',
  },
  chipActive: {
    backgroundColor: '#1565C0',
    borderColor: '#1565C0',
  },
  chipText: {
    fontSize: 13,
    color: '#1565C0',
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#FFF',
  },
});

// Force RTL for Arabic
I18nManager.forceRTL(true);

const PRIMARY = '#1565C0';
const MAX_INPUT_LENGTH = 500;
const CHAR_WARN_THRESHOLD = 400;

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

/**
 * Enrich a base ChatMessage with rich metadata extracted from the content.
 * Detects place references, route suggestions, and rating requests.
 */
function enrichMessage(
  base: BaseChatMessage,
  focusPlaceIds?: string[],
  focusPlaceNames?: Record<string, string>,
): RichChatMessage {
  const msg: RichChatMessage = { ...base };

  if (base.role === 'assistant' && focusPlaceIds && focusPlaceIds.length > 0) {
    msg.placeRefs = focusPlaceIds.map((id) => ({
      id,
      name: focusPlaceNames?.[id] ?? id,
    }));
  }

  // Detect routing intent in assistant reply
  if (base.role === 'assistant' && focusPlaceIds && focusPlaceIds.length === 1) {
    const hasRouteWord = /طريق|اتجاهات|كيف أصل|روت/.test(base.content);
    if (hasRouteWord && focusPlaceNames?.[focusPlaceIds[0]!]) {
      msg.routeRef = {
        placeId: focusPlaceIds[0]!,
        placeName: focusPlaceNames[focusPlaceIds[0]!]!,
      };
    }
  }

  return msg;
}

const DEFAULT_QUICK_REPLIES: QuickReply[] = [
  { key: 'qr1', label: t('chat.quickReply1'), icon: '🍽️' },
  { key: 'qr2', label: t('chat.quickReply2'), icon: '🗓️' },
  { key: 'qr3', label: t('chat.quickReply3'), icon: '⭐' },
  { key: 'qr4', label: t('chat.quickReply4'), icon: '🗺️' },
];

export function AssistantScreen(): ReactElement {
  const [sessionId, setSessionId] = useState<string>(generateSessionId);
  const [inputText, setInputText] = useState('');
  const [lastSentText, setLastSentText] = useState('');
  const [voiceActive, setVoiceActive] = useState(false);
  const [followUpSuggestions, setFollowUpSuggestions] = useState<string[]>([]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const {
    messages,
    send,
    isLoading,
    historyLoaded,
    composeParams,
    focusPlaceId,
    focusPlaceIds,
    focusPlaceNames,
    error,
  } = useAssistantChat(sessionId);

  const router = useRouter();
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const { initialMessage } = useLocalSearchParams<{ initialMessage?: string }>();
  const initialMessageSent = useRef(false);
  const headerFadeAnim = useRef(new Animated.Value(0)).current;

  const showQuickReplies = messages.length === 0 && !isLoading && historyLoaded;

  // Animate header in
  useEffect(() => {
    Animated.timing(headerFadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [headerFadeAnim]);

  // Resume persisted session
  useEffect(() => {
    loadPersistedSessionId().then((saved) => {
      if (saved) setSessionId(saved);
    });
  }, []);

  // Auto-send initialMessage from deep-link
  useEffect(() => {
    if (initialMessage && messages.length === 0 && !initialMessageSent.current) {
      initialMessageSent.current = true;
      void send(decodeURIComponent(initialMessage));
    }
  }, []); // intentionally run once on mount

  const scrollToEnd = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  // Derive current place context from router params
  const { viewingPlaceId, viewingPlaceName } = useLocalSearchParams<{
    viewingPlaceId?: string;
    viewingPlaceName?: string;
  }>();

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;
    setInputText('');
    setLastSentText(text);
    setFollowUpSuggestions([]);
    await send(text);
    scrollToEnd();
  };

  const handleRetry = async () => {
    if (!lastSentText || isLoading) return;
    setFollowUpSuggestions([]);
    await send(lastSentText);
    scrollToEnd();
  };

  // Copy a message to clipboard
  const handleCopyMessage = useCallback((content: string, idx: number) => {
    Clipboard.setString(content);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }, []);

  // Share a single message
  const handleShareMessage = useCallback(async (content: string) => {
    try {
      await Share.share({ message: content });
    } catch {
      // cancelled
    }
  }, []);

  const handleQuickReply = (label: string) => {
    setInputText(label);
    inputRef.current?.focus();
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

  const handlePlacePress = (id: string) => {
    router.push(`/?focusPlaceId=${id}`);
  };

  const handleRoutePress = (placeId: string, _placeName: string) => {
    router.push(`/navigation?destinationId=${placeId}`);
  };

  const handleRatingSubmit = (placeId: string, rating: number) => {
    // Route to place review screen with pre-filled rating
    router.push(`/places/${placeId}/review?rating=${rating}`);
  };

  const handleBubbleQuickReply = (text: string) => {
    setInputText(text);
    inputRef.current?.focus();
  };

  const handleClearChat = () => {
    Alert.alert(
      t('chat.clearChat'),
      t('chat.clearChatConfirm'),
      [
        { text: t('chat.cancel'), style: 'cancel' },
        {
          text: t('chat.clearChat'),
          style: 'destructive',
          onPress: () => {
            void clearPersistedSessionId();
            void clearPersistedHistory(sessionId);
            setSessionId(generateSessionId());
          },
        },
      ],
    );
  };

  const handleShareConversation = async () => {
    if (messages.length === 0) return;
    const text = messages
      .map((m) => `${m.role === 'user' ? '👤' : '🤖'} ${m.content}`)
      .join('\n\n');
    try {
      await Share.share({ message: text, title: t('chat.title') });
    } catch {
      // user cancelled or system error, ignore
    }
  };

  const handleVoicePress = () => {
    // Voice input stub — real implementation wires expo-speech or similar
    setVoiceActive((prev) => !prev);
    Alert.alert(t('chat.voiceStubTitle'), t('chat.voiceStubMessage'));
  };

  // Build enriched messages for the last assistant reply (carry focusPlaceIds)
  const richMessages: RichChatMessage[] = messages.map((m, idx) => {
    const isLastAssistant =
      m.role === 'assistant' && idx === messages.length - 1;
    if (isLastAssistant) {
      return enrichMessage(m, focusPlaceIds, focusPlaceNames);
    }
    return m as RichChatMessage;
  });

  // Derive follow-up suggestions from last assistant reply (not on loading)
  useEffect(() => {
    if (!isLoading && messages.length > 0) {
      const lastMsg = [...messages].reverse().find(m => m.role === 'assistant');
      if (lastMsg) {
        setFollowUpSuggestions(inferFollowUps(lastMsg.content, viewingPlaceName));
      }
    }
  }, [isLoading, messages, viewingPlaceName]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={80}
    >
      {/* Header */}
      <Animated.View style={[styles.header, { opacity: headerFadeAnim }]}>
        <View style={styles.headerLeft}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>🤖</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>{t('chat.title')}</Text>
            {isLoading ? (
              <Text style={styles.headerStatus}>{t('chat.loading')}</Text>
            ) : (
              <Text style={styles.headerStatusOnline}>{t('chat.statusOnline')}</Text>
            )}
          </View>
        </View>
        <View style={styles.headerActions}>
          {messages.length > 0 && (
            <Pressable
              onPress={handleShareConversation}
              style={styles.headerBtn}
              accessibilityRole="button"
              accessibilityLabel={t('chat.shareConversation')}
            >
              <Text style={styles.headerBtnText}>{'↑'}</Text>
            </Pressable>
          )}
          <Pressable
            onPress={handleClearChat}
            style={styles.headerBtn}
            accessibilityRole="button"
            accessibilityLabel={t('chat.clearChatA11y')}
            testID="assistant-clear-btn"
          >
            <Text style={styles.headerBtnText}>{t('chat.clearChat')}</Text>
          </Pressable>
        </View>
      </Animated.View>

      {/* Message list */}
      <FlatList
        ref={listRef}
        data={richMessages}
        keyExtractor={(_, idx) => String(idx)}
        contentContainerStyle={styles.listContent}
        accessibilityLiveRegion="polite"
        onContentSizeChange={scrollToEnd}
        renderItem={({ item, index }) => (
          <View>
            <ChatBubble
              message={item}
              index={index}
              onPlacePress={handlePlacePress}
              onRoutePress={handleRoutePress}
              onQuickReply={handleBubbleQuickReply}
              onRatingSubmit={handleRatingSubmit}
            />
            {item.role === 'assistant' ? (
              <View style={styles.msgActions}>
                <Pressable
                  style={styles.msgActionBtn}
                  onPress={() => handleCopyMessage(item.content, index)}
                  accessibilityRole="button"
                  accessibilityLabel="نسخ"
                >
                  <Text style={styles.msgActionText}>
                    {copiedIdx === index ? '✓ تم النسخ' : '📋 نسخ'}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.msgActionBtn}
                  onPress={() => { void handleShareMessage(item.content); }}
                  accessibilityRole="button"
                  accessibilityLabel="مشاركة"
                >
                  <Text style={styles.msgActionText}>↑ مشاركة</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        )}
        ListHeaderComponent={
          showQuickReplies ? (
            <View style={styles.welcomeHero} accessibilityRole="header">
              <Text style={styles.welcomeEmoji}>🇮🇶</Text>
              <Text style={styles.welcomeTitle}>{t('chat.welcomeTitle')}</Text>
              <Text style={styles.welcomeSubtitle}>{t('chat.welcomeSubtitle')}</Text>
            </View>
          ) : null
        }
        ListFooterComponent={isLoading ? <AssistantTyping /> : null}
      />

      {/* Error bar */}
      {error ? (
        <View style={styles.errorRow}>
          <Text style={styles.errorText}>{error}</Text>
          {lastSentText ? (
            <Pressable
              testID="assistant-retry-btn"
              onPress={() => { void handleRetry(); }}
              style={styles.retryBtn}
              accessibilityRole="button"
              accessibilityLabel={t('chat.retry')}
              disabled={isLoading}
            >
              <Text style={styles.retryBtnText}>{t('chat.retry')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Map deep-link — single place */}
      {focusPlaceIds && focusPlaceIds.length <= 1 && focusPlaceId ? (
        <Pressable
          testID="assistant.map.deeplink"
          style={styles.mapBtn}
          onPress={() => router.push(`/?focusPlaceId=${focusPlaceId}`)}
          accessibilityRole="button"
          accessibilityLabel={t('chat.showOnMap')}
        >
          <Text style={styles.mapBtnText}>{t('chat.showOnMap')}</Text>
        </Pressable>
      ) : null}

      {/* Map deep-link — multiple places */}
      {focusPlaceIds && focusPlaceIds.length > 1 ? (
        <Pressable
          testID="assistant.map.deeplinkMulti"
          style={styles.mapBtn}
          onPress={() => router.push(`/?focusPlaceId=${focusPlaceIds[0]}`)}
          accessibilityRole="button"
          accessibilityLabel={t('chat.showPlacesOnMap', { count: String(focusPlaceIds.length) })}
        >
          <Text style={styles.mapBtnText}>{t('chat.showPlacesOnMap', { count: String(focusPlaceIds.length) })}</Text>
        </Pressable>
      ) : null}

      {/* Compose deep-link */}
      {composeParams ? (
        <Pressable
          testID={assistantTestIDs.composeDeepLink}
          style={styles.composeBtn}
          onPress={handleCompose}
          accessibilityRole="button"
          accessibilityLabel={t('chat.compose')}
        >
          <Text style={styles.composeBtnText}>{t('chat.compose')}</Text>
        </Pressable>
      ) : null}

      {/* Context chips (shown once there are messages) */}
      {messages.length > 0 && !isLoading ? (
        <ContextChipRow
          currentPlaceName={viewingPlaceName}
          onChipPress={(text) => {
            setInputText(text);
            inputRef.current?.focus();
          }}
        />
      ) : null}

      {/* Follow-up suggestions after last assistant reply */}
      {followUpSuggestions.length > 0 && !isLoading ? (
        <View style={styles.followUpRow}>
          <Text style={styles.followUpLabel}>اقتراحات:</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.followUpScroll}
          >
            {followUpSuggestions.map((s, i) => (
              <Pressable
                key={i}
                style={styles.followUpChip}
                onPress={() => {
                  setInputText(s);
                  inputRef.current?.focus();
                }}
                accessibilityRole="button"
              >
                <Text style={styles.followUpChipText}>{s}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Quick replies (shown on empty chat) */}
      {showQuickReplies ? (
        <QuickReplies
          replies={DEFAULT_QUICK_REPLIES}
          onSelect={handleQuickReply}
        />
      ) : null}

      {/* Input row */}
      <View style={styles.inputRow}>
        {/* Voice button with waveform */}
        <Pressable
          style={[styles.voiceBtn, voiceActive && styles.voiceBtnActive]}
          onPress={handleVoicePress}
          accessibilityRole="button"
          accessibilityLabel={t('search.micA11y')}
        >
          {voiceActive ? (
            <VoiceWaveform active={voiceActive} />
          ) : (
            <Text style={styles.voiceBtnIcon}>{t('search.micIcon')}</Text>
          )}
        </Pressable>

        <TextInput
          ref={inputRef}
          testID={assistantTestIDs.chatInput}
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder={t('chat.placeholder')}
          placeholderTextColor="#999"
          multiline
          returnKeyType="send"
          onSubmitEditing={handleSend}
          maxLength={MAX_INPUT_LENGTH}
          textAlign={I18nManager.isRTL ? 'right' : 'left'}
        />

        {inputText.length >= CHAR_WARN_THRESHOLD ? (
          <Text
            style={[
              styles.charCount,
              inputText.length >= MAX_INPUT_LENGTH && styles.charCountMax,
            ]}
          >
            {t('chat.charCount', {
              count: String(inputText.length),
              max: String(MAX_INPUT_LENGTH),
            })}
          </Text>
        ) : null}

        <Pressable
          testID={assistantTestIDs.sendButton}
          style={[
            styles.sendBtn,
            (!inputText.trim() || isLoading) && styles.sendBtnDisabled,
          ]}
          onPress={() => { void handleSend(); }}
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
  // Header
  header: {
    backgroundColor: PRIMARY,
    paddingTop: Platform.OS === 'ios' ? 0 : 4,
    paddingBottom: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    fontSize: 18,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  headerStatus: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
  },
  headerStatusOnline: {
    color: '#A5D6A7',
    fontSize: 11,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 6,
  },
  headerBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  headerBtnText: {
    color: '#FFF',
    fontSize: 13,
  },
  // Message list
  listContent: {
    paddingHorizontal: 4,
    paddingTop: 12,
    paddingBottom: 8,
  },
  // Welcome
  welcomeHero: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 28,
    gap: 8,
  },
  welcomeEmoji: {
    fontSize: 48,
    marginBottom: 4,
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    color: '#1A1A1A',
  },
  welcomeSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    color: '#666',
    lineHeight: 21,
  },
  // Error bar
  errorRow: {
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  errorText: {
    color: '#C62828',
    fontSize: 13,
    textAlign: 'auto' as const,
    flex: 1,
  },
  retryBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#C62828',
  },
  retryBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  // Map button
  mapBtn: {
    marginHorizontal: 12,
    marginBottom: 4,
    backgroundColor: PRIMARY,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  mapBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  // Compose button
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
    fontSize: 14,
    fontWeight: '600',
  },
  // Input row
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 8,
    backgroundColor: '#FFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DDD',
    gap: 6,
  },
  voiceBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceBtnActive: {
    backgroundColor: '#FFEBEE',
  },
  voiceBtnIcon: {
    fontSize: 18,
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
    color: '#222',
  },
  charCount: {
    position: 'absolute',
    bottom: 44,
    insetInlineEnd: 70,
    fontSize: 11,
    color: '#E65100',
  },
  charCountMax: {
    color: '#B00020',
    fontWeight: '600',
  },
  sendBtn: {
    backgroundColor: PRIMARY,
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
  // Per-message copy/share actions
  msgActions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 6,
    justifyContent: 'flex-end',
  },
  msgActionBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
  },
  msgActionText: {
    color: '#666',
    fontSize: 12,
  },
  // Follow-up suggestions
  followUpRow: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    gap: 6,
  },
  followUpLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 2,
  },
  followUpScroll: {
    gap: 8,
    flexDirection: 'row',
  },
  followUpChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  followUpChipText: {
    color: '#3730A3',
    fontSize: 12,
    fontWeight: '500',
  },
});
