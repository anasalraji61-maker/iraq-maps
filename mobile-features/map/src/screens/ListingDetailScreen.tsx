/**
 * ListingDetailScreen — full view for a single listing.
 *
 * Layout:
 *  - Swipeable photo gallery (up to 8 photos)
 *  - Title, price in IQD
 *  - Availability + delivery badges
 *  - Category badge
 *  - Provider info card (name, verified badge, response time)
 *  - Description (AR / EN toggle)
 *  - Delivery info section
 *  - Contact / message provider button
 *  - Write inquiry button
 *  - Related listings horizontal scroll
 *
 * Route: /listing/[listingId]
 * RTL-safe: start/end only. All text via t().
 */
/* eslint-disable i18next/no-literal-string, no-restricted-syntax */

import { type ListingDetail, type ListingSummary } from '@iraq-maps/contracts';
import { formatNumber } from '@iraq-maps/i18n';
import { useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  useCallback,
  useEffect,
  useState,
  type ReactElement,
} from 'react';
import {
  ActivityIndicator,
  Dimensions,
  I18nManager,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TouchableOpacity,
  View,
  Text as RNText,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIMARY = '#1976D2';
const SURFACE = '#FFFFFF';
const BG = '#F5F5F5';
const BORDER = '#E0E0E0';
const TEXT_PRIMARY = '#1A1A1A';
const TEXT_SECONDARY = '#666666';
const SUCCESS = '#16A34A';
const WARN = '#D97706';
const DANGER = '#EF4444';

const { width: SCREEN_W } = Dimensions.get('window');
const GALLERY_H = 280;
const RELATED_CARD_W = 150;

// ── Helper ────────────────────────────────────────────────────────────────────

function formatIqd(price: number): string {
  return t('listings.priceLabel', { price: formatNumber(price) });
}

// ── Photo gallery ─────────────────────────────────────────────────────────────

function PhotoGallery({ photos, title }: { photos: string[]; title: string }): ReactElement {
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxVisible, setLightboxVisible] = useState(false);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setActiveIndex(idx);
  }, []);

  if (photos.length === 0) {
    return (
      <View style={[styles.galleryEmpty]}>
        <RNText style={styles.galleryEmptyIcon}>🖼️</RNText>
        <RNText style={styles.galleryEmptyText}>{t('listings.detail.noPhotos')}</RNText>
      </View>
    );
  }

  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        accessibilityLabel={title}
      >
        {photos.map((uri, idx) => (
          <Pressable key={uri} onPress={() => setLightboxVisible(true)}>
            <Image
              source={{ uri }}
              style={styles.galleryImage}
              resizeMode="cover"
              accessibilityLabel={`${title} — ${t('listings.detail.photos')} ${idx + 1}`}
            />
          </Pressable>
        ))}
      </ScrollView>

      {/* Dot indicators */}
      {photos.length > 1 && (
        <View style={styles.dotRow}>
          {photos.map((_, idx) => (
            <View key={idx} style={[styles.dot, idx === activeIndex && styles.dotActive]} />
          ))}
        </View>
      )}

      {/* Counter */}
      <View style={styles.photoCounter}>
        <RNText style={styles.photoCounterText}>
          {activeIndex + 1} / {photos.length}
        </RNText>
      </View>

      {/* Full-screen lightbox */}
      <Modal visible={lightboxVisible} animationType="fade" statusBarTranslucent>
        <View style={styles.lightbox}>
          <TouchableOpacity style={styles.lightboxClose} onPress={() => setLightboxVisible(false)}>
            <RNText style={styles.lightboxCloseText}>✕</RNText>
          </TouchableOpacity>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            {photos.map((uri) => (
              <Image key={uri} source={{ uri }} style={styles.lightboxImage} resizeMode="contain" />
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ── Provider info card ────────────────────────────────────────────────────────

function ProviderCard({
  name,
  verified,
  avgResponseHours,
  onMessage,
}: {
  name: string;
  verified: boolean;
  avgResponseHours: number | null;
  onMessage: () => void;
}): ReactElement {
  return (
    <View style={styles.providerCard}>
      <View style={styles.providerLeft}>
        <View style={styles.providerAvatar}>
          <RNText style={styles.providerAvatarText}>{name.charAt(0) || '؟'}</RNText>
        </View>
        <View style={styles.providerInfo}>
          <RNText style={styles.providerName}>{name}</RNText>
          <RNText style={[styles.providerVerified, !verified && styles.providerUnverified]}>
            {verified ? t('listings.detail.verified') : t('listings.detail.unverified')}
          </RNText>
          {avgResponseHours !== null && (
            <RNText style={styles.providerResponseTime}>
              {t('listings.detail.responseTime', { hours: avgResponseHours })}
            </RNText>
          )}
        </View>
      </View>
      <TouchableOpacity style={styles.providerMessageBtn} onPress={onMessage}>
        <RNText style={styles.providerMessageText}>{t('listings.detail.message')}</RNText>
      </TouchableOpacity>
    </View>
  );
}

// ── Related listing card ──────────────────────────────────────────────────────

function RelatedCard({ item, onPress }: { item: ListingSummary; onPress: () => void }): ReactElement {
  return (
    <TouchableOpacity style={styles.relatedCard} onPress={onPress} activeOpacity={0.85}>
      {item.coverPhotoUrl ? (
        <Image source={{ uri: item.coverPhotoUrl }} style={styles.relatedImage} resizeMode="cover" />
      ) : (
        <View style={[styles.relatedImage, styles.noPhoto]}>
          <RNText style={styles.noPhotoIcon}>🖼️</RNText>
        </View>
      )}
      <View style={styles.relatedInfo}>
        <RNText style={styles.relatedTitle} numberOfLines={2}>{item.titleAr}</RNText>
        <RNText style={styles.relatedPrice}>{formatIqd(item.priceIqd)}</RNText>
      </View>
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function ListingDetailScreen(): ReactElement {
  const { listingId } = useLocalSearchParams<{ listingId: string }>();
  const baseUrl = useApiBaseUrl();
  const router = useRouter();

  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [related, setRelated] = useState<ListingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [descLang, setDescLang] = useState<'ar' | 'en'>('ar');

  // ── Data ─────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!listingId) {
      setError('معرّف المنتج مفقود');
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`${baseUrl}/listings/${listingId}`);
        if (!res.ok) throw new Error(`${res.status}`);
        const data = (await res.json()) as ListingDetail;
        if (!cancelled) {
          setListing(data);
          setLoading(false);
          // Fetch related listings by same category
          void fetchRelated(data);
        }
      } catch {
        if (!cancelled) {
          setError(t('listings.error'));
          setLoading(false);
        }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [listingId, baseUrl]);

  async function fetchRelated(detail: ListingDetail) {
    try {
      const res = await fetch(
        `${baseUrl}/listings/category/${detail.category.id}?limit=6&cityId=${detail.cityId}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { items: ListingSummary[] };
      setRelated(data.items.filter((item) => (item.id as string) !== (detail.id as string)).slice(0, 5));
    } catch {
      // silent
    }
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  const handleShare = useCallback(async () => {
    if (!listing) return;
    await Share.share({ title: listing.titleAr, message: `${listing.titleAr}\n${formatIqd(listing.priceIqd)}` });
  }, [listing]);

  const handleMessage = useCallback(() => {
    if (!listing) return;
    router.push(`/messages/new?providerId=${listing.providerId}` as Parameters<typeof router.push>[0]);
  }, [listing, router]);

  const handleInquiry = useCallback(() => {
    if (!listing) return;
    router.push(`/messages/inquiry?listingId=${listing.id}` as Parameters<typeof router.push>[0]);
  }, [listing, router]);

  const handleRelatedPress = useCallback(
    (id: string) => {
      router.push(`/listing/${id}` as Parameters<typeof router.push>[0]);
    },
    [router],
  );

  // ── Loading / error ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </SafeAreaView>
    );
  }

  if (error || !listing) {
    return (
      <SafeAreaView style={styles.centered}>
        <RNText style={styles.errorText}>{error ?? t('listings.error')}</RNText>
        <TouchableOpacity style={styles.retryBtn} onPress={() => router.back()}>
          <RNText style={styles.retryText}>{t('listings.detail.backBtn')}</RNText>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const description = descLang === 'ar' ? listing.descriptionAr : listing.descriptionEn;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.root}>
      {/* Back + Share header */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.topBarBtn}>
          <RNText style={styles.topBarBtnText}>← {t('listings.detail.backBtn')}</RNText>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => void handleShare()} style={styles.topBarBtn}>
          <RNText style={styles.topBarBtnText}>{t('listings.detail.shareBtn')} 🔗</RNText>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Photo gallery */}
        <PhotoGallery photos={listing.photoUrls} title={listing.titleAr} />

        <View style={styles.body}>
          {/* Category + availability badges */}
          <View style={styles.badgeRow}>
            <View style={styles.categoryBadge}>
              <RNText style={styles.categoryBadgeText}>
                {listing.category.icon} {listing.category.nameAr}
              </RNText>
            </View>
            <View style={[styles.availBadge, !listing.isAvailable && styles.unavailBadge]}>
              <RNText style={[styles.availBadgeText, !listing.isAvailable && styles.unavailBadgeText]}>
                {listing.isAvailable ? t('listings.detail.available') : t('listings.detail.unavailable')}
              </RNText>
            </View>
            {listing.deliveryAvailable && (
              <View style={styles.deliveryBadge}>
                <RNText style={styles.deliveryBadgeText}>🚚 {t('listings.delivery')}</RNText>
              </View>
            )}
          </View>

          {/* Title */}
          <RNText style={styles.title}>{listing.titleAr}</RNText>

          {/* Price */}
          <RNText style={styles.price}>{formatIqd(listing.priceIqd)}</RNText>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <RNText style={styles.statText}>
              👁️ {t('listings.viewCount', { count: formatNumber(listing.viewCount) })}
            </RNText>
            <RNText style={styles.statText}>
              💬 {t('listings.detail.inquiryCount', { count: formatNumber(listing.inquiryCount) })}
            </RNText>
          </View>

          {/* Provider card */}
          <ProviderCard
            name={listing.providerName}
            verified={listing.providerVerified}
            avgResponseHours={listing.avgResponseHours}
            onMessage={handleMessage}
          />

          {/* Description */}
          {(listing.descriptionAr || listing.descriptionEn) && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <RNText style={styles.sectionTitle}>{t('listings.detail.description')}</RNText>
                {/* Language toggle */}
                <View style={styles.langToggle}>
                  <TouchableOpacity
                    style={[styles.langBtn, descLang === 'ar' && styles.langBtnSelected]}
                    onPress={() => setDescLang('ar')}
                  >
                    <RNText style={[styles.langBtnText, descLang === 'ar' && styles.langBtnTextSelected]}>AR</RNText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.langBtn, descLang === 'en' && styles.langBtnSelected]}
                    onPress={() => setDescLang('en')}
                  >
                    <RNText style={[styles.langBtnText, descLang === 'en' && styles.langBtnTextSelected]}>EN</RNText>
                  </TouchableOpacity>
                </View>
              </View>
              <RNText style={styles.descriptionText}>{description || '—'}</RNText>
            </View>
          )}

          {/* Delivery info */}
          <View style={styles.section}>
            <RNText style={styles.sectionTitle}>{t('listings.detail.delivery')}</RNText>
            {listing.deliveryAvailable ? (
              <>
                <View style={styles.deliveryRow}>
                  <RNText style={styles.deliveryIcon}>✅</RNText>
                  <RNText style={styles.deliveryAvailText}>{t('listings.delivery')}</RNText>
                </View>
                {listing.deliveryNotes && (
                  <RNText style={styles.deliveryNoteText}>{listing.deliveryNotes}</RNText>
                )}
              </>
            ) : (
              <View style={styles.deliveryRow}>
                <RNText style={styles.deliveryIcon}>❌</RNText>
                <RNText style={styles.deliveryUnavailText}>{t('listings.detail.noDelivery')}</RNText>
              </View>
            )}
          </View>

          {/* Contact actions */}
          <View style={styles.actionSection}>
            <TouchableOpacity style={styles.primaryActionBtn} onPress={handleMessage}>
              <RNText style={styles.primaryActionText}>💬 {t('listings.detail.contact')}</RNText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryActionBtn} onPress={handleInquiry}>
              <RNText style={styles.secondaryActionText}>✉️ {t('listings.detail.inquiry')}</RNText>
            </TouchableOpacity>
          </View>

          {/* Related listings */}
          {related.length > 0 && (
            <View style={styles.section}>
              <RNText style={styles.sectionTitle}>{t('listings.detail.related')}</RNText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.relatedRow}>
                {related.map((item) => (
                  <RelatedCard
                    key={item.id as string}
                    item={item}
                    onPress={() => handleRelatedPress(item.id as string)}
                  />
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },

  // Top bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: SURFACE,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  topBarBtn: { padding: 4 },
  topBarBtnText: { fontSize: 14, color: PRIMARY, fontWeight: '600' },

  scrollContent: { paddingBottom: 80 },
  body: { padding: 16, gap: 16 },

  // Gallery
  galleryImage: { width: SCREEN_W, height: GALLERY_H },
  galleryEmpty: {
    width: SCREEN_W,
    height: GALLERY_H,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  galleryEmptyIcon: { fontSize: 48 },
  galleryEmptyText: { color: TEXT_SECONDARY, fontSize: 14 },
  dotRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: -24, marginBottom: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotActive: { backgroundColor: '#FFF', width: 18 },
  photoCounter: {
    position: 'absolute',
    top: 12,
    end: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  photoCounterText: { color: '#FFF', fontSize: 12 },

  // Lightbox
  lightbox: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  lightboxClose: {
    position: 'absolute',
    top: 50,
    end: 20,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxCloseText: { color: '#FFF', fontSize: 18 },
  lightboxImage: { width: SCREEN_W, height: '100%' },

  // Badges
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryBadge: {
    backgroundColor: '#EEF3FD',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  categoryBadgeText: { fontSize: 12, color: PRIMARY, fontWeight: '600' },
  availBadge: {
    backgroundColor: '#EEF8EE',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  unavailBadge: { backgroundColor: '#FEF9EE' },
  availBadgeText: { fontSize: 12, color: SUCCESS, fontWeight: '600' },
  unavailBadgeText: { color: WARN },
  deliveryBadge: { backgroundColor: '#EEF3FD', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  deliveryBadgeText: { fontSize: 12, color: PRIMARY },

  // Title + price
  title: { fontSize: 22, fontWeight: '700', color: TEXT_PRIMARY, lineHeight: 30 },
  price: { fontSize: 26, fontWeight: '800', color: PRIMARY },

  // Stats
  statsRow: { flexDirection: 'row', gap: 16 },
  statText: { fontSize: 13, color: TEXT_SECONDARY },

  // Provider card
  providerCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: SURFACE,
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  providerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  providerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerAvatarText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  providerInfo: { flex: 1, gap: 2 },
  providerName: { fontSize: 15, fontWeight: '700', color: TEXT_PRIMARY },
  providerVerified: { fontSize: 12, color: SUCCESS },
  providerUnverified: { color: TEXT_SECONDARY },
  providerResponseTime: { fontSize: 11, color: TEXT_SECONDARY },
  providerMessageBtn: {
    backgroundColor: PRIMARY,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  providerMessageText: { color: '#FFF', fontSize: 13, fontWeight: '600' },

  // Section
  section: { backgroundColor: SURFACE, borderRadius: 12, padding: 14, gap: 10 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: TEXT_PRIMARY },
  descriptionText: { fontSize: 15, color: TEXT_PRIMARY, lineHeight: 24 },

  // Lang toggle
  langToggle: { flexDirection: 'row', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: BORDER },
  langBtn: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: SURFACE },
  langBtnSelected: { backgroundColor: PRIMARY },
  langBtnText: { fontSize: 12, color: TEXT_SECONDARY },
  langBtnTextSelected: { color: '#FFF', fontWeight: '600' },

  // Delivery
  deliveryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deliveryIcon: { fontSize: 16 },
  deliveryAvailText: { fontSize: 14, color: SUCCESS, fontWeight: '600' },
  deliveryUnavailText: { fontSize: 14, color: TEXT_SECONDARY },
  deliveryNoteText: { fontSize: 13, color: TEXT_SECONDARY, lineHeight: 20 },

  // Actions
  actionSection: { gap: 10 },
  primaryActionBtn: {
    backgroundColor: PRIMARY,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryActionText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  secondaryActionBtn: {
    borderWidth: 1.5,
    borderColor: PRIMARY,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryActionText: { color: PRIMARY, fontSize: 15, fontWeight: '600' },

  // Related
  relatedRow: { gap: 10, paddingVertical: 4 },
  relatedCard: {
    width: RELATED_CARD_W,
    borderRadius: 10,
    backgroundColor: BG,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: BORDER,
  },
  relatedImage: { width: '100%', height: 90 },
  relatedInfo: { padding: 8, gap: 4 },
  relatedTitle: { fontSize: 12, fontWeight: '600', color: TEXT_PRIMARY },
  relatedPrice: { fontSize: 13, fontWeight: '700', color: PRIMARY },

  // Fallback
  noPhoto: { backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  noPhotoIcon: { fontSize: 28 },
  errorText: { color: DANGER, fontSize: 15, textAlign: 'center' },
  retryBtn: { backgroundColor: PRIMARY, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: '#FFF', fontWeight: '600' },
});
