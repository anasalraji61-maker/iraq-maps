import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  I18nManager,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { t } from '../strings';

I18nManager.forceRTL(true);

const PRIMARY = '#1976D2';
const DANGER = '#C62828';
const ICON_CLOSE = String.fromCharCode(0x2715);
const GOLD = '#F9A825';

export interface ConversationPreview {
  id: string;
  title: string;
  firstMessage: string;
  lastMessage: string;
  lastMessageAt: number;
  messageCount: number;
  pinned: boolean;
}

type DateGroup = 'today' | 'yesterday' | 'lastWeek' | 'older';

function getDateGroup(ts: number): DateGroup {
  const now = Date.now();
  const diff = now - ts;
  const day = 86400000;
  if (diff < day) return 'today';
  if (diff < 2 * day) return 'yesterday';
  if (diff < 7 * day) return 'lastWeek';
  return 'older';
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('ar-IQ', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ConversationCard({
  item,
  onPress,
  onDelete,
  onPin,
  onExport,
}: {
  item: ConversationPreview;
  onPress: (id: string) => void;
  onDelete: (id: string) => void;
  onPin: (id: string) => void;
  onExport: (id: string) => void;
}): ReactElement {
  const [expanded, setExpanded] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const toggleActions = () => {
    const toValue = expanded ? 0 : 1;
    Animated.spring(slideAnim, { toValue, useNativeDriver: true, tension: 80, friction: 10 }).start();
    setExpanded(!expanded);
  };

  const actionsTranslate = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [100, 0],
  });

  return (
    <Pressable
      style={[styles.card, item.pinned && styles.cardPinned]}
      onPress={() => onPress(item.id)}
      onLongPress={toggleActions}
      accessibilityRole="button"
      accessibilityLabel={item.title}
      accessibilityHint={t('history.openHint')}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          {item.pinned ? <Text style={styles.pinIcon}>📌</Text> : null}
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        </View>
        <Text style={styles.cardDate}>{formatDate(item.lastMessageAt)}</Text>
      </View>

      <Text style={styles.cardPreview} numberOfLines={2}>{item.lastMessage}</Text>

      <View style={styles.cardFooter}>
        <Text style={styles.cardCount}>{t('history.messageCount', { count: String(item.messageCount) })}</Text>
        <Pressable onPress={toggleActions} style={styles.moreBtn} accessibilityRole="button" accessibilityLabel={t('history.moreActions')}>
          <Text style={styles.moreBtnText}>•••</Text>
        </Pressable>
      </View>

      {expanded ? (
        <Animated.View style={[styles.actionsRow, { transform: [{ translateX: actionsTranslate }] }]}>
          <Pressable
            style={[styles.actionBtn, styles.actionBtnContinue]}
            onPress={() => { setExpanded(false); onPress(item.id); }}
            accessibilityRole="button"
            accessibilityLabel={t('history.continue')}
          >
            <Text style={styles.actionBtnText}>{t('history.continue')}</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, styles.actionBtnPin]}
            onPress={() => { setExpanded(false); onPin(item.id); }}
            accessibilityRole="button"
            accessibilityLabel={item.pinned ? t('history.unpin') : t('history.pin')}
          >
            <Text style={styles.actionBtnText}>{item.pinned ? t('history.unpin') : t('history.pin')}</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, styles.actionBtnExport]}
            onPress={() => { setExpanded(false); onExport(item.id); }}
            accessibilityRole="button"
            accessibilityLabel={t('history.export')}
          >
            <Text style={styles.actionBtnText}>{t('history.export')}</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, styles.actionBtnDelete]}
            onPress={() => { setExpanded(false); onDelete(item.id); }}
            accessibilityRole="button"
            accessibilityLabel={t('history.delete')}
          >
            <Text style={styles.actionBtnText}>{t('history.delete')}</Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </Pressable>
  );
}

function SectionHeader({ label }: { label: string }): ReactElement {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{label}</Text>
    </View>
  );
}

