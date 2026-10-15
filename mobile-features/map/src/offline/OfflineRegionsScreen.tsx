/**
 * OfflineRegionsScreen – list, manage and initiate downloads of offline map regions.
 *
 * Route: /map/offline-regions  (registered in apps/mobile)
 */
import { Button, IconButton, Screen, Text, tokens } from '@iraq-maps/ui';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
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
} from './OfflineMapManager';
import { t } from '../strings';

// ---------------------------------------------------------------------------
// Preset download regions for Iraq MVP (Baghdad + Sulaymaniyah)
// ---------------------------------------------------------------------------
interface PresetRegion {
  id: string;
  labelKey: string;
  bbox: [number, number, number, number];
}

const PRESET_REGIONS: PresetRegion[] = [
  {
    id: 'baghdad-city',
    labelKey: 'offline.presetBaghdad',
    bbox: [44.27, 33.22, 44.56, 33.42],
  },
  {
    id: 'sulaymaniyah',
    labelKey: 'offline.presetSulaymaniyah',
    bbox: [45.38, 35.52, 45.50, 35.60],
  },
  {
    id: 'mosul-city',
    labelKey: 'offline.presetMosul',
    bbox: [43.04, 36.30, 43.20, 36.42],
  },
];

// ---------------------------------------------------------------------------
// Progress state
// ---------------------------------------------------------------------------
type LiveProgress = Record<string, DownloadProgress>;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function OfflineRegionsScreen(): ReactElement {
  const router = useRouter();
  const [regions, setRegions] = useState<OfflineRegionManifest[]>([]);
  const [liveProgress, setLiveProgress] = useState<LiveProgress>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const list = await listOfflineRegions();
    setRegions(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleDownload = useCallback(
    async (preset: PresetRegion) => {
      // Initialise live progress
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
        // Tile URL template comes from the same source as the MapCanvas.
        // Tokens must NOT be stored; this is the public tile endpoint.
        tileUrlTemplate:
          'https://tiles.openfreemap.org/planet/{z}/{x}/{y}.pbf',
        onProgress: (p) => {
          setLiveProgress((prev) => ({ ...prev, [p.regionId]: p }));
          if (p.status === 'complete') {
            void refresh();
          }
        },
        onComplete: (_id, err) => {
          if (!err) void refresh();
        },
      });
    },
    [refresh],
  );

  const handleAbort = useCallback((id: string) => {
    abortOfflineDownload(id);
    setLiveProgress((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

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
              void refresh();
            },
          },
        ],
      );
    },
    [refresh],
  );

  const downloadedIds = new Set(regions.map((r) => r.id));

  return (
    <Screen>
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

      <ScrollView contentContainerStyle={styles.content}>
        {/* Downloaded regions */}
        <Text variant="caption" style={styles.sectionLabel}>
          {t('offline.sectionDownloaded')}
        </Text>

        {loading ? (
          <ActivityIndicator style={styles.spinner} />
        ) : regions.length === 0 ? (
          <Text variant="body" style={styles.emptyText}>
            {t('offline.emptyDownloaded')}
          </Text>
        ) : (
          regions.map((region) => (
            <RegionRow
              key={region.id}
              region={region}
              liveProgress={liveProgress[region.id]}
              onAbort={handleAbort}
              onDelete={handleDelete}
            />
          ))
        )}

        {/* Preset regions to download */}
        <Text variant="caption" style={styles.sectionLabel}>
          {t('offline.sectionAvailable')}
        </Text>

        {PRESET_REGIONS.filter((p) => !downloadedIds.has(p.id)).map(
          (preset) => {
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
          },
        )}
      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// RegionRow – an already-downloaded region
// ---------------------------------------------------------------------------
interface RegionRowProps {
  region: OfflineRegionManifest;
  liveProgress?: DownloadProgress;
  onAbort: (id: string) => void;
  onDelete: (r: OfflineRegionManifest) => void;
}

function RegionRow({
  region,
  liveProgress,
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

  return (
    <View style={styles.row} accessibilityRole="none">
      <View style={styles.rowInfo}>
        <Text variant="body" style={styles.rowName}>
          {region.name}
        </Text>
        <Text variant="caption" style={styles.rowMeta}>
          {live.status === 'downloading'
            ? t('offline.progressLabel', {
                pct: String(pct),
                size: formatBytes(live.storedBytes),
              })
            : live.status === 'complete'
              ? t('offline.completeLabel', { size: formatBytes(live.storedBytes) })
              : t('offline.failedLabel')}
        </Text>
        {live.status === 'downloading' && (
          <View style={styles.progressBar} accessibilityRole="progressbar">
            <View style={[styles.progressFill, { width: `${pct}%` }]} />
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
// PresetRow – a region available for download
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
        {isDownloading && progress && (
          <>
            <Text variant="caption" style={styles.rowMeta}>
              {t('offline.progressLabel', {
                pct: String(pct),
                size: formatBytes(progress.storedBytes),
              })}
            </Text>
            <View style={styles.progressBar} accessibilityRole="progressbar">
              <View style={[styles.progressFill, { width: `${pct}%` }]} />
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
  emptyText: {
    color: tokens.color.textMuted,
    textAlign: 'center',
    marginVertical: tokens.space.m,
  },
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
});
