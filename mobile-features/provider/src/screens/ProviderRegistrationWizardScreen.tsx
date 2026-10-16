/**
 * ProviderRegistrationWizardScreen — 8-step business registration wizard.
 *
 * Steps:
 *  1. Business type grid
 *  2. Basic info (name_ar, name_en, category, subcategory)
 *  3. Location picker
 *  4. Contact details (phone, WhatsApp, email, website, social)
 *  5. Business hours (day-by-day)
 *  6. Photos (cover + interior/exterior)
 *  7. Description + specialties + payment methods
 *  8. Review & submit
 *
 * Draft is persisted to AsyncStorage so the user can resume.
 */

import { useApi } from '@iraq-maps/mobile-kit';
import { Button, Screen, Text } from '@iraq-maps/ui';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
  Text as RNText,
} from 'react-native';
import { expectStatus } from '../request';
import { t } from '../strings';

// ─── Constants ────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 8;
const DRAFT_KEY = '@iraq_maps/provider_wizard_draft';

// ─── Business type grid ────────────────────────────────────────────────────────

interface BusinessType {
  id: string;
  labelKey: string;
  icon: string;
}

const BUSINESS_TYPES: BusinessType[] = [
  { id: 'food', labelKey: 'category.food', icon: '🍽️' },
  { id: 'cafe', labelKey: 'category.cafe', icon: '☕' },
  { id: 'shopping', labelKey: 'category.shopping', icon: '🛍️' },
  { id: 'health', labelKey: 'category.health', icon: '🏥' },
  { id: 'lodging', labelKey: 'category.lodging', icon: '🏨' },
  { id: 'education', labelKey: 'category.education', icon: '🎓' },
  { id: 'entertainment', labelKey: 'category.entertainment', icon: '🎭' },
  { id: 'office', labelKey: 'category.office', icon: '🏢' },
];

const SUBCATEGORIES: Record<string, string[]> = {
  food: ['مطعم شعبي', 'مطعم عراقي', 'مأكولات بحرية', 'وجبات سريعة', 'حلويات', 'مشاوي'],
  cafe: ['كافيه', 'قهوة عربية', 'مقهى', 'عصائر وأيس كريم'],
  shopping: ['ملابس', 'إلكترونيات', 'مواد غذائية', 'مستلزمات منزلية', 'عطور ومستحضرات'],
  health: ['عيادة عامة', 'صيدلية', 'مستشفى', 'عيادة أسنان', 'مختبر طبي'],
  lodging: ['فندق', 'شقق فندقية', 'استراحة'],
  education: ['مدرسة', 'معهد', 'جامعة', 'مركز تدريب'],
  entertainment: ['صالة ألعاب', 'سينما', 'ملاهي', 'رياضة'],
  office: ['مكتب محاسبة', 'مكتب قانوني', 'شركة', 'خدمات حكومية'],
};

const PAYMENT_METHODS = [
  { id: 'cash', label: 'نقداً' },
  { id: 'visa', label: 'فيزا / ماستركارد' },
  { id: 'zain_cash', label: 'زين كاش' },
  { id: 'asia_hawala', label: 'آسيا حوالة' },
  { id: 'qi_card', label: 'كي كارد' },
  { id: 'fastpay', label: 'فاست باي' },
];

const SOCIAL_PLATFORMS = [
  { id: 'instagram', label: 'إنستغرام', placeholder: 'https://instagram.com/...' },
  { id: 'facebook', label: 'فيسبوك', placeholder: 'https://facebook.com/...' },
  { id: 'tiktok', label: 'تيك توك', placeholder: 'https://tiktok.com/@...' },
  { id: 'telegram', label: 'تلغرام', placeholder: 'https://t.me/...' },
  { id: 'youtube', label: 'يوتيوب', placeholder: 'https://youtube.com/...' },
];

const DAYS = [
  { key: 'sat', label: 'السبت' },
  { key: 'sun', label: 'الأحد' },
  { key: 'mon', label: 'الاثنين' },
  { key: 'tue', label: 'الثلاثاء' },
  { key: 'wed', label: 'الأربعاء' },
  { key: 'thu', label: 'الخميس' },
  { key: 'fri', label: 'الجمعة' },
];

// ─── Draft types ───────────────────────────────────────────────────────────────

interface DayHours {
  open: boolean;
  from: string;
  to: string;
}

interface SocialEntry {
  platform: string;
  url: string;
}

interface WizardDraft {
  step: number;
  // Step 1
  businessType: string;
  // Step 2
  nameAr: string;
  nameEn: string;
  subcategory: string;
  // Step 3
  locationLat: string;
  locationLng: string;
  locationLabel: string;
  // Step 4
  phone: string;
  whatsapp: string;
  email: string;
  website: string;
  social: SocialEntry[];
  // Step 5
  hours: Record<string, DayHours>;
  // Step 6
  coverPhotoUri: string;
  photoUris: string[];
  // Step 7
  descriptionAr: string;
  descriptionEn: string;
  specialties: string;
  paymentMethods: string[];
}

const defaultDayHours = (): DayHours => ({ open: false, from: '09:00', to: '22:00' });