/** Stub: in production, load from AsyncStorage or API */
function useMockConversations() {
  const [conversations, setConversations] = useState<ConversationPreview[]>([
    {
      id: 'conv-1',
      title: t('history.mockTitle1'),
      firstMessage: t('history.mockFirst1'),
      lastMessage: t('history.mockLast1'),
      lastMessageAt: Date.now() - 1000 * 60 * 30,
      messageCount: 8,
      pinned: false,
    },
    {
      id: 'conv-2',
      title: t('history.mockTitle2'),
      firstMessage: t('history.mockFirst2'),
      lastMessage: t('history.mockLast2'),
      lastMessageAt: Date.now() - 1000 * 60 * 60 * 26,
      messageCount: 14,
      pinned: true,
    },
    {
      id: 'conv-3',
      title: t('history.mockTitle3'),
      firstMessage: t('history.mockFirst3'),
      lastMessage: t('history.mockLast3'),
      lastMessageAt: Date.now() - 1000 * 60 * 60 * 72,
      messageCount: 5,
      pinned: false,
    },
    {
      id: 'conv-4',
      title: t('history.mockTitle4'),
      firstMessage: t('history.mockFirst4'),
      lastMessage: t('history.mockLast4'),
      lastMessageAt: Date.now() - 1000 * 60 * 60 * 24 * 14,
      messageCount: 3,
      pinned: false,
    },
  ]);

  const remove = useCallback((id: string) => {
    setConversations(prev => prev.filter(c => c.id !== id));
  }, []);

  const togglePin = useCallback((id: string) => {
    setConversations(prev => prev.map(c => c.id === id ? { ...c, pinned: !c.pinned } : c));
  }, []);

  return { conversations, remove, togglePin };
}

type ListItem =
  | { type: 'header'; label: string; key: string }
  | { type: 'card'; conversation: ConversationPreview; key: string };

