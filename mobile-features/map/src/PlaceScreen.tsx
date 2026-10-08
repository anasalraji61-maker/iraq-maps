import { pickName, testIDs, type PlaceDetails } from '@iraq-maps/contracts';
import { getLocale } from '@iraq-maps/i18n';
import { href, routes, useApi, useRouteAvailable } from '@iraq-maps/mobile-kit';
import { Badge, Button, ListItem, Screen, Text } from '@iraq-maps/ui';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { ReactElement } from 'react';
import { Share } from 'react-native';
import { openNow } from './hours';
import { LoadStatus, ok, useLatest } from './load';
import { isolate, kindLabel, t } from './strings';

/** Actions whose feature ships in a later milestone; each appears once its route is delivered (useRouteAvailable). */
const actions = { routePreview: 'actions.directions', messageCompose: 'actions.message', assistant: 'actions.assistant' } as const;

/** `place/[placeId]`: GET /v1/places/:id as a card. Also the target of iraqmaps://place/<id>. */
export function PlaceScreen(): ReactElement {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const api = useApi();
  const place = useLatest(placeId ?? null, async () => ok(await api.places.get({ params: { id: placeId ?? '' } })));
  if (place.state?.status === 'ready') return <PlaceCard place={place.state.data} />;
  return (
    <Screen>
      <LoadStatus {...place} />
    </Screen>
  );
}

function PlaceCard({ place }: { place: PlaceDetails }) {
  const lang = getLocale();
  const name = pickName(place.names, lang);
  const open = place.hoursRaw ? openNow(place.hoursRaw) : null;
  // The app scheme (app.config `scheme`) plus the place route: iraqmaps://place/<id>.
  const link = `iraqmaps:/${href('place', { placeId: place.id })}`;
  const share = () => Share.share({ message: `${name}\n${link}` }).catch(() => undefined);
  const { phone, website } = place.osmContacts;

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
      {phone ? <ListItem title={t('place.phone')} subtitle={isolate(phone)} /> : null}
      {website ? <ListItem title={t('place.website')} subtitle={isolate(website)} /> : null}
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

function RouteAction({ route, placeId }: { route: keyof typeof actions; placeId: string }) {
  const router = useRouter();
  if (!useRouteAvailable(route)) return null;
  return <Button variant="secondary" label={t(actions[route])} onPress={() => router.push({ pathname: routes[route], params: { placeId } })} />;
}
