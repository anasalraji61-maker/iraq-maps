/**
 * SafetyScreen — user safety settings and controls.
 *
 * Sections:
 *  - Blocked users list (with unblock)
 *  - Muted users list (with unmute)
 *  - Audience controls: who can see posts / who can message
 *  - Safe-search toggle
 *  - Report history shortcut
 *  - Safety tips
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { t as tFn } from './strings';

// Type-safe wrapper — safety keys added to ar.json; TS inference may lag.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const t = tFn as (key: any, params?: Record<string, string | number>) => string;

const PRIMARY = '#1976D2';
const PRIMARY_DARK = '#1565C0';
const _PRIMARY_LIGHT = '#BBDEFB';
const PRIMARY_XLIGHT = '#E3F2FD';
const ERROR = '#C62828';
const _ERROR_BG = '#FFEBEE';
const SURFACE = '#FFF';
const BG = '#F5F5F5';
const TEXT = '#222';
const TEXT_SECONDARY = '#555';
const TEXT_MUTED = '#999';
const BORDER = '#DDD';
const SUCCESS = '#388E3C';
const SUCCESS_BG = '#E8F5E9';
const _INPUT_BG = '#F0F0F0';
const _WARNING_BG = '#FFF8E1';
const WARNING = '#F57C00';

const STORAGE_KEY_SAFETY = '@iraq-maps/account/safety-settings';
const STORAGE_KEY_BLOCKED = '@iraq-maps/discover/blocked-users';
const STORAGE_KEY_MUTED = '@iraq-maps/account/muted-users';

// ─── Types ────────────────────────────────────────────────────────────────────

type PostVisibility = 'everyone' | 'followers' | 'nobody';
type MessagePermission = 'everyone' | 'followers' | 'nobody';

interface SafetySettings {
  postVisibility: PostVisibility;
  messagePermission: MessagePermission;
  safeSearch: boolean;
}

const DEFAULTS: SafetySettings = {
  postVisibility:    'everyone',
  messagePermission: 'everyone',
  safeSearch:        false,
};

// ─── Persistence helpers ──────────────────────────────────────────────────────

async function loadSettings(): Promise<SafetySettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_SAFETY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<SafetySettings>) };
  } catch {
    return DEFAULTS;
  }
}

async function saveSettings(s: SafetySettings): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_SAFETY, JSON.stringify(s));
  } catch { /* storage unavailable */ }
}

async function loadList(key: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

async function saveList(key: string, list: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(list));
  } catch { /* storage unavailable */ }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
}

function SectionHeader({ title, subtitle }: SectionHeaderProps): ReactElement {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function UserRow({
  userId,
  actionLabel,
  actionColor,
  onAction,
}: {
  userId: string;
  actionLabel: string;
  actionColor: string;
  onAction: () => void;
}): ReactElement {
  return (
    <View style={styles.userRow}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{userId.slice(0, 1).toUpperCase()}</Text>
      </View>
      <Text style={styles.userId} numberOfLines={1}>{userId.slice(0, 16)}</Text>
      <Pressable
        style={[styles.actionBtn, { borderColor: actionColor }]}
        onPress={onAction}
        accessibilityRole="button"
      >
        <Text style={[styles.actionBtnText, { color: actionColor }]}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

type ToggleRowProps = {
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  danger?: boolean;
};

function ToggleRow({ title, subtitle, value, onValueChange, danger }: ToggleRowProps): ReactElement {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleLabels}>
        <Text style={[styles.toggleTitle, danger && { color: ERROR }]}>{title}</Text>
        <Text style={styles.toggleSubtitle}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: danger ? ERROR : PRIMARY, false: BORDER }}
        thumbColor={SURFACE}
        accessibilityRole="switch"
        accessibilityLabel={title}
        accessibilityState={{ checked: value }}
      />
    </View>
  );
}

type VisibilityOption = PostVisibility | MessagePermission;
type SelectRowProps = {
  label: string;
  options: { value: VisibilityOption; label: string }[];
  selected: VisibilityOption;
  onSelect: (v: VisibilityOption) => void;
};

