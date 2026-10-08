import { Locale, pickName, testIDs, type CityDescriptor, type LngLat } from '@iraq-maps/contracts';
import { getLocale } from '@iraq-maps/i18n';
import { MapCanvas, type MapCamera } from '@iraq-maps/map-kit';
import { href, useApi, useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { Banner, IconButton, ListItem, PlaceSummaryCard, Screen, Sheet, Text, TextField, tokens } from '@iraq-maps/ui';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useState, type ReactElement } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { LoadStatus, ok, useLatest } from './load';
import { formatDistance, isolate, kindLabel, t } from './strings';

const SEARCH_DELAY_MS = 300;
const LOCATED_ZOOM = 15;

/** The map tab: the first city from GET /v1/cities, with search, locate-me and the map label language. */
export function MapScreen(): ReactElement {
  const api = useApi();
  const cities = useLatest('cities', async () => {
    const [city] = ok(await api.cities.list()).items;
    if (!city) throw new Error('no city');
    return city;
  });
  if (cities.state?.status === 'ready') return <CityMap city={cities.state.data} />;
  return (
    <Screen>
      <LoadStatus {...cities} />
    </Screen>
  );
}

function CityMap({ city }: { city: CityDescriptor }) {
  const api = useApi();
  const apiBaseUrl = useApiBaseUrl();
  const router = useRouter();
  const maxResultsHeight = useWindowDimensions().height / 2;
  const [mapLang, setMapLang] = useState<Locale>(getLocale);
  const [choosingLang, setChoosingLang] = useState(false);
  const [camera, setCamera] = useState<MapCamera>({ bounds: city.bbox });
  const [here, setHere] = useState<LngLat>();
  const [locateError, setLocateError] = useState<string>();
  const [query, setQuery] = useState('');
  const q = query.trim();

  // MapCanvas reports no camera moves, so "near" is the user's location, else the city centre the camera started on.
  const near = (here ?? city.center).map((v) => v.toFixed(6)).join(',');
  const search = useLatest(
    q ? `${mapLang}:${q}` : null,
    async (signal) => ok(await api.places.search({ query: { q, city: city.id, near, lang: mapLang }, fetchOptions: { signal } })).items,
    SEARCH_DELAY_MS,
  );
  const results = search.state?.status === 'ready' ? search.state.data : [];
  const open = (placeId: string) => router.push(href('place', { placeId }));

  const locate = async () => {
    setLocateError(undefined);
    try {
      if (!(await Location.requestForegroundPermissionsAsync()).granted) return setLocateError(t('locate.denied'));
      const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const point: LngLat = [coords.longitude, coords.latitude];
      setHere(point);
      setCamera({ center: point, zoom: LOCATED_ZOOM });
    } catch {
      setLocateError(t('locate.unavailable'));
    }
  };

  return (
    <View style={styles.fill}>
      <View style={StyleSheet.absoluteFill}>
        <MapCanvas
          city={city}
          apiBaseUrl={apiBaseUrl}
          lang={mapLang}
          camera={camera}
          markers={results.map(({ id, location }) => ({ id, location }))}
          onMarkerPress={open}
          showUserLocation={here !== undefined}
        />
      </View>
      <View style={styles.panel}>
        <View style={styles.searchRow}>
          <View style={styles.fill}>
            <TextField testID={testIDs.map.searchInput} label={t('search.label')} placeholder={t('search.placeholder')} value={query} onChangeText={setQuery} />
          </View>
          <IconButton testID={testIDs.map.lang} icon="translate" accessibilityLabel={t('lang.title')} onPress={() => setChoosingLang(true)} />
        </View>
        {locateError ? <Banner kind="error" message={locateError} /> : null}
        {q ? (
          <ScrollView style={{ maxHeight: maxResultsHeight }} contentContainerStyle={styles.results} keyboardShouldPersistTaps="handled">
            <LoadStatus {...search} />
            {search.state?.status === 'ready' && !results.length ? <Banner kind="info" message={t('search.empty', { query: isolate(q) })} /> : null}
            {results.map((place) => (
              <PlaceSummaryCard
                key={place.id}
                testID={testIDs.map.searchResult}
                name={pickName(place.names, mapLang)}
                category={kindLabel(place)}
                area={place.area ? pickName(place.area, mapLang) : undefined}
                distance={place.distanceM === null ? undefined : formatDistance(place.distanceM)}
                source={t('source.osm')}
                onPress={() => open(place.id)}
              />
            ))}
          </ScrollView>
        ) : null}
      </View>
      <View style={styles.locate}>
        <IconButton testID={testIDs.map.locate} icon="my_location" accessibilityLabel={t('locate.label')} onPress={locate} />
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
    </View>
  );
}

const { color, space, minTouch } = tokens;
const styles = StyleSheet.create({
  fill: { flex: 1 },
  panel: { position: 'absolute', top: 0, start: 0, end: 0, padding: space.m, gap: space.s, backgroundColor: color.bg },
  searchRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.s },
  results: { gap: space.s },
  // Above the bottom edge, where MapCanvas keeps the attribution.
  locate: { position: 'absolute', end: space.m, bottom: space.xl * 2, borderRadius: minTouch / 2, backgroundColor: color.bg, elevation: 4 },
});