export function AssistantHistoryScreen(): ReactElement {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const { conversations, remove, togglePin } = useMockConversations();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [fadeAnim]);

  const filtered = search.trim()
    ? conversations.filter(c =>
        c.title.includes(search) ||
        c.firstMessage.includes(search) ||
        c.lastMessage.includes(search),
      )
    : conversations;

  // Sort: pinned first, then by date desc
  const sorted = [...filtered].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.lastMessageAt - a.lastMessageAt;
  });

  const groupLabelMap: Record<DateGroup, string> = {
    today: t('history.groupToday'),
    yesterday: t('history.groupYesterday'),
    lastWeek: t('history.groupLastWeek'),
    older: t('history.groupOlder'),
  };

  // Build flat list with section headers
  const listItems: ListItem[] = [];
  const seenGroups = new Set<string>();
  for (const conv of sorted) {
    const group = conv.pinned ? 'pinned' : getDateGroup(conv.lastMessageAt);
    const groupLabel = conv.pinned ? t('history.groupPinned') : groupLabelMap[group as DateGroup] ?? '';
    if (!seenGroups.has(group)) {
      seenGroups.add(group);
      listItems.push({ type: 'header', label: groupLabel, key: `header-${group}` });
    }
    listItems.push({ type: 'card', conversation: conv, key: conv.id });
  }

  const handleContinue = (id: string) => {
    router.push({ pathname: '/assistant/chat', params: { resumeSessionId: id } });
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      t('history.deleteTitle'),
      t('history.deleteConfirm'),
      [
        { text: t('history.cancel'), style: 'cancel' },
        {
          text: t('history.delete'),
          style: 'destructive',
          onPress: () => remove(id),
        },
      ],
    );
  };

  const handleExport = async (id: string) => {
    const conv = conversations.find(c => c.id === id);
    if (!conv) return;
    const text = `${conv.title}\n\n${conv.firstMessage}\n...\n${conv.lastMessage}`;
    try {
      await Share.share({ message: text, title: conv.title });
    } catch {
      // user dismissed share sheet — not an error
    }
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('history.back')}
        >
          <Text style={styles.backBtnText}>{'‹'}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{t('history.title')}</Text>
        <Pressable
          onPress={() => router.push('/assistant/chat')}
          style={styles.newBtn}
          accessibilityRole="button"
          accessibilityLabel={t('history.newChat')}
        >
          <Text style={styles.newBtnText}>{t('history.newChat')}</Text>
        </Pressable>
      </View>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={t('history.searchPlaceholder')}
          placeholderTextColor="#999"
          clearButtonMode="while-editing"
          returnKeyType="search"
          accessibilityLabel={t('history.searchPlaceholder')}
        />
        {search.length > 0 ? (
          <Pressable onPress={() => setSearch('')} style={styles.clearSearch} accessibilityRole="button" accessibilityLabel={t('history.clearSearch')}>
            <Text style={styles.clearSearchText} accessibilityElementsHidden>{ICON_CLOSE}</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Stats bar */}
      {conversations.length > 0 ? (
        <View style={styles.statsBar}>
          <Text style={styles.statsText}>
            {t('history.totalConversations', { count: String(conversations.length) })}
          </Text>
          {filtered.length !== conversations.length ? (
            <Text style={styles.statsText}>
              {t('history.filteredCount', { count: String(filtered.length) })}
            </Text>
          ) : null}
        </View>
      ) : null}

      {listItems.length === 0 ? (
        <ScrollView contentContainerStyle={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>💬</Text>
          <Text style={styles.emptyTitle}>{search ? t('history.noSearchResults') : t('history.empty')}</Text>
          <Text style={styles.emptySubtitle}>{search ? t('history.noSearchResultsHint') : t('history.emptyHint')}</Text>
          {!search ? (
            <Pressable
              style={styles.startChatBtn}
              onPress={() => router.push('/assistant/chat')}
              accessibilityRole="button"
              accessibilityLabel={t('history.startChat')}
            >
              <Text style={styles.startChatBtnText}>{t('history.startChat')}</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      ) : (
        <FlatList
          data={listItems}
          keyExtractor={item => item.key}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            if (item.type === 'header') {
              return <SectionHeader label={item.label} />;
            }
            return (
              <ConversationCard
                item={item.conversation}
                onPress={handleContinue}
                onDelete={handleDelete}
                onPin={togglePin}
                onExport={id => { void handleExport(id); }}
              />
            );
          }}
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: PRIMARY,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  backBtnText: {
    color: '#FFF',
    fontSize: 24,
    lineHeight: 28,
  },
  headerTitle: {
    flex: 1,
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'auto',
  },
  newBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  newBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '500',
  },
  searchRow: {
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DDD',
  },
  searchInput: {
    flex: 1,
    height: 38,
    backgroundColor: '#F0F0F0',
    borderRadius: 19,
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#222',
    textAlign: 'auto',
  },
  clearSearch: {
    marginStart: 8,
    padding: 4,
  },
  clearSearchText: {
    color: '#757575',
    fontSize: 16,
  },
  statsBar: {
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 6,
    flexDirection: 'row',
    gap: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DDD',
  },
  statsText: {
    fontSize: 12,
    color: '#757575',
  },
  listContent: {
    padding: 12,
    paddingBottom: 24,
    gap: 6,
  },
  sectionHeader: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginTop: 8,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#757575',
    textTransform: 'uppercase',
    textAlign: 'auto',
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  cardPinned: {
    borderStartWidth: 3,
    borderStartColor: GOLD,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  cardTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pinIcon: {
    fontSize: 14,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#212121',
    textAlign: 'auto',
  },
  cardDate: {
    fontSize: 11,
    color: '#9E9E9E',
    textAlign: 'auto',
  },
  cardPreview: {
    fontSize: 13,
    color: '#616161',
    lineHeight: 18,
    textAlign: 'auto',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  cardCount: {
    fontSize: 11,
    color: '#9E9E9E',
  },
  moreBtn: {
    padding: 4,
  },
  moreBtnText: {
    color: '#9E9E9E',
    fontSize: 16,
    letterSpacing: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  actionBtn: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flex: 1,
    minWidth: 70,
    alignItems: 'center',
  },
  actionBtnContinue: {
    backgroundColor: PRIMARY,
  },
  actionBtnPin: {
    backgroundColor: GOLD,
  },
  actionBtnExport: {
    backgroundColor: '#43A047',
  },
  actionBtnDelete: {
    backgroundColor: DANGER,
  },
  actionBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 12,
  },
  emptyIcon: {
    fontSize: 56,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#424242',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
    lineHeight: 20,
  },
  startChatBtn: {
    marginTop: 8,
    backgroundColor: PRIMARY,
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  startChatBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