const initialDraft = (): WizardDraft => ({
  step: 1,
  businessType: '',
  nameAr: '',
  nameEn: '',
  subcategory: '',
  locationLat: '',
  locationLng: '',
  locationLabel: '',
  phone: '',
  whatsapp: '',
  email: '',
  website: '',
  social: [],
  hours: Object.fromEntries(DAYS.map((d) => [d.key, defaultDayHours()])),
  coverPhotoUri: '',
  photoUris: [],
  descriptionAr: '',
  descriptionEn: '',
  specialties: '',
  paymentMethods: ['cash'],
});

// ─── Step progress indicator ───────────────────────────────────────────────────

interface ProgressHeaderProps {
  step: number;
  total: number;
  title: string;
  onBack?: () => void;
}

function ProgressHeader({ step, total, title, onBack }: ProgressHeaderProps): ReactElement {
  const pct = ((step - 1) / (total - 1)) * 100;
  const animW = useRef(new Animated.Value(pct)).current;

  useEffect(() => {
    Animated.timing(animW, {
      toValue: ((step - 1) / (total - 1)) * 100,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [step, total, animW]);

  return (
    <View style={hdrStyles.wrap}>
      <View style={hdrStyles.topRow}>
        {onBack ? (
          <Pressable onPress={onBack} style={hdrStyles.backBtn} accessibilityRole="button">
            <RNText style={hdrStyles.backIcon}>{'<'}</RNText>
          </Pressable>
        ) : (
          <View style={hdrStyles.backBtn} />
        )}
        <RNText style={hdrStyles.stepLabel}>
          {t('registration.step', { current: step, total })}
        </RNText>
        <View style={hdrStyles.backBtn} />
      </View>
      <View style={hdrStyles.track}>
        <Animated.View
          style={[
            hdrStyles.fill,
            {
              width: animW.interpolate({
                inputRange: [0, 100],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>
      <RNText style={hdrStyles.title}>{title}</RNText>
    </View>
  );
}

const hdrStyles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, backgroundColor: '#fff' },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 20, color: '#1565c0' },
  stepLabel: { fontSize: 13, color: '#666', textAlign: 'center' },
  track: {
    height: 4,
    backgroundColor: '#e5e7eb',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 12,
  },
  fill: { height: '100%', backgroundColor: '#1565c0', borderRadius: 2 },
  title: { fontSize: 20, fontWeight: '800', color: '#111', textAlign: 'center' },
});

// ─── Step 1 — Business type grid ──────────────────────────────────────────────

interface Step1Props {
  selected: string;
  onSelect: (id: string) => void;
}

function Step1BusinessType({ selected, onSelect }: Step1Props): ReactElement {
  return (
    <View style={s1.wrap}>
      <RNText style={s1.subtitle}>اختر نوع نشاطك التجاري لإعداد التجربة المناسبة لك.</RNText>
      <View style={s1.grid}>
        {BUSINESS_TYPES.map((bt) => (
          <Pressable
            key={bt.id}
            onPress={() => onSelect(bt.id)}
            style={[s1.card, selected === bt.id && s1.cardSelected]}
            accessibilityRole="radio"
            accessibilityState={{ selected: selected === bt.id }}
          >
            <RNText style={s1.icon}>{bt.icon}</RNText>
            <RNText style={[s1.label, selected === bt.id && s1.labelSelected]}>
              {t(bt.labelKey as never)}
            </RNText>
            {selected === bt.id && <View style={s1.check} />}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const s1 = StyleSheet.create({
  wrap: { flex: 1 },
  subtitle: { fontSize: 14, color: '#555', textAlign: 'center', marginBottom: 20, lineHeight: 22 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  card: {
    width: '45%',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    padding: 16,
    alignItems: 'center',
    gap: 8,
    position: 'relative',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
  },
  cardSelected: { borderColor: '#1565c0', backgroundColor: '#eff6ff' },
  icon: { fontSize: 32 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', textAlign: 'center' },
  labelSelected: { color: '#1565c0' },
  check: {
    position: 'absolute',
    top: 8,
    end: 8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#1565c0',
  },
});

// ─── Step 2 — Basic info ───────────────────────────────────────────────────────

interface Step2Props {
  draft: WizardDraft;
  onChange: (patch: Partial<WizardDraft>) => void;
}

function Step2BasicInfo({ draft, onChange }: Step2Props): ReactElement {
  const subs = SUBCATEGORIES[draft.businessType] ?? [];
  return (
    <View style={s2.wrap}>
      <FieldLabel>اسم النشاط بالعربية *</FieldLabel>
      <TextInput
        style={s2.input}
        value={draft.nameAr}
        onChangeText={(v) => onChange({ nameAr: v })}
        placeholder="مثال: مطعم النخيل"
        textAlign="right"
        returnKeyType="next"
      />

      <FieldLabel>اسم النشاط بالإنجليزية</FieldLabel>
      <TextInput
        style={s2.input}
        value={draft.nameEn}
        onChangeText={(v) => onChange({ nameEn: v })}
        placeholder="e.g. Al-Nakheel Restaurant"
        returnKeyType="next"
      />

      {subs.length > 0 && (
        <>
          <FieldLabel>التصنيف الفرعي</FieldLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s2.subScroll}>
            {subs.map((sub) => (
              <Pressable
                key={sub}
                onPress={() => onChange({ subcategory: sub })}
                style={[s2.subChip, draft.subcategory === sub && s2.subChipSelected]}
              >
                <RNText style={[s2.subChipLabel, draft.subcategory === sub && s2.subChipLabelSelected]}>
                  {sub}
                </RNText>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const s2 = StyleSheet.create({
  wrap: { flex: 1, gap: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    marginBottom: 12,
    backgroundColor: '#fff',
    color: '#111',
  },
  subScroll: { marginBottom: 8 },
  subChip: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginEnd: 8,
    backgroundColor: '#fff',
  },
  subChipSelected: { borderColor: '#1565c0', backgroundColor: '#eff6ff' },
  subChipLabel: { fontSize: 13, color: '#555' },
  subChipLabelSelected: { color: '#1565c0', fontWeight: '600' },
});

// ─── Step 3 — Location ─────────────────────────────────────────────────────────

interface Step3Props {
  draft: WizardDraft;
  onChange: (patch: Partial<WizardDraft>) => void;
}

function Step3Location({ draft, onChange }: Step3Props): ReactElement {
  const hasLocation = draft.locationLat && draft.locationLng;

  const handleManual = () => {
    Alert.prompt(
      'إحداثيات الموقع',
      'أدخل خط العرض وخط الطول (مثال: 33.3152, 44.3661)',
      (text) => {
        if (!text) return;
        const parts = text.split(',').map((p) => p.trim());
        if (parts.length === 2 && parts[0] && parts[1]) {
          const lat = parseFloat(parts[0]);
          const lng = parseFloat(parts[1]);
          if (!isNaN(lat) && !isNaN(lng)) {
            onChange({
              locationLat: String(lat),
              locationLng: String(lng),
              locationLabel: text,
            });
          } else {
            Alert.alert('خطأ', 'الإحداثيات غير صحيحة');
          }
        }
      },
      'plain-text',
    );
  };

  return (
    <View style={s3.wrap}>
      <RNText style={s3.subtitle}>
        حدد الموقع الدقيق لنشاطك التجاري ليظهر بدقة على الخريطة.
      </RNText>

      {/* Map placeholder — MapLibre integration wired at feature level */}
      <View style={s3.mapPlaceholder}>
        <RNText style={s3.mapIcon}>🗺️</RNText>
        <RNText style={s3.mapLabel}>
          {hasLocation
            ? `${draft.locationLat}, ${draft.locationLng}`
            : 'انقر لتحديد الموقع على الخريطة'}
        </RNText>
        {hasLocation && <View style={s3.pinDot} />}
      </View>

      <Pressable onPress={handleManual} style={s3.manualBtn}>
        <RNText style={s3.manualBtnLabel}>
          {hasLocation ? '🔄 تغيير الموقع يدوياً' : '📍 إدخال الإحداثيات يدوياً'}
        </RNText>
      </Pressable>

      <FieldLabel>وصف الموقع (اختياري)</FieldLabel>
      <TextInput
        style={s3.input}
        value={draft.locationLabel}
        onChangeText={(v) => onChange({ locationLabel: v })}
        placeholder='مثال: قرب جامع الكوفة، شارع 60'
        textAlign="right"
        multiline
      />

      {hasLocation && (
        <View style={s3.successBadge}>
          <RNText style={s3.successText}>✓ تم تحديد الموقع</RNText>
        </View>
      )}
    </View>
  );
}

const s3 = StyleSheet.create({
  wrap: { flex: 1 },
  subtitle: { fontSize: 14, color: '#555', marginBottom: 16, lineHeight: 22, textAlign: 'center' },
  mapPlaceholder: {
    height: 200,
    backgroundColor: '#e8f0fe',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#c7d7fa',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    gap: 8,
    position: 'relative',
    overflow: 'hidden',
  },
  mapIcon: { fontSize: 40 },
  mapLabel: { fontSize: 14, color: '#1565c0', fontWeight: '500', textAlign: 'center', paddingHorizontal: 20 },
  pinDot: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#1565c0',
    borderWidth: 2,
    borderColor: '#fff',
  },
  manualBtn: {
    borderWidth: 1,
    borderColor: '#1565c0',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  manualBtnLabel: { color: '#1565c0', fontSize: 14, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#fff',
    color: '#111',
    marginBottom: 12,
  },
  successBadge: {
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#86efac',
  },
  successText: { color: '#166534', fontSize: 14, fontWeight: '600' },
});

// ─── Step 4 — Contact details ──────────────────────────────────────────────────

interface Step4Props {
  draft: WizardDraft;
  onChange: (patch: Partial<WizardDraft>) => void;
}

function Step4Contact({ draft, onChange }: Step4Props): ReactElement {
  const updateSocial = (platform: string, url: string) => {
    const filtered = draft.social.filter((s) => s.platform !== platform);
    onChange({ social: url ? [...filtered, { platform, url }] : filtered });
  };

  const getSocial = (platform: string) =>
    draft.social.find((s) => s.platform === platform)?.url ?? '';

  return (
    <ScrollView style={s4.wrap} showsVerticalScrollIndicator={false}>
      <FieldLabel>رقم الهاتف *</FieldLabel>
      <TextInput
        style={s4.input}
        value={draft.phone}
        onChangeText={(v) => onChange({ phone: v })}
        placeholder="07xx xxx xxxx"
        keyboardType="phone-pad"
        textAlign="right"
      />

      <FieldLabel>رقم الواتساب</FieldLabel>
      <TextInput
        style={s4.input}
        value={draft.whatsapp}
        onChangeText={(v) => onChange({ whatsapp: v })}
        placeholder="07xx xxx xxxx (إذا اختلف)"
        keyboardType="phone-pad"
        textAlign="right"
      />

      <FieldLabel>البريد الإلكتروني</FieldLabel>
      <TextInput
        style={s4.input}
        value={draft.email}
        onChangeText={(v) => onChange({ email: v })}
        placeholder="example@email.com"
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <FieldLabel>الموقع الإلكتروني</FieldLabel>
      <TextInput
        style={s4.input}
        value={draft.website}
        onChangeText={(v) => onChange({ website: v })}
        placeholder="https://website.com"
        keyboardType="url"
        autoCapitalize="none"
      />

      <RNText style={s4.sectionTitle}>حسابات التواصل الاجتماعي</RNText>
      {SOCIAL_PLATFORMS.map((p) => (
        <View key={p.id} style={s4.socialRow}>
          <RNText style={s4.socialPlatform}>{p.label}</RNText>
          <TextInput
            style={[s4.input, s4.socialInput]}
            value={getSocial(p.id)}
            onChangeText={(v) => updateSocial(p.id, v)}
            placeholder={p.placeholder}
            keyboardType="url"
            autoCapitalize="none"
          />
        </View>
      ))}
    </ScrollView>
  );
}

const s4 = StyleSheet.create({
  wrap: { flex: 1 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    marginBottom: 12,
    backgroundColor: '#fff',
    color: '#111',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
    marginTop: 8,
    marginBottom: 12,
  },
  socialRow: { marginBottom: 4 },
  socialPlatform: { fontSize: 13, color: '#555', marginBottom: 4 },
  socialInput: { marginBottom: 8 },
});

// ─── Step 5 — Business hours ───────────────────────────────────────────────────

interface Step5Props {
  hours: Record<string, DayHours>;
  onChange: (hours: Record<string, DayHours>) => void;
}

function Step5Hours({ hours, onChange }: Step5Props): ReactElement {
  const update = (day: string, patch: Partial<DayHours>) => {
    onChange({ ...hours, [day]: { ...hours[day]!, ...patch } });
  };

  return (
    <ScrollView style={s5.wrap} showsVerticalScrollIndicator={false}>
      <RNText style={s5.hint}>
        حدد أوقات العمل لكل يوم. أوقف اليوم إذا كان النشاط مغلقاً.
      </RNText>
      {DAYS.map(({ key, label }) => {
        const day = hours[key] ?? defaultDayHours();
        return (
          <View key={key} style={[s5.row, !day.open && s5.rowClosed]}>
            <View style={s5.rowHeader}>
              <RNText style={[s5.dayLabel, !day.open && s5.dayLabelClosed]}>{label}</RNText>
              <Switch
                value={day.open}
                onValueChange={(v) => update(key, { open: v })}
                trackColor={{ true: '#1565c0', false: '#d1d5db' }}
              />
            </View>
            {day.open && (
              <View style={s5.timeRow}>
                <View style={s5.timeField}>
                  <RNText style={s5.timeLabel}>من</RNText>
                  <TextInput
                    style={s5.timeInput}
                    value={day.from}
                    onChangeText={(v) => update(key, { from: v })}
                    placeholder="09:00"
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                  />
                </View>
                <RNText style={s5.timeSep}>–</RNText>
                <View style={s5.timeField}>
                  <RNText style={s5.timeLabel}>حتى</RNText>
                  <TextInput
                    style={s5.timeInput}
                    value={day.to}
                    onChangeText={(v) => update(key, { to: v })}
                    placeholder="22:00"
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                  />
                </View>
              </View>
            )}
            {!day.open && (
              <RNText style={s5.closedBadge}>مغلق</RNText>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const s5 = StyleSheet.create({
  wrap: { flex: 1 },
  hint: { fontSize: 13, color: '#666', marginBottom: 16, textAlign: 'center' },
  row: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    marginBottom: 10,
  },
  rowClosed: { backgroundColor: '#fafafa', borderColor: '#f0f0f0' },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dayLabel: { fontSize: 15, fontWeight: '600', color: '#222' },
  dayLabelClosed: { color: '#aaa' },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeField: { flex: 1, gap: 4 },
  timeLabel: { fontSize: 12, color: '#888' },
  timeInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 8,
    fontSize: 15,
    textAlign: 'center',
    backgroundColor: '#f9fafb',
    color: '#111',
  },
  timeSep: { fontSize: 18, color: '#999', paddingTop: 16 },
  closedBadge: { fontSize: 13, color: '#aaa', fontStyle: 'italic' },
});

// ─── Step 6 — Photos ───────────────────────────────────────────────────────────

interface Step6Props {
  coverPhotoUri: string;
  photoUris: string[];
  onChange: (patch: Partial<WizardDraft>) => void;
}

function Step6Photos({ coverPhotoUri, photoUris, onChange }: Step6Props): ReactElement {
  const pickImage = async (isCover: boolean) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: isCover,
      aspect: isCover ? [16, 9] : undefined,
    });
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    if (isCover) {
      onChange({ coverPhotoUri: uri });
    } else {
      if (photoUris.length >= 5) {
        Alert.alert('الحد الأقصى', 'يمكنك إضافة ٥ صور كحد أقصى.');
        return;
      }
      onChange({ photoUris: [...photoUris, uri] });
    }
  };

  const removePhoto = (idx: number) => {
    onChange({ photoUris: photoUris.filter((_, i) => i !== idx) });
  };

  return (
    <ScrollView style={s6.wrap} showsVerticalScrollIndicator={false}>
      <RNText style={s6.hint}>
        أضف صورة غلاف جذابة وصوراً للمكان الداخلي/الخارجي لتعزيز الثقة.
      </RNText>

      {/* Cover photo */}
      <RNText style={s6.sectionTitle}>صورة الغلاف *</RNText>
      <Pressable
        onPress={() => pickImage(true)}
        style={[s6.coverBox, coverPhotoUri ? s6.coverBoxFilled : undefined]}
      >
        {coverPhotoUri ? (
          <RNText style={s6.uploadedIcon}>✓ صورة الغلاف محددة</RNText>
        ) : (
          <>
            <RNText style={s6.addIcon}>📷</RNText>
            <RNText style={s6.addLabel}>اختر صورة الغلاف</RNText>
            <RNText style={s6.addSub}>نسبة 16:9 مُوصى بها</RNText>
          </>
        )}
      </Pressable>
      {coverPhotoUri && (
        <Pressable onPress={() => onChange({ coverPhotoUri: '' })} style={s6.removeBtn}>
          <RNText style={s6.removeBtnLabel}>إزالة صورة الغلاف</RNText>
        </Pressable>
      )}

      {/* Additional photos */}
      <RNText style={s6.sectionTitle}>
        صور إضافية ({photoUris.length}/5)
      </RNText>
      <View style={s6.photosGrid}>
        {photoUris.map((uri, idx) => (
          <View key={uri} style={s6.photoThumb}>
            <RNText style={s6.photoThumbText}>صورة {idx + 1}</RNText>
            <Pressable
              onPress={() => removePhoto(idx)}
              style={s6.removePhotoBtn}
            >
              <RNText style={s6.removePhotoBtnLabel}>×</RNText>
            </Pressable>
          </View>
        ))}
        {photoUris.length < 5 && (
          <Pressable onPress={() => pickImage(false)} style={s6.addPhotoBtn}>
            <RNText style={s6.addPhotoIcon}>+</RNText>
            <RNText style={s6.addPhotoLabel}>إضافة صورة</RNText>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const s6 = StyleSheet.create({
  wrap: { flex: 1 },
  hint: { fontSize: 13, color: '#666', marginBottom: 16, textAlign: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 10 },
  coverBox: {
    height: 160,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
    backgroundColor: '#f9fafb',
  },
  coverBoxFilled: { borderColor: '#16a34a', borderStyle: 'solid', backgroundColor: '#f0fdf4' },
  uploadedIcon: { fontSize: 16, color: '#166534', fontWeight: '700' },
  addIcon: { fontSize: 32 },
  addLabel: { fontSize: 15, color: '#444', fontWeight: '600' },
  addSub: { fontSize: 12, color: '#888' },
  removeBtn: { alignItems: 'center', marginBottom: 16 },
  removeBtnLabel: { color: '#dc2626', fontSize: 13 },
  photosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  photoThumb: {
    width: 90,
    height: 90,
    borderRadius: 10,
    backgroundColor: '#e8f0fe',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#c7d7fa',
    position: 'relative',
  },
  photoThumbText: { fontSize: 12, color: '#1565c0' },
  removePhotoBtn: {
    position: 'absolute',
    top: 4,
    end: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePhotoBtnLabel: { color: '#fff', fontSize: 14, lineHeight: 16 },
  addPhotoBtn: {
    width: 90,
    height: 90,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addPhotoIcon: { fontSize: 22, color: '#888' },
  addPhotoLabel: { fontSize: 11, color: '#888' },
});

// ─── Step 7 — Description ──────────────────────────────────────────────────────

interface Step7Props {
  draft: WizardDraft;
  onChange: (patch: Partial<WizardDraft>) => void;
}

function Step7Description({ draft, onChange }: Step7Props): ReactElement {
  const togglePayment = (id: string) => {
    const current = draft.paymentMethods;
    onChange({
      paymentMethods: current.includes(id)
        ? current.filter((p) => p !== id)
        : [...current, id],
    });
  };

  return (
    <ScrollView style={s7.wrap} showsVerticalScrollIndicator={false}>
      <FieldLabel>وصف النشاط بالعربية *</FieldLabel>
      <TextInput
        style={[s7.input, s7.multiline]}
        value={draft.descriptionAr}
        onChangeText={(v) => onChange({ descriptionAr: v })}
        placeholder="اكتب وصفاً تعريفياً لنشاطك التجاري بالعربية…"
        multiline
        numberOfLines={4}
        textAlign="right"
        textAlignVertical="top"
        maxLength={500}
      />
      <RNText style={s7.charCount}>{draft.descriptionAr.length}/500</RNText>

      <FieldLabel>وصف النشاط بالإنجليزية</FieldLabel>
      <TextInput
        style={[s7.input, s7.multiline]}
        value={draft.descriptionEn}
        onChangeText={(v) => onChange({ descriptionEn: v })}
        placeholder="Write a description of your business in English…"
        multiline
        numberOfLines={4}
        textAlignVertical="top"
        maxLength={500}
      />
      <RNText style={s7.charCount}>{draft.descriptionEn.length}/500</RNText>

      <FieldLabel>المميزات والتخصصات</FieldLabel>
      <TextInput
        style={s7.input}
        value={draft.specialties}
        onChangeText={(v) => onChange({ specialties: v })}
        placeholder="مثال: أطباق عراقية تقليدية، توصيل مجاني"
        textAlign="right"
      />

      <RNText style={s7.sectionTitle}>طرق الدفع المقبولة</RNText>
      <View style={s7.paymentGrid}>
        {PAYMENT_METHODS.map((pm) => (
          <Pressable
            key={pm.id}
            onPress={() => togglePayment(pm.id)}
            style={[
              s7.paymentChip,
              draft.paymentMethods.includes(pm.id) && s7.paymentChipSelected,
            ]}
          >
            <RNText
              style={[
                s7.paymentLabel,
                draft.paymentMethods.includes(pm.id) && s7.paymentLabelSelected,
              ]}
            >
              {pm.label}
            </RNText>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const s7 = StyleSheet.create({
  wrap: { flex: 1 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    marginBottom: 4,
    backgroundColor: '#fff',
    color: '#111',
  },
  multiline: { height: 100 },
  charCount: { fontSize: 11, color: '#aaa', textAlign: 'end', marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#333', marginTop: 8, marginBottom: 12 },
  paymentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  paymentChip: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
  },
  paymentChipSelected: { borderColor: '#1565c0', backgroundColor: '#eff6ff' },
  paymentLabel: { fontSize: 13, color: '#555' },
  paymentLabelSelected: { color: '#1565c0', fontWeight: '600' },
});

// ─── Step 8 — Review & submit ─────────────────────────────────────────────────

interface Step8Props {
  draft: WizardDraft;
  submitting: boolean;
  onEdit: (step: number) => void;
  onSubmit: () => void;
}

function Step8Review({ draft, submitting, onEdit, onSubmit }: Step8Props): ReactElement {
  const businessType = BUSINESS_TYPES.find((bt) => bt.id === draft.businessType);
  const openDays = DAYS.filter((d) => draft.hours[d.key]?.open);
  const hasCover = !!draft.coverPhotoUri;
  const photoCount = draft.photoUris.length;

  return (
    <ScrollView style={s8.wrap} showsVerticalScrollIndicator={false}>
      <RNText style={s8.intro}>
        راجع المعلومات أدناه قبل إرسال طلبك. يمكنك تعديل أي قسم بالنقر على زر التعديل.
      </RNText>

      <ReviewSection
        title="نوع النشاط"
        step={1}
        onEdit={onEdit}
        value={businessType ? `${businessType.icon} ${t(businessType.labelKey as never)}` : '—'}
      />
      <ReviewSection
        title="المعلومات الأساسية"
        step={2}
        onEdit={onEdit}
        items={[
          { label: 'الاسم بالعربية', value: draft.nameAr || '—' },
          { label: 'الاسم بالإنجليزية', value: draft.nameEn || '—' },
          { label: 'التصنيف الفرعي', value: draft.subcategory || '—' },
        ]}
      />
      <ReviewSection
        title="الموقع"
        step={3}
        onEdit={onEdit}
        value={draft.locationLat
          ? `${draft.locationLat}, ${draft.locationLng}`
          : 'لم يُحدَّد الموقع'}
      />
      <ReviewSection
        title="التواصل"
        step={4}
        onEdit={onEdit}
        items={[
          { label: 'الهاتف', value: draft.phone || '—' },
          { label: 'الواتساب', value: draft.whatsapp || '—' },
          { label: 'البريد الإلكتروني', value: draft.email || '—' },
          { label: 'حسابات التواصل', value: draft.social.length > 0 ? `${draft.social.length} حسابات` : '—' },
        ]}
      />
      <ReviewSection
        title="أوقات العمل"
        step={5}
        onEdit={onEdit}
        value={openDays.length > 0
          ? openDays.map((d) => d.label).join('، ')
          : 'لم تُحدَّد أوقات العمل'}
      />
      <ReviewSection
        title="الصور"
        step={6}
        onEdit={onEdit}
        items={[
          { label: 'صورة الغلاف', value: hasCover ? '✓ محددة' : 'غير محددة' },
          { label: 'صور إضافية', value: `${photoCount} صورة` },
        ]}
      />
      <ReviewSection
        title="الوصف"
        step={7}
        onEdit={onEdit}
        items={[
          { label: 'الوصف بالعربية', value: draft.descriptionAr ? `${draft.descriptionAr.slice(0, 60)}…` : '—' },
          { label: 'طرق الدفع', value: draft.paymentMethods.join('، ') || '—' },
        ]}
      />

      <View style={s8.termsBox}>
        <RNText style={s8.termsText}>
          بإرسال الطلب أؤكد أن المعلومات صحيحة وأوافق على شروط الاستخدام وسياسة الخصوصية.
        </RNText>
      </View>

      <Pressable
        onPress={onSubmit}
        disabled={submitting}
        style={[s8.submitBtn, submitting && s8.submitBtnDisabled]}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <RNText style={s8.submitBtnLabel}>{t('registration.submit')}</RNText>
        )}
      </Pressable>
    </ScrollView>
  );
}

interface ReviewSectionProps {
  title: string;
  step: number;
  onEdit: (step: number) => void;
  value?: string;
  items?: { label: string; value: string }[];
}

function ReviewSection({ title, step, onEdit, value, items }: ReviewSectionProps): ReactElement {
  return (
    <View style={s8.section}>
      <View style={s8.sectionHeader}>
        <RNText style={s8.sectionTitle}>{title}</RNText>
        <Pressable onPress={() => onEdit(step)} style={s8.editBtn}>
          <RNText style={s8.editBtnLabel}>تعديل</RNText>
        </Pressable>
      </View>
      {value !== undefined && (
        <RNText style={s8.sectionValue}>{value}</RNText>
      )}
      {items?.map(({ label, value: v }) => (
        <View key={label} style={s8.itemRow}>
          <RNText style={s8.itemLabel}>{label}:</RNText>
          <RNText style={s8.itemValue}>{v}</RNText>
        </View>
      ))}
    </View>
  );
}

const s8 = StyleSheet.create({
  wrap: { flex: 1 },
  intro: { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 16, lineHeight: 20 },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    marginBottom: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#222' },
  editBtn: {
    borderWidth: 1,
    borderColor: '#1565c0',
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  editBtnLabel: { fontSize: 12, color: '#1565c0' },
  sectionValue: { fontSize: 14, color: '#555' },
  itemRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  itemLabel: { fontSize: 13, color: '#888', flexShrink: 0 },
  itemValue: { fontSize: 13, color: '#333', flex: 1 },
  termsBox: {
    backgroundColor: '#fffbeb',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
    marginBottom: 16,
    marginTop: 4,
  },
  termsText: { fontSize: 13, color: '#92400e', lineHeight: 20, textAlign: 'center' },
  submitBtn: {
    backgroundColor: '#1565c0',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 32,
  },
  submitBtnDisabled: { backgroundColor: '#93c5fd' },
  submitBtnLabel: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

// ─── Shared helpers ────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: string }): ReactElement {
  return <RNText style={fl.label}>{children}</RNText>;
}

const fl = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6 },
});

// ─── Validation ────────────────────────────────────────────────────────────────

function validateStep(step: number, draft: WizardDraft): string | null {
  switch (step) {
    case 1:
      return draft.businessType ? null : 'يرجى اختيار نوع النشاط التجاري.';
    case 2:
      if (!draft.nameAr.trim()) return 'اسم النشاط بالعربية مطلوب.';
      if (draft.nameAr.trim().length < 2) return 'اسم النشاط قصير جداً.';
      return null;
    case 3:
      return null; // Location is optional
    case 4:
      if (!draft.phone.trim()) return 'رقم الهاتف مطلوب.';
      return null;
    case 5:
      return null; // Hours optional
    case 6:
      if (!draft.coverPhotoUri) return 'صورة الغلاف مطلوبة.';
      return null;
    case 7:
      if (!draft.descriptionAr.trim()) return 'الوصف بالعربية مطلوب.';
      if (draft.descriptionAr.trim().length < 20) return 'الوصف قصير جداً (٢٠ حرفاً على الأقل).';
      return null;
    default:
      return null;
  }
}

// ─── Step titles ───────────────────────────────────────────────────────────────

const STEP_TITLES: Record<number, string> = {
  1: 'نوع النشاط',
  2: 'المعلومات الأساسية',
  3: 'الموقع الجغرافي',
  4: 'معلومات التواصل',
  5: 'أوقات العمل',
  6: 'صور النشاط',
  7: 'الوصف والتفاصيل',
  8: 'المراجعة والإرسال',
};

// ─── Main screen ───────────────────────────────────────────────────────────────

export function ProviderRegistrationWizardScreen(): ReactElement {
  const api = useApi();
  const router = useRouter();

  const [draft, setDraft] = useState<WizardDraft>(initialDraft());
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);

  // ── Load saved draft ──────────────────────────────────────────────────────

  useEffect(() => {
    AsyncStorage.getItem(DRAFT_KEY)
      .then((raw) => {
        if (raw) {
          try {
            const saved = JSON.parse(raw) as WizardDraft;
            setDraft(saved);
          } catch {
            // corrupt draft — ignore
          }
        }
      })
      .catch(() => undefined)
      .finally(() => setDraftLoaded(true));
  }, []);

  // ── Save draft ────────────────────────────────────────────────────────────

  const saveDraft = useCallback(
    async (d: WizardDraft) => {
      try {
        await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(d));
        setDraftSaved(true);
        setTimeout(() => setDraftSaved(false), 2000);
      } catch {
        // storage may be unavailable — silently ignore
      }
    },
    [],
  );

  const patch = useCallback(
    (p: Partial<WizardDraft>) => {
      setDraft((prev) => {
        const next = { ...prev, ...p };
        void saveDraft(next);
        return next;
      });
    },
    [saveDraft],
  );

  // ── Navigation ────────────────────────────────────────────────────────────

  const goNext = () => {
    const err = validateStep(draft.step, draft);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    if (draft.step < TOTAL_STEPS) {
      patch({ step: draft.step + 1 });
    }
  };

  const goBack = () => {
    if (draft.step > 1) {
      setError(null);
      patch({ step: draft.step - 1 });
    } else {
      router.back();
    }
  };

  const goToStep = (s: number) => {
    setError(null);
    patch({ step: s });
  };

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      // 1. Create the provider profile via the existing contract
      const body = {
        name: draft.nameAr.trim(),
        category: draft.businessType,
        location:
          draft.locationLat && draft.locationLng
            ? ({ lng: parseFloat(draft.locationLng), lat: parseFloat(draft.locationLat) } as never)
            : undefined,
      };
      const created = expectStatus(await api.providers.create(body), 201);
      const providerId = created.id;

      // 2. Update with additional info (hours, links, etc.)
      const socialLinks = draft.social
        .filter((s) => s.url.startsWith('https://'))
        .map((s) => ({ kind: s.platform as never, url: s.url }));

      await api.providers.update({
        hoursRaw: buildHoursRaw(draft.hours),
        links: socialLinks as never,
      });

      // 3. Mark as submitted
      await api.providers.submit();

      // 4. Clear the draft
      await AsyncStorage.removeItem(DRAFT_KEY);

      void providerId; // used in future upload step
      router.replace('/provider/verification-status' as never);
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? 'حدث خطأ، يرجى المحاولة مرة أخرى.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }, [api, draft, router]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  if (!draftLoaded) {
    return (
      <View style={main.loader}>
        <ActivityIndicator size="large" color="#1565c0" />
      </View>
    );
  }

  const step = draft.step;

  return (
    <View style={main.container}>
      <ProgressHeader
        step={step}
        total={TOTAL_STEPS}
        title={STEP_TITLES[step] ?? ''}
        onBack={goBack}
      />

      {/* Draft saved toast */}
      {draftSaved && (
        <View style={main.draftToast}>
          <RNText style={main.draftToastText}>💾 تم حفظ المسودة</RNText>
        </View>
      )}

      <ScrollView
        style={main.content}
        contentContainerStyle={main.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        {step === 1 && (
          <Step1BusinessType
            selected={draft.businessType}
            onSelect={(id) => patch({ businessType: id })}
          />
        )}
        {step === 2 && <Step2BasicInfo draft={draft} onChange={patch} />}
        {step === 3 && <Step3Location draft={draft} onChange={patch} />}
        {step === 4 && <Step4Contact draft={draft} onChange={patch} />}
        {step === 5 && (
          <Step5Hours
            hours={draft.hours}
            onChange={(hours) => patch({ hours })}
          />
        )}
        {step === 6 && (
          <Step6Photos
            coverPhotoUri={draft.coverPhotoUri}
            photoUris={draft.photoUris}
            onChange={patch}
          />
        )}
        {step === 7 && <Step7Description draft={draft} onChange={patch} />}
        {step === 8 && (
          <Step8Review
            draft={draft}
            submitting={submitting}
            onEdit={goToStep}
            onSubmit={() => void handleSubmit()}
          />
        )}

        {/* Error banner */}
        {error && (
          <View style={main.errorBanner}>
            <RNText style={main.errorText}>⚠ {error}</RNText>
          </View>
        )}
      </ScrollView>

      {/* Bottom nav — hidden on review step (it has its own submit button) */}
      {step < TOTAL_STEPS && (
        <View style={main.bottomNav}>
          {step > 1 ? (
            <Pressable onPress={goBack} style={main.backBtn}>
              <RNText style={main.backBtnLabel}>{t('registration.back')}</RNText>
            </Pressable>
          ) : (
            <View />
          )}
          <Pressable onPress={goNext} style={main.nextBtn}>
            <RNText style={main.nextBtnLabel}>{t('registration.next')}</RNText>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ─── Build hours raw string ────────────────────────────────────────────────────

function buildHoursRaw(hours: Record<string, DayHours>): string {
  const open = DAYS.filter((d) => hours[d.key]?.open);
  if (open.length === 0) return '';
  // Simplified OSM opening_hours format
  const parts = open.map((d) => {
    const h = hours[d.key]!;
    return `${d.label} ${h.from}-${h.to}`;
  });
  return parts.join('; ');
}

// ─── Main styles ───────────────────────────────────────────────────────────────

const main = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  draftToast: {
    position: 'absolute',
    top: 110,
    alignSelf: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 16,
    zIndex: 100,
  },
  draftToastText: { color: '#fff', fontSize: 13 },
  content: { flex: 1 },
  contentContainer: { padding: 20, paddingBottom: 16 },
  errorBanner: {
    marginTop: 12,
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: { color: '#dc2626', fontSize: 14, textAlign: 'center' },
  bottomNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: 28,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    gap: 12,
  },
  backBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
  },
  backBtnLabel: { fontSize: 15, color: '#555', fontWeight: '600' },
  nextBtn: {
    flex: 2,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#1565c0',
    alignItems: 'center',
  },
  nextBtnLabel: { fontSize: 15, color: '#fff', fontWeight: '700' },
});
