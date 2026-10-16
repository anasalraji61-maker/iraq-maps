/**
 * ContactsScreen — contacts/directory for the messaging feature.
 *
 * Features:
 * - Users I've messaged (personal contacts)
 * - Providers / businesses I've contacted
 * - Search contacts
 * - Recent contacts horizontal strip
 * - Suggested contacts (from places visited)
 * - Block list management
 */
import { Banner, EmptyState, Screen, Text } from '@iraq-maps/ui';
import { useRouter } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  TextInput,
  View,
  Text as RNText,
} from 'react-native';
import { t } from '../strings';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ContactKind = 'user' | 'provider';

export interface Contact {
  id: string;
  kind: ContactKind;
  name: string;
  subtitle?: string; // role or business category
  avatarUrl?: string;
  lastContactedAt?: string;
  isBlocked: boolean;
  /** For providers: place ID so we can navigate to the listing */
  placeId?: string;
  /** For users: username handle */
  handle?: string;
}

interface ContactSection {
  title: string;
  data: Contact[];
}

type ActiveTab = 'all' | 'users' | 'providers' | 'blocked';

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_CONTACTS: Contact[] = [
  {
    id: 'u-1', kind: 'user', name: 'علي حسين', handle: '@ali.hussein',
    lastContactedAt: new Date(Date.now() - 3600000).toISOString(), isBlocked: false,
  },
  {
    id: 'u-2', kind: 'user', name: 'فاطمة أحمد', handle: '@fatima.a',
    lastContactedAt: new Date(Date.now() - 86400000).toISOString(), isBlocked: false,
  },
  {
    id: 'u-3', kind: 'user', name: 'محمد كريم', handle: '@mkarem',
    lastContactedAt: new Date(Date.now() - 2 * 86400000).toISOString(), isBlocked: true,
  },
  {
    id: 'p-1', kind: 'provider', name: 'مطعم السلام', subtitle: 'مطاعم', placeId: 'place-1',
    lastContactedAt: new Date(Date.now() - 1800000).toISOString(), isBlocked: false,
  },
  {
    id: 'p-2', kind: 'provider', name: 'صيدلية النور', subtitle: 'صيدليات', placeId: 'place-2',
    lastContactedAt: new Date(Date.now() - 7200000).toISOString(), isBlocked: false,
  },
  {
    id: 'p-3', kind: 'provider', name: 'سوبرماركت الخير', subtitle: 'بقالة', placeId: 'place-3',
    lastContactedAt: new Date(Date.now() - 3 * 86400000).toISOString(), isBlocked: false,
  },
  {
    id: 'p-4', kind: 'provider', name: 'ورشة الميكانيك', subtitle: 'خدمات السيارات', placeId: 'place-4',
    lastContactedAt: new Date(Date.now() - 5 * 86400000).toISOString(), isBlocked: false,
  },
];

const MOCK_SUGGESTED: Contact[] = [
  {
    id: 'sug-1', kind: 'provider', name: 'فندق بغداد الدولي', subtitle: 'فنادق',
    placeId: 'place-sug-1', isBlocked: false,
  },
  {
    id: 'sug-2', kind: 'provider', name: 'مركز التسوق الجديد', subtitle: 'مراكز تسوق',
    placeId: 'place-sug-2', isBlocked: false,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name.split(' ').map((w) => w[0] ?? '').slice(0, 2).join('').toUpperCase();
}

function stringToHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % 360;
}

function fmtRelative(iso?: string): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 2) return t('time.justNow');
  if (diffMin < 60) return t('time.minutesAgo', { n: diffMin });
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return t('time.hoursAgo', { n: diffH });
  return new Date(iso).toLocaleDateString('ar', { day: 'numeric', month: 'short' });
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ contact, size = 44 }: { contact: Contact; size?: number }): ReactElement {
  const h = stringToHue(contact.name);
  const bg = contact.kind === 'provider'
    ? `hsl(${h}, 50%, 50%)`
    : `hsl(${h}, 55%, 60%)`;
  return (
    <View
      style={[
        avStyles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
      ]}
      accessibilityElementsHidden
    >
      <RNText style={[avStyles.text, { fontSize: size * 0.36 }]}>{initials(contact.name)}</RNText>
      {contact.kind === 'provider' ? (
        <View style={avStyles.providerBadge}>
          <RNText style={avStyles.providerIcon}>🏪</RNText>
        </View>
      ) : null}
    </View>
  );
}

const avStyles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  text: { color: '#FFF', fontWeight: '700' },
  providerBadge: {
    position: 'absolute',
    bottom: -2,
    end: -2,
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 1,
  },
  providerIcon: { fontSize: 10 },
});

