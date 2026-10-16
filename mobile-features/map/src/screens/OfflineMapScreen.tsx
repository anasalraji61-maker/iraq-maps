/**
 * OfflineMapScreen – manage offline map regions.
 *
 * Features:
 *  - List of downloaded regions with size in MB, tile count, last updated, expiry.
 *  - Storage usage bar (used / 500 MB limit).
 *  - Preset regions for Iraq cities.
 *  - Resume interrupted downloads (regions stuck in 'downloading' status).
 *  - Delete individual regions with confirmation.
 *  - "Update available" badge when a region is outdated (>7 days old).
 *  - Download progress notification via Expo Notifications.
 *  - Estimated download time remaining.
 *  - WiFi-only download toggle (persisted).
 *  - Auto-update schedule (weekly, persisted flag).
 */

import { Button, IconButton, Screen, Text, tokens } from '@iraq-maps/ui';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
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
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import {
  abortOfflineDownload,
  deleteOfflineRegion,
  downloadOfflineRegion,
  formatBytes,
  listOfflineRegions,
  type DownloadProgress,
  type OfflineRegionManifest,
} from '../offline/OfflineMapManager';
import { t } from '../strings';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_CAP_BYTES = 500 * 1024 * 1024;
/** Regions updated more than 30 days ago are marked expiring. */
const EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
/** Regions updated more than 7 days ago get an "Update available" badge. */
const UPDATE_AVAILABLE_MS = 7 * 24 * 60 * 60 * 1000;

const WIFI_ONLY_KEY = '@iraq-maps/offline-wifi-only';
const AUTO_UPDATE_KEY = '@iraq-maps/offline-auto-update';

// ---------------------------------------------------------------------------
// Preset regions
// ---------------------------------------------------------------------------

interface PresetRegion {
  id: string;
  labelKey: string;
  descKey: string;
  bbox: [number, number, number, number];
  estimatedMb: number;
}

const PRESET_REGIONS: PresetRegion[] = [
  {
    id: 'baghdad-city',
    labelKey: 'offline.presetBaghdad',
    descKey: 'offline.presetBaghdadDesc',
    bbox: [44.27, 33.22, 44.56, 33.42],
    estimatedMb: 38,
  },
  {
    id: 'sulaymaniyah',
    labelKey: 'offline.presetSulaymaniyah',
    descKey: 'offline.presetSulaymaniyahDesc',
    bbox: [45.38, 35.52, 45.50, 35.60],
    estimatedMb: 8,
  },
  {
    id: 'mosul-city',
    labelKey: 'offline.presetMosul',
    descKey: 'offline.presetMosulDesc',
    bbox: [43.04, 36.30, 43.20, 36.42],
    estimatedMb: 12,
  },
  {
    id: 'erbil-city',
    labelKey: 'offline.presetErbil',
    descKey: 'offline.presetErbilDesc',
    bbox: [43.95, 36.15, 44.10, 36.25],
    estimatedMb: 9,
  },
  {
    id: 'basra-city',
    labelKey: 'offline.presetBasra',
    descKey: 'offline.presetBasraDesc',
    bbox: [47.72, 30.48, 47.88, 30.60],
    estimatedMb: 14,
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LiveProgress = Record<string, DownloadProgress & { etaSecs?: number }>;

// ---------------------------------------------------------------------------
// Notification helpers
// ---------------------------------------------------------------------------

async function requestNotificationPermission(): Promise<boolean> {
  try {
    const perm = await Notifications.requestPermissionsAsync();
    return (perm as { granted?: boolean }).granted === true || (perm as { status?: string }).status === 'granted';
  } catch {
    return false;
  }
}

async function sendDownloadCompleteNotification(regionName: string): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: t('offline.notifTitle'),
        body: t('offline.notifBody', { name: regionName }),
      },
      trigger: null,
    });
  } catch {
    // Notifications not available — silently skip
  }
}

// ---------------------------------------------------------------------------
// OfflineMapScreen
// ---------------------------------------------------------------------------

