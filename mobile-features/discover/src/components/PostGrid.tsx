import {
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactElement,
} from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { COLORS, formatCount, getTypeBadgeColors } from '../screens/shared';
import { t } from '../strings';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PostGridItem {
  id: string;
  authorId: string;
  type: 'photo' | 'tip' | 'event' | 'offer';
  body: string;
  mediaAssetIds: string[];
  likeCount: number;
  commentCount: number;
  isLikedByMe: boolean;
  createdAt: string;
  /** Optional: height hint so masonry can pre-allocate (px, before scaling). */
  imageHeightHint?: number;
}

type ColumnCount = 2 | 3;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SCREEN_WIDTH = Dimensions.get('window').width;
const GUTTER = 8;

function columnWidth(cols: ColumnCount): number {
  return (SCREEN_WIDTH - GUTTER * (cols + 1)) / cols;
}

/**
 * Distribute items into `cols` columns by greedy shortest-column packing.
 * Returns an array of column arrays.
 */
function layoutMasonry(items: PostGridItem[], cols: ColumnCount): PostGridItem[][] {
  const columns: PostGridItem[][] = Array.from({ length: cols }, () => []);
  const heights = new Array<number>(cols).fill(0);

  for (const item of items) {
    const shortest = heights.indexOf(Math.min(...heights));
    columns[shortest]!.push(item);
    heights[shortest]! += item.imageHeightHint ?? 200;
  }
  return columns;
}

// ─── Single grid cell ─────────────────────────────────────────────────────────

interface GridCellProps {
  item: PostGridItem;
  mediaBaseUrl: string;
  colWidth: number;
  selected: boolean;
  selectionMode: boolean;
  onPress: (postId: string) => void;
  onLongPress: (postId: string) => void;
  onLike: (postId: string, currentlyLiked: boolean) => void;
  onSelect: (postId: string) => void;
}

