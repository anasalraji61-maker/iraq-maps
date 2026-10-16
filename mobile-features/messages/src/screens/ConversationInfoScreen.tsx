/**
 * ConversationInfoScreen – details panel for a direct conversation.
 *
 * Features:
 * - Shared media grid (images)
 * - Shared files list (documents)
 * - Common places (places both users visited)
 * - Notification settings (mute / custom sound stub)
 * - Block / unblock contact
 * - Report conversation
 * - End-to-end encryption indicator (stub label)
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  I18nManager,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SharedMediaItem {
  id: string;
  imageUrl: string;
  createdAt: string;
}

export interface SharedFile {
  id: string;
  filename: string;
  sizeBytes: number;
  mimeType: string;
  url: string;
  createdAt: string;
}

export interface CommonPlace {
  placeId: string;
  name: string;
  address?: string;
  thumbnailUrl?: string;
  category?: string;
}

interface NotificationSettings {
  muted: boolean;
  mutedUntil?: string;
}

// ─── Mock data helpers ────────────────────────────────────────────────────────

function buildMockMedia(): SharedMediaItem[] {
  return Array.from({ length: 12 }, (_, i) => ({
    id: `media-${i}`,
    imageUrl: `https://picsum.photos/seed/${i + 10}/200/200`,
    createdAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
  }));
}

function buildMockFiles(): SharedFile[] {
  const entries = [
    { name: 'contract.pdf', mime: 'application/pdf', size: 245_000 },
    { name: 'catalog.pdf', mime: 'application/pdf', size: 1_200_000 },
    { name: 'invoice.xlsx', mime: 'application/vnd.ms-excel', size: 80_000 },
    { name: 'report.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 350_000 },
  ];
  return entries.map((e, i) => ({
    id: `file-${i}`,
    filename: e.name,
    sizeBytes: e.size,
    mimeType: e.mime,
    url: `https://example.com/files/${i}`,
    createdAt: new Date(Date.now() - i * 3 * 24 * 60 * 60 * 1000).toISOString(),
  }));
}

function buildMockPlaces(): CommonPlace[] {
  return [
    { placeId: 'p1', name: 'Al-Saray Restaurant', address: 'Al-Mutanabbi St, Baghdad', category: 'restaurant' },
    { placeId: 'p2', name: 'Al-Qishla Cafe', address: 'Al-Rashid St, Baghdad', category: 'cafe' },
    { placeId: 'p3', name: 'Baghdad Mall', address: 'Jadiriya, Baghdad', category: 'mall' },
  ];
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, count }: { title: string; count?: number }): ReactElement {
  return (
    <View style={sectionStyles.header}>
      <Text style={sectionStyles.title}>{title}</Text>
      {count !== undefined && (
        <Text style={sectionStyles.count}>{count}</Text>
      )}
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
    gap: 8,
  },
  title: { fontSize: 14, fontWeight: '700', color: '#616161' },
  count: {
    fontSize: 12,
    color: '#9E9E9E',
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
});

// ─── Shared media grid ────────────────────────────────────────────────────────

function SharedMediaGrid({
  media,
  onPress,
}: {
  media: SharedMediaItem[];
  onPress: (item: SharedMediaItem) => void;
}): ReactElement {
  const SIZE = 112;

  if (media.length === 0) {
    return (
      <View style={gridStyles.empty}>
        <Text style={gridStyles.emptyText}>{t('search.noResults')}</Text>
      </View>
    );
  }

  return (
    <View style={gridStyles.grid}>
      {media.map((item) => (
        <TouchableOpacity
          key={item.id}
          style={[gridStyles.cell, { width: SIZE, height: SIZE }]}
          onPress={() => onPress(item)}
          accessibilityRole="imagebutton"
        >
          <Image
            source={{ uri: item.imageUrl }}
            style={[gridStyles.image, { width: SIZE, height: SIZE }]}
            resizeMode="cover"
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const gridStyles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    gap: 3,
  },
  cell: { borderRadius: 6, overflow: 'hidden', backgroundColor: '#E0E0E0' },
  image: { borderRadius: 6 },
  empty: { paddingHorizontal: 16, paddingVertical: 12 },
  emptyText: { fontSize: 14, color: '#9E9E9E' },
});

// ─── Shared files list ────────────────────────────────────────────────────────

function FileRow({ file }: { file: SharedFile }): ReactElement {
  const sizeLabel = useMemo(() => {
    if (file.sizeBytes > 1_000_000) return `${(file.sizeBytes / 1_000_000).toFixed(1)} MB`;
    return `${Math.round(file.sizeBytes / 1024)} KB`;
  }, [file.sizeBytes]);

  const icon = file.mimeType.includes('pdf') ? '📕' : file.mimeType.includes('excel') || file.mimeType.includes('spreadsheet') ? '📗' : '📄';

  const open = () => { void Linking.openURL(file.url); };

  return (
    <TouchableOpacity style={fileStyles.row} onPress={open} accessibilityRole="button">
      <Text style={fileStyles.icon}>{icon}</Text>
      <View style={fileStyles.info}>
        <Text style={fileStyles.name} numberOfLines={1}>{file.filename}</Text>
        <Text style={fileStyles.meta}>
          {sizeLabel}
        </Text>
      </View>
      <Text style={fileStyles.open}>{t('detail.open')}</Text>
    </TouchableOpacity>
  );
}

const fileStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F5F5F5',
  },
  icon: { fontSize: 28 },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 14, color: '#212121', fontWeight: '500' },
  meta: { fontSize: 12, color: '#9E9E9E' },
  open: { fontSize: 13, color: '#1976D2' },
});

// ─── Common places ────────────────────────────────────────────────────────────

function PlaceRow({
  place,
  onPress,
}: {
  place: CommonPlace;
  onPress: (placeId: string) => void;
}): ReactElement {
  return (
    <TouchableOpacity
      style={placeStyles.row}
      onPress={() => onPress(place.placeId)}
      accessibilityRole="button"
    >
      <View style={placeStyles.iconWrap}>
        <Text style={placeStyles.icon}>📍</Text>
      </View>
      <View style={placeStyles.info}>
        <Text style={placeStyles.name} numberOfLines={1}>{place.name}</Text>
        {place.address ? (
          <Text style={placeStyles.address} numberOfLines={1}>{place.address}</Text>
        ) : null}
        {place.category ? (
          <View style={placeStyles.categoryWrap}>
            <Text style={placeStyles.category}>{place.category}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const placeStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F5F5F5',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 20 },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 14, fontWeight: '600', color: '#212121' },
  address: { fontSize: 12, color: '#757575' },
  categoryWrap: {
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  category: {
    fontSize: 11,
    color: '#388E3C',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
});

// ─── Notification settings ────────────────────────────────────────────────────

function NotificationSection({
  settings,
  onChange,
}: {
  settings: NotificationSettings;
  onChange: (s: NotificationSettings) => void;
}): ReactElement {
  const muteOptions = [
    { label: t('groups.mute1h'), hours: 1 },
    { label: t('groups.mute8h'), hours: 8 },
    { label: t('groups.mute1w'), hours: 24 * 7 },
    { label: t('groups.muteAlways'), hours: 0 },
  ];

  const handleMuteToggle = (value: boolean) => {
    if (!value) {
      onChange({ muted: false });
      return;
    }
    Alert.alert(
      t('groups.mute'),
      undefined,
      [
        ...muteOptions.map((opt) => ({
          text: opt.label,
          onPress: () => {
            const until = opt.hours > 0
              ? new Date(Date.now() + opt.hours * 60 * 60 * 1000).toISOString()
              : undefined;
            onChange({ muted: true, mutedUntil: until });
          },
        })),
        { text: t('compose.cancel'), style: 'cancel' as const },
      ],
    );
  };

  return (
    <View style={notifStyles.section}>
      <View style={notifStyles.row}>
        <View style={notifStyles.rowInfo}>
          <Text style={notifStyles.rowTitle}>{t('groups.muteNotifications')}</Text>
          {settings.muted && settings.mutedUntil && (
            <Text style={notifStyles.rowSub}>
              {t('groups.mutedUntil', {
                time: new Date(settings.mutedUntil).toLocaleDateString('ar-IQ', {
                  month: 'short',
                  day: 'numeric',
                }),
              })}
            </Text>
          )}
          {settings.muted && !settings.mutedUntil && (
            <Text style={notifStyles.rowSub}>{t('groups.mutedIndefinitely')}</Text>
          )}
        </View>
        <Switch
          value={settings.muted}
          onValueChange={handleMuteToggle}
          trackColor={{ false: '#E0E0E0', true: '#90CAF9' }}
          thumbColor={settings.muted ? '#1976D2' : '#fff'}
          accessibilityRole="switch"
        />
      </View>
    </View>
  );
}

const notifStyles = StyleSheet.create({
  section: {
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F5F5F5',
    gap: 12,
  },
  rowInfo: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, color: '#212121' },
  rowSub: { fontSize: 12, color: '#9E9E9E' },
});

// ─── Danger zone ──────────────────────────────────────────────────────────────

function DangerZone({
  isBlocked,
  onBlock,
  onUnblock,
  onReport,
}: {
  isBlocked: boolean;
  onBlock: () => void;
  onUnblock: () => void;
  onReport: () => void;
}): ReactElement {
  return (
    <View style={dangerStyles.container}>
      <TouchableOpacity
        style={[dangerStyles.btn, dangerStyles.btnBlock]}
        onPress={isBlocked ? onUnblock : onBlock}
        accessibilityRole="button"
      >
        <Text style={dangerStyles.btnBlockText}>
          {isBlocked ? t('contacts.unblock') : t('contacts.block')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[dangerStyles.btn, dangerStyles.btnReport]}
        onPress={onReport}
        accessibilityRole="button"
      >
        <Text style={dangerStyles.btnReportText}>{t('groups.reportConversation')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const dangerStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 12,
  },
  btn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnBlock: { backgroundColor: '#FFF3E0' },
  btnBlockText: { fontSize: 15, fontWeight: '600', color: '#E65100' },
  btnReport: { backgroundColor: '#FFEBEE' },
  btnReportText: { fontSize: 15, fontWeight: '600', color: '#C62828' },
});

// ─── E2E Encryption badge ─────────────────────────────────────────────────────

function EncryptionBadge(): ReactElement {
  return (
    <View style={encStyles.row}>
      <Text style={encStyles.icon}>🔒</Text>
      <View style={encStyles.info}>
        <Text style={encStyles.title}>{t('groups.e2eEncrypted')}</Text>
        <Text style={encStyles.sub}>{t('groups.e2eEncryptedSub')}</Text>
      </View>
    </View>
  );
}

const encStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    backgroundColor: '#E8F5E9',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
  },
  icon: { fontSize: 22 },
  info: { flex: 1, gap: 2 },
  title: { fontSize: 14, fontWeight: '600', color: '#2E7D32' },
  sub: { fontSize: 12, color: '#388E3C' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function ConversationInfoScreen(): ReactElement {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [sharedMedia, setSharedMedia] = useState<SharedMediaItem[]>([]);
  const [sharedFiles, setSharedFiles] = useState<SharedFile[]>([]);
  const [commonPlaces, setCommonPlaces] = useState<CommonPlace[]>([]);
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>({ muted: false });
  const [isBlocked, setIsBlocked] = useState(false);
  type InfoTab = 'media' | 'files' | 'places';
  const TAB_MEDIA: InfoTab = 'media';
  const TAB_FILES: InfoTab = 'files';
  const TAB_PLACES: InfoTab = 'places';
  const [activeTab, setActiveTab] = useState<InfoTab>(TAB_MEDIA);

  // Load mock data (replace with real API calls)
  useEffect(() => {
    const load = async () => {
      await new Promise((r) => setTimeout(r, 300));
      setSharedMedia(buildMockMedia());
      setSharedFiles(buildMockFiles());
      setCommonPlaces(buildMockPlaces());
      setLoading(false);
    };
    void load();
  }, [conversationId]);

  const handleMediaPress = useCallback((_item: SharedMediaItem) => {
    // Open full-screen viewer
  }, []);

  const handlePlacePress = useCallback(
    (placeId: string) => {
      router.push(`/places/${placeId}` as Parameters<typeof router.push>[0]);
    },
    [router],
  );

  const handleBlock = useCallback(() => {
    Alert.alert(
      t('contacts.blockConfirmTitle'),
      t('contacts.blockConfirmBody'),
      [
        { text: t('compose.cancel'), style: 'cancel' },
        {
          text: t('contacts.block'),
          style: 'destructive',
          onPress: () => setIsBlocked(true),
        },
      ],
    );
  }, []);

  const handleUnblock = useCallback(() => {
    setIsBlocked(false);
  }, []);

  const handleReport = useCallback(() => {
    Alert.alert(
      t('groups.reportConversation'),
      t('groups.reportConversationBody'),
      [
        { text: t('compose.cancel'), style: 'cancel' },
        { text: t('groups.report'), style: 'destructive', onPress: () => undefined },
      ],
    );
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Encryption indicator */}
        <EncryptionBadge />

        {/* Tab bar: Media / Files / Places */}
        <View style={styles.tabBar}>
          {([
            { key: TAB_MEDIA, label: t('groups.sharedMedia'), count: sharedMedia.length },
            { key: TAB_FILES, label: t('groups.sharedFiles'), count: sharedFiles.length },
            { key: TAB_PLACES, label: t('groups.commonPlaces'), count: commonPlaces.length },
          ] as Array<{ key: InfoTab; label: string; count: number }>).map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === tab.key }}
            >
              <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>
                {tab.label}
              </Text>
              {tab.count > 0 && (
                <View style={[styles.tabBadge, activeTab === tab.key && styles.tabBadgeActive]}>
                  <Text style={[styles.tabBadgeText, activeTab === tab.key && styles.tabBadgeTextActive]}>
                    {tab.count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab content */}
        {activeTab === TAB_MEDIA && (
          <>
            <SectionHeader title={t('groups.sharedMedia')} count={sharedMedia.length} />
            <SharedMediaGrid media={sharedMedia} onPress={handleMediaPress} />
          </>
        )}

        {activeTab === TAB_FILES && (
          <>
            <SectionHeader title={t('groups.sharedFiles')} count={sharedFiles.length} />
            {sharedFiles.length === 0 ? (
              <View style={styles.emptySection}>
                <Text style={styles.emptySectionText}>{t('search.noResults')}</Text>
              </View>
            ) : (
              sharedFiles.map((f) => <FileRow key={f.id} file={f} />)
            )}
          </>
        )}

        {activeTab === TAB_PLACES && (
          <>
            <SectionHeader title={t('groups.commonPlaces')} count={commonPlaces.length} />
            {commonPlaces.length === 0 ? (
              <View style={styles.emptySection}>
                <Text style={styles.emptySectionText}>{t('search.noResults')}</Text>
              </View>
            ) : (
              commonPlaces.map((p) => (
                <PlaceRow key={p.placeId} place={p} onPress={handlePlacePress} />
              ))
            )}
          </>
        )}

        {/* Notification settings */}
        <SectionHeader title={t('groups.notifications')} />
        <NotificationSection settings={notifSettings} onChange={setNotifSettings} />

        {/* Danger zone */}
        <DangerZone
          isBlocked={isBlocked}
          onBlock={handleBlock}
          onUnblock={handleUnblock}
          onReport={handleReport}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#F0F0F0',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 9,
    gap: 4,
  },
  tabActive: { backgroundColor: '#fff', elevation: 2, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4 },
  tabLabel: { fontSize: 12, color: '#757575', fontWeight: '500' },
  tabLabelActive: { color: '#1976D2', fontWeight: '700' },
  tabBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
    backgroundColor: '#E0E0E0',
  },
  tabBadgeActive: { backgroundColor: '#E3F2FD' },
  tabBadgeText: { fontSize: 10, color: '#757575', fontWeight: '700' },
  tabBadgeTextActive: { color: '#1976D2' },

  emptySection: { paddingHorizontal: 16, paddingVertical: 12 },
  emptySectionText: { fontSize: 14, color: '#9E9E9E' },
});
