import { Locale, pickName, testIDs, type CityDescriptor, type LngLat, type PlaceId, type PlaceSummary } from '@iraq-maps/contracts';
import { PlaceMarkerSheet } from './components/PlaceMarkerSheet';
import { ContextMenu, type ContextMenuCoords } from './components/ContextMenu';
import { formatIraqiAddress } from '@iraq-maps/geo';
import { getLocale, t as globalT } from '@iraq-maps/i18n';
import { MapCanvas, SatelliteDisclaimer, type MapCamera } from '@iraq-maps/map-kit';
import { href, savedPlaces, useApi, useApiBaseUrl, useNetworkStatus } from '@iraq-maps/mobile-kit';
import { Banner, Button, IconButton, ListItem, PlaceSummaryCard, Screen, Sheet, Text, TextField, tokens } from '@iraq-maps/ui';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useRecentSearches } from './hooks/useRecentSearches';
import { useGeofence, type GeofenceZone } from './hooks/useGeofence';
import { Animated, Clipboard, Pressable, SectionList, StyleSheet, Text as RNText, useWindowDimensions, View } from 'react-native';

/** Maps place category to a representative emoji icon. */
const CATEGORY_ICONS: Record<string, string> = {
  food: '🍽️',
  cafe: '☕',
  lodging: '🏨',
  shopping: '🛒',
  tourism: '🏛️',
  health: '🏥',
  finance: '🏦',
  fuel: '⛽',
  office: '🏢',
  worship: '🕌',
  education: '🎓',
  government: '🏛️',
  transport: '🚌',
  entertainment: '🎭',
};
const DEFAULT_ICON = '📍';

/** Returns the icon for a place summary (category takes precedence). */
function categoryIcon(place: PlaceSummary): string {
  return place.category ? (CATEGORY_ICONS[place.category] ?? DEFAULT_ICON) : DEFAULT_ICON;
}
import { MapStyleMenu } from './components/MapStyleMenu';
import { useMapStyle, isDarkMode, type MapMode } from './hooks/useMapStyle';
import { LoadStatus, ok, useLatest } from './load';
import { formatDistance, isolate, kindLabel, t } from './strings';
import { isOfflineAvailable } from './offline/OfflineMapManager';
import { IncidentMarkers } from './incidents/IncidentMarkers';
import { IncidentReportButton } from './incidents/IncidentReportButton';
import { useIncidents } from './incidents/useIncidents';

const SEARCH_DELAY_MS = 300;

/** Category keys shown as quick-filter chips in the empty search panel. */
const QUICK_CATEGORY_KEYS = ['food', 'cafe', 'lodging', 'shopping', 'fuel', 'health'] as const;
const LOCATED_ZOOM = 15;
const NO_RESULTS: PlaceSummary[] = [];

/** Queries at or above this length use the full search endpoint; shorter (2–3) use fast suggestions. */
const FULL_SEARCH_MIN_LEN = 4;

const BAGHDAD_CENTER: LngLat = [44.4009, 33.3152];

/** Returns mock geofence zones — tourist and market areas in Baghdad. Replace with API data in a later milestone. */
function getMockGeofenceZones(): GeofenceZone[] {
  return [
    {
      id: 'gf-mutanabi',
      name: t('geofence.zoneMutanabi'),
      polygon: [
        [44.3920, 33.3400],
        [44.3960, 33.3400],
        [44.3960, 33.3370],
        [44.3920, 33.3370],
      ],
    },
    {
      id: 'gf-shorja',
      name: t('geofence.zoneShorja'),
      polygon: [
        [44.3970, 33.3430],
        [44.4010, 33.3430],
        [44.4010, 33.3400],
        [44.3970, 33.3400],
      ],
    },
  ];
}

/** The map tab: the first city from GET /v1/cities, with search, locate-me and the map label language. */
export function MapScreen(): ReactElement {
  const api = useApi();
  const { focusPlaceId } = useLocalSearchParams<{ focusPlaceId?: string }>();
  const cities = useLatest('cities', async () => {
    const [city] = ok(await api.cities.list()).items;
    if (!city) throw new Error('no city');
    return city;
  });
  if (cities.state?.status === 'ready') return <CityMap city={cities.state.data} focusPlaceId={focusPlaceId} />;
  return (
    <Screen>
      <LoadStatus {...cities} />
    </Screen>
  );
}