function GridCell({
  item,
  mediaBaseUrl,
  colWidth,
  selected,
  selectionMode,
  onPress,
  onLongPress,
  onLike,
  onSelect,
}: GridCellProps): ReactElement {
  const [liked, setLiked] = useState(item.isLikedByMe);
  const [likeCount, setLikeCount] = useState(item.likeCount);
  const lastTap = useRef(0);

  const handlePress = useCallback(() => {
    if (selectionMode) {
      onSelect(item.id);
      return;
    }
    const now = Date.now();
    if (now - lastTap.current < 300) {
      // Double-tap to like
      if (!liked) {
        setLiked(true);
        setLikeCount((p) => p + 1);
        onLike(item.id, false);
      }
    } else {
      onPress(item.id);
    }
    lastTap.current = now;
  }, [selectionMode, liked, item.id, onPress, onSelect, onLike]);

  const badgeColors = getTypeBadgeColors(item.type);
  const hasImage = item.mediaAssetIds.length > 0;
  const imageUri = hasImage ? `${mediaBaseUrl}/v1/media/${item.mediaAssetIds[0]}` : undefined;
  const imageHeight = item.imageHeightHint ?? 200;

  return (
    <Pressable
      style={[styles.cell, { width: colWidth }, selected && styles.cellSelected]}
      onPress={handlePress}
      onLongPress={() => onLongPress(item.id)}
      accessibilityRole="button"
      accessibilityLabel={item.body.slice(0, 60)}
      accessibilityState={{ selected }}
    >
      {/* Image / placeholder */}
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={[styles.cellImage, { height: imageHeight }]}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.cellImage, styles.cellImagePlaceholder, { height: Math.max(100, imageHeight * 0.6) }]}>
          <Text style={styles.cellPlaceholderEmoji}>
            {item.type === 'photo' ? '🖼' :
             item.type === 'tip' ? '💡' :
             item.type === 'event' ? '🎉' : '🏷'}
          </Text>
          <Text style={styles.cellBodyPreview} numberOfLines={3}>
            {item.body}
          </Text>
        </View>
      )}

      {/* Overlay: type badge */}
      <View style={[styles.typeBadgeOverlay, { backgroundColor: badgeColors.bg }]}>
        <Text style={[styles.typeBadgeText, { color: badgeColors.text }]}>
          {t(`post.type.${item.type}` as Parameters<typeof t>[0])}
        </Text>
      </View>

      {/* Overlay: like count */}
      <View style={styles.likeOverlay}>
        <Text style={styles.likeOverlayText}>❤ {formatCount(likeCount)}</Text>
      </View>

      {/* Multiple images indicator */}
      {item.mediaAssetIds.length > 1 ? (
        <View style={styles.multiImageBadge}>
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <Text style={styles.multiImageText}>⧉ {item.mediaAssetIds.length}</Text>
        </View>
      ) : null}

      {/* Selection checkbox overlay */}
      {selectionMode ? (
        <View style={[styles.selectionOverlay, selected && styles.selectionOverlayActive]}>
          {selected ? <Text style={styles.checkmark}>{t('suggestions.checkmark')}</Text> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

// ─── Masonry column ────────────────────────────────────────────────────────────

interface MasonryColumnProps {
  items: PostGridItem[];
  mediaBaseUrl: string;
  colWidth: number;
  selectedIds: Set<string>;
  selectionMode: boolean;
  onPress: (id: string) => void;
  onLongPress: (id: string) => void;
  onLike: (id: string, liked: boolean) => void;
  onSelect: (id: string) => void;
}

function MasonryColumn({
  items,
  mediaBaseUrl,
  colWidth,
  selectedIds,
  selectionMode,
  onPress,
  onLongPress,
  onLike,
  onSelect,
}: MasonryColumnProps): ReactElement {
  return (
    <View style={{ flex: 1 }}>
      {items.map((item) => (
        <GridCell
          key={item.id}
          item={item}
          mediaBaseUrl={mediaBaseUrl}
          colWidth={colWidth}
          selected={selectedIds.has(item.id)}
          selectionMode={selectionMode}
          onPress={onPress}
          onLongPress={onLongPress}
          onLike={onLike}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
}

// ─── PostGrid ─────────────────────────────────────────────────────────────────

interface PostGridProps {
  items: PostGridItem[];
  mediaBaseUrl?: string;
  columns?: ColumnCount;
  onPressPost: (postId: string) => void;
  onLike: (postId: string, currentlyLiked: boolean) => void;
  /** Called when multi-select changes */
  onSelectionChange?: (selectedIds: string[]) => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  emptyText?: string;
  loading?: boolean;
  header?: ReactElement;
  footer?: ReactElement;
}

export function PostGrid({
  items,
  mediaBaseUrl = '',
  columns = 2,
  onPressPost,
  onLike,
  onSelectionChange,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  emptyText,
  loading = false,
  header,
  footer,
}: PostGridProps): ReactElement {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const colWidth = columnWidth(columns);

  // Notify parent of selection changes
  useEffect(() => {
    onSelectionChange?.(Array.from(selectedIds));
  }, [selectedIds, onSelectionChange]);

  const handleLongPress = useCallback((postId: string) => {
    setSelectionMode(true);
    setSelectedIds(new Set([postId]));
  }, []);

  const handleSelect = useCallback((postId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  }, []);

  const handleCancelSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const columns2 = layoutMasonry(items, columns);

  // We use a single FlatList with one item (the masonry layout) to get infinite scroll
  // This avoids VirtualizedList nesting issues.
  const listData = [{ key: 'masonry' }];

  const renderHeader = useCallback(() => (
    <View>
      {header ?? null}
      {selectionMode ? (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionCount}>
            {t('mediapicker.selected', { n: selectedIds.size, max: items.length })}
          </Text>
          <Pressable
            onPress={handleCancelSelection}
            style={styles.selectionCancelBtn}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
          >
            <Text style={styles.selectionCancelText}>{t('common.cancel')}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  ), [header, selectionMode, selectedIds.size, items.length, handleCancelSelection]);

  const renderFooter = useCallback(() => (
    <View>
      {loadingMore ? (
        <View style={styles.loadMoreIndicator}>
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      ) : hasMore ? (
        <Pressable
          style={styles.loadMoreBtn}
          onPress={onLoadMore}
          accessibilityRole="button"
          accessibilityLabel={t('feed.loadMore')}
        >
          <Text style={styles.loadMoreText}>{t('feed.loadMore')}</Text>
        </Pressable>
      ) : null}
      {footer ?? null}
    </View>
  ), [loadingMore, hasMore, onLoadMore, footer]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        {header}
        <Text style={styles.emptyText}>{emptyText ?? t('feed.empty')}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={listData}
      keyExtractor={(item) => item.key}
      ListHeaderComponent={renderHeader}
      ListFooterComponent={renderFooter}
      onEndReached={hasMore && !loadingMore ? onLoadMore : undefined}
      onEndReachedThreshold={0.4}
      renderItem={() => (
        <View style={[styles.masonryContainer, { gap: GUTTER }]}>
          {columns2.map((colItems, colIdx) => (
            <MasonryColumn
              key={colIdx}
              items={colItems}
              mediaBaseUrl={mediaBaseUrl}
              colWidth={colWidth}
              selectedIds={selectedIds}
              selectionMode={selectionMode}
              onPress={onPressPost}
              onLongPress={handleLongPress}
              onLike={onLike}
              onSelect={handleSelect}
            />
          ))}
        </View>
      )}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  masonryContainer: {
    flexDirection: 'row',
    paddingHorizontal: GUTTER,
  },
  listContent: {
    paddingTop: GUTTER,
    paddingBottom: 24,
  },
  cell: {
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: GUTTER,
    backgroundColor: COLORS.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cellSelected: {
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  cellImage: {
    width: '100%',
    backgroundColor: COLORS.border,
  },
  cellImagePlaceholder: {
    backgroundColor: COLORS.primaryXLight,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellPlaceholderEmoji: {
    fontSize: 28,
    marginBottom: 6,
  },
  cellBodyPreview: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  typeBadgeOverlay: {
    position: 'absolute',
    top: 6,
    start: 6,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  likeOverlay: {
    position: 'absolute',
    bottom: 6,
    end: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  likeOverlayText: {
    fontSize: 11,
    color: '#FFF',
    fontWeight: '500',
  },
  multiImageBadge: {
    position: 'absolute',
    top: 6,
    end: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  multiImageText: {
    fontSize: 11,
    color: '#FFF',
  },
  selectionOverlay: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    padding: 8,
  },
  selectionOverlayActive: {
    backgroundColor: 'rgba(25,118,210,0.3)',
  },
  checkmark: {
    fontSize: 18,
    color: COLORS.primary,
    backgroundColor: '#FFF',
    borderRadius: 12,
    width: 24,
    height: 24,
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '700',
    overflow: 'hidden',
  },
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primaryXLight,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 4,
  },
  selectionCount: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  selectionCancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
  },
  selectionCancelText: {
    fontSize: 13,
    color: '#FFF',
    fontWeight: '600',
  },
  loadMoreIndicator: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  loadMoreBtn: {
    marginHorizontal: GUTTER,
    marginVertical: 8,
    paddingVertical: 12,
    backgroundColor: COLORS.primaryXLight,
    borderRadius: 10,
    alignItems: 'center',
  },
  loadMoreText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  emptyText: {
    fontSize: 15,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 16,
  },
});
