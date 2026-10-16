/**
 * ConversationScreen – full 1-to-1 chat UI.
 *
 * Features:
 * - Bubble layout (own right / other left)
 * - All message types via MessageBubble
 * - Message status: sending → sent → delivered → read (double tick)
 * - Reply to message (swipe or long-press → reply)
 * - Forward message (stub)
 * - Copy text / delete for me / delete for everyone
 * - Long-press context menu
 * - Typing indicator
 * - Read receipts toggle (based on prefs)
 * - Message search within chat
 * - Paginated history
 */
import { useLocalSearchParams } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  I18nManager,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  MessageBubble,
  type ChatMessage,
  type MessageBubbleCallbacks,
  type MessageStatus,
} from '../components/MessageBubble';
import { ReplyPreview, type ReplyPreviewData } from '../components/ReplyPreview';
import { TypingIndicator } from '../components/TypingIndicator';
import { useReadAt } from '../hooks/useReadReceipts';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 30;
const TYPING_TIMEOUT_MS = 3000;
const SEARCH_DEBOUNCE_MS = 300;

// ─── Mock data helpers (replaced by real API in M5+) ────────────────────────

function makeMockMessages(
  count: number,
  myId: string,
  otherId: string,
): ChatMessage[] {
  const types: ChatMessage['type'][] = ['text', 'text', 'text', 'image', 'location', 'document'];
  return Array.from({ length: count }, (_, i) => {
    const isOwn = i % 3 !== 0;
    const type = types[i % types.length]!;
    const base: ChatMessage = {
      id: `msg-${i}`,
      senderId: isOwn ? myId : otherId,
      type,
      status: (i % 4 === 0 ? 'read' : i % 4 === 1 ? 'delivered' : 'sent') as MessageStatus,
      createdAt: new Date(Date.now() - (count - i) * 3 * 60 * 1000).toISOString(),
    };
    if (type === 'text') {
      return { ...base, text: `رسالة تجريبية رقم ${i + 1}` };
    }
    if (type === 'image') {
      return { ...base, imageUrl: 'https://via.placeholder.com/220x160' };
    }
    if (type === 'location') {
      return {
        ...base,
        location: { latitude: 33.315, longitude: 44.366, label: 'بغداد، شارع المتنبي' },
      };
    }
    if (type === 'document') {
      return {
        ...base,
        document: { filename: 'مستند.pdf', sizeBytes: 1_240_000, mimeType: 'application/pdf' },
      };
    }
    return { ...base, text: `رسالة ${i + 1}` };
  });
}

// ─── ImageViewer modal ────────────────────────────────────────────────────────

function ImageViewerModal({
  url,
  onClose,
}: {
  url: string | null;
  onClose: () => void;
}): ReactElement | null {
  if (!url) return null;
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={modalStyles.overlay}>
        <TouchableOpacity
          style={modalStyles.closeArea}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('compose.cancel')}
        />
        <View style={modalStyles.imageWrapper}>
          {/* Image component here – using placeholder */}
          <View style={modalStyles.imagePlaceholder}>
            <Text style={modalStyles.imagePlaceholderText}>🖼</Text>
          </View>
        </View>
        <TouchableOpacity style={modalStyles.closeBtn} onPress={onClose}>
          <Text style={modalStyles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeArea: { position: 'absolute', top: 0, start: 0, end: 0, bottom: 0 },
  imageWrapper: { maxWidth: '90%', maxHeight: '80%' },
  imagePlaceholder: {
    width: 300,
    height: 300,
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  imagePlaceholderText: { fontSize: 64 },
  closeBtn: {
    position: 'absolute',
    top: 48,
    end: 20,
    padding: 10,
  },
  closeBtnText: { fontSize: 22, color: '#FFF', fontWeight: '700' },
});

// ─── Search bar ───────────────────────────────────────────────────────────────

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
  resultCount: number;
  currentIndex: number;
  onPrev: () => void;
  onNext: () => void;
}

