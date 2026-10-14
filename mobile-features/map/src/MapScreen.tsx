import { Locale, pickName, testIDs, type CityDescriptor, type LngLat, type PlaceId, type PlaceSummary } from '@iraq-maps/contracts';
import { PlaceMarkerSheet } from './components/PlaceMarkerSheet';
import { formatIraqiAddress } from '@iraq-maps/geo';
import { getLocale, t as globalT } from '@iraq-maps/i18n';
import { MapCanvas, SatelliteDisclaimer, type MapCamera } from '@iraq-maps/map-kit';
import { href, savedPlaces, useApi, useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { Banner, Button, IconButton, ListItem, PlaceSummaryCard, Screen, Sheet, Text, TextField, tokens } from '@iraq-maps/ui';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { Pressable, SectionList, StyleSheet, Text as RNText, useWindowDimensions, View } from 'react-native';

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
import { SatelliteToggle } from './components/SatelliteToggle';
import { useMapStyle, type MapMode } from './hooks/useMapStyle';
import { LoadStatus, ok, useLatest } from './load';
import { formatDistance, isolate, kindLabel, t } from './strings';

const SEARCH_DELAY_MS = 300;
const LOCATED_ZOOM = 15;
const NO_RESULTS: PlaceSummary[] = [];
const MAX_RECENT = 5;
/** Queries at or above this length use the full search endpoint; shorter (2–3) use fast suggestions. */
const FULL_SEARCH_MIN_LEN = 4;

const BAGHDAD_CENTER: LngLat = [44.4009, 33.3152];

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

function CityMap({ city, focusPlaceId }: { city: CityDescriptor; focusPlaceId?: string }) {
  const api = useApi();
  const apiBaseUrl = useApiBaseUrl();
  const router = useRouter();
  const maxResultsHeight = useWindowDimensions().height / 2;
  const [mapLang, setMapLang] = useState<Locale>(getLocale);
  const [choosingLang, setChoosingLang] = useState(false);
  // No camera until locate-me: MapCanvas opens on the city bbox.
  const [camera, setCamera] = useState<MapCamera>();
  const [located, setLocated] = useState(false);
  const [focusBanner, setFocusBanner] = useState<string>();
  // Search ranks near the last place the map settled on (a pan, or locate-me), the city centre at first.
  const [near, setNear] = useState<LngLat>(city.center);
  const [locateError, setLocateError] = useState<string>();
  const [locationAddress, setLocationAddress] = useState<string>();
  const [query, setQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  /** When the user picks a suggestion, we promote to full search for that term. */
  const [promotedQuery, setPromotedQuery] = useState<string>();
  const [mapMode, setMapMode] = useState<MapMode>('street');
  const baseLayer = useMapStyle(mapMode);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string>();
  /** The place shown in the compact bottom sheet after tapping a map marker. */
  const [sheetPlace, setSheetPlace] = useState<PlaceSummary | null>(null);
  const [sheetIsSaved, setSheetIsSaved] = useState(false);
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

  const addRecent = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setRecentSearches((prev) => [trimmed, ...prev.filter((r) => r !== trimmed)].slice(0, MAX_RECENT));
  };

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
  const markers = useMemo(() => results.map(({ id, location }) => ({ id, location, selected: id === selectedPlaceId })), [results, selectedPlaceId]);

  type ResultSection = { title: string; data: PlaceSummary[] };
  const resultSections = useMemo((): ResultSection[] => {
    const places = results.filter((p) => p.kind === 'place');
    const streets = results.filter((p) => p.kind === 'street');
    const areas = results.filter((p) => p.kind === 'area');
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

  const locate = async () => {
    setLocateError(undefined);
    try {
      if (!(await Location.requestForegroundPermissionsAsync()).granted) return setLocateError(t('locate.denied'));
      const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const point: LngLat = [coords.longitude, coords.latitude];
      setLocated(true);
      setNear(point);
      setCamera({ center: point, zoom: LOCATED_ZOOM });
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
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setSearchPanelOpen(false)}>
          {/* TODO: PMTiles offline caching - tiles are served from TILES_SOURCE */}
          <MapCanvas
            city={city}
            apiBaseUrl={apiBaseUrl}
            lang={mapLang}
            camera={camera}
            markers={markers}
            onMarkerPress={openFromMarker}
            showUserLocation={located}
            onCameraChanged={setNear}
            baseLayer={baseLayer}
          />
        </Pressable>
        {mapMode === 'satellite' && city.satellite ? <SatelliteDisclaimer layer={city.satellite} /> : null}
      </View>
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
          <SatelliteToggle active={mapMode === 'satellite'} onToggle={() => setMapMode((m) => (m === 'satellite' ? 'street' : 'satellite'))} />
          <IconButton testID={testIDs.map.lang} icon="translate" accessibilityLabel={t('lang.title')} onPress={() => setChoosingLang(true)} />
        </View>
        {locationAddress ? (
          <Text variant="caption" tone="muted">{`${t('locate.addressLabel')}: ${locationAddress}`}</Text>
        ) : null}
        {locateError ? <Banner kind="error" message={locateError} /> : null}
        {focusBanner ? <Banner kind="info" message={focusBanner} /> : null}
        {searchPanelOpen && !q && recentSearches.length > 0 ? (
          <View style={{ maxHeight: maxResultsHeight }}>
            <View style={styles.recentHeader}>
              <Text variant="caption">{t('search.recentTitle')}</Text>
              <Pressable onPress={() => setRecentSearches([])}>
                <RNText style={styles.clearText}>{t('search.clearRecent')}</RNText>
              </Pressable>
            </View>
            <View style={styles.chipsRow}>
              {recentSearches.map((term) => (
                <Pressable
                  key={term}
                  style={styles.chip}
                  onPress={() => { setQuery(term); setSearchPanelOpen(true); }}
                >
                  <RNText style={styles.chipText} numberOfLines={1}>{term}</RNText>
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
                {search.state?.status === 'ready' && !results.length ? <Banner kind="info" message={t('search.empty', { query: isolate(q) })} /> : null}
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

const { color, space, radius, minTouch } = tokens;
const styles = StyleSheet.create({
  fill: { flex: 1 },
  panel: { position: 'absolute', top: 0, start: 0, end: 0, padding: space.m, gap: space.s, backgroundColor: color.bg },
  searchRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.s },
  results: { gap: space.s },
  recentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: space.xs },
  clearText: { color: color.primary, fontSize: 13 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: { paddingHorizontal: space.s, paddingVertical: space.xs, backgroundColor: color.surface, borderRadius: radius.l, borderWidth: 1, borderColor: color.border, maxWidth: 200 },
  chipText: { fontSize: 13, color: color.text },
  sectionHeader: { paddingVertical: space.xs, paddingHorizontal: space.xs, backgroundColor: color.bg },
  // At the end side, above the attribution that MapCanvas pins to the bottom-end corner.
  locate: { position: 'absolute', end: space.m, bottom: space.xl * 2, borderRadius: minTouch / 2, backgroundColor: color.bg, elevation: 4 },
});