// ─── Recent Contact Strip ─────────────────────────────────────────────────────

function RecentStrip({ contacts }: { contacts: Contact[] }): ReactElement | null {
  const recent = contacts
    .filter((c) => !c.isBlocked && c.lastContactedAt)
    .sort((a, b) => new Date(b.lastContactedAt!).getTime() - new Date(a.lastContactedAt!).getTime())
    .slice(0, 8);

  if (recent.length === 0) return null;

  return (
    <View style={rsStyles.container}>
      <RNText style={rsStyles.sectionTitle}>{t('contacts.recent')}</RNText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={rsStyles.strip}>
        {recent.map((c) => (
          <Pressable
            key={c.id}
            style={rsStyles.item}
            accessibilityRole="button"
            accessibilityLabel={c.name}
          >
            <Avatar contact={c} size={52} />
            <RNText style={rsStyles.name} numberOfLines={1}>{c.name.split(' ')[0]}</RNText>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const rsStyles = StyleSheet.create({
  container: { marginBottom: 8 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#757575',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  strip: { gap: 12, paddingVertical: 4 },
  item: { alignItems: 'center', gap: 4, width: 60 },
  name: { fontSize: 11, color: '#424242', textAlign: 'center', width: 60 },
});

// ─── Contact Row ──────────────────────────────────────────────────────────────

function ContactRow({
  contact,
  onPress,
  onLongPress,
}: {
  contact: Contact;
  onPress: (c: Contact) => void;
  onLongPress: (c: Contact) => void;
}): ReactElement {
  return (
    <Pressable
      onPress={() => onPress(contact)}
      onLongPress={() => onLongPress(contact)}
      style={({ pressed }) => [crStyles.row, pressed && crStyles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={contact.name}
      testID={`contact-row-${contact.id}`}
    >
      <Avatar contact={contact} />
      <View style={crStyles.info}>
        <RNText style={crStyles.name}>{contact.name}</RNText>
        <RNText style={crStyles.sub} numberOfLines={1}>
          {contact.subtitle ?? contact.handle ?? ''}
          {contact.lastContactedAt ? `  ·  ${fmtRelative(contact.lastContactedAt)}` : ''}
        </RNText>
      </View>
      {contact.isBlocked ? (
        <View style={crStyles.blockedBadge}>
          <RNText style={crStyles.blockedText}>{t('contacts.blocked')}</RNText>
        </View>
      ) : (
        <Pressable
          onPress={() => onPress(contact)}
          style={crStyles.messageBtn}
          accessibilityRole="button"
          accessibilityLabel={t('contacts.message', { name: contact.name })}
          hitSlop={8}
        >
          <RNText style={crStyles.messageBtnText}>💬</RNText>
        </Pressable>
      )}
    </Pressable>
  );
}

const crStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  pressed: { backgroundColor: '#F8F8F8' },
  info: { flex: 1 },
  name: { fontSize: 14, color: '#212121', fontWeight: '500' },
  sub: { fontSize: 12, color: '#9E9E9E', marginTop: 1 },
  blockedBadge: {
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  blockedText: { fontSize: 11, color: '#C62828', fontWeight: '600' },
  messageBtn: { padding: 6 },
  messageBtnText: { fontSize: 20 },
});

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }): ReactElement {
  return (
    <View style={shStyles.container}>
      <RNText style={shStyles.text}>{title}</RNText>
    </View>
  );
}

const shStyles = StyleSheet.create({
  container: {
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    color: '#757575',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

// ─── Suggested Strip ──────────────────────────────────────────────────────────

function SuggestedContacts({
  contacts,
  onAdd,
}: {
  contacts: Contact[];
  onAdd: (c: Contact) => void;
}): ReactElement | null {
  if (contacts.length === 0) return null;
  return (
    <View style={sugStyles.container}>
      <RNText style={sugStyles.title}>{t('contacts.suggested')}</RNText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={sugStyles.strip}>
        {contacts.map((c) => (
          <View key={c.id} style={sugStyles.card}>
            <Avatar contact={c} size={44} />
            <RNText style={sugStyles.name} numberOfLines={2}>{c.name}</RNText>
            <RNText style={sugStyles.sub} numberOfLines={1}>{c.subtitle}</RNText>
            <Pressable
              onPress={() => onAdd(c)}
              style={sugStyles.addBtn}
              accessibilityRole="button"
              accessibilityLabel={t('contacts.addContact', { name: c.name })}
            >
              <RNText style={sugStyles.addBtnText}>{t('contacts.message', { name: '' }).trim()}</RNText>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const sugStyles = StyleSheet.create({
  container: { marginBottom: 12 },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: '#757575',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  strip: { gap: 10, paddingVertical: 4 },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    width: 120,
    gap: 4,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  name: { fontSize: 12, fontWeight: '600', color: '#212121', textAlign: 'center' },
  sub: { fontSize: 11, color: '#9E9E9E', textAlign: 'center' },
  addBtn: {
    marginTop: 4,
    backgroundColor: '#1976D2',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  addBtnText: { fontSize: 12, color: '#FFF', fontWeight: '600' },
});

// ─── Contact Options Sheet ────────────────────────────────────────────────────

function ContactOptionsSheet({
  contact,
  onClose,
  onBlock,
  onUnblock,
  onMessage,
}: {
  contact: Contact | null;
  onClose: () => void;
  onBlock: (id: string) => void;
  onUnblock: (id: string) => void;
  onMessage: (c: Contact) => void;
}): ReactElement {
  if (!contact) return <></>;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={osStyles.overlay} onPress={onClose}>
        <View style={osStyles.sheet}>
          <View style={osStyles.header}>
            <Avatar contact={contact} size={48} />
            <View>
              <RNText style={osStyles.name}>{contact.name}</RNText>
              <RNText style={osStyles.sub}>{contact.subtitle ?? contact.handle ?? ''}</RNText>
            </View>
          </View>
          {!contact.isBlocked ? (
            <Pressable style={osStyles.row} onPress={() => { onMessage(contact); onClose(); }}>
              <RNText style={osStyles.rowIcon}>💬</RNText>
              <RNText style={osStyles.rowText}>{t('contacts.sendMessage')}</RNText>
            </Pressable>
          ) : null}
          {contact.isBlocked ? (
            <Pressable style={osStyles.row} onPress={() => { onUnblock(contact.id); onClose(); }}>
              <RNText style={osStyles.rowIcon}>🔓</RNText>
              <RNText style={osStyles.rowText}>{t('contacts.unblock')}</RNText>
            </Pressable>
          ) : (
            <Pressable style={osStyles.row} onPress={() => { onBlock(contact.id); onClose(); }}>
              <RNText style={osStyles.rowIcon}>🚫</RNText>
              <RNText style={[osStyles.rowText, { color: '#C62828' }]}>{t('contacts.block')}</RNText>
            </Pressable>
          )}
          <Pressable style={osStyles.cancelBtn} onPress={onClose}>
            <RNText style={osStyles.cancelText}>{t('compose.cancel')}</RNText>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const osStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#00000055',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFF',
    borderTopStartRadius: 20,
    borderTopEndRadius: 20,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  name: { fontSize: 16, fontWeight: '700', color: '#212121' },
  sub: { fontSize: 13, color: '#757575' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
    gap: 12,
  },
  rowIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  rowText: { fontSize: 15, color: '#212121' },
  cancelBtn: { alignItems: 'center', paddingVertical: 14 },
  cancelText: { fontSize: 15, color: '#757575' },
});

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TAB_KEYS: ActiveTab[] = ['all', 'users', 'providers', 'blocked'];

function Tabs({
  active,
  onChange,
  counts,
}: {
  active: ActiveTab;
  onChange: (t: ActiveTab) => void;
  counts: Record<ActiveTab, number>;
}): ReactElement {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tabStyles.row}>
      <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
        {TAB_KEYS.map((key) => (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            style={[tabStyles.tab, active === key && tabStyles.activeTab]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active === key }}
            testID={`contacts-tab-${key}`}
          >
            <RNText style={[tabStyles.text, active === key && tabStyles.activeText]}>
              {t(`contacts.tab.${key}` as Parameters<typeof t>[0])}
              {counts[key] > 0 ? ` (${counts[key]})` : ''}
            </RNText>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const tabStyles = StyleSheet.create({
  row: { marginBottom: 8 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
  },
  activeTab: { backgroundColor: '#1976D2' },
  text: { fontSize: 13, color: '#555', fontWeight: '500' },
  activeText: { color: '#FFF' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function ContactsScreen(): ReactElement {
  const router = useRouter();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('all');
  const [optionsTarget, setOptionsTarget] = useState<Contact | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(undefined);
    try {
      await new Promise((r) => setTimeout(r, 500));
      setContacts(MOCK_CONTACTS);
    } catch {
      setError(t('contacts.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleBlock = (id: string) => {
    Alert.alert(
      t('contacts.blockConfirmTitle'),
      t('contacts.blockConfirmBody'),
      [
        { text: t('compose.cancel'), style: 'cancel' },
        {
          text: t('contacts.block'),
          style: 'destructive',
          onPress: () =>
            setContacts((prev) =>
              prev.map((c) => (c.id === id ? { ...c, isBlocked: true } : c)),
            ),
        },
      ],
    );
  };

  const handleUnblock = (id: string) => {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, isBlocked: false } : c)));
  };

  const handleMessage = (contact: Contact) => {
    if (contact.kind === 'provider' && contact.placeId) {
      router.push({ pathname: '/places/[id]/message', params: { id: contact.placeId } });
    } else {
      router.push({ pathname: '/messages/new', params: { userId: contact.id } });
    }
  };

  // Filter
  const filtered = useMemo(() => {
    let base = contacts;
    if (activeTab === 'users') base = base.filter((c) => c.kind === 'user' && !c.isBlocked);
    else if (activeTab === 'providers') base = base.filter((c) => c.kind === 'provider' && !c.isBlocked);
    else if (activeTab === 'blocked') base = base.filter((c) => c.isBlocked);
    else base = base.filter((c) => !c.isBlocked);

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      base = base.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.subtitle?.toLowerCase().includes(q) ?? false) ||
          (c.handle?.toLowerCase().includes(q) ?? false),
      );
    }
    return base;
  }, [contacts, activeTab, query]);

  // Group by alpha for SectionList
  const sections = useMemo((): ContactSection[] => {
    if (query.trim()) {
      return filtered.length > 0 ? [{ title: t('contacts.searchResults'), data: filtered }] : [];
    }

    // Recent + rest
    const recent = filtered
      .filter((c) => c.lastContactedAt)
      .sort((a, b) => new Date(b.lastContactedAt!).getTime() - new Date(a.lastContactedAt!).getTime())
      .slice(0, 4);
    const recentIds = new Set(recent.map((c) => c.id));
    const rest = filtered.filter((c) => !recentIds.has(c.id));

    const result: ContactSection[] = [];
    if (recent.length > 0) result.push({ title: t('contacts.recent'), data: recent });
    if (rest.length > 0) result.push({ title: t('contacts.allContacts'), data: rest });
    return result;
  }, [filtered, query]);

  const tabCounts = useMemo(
    () => ({
      all: contacts.filter((c) => !c.isBlocked).length,
      users: contacts.filter((c) => c.kind === 'user' && !c.isBlocked).length,
      providers: contacts.filter((c) => c.kind === 'provider' && !c.isBlocked).length,
      blocked: contacts.filter((c) => c.isBlocked).length,
    }),
    [contacts],
  );

  return (
    <Screen>
      <Text variant="title">{t('contacts.title')}</Text>

      {/* Search */}
      <View style={mainStyles.searchRow}>
        <TextInput
          style={mainStyles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={t('contacts.searchPlaceholder')}
          clearButtonMode="while-editing"
          accessibilityLabel={t('contacts.searchPlaceholder')}
          testID="contacts-search-input"
        />
      </View>

      {error ? <Banner kind="error" message={error} /> : null}

      {/* Tabs */}
      <Tabs active={activeTab} onChange={setActiveTab} counts={tabCounts} />

      {loading ? (
        <View style={{ paddingTop: 32, alignItems: 'center' }}>
          <RNText style={{ color: '#9E9E9E' }}>{t('contacts.loading')}</RNText>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); void load(true); }}
            />
          }
          ListHeaderComponent={
            activeTab === 'all' && !query.trim() ? (
              <>
                <RecentStrip contacts={contacts.filter((c) => !c.isBlocked)} />
                <SuggestedContacts
                  contacts={MOCK_SUGGESTED}
                  onAdd={(c) => {
                    if (c.placeId) {
                      router.push({ pathname: '/places/[id]/message', params: { id: c.placeId } });
                    }
                  }}
                />
              </>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              title={query.trim() ? t('search.noResults') : t('contacts.empty')}
              body={query.trim() ? '' : t('contacts.emptyBody')}
            />
          }
          renderSectionHeader={({ section }) => <SectionHeader title={section.title} />}
          renderItem={({ item }) => (
            <ContactRow
              contact={item}
              onPress={handleMessage}
              onLongPress={(c) => setOptionsTarget(c)}
            />
          )}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled
        />
      )}

      {/* Options sheet */}
      <ContactOptionsSheet
        contact={optionsTarget}
        onClose={() => setOptionsTarget(null)}
        onBlock={handleBlock}
        onUnblock={handleUnblock}
        onMessage={(c) => { handleMessage(c); setOptionsTarget(null); }}
      />
    </Screen>
  );
}

const mainStyles = StyleSheet.create({
  searchRow: { marginBottom: 10 },
  searchInput: {
    backgroundColor: '#F0F0F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#212121',
  },
});
