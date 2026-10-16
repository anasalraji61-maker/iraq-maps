/**
 * SearchResultsMap – map-integrated search results viewer.
 *
 * Features:
 *  - Results as markers with count-badge clusters via MapClusters
 *  - Bottom sheet with scrollable results list
 *  - Selected result expands to a detail card
 *  - "Re-search on map move" with a "Search here" button
 *  - Heatmap overlay toggle
 *
 * Props:
 *  - results: PlaceSearchResult[] from the search API
 *  - onResultPress: navigate to place detail
 *  - onSearchHere: called with new center [lng, lat] when user taps "Search here"
 *  - loading: show spinner overlay
 */
/* eslint-disable i18next/no-literal-string, no-restricted-syntax */

import type { PlaceSearchResult } from '@iraq-maps/contracts';
import { type ReactElement, useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  I18nManager,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text as RNText } from 'react-native';
import { PlaceCard as _PlaceCard } from './PlaceCard';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIMARY = '#1976D2';
const SURFACE = '#FFFFFF';
const DIVIDER = '#E0E0E0';
const ACCENT = '#F5A623';
const CLUSTER_COLORS = ['#1976D2', '#388E3C', '#F57C00', '#7B1FA2'];

/** Haversine distance in metres between two lng,lat pairs. */
function haversine(
  [lng1, lat1]: [number, number],
  [lng2, lat2]: [number, number],
): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface SearchResultsMapProps {
  results: PlaceSearchResult[];
  onResultPress?: (result: PlaceSearchResult) => void;
  onSearchHere?: (center: [number, number]) => void;
  loading?: boolean;
  userLocation?: [number, number] | null;
  testID?: string;
}

// ── Cluster helper ────────────────────────────────────────────────────────────

interface Cluster {
  id: string;
  center: [number, number];
  items: PlaceSearchResult[];
  colorIndex: number;
}

