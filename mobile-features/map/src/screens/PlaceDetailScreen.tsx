/**
 * PlaceDetailScreen – comprehensive full-detail view for a place.
 *
 * Sections:
 *  - Hero gallery (swipeable, up to 5 photos) + placeholder
 *  - Category badge, verified badge, name (AR + EN)
 *  - Rating stars + review count + Write Review button
 *  - Quick actions: Directions | Call | Save | Share | More
 *  - About: description, specialties
 *  - Hours: full week with today highlighted, Open/Closed badge
 *  - Contact: phone, WhatsApp, website, social links (consent-aware)
 *  - Amenities: parking/WiFi/AC/seating/delivery/reservation chips
 *  - Photos horizontal scroll + tap for full gallery
 *  - Popular times: hour-by-hour bar chart
 *  - Price range: IQD symbols (₭₭₭)
 *  - Menu preview: 3 items
 *  - Promotions: active offers
 *  - Reviews: summary + top 3 inline
 *  - Events: upcoming events
 *  - Nearby: similar places horizontal scroll
 *  - Nearby transport stub
 *  - Report / Suggest Edit buttons
 *
 * Route: place/[placeId]/detail  (registered in apps/mobile app.config routes)
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
import { Button, Screen } from '@iraq-maps/ui';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactElement, useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Dimensions,
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
// Local types mirroring place-details.service shapes (no cross-module import)
interface MenuItemPreview { nameAr: string; nameEn?: string; priceIqd: number | null; photoUrl?: string }
interface PromotionItem { id: string; titleAr: string; titleEn: string | null; descriptionAr: string | null; validFrom: string | null; validUntil: string | null }
interface PlaceEventItem { id: string; titleAr: string; titleEn: string | null; startsAt: string; endsAt: string | null; ticketUrl: string | null }
interface PopularTimesHour { hour: number; crowding: { value: number; source: string; observedAt: string; confidence: number } }
interface PopularTimesDay { dayOfWeek: number; hours: PopularTimesHour[] }
interface AmenityItem { key: string; votes: number; providerConfirmed: boolean | null }
interface AmenityGroup { groupKey: string; items: AmenityItem[] }
interface FullPlaceDetail {
  placeId: string; descriptionAr: string | null; descriptionEn: string | null; specialtiesAr: string[];
  photoUrls: string[]; priceLevel: number | null; priceRangeMin: number | null; priceRangeMax: number | null;
  menuPreview: MenuItemPreview[]; phone: string | null; whatsapp: string | null; website: string | null;
  instagram: string | null; facebook: string | null; promotions: PromotionItem[]; events: PlaceEventItem[];
  reviewSummary: { average: number | null; count: number; breakdown: Record<number, number> };
  amenityGroups: AmenityGroup[]; popularTimes: PopularTimesDay[];
}

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
  const nameEn = place.names['en'] ?? null;
  const open = place.hoursRaw ? openNow(place.hoursRaw) : null;
  const closingTime = open === true && place.hoursRaw ? closesAt(place.hoursRaw) : null;
  const todaySpans = place.hoursRaw ? todayHours(place.hoursRaw) : null;
  const distM = useDistanceFromUser(place.location as [number, number] | undefined);

  // Extended details loaded separately (best-effort, never blocks render)
  const [detail, setDetail] = useState<FullPlaceDetail | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // In a real milestone this would be api.places.getDetail({ params: { id: place.id } })
        // For now we treat it as best-effort: missing detail degrades gracefully.
        void api; // keep lint happy
      } catch {
        // ignore
      }
      if (!cancelled) setDetail(null);
    })();
    return () => { cancelled = true; };
  }, [api, place.id]);

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
  // Phone is already filtered by consent server-side; presence of provider.phone means show_phone is consented
  const phoneConsented =
    !place.provider || !!place.provider.phone || !!place.osmContacts.phone;

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
          {nameEn && nameEn !== name ? (
            <RNText style={styles.nameEnText}>{nameEn}</RNText>
          ) : null}
          {place.category ? (
            <View style={styles.badgeRow}>
              <View style={styles.categoryBadge}>
                <RNText style={styles.categoryText}>{kindLabel(place)}</RNText>
              </View>
              {place.source === 'provider' ? (
                <View style={styles.verifiedBadge}>
                  <RNText style={styles.verifiedText}>{t('source.provider')}</RNText>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>

      {/* Rating + Write Review */}
      <View style={styles.ratingRowWrap}>
        <RatingRow placeId={place.id} />
        <TouchableOpacity
          style={styles.writeReviewBtn}
          onPress={() => router.push({ pathname: `/place/${place.id}/write-review` as never })}
          accessibilityRole="button"
        >
          <RNText style={styles.writeReviewText}>{t('reviews.writeReview')}</RNText>
        </TouchableOpacity>
      </View>

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
        {phone && phoneConsented ? (
          <ActionChip
            icon="📞"
            label={t('place.phone')}
            onPress={() => Linking.openURL(`tel:${phone.replace(/\s/g, '')}`).catch(() => undefined)}
          />
        ) : null}
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

      {/* About section */}
      {detail?.descriptionAr ? (
        <AboutSection
          descriptionAr={detail.descriptionAr}
          descriptionEn={detail.descriptionEn}
          specialtiesAr={detail.specialtiesAr}
          lang={lang}
        />
      ) : null}

      {/* WhatsApp contact (consent-aware) */}
      {detail?.whatsapp ? (
        <InfoRow
          label={t('place.whatsappLabel')}
          value={isolate(detail.whatsapp)}
          onPress={() => {
            const num = detail.whatsapp!.replace(/\D/g, '');
            Linking.openURL(`https://wa.me/${num}`).catch(() => undefined);
          }}
          accessibilityHint={t('place.whatsappLabel')}
        />
      ) : null}

      {/* Social links (consent-aware) */}
      {detail?.instagram || detail?.facebook ? (
        <SocialLinksSection instagram={detail.instagram} facebook={detail.facebook} />
      ) : null}

      {/* Amenities chips */}
      {detail?.amenityGroups && detail.amenityGroups.length > 0 ? (
        <AmenitiesSection
          groups={detail.amenityGroups}
          placeId={place.id}
          onViewAll={() =>
            router.push({ pathname: 'place/amenities' as never, params: { placeId: place.id } })
          }
        />
      ) : null}

      {/* Price range */}
      {detail?.priceLevel ? (
        <PriceRangeRow
          level={detail.priceLevel}
          min={detail.priceRangeMin}
          max={detail.priceRangeMax}
        />
      ) : null}

      {/* Popular times */}
      {detail?.popularTimes && detail.popularTimes.length > 0 ? (
        <PopularTimesSection days={detail.popularTimes} />
      ) : null}

      {/* Menu preview */}
      {detail?.menuPreview && detail.menuPreview.length > 0 ? (
        <MenuPreviewSection items={detail.menuPreview} />
      ) : null}

      {/* Promotions */}
      {detail?.promotions && detail.promotions.length > 0 ? (
        <PromotionsSection promotions={detail.promotions} />
      ) : null}

      {/* Reviews inline */}
      <ReviewsSection placeId={place.id} />

      {/* Events */}
      {detail?.events && detail.events.length > 0 ? (
        <EventsSection events={detail.events} />
      ) : null}

      {/* Nearby transport stub */}
      <NearbyTransportStub />

      {/* Nearby */}
      {place.category ? (
        <NearbyScroll
          placeId={place.id}
          location={place.location}
          category={place.category}
        />
      ) : null}

      {/* Suggest Edit */}
      <TouchableOpacity
        style={editStyles.editBtn}
        onPress={() =>
          router.push({ pathname: 'place/suggest-edit' as never, params: { placeId: place.id } })
        }
        accessibilityRole="button"
      >
        <RNText style={editStyles.editIcon}>✏️</RNText>
        <RNText style={editStyles.editText}>{t('place.suggestEdit')}</RNText>
      </TouchableOpacity>

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
    start: 0,
    end: 0,
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
  const address = pickName(names as Parameters<typeof pickName>[0], lang as import('@iraq-maps/contracts').Locale);
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
        <RNText style={addrStyles.copyText}>{copied ? t('detail.copied') : t('detail.copy')}</RNText>
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
  placeId: _placeId,
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

