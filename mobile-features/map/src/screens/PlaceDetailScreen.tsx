/**
 * PlaceDetailScreen – enhanced full-detail view for a place.
 *
 * Differences from PlaceScreen (the M1 screen that stays in place):
 *  - Hero image gallery (swipeable, up to 5 photos)
 *  - Category badge + verified badge
 *  - Rating stars with review count
 *  - Open/Closed pill with hours breakdown
 *  - Phone with show_phone consent check
 *  - Address copy button
 *  - Distance from user
 *  - Directions, Share, Save, Message Business buttons
 *  - Photos grid section
 *  - Reviews section (inline)
 *  - Nearby places horizontal scroll
 *  - Mini-map showing location
 *  - Report place button
 *
 * Route: place/[placeId]/detail  (registered in apps/mobile app.config routes)
 * The screen re-uses the same loader pattern as PlaceScreen.
 */

import {
  pickName,
  placesContract,
  testIDs,
  type PlaceCategory,
  type PlaceDetails,
  type LngLat,
} from '@iraq-maps/contracts';
import { getLocale } from '@iraq-maps/i18n';
import {
  href,
  routes,
  savedPlaces,
  useApi,
  useHaptics,
  useRouteAvailable,
} from '@iraq-maps/mobile-kit';
import { Badge, Button, Screen, Text } from '@iraq-maps/ui';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactElement, useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  I18nManager,
  Image,
  Linking,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text as RNText } from 'react-native';
import { ReviewsSection } from '../components/ReviewsSection';
import { PlaceSkeleton } from '../components/PlaceSkeleton';
import { openNow, closesAt, todayHours } from '../hours';
import { useDistanceFromUser } from '../hooks/useDistanceFromUser';
import { LoadStatus, ok, useLatest } from '../load';
import { formatDistance, isolate, kindLabel, t } from '../strings';

I18nManager.forceRTL(true);

const { width: SCREEN_W } = Dimensions.get('window');
const PRIMARY = '#1976D2';
const STAR_FULL = '★';
const STAR_EMPTY = '☆';

// ── Entry ────────────────────────────────────────────────────────────────────

export function PlaceDetailScreen(): ReactElement {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const params = placesContract.get.pathParams.safeParse({ id: placeId });
  if (!params.success) {
    return (
      <Screen>
        <RNText style={errStyles.msg}>{t('place.notFound')}</RNText>
      </Screen>
    );
  }
  return <DetailLoader id={params.data.id} />;
}

