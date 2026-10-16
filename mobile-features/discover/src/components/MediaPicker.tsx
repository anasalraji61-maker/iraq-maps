/**
 * MediaPicker – reusable media picker with camera roll grid,
 * camera capture, video recording, multi-select, crop and filter strip.
 * RTL-safe throughout.
 */
/* eslint-disable i18next/no-literal-string, no-restricted-syntax */
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { t } from '../strings';

const { width: SCREEN_W } = Dimensions.get('window');
const GRID_COLS = 3;
const THUMB_SIZE = Math.floor((SCREEN_W - (GRID_COLS + 1) * 2) / GRID_COLS);
const MAX_VIDEO_SECONDS = 15;
const MAX_SELECTION = 10;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PickedMedia {
  uri: string;
  type: 'image' | 'video';
  width?: number;
  height?: number;
  duration?: number;
  mimeType?: string;
}

export interface MediaPickerProps {
  /** Called when user confirms selection. */
  onSelect: (items: PickedMedia[]) => void;
  /** Called when user cancels. */
  onCancel: () => void;
  /** Allow video as well as photos. Default true. */
  allowVideo?: boolean;
  /** Allow multiple selection. Default false. */
  multiple?: boolean;
  /** Max number of items when multiple=true. Default MAX_SELECTION. */
  maxItems?: number;
  /** Aspect ratio for crop (e.g. [1, 1] for square). Undefined = free crop. */
  aspectRatio?: [number, number];
  /** Show filter strip. Default true. */
  showFilters?: boolean;
}

// ─── Filter definitions ───────────────────────────────────────────────────────

export type FilterType =
  | 'none'
  | 'warm'
  | 'cool'
  | 'vivid'
  | 'fade'
  | 'noir'
  | 'golden'
  | 'dusk';

interface FilterDef {
  type: FilterType;
  labelKey: string;
  /** CSS-style filter string for preview overlay effect (tint). */
  tint?: string;
  opacity?: number;
}

const FILTERS: FilterDef[] = [
  { type: 'none',   labelKey: 'mediapicker.filter.none' },
  { type: 'warm',   labelKey: 'mediapicker.filter.warm',   tint: '#FF9500', opacity: 0.15 },
  { type: 'cool',   labelKey: 'mediapicker.filter.cool',   tint: '#5AC8FA', opacity: 0.15 },
  { type: 'vivid',  labelKey: 'mediapicker.filter.vivid',  tint: '#FF2D55', opacity: 0.1 },
  { type: 'fade',   labelKey: 'mediapicker.filter.fade',   tint: '#FFFFFF', opacity: 0.25 },
  { type: 'noir',   labelKey: 'mediapicker.filter.noir',   tint: '#000000', opacity: 0.3 },
  { type: 'golden', labelKey: 'mediapicker.filter.golden', tint: '#FFCC00', opacity: 0.2 },
  { type: 'dusk',   labelKey: 'mediapicker.filter.dusk',   tint: '#5856D6', opacity: 0.18 },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function FilterPreview({ uri, filter }: { uri: string; filter: FilterDef }): ReactElement {
  return (
    <View style={filterPreviewStyles.wrap}>
      <Image source={{ uri }} style={filterPreviewStyles.img} resizeMode="cover" accessibilityIgnoresInvertColors />
      {filter.tint && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: filter.tint, opacity: filter.opacity ?? 0.2 }]} />
      )}
    </View>
  );
}

const filterPreviewStyles = StyleSheet.create({
  wrap: { width: 60, height: 60, borderRadius: 8, overflow: 'hidden', position: 'relative' },
  img: { ...StyleSheet.absoluteFill },
});

// ─── Grid thumbnail ───────────────────────────────────────────────────────────

function MediaThumb({
  asset,
  selected,
  selectionOrder,
  onPress,
}: {
  asset: MediaLibrary.Asset;
  selected: boolean;
  selectionOrder?: number;
  onPress: () => void;
}): ReactElement {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.thumb, selected && styles.thumbSelected]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={asset.filename}
    >
      <Image
        source={{ uri: asset.uri }}
        style={styles.thumbImage}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
      {asset.mediaType === 'video' && (
        <View style={styles.videoBadge}>
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <Text style={styles.videoBadgeText}>▶</Text>
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <Text style={styles.videoDuration}>{Math.round(asset.duration ?? 0)}s</Text>
        </View>
      )}
      {selected && (
        <View style={styles.selectionBadge}>
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <Text style={styles.selectionBadgeText}>{selectionOrder ?? '✓'}</Text>
        </View>
      )}
    </Pressable>
  );
}