/** Very simple grid-based clustering for the list view simulation. */
function clusterResults(
  results: PlaceSearchResult[],
  gridSizeKm = 0.5,
): Cluster[] {
  const clusters: Cluster[] = [];

  for (const result of results) {
    const [lng, lat] = result.location;
    let found = false;

    for (const cluster of clusters) {
      const dist = haversine(cluster.center, [lng, lat]);
      if (dist < gridSizeKm * 1000) {
        cluster.items.push(result);
        // Update center to centroid
        cluster.center = [
          (cluster.center[0] * (cluster.items.length - 1) + lng) /
            cluster.items.length,
          (cluster.center[1] * (cluster.items.length - 1) + lat) /
            cluster.items.length,
        ];
        found = true;
        break;
      }
    }

    if (!found) {
      clusters.push({
        id: result.id,
        center: [lng, lat],
        items: [result],
        colorIndex: clusters.length % CLUSTER_COLORS.length,
      });
    }
  }

  return clusters;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SearchResultsMap({
  results,
  onResultPress,
  onSearchHere,
  loading = false,
  userLocation,
  testID,
}: SearchResultsMapProps): ReactElement {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [mapMoved, setMapMoved] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);

  // Simulated map center (real integration uses MapLibre camera)
  const [mapCenter, setMapCenter] = useState<[number, number]>([44.36, 33.31]);

  const sheetAnim = useRef(new Animated.Value(0)).current;
  const clusters = clusterResults(results);

  const selectedResult = results.find((r) => r.id === selectedId) ?? null;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleMarkerPress = useCallback((result: PlaceSearchResult) => {
    setSelectedId((prev) => (prev === result.id ? null : result.id));
  }, []);

  const handleClusterPress = useCallback((cluster: Cluster) => {
    if (cluster.items.length === 1) {
      handleMarkerPress(cluster.items[0]!);
    }
    // For real map: zoom into cluster bounds
  }, [handleMarkerPress]);

  const handleSearchHere = useCallback(() => {
    onSearchHere?.(mapCenter);
    setMapMoved(false);
  }, [mapCenter, onSearchHere]);

  const handleMapSimMove = useCallback(() => {
    // In real implementation, listen to MapLibre camera events
    setMapMoved(true);
    setMapCenter((c) => [c[0] + 0.001, c[1]]);
  }, []);

  const toggleSheetExpand = useCallback(() => {
    setSheetExpanded((prev) => {
      const toValue = prev ? 0 : 1;
      Animated.spring(sheetAnim, {
        toValue,
        useNativeDriver: false,
        tension: 80,
        friction: 10,
      }).start();
      return !prev;
    });
  }, [sheetAnim]);

  // ── Map area (placeholder — real impl uses MapLibre) ─────────────────────

  const MapPlaceholder = (): ReactElement => (
    <View style={styles.mapArea} testID={testID ?? 'searchResultsMap'}>
      {/* Map background */}
      <View style={styles.mapBg}>
        <RNText style={styles.mapBgText}>🗺️</RNText>
        <RNText style={styles.mapBgSubtext}>
          {t('advancedSearch.mapPlaceholder')}
        </RNText>
      </View>

      {/* Cluster markers */}
      {clusters.map((cluster, idx) => (
        <TouchableOpacity
          key={cluster.id}
          style={[
            styles.clusterMarker,
            {
              // Position markers in a grid pattern for the placeholder
              top: 40 + (idx % 4) * 55,
              start: 30 + Math.floor(idx / 4) * 70,
              backgroundColor: CLUSTER_COLORS[cluster.colorIndex] ?? PRIMARY,
            },
          ]}
          onPress={() => handleClusterPress(cluster)}
          accessibilityLabel={`${cluster.items.length} ${t('advancedSearch.results')}`}
        >
          {cluster.items.length > 1 ? (
            <>
              <RNText style={styles.clusterCount}>
                {cluster.items.length}
              </RNText>
              <View style={styles.clusterBadge}>
                <RNText style={styles.clusterBadgeText}>
                  {cluster.items.length}
                </RNText>
              </View>
            </>
          ) : (
            <RNText style={styles.markerPin}>📍</RNText>
          )}
        </TouchableOpacity>
      ))}

      {/* User location dot */}
      {userLocation && (
        <View style={[styles.userDot, { top: 100, start: 100 }]}>
          <View style={styles.userDotInner} />
        </View>
      )}

      {/* Heatmap overlay */}
      {showHeatmap && (
        <View style={styles.heatmapOverlay} pointerEvents="none">
          {results.map((r, i) => (
            <View
              key={r.id}
              style={[
                styles.heatmapBlob,
                {
                  top: 40 + (i % 5) * 50,
                  start: 20 + Math.floor(i / 5) * 60,
                  opacity: (r.rating ?? 3) / 5,
                },
              ]}
            />
          ))}
        </View>
      )}

      {/* Map controls */}
      <View style={styles.mapControls}>
        <TouchableOpacity
          style={styles.mapControlBtn}
          onPress={() => setShowHeatmap((v) => !v)}
          accessibilityLabel={t('advancedSearch.heatmap')}
        >
          <RNText style={styles.mapControlIcon}>🌡️</RNText>
          {showHeatmap && <View style={styles.mapControlActive} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.mapControlBtn}
          onPress={handleMapSimMove}
          accessibilityLabel={t('advancedSearch.moveMap')}
        >
          <RNText style={styles.mapControlIcon}>↕️</RNText>
        </TouchableOpacity>
      </View>

      {/* "Search here" button */}
      {mapMoved && (
        <TouchableOpacity
          style={styles.searchHereBtn}
          onPress={handleSearchHere}
          accessibilityRole="button"
        >
          <RNText style={styles.searchHereText}>
            🔍 {t('advancedSearch.searchHere')}
          </RNText>
        </TouchableOpacity>
      )}

      {/* Loading overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={PRIMARY} size="large" />
        </View>
      )}
    </View>
  );

  // ── Selected result card ──────────────────────────────────────────────────

  const SelectedCard = (): ReactElement | null => {
    if (!selectedResult) return null;

    return (
      <View style={styles.selectedCard}>
        <View style={styles.selectedCardHeader}>
          <RNText style={styles.selectedCardTitle} numberOfLines={1}>
            {selectedResult.name}
          </RNText>
          <TouchableOpacity
            onPress={() => setSelectedId(null)}
            style={styles.selectedCardClose}
            accessibilityLabel={t('search.clearInput')}
          >
            <RNText style={styles.selectedCardCloseIcon}>✕</RNText>
          </TouchableOpacity>
        </View>

        <View style={styles.selectedCardMeta}>
          {selectedResult.rating != null && (
            <View style={styles.ratingBadge}>
              <RNText style={styles.ratingBadgeStar}>★</RNText>
              <RNText style={styles.ratingBadgeValue}>
                {selectedResult.rating.toFixed(1)}
              </RNText>
              <RNText style={styles.ratingBadgeCount}>
                ({selectedResult.reviewCount})
              </RNText>
            </View>
          )}
          {selectedResult.distanceM != null && (
            <RNText style={styles.selectedCardDist}>
              {selectedResult.distanceM < 1000
                ? `${Math.round(selectedResult.distanceM)} م`
                : `${(selectedResult.distanceM / 1000).toFixed(1)} كم`}
            </RNText>
          )}
          {selectedResult.openNow != null && (
            <View
              style={[
                styles.openBadge,
                selectedResult.openNow
                  ? styles.openBadgeOpen
                  : styles.openBadgeClosed,
              ]}
            >
              <RNText style={styles.openBadgeText}>
                {selectedResult.openNow
                  ? t('markerSheet.openBadge')
                  : t('markerSheet.closedBadge')}
              </RNText>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={styles.selectedCardBtn}
          onPress={() => onResultPress?.(selectedResult)}
        >
          <RNText style={styles.selectedCardBtnText}>
            {t('advancedSearch.viewDetails')}
          </RNText>
        </TouchableOpacity>
      </View>
    );
  };

  // ── Bottom sheet ──────────────────────────────────────────────────────────

  const sheetHeight = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [180, 420],
  });

  return (
    <View style={styles.container}>
      <MapPlaceholder />

      {/* Selected result floating card */}
      {selectedResult && <SelectedCard />}

      {/* Bottom sheet */}
      <Animated.View style={[styles.sheet, { height: sheetHeight }]}>
        {/* Drag handle */}
        <TouchableOpacity
          style={styles.sheetHandle}
          onPress={toggleSheetExpand}
          accessibilityRole="button"
          accessibilityLabel={
            sheetExpanded
              ? t('advancedSearch.collapseSheet')
              : t('advancedSearch.expandSheet')
          }
        >
          <View style={styles.sheetHandleBar} />
          <RNText style={styles.sheetTitle}>
            {t('advancedSearch.results')}
            {results.length > 0 && (
              <RNText style={styles.sheetCount}> ({results.length})</RNText>
            )}
          </RNText>
          <RNText style={styles.sheetChevron}>
            {sheetExpanded ? '▼' : '▲'}
          </RNText>
        </TouchableOpacity>

        {/* Results list */}
        {results.length === 0 && !loading ? (
          <View style={styles.emptyState}>
            <RNText style={styles.emptyStateText}>
              {t('advancedSearch.noResults')}
            </RNText>
          </View>
        ) : (
          <ScrollView
            style={styles.resultsList}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {results.map((result) => (
              <Pressable
                key={result.id}
                onPress={() => {
                  handleMarkerPress(result);
                  onResultPress?.(result);
                }}
                style={[
                  styles.resultItem,
                  selectedId === result.id && styles.resultItemSelected,
                ]}
                accessibilityRole="button"
                accessibilityLabel={result.name}
              >
                {/* Rank indicator */}
                <View style={styles.resultRank}>
                  <RNText style={styles.resultRankText}>
                    {results.indexOf(result) + 1}
                  </RNText>
                </View>

                {/* Info */}
                <View style={styles.resultInfo}>
                  <RNText style={styles.resultName} numberOfLines={1}>
                    {result.name}
                  </RNText>
                  <View style={styles.resultMeta}>
                    {result.category && (
                      <RNText style={styles.resultCategory}>
                        {t(`categories.${result.category}`)}
                      </RNText>
                    )}
                    {result.rating != null && (
                      <>
                        <RNText style={styles.metaDot}>·</RNText>
                        <RNText style={styles.resultRating}>
                          ★ {result.rating.toFixed(1)}
                        </RNText>
                      </>
                    )}
                    {result.distanceM != null && (
                      <>
                        <RNText style={styles.metaDot}>·</RNText>
                        <RNText style={styles.resultDist}>
                          {result.distanceM < 1000
                            ? `${Math.round(result.distanceM)} م`
                            : `${(result.distanceM / 1000).toFixed(1)} كم`}
                        </RNText>
                      </>
                    )}
                  </View>
                </View>

                {/* Open status */}
                {result.openNow != null && (
                  <View
                    style={[
                      styles.resultOpenDot,
                      result.openNow
                        ? styles.resultOpenDotOpen
                        : styles.resultOpenDotClosed,
                    ]}
                  />
                )}
              </Pressable>
            ))}
            <View style={{ height: 20 }} />
          </ScrollView>
        )}
      </Animated.View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  mapArea: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#E8EAF0',
    minHeight: 300,
  },
  mapBg: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mapBgText: { fontSize: 48, opacity: 0.3 },
  mapBgSubtext: { fontSize: 13, color: '#999', opacity: 0.7 },
  clusterMarker: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  clusterCount: { fontSize: 14, fontWeight: '700', color: '#fff' },
  clusterBadge: {
    position: 'absolute',
    top: -6,
    end: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#E53935',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  clusterBadgeText: { fontSize: 10, color: '#fff', fontWeight: '700' },
  markerPin: { fontSize: 24 },
  userDot: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(25, 118, 210, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: PRIMARY,
  },
  userDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: PRIMARY,
  },
  heatmapOverlay: { position: 'absolute', top: 0, start: 0, end: 0, bottom: 0 },
  heatmapBlob: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FF6F00',
  },
  mapControls: {
    position: 'absolute',
    top: 12,
    end: 12,
    gap: 8,
  },
  mapControlBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  mapControlIcon: { fontSize: 16 },
  mapControlActive: {
    position: 'absolute',
    bottom: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: PRIMARY,
  },
  searchHereBtn: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    backgroundColor: SURFACE,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    borderWidth: 1,
    borderColor: PRIMARY,
  },
  searchHereText: { fontSize: 13, color: PRIMARY, fontWeight: '600' },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedCard: {
    position: 'absolute',
    bottom: 200,
    start: 16,
    end: 16,
    backgroundColor: SURFACE,
    borderRadius: 14,
    padding: 14,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    gap: 8,
  },
  selectedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedCardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
  },
  selectedCardClose: { padding: 4 },
  selectedCardCloseIcon: { fontSize: 14, color: '#9E9E9E' },
  selectedCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ratingBadgeStar: { fontSize: 13, color: ACCENT },
  ratingBadgeValue: { fontSize: 13, fontWeight: '600', color: '#333' },
  ratingBadgeCount: { fontSize: 12, color: '#999' },
  selectedCardDist: { fontSize: 12, color: '#777' },
  openBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  openBadgeOpen: { backgroundColor: '#E8F5E9' },
  openBadgeClosed: { backgroundColor: '#FFEBEE' },
  openBadgeText: { fontSize: 11, fontWeight: '600' },
  selectedCardBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  selectedCardBtnText: { fontSize: 13, color: '#fff', fontWeight: '600' },
  sheet: {
    backgroundColor: SURFACE,
    borderTopStartRadius: 18,
    borderTopEndRadius: 18,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    overflow: 'hidden',
  },
  sheetHandle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: DIVIDER,
    gap: 8,
  },
  sheetHandleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DDD',
    alignSelf: 'center',
    position: 'absolute',
    top: 6,
    start: '50%',
    marginStart: -18,
  },
  sheetTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#222',
    marginTop: 6,
  },
  sheetCount: { fontWeight: '400', color: '#777' },
  sheetChevron: { fontSize: 10, color: '#9E9E9E', marginTop: 6 },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyStateText: { fontSize: 14, color: '#999', textAlign: 'center' },
  resultsList: { flex: 1 },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
    gap: 10,
  },
  resultItemSelected: { backgroundColor: '#F5F9FF' },
  resultRank: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#EEEEEE',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  resultRankText: { fontSize: 11, fontWeight: '700', color: '#666' },
  resultInfo: { flex: 1, gap: 2 },
  resultName: { fontSize: 14, fontWeight: '600', color: '#111' },
  resultMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  resultCategory: { fontSize: 11, color: '#888' },
  metaDot: { fontSize: 10, color: '#CCC' },
  resultRating: { fontSize: 11, color: ACCENT },
  resultDist: { fontSize: 11, color: '#AAA' },
  resultOpenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  resultOpenDotOpen: { backgroundColor: '#43A047' },
  resultOpenDotClosed: { backgroundColor: '#E53935' },
});