function DetailLoader({ id }: { id: string }) {
  const api = useApi();
  const place = useLatest(id, async () => ok(await api.places.get({ params: { id } })));
  if (place.state?.status === 'ready') return <DetailCard place={place.state.data} />;
  return (
    <Screen scroll>
      {place.state?.status === 'loading' ? <PlaceSkeleton /> : <LoadStatus {...place} />}
    </Screen>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────

function DetailCard({ place }: { place: PlaceDetails }): ReactElement {
  const lang = getLocale();
  const api = useApi();
  const haptics = useHaptics();
  const router = useRouter();
  const name = pickName(place.names, lang);
  const open = place.hoursRaw ? openNow(place.hoursRaw) : null;
  const closingTime = open === true && place.hoursRaw ? closesAt(place.hoursRaw) : null;
  const todaySpans = place.hoursRaw ? todayHours(place.hoursRaw) : null;
  const distM = useDistanceFromUser(place.location as [number, number] | undefined);

  // ── Save ───────────────────────────────────────────────────────────────────
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

  // ── Share ──────────────────────────────────────────────────────────────────
  const link = `iraqmaps:/${href('place', { placeId: place.id })}`;
  const handleShare = () =>
    Share.share({ message: `${name}\n${link}` }).catch(() => undefined);

  // ── Phone (consent check) ──────────────────────────────────────────────────
  const phone = place.provider?.phone ?? place.osmContacts.phone;
  const phoneConsented =
    !place.provider || place.provider.consents?.includes('show_phone') || !!place.osmContacts.phone;

  // ── Directions ────────────────────────────────────────────────────────────
  const hasDirections = useRouteAvailable('routePreview');
  const handleDirections = () => {
    if (hasDirections) {
      router.push({ pathname: routes.routePreview, params: { placeId: place.id } });
    } else {
      const [lng, lat] = place.location;
      const encoded = encodeURIComponent(name);
      Linking.openURL(`geo:${lat},${lng}?q=${lat},${lng}(${encoded})`).catch(() => undefined);
    }
  };

  // ── Message Business ──────────────────────────────────────────────────────
  const hasMessage = useRouteAvailable('messageCompose');

  // ── Report ────────────────────────────────────────────────────────────────
  const handleReport = () => {
    const reasons = [
      t('place.reportInaccuracyWrongName'),
      t('place.reportInaccuracyWrongLocation'),
      t('place.reportInaccuracyWrongHours'),
      t('place.reportInaccuracyOther'),
    ];
    Alert.alert(t('place.reportInaccuracyTitle'), undefined, [
      ...reasons.map((label) => ({
        text: label,
        onPress: () => {
          api.insights
            .report({ body: { placeId: place.id, kind: 'inaccuracy' } })
            .catch(() => undefined);
        },
      })),
      { text: t('place.reportInaccuracyCancel'), style: 'cancel' as const },
    ]);
  };

  // ── Photos ────────────────────────────────────────────────────────────────
  const heroPhotos = place.provider?.photos?.slice(0, 5).map((p) => p.url) ?? [];

  return (
    <Screen scroll testID={testIDs.place.card}>
      <Stack.Screen options={{ title: name }} />

      {/* Hero gallery */}
      {heroPhotos.length > 0 ? (
        <HeroGallery photos={heroPhotos} />
      ) : (
        <PlaceholderHero category={place.category} />
      )}

      {/* Title row */}
      <View style={styles.titleRow}>
        <View style={styles.titleBody}>
          <RNText style={styles.nameText} testID={testIDs.place.name}>
            {name}
          </RNText>
          {place.category ? (
            <View style={styles.badgeRow}>
              <View style={styles.categoryBadge}>
                <RNText style={styles.categoryText}>{kindLabel(place)}</RNText>
              </View>
              {place.source === 'provider' ? (
                <View style={styles.verifiedBadge}>
                  <RNText style={styles.verifiedText}>✓ {t('source.provider')}</RNText>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>

      {/* Rating */}
      <RatingRow placeId={place.id} />

      {/* Distance */}
      {distM !== null ? (
        <RNText style={styles.distanceText} testID="place.distanceAway">
          {t('place.away', { dist: formatDistance(distM) })}
        </RNText>
      ) : null}

      {/* Open / closed status */}
      {open !== null ? (
        <View style={styles.hoursRow}>
          <View style={[styles.openPill, open ? styles.openPillOpen : styles.openPillClosed]}>
            <RNText style={styles.openPillText}>
              {open ? t('place.openNow') : t('place.closedNow')}
            </RNText>
          </View>
          {open && closingTime ? (
            <RNText style={styles.closingText}>{t('place.closesAt', { time: closingTime })}</RNText>
          ) : null}
          {todaySpans ? (
            <RNText style={styles.todayHoursText}>{t('place.todayHours', { hours: todaySpans })}</RNText>
          ) : null}
        </View>
      ) : null}

      {/* Quick-action buttons */}
      <View style={styles.actionRow}>
        <ActionChip icon="🗺" label={t('actions.directions')} onPress={handleDirections} />
        <ActionChip
          icon={isSaved ? '🔖' : '📌'}
          label={isSaved ? t('place.saved') : t('place.save')}
          onPress={() => { haptics.like(); void handleSave(); }}
          testID="place.save"
        />
        <ActionChip icon="↗" label={t('place.share')} onPress={handleShare} testID={testIDs.place.share} />
        {hasMessage ? (
          <ActionChip
            icon="💬"
            label={t('actions.message')}
            onPress={() => router.push({ pathname: routes.messageCompose, params: { placeIds: place.id } })}
          />
        ) : null}
      </View>

      {/* Phone */}
      {phone && phoneConsented ? (
        <InfoRow
          label={t('place.phone')}
          value={isolate(phone)}
          onPress={() => Linking.openURL(`tel:${phone.replace(/\s/g, '')}`).catch(() => undefined)}
          accessibilityHint={t('detail.phoneTapHint')}
        />
      ) : null}

      {/* Website */}
      {place.osmContacts.website ? (
        <InfoRow
          label={t('place.website')}
          value={isolate(place.osmContacts.website)}
          onPress={() => {
            const url = place.osmContacts.website!;
            Linking.openURL(url.startsWith('http') ? url : `https://${url}`).catch(() => undefined);
          }}
        />
      ) : null}

      {/* Address copy (area name as proxy for address) */}
      {place.area ? (
        <AddressRow names={place.area} lang={lang} />
      ) : null}

      {/* Mini-map */}
      <MiniMapSection location={place.location} name={name} />

      {/* Photos grid */}
      {heroPhotos.length > 0 ? (
        <PhotosGrid photos={heroPhotos} placeId={place.id} />
      ) : null}

      {/* Reviews inline */}
      <ReviewsSection placeId={place.id} />

      {/* Nearby */}
      {place.category ? (
        <NearbyScroll
          placeId={place.id}
          location={place.location}
          category={place.category}
        />
      ) : null}

      {/* Report */}
      <Button
        variant="secondary"
        label={t('place.reportInaccuracy')}
        onPress={handleReport}
        testID={testIDs.place.reportInaccuracy}
      />

      <RNText style={styles.attribution}>{place.attribution}</RNText>
    </Screen>
  );
}

// ── Hero gallery ──────────────────────────────────────────────────────────────

function HeroGallery({ photos }: { photos: string[] }): ReactElement {
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setActiveIndex(idx);
  };

  return (
    <View style={heroStyles.container}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        accessibilityRole="none"
      >
        {photos.map((uri, i) => (
          <TouchableOpacity
            key={uri}
            activeOpacity={0.9}
            onPress={() => setLightbox(i)}
            accessibilityRole="imagebutton"
            accessibilityLabel={t('lightbox.photo')}
          >
            <Image source={{ uri }} style={heroStyles.image} resizeMode="cover" />
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Dot indicators */}
      {photos.length > 1 ? (
        <View style={heroStyles.dots}>
          {photos.map((_, i) => (
            <View
              key={i}
              style={[heroStyles.dot, i === activeIndex && heroStyles.dotActive]}
            />
          ))}
        </View>
      ) : null}

      {/* Counter */}
      <View style={heroStyles.counter}>
        <RNText style={heroStyles.counterText}>
          {activeIndex + 1} / {photos.length}
        </RNText>
      </View>

      {/* Fullscreen lightbox */}
      {lightbox !== null ? (
        <PhotoLightbox
          photos={photos}
          initialIndex={lightbox}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </View>
  );
}

const heroStyles = StyleSheet.create({
  container: { position: 'relative' },
  image: { width: SCREEN_W, height: 220 },
  dots: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  dotActive: { backgroundColor: '#fff' },
  counter: {
    position: 'absolute',
    top: 10,
    end: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  counterText: { color: '#fff', fontSize: 12 },
});

// ── Placeholder hero when no photos ──────────────────────────────────────────

const CATEGORY_COLOR: Record<string, string> = {
  food: '#E53935',
  cafe: '#6D4C41',
  lodging: '#1565C0',
  shopping: '#E91E63',
  tourism: '#00897B',
  health: '#43A047',
  finance: '#546E7A',
  fuel: '#F57C00',
  default: '#78909C',
};

function PlaceholderHero({ category }: { category: string | null }): ReactElement {
  const bg = CATEGORY_COLOR[category ?? 'default'] ?? CATEGORY_COLOR['default']!;
  return <View style={[phStyles.box, { backgroundColor: bg }]} />;
}

const phStyles = StyleSheet.create({
  box: { height: 140, width: '100%' },
});

// ── Photo lightbox ────────────────────────────────────────────────────────────

function PhotoLightbox({
  photos,
  initialIndex,
  onClose,
}: {
  photos: string[];
  initialIndex: number;
  onClose: () => void;
}): ReactElement {
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={lbStyles.overlay}>
        <Pressable
          style={lbStyles.closeBtn}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('lightbox.close')}
        >
          <RNText style={lbStyles.closeText}>{t('lightbox.closeSymbol')}</RNText>
        </Pressable>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: initialIndex * SCREEN_W, y: 0 }}
        >
          {photos.map((uri) => (
            <Image
              key={uri}
              source={{ uri }}
              style={{ width: SCREEN_W, height: SCREEN_W }}
              resizeMode="contain"
            />
          ))}
        </ScrollView>
        <RNText style={lbStyles.hint}>{t('lightbox.counter', { total: String(photos.length) })}</RNText>
      </View>
    </Modal>
  );
}

const lbStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 48,
    end: 16,
    zIndex: 10,
    padding: 8,
  },
  closeText: { fontSize: 26, color: '#fff' },
  hint: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.6)',
    marginTop: 12,
    fontSize: 13,
  },
});

// ── Rating row ────────────────────────────────────────────────────────────────

function RatingRow({ placeId }: { placeId: string }): ReactElement | null {
  const api = useApi();
  const [avg, setAvg] = useState<number | null>(null);
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    void api.reviews.list({ params: { placeId } }).then((res) => {
      if (res.status === 200) {
        setAvg(res.body.summary.average ?? null);
        setCount(res.body.summary.count);
      }
    }).catch(() => undefined);
  }, [api.reviews, placeId]);

  if (avg === null || count === 0) return null;

  return (
    <View style={ratingStyles.row}>
      {[1, 2, 3, 4, 5].map((n) => (
        <RNText key={n} style={{ fontSize: 18, color: n <= Math.round(avg) ? '#F5A623' : '#CCC' }}>
          {n <= Math.round(avg) ? STAR_FULL : STAR_EMPTY}
        </RNText>
      ))}
      <RNText style={ratingStyles.label}>
        {avg.toFixed(1)} ({count})
      </RNText>
    </View>
  );
}

const ratingStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  label: { fontSize: 14, color: '#555', marginStart: 4 },
});

// ── Action chip ───────────────────────────────────────────────────────────────

function ActionChip({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  testID?: string;
}): ReactElement {
  return (
    <TouchableOpacity
      style={chipStyles.chip}
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <RNText style={chipStyles.icon}>{icon}</RNText>
      <RNText style={chipStyles.label} numberOfLines={1}>
        {label}
      </RNText>
    </TouchableOpacity>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
    minWidth: 60,
  },
  icon: { fontSize: 20 },
  label: { fontSize: 11, color: '#444', textAlign: 'center' },
});

// ── Info row ──────────────────────────────────────────────────────────────────

function InfoRow({
  label,
  value,
  onPress,
  accessibilityHint,
}: {
  label: string;
  value: string;
  onPress?: () => void;
  accessibilityHint?: string;
}): ReactElement {
  return (
    <TouchableOpacity
      style={infoStyles.row}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityHint={accessibilityHint}
    >
      <RNText style={infoStyles.label}>{label}</RNText>
      <RNText style={[infoStyles.value, onPress ? infoStyles.link : null]}>{value}</RNText>
    </TouchableOpacity>
  );
}

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
    gap: 8,
  },
  label: { color: '#888', fontSize: 13, width: 90 },
  value: { flex: 1, fontSize: 14, color: '#222' },
  link: { color: PRIMARY },
});