export function OfflineMapScreen(): ReactElement {
  const router = useRouter();
  const [regions, setRegions] = useState<OfflineRegionManifest[]>([]);
  const [liveProgress, setLiveProgress] = useState<LiveProgress>({});
  const [loading, setLoading] = useState(true);
  const [usedBytes, setUsedBytes] = useState(0);
  const [wifiOnly, setWifiOnly] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);

  // ── Load persisted settings ───────────────────────────────────────────────
  useEffect(() => {
    const loadPrefs = async () => {
      try {
        const [wf, au] = await Promise.all([
          AsyncStorage.getItem(WIFI_ONLY_KEY),
          AsyncStorage.getItem(AUTO_UPDATE_KEY),
        ]);
        if (wf !== null) setWifiOnly(wf === 'true');
        if (au !== null) setAutoUpdate(au === 'true');
      } catch {
        // best effort
      }
    };
    void loadPrefs();
  }, []);

  // ── Refresh list ──────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true);
    const list = await listOfflineRegions();
    setRegions(list);
    const used = list.reduce(
      (s, r) => s + (r.status === 'complete' ? r.storedBytes : 0),
      0,
    );
    setUsedBytes(used);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    void requestNotificationPermission();
  }, [refresh]);

  // ── Resume interrupted downloads on mount ────────────────────────────────
  useEffect(() => {
    const resumeInterrupted = async () => {
      const list = await listOfflineRegions();
      for (const r of list) {
        if (r.status === 'downloading') {
          const preset = PRESET_REGIONS.find((p) => p.id === r.id);
          if (!preset) continue;
          void startDownload(r.id, r.name, r.bbox, r.minZoom, r.maxZoom);
        }
      }
    };
    void resumeInterrupted();
  }, []);

  // ── Download ──────────────────────────────────────────────────────────────
  const startDownload = useCallback(
    async (
      id: string,
      name: string,
      bbox: [number, number, number, number],
      minZoom = 10,
      maxZoom = 14,
    ) => {
      setLiveProgress((prev) => ({
        ...prev,
        [id]: {
          regionId: id,
          totalTiles: 0,
          cachedTiles: 0,
          storedBytes: 0,
          status: 'downloading',
          etaSecs: undefined,
        },
      }));

      const startTime = Date.now();

      await downloadOfflineRegion({
        id,
        name,
        bbox,
        minZoom,
        maxZoom,
        tileUrlTemplate: 'https://tiles.openfreemap.org/planet/{z}/{x}/{y}.pbf',
        onProgress: (p) => {
          const elapsed = (Date.now() - startTime) / 1000;
          const rate = p.cachedTiles / Math.max(elapsed, 1);
          const remaining = p.totalTiles - p.cachedTiles;
          const etaSecs = rate > 0 ? Math.round(remaining / rate) : undefined;

          setLiveProgress((prev) => ({
            ...prev,
            [p.regionId]: { ...p, etaSecs },
          }));

          if (p.status === 'complete') {
            setUsedBytes((b) => b + p.storedBytes);
            void sendDownloadCompleteNotification(name);
            void refresh();
          }
        },
        onComplete: (_id, err) => {
          if (!err) void refresh();
          else {
            setLiveProgress((prev) => {
              const next = { ...prev };
              delete next[_id];
              return next;
            });
          }
        },
      });
    },
    [refresh],
  );

  const handleDownload = useCallback(
    (preset: PresetRegion) => {
      void startDownload(
        preset.id,
        t(preset.labelKey as Parameters<typeof t>[0]),
        preset.bbox,
      );
    },
    [startDownload],
  );

  // ── Abort ─────────────────────────────────────────────────────────────────
  const handleAbort = useCallback((id: string) => {
    abortOfflineDownload(id);
    setLiveProgress((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(
    (region: OfflineRegionManifest) => {
      Alert.alert(
        t('offline.deleteTitle'),
        t('offline.deleteConfirm', { name: region.name }),
        [
          { text: t('offline.cancel'), style: 'cancel' },
          {
            text: t('offline.delete'),
            style: 'destructive',
            onPress: async () => {
              await deleteOfflineRegion(region.id);
              setUsedBytes((b) => Math.max(0, b - region.storedBytes));
              setSelectedRegion(null);
              void refresh();
            },
          },
        ],
      );
    },
    [refresh],
  );

  // ── Update region ─────────────────────────────────────────────────────────
  const handleUpdate = useCallback(
    (region: OfflineRegionManifest) => {
      void startDownload(
        region.id,
        region.name,
        region.bbox,
        region.minZoom,
        region.maxZoom,
      );
    },
    [startDownload],
  );

  // ── Settings persistence ──────────────────────────────────────────────────
  const toggleWifiOnly = useCallback((v: boolean) => {
    setWifiOnly(v);
    void AsyncStorage.setItem(WIFI_ONLY_KEY, String(v));
  }, []);

  const toggleAutoUpdate = useCallback((v: boolean) => {
    setAutoUpdate(v);
    void AsyncStorage.setItem(AUTO_UPDATE_KEY, String(v));
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const isExpiring = (r: OfflineRegionManifest): boolean =>
    Date.now() - new Date(r.updatedAt).getTime() > EXPIRY_MS;

  const hasUpdateAvailable = (r: OfflineRegionManifest): boolean =>
    r.status === 'complete' &&
    Date.now() - new Date(r.updatedAt).getTime() > UPDATE_AVAILABLE_MS;

  const downloadedIds = new Set(regions.map((r) => r.id));
  const usedPct = Math.min(100, Math.round((usedBytes / STORAGE_CAP_BYTES) * 100));

  return (
    <Screen>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <IconButton icon="←" label={t('offline.back')} onPress={() => router.back()} />
        <Text variant="title" style={styles.title}>
          {t('offline.title')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Storage bar ──────────────────────────────────────────────── */}
        <StorageBar usedBytes={usedBytes} usedPct={usedPct} />

        {/* ── Settings: WiFi-only & auto-update ────────────────────────── */}
        <View style={styles.settingsCard}>
          <SettingRow
            label={t('offline.wifiOnlyLabel')}
            subLabel={t('offline.wifiOnlySub')}
            value={wifiOnly}
            onToggle={toggleWifiOnly}
          />
          <View style={styles.divider} />
          <SettingRow
            label={t('offline.autoUpdateLabel')}
            subLabel={t('offline.autoUpdateSub')}
            value={autoUpdate}
            onToggle={toggleAutoUpdate}
          />
        </View>

        {/* ── Downloaded regions ───────────────────────────────────────── */}
        <Text variant="caption" style={styles.sectionLabel}>
          {t('offline.sectionDownloaded')}
        </Text>

        {loading ? (
          <ActivityIndicator style={styles.spinner} />
        ) : regions.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text variant="body" style={styles.emptyText}>
              {t('offline.emptyDownloaded')}
            </Text>
          </View>
        ) : (
          regions.map((region) => (
            <RegionRow
              key={region.id}
              region={region}
              liveProgress={liveProgress[region.id]}
              expiring={isExpiring(region)}
              updateAvailable={hasUpdateAvailable(region)}
              isSelected={selectedRegion === region.id}
              onSelect={() =>
                setSelectedRegion((s) => (s === region.id ? null : region.id))
              }
              onAbort={handleAbort}
              onDelete={handleDelete}
              onUpdate={handleUpdate}
            />
          ))
        )}

        {/* ── Available presets ────────────────────────────────────────── */}
        <Text variant="caption" style={styles.sectionLabel}>
          {t('offline.sectionAvailable')}
        </Text>

        {PRESET_REGIONS.filter((p) => !downloadedIds.has(p.id)).map((preset) => {
          const progress = liveProgress[preset.id];
          return (
            <PresetRow
              key={preset.id}
              preset={preset}
              progress={progress}
              isDownloading={progress?.status === 'downloading'}
              wifiOnly={wifiOnly}
              onDownload={handleDownload}
              onAbort={handleAbort}
            />
          );
        })}

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <Text variant="caption" style={styles.footer}>
          {t('offline.footerHint')}
        </Text>
      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// StorageBar
// ---------------------------------------------------------------------------

interface StorageBarProps { usedBytes: number; usedPct: number; }

function StorageBar({ usedBytes, usedPct }: StorageBarProps): ReactElement {
  const barAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(barAnim, {
      toValue: usedPct / 100,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [usedPct, barAnim]);

  const barColor = usedPct > 80 ? tokens.color.danger : tokens.color.primary;

  return (
    <View style={styles.storageCard}>
      <View style={styles.storageRow}>
        <Text variant="caption" style={styles.storageLabel}>
          {t('offline.storageUsed', {
            used: formatBytes(usedBytes),
            total: formatBytes(STORAGE_CAP_BYTES),
          })}
        </Text>
        <Text variant="caption" style={styles.storagePct}>
          {usedPct}%
        </Text>
      </View>
      <View style={styles.storageTrack} accessibilityRole="progressbar">
        <Animated.View
          style={[styles.storageFill, { flex: barAnim, backgroundColor: barColor }]}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// SettingRow
// ---------------------------------------------------------------------------

interface SettingRowProps {
  label: string;
  subLabel: string;
  value: boolean;
  onToggle: (v: boolean) => void;
}

function SettingRow({ label, subLabel, value, onToggle }: SettingRowProps): ReactElement {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingInfo}>
        <Text variant="body" style={styles.settingLabel}>{label}</Text>
        <Text variant="caption" style={styles.settingSubLabel}>{subLabel}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: tokens.color.border, true: tokens.color.primary }}
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: value }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// RegionRow
// ---------------------------------------------------------------------------

interface RegionRowProps {
  region: OfflineRegionManifest;
  liveProgress?: LiveProgress[string];
  expiring: boolean;
  updateAvailable: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onAbort: (id: string) => void;
  onDelete: (r: OfflineRegionManifest) => void;
  onUpdate: (r: OfflineRegionManifest) => void;
}

function RegionRow({
  region,
  liveProgress,
  expiring,
  updateAvailable,
  isSelected,
  onSelect,
  onAbort,
  onDelete,
  onUpdate,
}: RegionRowProps): ReactElement {
  const live = liveProgress ?? {
    regionId: region.id,
    totalTiles: region.totalTiles,
    cachedTiles: region.cachedTiles,
    storedBytes: region.storedBytes,
    status: region.status,
  };

  const pct =
    live.totalTiles > 0
      ? Math.round((live.cachedTiles / live.totalTiles) * 100)
      : 0;

  const updatedDateStr = new Date(region.updatedAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const expiryDate = new Date(new Date(region.updatedAt).getTime() + EXPIRY_MS);
  const expiryStr = expiryDate.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });

  const sizeMb = (region.storedBytes / (1024 * 1024)).toFixed(1);

  return (
    <Pressable
      onPress={onSelect}
      style={[styles.row, isSelected && styles.rowSelected]}
      accessibilityRole="button"
      accessibilityLabel={region.name}
      accessibilityState={{ expanded: isSelected }}
    >
      <View style={styles.rowInfo}>
        {/* Title row with badges */}
        <View style={styles.rowTitleRow}>
          <Text variant="body" style={styles.rowName}>{region.name}</Text>

          {updateAvailable && live.status !== 'downloading' && (
            <View style={[styles.badge, styles.badgeUpdate]}>
              <Text style={styles.badgeText}>{t('offline.updateAvailableBadge')}</Text>
            </View>
          )}
          {expiring && live.status === 'complete' && !updateAvailable && (
            <View style={[styles.badge, styles.badgeExpiry]}>
              <Text style={styles.badgeText}>{t('offline.expiringBadge')}</Text>
            </View>
          )}
        </View>

        {/* Status / meta line */}
        {live.status === 'downloading' ? (
          <Text variant="caption" style={styles.rowMeta}>
            {t('offline.progressLabel', {
              pct: String(pct),
              size: formatBytes(live.storedBytes),
            })}
            {(liveProgress as LiveProgress[string] & { etaSecs?: number })?.etaSecs != null
              ? ` — ${t('offline.etaLabel', { secs: String((liveProgress as LiveProgress[string] & { etaSecs?: number }).etaSecs) })}`
              : ''}
          </Text>
        ) : live.status === 'complete' ? (
          <Text variant="caption" style={styles.rowMeta}>
            {t('offline.completeLabelMb', { mb: sizeMb, date: updatedDateStr })}
          </Text>
        ) : (
          <Text variant="caption" style={[styles.rowMeta, styles.failed]}>
            {t('offline.failedLabel')}
          </Text>
        )}

        {/* Progress bar */}
        {live.status === 'downloading' && (
          <View style={styles.progressBar} accessibilityRole="progressbar">
            <View style={[styles.progressFill, { width: `${pct}%` as `${number}%` }]} />
          </View>
        )}

        {/* Expanded detail */}
        {isSelected && live.status === 'complete' && (
          <View style={styles.detail}>
            <Text variant="caption" style={styles.detailItem}>
              {t('offline.detailTiles', { n: String(region.cachedTiles) })}
            </Text>
            <Text variant="caption" style={styles.detailItem}>
              {t('offline.detailExpiry', { date: expiryStr })}
            </Text>
          </View>
        )}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        {live.status === 'downloading' ? (
          <Pressable
            onPress={() => onAbort(region.id)}
            style={styles.actionBtn}
            accessibilityRole="button"
            accessibilityLabel={t('offline.cancelDownload')}
          >
            <Text variant="caption" style={styles.cancelText}>{t('offline.cancelDownload')}</Text>
          </Pressable>
        ) : (
          <>
            {updateAvailable && (
              <Pressable
                onPress={() => onUpdate(region)}
                style={styles.actionBtn}
                accessibilityRole="button"
                accessibilityLabel={t('offline.updateLabel')}
              >
                <Text variant="caption" style={styles.updateText}>{t('offline.updateLabel')}</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => onDelete(region)}
              style={styles.actionBtn}
              accessibilityRole="button"
              accessibilityLabel={t('offline.delete')}
            >
              <Text variant="caption" style={styles.deleteText}>{t('offline.delete')}</Text>
            </Pressable>
          </>
        )}
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// PresetRow
// ---------------------------------------------------------------------------

interface PresetRowProps {
  preset: PresetRegion;
  progress?: LiveProgress[string];
  isDownloading: boolean;
  wifiOnly: boolean;
  onDownload: (p: PresetRegion) => void;
  onAbort: (id: string) => void;
}

function PresetRow({
  preset,
  progress,
  isDownloading,
  wifiOnly,
  onDownload,
  onAbort,
}: PresetRowProps): ReactElement {
  const pct =
    progress && progress.totalTiles > 0
      ? Math.round((progress.cachedTiles / progress.totalTiles) * 100)
      : 0;

  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <View style={styles.rowTitleRow}>
          <Text variant="body" style={styles.rowName}>
            {t(preset.labelKey as Parameters<typeof t>[0])}
          </Text>
          {wifiOnly && (
            <View style={[styles.badge, styles.badgeWifi]}>
              <Text style={styles.badgeText}>{t('offline.wifiBadge')}</Text>
            </View>
          )}
        </View>

        {!isDownloading && (
          <Text variant="caption" style={styles.rowMeta}>
            {t('offline.estimatedSize', { size: `~${preset.estimatedMb} MB` })}
          </Text>
        )}
        {isDownloading && progress && (
          <>
            <Text variant="caption" style={styles.rowMeta}>
              {t('offline.progressLabel', {
                pct: String(pct),
                size: formatBytes(progress.storedBytes),
              })}
              {progress.etaSecs != null
                ? ` — ${t('offline.etaLabel', { secs: String(progress.etaSecs) })}`
                : ''}
            </Text>
            <View style={styles.progressBar} accessibilityRole="progressbar">
              <View style={[styles.progressFill, { width: `${pct}%` as `${number}%` }]} />
            </View>
          </>
        )}
      </View>

      {isDownloading ? (
        <Pressable
          onPress={() => onAbort(preset.id)}
          style={styles.actionBtn}
          accessibilityRole="button"
          accessibilityLabel={t('offline.cancelDownload')}
        >
          <Text variant="caption" style={styles.cancelText}>{t('offline.cancelDownload')}</Text>
        </Pressable>
      ) : (
        <Button label={t('offline.download')} onPress={() => onDownload(preset)} />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.space.m,
    paddingTop: tokens.space.s,
    paddingBottom: tokens.space.m,
    gap: tokens.space.s,
  },
  title: { flex: 1 },
  content: {
    paddingHorizontal: tokens.space.m,
    paddingBottom: tokens.space.xl,
    gap: tokens.space.s,
  },
  sectionLabel: {
    marginTop: tokens.space.m,
    marginBottom: tokens.space.xs,
    color: tokens.color.textMuted,
  },
  spinner: { marginVertical: tokens.space.m },
  emptyBox: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.m,
    padding: tokens.space.m,
    alignItems: 'center',
  },
  emptyText: { color: tokens.color.textMuted, textAlign: 'center' },

  // Storage bar
  storageCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.m,
    padding: tokens.space.m,
    gap: tokens.space.s,
    marginBottom: tokens.space.s,
  },
  storageRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  storageLabel: { color: tokens.color.textMuted, flex: 1 },
  storagePct: { color: tokens.color.text, fontWeight: '600' },
  storageTrack: {
    height: 6,
    backgroundColor: tokens.color.border,
    borderRadius: 3,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  storageFill: { height: '100%', borderRadius: 3 },

  // Settings card
  settingsCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.m,
    paddingHorizontal: tokens.space.m,
    marginBottom: tokens.space.s,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: tokens.space.m,
    gap: tokens.space.m,
  },
  settingInfo: { flex: 1 },
  settingLabel: { fontWeight: '500' },
  settingSubLabel: { color: tokens.color.textMuted, marginTop: 2 },
  divider: { height: 1, backgroundColor: tokens.color.border },

  // Region rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.m,
    padding: tokens.space.m,
    gap: tokens.space.m,
    marginBottom: tokens.space.s,
  },
  rowSelected: {
    borderWidth: 1.5,
    borderColor: tokens.color.primary,
  },
  rowInfo: { flex: 1, gap: tokens.space.xs },
  rowTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.xs,
    flexWrap: 'wrap',
  },
  rowName: { fontWeight: '600' },
  rowMeta: { color: tokens.color.textMuted },
  failed: { color: tokens.color.danger },

  // Badges
  badge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  badgeUpdate: { backgroundColor: tokens.color.primary },
  badgeExpiry: { backgroundColor: '#f59e0b' },
  badgeWifi: { backgroundColor: '#6366f1' },

  // Progress bar
  progressBar: {
    height: 4,
    backgroundColor: tokens.color.border,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: tokens.space.xs,
  },
  progressFill: {
    height: '100%',
    backgroundColor: tokens.color.primary,
    borderRadius: 2,
  },

  // Expanded detail
  detail: {
    marginTop: tokens.space.xs,
    gap: 2,
    paddingTop: tokens.space.xs,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
  },
  detailItem: { color: tokens.color.textMuted },

  // Actions
  actions: { gap: tokens.space.xs, alignItems: 'flex-end' },
  actionBtn: { paddingHorizontal: tokens.space.s, paddingVertical: tokens.space.xs },
  cancelText: { color: tokens.color.textMuted },
  deleteText: { color: tokens.color.danger },
  updateText: { color: tokens.color.primary, fontWeight: '600' },

  footer: {
    color: tokens.color.textMuted,
    textAlign: 'center',
    marginTop: tokens.space.m,
  },
});