function SearchBar({
  value,
  onChange,
  onClose,
  resultCount,
  currentIndex,
  onPrev,
  onNext,
}: SearchBarProps): ReactElement {
  return (
    <View style={searchStyles.bar}>
      <TextInput
        style={searchStyles.input}
        value={value}
        onChangeText={onChange}
        placeholder={t('search.placeholder')}
        placeholderTextColor="#9E9E9E"
        autoFocus
        returnKeyType="search"
        textAlign={I18nManager.isRTL ? 'right' : 'left'}
      />
      {resultCount > 0 ? (
        <Text style={searchStyles.counter}>
          {currentIndex + 1}/{resultCount}
        </Text>
      ) : null}
      <TouchableOpacity onPress={onPrev} disabled={resultCount === 0} hitSlop={{ top: 8, bottom: 8, start: 8, end: 8 }}>
        <Text style={[searchStyles.navBtn, resultCount === 0 && searchStyles.navBtnDisabled]}>▲</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onNext} disabled={resultCount === 0} hitSlop={{ top: 8, bottom: 8, start: 8, end: 8 }}>
        <Text style={[searchStyles.navBtn, resultCount === 0 && searchStyles.navBtnDisabled]}>▼</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, start: 8, end: 8 }}>
        <Text style={searchStyles.closeBtn}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const searchStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
    gap: 6,
  },
  input: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 18,
    paddingHorizontal: 12,
    fontSize: 14,
    backgroundColor: '#F5F5F5',
  },
  counter: { fontSize: 12, color: '#757575', minWidth: 36, textAlign: 'center' },
  navBtn: { fontSize: 14, color: '#1976D2', paddingHorizontal: 2 },
  navBtnDisabled: { color: '#BDBDBD' },
  closeBtn: { fontSize: 16, color: '#757575', paddingHorizontal: 4 },
});

// ─── Header ───────────────────────────────────────────────────────────────────

interface HeaderProps {
  name: string;
  avatarInitial: string;
  isOnline: boolean;
  onSearchPress: () => void;
  onBack: () => void;
}

function ConversationHeader({
  name,
  avatarInitial,
  isOnline,
  onSearchPress,
  onBack,
}: HeaderProps): ReactElement {
  return (
    <View style={headerStyles.header}>
      <TouchableOpacity
        onPress={onBack}
        hitSlop={{ top: 10, bottom: 10, start: 10, end: 10 }}
        accessibilityRole="button"
        accessibilityLabel={t('compose.cancel')}
      >
        <Text style={headerStyles.backBtn}>{I18nManager.isRTL ? '›' : '‹'}</Text>
      </TouchableOpacity>

      <View style={headerStyles.avatarWrap}>
        <View style={headerStyles.avatar}>
          <Text style={headerStyles.avatarInitial}>{avatarInitial}</Text>
        </View>
        {isOnline ? <View style={headerStyles.onlineDot} /> : null}
      </View>

      <View style={headerStyles.nameBlock}>
        <Text style={headerStyles.name} numberOfLines={1}>{name}</Text>
        {isOnline ? (
          <Text style={headerStyles.onlineLabel}>{t('conversation.online')}</Text>
        ) : null}
      </View>

      <TouchableOpacity
        onPress={onSearchPress}
        hitSlop={{ top: 10, bottom: 10, start: 10, end: 10 }}
        accessibilityRole="button"
        accessibilityLabel={t('search.placeholder')}
      >
        <Text style={headerStyles.iconBtn}>🔍</Text>
      </TouchableOpacity>
    </View>
  );
}

const headerStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#1976D2',
    gap: 10,
  },
  backBtn: { fontSize: 24, color: '#FFF', fontWeight: '700', lineHeight: 28 },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 16, color: '#FFF', fontWeight: '700' },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    end: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4CAF50',
    borderWidth: 1.5,
    borderColor: '#1976D2',
  },
  nameBlock: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  onlineLabel: { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 1 },
  iconBtn: { fontSize: 18, color: '#FFF' },
});

// ─── Compose bar ──────────────────────────────────────────────────────────────

interface ComposeBarProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onAttachPress: () => void;
  sending: boolean;
  replyTo: ReplyPreviewData | null;
  onCancelReply: () => void;
}

