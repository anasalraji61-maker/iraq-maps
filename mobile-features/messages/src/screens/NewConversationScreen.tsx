/**
 * NewConversationScreen – start a 1-to-1 or group conversation.
 *
 * Features:
 * - Search users/providers by name
 * - Recent contacts list
 * - Suggested contacts (from social graph stub)
 * - Select multiple → create group
 * - "Message Business" entry point
 */
import { useRouter } from 'expo-router';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  I18nManager,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ─── Types ────────────────────────────────────────────────────────────────────

type ContactKind = 'user' | 'provider' | 'suggested';

interface Contact {
  id: string;
  displayName: string;
  subtitle?: string;
  kind: ContactKind;
  avatarInitial: string;
  isOnline?: boolean;
}

interface Section {
  title: string;
  data: Contact[];
}

// ─── Mock data ────────────────────────────────────────────────────────────────

/* eslint-disable no-restricted-syntax */
const RECENT_CONTACTS: Contact[] = [
  { id: 'u1', displayName: 'أحمد السامرائي', subtitle: t('conversation.online'), kind: 'user', avatarInitial: 'أ', isOnline: true },
  { id: 'u2', displayName: 'فاطمة الزهراء', subtitle: t('time.yesterday'), kind: 'user', avatarInitial: 'ف' },
  { id: 'u3', displayName: 'مطعم الشرق', subtitle: t('list.status.replied'), kind: 'provider', avatarInitial: 'م' },
];

const SUGGESTED_CONTACTS: Contact[] = [
  { id: 's1', displayName: 'علي حسن', kind: 'suggested', avatarInitial: 'ع' },
  { id: 's2', displayName: 'سارة محمد', kind: 'suggested', avatarInitial: 'س' },
  { id: 's3', displayName: 'كافيه بغداد', subtitle: 'مقهى ومطعم', kind: 'provider', avatarInitial: 'ك' },
];

/* eslint-enable no-restricted-syntax */

function searchContacts(q: string): Contact[] {
  const all = [...RECENT_CONTACTS, ...SUGGESTED_CONTACTS];
  const lq = q.toLowerCase();
  return all.filter(
    (c) =>
      c.displayName.toLowerCase().includes(lq) ||
      c.subtitle?.toLowerCase().includes(lq),
  );
}

// ─── Contact row ──────────────────────────────────────────────────────────────

interface ContactRowProps {
  contact: Contact;
  selected: boolean;
  selectionMode: boolean;
  onPress: (c: Contact) => void;
  onLongPress: (c: Contact) => void;
}