// ── Address row with copy ─────────────────────────────────────────────────────

function AddressRow({ names, lang }: { names: Record<string, string>; lang: string }): ReactElement {
  const address = pickName(names as Parameters<typeof pickName>[0], lang);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      // Clipboard not available without expo-clipboard; fall back to Share
      await Share.share({ message: address });
    } catch {
      // ignore
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={addrStyles.row}>
      <View style={addrStyles.body}>
        <RNText style={addrStyles.label}>{t('detail.address')}</RNText>
        <RNText style={addrStyles.value}>{address}</RNText>
      </View>
      <TouchableOpacity
        onPress={() => void handleCopy()}
        accessibilityRole="button"
        accessibilityLabel={t('detail.copyAddress')}
        style={addrStyles.copyBtn}
      >
        <RNText style={addrStyles.copyText}>{copied ? '✓' : t('detail.copy')}</RNText>
      </TouchableOpacity>
    </View>
  );
}

const addrStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  body: { flex: 1, gap: 2 },
  label: { fontSize: 12, color: '#888' },
  value: { fontSize: 14, color: '#222' },
  copyBtn: { padding: 8 },
  copyText: { color: PRIMARY, fontSize: 13 },
});

// ── Mini-map placeholder ──────────────────────────────────────────────────────
// A real MapLibre snapshot would require native code; we render a tappable
// placeholder that opens the main map centered on the place.

function MiniMapSection({ location, name }: { location: LngLat; name: string }): ReactElement {
  const handleOpen = () => {
    const [lng, lat] = location;
    const encoded = encodeURIComponent(name);
    Linking.openURL(`geo:${lat},${lng}?q=${lat},${lng}(${encoded})`).catch(() => undefined);
  };

  return (
    <TouchableOpacity
      style={miniMapStyles.container}
      onPress={handleOpen}
      accessibilityRole="button"
      accessibilityLabel={t('place.openInMaps')}
    >
      <View style={miniMapStyles.placeholder}>
        <RNText style={miniMapStyles.pin}>📍</RNText>
        <RNText style={miniMapStyles.hint}>{t('place.openInMaps')}</RNText>
      </View>
    </TouchableOpacity>
  );
}

const miniMapStyles = StyleSheet.create({
  container: { marginVertical: 12, borderRadius: 12, overflow: 'hidden' },
  placeholder: {
    height: 120,
    backgroundColor: '#E8F0FE',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
  },
  pin: { fontSize: 28 },
  hint: { fontSize: 13, color: PRIMARY },
});

// ── Photos grid ───────────────────────────────────────────────────────────────