function ComposeBar({
  value,
  onChange,
  onSend,
  onAttachPress,
  sending,
  replyTo,
  onCancelReply,
}: ComposeBarProps): ReactElement {
  return (
    <View>
      {replyTo ? <ReplyPreview data={replyTo} onCancel={onCancelReply} /> : null}
      <View style={composeStyles.bar}>
        <TouchableOpacity
          onPress={onAttachPress}
          hitSlop={{ top: 8, bottom: 8, start: 8, end: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t('attachment.addPhoto')}
        >
          <Text style={composeStyles.attachIcon}>📎</Text>
        </TouchableOpacity>

        <TextInput
          style={composeStyles.input}
          value={value}
          onChangeText={onChange}
          placeholder={t('groups.sendPlaceholder')}
          placeholderTextColor="#9E9E9E"
          multiline
          maxLength={4000}
          textAlign={I18nManager.isRTL ? 'right' : 'left'}
          returnKeyType="default"
        />

        <TouchableOpacity
          style={[
            composeStyles.sendBtn,
            (!value.trim() || sending) && composeStyles.sendBtnDisabled,
          ]}
          onPress={onSend}
          disabled={!value.trim() || sending}
          accessibilityRole="button"
          accessibilityLabel={t('groups.send')}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={composeStyles.sendIcon}>↑</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const composeStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: '#FFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
    gap: 8,
  },
  attachIcon: { fontSize: 22, paddingBottom: 6 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    maxHeight: 120,
    fontSize: 15,
    backgroundColor: '#FAFAFA',
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#1976D2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#BDBDBD' },
  sendIcon: { fontSize: 18, color: '#FFF', fontWeight: '700', lineHeight: 20 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

/** Route params: conversationId, participantName, participantId */
export function ConversationScreen(): ReactElement {
  const {
    conversationId,
    participantName,
    participantId,
  } = useLocalSearchParams<{
    conversationId: string;
    participantName?: string;
    participantId?: string;
  }>();

  // Mock current user id
  const MY_ID = 'current-user';
  const OTHER_ID = participantId ?? 'other-user';
  const displayName = participantName ?? t('conversation.unknown');

  // ── State ────────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyPreviewData | null>(null);
  const [typingVisible, setTypingVisible] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [searchIndex, setSearchIndex] = useState(0);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [showReadReceipts] = useState(true); // from user prefs (stub)

  const listRef = useRef<FlatList<ChatMessage>>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Read-receipts hook ──────────────────────────────────────────────────
  const { readAt } = useReadAt(conversationId ?? '');

  // ── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    const mock = makeMockMessages(PAGE_SIZE, MY_ID, OTHER_ID);
    setMessages(mock);
    setLoading(false);

    // Simulate other user typing after 2 s
    const t1 = setTimeout(() => setTypingVisible(true), 2000);
    const t2 = setTimeout(() => setTypingVisible(false), 5000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [conversationId]);

  // ── Load older messages ───────────────────────────────────────────────────
  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    // Simulate network delay
    setTimeout(() => {
      setMessages((prev) => [
        ...makeMockMessages(PAGE_SIZE, MY_ID, OTHER_ID),
        ...prev,
      ]);
      setHasMore(false); // only one more page in mock
      setLoadingMore(false);
    }, 800);
  }, [loadingMore, hasMore]);

  // ── Send message ──────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText('');

    const outgoing: ChatMessage = {
      id: `msg-out-${Date.now()}`,
      senderId: MY_ID,
      type: 'text',
      text: trimmed,
      status: 'sending',
      createdAt: new Date().toISOString(),
      replyTo: replyTo
        ? { messageId: replyTo.messageId, senderName: replyTo.senderName, snippet: replyTo.snippet }
        : undefined,
    };
    setReplyTo(null);
    setMessages((prev) => [...prev, outgoing]);

    // Scroll to bottom
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);

    // Simulate network
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === outgoing.id ? { ...m, status: 'sent' as MessageStatus } : m,
        ),
      );
      setSending(false);
    }, 600);

    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === outgoing.id ? { ...m, status: 'delivered' as MessageStatus } : m,
        ),
      );
    }, 1200);
  }, [text, sending, replyTo]);

  // ── Search ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    searchTimerRef.current = setTimeout(() => {
      const q = searchQuery.toLowerCase();
      const ids = messages
        .filter((m) => m.type === 'text' && m.text?.toLowerCase().includes(q))
        .map((m) => m.id);
      setSearchResults(ids);
      setSearchIndex(0);
    }, SEARCH_DEBOUNCE_MS);
  }, [searchQuery, messages]);

  const scrollToSearchResult = useCallback(
    (idx: number) => {
      if (searchResults.length === 0) return;
      const id = searchResults[idx];
      const msgIdx = messages.findIndex((m) => m.id === id);
      if (msgIdx >= 0) {
        listRef.current?.scrollToIndex({ index: msgIdx, animated: true, viewPosition: 0.5 });
      }
    },
    [searchResults, messages],
  );

  const handleSearchPrev = useCallback(() => {
    const next = (searchIndex - 1 + searchResults.length) % searchResults.length;
    setSearchIndex(next);
    scrollToSearchResult(next);
  }, [searchIndex, searchResults, scrollToSearchResult]);

  const handleSearchNext = useCallback(() => {
    const next = (searchIndex + 1) % searchResults.length;
    setSearchIndex(next);
    scrollToSearchResult(next);
  }, [searchIndex, searchResults, scrollToSearchResult]);

  // ── Bubble callbacks ──────────────────────────────────────────────────────
  const bubbleCallbacks = useMemo<MessageBubbleCallbacks>(() => ({
    onReply: (msg) => {
      setReplyTo({
        messageId: msg.id,
        senderName: msg.senderId === MY_ID ? t('conversation.you') : (displayName),
        snippet: msg.text ?? (msg.type),
        contentType: msg.type !== 'text' ? msg.type : undefined,
      });
    },
    onForward: (_msg) => {
      // Stub – forward screen not yet implemented
    },
    onDelete: (msg, forEveryone) => {
      if (forEveryone) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id ? { ...m, deletedForEveryone: true } : m,
          ),
        );
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id ? { ...m, deletedForMe: true } : m,
          ),
        );
      }
    },
    onImagePress: (url) => setLightboxUrl(url),
    onLocationPress: (loc) => {
      // Handled inside LocationMessage via Linking
    },
    onPlacePress: (_placeId) => {
      // Navigate to place detail
    },
  }), [displayName]);

  // ── Render item ──────────────────────────────────────────────────────────
  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => {
      const isHighlighted = searchResults[searchIndex] === item.id;
      return (
        <View style={isHighlighted ? styles.highlighted : undefined}>
          <MessageBubble
            message={item}
            isOwn={item.senderId === MY_ID}
            showReadReceipts={showReadReceipts}
            callbacks={bubbleCallbacks}
          />
        </View>
      );
    },
    [bubbleCallbacks, showReadReceipts, searchResults, searchIndex],
  );

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  const ListHeader = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={styles.loadMoreIndicator}>
        <ActivityIndicator size="small" color="#9E9E9E" />
      </View>
    );
  }, [loadingMore]);

  const ListFooter = useCallback(() => {
    if (!typingVisible) return null;
    return (
      <View style={styles.typingRow}>
        <TypingIndicator />
      </View>
    );
  }, [typingVisible]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ConversationHeader
          name={displayName}
          avatarInitial={displayName.charAt(0).toUpperCase()}
          isOnline={false}
          onSearchPress={() => setShowSearch((v) => !v)}
          onBack={() => { /* expo-router back */ }}
        />

        {showSearch ? (
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            onClose={() => { setShowSearch(false); setSearchQuery(''); }}
            resultCount={searchResults.length}
            currentIndex={searchIndex}
            onPrev={handleSearchPrev}
            onNext={handleSearchNext}
          />
        ) : null}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#1976D2" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            onEndReached={loadMore}
            onEndReachedThreshold={0.2}
            ListHeaderComponent={ListHeader}
            ListFooterComponent={ListFooter}
            onScrollToIndexFailed={() => {}}
            inverted={false}
            removeClippedSubviews
            initialNumToRender={20}
            maxToRenderPerBatch={12}
            windowSize={7}
            onContentSizeChange={() =>
              listRef.current?.scrollToEnd({ animated: false })
            }
          />
        )}

        <ComposeBar
          value={text}
          onChange={setText}
          onSend={handleSend}
          onAttachPress={() => { /* attachment picker stub */ }}
          sending={sending}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
        />
      </KeyboardAvoidingView>

      <ImageViewerModal
        url={lightboxUrl}
        onClose={() => setLightboxUrl(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#EFEFEF' },
  kav: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: {
    paddingVertical: 8,
    paddingBottom: 4,
  },
  typingRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    alignItems: 'flex-start',
  },
  loadMoreIndicator: {
    padding: 12,
    alignItems: 'center',
  },
  highlighted: {
    backgroundColor: 'rgba(255, 235, 59, 0.25)',
    borderRadius: 8,
  },
});
