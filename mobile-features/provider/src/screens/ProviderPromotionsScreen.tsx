/**
 * ProviderPromotionsScreen — full promotion management for verified providers.
 *
 * Tabs:
 *   - Active: live promotions with redemption count badge
 *   - Scheduled: not-yet-started promotions
 *   - Expired: past promotions (read-only)
 *
 * Features:
 *   - Create promotion wizard (multi-step)
 *   - Redemption stats per promo (views + countdown bar)
 *   - Boost promo to featured (stub — shows upgrade upsell)
 *   - QR code stub for promo redemption at POS
 *   - Share to Discover button
 */

import { promotionsContract, type Promotion } from '@iraq-maps/contracts';
import { useApi, useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { Button, EmptyState, Screen } from '@iraq-maps/ui';
import { initClient } from '@ts-rest/core';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  Alert,
  Animated,
  I18nManager,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ── Palette ───────────────────────────────────────────────────────────────────

const C = {
  primary:    '#1976D2',
  primaryDark:'#1565C0',
  primaryLight:'#E3F2FD',
  danger:     '#EF4444',
  dangerBg:   '#FFEBEE',
  success:    '#388E3C',
  successBg:  '#E8F5E9',
  warning:    '#F57C00',
  warningBg:  '#FFF3E0',
  surface:    '#FFF',
  background: '#F5F5F5',
  text:       '#1A1A1A',
  secondary:  '#555',
  muted:      '#888',
  border:     '#DDD',
  offer:      '#E91E63',
  offerBg:    '#FCE4EC',
} as const;

// ── API client ────────────────────────────────────────────────────────────────

function usePromotionsApi() {
  const baseUrl = useApiBaseUrl();
  useApi();
  return useMemo(() => initClient(promotionsContract, { baseUrl, baseHeaders: {} }), [baseUrl]);
}

// ── Tab type ──────────────────────────────────────────────────────────────────

type TabId = 'active' | 'scheduled' | 'expired';

// ── Helpers ───────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().split('T')[0] ?? '';
}
function inDays(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString().split('T')[0] ?? '';
}

