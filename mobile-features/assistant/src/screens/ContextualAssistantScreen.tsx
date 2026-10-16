/**
 * ContextualAssistantScreen — a lightweight assistant overlay triggered from
 * the map FAB. It knows the current map viewport and visible places and offers
 * contextual quick actions. Supports up to 3 inline messages before expanding
 * to the full AssistantScreen.
 */
import { useState, useRef, useEffect, useCallback, type ReactElement } from 'react';
import {
  Animated,
  FlatList,
  I18nManager,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAssistantChat, type ChatMessage } from '../hooks/useAssistantChat';
import { AssistantTyping } from '../components/AssistantTyping';
import { t } from '../strings';

I18nManager.forceRTL(true);

const PRIMARY = '#1565C0';
const MAX_MINI_MESSAGES = 3; // after this, prompt user to expand

export interface MapViewport {
  centerLat: number;
  centerLng: number;
  zoomLevel?: number;
}

export interface VisiblePlace {
  id: string;
  name: string;
  category?: string;
}

export interface ContextualAssistantScreenProps {
  viewport: MapViewport;
  visiblePlaces?: VisiblePlace[];
  onDismiss: () => void;
  onExpand: () => void;
  sessionId: string;
}

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

function buildContextualQuickReplies(
  viewport: MapViewport,
  visiblePlaces: VisiblePlace[],
): Array<{ key: string; label: string; icon: string }> {
  const replies: Array<{ key: string; label: string; icon: string }> = [
    { key: 'nearby', label: t('contextual.whatNearMe'), icon: '📍' },
    { key: 'restaurants', label: t('contextual.nearbyFood'), icon: '🍽️' },
    { key: 'plan', label: t('contextual.planDay'), icon: '🗓️' },
  ];

  // Add place-specific quick actions for first visible place
  if (visiblePlaces.length > 0) {
    const first = visiblePlaces[0]!;
    replies.push({
      key: `route_${first.id}`,
      label: t('contextual.routeTo', { name: first.name }),
      icon: '🗺️',
    });
    replies.push({
      key: `reviews_${first.id}`,
      label: t('contextual.reviewsOf', { name: first.name }),
      icon: '⭐',
    });
  }

  return replies.slice(0, 5);
}

function buildContextPrefix(viewport: MapViewport, visiblePlaces: VisiblePlace[]): string {
  const coordStr = `(${viewport.centerLat.toFixed(4)}, ${viewport.centerLng.toFixed(4)})`;
  const placesStr =
    visiblePlaces.length > 0
      ? `الأماكن المرئية: ${visiblePlaces
          .slice(0, 5)
          .map((p) => `${p.name}${p.category ? ` (${p.category})` : ''}`)
          .join('، ')}`
      : '';
  return `[السياق: الموقع الحالي على الخريطة ${coordStr}${placesStr ? `. ${placesStr}` : ''}]\n`;
}

