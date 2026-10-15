import { pickName, placesContract, testIDs, type CrowdLevel, type LngLat, type PlaceCategory, type PlaceDetails, type PriceLevel } from '@iraq-maps/contracts';
import { getLocale } from '@iraq-maps/i18n';
import { href, routes, savedPlaces, useApi, useHaptics, useRouteAvailable } from '@iraq-maps/mobile-kit';
import { Badge, Banner, Button, ListItem, Screen, Text } from '@iraq-maps/ui';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactElement, useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, Share, StyleSheet, View } from 'react-native';
import { PlaceSkeleton } from './components/PlaceSkeleton';
import { ProviderSection } from './components/ProviderSection';
import { ReviewsSection } from './components/ReviewsSection';
import { openNow, closesAt, todayHours } from './hours';
import { useDistanceFromUser } from './hooks/useDistanceFromUser';
import { LoadStatus, ok, useLatest } from './load';
import { formatDistance, isolate, kindLabel, t } from './strings';

/** Actions whose feature ships in a later milestone; each appears once its route is delivered (useRouteAvailable). */
const actions = { routePreview: 'actions.directions', messageCompose: 'actions.message', assistant: 'actions.assistant' } as const;

/** `place/[placeId]`: GET /v1/places/:id as a card. Also the target of iraqmaps://place/<id>. */
export function PlaceScreen(): ReactElement {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  // A deep link is untrusted, and ts-rest does not encode path params: only an id in the contract's format reaches the
  // API, so `../me` cannot call another route with the user's token.
  const params = placesContract.get.pathParams.safeParse({ id: placeId });
  if (!params.success) {
    return (
      <Screen>
        <Banner kind="error" message={t('place.notFound')} />
      </Screen>
    );
  }
  return <PlaceLoader id={params.data.id} />;
}

function PlaceLoader({ id }: { id: string }) {
  const api = useApi();
  const place = useLatest(id, async () => ok(await api.places.get({ params: { id } })));
  if (place.state?.status === 'ready') return <PlaceCard place={place.state.data} />;
  return (
    <Screen scroll>
      {place.state?.status === 'loading' ? <PlaceSkeleton /> : <LoadStatus {...place} />}
    </Screen>
  );
}