function promoStatus(p: Promotion): 'active' | 'scheduled' | 'expired' {
  const now = new Date();
  if (p.status === 'deleted') return 'expired';
  if (new Date(p.validFrom) > now) return 'scheduled';
  if (new Date(p.validTo) < now || p.status === 'expired') return 'expired';
  return 'active';
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ar-IQ', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── Countdown hook ────────────────────────────────────────────────────────────

function useCountdown(iso: string): string {
  const [label, setLabel] = useState('');
  useEffect(() => {
    function upd() {
      const ms = new Date(iso).getTime() - Date.now();
      if (ms <= 0) { setLabel(t('promotions.expired')); return; }
      const h = Math.floor(ms / 3_600_000);
      if (h < 24) { setLabel(`${h}${t('promotions.hoursLeft')}`); return; }
      setLabel(`${Math.floor(h / 24)}${t('promotions.daysLeft')}`);
    }
    upd();
    const id = setInterval(upd, 60_000);
    return () => clearInterval(id);
  }, [iso]);
  return label;
}

// ── Redemption bar ────────────────────────────────────────────────────────────

function RedemptionBar({ count, max }: { count: number; max: number | null | undefined }): ReactElement {
  const pct = max && max > 0 ? Math.min(1, count / max) : 0;
  const width = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(width, { toValue: pct, duration: 600, useNativeDriver: false }).start();
  }, [pct, width]);

  if (!max) {
    return (
      <View style={barStyles.row}>
        <Text style={barStyles.label}>{t('promotions.redeemed')}: {count}</Text>
        <Text style={barStyles.unlimited}>{t('promotions.unlimited')}</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={barStyles.row}>
        <Text style={barStyles.label}>{t('promotions.redeemed')}: {count}/{max}</Text>
        <Text style={barStyles.pct}>{Math.round(pct * 100)}%</Text>
      </View>
      <View style={barStyles.track}>
        <Animated.View
          style={[
            barStyles.fill,
            { width: width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
            pct > 0.8 && barStyles.fillWarn,
          ]}
        />
      </View>
    </View>
  );
}

const barStyles = StyleSheet.create({
  row:       { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label:     { fontSize: 12, color: C.secondary },
  pct:       { fontSize: 12, color: C.secondary },
  unlimited: { fontSize: 12, color: C.success },
  track:     { height: 6, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden' },
  fill:      { height: 6, backgroundColor: C.primary, borderRadius: 3 },
  fillWarn:  { backgroundColor: C.warning },
});

// ── QR stub sheet ─────────────────────────────────────────────────────────────

function QrSheet({ visible, promo, onClose }: { visible: boolean; promo: Promotion | null; onClose: () => void }): ReactElement {
  if (!promo) return <View />;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={qrStyles.overlay} onPress={onClose} accessibilityRole="none" />
      <View style={qrStyles.sheet}>
        <View style={qrStyles.handle} />
        <Text style={qrStyles.title}>{t('promotions.qrTitle')}</Text>
        <View style={qrStyles.qrBox}>
          {/* QR generation requires a native library; shown as a stub placeholder */}
          <Text style={qrStyles.qrIcon}>⬛⬛⬛{'\n'}⬛ ⬛{'\n'}⬛⬛⬛</Text>
          <Text style={qrStyles.qrStub}>{t('promotions.qrStub')}</Text>
        </View>
        {promo.code ? (
          <View style={qrStyles.codeRow}>
            <Text style={qrStyles.codeLabel}>{t('promotions.code')}: </Text>
            <Text style={qrStyles.codeValue}>{promo.code}</Text>
          </View>
        ) : null}
        <Text style={qrStyles.hint}>{t('promotions.qrHint')}</Text>
        <TouchableOpacity style={qrStyles.closeBtn} onPress={onClose} accessibilityRole="button">
          <Text style={qrStyles.closeBtnText}>{t('promotions.close')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const qrStyles = StyleSheet.create({
  overlay:     { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:       { position: 'absolute', bottom: 0, start: 0, end: 0, backgroundColor: C.surface, borderTopStartRadius: 20, borderTopEndRadius: 20, padding: 24, paddingBottom: 36 },
  handle:      { width: 36, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  title:       { fontSize: 18, fontWeight: '700', color: C.text, textAlign: 'center', marginBottom: 16 },
  qrBox:       { alignItems: 'center', backgroundColor: C.background, borderRadius: 12, padding: 24, marginBottom: 16 },
  qrIcon:      { fontSize: 32, textAlign: 'center', letterSpacing: 2, lineHeight: 40, marginBottom: 12 },
  qrStub:      { fontSize: 13, color: C.muted, textAlign: 'center' },
  codeRow:     { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  codeLabel:   { fontSize: 14, color: C.secondary },
  codeValue:   { fontSize: 20, fontWeight: '800', color: C.offer, letterSpacing: 3 },
  hint:        { fontSize: 12, color: C.muted, textAlign: 'center', marginBottom: 20 },
  closeBtn:    { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  closeBtnText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
});

// ── Promotion card ─────────────────────────────────────────────────────────────

interface PromoCardProps {
  item: Promotion;
  tab: TabId;
  onDelete: (id: string) => void;
  onQr: (item: Promotion) => void;
  onBoost: (item: Promotion) => void;
}

function PromoCard({ item, tab, onDelete, onQr, onBoost }: PromoCardProps): ReactElement {
  const countdown = useCountdown(item.validTo);
  const isActive = tab === 'active';
  const isScheduled = tab === 'scheduled';

  return (
    <View style={[cardStyles.card, !isActive && !isScheduled && cardStyles.cardDimmed]}>
      {/* Header */}
      <View style={cardStyles.header}>
        <View style={{ flex: 1 }}>
          <Text style={cardStyles.title} numberOfLines={2}>{item.title}</Text>
          {item.description ? <Text style={cardStyles.desc} numberOfLines={2}>{item.description}</Text> : null}
        </View>
        {item.discountPct ? (
          <View style={cardStyles.badge}>
            <Text style={cardStyles.badgeText}>خصم {item.discountPct}%</Text>
          </View>
        ) : null}
      </View>

      {/* Dates */}
      <View style={cardStyles.datesRow}>
        <Text style={cardStyles.date}>{fmtDate(item.validFrom)}</Text>
        <Text style={cardStyles.dateSep}>←</Text>
        <Text style={cardStyles.date}>{fmtDate(item.validTo)}</Text>
        {isActive && <Text style={cardStyles.countdown}>{countdown}</Text>}
      </View>

      {/* Code */}
      {item.code ? (
        <View style={cardStyles.codeRow}>
          <Text style={cardStyles.codeLabel}>{t('promotions.code')}: </Text>
          <Text style={cardStyles.codeValue}>{item.code}</Text>
        </View>
      ) : null}

      {/* Redemption bar */}
      <RedemptionBar count={item.redeemedCount ?? 0} max={undefined} />

      {/* Status + actions */}
      <View style={cardStyles.footer}>
        <View style={[
          cardStyles.statusPill,
          isActive    && cardStyles.statusActive,
          isScheduled && cardStyles.statusScheduled,
          !isActive && !isScheduled && cardStyles.statusExpired,
        ]}>
          <Text style={[
            cardStyles.statusText,
            isActive    && { color: C.success },
            isScheduled && { color: C.primary },
            !isActive && !isScheduled && { color: C.muted },
          ]}>
            {isActive ? t('promotions.active') : isScheduled ? t('promotions.scheduled') : t('promotions.expired')}
          </Text>
        </View>

        {isActive && (
          <View style={cardStyles.actions}>
            <TouchableOpacity onPress={() => onQr(item)} style={cardStyles.actionBtn} accessibilityRole="button">
              <Text style={cardStyles.actionText}>{t('promotions.qr')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onBoost(item)} style={[cardStyles.actionBtn, cardStyles.actionBoost]} accessibilityRole="button">
              <Text style={[cardStyles.actionText, { color: C.warning }]}>{t('promotions.boost')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onDelete(item.id)} style={[cardStyles.actionBtn, cardStyles.actionDanger]} accessibilityRole="button">
              <Text style={[cardStyles.actionText, { color: C.danger }]}>{t('promotions.delete')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card:           { backgroundColor: C.surface, borderRadius: 14, padding: 16, marginBottom: 12, gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 4, elevation: 2 },
  cardDimmed:     { opacity: 0.65 },
  header:         { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  title:          { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 2, lineHeight: 20 },
  desc:           { fontSize: 12, color: C.secondary, lineHeight: 17 },
  badge:          { backgroundColor: C.offerBg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText:      { color: C.offer, fontWeight: '700', fontSize: 13 },
  datesRow:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  date:           { fontSize: 12, color: C.muted },
  dateSep:        { fontSize: 10, color: C.border },
  countdown:      { marginStart: 'auto', fontSize: 12, color: C.warning, fontWeight: '600' },
  codeRow:        { flexDirection: 'row', alignItems: 'center' },
  codeLabel:      { fontSize: 12, color: C.secondary },
  codeValue:      { fontSize: 14, fontWeight: '800', color: C.offer, letterSpacing: 2 },
  footer:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  statusPill:     { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusActive:   { backgroundColor: C.successBg },
  statusScheduled:{ backgroundColor: C.primaryLight },
  statusExpired:  { backgroundColor: C.background },
  statusText:     { fontSize: 12, fontWeight: '600' },
  actions:        { flexDirection: 'row', gap: 8 },
  actionBtn:      { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: C.background },
  actionBoost:    { backgroundColor: C.warningBg },
  actionDanger:   { backgroundColor: C.dangerBg },
  actionText:     { fontSize: 12, fontWeight: '600', color: C.secondary },
});

// ── Create wizard ──────────────────────────────────────────────────────────────

interface FormState {
  title: string;
  description: string;
  discountPct: string;
  code: string;
  validFrom: string;
  validTo: string;
}

function CreateWizard({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: (p: Promotion) => void;
}): ReactElement {
  const api = usePromotionsApi();
  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({ title: '', description: '', discountPct: '', code: '', validFrom: today(), validTo: inDays(30) });

  const set = useCallback(<K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v })), []);

  const reset = useCallback(() => {
    setStep(1);
    setForm({ title: '', description: '', discountPct: '', code: '', validFrom: today(), validTo: inDays(30) });
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const res = await api.create({
        body: {
          titleAr: form.title.trim(),
          descriptionAr: form.description.trim() || undefined,
          type: form.discountPct ? 'percentage_discount' : 'fixed_discount',
          category: 'other',
          discountValue: form.discountPct ? parseFloat(form.discountPct) : null,
          code: form.code.trim() || null,
          validFrom: new Date(form.validFrom + 'T00:00:00Z').toISOString(),
          validTo:   new Date(form.validTo   + 'T23:59:59Z').toISOString(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cityId: 'baghdad' as any,
        },
      });
      if (res.status === 201) {
        onSaved(res.body);
        reset();
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }, [api, form, onSaved, onClose, reset]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={wizardStyles.overlay} onPress={onClose} accessibilityRole="none" />
      <View style={wizardStyles.sheet}>
        <View style={wizardStyles.handle} />

        {/* Progress bar */}
        <View style={wizardStyles.progress}>
          <View style={[wizardStyles.progressFill, { width: step === 1 ? '50%' : '100%' }]} />
        </View>
        <Text style={wizardStyles.stepLabel}>{t('promotions.step', { n: step, total: 2 })}</Text>

        <ScrollView contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
          {step === 1 && (
            <View style={{ gap: 10 }}>
              <Text style={wizardStyles.sectionTitle}>{t('promotions.wizardStep1')}</Text>

              <Text style={wizardStyles.label}>{t('promotions.titleLabel')}</Text>
              <TextInput
                style={wizardStyles.input}
                value={form.title}
                onChangeText={(v) => set('title', v)}
                placeholder={t('promotions.titlePlaceholder')}
                maxLength={120}
              />

              <Text style={wizardStyles.label}>{t('promotions.description')}</Text>
              <TextInput
                style={[wizardStyles.input, wizardStyles.multiline]}
                value={form.description}
                onChangeText={(v) => set('description', v)}
                placeholder={t('promotions.descriptionPlaceholder')}
                multiline
                maxLength={500}
              />

              <Text style={wizardStyles.label}>{t('promotions.discountPct')}</Text>
              <TextInput
                style={wizardStyles.input}
                value={form.discountPct}
                onChangeText={(v) => set('discountPct', v)}
                keyboardType="numeric"
                maxLength={3}
                placeholder="0–100"
              />

              <Text style={wizardStyles.label}>{t('promotions.code')}</Text>
              <TextInput
                style={wizardStyles.input}
                value={form.code}
                onChangeText={(v) => set('code', v.toUpperCase())}
                placeholder={t('promotions.codePlaceholder')}
                maxLength={32}
                autoCapitalize="characters"
              />

              <TouchableOpacity
                style={[wizardStyles.nextBtn, !form.title.trim() && wizardStyles.nextBtnDisabled]}
                onPress={() => form.title.trim() && setStep(2)}
                accessibilityRole="button"
                disabled={!form.title.trim()}
              >
                <Text style={wizardStyles.nextBtnText}>{t('promotions.next')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 2 && (
            <View style={{ gap: 10 }}>
              <Text style={wizardStyles.sectionTitle}>{t('promotions.wizardStep2')}</Text>

              <Text style={wizardStyles.label}>{t('promotions.validFrom')}</Text>
              <TextInput
                style={wizardStyles.input}
                value={form.validFrom}
                onChangeText={(v) => set('validFrom', v)}
                placeholder="YYYY-MM-DD"
                keyboardType="numbers-and-punctuation"
              />

              <Text style={wizardStyles.label}>{t('promotions.validTo')}</Text>
              <TextInput
                style={wizardStyles.input}
                value={form.validTo}
                onChangeText={(v) => set('validTo', v)}
                placeholder="YYYY-MM-DD"
                keyboardType="numbers-and-punctuation"
              />

              {/* Summary */}
              <View style={wizardStyles.summary}>
                <Text style={wizardStyles.summaryTitle}>{form.title}</Text>
                {form.discountPct ? <Text style={wizardStyles.summaryDiscount}>خصم {form.discountPct}%</Text> : null}
                <Text style={wizardStyles.summaryDates}>{form.validFrom} → {form.validTo}</Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity style={[wizardStyles.nextBtn, wizardStyles.backBtn]} onPress={() => setStep(1)} accessibilityRole="button">
                  <Text style={wizardStyles.backBtnText}>{t('promotions.back')}</Text>
                </TouchableOpacity>
                <Button label={t('promotions.save')} onPress={() => { void handleSave(); }} loading={saving} />
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const wizardStyles = StyleSheet.create({
  overlay:         { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:           { position: 'absolute', bottom: 0, start: 0, end: 0, backgroundColor: C.surface, borderTopStartRadius: 20, borderTopEndRadius: 20, padding: 20, paddingBottom: 36, maxHeight: '90%' },
  handle:          { width: 36, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  progress:        { height: 4, backgroundColor: C.border, borderRadius: 2, marginBottom: 4 },
  progressFill:    { height: 4, backgroundColor: C.primary, borderRadius: 2 },
  stepLabel:       { fontSize: 12, color: C.muted, textAlign: 'center', marginBottom: 16 },
  sectionTitle:    { fontSize: 17, fontWeight: '700', color: C.text },
  label:           { fontSize: 13, fontWeight: '600', color: C.secondary },
  input:           { borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, fontSize: 15, backgroundColor: '#FAFAFA', textAlign: 'auto' },
  multiline:       { minHeight: 80, textAlignVertical: 'top' },
  nextBtn:         { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', flex: 1 },
  nextBtnDisabled: { backgroundColor: C.border },
  nextBtnText:     { color: '#FFF', fontWeight: '700', fontSize: 16 },
  backBtn:         { backgroundColor: C.background, flex: 0.5 },
  backBtnText:     { color: C.secondary, fontWeight: '700', fontSize: 16 },
  summary:         { backgroundColor: C.primaryLight, borderRadius: 10, padding: 12 },
  summaryTitle:    { fontSize: 15, fontWeight: '700', color: C.text },
  summaryDiscount: { fontSize: 14, color: C.offer, fontWeight: '700', marginTop: 4 },
  summaryDates:    { fontSize: 12, color: C.secondary, marginTop: 4 },
});

// ── Boost upsell sheet ─────────────────────────────────────────────────────────

function BoostSheet({ visible, onClose }: { visible: boolean; onClose: () => void }): ReactElement {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={boostStyles.overlay} onPress={onClose} accessibilityRole="none" />
      <View style={boostStyles.sheet}>
        <View style={boostStyles.handle} />
        <Text style={boostStyles.icon}>⚡</Text>
        <Text style={boostStyles.title}>{t('promotions.boostTitle')}</Text>
        <Text style={boostStyles.body}>{t('promotions.boostBody')}</Text>
        <View style={boostStyles.featureList}>
          {[
            t('promotions.boostF1'),
            t('promotions.boostF2'),
            t('promotions.boostF3'),
          ].map((f, i) => (
            <View key={i} style={boostStyles.featureRow}>
              <Text style={boostStyles.featureDot}>✓</Text>
              <Text style={boostStyles.featureText}>{f}</Text>
            </View>
          ))}
        </View>
        <TouchableOpacity
          style={boostStyles.ctaBtn}
          onPress={() => {
            onClose();
            Alert.alert(t('promotions.boostComingSoon'), t('promotions.boostComingSoonBody'));
          }}
          accessibilityRole="button"
        >
          <Text style={boostStyles.ctaText}>{t('promotions.boostCta')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} style={boostStyles.closeBtn} accessibilityRole="button">
          <Text style={boostStyles.closeBtnText}>{t('promotions.close')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const boostStyles = StyleSheet.create({
  overlay:     { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:       { position: 'absolute', bottom: 0, start: 0, end: 0, backgroundColor: C.surface, borderTopStartRadius: 20, borderTopEndRadius: 20, padding: 24, paddingBottom: 36 },
  handle:      { width: 36, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  icon:        { fontSize: 44, textAlign: 'center', marginBottom: 8 },
  title:       { fontSize: 20, fontWeight: '800', color: C.text, textAlign: 'center', marginBottom: 8 },
  body:        { fontSize: 14, color: C.secondary, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  featureList: { gap: 8, marginBottom: 20 },
  featureRow:  { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  featureDot:  { fontSize: 14, color: C.success, fontWeight: '700' },
  featureText: { fontSize: 14, color: C.text, flex: 1, lineHeight: 20 },
  ctaBtn:      { backgroundColor: C.warning, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  ctaText:     { color: '#FFF', fontSize: 16, fontWeight: '800' },
  closeBtn:    { alignItems: 'center', paddingVertical: 8 },
  closeBtnText:{ color: C.secondary, fontSize: 14 },
});

// ── Main screen ────────────────────────────────────────────────────────────────

export function ProviderPromotionsScreen(): ReactElement {
  const api = usePromotionsApi();

  const [allPromos, setAllPromos] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<TabId>('active');
  const [wizardVisible, setWizardVisible] = useState(false);
  const [qrPromo, setQrPromo] = useState<Promotion | null>(null);
  const [boostVisible, setBoostVisible] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await api.listActive();
      if (res.status === 200) setAllPromos(res.body);
    } finally {
      if (refresh) setRefreshing(false); else setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const handleDelete = useCallback((id: string) => {
    Alert.alert(t('promotions.delete'), t('promotions.deleteConfirm'), [
      { text: t('promotions.cancel'), style: 'cancel' },
      {
        text: t('promotions.delete'), style: 'destructive',
        onPress: async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const res = await api.delete({ params: { id: id as any } });
          if (res.status === 204) setAllPromos((p) => p.filter((x) => x.id !== id));
        },
      },
    ]);
  }, [api]);

  const filtered = useMemo(() => allPromos.filter((p) => promoStatus(p) === tab), [allPromos, tab]);

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: 'active',    label: t('promotions.tabActive'),    count: allPromos.filter((p) => promoStatus(p) === 'active').length },
    { id: 'scheduled', label: t('promotions.tabScheduled'), count: allPromos.filter((p) => promoStatus(p) === 'scheduled').length },
    { id: 'expired',   label: t('promotions.tabExpired'),   count: allPromos.filter((p) => promoStatus(p) === 'expired').length },
  ];

  if (loading) {
    return (
      <Screen>
        <SafeAreaView style={s.container}>
          <View style={s.header}>
            <Text style={s.headerTitle}>{t('promotions.title')}</Text>
          </View>
          <Text style={s.loadingText}>{t('dashboard.status')}</Text>
        </SafeAreaView>
      </Screen>
    );
  }

  return (
    <Screen>
      <SafeAreaView style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>{t('promotions.title')}</Text>
          <TouchableOpacity onPress={() => setWizardVisible(true)} style={s.addBtn} accessibilityRole="button">
            <Text style={s.addBtnText}>{t('promotions.add')}</Text>
          </TouchableOpacity>
        </View>

        {/* Tab bar */}
        <View style={s.tabBar}>
          {tabs.map((tb) => (
            <TouchableOpacity
              key={tb.id}
              style={[s.tabItem, tab === tb.id && s.tabItemActive]}
              onPress={() => setTab(tb.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === tb.id }}
            >
              <Text style={[s.tabLabel, tab === tb.id && s.tabLabelActive]}>{tb.label}</Text>
              {tb.count > 0 && (
                <View style={[s.tabBadge, tab === tb.id && s.tabBadgeActive]}>
                  <Text style={[s.tabBadgeText, tab === tb.id && s.tabBadgeTextActive]}>{tb.count}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* List */}
        <ScrollView
          contentContainerStyle={s.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
        >
          {filtered.length === 0 ? (
            <EmptyState
              title={t('promotions.noPromotions')}
              body={tab === 'active' ? t('promotions.noPromotionsBody') : t('promotions.noPromotionsBodyAlt')}
            />
          ) : (
            filtered.map((p) => (
              <PromoCard
                key={p.id}
                item={p}
                tab={tab}
                onDelete={handleDelete}
                onQr={(item) => setQrPromo(item)}
                onBoost={() => setBoostVisible(true)}
              />
            ))
          )}
        </ScrollView>

        {/* Modals */}
        <CreateWizard
          visible={wizardVisible}
          onClose={() => setWizardVisible(false)}
          onSaved={(p) => setAllPromos((prev) => [p, ...prev])}
        />
        <QrSheet
          visible={!!qrPromo}
          promo={qrPromo}
          onClose={() => setQrPromo(null)}
        />
        <BoostSheet visible={boostVisible} onClose={() => setBoostVisible(false)} />
      </SafeAreaView>
    </Screen>
  );
}

const s = StyleSheet.create({
  container:        { flex: 1, backgroundColor: C.background },
  header:           { backgroundColor: C.primary, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle:      { color: '#FFF', fontSize: 18, fontWeight: '700' },
  addBtn:           { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  addBtnText:       { color: '#FFF', fontWeight: '700', fontSize: 14 },
  tabBar:           { flexDirection: 'row', backgroundColor: C.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  tabItem:          { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 12 },
  tabItemActive:    { borderBottomWidth: 2, borderBottomColor: C.primary },
  tabLabel:         { fontSize: 13, color: C.secondary, fontWeight: '500' },
  tabLabelActive:   { color: C.primary, fontWeight: '700' },
  tabBadge:         { backgroundColor: C.background, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, minWidth: 20, alignItems: 'center' },
  tabBadgeActive:   { backgroundColor: C.primaryLight },
  tabBadgeText:     { fontSize: 11, color: C.secondary, fontWeight: '600' },
  tabBadgeTextActive: { color: C.primary },
  content:          { padding: 16, paddingBottom: 32 },
  loadingText:      { textAlign: 'center', marginTop: 40, color: C.muted },
});

/** Re-usable discount badge for place cards (same as PromotionBadge sub-component). */
export function PromotionBadge({ discountPct }: { discountPct: number | null }): ReactElement | null {
  if (!discountPct) return null;
  return (
    <View style={{ backgroundColor: C.offerBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
      <Text style={{ color: C.offer, fontWeight: '700', fontSize: 13 }}>خصم {discountPct}%</Text>
    </View>
  );
}