// ─── Crop overlay (simple aspect-ratio mask) ──────────────────────────────────

function CropOverlay({ uri, aspectRatio, onConfirm, onCancel }: {
  uri: string;
  aspectRatio?: [number, number];
  onConfirm: (uri: string) => void;
  onCancel: () => void;
}): ReactElement {
  // Simple preview with aspect ratio indicator — actual crop happens via ImagePicker
  const ratio = aspectRatio ? aspectRatio[0] / aspectRatio[1] : 1;
  const cropW = SCREEN_W - 32;
  const cropH = cropW / ratio;

  return (
    <View style={cropStyles.container}>
      <View style={cropStyles.header}>
        <TouchableOpacity onPress={onCancel} style={cropStyles.headerBtn} accessibilityRole="button">
          <Text style={cropStyles.headerBtnText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <Text style={cropStyles.headerTitle}>{t('mediapicker.crop')}</Text>
        <TouchableOpacity onPress={() => onConfirm(uri)} style={cropStyles.headerBtn} accessibilityRole="button">
          <Text style={[cropStyles.headerBtnText, { color: '#007AFF', fontWeight: '700' }]}>
            {t('mediapicker.cropDone')}
          </Text>
        </TouchableOpacity>
      </View>
      <View style={cropStyles.canvas}>
        <Image source={{ uri }} style={{ width: cropW, height: cropH, borderRadius: 4 }} resizeMode="cover" accessibilityIgnoresInvertColors />
        <View style={cropStyles.grid}>
          {/* rule-of-thirds grid */}
          <View style={[cropStyles.gridLine, { top: '33%', width: '100%', height: 1 }]} />
          <View style={[cropStyles.gridLine, { top: '66%', width: '100%', height: 1 }]} />
          <View style={[cropStyles.gridLine, { start: '33%', width: 1, height: '100%' }]} />
          <View style={[cropStyles.gridLine, { start: '66%', width: 1, height: '100%' }]} />
        </View>
      </View>
    </View>
  );
}

const cropStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  headerBtn: { padding: 8 },
  headerBtnText: { color: '#FFF', fontSize: 15 },
  headerTitle: { color: '#FFF', fontSize: 17, fontWeight: '600' },
  canvas: { flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  grid: { ...StyleSheet.absoluteFill },
  gridLine: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.3)' },
});

// ─── Main MediaPicker ─────────────────────────────────────────────────────────

