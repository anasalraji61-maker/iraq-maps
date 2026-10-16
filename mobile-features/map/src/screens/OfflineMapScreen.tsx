/**
 * OfflineMapScreen – manage offline map regions.
 *
 * Features:
 *  - List of downloaded regions with size, date, and status.
 *  - Storage usage bar (used / estimated 500 MB limit).
 *  - Preset regions for Iraq cities to download with one tap.
 *  - Download progress indicator per region.
 *  - Delete regions individually.
 *  - Auto-expiry notice for downloads older than 30 days.
 *
 * Route: pushed from MapScreen settings or via `router.push('/map/offline')`.
 */

import { Button, IconButton, Screen, Text, tokens } from '@iraq-maps/ui';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
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

/** Soft storage cap in bytes (500 MB). Used for the usage bar calculation. */
const STORAGE_CAP_BYTES = 500 * 1024 * 1024;

/** Downloads older than 30 days are flagged as expiring. */
const EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

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

type LiveProgress = Record<string, DownloadProgress>;

// ---------------------------------------------------------------------------
// OfflineMapScreen
// ---------------------------------------------------------------------------

export function OfflineMapScreen(): ReactElement {
  const router = useRouter();
  const [regions, setRegions] = useState<OfflineRegionManifest[]>([]);
  const [liveProgress, setLiveProgress] = useState<LiveProgress>({});
  const [loading, setLoading] = useState(true);
  const [usedBytes, setUsedBytes] = useState(0);

  // ── Refresh lists ─────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true);
    const [list] = await Promise.all([listOfflineRegions()]);
    setRegions(list);
    // Sum storedBytes across all complete regions
    const used = list.reduce((s, r) => s + (r.status === 'complete' ? r.storedBytes : 0), 0);
    setUsedBytes(used);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ── Download ──────────────────────────────────────────────────────────────
  const handleDownload = useCallback(
    async (preset: PresetRegion) => {
      setLiveProgress((prev) => ({
        ...prev,
        [preset.id]: {
          regionId: preset.id,
          totalTiles: 0,
          cachedTiles: 0,
          storedBytes: 0,
          status: 'downloading',
        },
      }));

      await downloadOfflineRegion({
        id: preset.id,
        name: t(preset.labelKey as Parameters<typeof t>[0]),
        bbox: preset.bbox,
        minZoom: 10,
        maxZoom: 14,
        tileUrlTemplate:
          'https://tiles.openfreemap.org/planet/{z}/{x}/{y}.pbf',
        onProgress: (p) => {
          setLiveProgress((prev) => ({ ...prev, [p.regionId]: p }));
          if (p.status === 'complete') {
            setUsedBytes((b) => b + p.storedBytes);
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

  // ── Abort ────────────────────────────────────────────────────────────────
  const handleAbort = useCallback((id: string) => {
    abortOfflineDownload(id);
    setLiveProgress((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // ── Delete ───────────────────────────────────────────────────────────────
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
              void refresh();
            },
          },
        ],
      );
    },
    [refresh],
  );

  // ── Expiry check ─────────────────────────────────────────────────────────
  const isExpiring = (region: OfflineRegionManifest): boolean => {
    const updatedMs = new Date(region.updatedAt).getTime();
    return Date.now() - updatedMs > EXPIRY_MS;
  };

  const downloadedIds = new Set(regions.map((r) => r.id));
  const usedPct = Math.min(100, Math.round((usedBytes / STORAGE_CAP_BYTES) * 100));

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <IconButton
          icon="←"
          label={t('offline.back')}
          onPress={() => router.back()}
        />
        <Text variant="title" style={styles.title}>
          {t('offline.title')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Storage usage bar */}
        <StorageBar usedBytes={usedBytes} usedPct={usedPct} />

        {/* Downloaded regions */}
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
              onAbort={handleAbort}
              onDelete={handleDelete}
            />
          ))
        )}

        {/* Preset regions available to download */}
        <Text variant="caption" style={styles.sectionLabel}>
          {t('offline.sectionAvailable')}
        </Text>

        {PRESET_REGIONS.filter((p) => !downloadedIds.has(p.id)).map((preset) => {
          const progress = liveProgress[preset.id];
          const isDownloading = progress?.status === 'downloading';
          return (
            <PresetRow
              key={preset.id}
              preset={preset}
              progress={progress}
              isDownloading={isDownloading}
              onDownload={handleDownload}
              onAbort={handleAbort}
            />
          );
        })}

        {/* Info footer */}
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

interface StorageBarProps {
  usedBytes: number;
  usedPct: number;
}

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
          style={[
            styles.storageFill,
            {
              flex: barAnim,
              backgroundColor: barColor,
            },
          ]}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// RegionRow – a downloaded region
// ---------------------------------------------------------------------------

interface RegionRowProps {
  region: OfflineRegionManifest;
  liveProgress?: DownloadProgress;
  expiring: boolean;
  onAbort: (id: string) => void;
  onDelete: (r: OfflineRegionManifest) => void;
}

function RegionRow({
  region,
  liveProgress,
  expiring,
  onAbort,
  onDelete,
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

  const dateStr = new Date(region.updatedAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <View style={styles.row} accessibilityRole="none">
      <View style={styles.rowInfo}>
        <View style={styles.rowTitleRow}>
          <Text variant="body" style={styles.rowName}>
            {region.name}
          </Text>
          {expiring && live.status === 'complete' && (
            <View style={styles.expiryBadge}>
              <Text style={styles.expiryText}>{t('offline.expiringBadge')}</Text>
            </View>
          )}
        </View>

        <Text variant="caption" style={styles.rowMeta}>
          {live.status === 'downloading'
            ? t('offline.progressLabel', {
                pct: String(pct),
                size: formatBytes(live.storedBytes),
              })
            : live.status === 'complete'
              ? t('offline.completeLabel', {
                  size: formatBytes(live.storedBytes),
                  date: dateStr,
                })
              : t('offline.failedLabel')}
        </Text>

        {live.status === 'downloading' && (
          <View style={styles.progressBar} accessibilityRole="progressbar">
            <View style={[styles.progressFill, { width: `${pct}%` as `${number}%` }]} />
          </View>
        )}
      </View>

      {live.status === 'downloading' ? (
        <Pressable
          onPress={() => onAbort(region.id)}
          style={styles.actionBtn}
          accessibilityRole="button"
          accessibilityLabel={t('offline.cancelDownload')}
        >
          <Text variant="caption" style={styles.cancelText}>
            {t('offline.cancelDownload')}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={() => onDelete(region)}
          style={styles.actionBtn}
          accessibilityRole="button"
          accessibilityLabel={t('offline.delete')}
        >
          <Text variant="caption" style={styles.deleteText}>
            {t('offline.delete')}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// PresetRow – a region available to download
// ---------------------------------------------------------------------------

interface PresetRowProps {
  preset: PresetRegion;
  progress?: DownloadProgress;
  isDownloading: boolean;
  onDownload: (p: PresetRegion) => void;
  onAbort: (id: string) => void;
}

function PresetRow({
  preset,
  progress,
  isDownloading,
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
        <Text variant="body" style={styles.rowName}>
          {t(preset.labelKey as Parameters<typeof t>[0])}
        </Text>
        {!isDownloading && (
          <Text variant="caption" style={styles.rowMeta}>
            {t('offline.estimatedSize', {
              size: `~${preset.estimatedMb} MB`,
            })}
          </Text>
        )}
        {isDownloading && progress && (
          <>
            <Text variant="caption" style={styles.rowMeta}>
              {t('offline.progressLabel', {
                pct: String(pct),
                size: formatBytes(progress.storedBytes),
              })}
            </Text>
            <View style={styles.progressBar} accessibilityRole="progressbar">
              <View
                style={[
                  styles.progressFill,
                  { width: `${pct}%` as `${number}%` },
                ]}
              />
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
          <Text variant="caption" style={styles.cancelText}>
            {t('offline.cancelDownload')}
          </Text>
        </Pressable>
      ) : (
        <Button
          label={t('offline.download')}
          onPress={() => onDownload(preset)}
        />
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
  title: {
    flex: 1,
  },
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
  spinner: {
    marginVertical: tokens.space.m,
  },
  emptyBox: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.m,
    padding: tokens.space.m,
    alignItems: 'center',
  },
  emptyText: {
    color: tokens.color.textMuted,
    textAlign: 'center',
  },
  // Storage bar
  storageCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.m,
    padding: tokens.space.m,
    gap: tokens.space.s,
    marginBottom: tokens.space.s,
  },
  storageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  storageLabel: {
    color: tokens.color.textMuted,
    flex: 1,
  },
  storagePct: {
    color: tokens.color.text,
    fontWeight: '600',
  },
  storageTrack: {
    height: 6,
    backgroundColor: tokens.color.border,
    borderRadius: 3,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  storageFill: {
    height: '100%',
    borderRadius: 3,
  },
  // Region row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.m,
    padding: tokens.space.m,
    gap: tokens.space.m,
    marginBottom: tokens.space.s,
  },
  rowInfo: {
    flex: 1,
    gap: tokens.space.xs,
  },
  rowTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.xs,
    flexWrap: 'wrap',
  },
  rowName: {
    fontWeight: '600',
  },
  rowMeta: {
    color: tokens.color.textMuted,
  },
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
  actionBtn: {
    paddingHorizontal: tokens.space.s,
    paddingVertical: tokens.space.xs,
  },
  cancelText: {
    color: tokens.color.textMuted,
  },
  deleteText: {
    color: tokens.color.danger,
  },
  expiryBadge: {
    backgroundColor: '#f59e0b',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  expiryText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  footer: {
    color: tokens.color.textMuted,
    textAlign: 'center',
    marginTop: tokens.space.m,
  },
});