export function ContextualAssistantScreen({
  viewport,
  visiblePlaces = [],
  onDismiss,
  onExpand,
  sessionId,
}: ContextualAssistantScreenProps): ReactElement {
  const [inputText, setInputText] = useState('');
  const slideAnim = useRef(new Animated.Value(300)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const listRef = useRef<FlatList>(null);
  const router = useRouter();

  const { messages, send, isLoading, error } = useAssistantChat(sessionId);

  const quickReplies = buildContextualQuickReplies(viewport, visiblePlaces);
  const isAtMiniLimit = messages.length >= MAX_MINI_MESSAGES * 2;

  // Animate in on mount
  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 65,
        friction: 11,
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [slideAnim, backdropAnim]);

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 300,
        tension: 65,
        friction: 11,
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => onDismiss());
  }, [slideAnim, backdropAnim, onDismiss]);

  const scrollToEnd = () => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  };

  const handleSend = async (textOverride?: string) => {
    const raw = textOverride ?? inputText;
    const text = raw.trim();
    if (!text || isLoading) return;
    setInputText('');

    // Prefix with map context for first message only
    const prefixed =
      messages.length === 0
        ? buildContextPrefix(viewport, visiblePlaces) + text
        : text;

    await send(prefixed);
    scrollToEnd();

    // Auto-expand when mini limit reached
    if (messages.length >= (MAX_MINI_MESSAGES - 1) * 2) {
      onExpand();
    }
  };

  const handleQuickReply = (label: string) => {
    void handleSend(label);
  };

  const handlePlacePress = (id: string) => {
    router.push(`/?focusPlaceId=${id}`);
    dismiss();
  };

  const renderMessage = ({ item, index }: { item: ChatMessage; index: number }) => {
    const isUser = item.role === 'user';
    // Strip the hidden context prefix from display
    const displayContent = item.content.replace(/^\[السياق:.*?\]\n/, '');
    return (
      <View
        style={[
          styles.msgRow,
          isUser ? styles.msgRowEnd : styles.msgRowStart,
        ]}
      >
        <View
          style={[
            styles.msgBubble,
            isUser ? styles.userBubble : styles.assistantBubble,
          ]}
        >
          <Text
            style={[
              styles.msgText,
              isUser ? styles.userText : styles.assistantText,
            ]}
            testID={`contextual.msg.${index}`}
          >
            {displayContent}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <>
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={dismiss} accessibilityLabel={t('contextual.dismiss')}>
        <Animated.View
          style={[styles.backdrop, { opacity: backdropAnim }]}
          pointerEvents="auto"
        />
      </TouchableWithoutFeedback>

      {/* Panel */}
      <Animated.View
        style={[styles.panel, { transform: [{ translateY: slideAnim }] }]}
      >
        {/* Handle bar */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>{t('contextual.title')}</Text>
            {visiblePlaces.length > 0 && (
              <Text style={styles.headerContext}>
                {t('contextual.placesVisible', { count: String(visiblePlaces.length) })}
              </Text>
            )}
          </View>
          <View style={styles.headerActions}>
            {messages.length > 0 && (
              <Pressable
                style={styles.expandBtn}
                onPress={onExpand}
                accessibilityRole="button"
                accessibilityLabel={t('contextual.expand')}
              >
                <Text style={styles.expandBtnText}>{t('contextual.expand')}</Text>
              </Pressable>
            )}
            <Pressable
              style={styles.closeBtn}
              onPress={dismiss}
              accessibilityRole="button"
              accessibilityLabel={t('contextual.dismiss')}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>
        </View>

        {/* Quick reply chips */}
        {messages.length === 0 && (
          <View style={styles.quickRepliesWrap}>
            {quickReplies.map((qr) => (
              <Pressable
                key={qr.key}
                style={styles.quickChip}
                onPress={() => handleQuickReply(qr.label)}
                accessibilityRole="button"
                accessibilityLabel={qr.label}
              >
                <Text style={styles.quickChipIcon}>{qr.icon}</Text>
                <Text style={styles.quickChipText}>{qr.label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Mini message list */}
        {messages.length > 0 && (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(_, idx) => String(idx)}
            contentContainerStyle={styles.listContent}
            style={styles.messageList}
            renderItem={renderMessage}
            ListFooterComponent={isLoading ? <AssistantTyping /> : null}
          />
        )}

        {/* Expand prompt */}
        {isAtMiniLimit && (
          <Pressable
            style={styles.expandPrompt}
            onPress={onExpand}
            accessibilityRole="button"
            accessibilityLabel={t('contextual.expand')}
          >
            <Text style={styles.expandPromptText}>{t('contextual.expandPrompt')}</Text>
          </Pressable>
        )}

        {/* Error */}
        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}

        {/* Input */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder={t('contextual.placeholder')}
              placeholderTextColor="#999"
              returnKeyType="send"
              onSubmitEditing={() => { void handleSend(); }}
              maxLength={300}
              textAlign={I18nManager.isRTL ? 'right' : 'left'}
            />
            <Pressable
              style={[styles.sendBtn, (!inputText.trim() || isLoading) && styles.sendBtnDisabled]}
              onPress={() => { void handleSend(); }}
              disabled={!inputText.trim() || isLoading}
              accessibilityRole="button"
              accessibilityLabel={t('chat.sendA11y')}
            >
              <Text style={styles.sendBtnText}>{t('chat.send')}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </>
  );
}

/** Standalone FAB that opens the contextual assistant */
export function ContextualAssistantFab({
  viewport,
  visiblePlaces,
}: {
  viewport: MapViewport;
  visiblePlaces?: VisiblePlace[];
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [sessionId] = useState(generateSessionId);
  const router = useRouter();

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  const handleExpand = () => {
    setOpen(false);
    router.push('/assistant');
  };

  return (
    <>
      {open && (
        <ContextualAssistantScreen
          viewport={viewport}
          visiblePlaces={visiblePlaces}
          onDismiss={() => setOpen(false)}
          onExpand={handleExpand}
          sessionId={sessionId}
        />
      )}

      {!open && (
        <Animated.View
          style={[styles.fab, { transform: [{ scale: pulseAnim }] }]}
        >
          <Pressable
            onPress={() => setOpen(true)}
            style={styles.fabInner}
            accessibilityRole="button"
            accessibilityLabel={t('contextual.fabA11y')}
            testID="contextual-assistant-fab"
          >
            <Text style={styles.fabIcon}>🤖</Text>
          </Pressable>
        </Animated.View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  panel: {
    position: 'absolute',
    bottom: 0,
    insetInlineStart: 0,
    insetInlineEnd: 0,
    backgroundColor: '#FFF',
    borderTopStartRadius: 20,
    borderTopEndRadius: 20,
    maxHeight: '70%',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DDD',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEE',
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  headerContext: {
    fontSize: 11,
    color: '#888',
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  expandBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PRIMARY,
  },
  expandBtnText: {
    color: PRIMARY,
    fontSize: 12,
    fontWeight: '600',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    color: '#555',
    fontWeight: '600',
  },
  quickRepliesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#BBDEFB',
    gap: 4,
  },
  quickChipIcon: {
    fontSize: 14,
  },
  quickChipText: {
    color: PRIMARY,
    fontSize: 12,
    fontWeight: '500',
  },
  messageList: {
    maxHeight: 220,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  msgRow: {
    flexDirection: 'row',
    marginVertical: 2,
  },
  msgRowEnd: {
    justifyContent: 'flex-end',
  },
  msgRowStart: {
    justifyContent: 'flex-start',
  },
  msgBubble: {
    maxWidth: '80%',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  userBubble: {
    backgroundColor: PRIMARY,
    borderBottomEndRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#F5F5F5',
    borderBottomStartRadius: 4,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  msgText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'auto' as const,
  },
  userText: {
    color: '#FFF',
  },
  assistantText: {
    color: '#222',
  },
  expandPrompt: {
    marginHorizontal: 12,
    marginBottom: 6,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  expandPromptText: {
    color: PRIMARY,
    fontSize: 13,
    fontWeight: '600',
  },
  errorText: {
    color: '#C62828',
    fontSize: 12,
    paddingHorizontal: 16,
    paddingBottom: 4,
    textAlign: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EEE',
    gap: 8,
  },
  input: {
    flex: 1,
    height: 38,
    backgroundColor: '#F0F0F0',
    borderRadius: 19,
    paddingHorizontal: 14,
    paddingVertical: 6,
    fontSize: 14,
    color: '#222',
  },
  sendBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 19,
    paddingHorizontal: 14,
    paddingVertical: 9,
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#B0BEC5',
  },
  sendBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  // FAB
  fab: {
    position: 'absolute',
    bottom: 80,
    insetInlineEnd: 16,
  },
  fabInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  fabIcon: {
    fontSize: 26,
  },
});