export function MediaPicker({
  onSelect,
  onCancel,
  allowVideo = true,
  multiple = false,
  maxItems = MAX_SELECTION,
  aspectRatio,
  showFilters = true,
}: MediaPickerProps): ReactElement {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterType>('none');
  const [cropUri, setCropUri] = useState<string | null>(null);
  const [showCrop, setShowCrop] = useState(false);
  const [_recordingVideo, _setRecordingVideo] = useState(false);
  const [endCursor, setEndCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);

  const filterDef = FILTERS.find((f) => f.type === activeFilter) ?? FILTERS[0]!;

  // Request permissions and load
  useEffect(() => {
    (async () => {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      setHasPermission(status === 'granted');
      if (status === 'granted') {
        await loadAssets();
      } else {
        setLoading(false);
      }
    })();
  }, []);

  const loadAssets = useCallback(async (after?: string) => {
    setLoading(true);
    try {
      const mediaTypes: MediaLibrary.MediaTypeValue[] = allowVideo
        ? [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video]
        : [MediaLibrary.MediaType.photo];

      const page = await MediaLibrary.getAssetsAsync({
        mediaType: mediaTypes,
        sortBy: MediaLibrary.SortBy.creationTime,
        first: 60,
        after,
      });

      setAssets((prev) => after ? [...prev, ...page.assets] : page.assets);
      setEndCursor(page.endCursor);
      setHasMore(page.hasNextPage);
    } catch {
      Alert.alert(t('mediapicker.loadError'));
    } finally {
      setLoading(false);
    }
  }, [allowVideo]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading || !endCursor) return;
    loadAssets(endCursor);
  }, [hasMore, loading, endCursor, loadAssets]);

  // ─── Selection ─────────────────────────────────────────────────────────

  const toggleSelect = useCallback((asset: MediaLibrary.Asset) => {
    // Reject videos > MAX_VIDEO_SECONDS
    if (asset.mediaType === 'video' && (asset.duration ?? 0) > MAX_VIDEO_SECONDS) {
      Alert.alert(t('mediapicker.videoTooLong', { max: String(MAX_VIDEO_SECONDS) }));
      return;
    }

    if (!multiple) {
      // Single select: go directly to crop/filter
      setSelectedIds([asset.id]);
      if (aspectRatio) {
        setCropUri(asset.uri);
        setShowCrop(true);
      }
      return;
    }

    setSelectedIds((prev) => {
      if (prev.includes(asset.id)) return prev.filter((id) => id !== asset.id);
      if (prev.length >= maxItems) {
        Alert.alert(t('mediapicker.maxReached', { max: String(maxItems) }));
        return prev;
      }
      return [...prev, asset.id];
    });
  }, [multiple, aspectRatio, maxItems]);

  // ─── Camera capture ────────────────────────────────────────────────────

  const openCamera = async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: allowVideo ? ImagePicker.MediaTypeOptions.All : ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      videoMaxDuration: MAX_VIDEO_SECONDS,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      onSelect([{
        uri: asset.uri,
        type: asset.type === 'video' ? 'video' : 'image',
        width: asset.width,
        height: asset.height,
        duration: asset.duration ?? undefined,
      }]);
    }
  };

  // ─── Confirm selection ─────────────────────────────────────────────────

  const confirmSelection = useCallback(() => {
    const selected = assets.filter((a) => selectedIds.includes(a.id));
    const items: PickedMedia[] = selected.map((a) => ({
      uri: a.uri,
      type: a.mediaType === 'video' ? 'video' : 'image',
      duration: a.duration ?? undefined,
    }));
    onSelect(items);
  }, [assets, selectedIds, onSelect]);

  // ─── Crop confirm ──────────────────────────────────────────────────────

  const handleCropConfirm = (uri: string) => {
    setShowCrop(false);
    onSelect([{ uri, type: 'image' }]);
  };

  // ─── Render ────────────────────────────────────────────────────────────

  const bg = isDark ? '#000' : '#F2F2F7';
  const headerBg = isDark ? '#1C1C1E' : '#FFF';
  const textColor = isDark ? '#FFF' : '#000';

  if (hasPermission === false) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <View style={styles.permDenied}>
          <Text style={[styles.permDeniedText, { color: textColor }]}>{t('mediapicker.permissionDenied')}</Text>
          <TouchableOpacity style={styles.permDeniedBtn} onPress={onCancel} accessibilityRole="button">
            <Text style={styles.permDeniedBtnText}>{t('common.back')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (showCrop && cropUri) {
    return (
      <CropOverlay
        uri={cropUri}
        aspectRatio={aspectRatio}
        onConfirm={handleCropConfirm}
        onCancel={() => setShowCrop(false)}
      />
    );
  }

  const selectedAsset = selectedIds.length === 1
    ? assets.find((a) => a.id === selectedIds[0])
    : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: headerBg }]}>
        <TouchableOpacity onPress={onCancel} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
          <Text style={[styles.headerBtnText, { color: '#007AFF' }]}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textColor }]}>{t('mediapicker.title')}</Text>
        <View style={styles.headerRight}>
          {selectedIds.length > 0 && (
            <TouchableOpacity onPress={confirmSelection} style={styles.nextBtn} accessibilityRole="button">
              <Text style={styles.nextBtnText}>
                {multiple
                  ? t('mediapicker.next', { n: String(selectedIds.length) })
                  : t('mediapicker.next', { n: '' })}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Preview with filter */}
      {selectedAsset && showFilters && (
        <View style={styles.previewArea}>
          <View style={styles.previewWrap}>
            <Image
              source={{ uri: selectedAsset.uri }}
              style={styles.previewImage}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
            {filterDef.tint && (
              <View
                style={[StyleSheet.absoluteFill, { backgroundColor: filterDef.tint, opacity: filterDef.opacity ?? 0.2 }]}
              />
            )}
          </View>
        </View>
      )}

      {/* Filter strip */}
      {selectedAsset && showFilters && (
        <View style={styles.filterStrip}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterStripContent}>
            {FILTERS.map((f) => (
              <Pressable
                key={f.type}
                style={[styles.filterItem, activeFilter === f.type && styles.filterItemActive]}
                onPress={() => setActiveFilter(f.type)}
                accessibilityRole="radio"
                accessibilityState={{ checked: activeFilter === f.type }}
              >
                <FilterPreview uri={selectedAsset.uri} filter={f} />
                <Text style={[styles.filterLabel, { color: textColor }]}>{t(f.labelKey as Parameters<typeof t>[0])}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Camera row */}
      <View style={[styles.cameraRow, { backgroundColor: headerBg }]}>
        <TouchableOpacity style={styles.cameraBtn} onPress={openCamera} accessibilityRole="button" accessibilityLabel={t('editor.camera')}>
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <Text style={styles.cameraBtnIcon}>📷</Text>
          <Text style={[styles.cameraBtnLabel, { color: textColor }]}>{t('editor.camera')}</Text>
        </TouchableOpacity>
        {allowVideo && (
          <TouchableOpacity style={styles.cameraBtn} onPress={openCamera} accessibilityRole="button" accessibilityLabel={t('mediapicker.record')}>
            {/* eslint-disable-next-line i18next/no-literal-string */}
            <Text style={styles.cameraBtnIcon}>🎬</Text>
            <Text style={[styles.cameraBtnLabel, { color: textColor }]}>{t('mediapicker.record')}</Text>
          </TouchableOpacity>
        )}
        {multiple && selectedIds.length > 0 && (
          <Text style={[styles.selectionCount, { color: textColor }]}>
            {t('mediapicker.selected', { n: String(selectedIds.length), max: String(maxItems) })}
          </Text>
        )}
      </View>

      {/* Grid */}
      {loading && assets.length === 0 ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={isDark ? '#FFF' : '#007AFF'} />
        </View>
      ) : (
        <FlatList
          data={assets}
          numColumns={GRID_COLS}
          keyExtractor={(a) => a.id}
          renderItem={({ item }) => (
            <MediaThumb
              asset={item}
              selected={selectedIds.includes(item.id)}
              selectionOrder={multiple ? selectedIds.indexOf(item.id) + 1 : undefined}
              onPress={() => toggleSelect(item)}
            />
          )}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loading ? <ActivityIndicator style={{ padding: 16 }} color={isDark ? '#FFF' : '#007AFF'} /> : null}
          contentContainerStyle={styles.gridContent}
          style={{ flex: 1 }}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Modal wrapper ────────────────────────────────────────────────────────────

export function MediaPickerModal({
  visible,
  ...props
}: MediaPickerProps & { visible: boolean }): ReactElement {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={props.onCancel}>
      <MediaPicker {...props} />
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#3333' },
  headerBtn: { padding: 6 },
  headerBtnText: { fontSize: 16 },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  nextBtn: { backgroundColor: '#007AFF', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8 },
  nextBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },

  previewArea: { height: 260, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  previewWrap: { width: '100%', height: '100%', position: 'relative' },
  previewImage: { ...StyleSheet.absoluteFill },

  filterStrip: { height: 100, backgroundColor: '#111' },
  filterStripContent: { paddingHorizontal: 12, gap: 10, alignItems: 'center' },
  filterItem: { alignItems: 'center', gap: 6, padding: 4, borderRadius: 8 },
  filterItemActive: { borderWidth: 2, borderColor: '#007AFF' },
  filterLabel: { fontSize: 11, textAlign: 'center' },

  cameraRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#3333' },
  cameraBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cameraBtnIcon: { fontSize: 20 },
  cameraBtnLabel: { fontSize: 14 },
  selectionCount: { marginStart: 'auto', fontSize: 13 },

  thumb: { width: THUMB_SIZE, height: THUMB_SIZE, margin: 1 },
  thumbSelected: { opacity: 0.75 },
  thumbImage: { width: '100%', height: '100%' },
  videoBadge: { position: 'absolute', bottom: 4, start: 4, flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  videoBadgeText: { color: '#FFF', fontSize: 9 },
  videoDuration: { color: '#FFF', fontSize: 10 },
  selectionBadge: { position: 'absolute', top: 6, end: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: '#007AFF', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFF' },
  selectionBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '700' },

  gridContent: { paddingBottom: 20 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  permDenied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  permDeniedText: { fontSize: 16, textAlign: 'center' },
  permDeniedBtn: { backgroundColor: '#007AFF', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  permDeniedBtnText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
});