function ContactRow({
  contact,
  selected,
  selectionMode,
  onPress,
  onLongPress,
}: ContactRowProps): ReactElement {
  const kindColor: Record<ContactKind, string> = {
    user: '#1976D2',
    provider: '#E65100',
    suggested: '#6A1B9A',
  };

  return (
    <TouchableOpacity
      style={[styles.contactRow, selected && styles.contactRowSelected]}
      onPress={() => onPress(contact)}
      onLongPress={() => onLongPress(contact)}
      accessibilityRole="button"
      activeOpacity={0.75}
    >
      {selectionMode ? (
        <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
          {/* eslint-disable-next-line i18next/no-literal-string */}
          {selected ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
      ) : null}

      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: kindColor[contact.kind] + '22' }]}>
        <Text style={[styles.avatarInitial, { color: kindColor[contact.kind] }]}>
          {contact.avatarInitial}
        </Text>
        {contact.isOnline ? <View style={styles.onlineDot} /> : null}
      </View>

      {/* Info */}
      <View style={styles.contactInfo}>
        <Text style={styles.contactName} numberOfLines={1}>{contact.displayName}</Text>
        {contact.subtitle ? (
          <Text style={styles.contactSubtitle} numberOfLines={1}>{contact.subtitle}</Text>
        ) : null}
      </View>

      {/* Kind badge */}
      {contact.kind === 'provider' ? (
        <View style={styles.providerBadge}>
          <Text style={styles.providerBadgeText}>🏢</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

// ─── Selected chips ───────────────────────────────────────────────────────────

interface SelectedChipsProps {
  selected: Contact[];
  onRemove: (id: string) => void;
}

function SelectedChips({ selected, onRemove }: SelectedChipsProps): ReactElement | null {
  if (selected.length === 0) return null;
  return (
    <View style={styles.chipsRow}>
      <FlatList
        horizontal
        data={selected}
        keyExtractor={(c) => c.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.chip}
            onPress={() => onRemove(item.id)}
            accessibilityRole="button"
          >
            <Text style={styles.chipInitial}>{item.avatarInitial}</Text>
            <Text style={styles.chipName} numberOfLines={1}>{item.displayName}</Text>
            <Text style={styles.chipRemove}>✕</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function NewConversationScreen(): ReactElement {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selected, setSelected] = useState<Contact[]>([]);
  const selectionMode = selected.length > 0;
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Search debounce ───────────────────────────────────────────────────────
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    searchTimerRef.current = setTimeout(() => {
      const results = searchContacts(query);
      setSearchResults(results);
      setIsSearching(false);
    }, 280);
  }, [query]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleContactPress = useCallback(
    (contact: Contact) => {
      if (selectionMode) {
        // Toggle selection
        setSelected((prev) =>
          prev.some((c) => c.id === contact.id)
            ? prev.filter((c) => c.id !== contact.id)
            : [...prev, contact],
        );
        return;
      }
      // Start 1-to-1 conversation
      router.push({
        pathname: '/(messages)/conversation',
        params: {
          participantId: contact.id,
          participantName: contact.displayName,
          conversationId: `conv-${contact.id}`,
        },
      } as never);
    },
    [selectionMode, router],
  );

  const handleLongPress = useCallback((contact: Contact) => {
    setSelected((prev) =>
      prev.some((c) => c.id === contact.id)
        ? prev.filter((c) => c.id !== contact.id)
        : [...prev, contact],
    );
  }, []);

  const handleCreateGroup = useCallback(() => {
    if (selected.length < 2) return;
    router.push({
      pathname: '/(messages)/create-group',
      params: { memberIds: selected.map((c) => c.id).join(',') },
    } as never);
  }, [selected, router]);

  // ── Sections ──────────────────────────────────────────────────────────────
  const sections: Section[] = query.trim()
    ? [{ title: t('search.placeholder'), data: searchResults }]
    : [
        { title: t('conversation.recent'), data: RECENT_CONTACTS },
        { title: t('conversation.suggested'), data: SUGGESTED_CONTACTS },
      ];

  const isSelected = (id: string) => selected.some((c) => c.id === id);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          // eslint-disable-next-line no-restricted-syntax
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
        >
          <Text style={styles.headerBack}>{I18nManager.isRTL ? '›' : '‹'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('list.start')}</Text>
        {selectionMode ? (
          <TouchableOpacity
            style={styles.createGroupBtn}
            onPress={handleCreateGroup}
            disabled={selected.length < 2}
          >
            <Text style={[styles.createGroupLabel, selected.length < 2 && styles.createGroupLabelDisabled]}>
              {t('groups.create')} ({selected.length})
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={t('search.placeholder')}
          placeholderTextColor="#9E9E9E"
          returnKeyType="search"
          clearButtonMode="while-editing"
          textAlign={I18nManager.isRTL ? 'right' : 'left'}
        />
        {isSearching ? <ActivityIndicator size="small" color="#9E9E9E" /> : null}
      </View>

      {/* Selected chips */}
      <SelectedChips
        selected={selected}
        onRemove={(id) => setSelected((prev) => prev.filter((c) => c.id !== id))}
      />

      {/* "Message a Business" shortcut */}
      {!query.trim() ? (
        <TouchableOpacity
          style={styles.businessRow}
          onPress={() => router.push('/(messages)/compose' as never)}
          accessibilityRole="button"
        >
          <View style={styles.businessIcon}>
            <Text style={styles.businessIconText}>🏢</Text>
          </View>
          <View style={styles.businessInfo}>
            <Text style={styles.businessLabel}>{t('conversation.messageBusiness')}</Text>
            <Text style={styles.businessSub}>{t('conversation.messageBusinessSub')}</Text>
          </View>
          <Text style={styles.businessChevron}>{I18nManager.isRTL ? '‹' : '›'}</Text>
        </TouchableOpacity>
      ) : null}

      {/* Contact list */}
      {query.trim() && searchResults.length === 0 && !isSearching ? (
        <View style={styles.emptySearch}>
          <Text style={styles.emptySearchText}>{t('search.noResults')}</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <ContactRow
              contact={item}
              selected={isSelected(item.id)}
              selectionMode={selectionMode}
              onPress={handleContactPress}
              onLongPress={handleLongPress}
            />
          )}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  headerBack: { fontSize: 24, color: '#1976D2', fontWeight: '700' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#212121' },
  createGroupBtn: { paddingHorizontal: 4 },
  createGroupLabel: { fontSize: 14, color: '#1976D2', fontWeight: '600' },
  createGroupLabelDisabled: { color: '#BDBDBD' },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginVertical: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F5F5F5',
    borderRadius: 22,
    gap: 8,
  },
  searchIcon: { fontSize: 15 },
  searchInput: { flex: 1, fontSize: 15, color: '#212121' },

  chipsRow: {
    height: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  chipInitial: { fontSize: 13, fontWeight: '700', color: '#1976D2' },
  chipName: { fontSize: 13, color: '#212121', maxWidth: 80 },
  chipRemove: { fontSize: 12, color: '#9E9E9E', marginStart: 2 },

  businessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  businessIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFF3E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  businessIconText: { fontSize: 20 },
  businessInfo: { flex: 1 },
  businessLabel: { fontSize: 15, fontWeight: '600', color: '#212121' },
  businessSub: { fontSize: 12, color: '#757575', marginTop: 2 },
  businessChevron: { fontSize: 18, color: '#BDBDBD' },

  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
    backgroundColor: '#FFF',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9E9E9E',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F5F5F5',
  },
  contactRowSelected: { backgroundColor: '#E3F2FD' },

  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#BDBDBD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#1976D2',
    borderColor: '#1976D2',
  },
  checkmark: { fontSize: 12, color: '#FFF', fontWeight: '700' },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarInitial: { fontSize: 18, fontWeight: '700' },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    end: 0,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
    borderWidth: 1.5,
    borderColor: '#FFF',
  },

  contactInfo: { flex: 1 },
  contactName: { fontSize: 15, fontWeight: '500', color: '#212121' },
  contactSubtitle: { fontSize: 12, color: '#9E9E9E', marginTop: 2 },

  providerBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  providerBadgeText: { fontSize: 18 },

  emptySearch: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 60,
  },
  emptySearchText: { fontSize: 14, color: '#9E9E9E' },
});