function PlaceCard({ place }: { place: PlaceDetails }) {
  const lang = getLocale();
  const api = useApi();
  const haptics = useHaptics();
  const name = pickName(place.names, lang);
  const open = place.hoursRaw ? openNow(place.hoursRaw) : null;
  const closingTime = (open === true && place.hoursRaw) ? closesAt(place.hoursRaw) : null;
  const todaySpans = place.hoursRaw ? todayHours(place.hoursRaw) : null;
  // The app scheme (app.config `scheme`) plus the place route: iraqmaps://place/<id>.
  const link = `iraqmaps:/${href('place', { placeId: place.id })}`;
  const share = () => Share.share({ message: `${name}\n${link}` }).catch(() => undefined);
  const { phone, website } = place.osmContacts;
  const reportCrowded = () =>
    api.insights
      .report({ body: { placeId: place.id, kind: 'crowded_now' } })
      .catch(() => undefined);

  const reportPrice = () => {
    const levels: PriceLevel[] = ['budget', 'mid_range', 'expensive', 'luxury'];
    const labels: Record<PriceLevel, string> = {
      budget: t('place.priceBudget'),
      mid_range: t('place.priceMidRange'),
      expensive: t('place.priceExpensive'),
      luxury: t('place.priceLuxury'),
    };
    Alert.alert(
      t('place.reportPriceTitle'),
      undefined,
      [
        ...levels.map((level) => ({
          text: labels[level],
          onPress: () => {
            api.insights
              .report({ body: { placeId: place.id, kind: 'price', priceLevel: level } })
              .catch(() => undefined);
          },
        })),
        { text: t('reviews.cancelForm'), style: 'cancel' as const },
      ],
    );
  };

  const reportInaccuracy = () => {
    const reasons = [
      { key: 'reportInaccuracyWrongName' as const, label: t('place.reportInaccuracyWrongName') },
      { key: 'reportInaccuracyWrongLocation' as const, label: t('place.reportInaccuracyWrongLocation') },
      { key: 'reportInaccuracyWrongHours' as const, label: t('place.reportInaccuracyWrongHours') },
      { key: 'reportInaccuracyOther' as const, label: t('place.reportInaccuracyOther') },
    ];
    Alert.alert(
      t('place.reportInaccuracyTitle'),
      undefined,
      [
        ...reasons.map(({ label }) => ({
          text: label,
          onPress: () => {
            api.insights
              .report({ body: { placeId: place.id, kind: 'inaccuracy' } })
              .catch(() => undefined);
          },
        })),
        { text: t('place.reportInaccuracyCancel'), style: 'cancel' as const },
      ],
    );
  };

  // ── Distance from user ────────────────────────────────────────────────────
  const distM = useDistanceFromUser(place.location as [number, number] | undefined);

  // ── Save / favourite ──────────────────────────────────────────────────────
  const [isSaved, setIsSaved] = useState(false);
  useEffect(() => {
    void savedPlaces.isSaved(place.id).then(setIsSaved);
  }, [place.id]);
  const handleSave = useCallback(async () => {
    if (isSaved) {
      await savedPlaces.remove(place.id);
      setIsSaved(false);
    } else {
      const category = kindLabel(place);
      await savedPlaces.save({ placeId: place.id, name, category });
      setIsSaved(true);
    }
  }, [isSaved, place, name]);

  return (
    <Screen scroll testID={testIDs.place.card}>
      <Stack.Screen options={{ title: name }} />
      <Text variant="title" testID={testIDs.place.name}>
        {name}
      </Text>
      <Text tone="muted" testID={testIDs.place.category}>
        {kindLabel(place)}
      </Text>
      {place.area ? <Text>{pickName(place.area, lang)}</Text> : null}
      {distM !== null ? (
        <Text tone="muted" testID="place.distanceAway">
          {t('place.away', { dist: formatDistance(distM) })}
        </Text>
      ) : null}
      <Badge testID={testIDs.place.source} label={place.source === 'provider' ? t('source.provider') : t('source.osm')} />
      {place.hoursRaw ? (
        <ListItem
          title={t('place.hours')}
          subtitle={isolate(place.hoursRaw)}
          trailing={open === null ? null : (
            <Text tone={open ? 'default' : 'danger'}>
              {open
                ? closingTime
                  ? t('place.closesAt', { time: closingTime })
                  : t('place.openNow')
                : t('place.closedNow')}
            </Text>
          )}
        />
      ) : null}
      {todaySpans ? (
        <Text tone="muted">
          {t('place.todayHours', { hours: todaySpans })}
        </Text>
      ) : null}
      {phone ? (
        <ListItem
          title={t('place.phone')}
          subtitle={isolate(phone)}
          onPress={() => Linking.openURL(`tel:${phone.replace(/\s/g, '')}`).catch(() => undefined)}
        />
      ) : null}
      {website ? (
        <ListItem
          title={t('place.website')}
          subtitle={isolate(website)}
          onPress={() => Linking.openURL(website.startsWith('http') ? website : `https://${website}`).catch(() => undefined)}
        />
      ) : null}
      {place.provider ? <ProviderSection provider={place.provider} /> : null}
      <InsightsSection place={place} onReportCrowded={reportCrowded} onReportPrice={reportPrice} onReportInaccuracy={reportInaccuracy} />
      <ReviewsSection placeId={place.id} />
      {place.category ? (
        <NearbySection placeId={place.id} location={place.location} category={place.category} />
      ) : null}
      <Button
        testID="place.save"
        label={isSaved ? t('place.saved') : t('place.save')}
        variant={isSaved ? 'secondary' : 'primary'}
        accessibilityLabel={isSaved ? t('place.savedA11y', { name }) : t('place.saveA11y', { name })}
        onPress={() => { haptics.like(); void handleSave(); }}
      />
      <Button testID={testIDs.place.share} label={t('place.share')} onPress={share} />
      <Button
        variant="secondary"
        label={t('place.openInMaps')}
        onPress={() => {
          const [lng, lat] = place.location;
          const encodedName = encodeURIComponent(name);
          Linking.openURL(`geo:${lat},${lng}?q=${lat},${lng}(${encodedName})`).catch(() => undefined);
        }}
      />
      {(Object.keys(actions) as (keyof typeof actions)[]).map((route) => (
        <RouteAction key={route} route={route} placeId={place.id} />
      ))}
      <Text variant="caption" tone="muted">
        {place.attribution}
      </Text>
    </Screen>
  );
}