/** Compute a human-readable scale bar value for the current zoom. */
function scaleBarLabel(zoom: number): string {
  // Rough approximation: at zoom 15 the visible width is ~2 km; halves/doubles each zoom level.
  const approxKm = 2048 / Math.pow(2, zoom - 1);
  if (approxKm >= 1) return t('scalebar.km', { n: Math.round(approxKm) });
  return t('scalebar.m', { n: Math.round(approxKm * 1000) });
}

function CityMap({ city, focusPlaceId }: { city: CityDescriptor; focusPlaceId?: string }) {
  const api = useApi();
  const apiBaseUrl = useApiBaseUrl();
  const router = useRouter();
  const maxResultsHeight = useWindowDimensions().height / 2;
  const [mapLang, setMapLang] = useState<Locale>(getLocale);
  const [choosingLang, setChoosingLang] = useState(false);
  // No camera until locate-me: MapCanvas opens on the city bbox.
  const [camera, setCamera] = useState<MapCamera>();
  const [currentZoom, setCurrentZoom] = useState(13);
  const [located, setLocated] = useState(false);
  const [focusBanner, setFocusBanner] = useState<string>();
  // Search ranks near the last place the map settled on (a pan, or locate-me), the city centre at first.
  const [near, setNear] = useState<LngLat>(city.center);
  const [locateError, setLocateError] = useState<string>();
  const [locationAddress, setLocationAddress] = useState<string>();
  const isOnline = useNetworkStatus();
  const [query, setQuery] = useState('');
  const recentSearches = useRecentSearches();
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  /** When the user picks a suggestion, we promote to full search for that term. */
  const [promotedQuery, setPromotedQuery] = useState<string>();
  const [mapMode, setMapMode] = useState<MapMode>('street');
  const baseLayer = useMapStyle(mapMode);
  const darkOverlay = isDarkMode(mapMode);
  /** Active category filter; null means show all. */
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string>();
  /** The place shown in the compact bottom sheet after tapping a map marker. */
  const [sheetPlace, setSheetPlace] = useState<PlaceSummary | null>(null);
  const [sheetIsSaved, setSheetIsSaved] = useState(false);
  /** Feature 6: geofence alert message, null when dismissed. */
  const [geofenceAlert, setGeofenceAlert] = useState<string | null>(null);
  /** True when a complete offline region covers the current map centre. */
  const [offlineCached, setOfflineCached] = useState(false);
  /** Track user's last known position for geofencing. */
  const [userPosition, setUserPosition] = useState<LngLat | null>(null);
  /** Dropped pin via long-press. */
  const [droppedPin, setDroppedPin] = useState<ContextMenuCoords | null>(null);
  const [pinAddress, setPinAddress] = useState<string>();
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  /** Pulsing dot animation for My Location FAB. */
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.5)).current;
  // Feature 6: geofencing alerts — notify on entering mock zones
  const geofenceZones = useMemo(() => getMockGeofenceZones(), []);
  const handleGeofenceEnter = useCallback((zone: GeofenceZone) => {
    setGeofenceAlert(t('geofence.entered', { name: zone.name }));
  }, []);
  useGeofence({ zones: geofenceZones, userPosition, onEnter: handleGeofenceEnter });

  // Pulse animation for My Location FAB when located.
  useEffect(() => {
    if (!located) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseAnim, { toValue: 1.5, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0, duration: 800, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(pulseAnim, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.5, duration: 0, useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [located, pulseAnim, pulseOpacity]);

  // Check offline coverage when the map centre changes.
  useEffect(() => {
    void isOfflineAvailable(near).then(setOfflineCached);
  }, [near]);

  // Traffic incidents near the map centre.
  const { incidents, refresh: refreshIncidents } = useIncidents(near, isOnline);

  // Handle deep-link focusPlaceId: fetch place and move camera.
  useEffect(() => {
    if (!focusPlaceId) return;
    void (async () => {
      try {
        const place = ok(await api.places.get({ params: { id: focusPlaceId } }));
        const [lng, lat] = place.location;
        setCamera({ center: [lng, lat], zoom: 16 });
        setFocusBanner(t('focus.show', { name: pickName(place.names, mapLang) }));
      } catch {
        // Fallback to Baghdad center when place is not found.
        setCamera({ center: BAGHDAD_CENTER, zoom: 16 });
        setFocusBanner(t('focus.fallback'));
      }
      setTimeout(() => setFocusBanner(undefined), 3000);
    })();
    // focusPlaceId is the only dep; mapLang is intentionally snapshotted at focus time.
  }, [focusPlaceId]);

  const q = query.trim();
  /** True when the query is short enough to use the fast suggestions endpoint. */
  const useSuggestions = q.length >= 2 && q.length < FULL_SEARCH_MIN_LEN && promotedQuery !== q;

  const addRecent = (term: string) => { recentSearches.add(term); };

  // `near` is read when the debounced request starts, so a pan changes the next search without re-running this one.
  // 4 decimals (about 11m) are enough to rank by distance and send no more of the user's location than that.
  const search = useLatest(
    q && !useSuggestions ? `full:${mapLang}:${q}` : null,
    async (signal) => {
      const params = { q, city: city.id, near: near.map((v) => v.toFixed(4)).join(','), lang: mapLang };
      return ok(await api.places.search({ query: params, fetchOptions: { signal } })).items;
    },
    SEARCH_DELAY_MS,
  );
  const results = search.state?.status === 'ready' ? search.state.data : NO_RESULTS;

  // Fast suggestions endpoint: only names, shown as chips while query is short.
  const suggestions = useLatest(
    useSuggestions ? `sug:${mapLang}:${q}` : null,
    async (signal) => {
      const params = { q, city: city.id, lang: mapLang };
      return ok(await api.places.suggestions({ query: params, fetchOptions: { signal } })).items;
    },
    SEARCH_DELAY_MS,
  );
  const suggestionItems = suggestions.state?.status === 'ready' ? suggestions.state.data : [];
  const filteredResults = useMemo(
    () => (activeCategory ? results.filter((p) => p.category === activeCategory) : results),
    [results, activeCategory],
  );
  const markers = useMemo(
    () => filteredResults.map(({ id, location, category }) => ({ id, location, selected: id === selectedPlaceId, category: category ?? undefined })),
    [filteredResults, selectedPlaceId],
  );

  type ResultSection = { title: string; data: PlaceSummary[] };
  const resultSections = useMemo((): ResultSection[] => {
    const places = filteredResults.filter((p) => p.kind === 'place');
    const streets = filteredResults.filter((p) => p.kind === 'street');
    const areas = filteredResults.filter((p) => p.kind === 'area');
    const sections: ResultSection[] = [];
    if (places.length) sections.push({ title: t('search.sectionPlaces'), data: places });
    if (streets.length) sections.push({ title: t('search.sectionStreets'), data: streets });
    if (areas.length) sections.push({ title: t('search.sectionAreas'), data: areas });
    return sections;
  }, [results]);

  /** Navigate to full place details (from sheet or search list). */
  const openDetails = (placeId: string) => {
    setSelectedPlaceId(placeId);
    addRecent(q);
    router.push(href('place', { placeId }));
  };

  /** Show compact bottom sheet when a map marker is tapped; navigate when tapped from search list. */
  const openFromMarker = useCallback((placeId: string) => {
    const place = results.find((p) => p.id === placeId) ?? null;
    setSelectedPlaceId(placeId);
    setSheetPlace(place);
    void savedPlaces.isSaved(placeId as PlaceId).then(setSheetIsSaved);
  }, [results]);

  const handleSheetSave = useCallback(async () => {
    if (!sheetPlace) return;
    if (sheetIsSaved) {
      await savedPlaces.remove(sheetPlace.id);
      setSheetIsSaved(false);
    } else {
      const name = pickName(sheetPlace.names, mapLang);
      await savedPlaces.save({ placeId: sheetPlace.id, name, category: sheetPlace.category ?? undefined });
      setSheetIsSaved(true);
    }
  }, [sheetPlace, sheetIsSaved, mapLang]);

  /** User taps a suggestion chip: promote to full search with that name. */
  const pickSuggestion = (name: string) => {
    setQuery(name);
    setPromotedQuery(name);
    setSearchPanelOpen(true);
  };

  /** Handle a long-press on the map canvas — drop a pin and show the context menu. */
  const handleMapLongPress = useCallback(
    async (coords: { latitude: number; longitude: number }) => {
      const pinCoords: ContextMenuCoords = { latitude: coords.latitude, longitude: coords.longitude };
      setDroppedPin(pinCoords);
      setPinAddress(undefined);
      setContextMenuVisible(true);
      // Reverse-geocode to get a label for the pin.
      try {
        const point: LngLat = [coords.longitude, coords.latitude];
        const res = await api.places.nearby({
          query: { city: city.id, near: point.map((v) => v.toFixed(6)).join(','), radiusM: 150, limit: 3 },
        });
        if (res.status === 200) {
          const items = res.body.items;
          const area = items.find((p) => p.kind === 'area');
          const street = items.find((p) => p.kind === 'street');
          const addr = formatIraqiAddress({
            street: street ? pickName(street.names, mapLang) : undefined,
            neighborhood: area ? pickName(area.names, mapLang) : undefined,
          });
          if (addr) setPinAddress(addr);
        }
      } catch {
        // best-effort address
      }
    },
    [api, city.id, mapLang],
  );

  const handleContextDirectionsTo = useCallback(
    (coords: ContextMenuCoords) => {
      // Navigate to route-preview with lat/lng query params (no placeId for drop-pin coords)
      router.push(`/route/pin?lat=${coords.latitude.toFixed(6)}&lng=${coords.longitude.toFixed(6)}` as Parameters<typeof router.push>[0]);
    },
    [router],
  );

  const handleContextDirectionsFrom = useCallback(
    (coords: ContextMenuCoords) => {
      // Navigate to route-preview with origin lat/lng query params
      router.push(`/route/pin?fromLat=${coords.latitude.toFixed(6)}&fromLng=${coords.longitude.toFixed(6)}` as Parameters<typeof router.push>[0]);
    },
    [router],
  );

  const handleContextWhatsHere = useCallback(
    (coords: ContextMenuCoords) => {
      const msg = `${t('contextMenu.whatsHere')} ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;
      router.push(`/assistant?initialMessage=${encodeURIComponent(msg)}`);
    },
    [router],
  );

  const handleContextAddPlace = useCallback(
    (coords: ContextMenuCoords) => {
      // Navigate to provider registration with lat/lng prefilled
      router.push(`/provider/register?lat=${coords.latitude.toFixed(6)}&lng=${coords.longitude.toFixed(6)}` as Parameters<typeof router.push>[0]);
    },
    [router],
  );

  const handleCopyCoords = useCallback(() => {
    if (!droppedPin) return;
    Clipboard.setString(`${droppedPin.latitude.toFixed(6)}, ${droppedPin.longitude.toFixed(6)}`);
  }, [droppedPin]);

  const locate = async () => {
    setLocateError(undefined);
    try {
      if (!(await Location.requestForegroundPermissionsAsync()).granted) return setLocateError(t('locate.denied'));
      const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const point: LngLat = [coords.longitude, coords.latitude];
      setLocated(true);
      setNear(point);
      setCamera({ center: point, zoom: LOCATED_ZOOM });
      setUserPosition(point);
      // Reverse geocode: find nearest named places to build an address label
      try {
        const nearbyResult = await api.places.nearby({
          query: { city: city.id, near: point.map((v) => v.toFixed(6)).join(','), radiusM: 200, limit: 5 },
        });
        if (nearbyResult.status === 200) {
          const items = nearbyResult.body.items;
          const area = items.find((p) => p.kind === 'area');
          const street = items.find((p) => p.kind === 'street');
          const addr = formatIraqiAddress({
            street: street ? pickName(street.names, mapLang) : undefined,
            neighborhood: area ? pickName(area.names, mapLang) : undefined,
          });
          if (addr) setLocationAddress(addr);
        }
      } catch {
        // address display is best-effort; ignore errors
      }
    } catch {
      setLocateError(t('locate.unavailable'));
    }
  };

  return (
    <View style={styles.fill}>
      <View style={StyleSheet.absoluteFill}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setSearchPanelOpen(false)}
          onLongPress={(e) => {
            // Long-press drops a pin at the approximate map center; precise coords require
            // a MapLibre hitTest which is not yet exposed via MapCanvasProps. Use near as
            // the best available coordinate until a hitTest port is added.
            if (near) handleMapLongPress({ latitude: near[1], longitude: near[0] });
          }}
          delayLongPress={500}
          accessibilityLabel=""
          importantForAccessibility="no"
        >
          {/* TODO: PMTiles offline caching - tiles are served from TILES_SOURCE */}
          <MapCanvas
            city={city}
            apiBaseUrl={apiBaseUrl}
            lang={mapLang}
            camera={camera}
            markers={markers}
            onMarkerPress={openFromMarker}
            showUserLocation={located}
            onCameraChanged={(lngLat, zoom) => {
              setNear(lngLat);
              setCurrentZoom(zoom);
            }}
            baseLayer={baseLayer}
          />
        </Pressable>
        {mapMode === 'satellite' && city.satellite ? <SatelliteDisclaimer layer={city.satellite} /> : null}
        {darkOverlay ? <View style={styles.darkOverlay} pointerEvents="none" /> : null}
      </View>
      {/* Incident markers overlay – absolute over the map canvas */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <IncidentMarkers incidents={incidents} />
      </View>

      {/* ── Scale bar (bottom-start, above attribution) ── */}
      <View style={styles.scaleBar} pointerEvents="none">
        <View style={styles.scaleBarLine} />
        <RNText style={styles.scaleBarText}>{scaleBarLabel(currentZoom)}</RNText>
      </View>

      {/* ── OSM attribution — ODbL requirement, always visible ── */}
      <View style={styles.osmAttribution} pointerEvents="none">
        <RNText style={styles.osmAttributionText}>{t('attribution.osm')}</RNText>
      </View>

      {/* ── Dropped pin indicator ── */}
      {droppedPin && !contextMenuVisible ? (
        <Pressable
          style={styles.droppedPinDismiss}
          onPress={() => { setDroppedPin(null); setPinAddress(undefined); }}
          accessibilityRole="button"
          accessibilityLabel={t('pin.dismiss')}
        >
          <RNText style={styles.droppedPinDismissText}>✕ {t('pin.dismiss')}</RNText>
        </Pressable>
      ) : null}

      {/* ── Coordinate display (tap to copy) ── */}
      {droppedPin ? (
        <Pressable
          style={styles.coordDisplay}
          onPress={handleCopyCoords}
          accessibilityRole="button"
          accessibilityLabel={t('contextMenu.copyCoords')}
        >
          <RNText style={styles.coordText}>
            {`${droppedPin.latitude.toFixed(5)}, ${droppedPin.longitude.toFixed(5)}`}
          </RNText>
        </Pressable>
      ) : null}

      {/* ── My Location FAB with pulsing dot ── */}
      <View style={styles.myLocationFab}>
        {located ? (
          <Animated.View
            style={[
              styles.locationPulse,
              {
                transform: [{ scale: pulseAnim }],
                opacity: pulseOpacity,
              },
            ]}
            pointerEvents="none"
          />
        ) : null}
        <Pressable
          style={({ pressed }) => [styles.locationFabBtn, pressed && styles.locationFabBtnPressed]}
          onPress={locate}
          accessibilityRole="button"
          accessibilityLabel={t('locationFab.label')}
          testID="map.myLocation.fab"
        >
          <RNText style={styles.locationFabIcon}>{located ? '📍' : '🔍'}</RNText>
        </Pressable>
      </View>
      {!isOnline && (
        <View style={styles.offlineBanner} testID="offline-banner" accessibilityRole="alert">
          <RNText style={styles.offlineBannerText}>{t('offline.banner')}</RNText>
        </View>
      )}
      {isOnline && offlineCached && (
        <View style={styles.offlineCachedBadge} testID="map.offline-cached-badge" accessibilityRole="text">
          <RNText style={styles.offlineCachedText}>{t('offline.offlineBadge')}</RNText>
        </View>
      )}
      {/* Feature 6: geofence alert */}
      {geofenceAlert ? (
        <View style={styles.geofenceAlert} testID="map.geofence-alert" accessibilityRole="alert">
          <RNText style={styles.geofenceAlertText}>{geofenceAlert}</RNText>
          <Pressable onPress={() => setGeofenceAlert(null)} accessibilityRole="button" accessibilityLabel={t('geofence.dismiss')}>
            <RNText style={styles.geofenceAlertDismiss}>{t('geofence.dismiss')}</RNText>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.panel}>
        <View style={styles.searchRow}>
          <View style={styles.fill}>
            <TextField
              testID={testIDs.map.searchInput}
              label={t('search.label')}
              placeholder={t('search.placeholder')}
              value={query}
              onChangeText={(v) => { setQuery(v); setPromotedQuery(undefined); setSearchPanelOpen(true); }}
              accessibilityRole="search"
              accessibilityLabel={t('search.a11yLabel')}
            />
          </View>
          {q ? (
            <IconButton
              testID="map.search.assistant"
              icon="smart_toy"
              accessibilityLabel={t('search.assistantHint')}
              onPress={() => { addRecent(q); router.push(`/assistant?initialMessage=${encodeURIComponent(q)}`); }}
            />
          ) : null}
          <MapStyleMenu mode={mapMode} onModeChange={setMapMode} />
          <IconButton testID={testIDs.map.lang} icon="translate" accessibilityLabel={t('lang.title')} onPress={() => setChoosingLang(true)} />
        </View>
        {locationAddress ? (
          <Text variant="caption" tone="muted">{`${t('locate.addressLabel')}: ${locationAddress}`}</Text>
        ) : null}
        {locateError ? <Banner kind="error" message={locateError} /> : null}
        {focusBanner ? <Banner kind="info" message={focusBanner} /> : null}
        {searchPanelOpen && !q && recentSearches.items.length > 0 ? (
          <View style={{ maxHeight: maxResultsHeight }}>
            <View style={styles.recentHeader}>
              <Text variant="caption">{t('search.recentTitle')}</Text>
              <Pressable onPress={() => recentSearches.clear()} accessibilityRole="button" accessibilityLabel={t('search.clearRecent')}>
                <RNText style={styles.clearText}>{t('search.clearRecent')}</RNText>
              </Pressable>
            </View>
            <View style={styles.chipsRow}>
              {recentSearches.items.map((term) => (
                <Pressable
                  key={term}
                  style={styles.chip}
                  onPress={() => { setQuery(term); setSearchPanelOpen(true); }}
                  accessibilityRole="button"
                  accessibilityLabel={term}
                >
                  <RNText style={styles.chipText} numberOfLines={1}>{term}</RNText>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        {searchPanelOpen && !q ? (
          <View>
            <Text variant="caption" tone="muted">{t('search.categoryChipsTitle')}</Text>
            <View style={styles.chipsRow}>
              {QUICK_CATEGORY_KEYS.map((cat) => (
                <Pressable
                  key={cat}
                  style={styles.chip}
                  onPress={() => { setQuery(t(`categories.${cat}`)); setSearchPanelOpen(true); }}
                  accessibilityRole="button"
                  accessibilityLabel={t(`categories.${cat}`)}
                >
                  <RNText style={styles.chipText} numberOfLines={1}>
                    {`${CATEGORY_ICONS[cat] ?? ''} ${t(`categories.${cat}`)}`}
                  </RNText>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        {searchPanelOpen && useSuggestions && suggestionItems.length > 0 ? (
          <View>
            <Text variant="caption" tone="muted">{t('search.suggestionsHint')}</Text>
            <View style={styles.chipsRow}>
              {suggestionItems.map((item) => (
                <Pressable
                  key={item.id}
                  style={styles.chip}
                  accessibilityRole="button"
                  onPress={() => pickSuggestion(item.name)}
                >
                  <RNText style={styles.chipText} numberOfLines={1}>{item.name}</RNText>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        {searchPanelOpen && q && !useSuggestions && results.length > 0 ? (
          <View>
            <Text variant="caption" tone="muted">{t('categoryFilter.label')}</Text>
            <View style={styles.chipsRow}>
              <Pressable
                key="__all"
                style={[styles.chip, !activeCategory && styles.chipActive]}
                onPress={() => setActiveCategory(null)}
                accessibilityRole="button"
                accessibilityLabel={t('categoryFilter.all')}
              >
                <RNText style={[styles.chipText, !activeCategory && styles.chipTextActive]}>{t('categoryFilter.all')}</RNText>
              </Pressable>
              {Array.from(new Set(results.filter((r) => r.category).map((r) => r.category as string))).map((cat) => (
                <Pressable
                  key={cat}
                  style={[styles.chip, activeCategory === cat && styles.chipActive]}
                  onPress={() => setActiveCategory((prev) => (prev === cat ? null : cat))}
                  accessibilityRole="button"
                  accessibilityLabel={t(`categories.${cat}` as Parameters<typeof t>[0])}
                >
                  <RNText style={[styles.chipText, activeCategory === cat && styles.chipTextActive]} numberOfLines={1}>
                    {`${CATEGORY_ICONS[cat] ?? ''} ${t(`categories.${cat}` as Parameters<typeof t>[0])}`}
                  </RNText>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        {searchPanelOpen && q && !useSuggestions ? (
          <SectionList
            style={{ maxHeight: maxResultsHeight }}
            contentContainerStyle={styles.results}
            keyboardShouldPersistTaps="handled"
            sections={resultSections}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={
              <>
                {search.state?.status === 'failed' && search.state.message === globalT('common:errors.network')
                  ? <Banner kind="error" message={globalT('common:errors.network')} onRetry={search.retry} retryLabel={globalT('common:actions.retry')} />
                  : <LoadStatus {...search} />}
                {search.state?.status === 'ready' && !filteredResults.length ? (
                  <>
                    <Banner kind="info" message={t('search.empty', { query: isolate(q) })} />
                    <NoResultsSuggestions city={city.id} near={near} lang={mapLang} api={api} onPress={openDetails} />
                  </>
                ) : null}
                {search.state?.status === 'ready' && filteredResults.length > 0 ? (
                  <Text variant="caption" tone="muted">{t('search.resultCount', { count: String(filteredResults.length) })}</Text>
                ) : null}
              </>
            }
            renderSectionHeader={({ section }) =>
              resultSections.length > 1 ? (
                <View style={styles.sectionHeader}>
                  <Text variant="caption">{section.title}</Text>
                </View>
              ) : null
            }
            renderItem={({ item: place }) => {
              const placeName = pickName(place.names, mapLang);
              const placeCategory = kindLabel(place);
              return (
                <PlaceSummaryCard
                  key={place.id}
                  testID={testIDs.map.searchResult}
                  name={`${categoryIcon(place)} ${placeName}`}
                  category={placeCategory}
                  area={place.area ? pickName(place.area, mapLang) : undefined}
                  distance={place.distanceM === null ? undefined : formatDistance(place.distanceM)}
                  source={t('source.osm')}
                  onPress={() => openDetails(place.id)}
                />
              );
            }}
          />
        ) : null}
      </View>
      <View style={styles.locate}>
        {/* Feature 5: compass/north reset button */}
        <IconButton
          testID="map.compass"
          icon="explore"
          accessibilityLabel={t('compass.label')}
          onPress={() => {
            setCamera((prev) => {
              const center = (prev && 'center' in prev) ? prev.center : city.center;
              const zoom = (prev && 'zoom' in prev) ? prev.zoom : 13;
              return { center, zoom };
            });
          }}
        />
        <IconButton testID={testIDs.map.locate} icon="my_location" accessibilityLabel={t('locate.label')} onPress={locate} />
        <Button
          testID="map.near.me"
          label={t('actions.nearMe')}
          onPress={() => {
            void locate().then(() => {
              setQuery('');
              setSearchPanelOpen(true);
            });
          }}
        />
        {selectedPlaceId && !sheetPlace ? (
          <Button
            label={t('actions.directions')}
            onPress={() => router.push(href('navigation', { placeId: selectedPlaceId }))}
          />
        ) : null}
        <Button
          testID="assistant.open.button"
          label={t('actions.assistant')}
          onPress={() => router.push('/assistant')}
        />
        <IconButton
          testID="map.offline-maps-btn"
          icon="⬇"
          accessibilityLabel={t('offline.title')}
          onPress={() => router.push(href('offlineMaps'))}
        />
        <IncidentReportButton
          userLocation={userPosition}
          onReported={refreshIncidents}
        />
        <IconButton
          testID="map.location-share-btn"
          icon="📡"
          accessibilityLabel={t('locationShare.shareBtn')}
          onPress={() => router.push(href('locationShare'))}
        />
      </View>
      <Sheet visible={choosingLang} onClose={() => setChoosingLang(false)}>
        <Text variant="subtitle">{t('lang.title')}</Text>
        {Locale.options.map((lang) => (
          <ListItem
            key={lang}
            testID={`${testIDs.map.lang}.${lang}`}
            title={t(`lang.${lang}`)}
            selected={lang === mapLang}
            onPress={() => {
              setMapLang(lang);
              setChoosingLang(false);
            }}
          />
        ))}
      </Sheet>
      {/* ── Dropped-pin context menu ── */}
      <ContextMenu
        visible={contextMenuVisible}
        coords={droppedPin}
        address={pinAddress}
        onDirectionsTo={handleContextDirectionsTo}
        onDirectionsFrom={handleContextDirectionsFrom}
        onAddPlace={handleContextAddPlace}
        onWhatsHere={handleContextWhatsHere}
        onDismiss={() => setContextMenuVisible(false)}
      />

      {sheetPlace ? (
        <PlaceMarkerSheet
          place={sheetPlace}
          name={pickName(sheetPlace.names, mapLang)}
          icon={categoryIcon(sheetPlace)}
          category={sheetPlace.category ? t(`categories.${sheetPlace.category}`) : undefined}
          isSaved={sheetIsSaved}
          onSave={() => { void handleSheetSave(); }}
          onViewDetails={() => {
            setSheetPlace(null);
            openDetails(sheetPlace.id);
          }}
          onDirections={() => {
            setSheetPlace(null);
            router.push(href('navigation', { placeId: sheetPlace.id }));
          }}
          onDismiss={() => setSheetPlace(null)}
        />
      ) : null}
    </View>
  );
}

// ── No-results suggestions (feature: place suggestions) ──────────────────────

interface NoResultsSuggestionsProps {
  city: string;
  near: number[];
  lang: string;
  api: ReturnType<typeof useApi>;
  onPress: (id: string) => void;
}

function NoResultsSuggestions({ city, near, lang, api, onPress }: NoResultsSuggestionsProps): ReactElement | null {
  const [items, setItems] = useState<PlaceSummary[]>([]);
  const mapLang = lang as Locale;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const nearStr = near.map((v) => v.toFixed(4)).join(',');
        const res = await api.places.nearby({ query: { city, near: nearStr, radiusM: 1000, limit: 5 } });
        if (res.status === 200 && !cancelled) setItems(res.body.items.slice(0, 5));
      } catch { /* best-effort */ }
    })();
    return () => { cancelled = true; };
  }, [city, near[0], near[1], lang]);

  if (items.length === 0) return null;

  return (
    <View style={noResSugStyles.container}>
      <Text variant="caption" tone="muted">{t('search.noResultsSuggest')}</Text>
      {items.map((place) => (
        <PlaceSummaryCard
          key={place.id}
          name={`${categoryIcon(place)} ${pickName(place.names, mapLang)}`}
          category={kindLabel(place)}
          distance={place.distanceM === null ? undefined : formatDistance(place.distanceM)}
          source={t('source.osm')}
          onPress={() => onPress(place.id)}
        />
      ))}
    </View>
  );
}

const noResSugStyles = StyleSheet.create({
  container: { gap: 4, marginTop: 8 },
});

const { color, space, radius, minTouch } = tokens;
const styles = StyleSheet.create({
  fill: { flex: 1 },
  offlineBanner: { position: 'absolute', top: 0, start: 0, end: 0, backgroundColor: '#F59E0B', paddingVertical: 8, paddingHorizontal: 16, zIndex: 100 },
  offlineBannerText: { color: '#FFF', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  offlineCachedBadge: { position: 'absolute', top: 12, start: 12, backgroundColor: '#0A6B4B', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 4, zIndex: 90 },
  offlineCachedText: { color: '#FFF', fontSize: 11, fontWeight: '600' },
  panel: { position: 'absolute', top: 0, start: 0, end: 0, padding: space.m, gap: space.s, backgroundColor: color.bg },
  searchRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.s },
  results: { gap: space.s },
  recentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: space.xs },
  clearText: { color: color.primary, fontSize: 13 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: { paddingHorizontal: space.s, paddingVertical: space.xs, backgroundColor: color.surface, borderRadius: radius.l, borderWidth: 1, borderColor: color.border, maxWidth: 200 },
  chipActive: { backgroundColor: color.primary, borderColor: color.primary },
  chipText: { fontSize: 13, color: color.text },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  darkOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 1 },
  sectionHeader: { paddingVertical: space.xs, paddingHorizontal: space.xs, backgroundColor: color.bg },
  // At the end side, above the attribution that MapCanvas pins to the bottom-end corner.
  locate: { position: 'absolute', end: space.m, bottom: space.xl * 2, borderRadius: minTouch / 2, backgroundColor: color.bg, elevation: 4 },
  // Feature 6: geofence alert toast
  geofenceAlert: { position: 'absolute', top: 80, start: space.m, end: space.m, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1D4ED8', paddingVertical: space.s, paddingHorizontal: space.m, borderRadius: 8, elevation: 8, gap: space.s },
  geofenceAlertText: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  geofenceAlertDismiss: { color: '#93C5FD', fontSize: 13, fontWeight: '600' },
  // Scale bar — bottom-start corner
  scaleBar: {
    position: 'absolute',
    bottom: 32,
    start: space.m,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scaleBarLine: {
    width: 60,
    height: 3,
    backgroundColor: '#1F2937',
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#fff',
  },
  scaleBarText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1F2937',
    textShadowColor: '#fff',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  // OSM attribution — always visible at very bottom start
  osmAttribution: {
    position: 'absolute',
    bottom: 8,
    start: space.m,
    backgroundColor: 'rgba(255,255,255,0.75)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  osmAttributionText: { fontSize: 10, color: '#374151' },
  // Dropped pin dismiss pill
  droppedPinDismiss: {
    position: 'absolute',
    bottom: 80,
    alignSelf: 'center',
    start: 0,
    end: 0,
    marginHorizontal: space.xl,
    backgroundColor: '#1F2937',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 24,
    alignItems: 'center',
    elevation: 6,
  },
  droppedPinDismissText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  // Coordinate display pill — tappable to copy
  coordDisplay: {
    position: 'absolute',
    bottom: 120,
    alignSelf: 'center',
    start: 0,
    end: 0,
    marginHorizontal: space.xl * 2,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    alignItems: 'center',
  },
  coordText: { color: '#F9FAFB', fontSize: 12, fontFamily: 'monospace' },
  // My Location FAB
  myLocationFab: {
    position: 'absolute',
    end: space.m,
    bottom: 120,
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationPulse: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#2563EB',
  },
  locationFabBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  locationFabBtnPressed: { opacity: 0.85 },
  locationFabIcon: { fontSize: 24 },
});
