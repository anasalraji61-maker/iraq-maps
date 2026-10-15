import { pickName, placesContract, testIDs, type CrowdLevel, type PlaceDetails, type PriceLevel } from '@iraq-maps/contracts';
import { getLocale } from '@iraq-maps/i18n';
import { href, routes, useApi, useRouteAvailable } from '@iraq-maps/mobile-kit';
import { Badge, Banner, Button, ListItem, Screen, Text } from '@iraq-maps/ui';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { ReactElement } from 'react';
import { Linking, Share, View } from 'react-native';
import { openNow } from './hours';
import { LoadStatus, ok, useLatest } from './load';
import { isolate, kindLabel, t } from './strings';

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
    <Screen>
      <LoadStatus {...place} />
    </Screen>
  );
}

function PlaceCard({ place }: { place: PlaceDetails }) {
  const lang = getLocale();
  const api = useApi();
  const name = pickName(place.names, lang);
  const open = place.hoursRaw ? openNow(place.hoursRaw) : null;
  // The app scheme (app.config `scheme`) plus the place route: iraqmaps://place/<id>.
  const link = `iraqmaps:/${href('place', { placeId: place.id })}`;
  const share = () => Share.share({ message: `${name}\n${link}` }).catch(() => undefined);
  const { phone, website } = place.osmContacts;
  const reportCrowded = () =>
    api.insights
      .report({ body: { placeId: place.id, kind: 'crowded_now' } })
      .catch(() => undefined);

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
      {/* Everything on this card is OSM data: the name, the hours and the phone and website tags. */}
      <Badge testID={testIDs.place.source} label={t('source.osm')} />
      {place.hoursRaw ? (
        <ListItem
          title={t('place.hours')}
          subtitle={isolate(place.hoursRaw)}
          trailing={open === null ? null : <Text tone={open ? 'default' : 'danger'}>{t(open ? 'place.openNow' : 'place.closedNow')}</Text>}
        />
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
      <InsightsSection place={place} onReportCrowded={reportCrowded} />
      <Button testID={testIDs.place.share} label={t('place.share')} onPress={share} />
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
function InsightsSection({ place, onReportCrowded }: { place: PlaceDetails; onReportCrowded: () => void }) {
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