// ── Helpers for insights display ─────────────────────────────────────────────

function crowdLabel(value: CrowdLevel): string {
  if (value === 'low') return t('place.crowdLow');
  if (value === 'medium') return t('place.crowdMedium');
  return t('place.crowdHigh');
}

function priceLabel(value: PriceLevel): string {
  if (value === 'budget') return t('place.priceBudget');
  if (value === 'mid_range') return t('place.priceMidRange');
  if (value === 'expensive') return t('place.priceExpensive');
  return t('place.priceLuxury');
}

function sourceName(source: string): string {
  if (source === 'user_report') return t('place.sourceUserReport');
  if (source === 'provider') return t('place.sourceProvider');
  if (source === 'heuristic') return t('place.sourceHeuristic');
  if (source === 'osm') return t('place.sourceOsm');
  return source;
}

/** Shows crowding bar (low/medium/high) and price level, each with source, date, confidence. */
function InsightsSection({ place, onReportCrowded, onReportPrice, onReportInaccuracy }: { place: PlaceDetails; onReportCrowded: () => void; onReportPrice: () => void; onReportInaccuracy: () => void }) {
  const hasCrowding = place.crowding !== null && place.crowding !== undefined;
  const hasPrice = place.priceLevel !== null && place.priceLevel !== undefined;

  if (!hasCrowding && !hasPrice) {
    return (
      <View>
        <Text variant="caption" tone="muted" testID={testIDs.place.crowding}>
          {t('place.crowding')}: {t('place.noInsightsData')}
        </Text>
        <Text variant="caption" tone="muted" testID={testIDs.place.priceLevel}>
          {t('place.priceLevel')}: {t('place.noInsightsData')}
        </Text>
        <Button variant="secondary" label={t('place.reportCrowded')} onPress={onReportCrowded} testID={testIDs.place.reportCrowded} />
        <Button variant="secondary" label={t('place.reportPrice')} onPress={onReportPrice} testID={testIDs.place.priceLevel} />
        <Button variant="secondary" label={t('place.reportInaccuracy')} onPress={onReportInaccuracy} testID={testIDs.place.reportInaccuracy} />
      </View>
    );
  }

  return (
    <View>
      {hasCrowding ? (
        <View>
          <ListItem
            title={t('place.crowding')}
            subtitle={crowdLabel(place.crowding!.value as CrowdLevel)}
            testID={testIDs.place.crowding}
          />
          <Text variant="caption" tone="muted" testID={testIDs.place.insightsAttribution}>
            {t('place.insightsSource', { source: sourceName(place.crowding!.source) })} ·{' '}
            {t('place.insightsConfidence', { pct: String(Math.round(place.crowding!.confidence * 100)) })}
          </Text>
        </View>
      ) : (
        <Text variant="caption" tone="muted" testID={testIDs.place.crowding}>
          {t('place.crowding')}: {t('place.noInsightsData')}
        </Text>
      )}
      {hasPrice ? (
        <View>
          <ListItem
            title={t('place.priceLevel')}
            subtitle={priceLabel(place.priceLevel!.value as PriceLevel)}
            testID={testIDs.place.priceLevel}
          />
          <Text variant="caption" tone="muted">
            {t('place.insightsSource', { source: sourceName(place.priceLevel!.source) })} ·{' '}
            {t('place.insightsConfidence', { pct: String(Math.round(place.priceLevel!.confidence * 100)) })}
          </Text>
        </View>
      ) : (
        <Text variant="caption" tone="muted" testID={testIDs.place.priceLevel}>
          {t('place.priceLevel')}: {t('place.noInsightsData')}
        </Text>
      )}
      <Button variant="secondary" label={t('place.reportCrowded')} onPress={onReportCrowded} testID={testIDs.place.reportCrowded} />
      <Button variant="secondary" label={t('place.reportPrice')} onPress={onReportPrice} testID="place.reportPrice" />
      <Button variant="secondary" label={t('place.reportInaccuracy')} onPress={onReportInaccuracy} testID={testIDs.place.reportInaccuracy} />
    </View>
  );
}