function PhotosGrid({
  photos,
  placeId,
}: {
  photos: string[];
  placeId: string;
}): ReactElement {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const THUMB = (SCREEN_W - 48) / 3;

  return (
    <View style={gridStyles.container}>
      <RNText style={gridStyles.title}>{t('place.providerPhotos')}</RNText>
      <View style={gridStyles.grid}>
        {photos.map((uri, i) => (
          <TouchableOpacity
            key={uri}
            onPress={() => setLightbox(i)}
            accessibilityRole="imagebutton"
            accessibilityLabel={t('lightbox.photo')}
          >
            <Image
              source={{ uri }}
              style={[gridStyles.thumb, { width: THUMB, height: THUMB }]}
              resizeMode="cover"
            />
          </TouchableOpacity>
        ))}
      </View>
      {lightbox !== null ? (
        <PhotoLightbox
          photos={photos}
          initialIndex={lightbox}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </View>
  );
}

const gridStyles = StyleSheet.create({
  container: { marginTop: 16 },
  title: { fontSize: 15, fontWeight: '600', marginBottom: 8, color: '#222' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  thumb: { borderRadius: 6 },
});

// ── Nearby horizontal scroll ──────────────────────────────────────────────────

function NearbyScroll({
  placeId,
  location,
  category,
}: {
  placeId: string;
  location: LngLat;
  category: PlaceCategory;
}): ReactElement | null {
  const api = useApi();
  const lang = getLocale();
  const router = useRouter();
  const [items, setItems] = useState<Array<{ id: string; name: string; distanceM: number | null }>>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const citiesRes = await api.cities.list();
        if (citiesRes.status !== 200) return;
        const cityId = citiesRes.body.items[0]?.id;
        if (!cityId) return;
        const near = `${location[0].toFixed(5)},${location[1].toFixed(5)}`;
        const res = await api.places.nearby({ query: { city: cityId, near, radiusM: 600, category, limit: 8 } });
        if (res.status !== 200 || cancelled) return;
        const nearby = res.body.items
          .filter((p) => p.id !== placeId)
          .slice(0, 6)
          .map((p) => ({ id: p.id, name: pickName(p.names, lang), distanceM: p.distanceM }));
        setItems(nearby);
      } catch {
        // best-effort
      }
    })();
    return () => { cancelled = true; };
  }, [api, placeId, location, category, lang]);

  if (items.length === 0) return null;

  return (
    <View style={nearbyStyles.section}>
      <RNText style={nearbyStyles.title}>{t('place.nearbyTitle')}</RNText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={nearbyStyles.row}>
          {items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={nearbyStyles.card}
              onPress={() => router.push(href('place', { placeId: item.id }) as never)}
              accessibilityRole="button"
              accessibilityLabel={item.name}
            >
              <RNText style={nearbyStyles.cardName} numberOfLines={2}>{item.name}</RNText>
              {item.distanceM !== null ? (
                <RNText style={nearbyStyles.cardDist}>
                  {item.distanceM < 1000
                    ? t('distance.m', { n: Math.round(item.distanceM) })
                    : t('distance.km', { n: (item.distanceM / 1000).toFixed(1) })}
                </RNText>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const nearbyStyles = StyleSheet.create({
  section: { marginTop: 16 },
  title: { fontSize: 15, fontWeight: '600', marginBottom: 8, color: '#222' },
  row: { flexDirection: 'row', gap: 8 },
  card: {
    width: 110,
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  cardName: { fontSize: 13, color: '#222', fontWeight: '500' },
  cardDist: { fontSize: 11, color: '#888' },
});

// ── Shared styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  titleRow: { paddingHorizontal: 16, paddingTop: 12, gap: 4 },
  titleBody: { gap: 4 },
  nameText: { fontSize: 22, fontWeight: '700', color: '#111' },
  badgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  categoryBadge: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  categoryText: { fontSize: 12, color: PRIMARY, fontWeight: '500' },
  verifiedBadge: {
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  verifiedText: { fontSize: 12, color: '#2E7D32', fontWeight: '500' },
  distanceText: { fontSize: 13, color: '#888', paddingHorizontal: 16 },
  hoursRow: { paddingHorizontal: 16, paddingVertical: 8, gap: 4 },
  openPill: { alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  openPillOpen: { backgroundColor: '#E8F5E9' },
  openPillClosed: { backgroundColor: '#FFEBEE' },
  openPillText: { fontSize: 13, fontWeight: '600' },
  closingText: { fontSize: 12, color: '#888' },
  todayHoursText: { fontSize: 12, color: '#888' },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexWrap: 'wrap',
  },
  attribution: { fontSize: 11, color: '#BBB', textAlign: 'center', marginTop: 16, marginBottom: 8 },
});

const errStyles = StyleSheet.create({
  msg: { padding: 24, textAlign: 'center', color: '#888' },
});