function SelectRow({ label, options, selected, onSelect }: SelectRowProps): ReactElement {
  return (
    <View style={styles.selectRow}>
      <Text style={styles.selectLabel}>{label}</Text>
      <View style={styles.selectOptions}>
        {options.map((opt) => (
          <Pressable
            key={opt.value}
            style={[styles.selectOption, selected === opt.value && styles.selectOptionActive]}
            onPress={() => onSelect(opt.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected === opt.value }}
          >
            <Text style={[styles.selectOptionText, selected === opt.value && styles.selectOptionTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function TipCard({ icon, text }: { icon: string; text: string }): ReactElement {
  return (
    <View style={styles.tipCard}>
      <Text style={styles.tipIcon}>{icon}</Text>
      <Text style={styles.tipText}>{text}</Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export interface SafetyScreenProps {
  onOpenReportHistory?: () => void;
}

export function SafetyScreen({ onOpenReportHistory }: SafetyScreenProps): ReactElement {
  const [settings, setSettings] = useState<SafetySettings>(DEFAULTS);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [muted, setMuted] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      const [s, b, m] = await Promise.all([
        loadSettings(),
        loadList(STORAGE_KEY_BLOCKED),
        loadList(STORAGE_KEY_MUTED),
      ]);
      setSettings(s);
      setBlocked(b);
      setMuted(m);
      setLoading(false);
    })();
  }, []);

  const updateSettings = useCallback(async (patch: Partial<SafetySettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveSettings(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [settings]);

  const unblockUser = useCallback(async (userId: string) => {
    Alert.alert(
      t('safety.unblockConfirmTitle'),
      t('safety.unblockConfirmBody', { userId: userId.slice(0, 8) }),
      [
        { text: t('safety.cancel'), style: 'cancel' },
        {
          text: t('safety.unblock'),
          style: 'destructive',
          onPress: async () => {
            const next = blocked.filter((id) => id !== userId);
            setBlocked(next);
            await saveList(STORAGE_KEY_BLOCKED, next);
          },
        },
      ],
    );
  }, [blocked]);

  const unmuteUser = useCallback(async (userId: string) => {
    const next = muted.filter((id) => id !== userId);
    setMuted(next);
    await saveList(STORAGE_KEY_MUTED, next);
  }, [muted]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>{t('safety.loading')}</Text>
      </View>
    );
  }

  const postVisibilityOptions: { value: PostVisibility; label: string }[] = [
    { value: 'everyone',  label: t('safety.visibilityEveryone') },
    { value: 'followers', label: t('safety.visibilityFollowers') },
    { value: 'nobody',    label: t('safety.visibilityNobody') },
  ];

  const messageOptions: { value: MessagePermission; label: string }[] = [
    { value: 'everyone',  label: t('safety.messageEveryone') },
    { value: 'followers', label: t('safety.messageFollowers') },
    { value: 'nobody',    label: t('safety.messageNobody') },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>{t('safety.title')}</Text>
        {saved && (
          <View style={styles.savedBadge}>
            <Text style={styles.savedBadgeText}>{t('safety.saved')}</Text>
          </View>
        )}
      </View>

      {/* ── Audience controls ────────────────────────────────────────────────── */}
      <View style={styles.card}>
        <SectionHeader
          title={t('safety.audienceTitle')}
          subtitle={t('safety.audienceSubtitle')}
        />

        <SelectRow
          label={t('safety.postVisibilityLabel')}
          options={postVisibilityOptions}
          selected={settings.postVisibility}
          onSelect={(v) => { void updateSettings({ postVisibility: v as PostVisibility }); }}
        />

        <View style={styles.divider} />

        <SelectRow
          label={t('safety.messagePermissionLabel')}
          options={messageOptions}
          selected={settings.messagePermission}
          onSelect={(v) => { void updateSettings({ messagePermission: v as MessagePermission }); }}
        />
      </View>

      {/* ── Safe search ──────────────────────────────────────────────────────── */}
      <View style={styles.card}>
        <SectionHeader title={t('safety.searchTitle')} />
        <ToggleRow
          title={t('safety.safeSearchLabel')}
          subtitle={t('safety.safeSearchSubtitle')}
          value={settings.safeSearch}
          onValueChange={(v) => { void updateSettings({ safeSearch: v }); }}
        />
      </View>

      {/* ── Blocked users ────────────────────────────────────────────────────── */}
      <View style={styles.card}>
        <SectionHeader
          title={t('safety.blockedTitle')}
          subtitle={t('safety.blockedSubtitle', { count: blocked.length })}
        />
        {blocked.length === 0 ? (
          <Text style={styles.emptyText}>{t('safety.blockedEmpty')}</Text>
        ) : (
          <FlatList
            data={blocked}
            keyExtractor={(id) => id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <UserRow
                userId={item}
                actionLabel={t('safety.unblock')}
                actionColor={ERROR}
                onAction={() => { void unblockUser(item); }}
              />
            )}
          />
        )}
      </View>

      {/* ── Muted users ──────────────────────────────────────────────────────── */}
      <View style={styles.card}>
        <SectionHeader
          title={t('safety.mutedTitle')}
          subtitle={t('safety.mutedSubtitle', { count: muted.length })}
        />
        {muted.length === 0 ? (
          <Text style={styles.emptyText}>{t('safety.mutedEmpty')}</Text>
        ) : (
          <FlatList
            data={muted}
            keyExtractor={(id) => id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <UserRow
                userId={item}
                actionLabel={t('safety.unmute')}
                actionColor={WARNING}
                onAction={() => { void unmuteUser(item); }}
              />
            )}
          />
        )}
      </View>

      {/* ── Report history ───────────────────────────────────────────────────── */}
      <View style={styles.card}>
        <SectionHeader title={t('safety.reportsTitle')} />
        <Pressable
          style={styles.linkRow}
          onPress={onOpenReportHistory}
          accessibilityRole="button"
        >
          <Text style={styles.linkText}>{t('safety.viewReportHistory')}</Text>
          <Text style={styles.linkArrow}>←</Text>
        </Pressable>
      </View>

      {/* ── Safety tips ──────────────────────────────────────────────────────── */}
      <View style={styles.card}>
        <SectionHeader title={t('safety.tipsTitle')} />
        <TipCard icon="🔒" text={t('safety.tip1')} />
        <TipCard icon="🚫" text={t('safety.tip2')} />
        <TipCard icon="📢" text={t('safety.tip3')} />
        <TipCard icon="🛡️" text={t('safety.tip4')} />
        <TipCard icon="⚠️" text={t('safety.tip5')} />
      </View>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: TEXT_MUTED,
    fontSize: 14,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: TEXT,
    textAlign: 'auto',
  },
  savedBadge: {
    backgroundColor: SUCCESS_BG,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  savedBadgeText: {
    color: SUCCESS,
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    backgroundColor: SURFACE,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionHeader: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: TEXT,
    textAlign: 'auto',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    marginTop: 2,
    textAlign: 'auto',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
    marginVertical: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  toggleLabels: {
    flex: 1,
    marginEnd: 12,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: TEXT,
    textAlign: 'auto',
  },
  toggleSubtitle: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    marginTop: 2,
    textAlign: 'auto',
  },
  selectRow: {
    gap: 8,
  },
  selectLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: TEXT,
    textAlign: 'auto',
  },
  selectOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  selectOption: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: BORDER,
    alignItems: 'center',
  },
  selectOptionActive: {
    borderColor: PRIMARY,
    backgroundColor: PRIMARY_XLIGHT,
  },
  selectOptionText: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    fontWeight: '500',
    textAlign: 'center',
  },
  selectOptionTextActive: {
    color: PRIMARY_DARK,
    fontWeight: '700',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: SURFACE,
    fontSize: 14,
    fontWeight: '700',
  },
  userId: {
    flex: 1,
    fontSize: 14,
    color: TEXT,
    textAlign: 'auto',
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 13,
    color: TEXT_MUTED,
    textAlign: 'center',
    paddingVertical: 8,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  linkText: {
    fontSize: 14,
    color: PRIMARY,
    fontWeight: '600',
    textAlign: 'auto',
  },
  linkArrow: {
    fontSize: 16,
    color: PRIMARY,
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  tipIcon: {
    fontSize: 18,
    marginTop: 1,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    color: TEXT_SECONDARY,
    lineHeight: 18,
    textAlign: 'auto',
  },
});