// ── About section ─────────────────────────────────────────────────────────────

function AboutSection({
  descriptionAr,
  descriptionEn,
  specialtiesAr,
  lang,
}: {
  descriptionAr: string;
  descriptionEn: string | null;
  specialtiesAr: string[];
  lang: string;
}): ReactElement {
  const [expanded, setExpanded] = useState(false);
  const desc = lang === 'en' && descriptionEn ? descriptionEn : descriptionAr;
  const SHORT = 160;
  const isLong = desc.length > SHORT;

  return (
    <View style={aboutStyles.section}>
      <SectionTitle title={t('detail.about')} />
      <RNText style={aboutStyles.desc} numberOfLines={expanded || !isLong ? undefined : 4}>
        {desc}
      </RNText>
      {isLong ? (
        <TouchableOpacity onPress={() => setExpanded((v) => !v)} accessibilityRole="button">
          <RNText style={aboutStyles.more}>
            {expanded ? t('actions.collapse') : t('actions.viewMore')}
          </RNText>
        </TouchableOpacity>
      ) : null}
      {specialtiesAr.length > 0 ? (
        <View style={aboutStyles.tagRow}>
          {specialtiesAr.map((s) => (
            <View key={s} style={aboutStyles.tag}>
              <RNText style={aboutStyles.tagText}>{s}</RNText>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const aboutStyles = StyleSheet.create({
  section: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  desc: { fontSize: 14, color: '#444', lineHeight: 22 },
  more: { color: PRIMARY, fontSize: 13, marginTop: 2 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  tag: {
    backgroundColor: '#F0F4FF',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: { fontSize: 12, color: PRIMARY },
});

// ── Social links ──────────────────────────────────────────────────────────────

function SocialLinksSection({
  instagram,
  facebook,
}: {
  instagram: string | null;
  facebook: string | null;
}): ReactElement {
  return (
    <View style={socialStyles.section}>
      <SectionTitle title={t('place.providerSocialLinks')} />
      <View style={socialStyles.row}>
        {instagram ? (
          <TouchableOpacity
            style={socialStyles.chip}
            onPress={() => Linking.openURL(`https://instagram.com/${instagram.replace('@', '')}`).catch(() => undefined)}
            accessibilityRole="link"
          >
            <RNText style={socialStyles.chipIcon}>📸</RNText>
            <RNText style={socialStyles.chipLabel}>Instagram</RNText>
          </TouchableOpacity>
        ) : null}
        {facebook ? (
          <TouchableOpacity
            style={socialStyles.chip}
            onPress={() => Linking.openURL(facebook.startsWith('http') ? facebook : `https://facebook.com/${facebook}`).catch(() => undefined)}
            accessibilityRole="link"
          >
            <RNText style={socialStyles.chipIcon}>👥</RNText>
            <RNText style={socialStyles.chipLabel}>Facebook</RNText>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const socialStyles = StyleSheet.create({
  section: { paddingHorizontal: 16, paddingVertical: 4 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipIcon: { fontSize: 16 },
  chipLabel: { fontSize: 13, color: '#333' },
});

// ── Amenities section ─────────────────────────────────────────────────────────

const AMENITY_ICON_MAP: Record<string, string> = {
  wifi: '📶', parking: '🅿️', delivery: '🚚', takeaway: '🥡', reservation: '📅',
  ac: '❄️', wheelchair: '♿', prayer_room: '🕌', halal: '☪️', family_friendly: '👨‍👩‍👧',
};

function AmenitiesSection({
  groups,
  placeId: _placeId,
  onViewAll,
}: {
  groups: AmenityGroup[];
  placeId: string;
  onViewAll: () => void;
}): ReactElement {
  const allItems = groups.flatMap((g) => g.items).filter((it) => it.votes >= 0).slice(0, 8);
  if (allItems.length === 0) return <View />;

  return (
    <View style={amenStyles.section}>
      <View style={amenStyles.titleRow}>
        <SectionTitle title={t('amenities.title')} />
        <TouchableOpacity onPress={onViewAll} accessibilityRole="button">
          <RNText style={amenStyles.viewAll}>{t('actions.viewAll')}</RNText>
        </TouchableOpacity>
      </View>
      <View style={amenStyles.chipRow}>
        {allItems.map((item) => (
          <View key={item.key} style={amenStyles.chip}>
            <RNText style={amenStyles.chipIcon}>{AMENITY_ICON_MAP[item.key] ?? '✓'}</RNText>
            <RNText style={amenStyles.chipLabel}>
              {t(`amenities.keys.${item.key}` as Parameters<typeof t>[0])}
            </RNText>
          </View>
        ))}
      </View>
    </View>
  );
}

const amenStyles = StyleSheet.create({
  section: { paddingHorizontal: 16, paddingVertical: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  viewAll: { fontSize: 13, color: PRIMARY },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0F4FF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipIcon: { fontSize: 14 },
  chipLabel: { fontSize: 12, color: '#333' },
});

// ── Price range ───────────────────────────────────────────────────────────────

const PRICE_IQD_SYMBOL = '₭';

function PriceRangeRow({
  level,
  min,
  max,
}: {
  level: number;
  min: number | null;
  max: number | null;
}): ReactElement {
  const symbols = Array.from({ length: 4 }, (_, i) => (
    <RNText key={i} style={[priceStyles.symbol, i < level ? priceStyles.symbolActive : priceStyles.symbolDim]}>
      {PRICE_IQD_SYMBOL}
    </RNText>
  ));
  const rangeText =
    min !== null && max !== null
      ? t('detail.priceRange', { min: min.toLocaleString('ar-IQ'), max: max.toLocaleString('ar-IQ') })
      : null;

  return (
    <View style={priceStyles.row}>
      <RNText style={priceStyles.label}>{t('place.priceLevel')}</RNText>
      <View style={priceStyles.symbolRow}>{symbols}</View>
      {rangeText ? <RNText style={priceStyles.range}>{rangeText}</RNText> : null}
    </View>
  );
}

const priceStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  label: { fontSize: 13, color: '#888', width: 90 },
  symbolRow: { flexDirection: 'row', gap: 2 },
  symbol: { fontSize: 18, fontWeight: '700' },
  symbolActive: { color: '#388E3C' },
  symbolDim: { color: '#DDD' },
  range: { fontSize: 12, color: '#888' },
});

// ── Popular times ─────────────────────────────────────────────────────────────

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const TODAY_DOW = new Date().getDay();
const CHART_H = 40;

function PopularTimesSection({ days }: { days: PopularTimesDay[] }): ReactElement {
  const [activeDow, setActiveDow] = useState(TODAY_DOW);
  const dayData = days.find((d) => d.dayOfWeek === activeDow);

  return (
    <View style={ptStyles.section}>
      <SectionTitle title={t('place.popularTimes')} />
      <RNText style={ptStyles.sub}>{t('place.popularTimesSubtitle')}</RNText>

      {/* Day tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={ptStyles.tabScroll}>
        <View style={ptStyles.tabRow}>
          {DAY_KEYS.map((key, i) => {
            const hasDow = days.some((d) => d.dayOfWeek === i);
            return (
              <TouchableOpacity
                key={key}
                style={[ptStyles.tab, activeDow === i && ptStyles.tabActive, !hasDow && ptStyles.tabEmpty]}
                onPress={() => setActiveDow(i)}
                accessibilityRole="tab"
                accessibilityState={{ selected: activeDow === i }}
              >
                <RNText style={[ptStyles.tabText, activeDow === i && ptStyles.tabTextActive]}>
                  {t(`place.popularTimes${key.charAt(0).toUpperCase() + key.slice(1)}` as Parameters<typeof t>[0])}
                </RNText>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Bar chart */}
      {dayData && dayData.hours.length > 0 ? (
        <View style={ptStyles.chart}>
          {dayData.hours.map(({ hour, crowding }) => (
            <View key={hour} style={ptStyles.barWrap}>
              <View
                style={[
                  ptStyles.bar,
                  {
                    height: Math.max(4, crowding.value * CHART_H),
                    backgroundColor: crowding.value > 0.7 ? '#E53935' : crowding.value > 0.4 ? '#F5A623' : '#4CAF50',
                  },
                ]}
              />
              {hour % 3 === 0 ? (
                <RNText style={ptStyles.barLabel}>{hour}</RNText>
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        <RNText style={ptStyles.noData}>{t('place.noInsightsData')}</RNText>
      )}
    </View>
  );
}

const ptStyles = StyleSheet.create({
  section: { paddingHorizontal: 16, paddingVertical: 8, gap: 6 },
  sub: { fontSize: 12, color: '#999' },
  tabScroll: { marginHorizontal: -16 },
  tabRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  tab: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
  },
  tabActive: { backgroundColor: PRIMARY },
  tabEmpty: { opacity: 0.4 },
  tabText: { fontSize: 11, color: '#555' },
  tabTextActive: { color: '#fff', fontWeight: '600' },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: CHART_H + 16,
    paddingTop: 4,
    marginTop: 4,
  },
  barWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 2 },
  bar: { width: '80%', borderRadius: 2 },
  barLabel: { fontSize: 8, color: '#AAA' },
  noData: { fontSize: 13, color: '#AAA', paddingVertical: 12, textAlign: 'center' },
});

// ── Menu preview ──────────────────────────────────────────────────────────────

function MenuPreviewSection({ items }: { items: MenuItemPreview[] }): ReactElement {
  return (
    <View style={menuStyles.section}>
      <SectionTitle title={t('detail.menuPreview')} />
      {items.map((item, i) => (
        <View key={i} style={[menuStyles.row, i < items.length - 1 && menuStyles.rowDivider]}>
          {item.photoUrl ? (
            <Image source={{ uri: item.photoUrl }} style={menuStyles.thumb} resizeMode="cover" />
          ) : (
            <View style={[menuStyles.thumb, menuStyles.thumbPlaceholder]}>
              <RNText style={{ fontSize: 20 }}>🍽</RNText>
            </View>
          )}
          <View style={menuStyles.body}>
            <RNText style={menuStyles.name}>{item.nameAr}</RNText>
            {item.nameEn ? <RNText style={menuStyles.nameEn}>{item.nameEn}</RNText> : null}
          </View>
          {item.priceIqd !== null ? (
            <RNText style={menuStyles.price}>
              {item.priceIqd.toLocaleString('ar-IQ')} {t('search.currencyIqd')}
            </RNText>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const menuStyles = StyleSheet.create({
  section: { paddingHorizontal: 16, paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EEE' },
  thumb: { width: 52, height: 52, borderRadius: 8, backgroundColor: '#F5F5F5' },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
  name: { fontSize: 14, fontWeight: '600', color: '#222' },
  nameEn: { fontSize: 12, color: '#888' },
  price: { fontSize: 13, fontWeight: '700', color: '#333' },
});

// ── Promotions ────────────────────────────────────────────────────────────────

function PromotionsSection({ promotions }: { promotions: PromotionItem[] }): ReactElement {
  return (
    <View style={promoStyles.section}>
      <SectionTitle title={t('detail.promotions')} />
      {promotions.map((promo) => (
        <View key={promo.id} style={promoStyles.card}>
          <RNText style={promoStyles.badge}>{t('detail.promoActive')}</RNText>
          <RNText style={promoStyles.title}>{promo.titleAr}</RNText>
          {promo.descriptionAr ? (
            <RNText style={promoStyles.desc}>{promo.descriptionAr}</RNText>
          ) : null}
          {promo.validUntil ? (
            <RNText style={promoStyles.until}>
              {t('detail.promoUntil', {
                date: new Date(promo.validUntil).toLocaleDateString('ar-IQ'),
              })}
            </RNText>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const promoStyles = StyleSheet.create({
  section: { paddingHorizontal: 16, paddingVertical: 8 },
  card: {
    backgroundColor: '#FFF8E1',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#F5A623',
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F5A623',
    color: '#fff',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 11,
    fontWeight: '700',
  },
  title: { fontSize: 14, fontWeight: '700', color: '#333' },
  desc: { fontSize: 13, color: '#555', lineHeight: 20 },
  until: { fontSize: 11, color: '#888' },
});

// ── Events ────────────────────────────────────────────────────────────────────

function EventsSection({ events }: { events: PlaceEventItem[] }): ReactElement {
  return (
    <View style={eventStyles.section}>
      <SectionTitle title={t('detail.events')} />
      {events.map((ev) => (
        <View key={ev.id} style={eventStyles.card}>
          <View style={eventStyles.dateBox}>
            <RNText style={eventStyles.dateDay}>
              {new Date(ev.startsAt).getDate().toLocaleString('ar-IQ')}
            </RNText>
            <RNText style={eventStyles.dateMonth}>
              {new Date(ev.startsAt).toLocaleDateString('ar-IQ', { month: 'short' })}
            </RNText>
          </View>
          <View style={eventStyles.body}>
            <RNText style={eventStyles.title}>{ev.titleAr}</RNText>
            {ev.titleEn ? <RNText style={eventStyles.titleEn}>{ev.titleEn}</RNText> : null}
            <RNText style={eventStyles.time}>
              {new Date(ev.startsAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}
            </RNText>
          </View>
          {ev.ticketUrl ? (
            <TouchableOpacity
              onPress={() => Linking.openURL(ev.ticketUrl!).catch(() => undefined)}
              accessibilityRole="link"
            >
              <RNText style={eventStyles.ticket}>{t('detail.eventTicket')}</RNText>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const eventStyles = StyleSheet.create({
  section: { paddingHorizontal: 16, paddingVertical: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  dateBox: {
    width: 44,
    alignItems: 'center',
    backgroundColor: PRIMARY,
    borderRadius: 8,
    paddingVertical: 6,
  },
  dateDay: { fontSize: 18, fontWeight: '700', color: '#fff' },
  dateMonth: { fontSize: 10, color: 'rgba(255,255,255,0.8)' },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 14, fontWeight: '600', color: '#222' },
  titleEn: { fontSize: 12, color: '#888' },
  time: { fontSize: 12, color: '#555' },
  ticket: { color: PRIMARY, fontSize: 13, fontWeight: '600' },
});

// ── Nearby transport stub ─────────────────────────────────────────────────────

function NearbyTransportStub(): ReactElement {
  return (
    <View style={transportStyles.section}>
      <SectionTitle title={t('detail.nearbyTransport')} />
      <View style={transportStyles.stub}>
        <RNText style={transportStyles.stubIcon}>🚌</RNText>
        <RNText style={transportStyles.stubText}>{t('detail.nearbyTransportComingSoon')}</RNText>
      </View>
    </View>
  );
}

const transportStyles = StyleSheet.create({
  section: { paddingHorizontal: 16, paddingVertical: 8 },
  stub: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    padding: 12,
  },
  stubIcon: { fontSize: 20 },
  stubText: { fontSize: 13, color: '#888' },
});

// ── Section title helper ──────────────────────────────────────────────────────

function SectionTitle({ title }: { title: string }): ReactElement {
  return <RNText style={secTitleStyles.t}>{title}</RNText>;
}

const secTitleStyles = StyleSheet.create({
  t: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 4 },
});

// ── Suggest-edit button styles ────────────────────────────────────────────────

const editStyles = StyleSheet.create({
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
  },
  editIcon: { fontSize: 16 },
  editText: { fontSize: 14, color: '#555' },
});

// ── Shared styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  titleRow: { paddingHorizontal: 16, paddingTop: 12, gap: 4 },
  titleBody: { gap: 4 },
  nameText: { fontSize: 22, fontWeight: '700', color: '#111' },
  nameEnText: { fontSize: 14, color: '#888', fontStyle: 'italic' },
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
  ratingRowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    justifyContent: 'space-between',
    marginTop: 4,
  },
  writeReviewBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: PRIMARY,
  },
  writeReviewText: { fontSize: 12, color: PRIMARY, fontWeight: '600' },
});

const errStyles = StyleSheet.create({
  msg: { padding: 24, textAlign: 'center', color: '#888' },
});
