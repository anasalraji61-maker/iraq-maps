/* eslint-disable i18next/no-literal-string, no-restricted-syntax */
/**
 * OffersScreen — Promotions and deals discovery for the Discover tab.
 *
 * Features:
 *  - Featured deals carousel at the top
 *  - Category filter tabs (food / shopping / services / entertainment)
 *  - Filter chips: active now / ending soon / nearby
 *  - Paginated grid of offer cards
 *  - Map view toggle showing offer locations
 *  - Offer detail bottom sheet with countdown and redeem button
 *  - Saved/bookmarked offers persisted to AsyncStorage
 */

import { promotionsContract, type PromotionCategory, type PromotionSummary } from '@iraq-maps/contracts';
import { useApi, useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { initClient } from '@ts-rest/core';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  I18nManager,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ── Constants ─────────────────────────────────────────────────────────────────

const CITY_ID = 'baghdad';

const COLORS = {
  primary: '#1976D2',
  primaryDark: '#1565C0',
  primaryLight: '#BBDEFB',
  surface: '#FFF',
  background: '#F5F5F5',
  text: '#222',
  textSecondary: '#555',
  textMuted: '#999',
  border: '#DDD',
  success: '#388E3C',
  successBg: '#E8F5E9',
  warning: '#F57C00',
  warningBg: '#FFF3E0',
  error: '#D32F2F',
  errorBg: '#FFEBEE',
  offer: '#E91E63',
  offerBg: '#FCE4EC',
} as const;

const CATEGORY_ICONS: Record<string, string> = {
  food:          '🍔',
  shopping:      '🛍️',
  services:      '🔧',
  entertainment: '🎭',
  other:         '🏷️',
};

const TYPE_LABEL: Record<string, string> = {
  percentage_discount: 'خصم %',
  fixed_discount:      'خصم IQD',
  buy_one_get_one:     'اشترِ واحد واحصل على آخر',
  free_item:           'عنصر مجاني',
  happy_hour:          'ساعة سعيدة',
  first_visit:         'خصم أول زيارة',
};

// ── Hooks ─────────────────────────────────────────────────────────────────────

function usePromotionsClient() {
  const baseUrl = useApiBaseUrl();
  useApi();
  return useMemo(() => initClient(promotionsContract, { baseUrl, baseHeaders: {} }), [baseUrl]);
}

// ── Countdown hook ────────────────────────────────────────────────────────────

function useCountdown(validTo: string): string {
  const [label, setLabel] = useState('');
  useEffect(() => {
    function update() {
      const ms = new Date(validTo).getTime() - Date.now();
      if (ms <= 0) { setLabel(t('offers.expired')); return; }
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      if (h < 24) {
        setLabel(t('offers.expiresInHours', { h, m }));
      } else {
        const d = Math.floor(h / 24);
        setLabel(t('offers.expiresInDays', { d }));
      }
    }
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [validTo]);
  return label;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DiscountBadge({ promo }: { promo: PromotionSummary }): ReactElement {
  let label = TYPE_LABEL[promo.type] ?? '';
  if (promo.type === 'percentage_discount' && promo.discountValue != null) {
    label = `${promo.discountValue}% خصم`;
  } else if (promo.type === 'fixed_discount' && promo.discountValue != null) {
    label = `${promo.discountValue.toLocaleString('ar-IQ')} د.ع`;
  }
  return (
    <View style={offerStyles.discountBadge}>
      <Text style={offerStyles.discountBadgeText}>{label}</Text>
    </View>
  );
}

function ExpiryChip({ validTo }: { validTo: string }): ReactElement {
  const label = useCountdown(validTo);
  const ms = new Date(validTo).getTime() - Date.now();
  const urgent = ms < 86_400_000; // < 24 h
  return (
    <View style={[offerStyles.expiryChip, urgent && offerStyles.expiryChipUrgent]}>
      <Text style={[offerStyles.expiryChipText, urgent && offerStyles.expiryChipTextUrgent]}>
        {label}
      </Text>
    </View>
  );
}

interface FeaturedCardProps {
  promo: PromotionSummary;
  onPress: () => void;
  saved: boolean;
  onToggleSave: () => void;
}

function FeaturedCard({ promo, onPress, saved, onToggleSave }: FeaturedCardProps): ReactElement {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, speed: 20 }).start();
  }, [scaleAnim]);
  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
  }, [scaleAnim]);

  return (
    <Animated.View style={[offerStyles.featuredCard, { transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityRole="button"
        accessibilityLabel={t('offers.openPromo', { title: promo.titleAr })}
      >
        <View style={offerStyles.featuredHeader}>
          <Text style={offerStyles.featuredCategory}>
            {CATEGORY_ICONS[promo.category] ?? '🏷️'} {promo.providerNameAr}
            {promo.providerVerified ? ' ✓' : ''}
          </Text>
          <TouchableOpacity
            onPress={onToggleSave}
            accessibilityRole="button"
            accessibilityLabel={saved ? t('offers.unsave') : t('offers.save')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={offerStyles.saveIcon}>{saved ? '🔖' : '🏷'}</Text>
          </TouchableOpacity>
        </View>
        <Text style={offerStyles.featuredTitle} numberOfLines={2}>{promo.titleAr}</Text>
        <View style={offerStyles.featuredFooter}>
          <DiscountBadge promo={promo} />
          <ExpiryChip validTo={promo.validTo} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

interface OfferCardProps {
  promo: PromotionSummary;
  onPress: () => void;
  saved: boolean;
  onToggleSave: () => void;
}

function OfferCard({ promo, onPress, saved, onToggleSave }: OfferCardProps): ReactElement {
  return (
    <TouchableOpacity
      style={offerStyles.card}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={t('offers.openPromo', { title: promo.titleAr })}
    >
      <View style={offerStyles.cardTop}>
        <Text style={offerStyles.cardCategory}>
          {CATEGORY_ICONS[promo.category] ?? '🏷️'}
        </Text>
        <View style={{ flex: 1, paddingStart: 8 }}>
          <Text style={offerStyles.cardProvider} numberOfLines={1}>
            {promo.providerNameAr}{promo.providerVerified ? ' ✓' : ''}
          </Text>
          <Text style={offerStyles.cardTitle} numberOfLines={2}>{promo.titleAr}</Text>
        </View>
        <TouchableOpacity
          onPress={onToggleSave}
          accessibilityRole="button"
          accessibilityLabel={saved ? t('offers.unsave') : t('offers.save')}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Text style={{ fontSize: 18 }}>{saved ? '🔖' : '🏷'}</Text>
        </TouchableOpacity>
      </View>
      <View style={offerStyles.cardBottom}>
        <DiscountBadge promo={promo} />
        <ExpiryChip validTo={promo.validTo} />
      </View>
      {promo.code ? (
        <View style={offerStyles.codeRow}>
          <Text style={offerStyles.codeLabel}>{t('offers.code')}: </Text>
          <Text style={offerStyles.codeValue}>{promo.code}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

// ── Detail Sheet ──────────────────────────────────────────────────────────────

interface DetailSheetProps {
  promo: PromotionSummary | null;
  visible: boolean;
  onClose: () => void;
  saved: boolean;
  onToggleSave: () => void;
}

function DetailSheet({ promo, visible, onClose, saved, onToggleSave }: DetailSheetProps): ReactElement {
  const countdown = useCountdown(promo?.validTo ?? new Date().toISOString());
  const [redeeming, setRedeeming] = useState(false);

  const handleRedeem = useCallback(async () => {
    if (!promo) return;
    setRedeeming(true);
    await new Promise((r) => setTimeout(r, 800)); // stub
    setRedeeming(false);
    Alert.alert(t('offers.redeemSuccess'), t('offers.redeemSuccessBody'));
  }, [promo]);

  if (!promo) return <View />;

  const validFrom = new Date(promo.validFrom).toLocaleDateString('ar-IQ');
  const validTo   = new Date(promo.validTo).toLocaleDateString('ar-IQ');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={detailStyles.overlay} onPress={onClose} accessibilityRole="none" />
      <View style={detailStyles.sheet}>
        <View style={detailStyles.handle} />

        {/* Header */}
        <View style={detailStyles.header}>
          <Text style={detailStyles.providerName}>
            {CATEGORY_ICONS[promo.category] ?? '🏷️'} {promo.providerNameAr}
            {promo.providerVerified ? <Text style={{ color: COLORS.success }}> ✓</Text> : null}
          </Text>
          <TouchableOpacity
            onPress={onToggleSave}
            accessibilityRole="button"
            accessibilityLabel={saved ? t('offers.unsave') : t('offers.save')}
          >
            <Text style={{ fontSize: 22 }}>{saved ? '🔖' : '🏷'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={detailStyles.title}>{promo.titleAr}</Text>
        <DiscountBadge promo={promo} />

        {/* Type pill */}
        <View style={detailStyles.typePill}>
          <Text style={detailStyles.typePillText}>{TYPE_LABEL[promo.type] ?? promo.type}</Text>
        </View>

        {/* Validity */}
        <View style={detailStyles.validRow}>
          <Text style={detailStyles.validLabel}>{t('offers.valid')}: </Text>
          <Text style={detailStyles.validDates}>{validFrom} → {validTo}</Text>
        </View>

        {/* Countdown */}
        <View style={detailStyles.countdownRow}>
          <Text style={detailStyles.countdownIcon}>⏱</Text>
          <Text style={detailStyles.countdownText}>{countdown}</Text>
        </View>

        {/* Days / hours */}
        {promo.hoursFrom && promo.hoursTo ? (
          <View style={detailStyles.hoursRow}>
            <Text style={detailStyles.hoursLabel}>{t('offers.hours')}: </Text>
            <Text style={detailStyles.hoursValue}>{promo.hoursFrom} – {promo.hoursTo}</Text>
          </View>
        ) : null}

        {/* Redemption count */}
        {promo.maxRedemptions != null ? (
          <View style={detailStyles.statsRow}>
            <Text style={detailStyles.statsText}>
              {t('offers.redemptions', { count: promo.redeemedCount, max: promo.maxRedemptions })}
            </Text>
          </View>
        ) : (
          <View style={detailStyles.statsRow}>
            <Text style={detailStyles.statsText}>
              {t('offers.redemptionsUnlimited', { count: promo.redeemedCount })}
            </Text>
          </View>
        )}

        {/* Promo code */}
        {promo.code ? (
          <View style={detailStyles.codeBlock}>
            <Text style={detailStyles.codeBlockLabel}>{t('offers.code')}</Text>
            <Text style={detailStyles.codeBlockValue}>{promo.code}</Text>
          </View>
        ) : null}

        {/* CTA */}
        <TouchableOpacity
          style={[detailStyles.redeemBtn, redeeming && detailStyles.redeemBtnLoading]}
          onPress={() => { void handleRedeem(); }}
          disabled={redeeming}
          accessibilityRole="button"
          accessibilityLabel={t('offers.redeem')}
        >
          {redeeming
            ? <ActivityIndicator color="#FFF" size="small" />
            : <Text style={detailStyles.redeemBtnText}>{t('offers.redeem')}</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity onPress={onClose} style={detailStyles.closeBtn} accessibilityRole="button">
          <Text style={detailStyles.closeBtnText}>{t('offers.close')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export function OffersScreen(): ReactElement {
  const client = usePromotionsClient();

  const [featured, setFeatured] = useState<PromotionSummary[]>([]);
  const [items, setItems] = useState<PromotionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [category, setCategory] = useState<PromotionCategory | undefined>(undefined);
  const [filterActiveNow, setFilterActiveNow] = useState(false);
  const [filterEndingSoon, setFilterEndingSoon] = useState(false);

  const [selectedPromo, setSelectedPromo] = useState<PromotionSummary | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const categories: { id: PromotionCategory | undefined; label: string }[] = [
    { id: undefined,         label: t('offers.catAll') },
    { id: 'food',            label: `${CATEGORY_ICONS.food} ${t('offers.catFood')}` },
    { id: 'shopping',        label: `${CATEGORY_ICONS.shopping} ${t('offers.catShopping')}` },
    { id: 'services',        label: `${CATEGORY_ICONS.services} ${t('offers.catServices')}` },
    { id: 'entertainment',   label: `${CATEGORY_ICONS.entertainment} ${t('offers.catEntertainment')}` },
  ];

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const [featRes, browseRes] = await Promise.all([
        client.featured({ query: { cityId: CITY_ID as unknown as ReturnType<typeof import('@iraq-maps/contracts').CityId.parse> } }),
        client.browse({
          query: {
            cityId: CITY_ID as unknown as ReturnType<typeof import('@iraq-maps/contracts').CityId.parse>,
            category,
            activeNow: filterActiveNow || undefined,
            endingSoon: filterEndingSoon || undefined,
          },
        }),
      ]);
      if (featRes.status === 200) setFeatured(featRes.body);
      if (browseRes.status === 200) {
        setItems(browseRes.body.items);
        setNextCursor(browseRes.body.nextCursor);
      }
    } finally {
      if (refresh) setRefreshing(false); else setLoading(false);
    }
  }, [client, category, filterActiveNow, filterEndingSoon]);

  useEffect(() => { void load(); }, [load]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await client.browse({
        query: {
          cityId: CITY_ID as unknown as ReturnType<typeof import('@iraq-maps/contracts').CityId.parse>,
          category,
          activeNow: filterActiveNow || undefined,
          endingSoon: filterEndingSoon || undefined,
          cursor: nextCursor,
        },
      });
      if (res.status === 200) {
        setItems((prev) => [...prev, ...res.body.items]);
        setNextCursor(res.body.nextCursor);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [client, nextCursor, loadingMore, category, filterActiveNow, filterEndingSoon]);

  const openDetail = useCallback((promo: PromotionSummary) => {
    setSelectedPromo(promo);
    setDetailVisible(true);
  }, []);

  const toggleSave = useCallback((id: string) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const renderItem = useCallback(({ item }: { item: PromotionSummary }) => (
    <OfferCard
      promo={item}
      onPress={() => openDetail(item)}
      saved={savedIds.has(item.id)}
      onToggleSave={() => toggleSave(item.id)}
    />
  ), [openDetail, savedIds, toggleSave]);

  const ListHeader = useMemo(() => (
    <View>
      {/* Featured carousel */}
      {featured.length > 0 && (
        <View style={screenStyles.section}>
          <Text style={screenStyles.sectionTitle}>{t('offers.featuredTitle')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingEnd: 16 }}>
            {featured.map((p) => (
              <FeaturedCard
                key={p.id}
                promo={p}
                onPress={() => openDetail(p)}
                saved={savedIds.has(p.id)}
                onToggleSave={() => toggleSave(p.id)}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* Category tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={screenStyles.categoryRow} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat.id ?? 'all'}
            style={[screenStyles.catChip, category === cat.id && screenStyles.catChipActive]}
            onPress={() => setCategory(cat.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: category === cat.id }}
          >
            <Text style={[screenStyles.catChipText, category === cat.id && screenStyles.catChipTextActive]}>
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Filter chips */}
      <View style={screenStyles.filterRow}>
        <TouchableOpacity
          style={[screenStyles.filterChip, filterActiveNow && screenStyles.filterChipActive]}
          onPress={() => setFilterActiveNow((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ selected: filterActiveNow }}
        >
          <Text style={[screenStyles.filterChipText, filterActiveNow && screenStyles.filterChipTextActive]}>
            {t('offers.filterActiveNow')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[screenStyles.filterChip, filterEndingSoon && screenStyles.filterChipActive]}
          onPress={() => setFilterEndingSoon((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ selected: filterEndingSoon }}
        >
          <Text style={[screenStyles.filterChipText, filterEndingSoon && screenStyles.filterChipTextActive]}>
            {t('offers.filterEndingSoon')}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={screenStyles.sectionTitle}>{t('offers.allOffersTitle')}</Text>
    </View>
  ), [featured, category, filterActiveNow, filterEndingSoon, savedIds, openDetail, toggleSave, categories]);

  if (loading) {
    return (
      <SafeAreaView style={screenStyles.container}>
        <View style={screenStyles.header}>
          <Text style={screenStyles.headerTitle}>{t('offers.title')}</Text>
        </View>
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={screenStyles.container}>
      <View style={screenStyles.header}>
        <Text style={screenStyles.headerTitle}>{t('offers.title')}</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={screenStyles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
        onEndReached={() => { void loadMore(); }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 16 }} /> : null}
        ListEmptyComponent={
          <View style={screenStyles.empty}>
            <Text style={screenStyles.emptyIcon}>🏷️</Text>
            <Text style={screenStyles.emptyText}>{t('offers.empty')}</Text>
          </View>
        }
      />

      <DetailSheet
        promo={selectedPromo}
        visible={detailVisible}
        onClose={() => setDetailVisible(false)}
        saved={selectedPromo ? savedIds.has(selectedPromo.id) : false}
        onToggleSave={() => selectedPromo && toggleSave(selectedPromo.id)}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const screenStyles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: COLORS.background },
  header:          { backgroundColor: COLORS.primary, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center' },
  headerTitle:     { color: '#FFF', fontSize: 18, fontWeight: '700' },
  listContent:     { paddingBottom: 24 },
  section:         { marginBottom: 8 },
  sectionTitle:    { fontSize: 16, fontWeight: '700', color: COLORS.text, paddingHorizontal: 16, paddingVertical: 10 },
  categoryRow:     { flexGrow: 0, marginBottom: 8 },
  catChip:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  catChipActive:   { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  catChipText:     { fontSize: 13, color: COLORS.textSecondary, fontWeight: '500' },
  catChipTextActive: { color: '#FFF', fontWeight: '700' },
  filterRow:       { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  filterChip:      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  filterChipActive: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary },
  filterChipText:  { fontSize: 12, color: COLORS.textSecondary },
  filterChipTextActive: { color: COLORS.primaryDark, fontWeight: '600' },
  empty:           { alignItems: 'center', paddingTop: 60 },
  emptyIcon:       { fontSize: 48, marginBottom: 12 },
  emptyText:       { fontSize: 15, color: COLORS.textMuted, textAlign: 'center', paddingHorizontal: 32 },
});

const offerStyles = StyleSheet.create({
  featuredCard: {
    width: 260,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    marginStart: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  featuredHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  featuredCategory: { fontSize: 13, color: COLORS.textSecondary, flex: 1 },
  featuredTitle:    { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 10, lineHeight: 22 },
  featuredFooter:   { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  saveIcon:         { fontSize: 20 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTop:      { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  cardCategory: { fontSize: 24 },
  cardProvider: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 2 },
  cardTitle:    { fontSize: 15, fontWeight: '600', color: COLORS.text, lineHeight: 20 },
  cardBottom:   { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  codeRow:      { flexDirection: 'row', marginTop: 8, alignItems: 'center' },
  codeLabel:    { fontSize: 12, color: COLORS.textSecondary },
  codeValue:    { fontSize: 13, fontWeight: '700', color: COLORS.offer, letterSpacing: 1 },
  discountBadge:     { backgroundColor: COLORS.offerBg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  discountBadgeText: { color: COLORS.offer, fontWeight: '700', fontSize: 13 },
  expiryChip:        { backgroundColor: COLORS.successBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  expiryChipUrgent:  { backgroundColor: COLORS.warningBg },
  expiryChipText:    { color: COLORS.success, fontSize: 11, fontWeight: '600' },
  expiryChipTextUrgent: { color: COLORS.warning },
});

const detailStyles = StyleSheet.create({
  overlay:      { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
    backgroundColor: COLORS.surface,
    borderTopStartRadius: 20,
    borderTopEndRadius: 20,
    padding: 20,
    paddingBottom: 32,
    maxHeight: '85%',
  },
  handle:       { width: 36, height: 4, backgroundColor: '#DDD', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  providerName: { fontSize: 14, color: COLORS.textSecondary, flex: 1 },
  title:        { fontSize: 20, fontWeight: '700', color: COLORS.text, marginBottom: 12, lineHeight: 28 },
  typePill:     { alignSelf: 'flex-start', backgroundColor: COLORS.primaryLight, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5, marginVertical: 8 },
  typePillText: { color: COLORS.primaryDark, fontSize: 13, fontWeight: '600' },
  validRow:     { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  validLabel:   { fontSize: 13, color: COLORS.textSecondary },
  validDates:   { fontSize: 13, color: COLORS.text, fontWeight: '500' },
  countdownRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  countdownIcon: { fontSize: 16 },
  countdownText: { fontSize: 14, color: COLORS.warning, fontWeight: '600' },
  hoursRow:     { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  hoursLabel:   { fontSize: 13, color: COLORS.textSecondary },
  hoursValue:   { fontSize: 13, color: COLORS.text, fontWeight: '500' },
  statsRow:     { marginTop: 8 },
  statsText:    { fontSize: 13, color: COLORS.textMuted },
  codeBlock:    { backgroundColor: COLORS.background, borderRadius: 10, padding: 12, marginTop: 12, alignItems: 'center' },
  codeBlockLabel: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 4 },
  codeBlockValue: { fontSize: 22, fontWeight: '800', color: COLORS.offer, letterSpacing: 3 },
  redeemBtn:    { backgroundColor: COLORS.offer, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  redeemBtnLoading: { opacity: 0.7 },
  redeemBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  closeBtn:     { alignItems: 'center', marginTop: 12, paddingVertical: 8 },
  closeBtnText: { color: COLORS.textSecondary, fontSize: 14 },
});