function RouteAction({ route, placeId }: { route: keyof typeof actions; placeId: string }) {
  const router = useRouter();
  if (!useRouteAvailable(route)) return null;
  // messageCompose passes placeIds (plural, comma-joined) so ComposeScreen can pre-fill the place chips.
  const params = route === 'messageCompose' ? { placeIds: placeId } : { placeId };
  return <Button variant="secondary" label={t(actions[route])} onPress={() => router.push({ pathname: routes[route], params })} />;
}

// ── Nearby section ────────────────────────────────────────────────────────────

interface NearbySectionProps {
  placeId: string;
  location: LngLat;
  category: PlaceCategory;
}

function NearbySection({ placeId, location, category }: NearbySectionProps): ReactElement | null {
  const api = useApi();
  const lang = getLocale();
  const router = useRouter();
  const [items, setItems] = useState<Array<{ id: string; name: string; distanceM: number | null }>>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // Fetch the first city to get a CityId for the nearby query.
        const citiesRes = await api.cities.list();
        if (citiesRes.status !== 200) return;
        const cityId = citiesRes.body.items[0]?.id;
        if (!cityId) return;
        const near = `${location[0].toFixed(5)},${location[1].toFixed(5)}`;
        const res = await api.places.nearby({ query: { city: cityId, near, radiusM: 600, category, limit: 6 } });
        if (res.status !== 200 || cancelled) return;
        const nearby = res.body.items
          .filter((p) => p.id !== placeId)
          .slice(0, 5)
          .map((p) => ({ id: p.id, name: pickName(p.names, lang), distanceM: p.distanceM }));
        setItems(nearby);
      } catch {
        // Nearby is best-effort; silently ignore errors.
      }
    })();
    return () => { cancelled = true; };
  }, [api, placeId, location, category, lang]);

  if (items.length === 0) return null;

  return (
    <View style={nearbyStyles.section}>
      <Text variant="caption" tone="muted">{t('place.nearbyTitle')}</Text>
      {items.map((item) => (
        <Pressable
          key={item.id}
          style={nearbyStyles.row}
          onPress={() => router.push(href('place', { placeId: item.id }) as never)}
          accessibilityRole="button"
          accessibilityLabel={item.name}
        >
          <View style={nearbyStyles.rowBody}>
            <Text>{item.name}</Text>
            {item.distanceM !== null ? (
              <Text variant="caption" tone="muted">
                {item.distanceM < 1000
                  ? t('distance.m', { n: Math.round(item.distanceM) })
                  : t('distance.km', { n: (item.distanceM / 1000).toFixed(1) })}
              </Text>
            ) : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const nearbyStyles = StyleSheet.create({
  section: { marginTop: 16, gap: 4 },
  row: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e0e0e0' },
  rowBody: { gap: 2 },
});
