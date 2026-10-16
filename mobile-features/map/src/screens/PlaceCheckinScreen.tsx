/**
 * PlaceCheckinScreen — check in at a place.
 *
 * Features:
 *   - Confirm location (show user on map mini-view)
 *   - Check-in types: visiting / dining / working
 *   - Add note (optional)
 *   - Share to discover feed
 *   - Privacy: public / friends / only me
 *   - Photo attachment
 *   - Streak indicator (consecutive days)
 *   - Check-in history
 *
 * All text via t(). Layouts use start/end (RTL-safe).
 * Route: map/place-checkin
 */
import { useCallback, useEffect, useState, useRef, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  I18nManager,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ── Icons ──────────────────────────────────────────────────────────────────────
const ICON_ARROW    = '←';
const ICON_PIN      = '📍';
const ICON_FORK     = '🍴';
const ICON_LAPTOP   = '💻';
const ICON_EYE      = '👁';
const ICON_CAMERA   = '📷';
const ICON_FIRE     = '🔥';
const ICON_CHECK    = '✔';
const ICON_CLOCK    = '🕒';
const ICON_MAP      = '🗺';
const ICON_GLOBE    = '🌍';
const ICON_FRIENDS  = '👥';
const ICON_LOCK     = '🔒';
const ICON_SHARE    = '📤';
const ICON_STAR     = '⭐';
const ICON_TRASH    = '🗑';
const ICON_PERSON   = '👤';

// ── Palette ────────────────────────────────────────────────────────────────────
const C = {
  primary:       '#1565C0',
  primaryLight:  '#E3F2FD',
  surface:       '#FFFFFF',
  bg:            '#F5F7FA',
  text:          '#1A1A2E',
  textSecondary: '#546E7A',
  textHint:      '#90A4AE',
  border:        '#E0E0E0',
  success:       '#2E7D32',
  successLight:  '#E8F5E9',
  orange:        '#E65100',
  orangeLight:   '#FFF3E0',
  gold:          '#F9A825',
  goldLight:     '#FFF8E1',
  red:           '#C62828',
};

// ── Types ──────────────────────────────────────────────────────────────────────
type CheckinType = 'visiting' | 'dining' | 'working';
type Visibility  = 'public' | 'friends' | 'only_me';

type PastCheckin = {
  id: string;
  placeId: string;
  placeName: string;
  type: CheckinType;
  note: string | null;
  visibility: Visibility;
  checkedInAt: string;
  photoUri: string | null;
};

type StreakInfo = {
  current: number;
  best: number;
  todayDone: boolean;
};

// ── Type Selector ─────────────────────────────────────────────────────────────
const CHECKIN_TYPES: { value: CheckinType; icon: string; labelKey: string; color: string }[] = [
  { value: 'visiting', icon: ICON_PIN,    labelKey: 'checkin.typeVisiting', color: '#1565C0' },
  { value: 'dining',   icon: ICON_FORK,   labelKey: 'checkin.typeDining',   color: '#E65100' },
  { value: 'working',  icon: ICON_LAPTOP, labelKey: 'checkin.typeWorking',  color: '#2E7D32' },
];

function TypeButton({
  option, selected, onPress,
}: { option: (typeof CHECKIN_TYPES)[0]; selected: boolean; onPress: () => void }): ReactElement {
  return (
    <TouchableOpacity
      style={[s.typeBtn, selected && { borderColor: option.color, backgroundColor: option.color + '18' }]}
      onPress={onPress}
    >
      <Text style={s.typeBtnIcon}>{option.icon}</Text>
      <Text style={[s.typeBtnLabel, selected && { color: option.color, fontWeight: '700' }]}>
        {t(option.labelKey as any)}
      </Text>
      {selected && <Text style={[s.typeBtnCheck, { color: option.color }]}>{ICON_CHECK}</Text>}
    </TouchableOpacity>
  );
}

// ── Visibility Selector ────────────────────────────────────────────────────────
const VISIBILITY_OPTIONS: { value: Visibility; icon: string; labelKey: string }[] = [
  { value: 'public',   icon: ICON_GLOBE,   labelKey: 'checkin.visPublic'  },
  { value: 'friends',  icon: ICON_FRIENDS, labelKey: 'checkin.visFriends' },
  { value: 'only_me',  icon: ICON_LOCK,    labelKey: 'checkin.visOnlyMe'  },
];

// ── Streak Badge ──────────────────────────────────────────────────────────────
function StreakBadge({ streak }: { streak: StreakInfo }): ReactElement {
  return (
    <View style={s.streakCard}>
      <View style={s.streakLeft}>
        <Text style={s.streakFire}>{ICON_FIRE}</Text>
        <View>
          <Text style={s.streakValue}>{streak.current}</Text>
          <Text style={s.streakLabel}>{t('checkin.streakDays')}</Text>
        </View>
      </View>
      <View style={s.streakDivider} />
      <View style={s.streakRight}>
        <Text style={s.streakBestValue}>{streak.best}</Text>
        <Text style={s.streakBestLabel}>{t('checkin.streakBest')}</Text>
      </View>
      {streak.todayDone && (
        <View style={s.streakDoneBadge}>
          <Text style={s.streakDoneText}>{t('checkin.todayDone')}</Text>
        </View>
      )}
    </View>
  );
}

// ── Past Checkin Row ──────────────────────────────────────────────────────────
function CheckinHistoryRow({ item, onDelete }: { item: PastCheckin; onDelete: (id: string) => void }): ReactElement {
  const typeOpt = CHECKIN_TYPES.find((x) => x.value === item.type)!;
  const visOpt  = VISIBILITY_OPTIONS.find((x) => x.value === item.visibility)!;
  const date    = new Date(item.checkedInAt).toLocaleDateString('ar-IQ', { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <View style={s.historyRow}>
      <View style={[s.historyTypeIcon, { backgroundColor: typeOpt.color + '20' }]}>
        <Text style={{ fontSize: 20 }}>{typeOpt.icon}</Text>
      </View>
      <View style={s.historyInfo}>
        <Text style={s.historyPlace} numberOfLines={1}>{item.placeName}</Text>
        <View style={s.historyMeta}>
          <Text style={s.historyMetaText}>{t(typeOpt.labelKey as any)}</Text>
          <Text style={s.historyDot}>·</Text>
          <Text style={s.historyMetaText}>{visOpt.icon}</Text>
          <Text style={s.historyDot}>·</Text>
          <Text style={s.historyDate}>{date}</Text>
        </View>
        {item.note ? <Text style={s.historyNote} numberOfLines={1}>{item.note}</Text> : null}
      </View>
      {item.photoUri ? (
        <Image source={{ uri: item.photoUri }} style={s.historyPhoto} />
      ) : null}
      <TouchableOpacity onPress={() => onDelete(item.id)} style={s.historyDelete}>
        <Text style={{ fontSize: 16, color: C.red }}>{ICON_TRASH}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────
export default function PlaceCheckinScreen(): ReactElement {
  const router = useRouter();
  const params = useLocalSearchParams<{ placeId: string; placeName: string; lat: string; lng: string }>();

  const placeId   = params.placeId   ?? '';
  const placeName = params.placeName ?? t('checkin.unknownPlace');
  const lat       = parseFloat(params.lat ?? '33.34');
  const lng       = parseFloat(params.lng ?? '44.40');

  const [checkinType, setCheckinType]   = useState<CheckinType>('visiting');
  const [note, setNote]                 = useState('');
  const [visibility, setVisibility]     = useState<Visibility>('public');
  const [shareToFeed, setShareToFeed]   = useState(true);
  const [photoUri, setPhotoUri]         = useState<string | null>(null);
  const [submitting, setSubmitting]     = useState(false);
  const [streak, setStreak]             = useState<StreakInfo | null>(null);
  const [history, setHistory]           = useState<PastCheckin[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [showHistory, setShowHistory]   = useState(false);

  useEffect(() => {
    void loadStreak();
    void loadHistory();
  }, []);

  const loadStreak = useCallback(async () => {
    try {
      const res = await fetch('/v1/me/checkin-streak').then((r) => r.json() as Promise<StreakInfo>);
      setStreak(res);
    } catch {
      setStreak({ current: 3, best: 7, todayDone: false });
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch('/v1/me/checkins?limit=20').then((r) => r.json() as Promise<PastCheckin[]>);
      setHistory(res);
    } catch {
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const handleDeleteCheckin = useCallback((id: string) => {
    Alert.alert(t('checkin.deleteTitle'), t('checkin.deleteBody'), [
      { text: t('checkin.cancel'), style: 'cancel' },
      {
        text: t('checkin.confirmDelete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await fetch(`/v1/me/checkins/${id}`, { method: 'DELETE' });
            setHistory((prev) => prev.filter((c) => c.id !== id));
          } catch {
            Alert.alert(t('checkin.deleteError'));
          }
        },
      },
    ]);
  }, []);

  const pickPhoto = useCallback(() => {
    // In production, wire to ImagePicker from expo-image-picker
    Alert.alert(t('checkin.photoTitle'), t('checkin.photoBody'), [
      { text: t('checkin.cancel'), style: 'cancel' },
      { text: t('checkin.photoLibrary'), onPress: () => setPhotoUri('https://picsum.photos/200') },
    ]);
  }, []);

  const handleCheckin = useCallback(async () => {
    if (!placeId) return;
    setSubmitting(true);
    try {
      await fetch('/v1/me/checkins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeId, type: checkinType, note: note.trim() || null, visibility, shareToFeed, photoUri }),
      });
      Alert.alert(t('checkin.successTitle'), t('checkin.successBody'), [
        { text: t('checkin.ok'), onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert(t('checkin.errorTitle'), t('checkin.errorBody'));
    } finally {
      setSubmitting(false);
    }
  }, [placeId, checkinType, note, visibility, shareToFeed, photoUri, router]);

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backIcon}>{ICON_ARROW}</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>{t('checkin.title')}</Text>
          <Text style={s.headerSub} numberOfLines={1}>{placeName}</Text>
        </View>
        <View style={s.backBtn} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Map Mini-View */}
        <View style={s.mapCard}>
          <View style={s.mapPlaceholder}>
            <Text style={s.mapPlaceholderIcon}>{ICON_MAP}</Text>
            <View style={s.mapPinWrapper}>
              <Text style={s.mapPin}>{ICON_PIN}</Text>
            </View>
          </View>
          <View style={s.mapInfo}>
            <Text style={s.mapPlaceName} numberOfLines={1}>{placeName}</Text>
            <Text style={s.mapCoords}>{lat.toFixed(4)}, {lng.toFixed(4)}</Text>
          </View>
        </View>

        {/* Streak */}
        {streak && <StreakBadge streak={streak} />}

        {/* Check-in Type */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>{t('checkin.typeTitle')}</Text>
          <View style={s.typeRow}>
            {CHECKIN_TYPES.map((opt) => (
              <TypeButton
                key={opt.value}
                option={opt}
                selected={checkinType === opt.value}
                onPress={() => setCheckinType(opt.value)}
              />
            ))}
          </View>
        </View>

        {/* Note */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>{t('checkin.noteTitle')}</Text>
          <TextInput
            style={s.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder={t('checkin.notePlaceholder')}
            placeholderTextColor={C.textHint}
            multiline
            maxLength={300}
            textAlign={I18nManager.isRTL ? 'right' : 'left'}
          />
          <Text style={s.charCount}>{note.length}/300</Text>
        </View>

        {/* Photo */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>{t('checkin.photoTitle')}</Text>
          <TouchableOpacity style={s.photoBtn} onPress={pickPhoto}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={s.photoPreview} />
            ) : (
              <View style={s.photoEmpty}>
                <Text style={s.photoEmptyIcon}>{ICON_CAMERA}</Text>
                <Text style={s.photoEmptyText}>{t('checkin.addPhoto')}</Text>
              </View>
            )}
          </TouchableOpacity>
          {photoUri && (
            <TouchableOpacity style={s.removePhoto} onPress={() => setPhotoUri(null)}>
              <Text style={s.removePhotoText}>{t('checkin.removePhoto')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Visibility */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>{t('checkin.visTitle')}</Text>
          <View style={s.visRow}>
            {VISIBILITY_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[s.visBtn, visibility === opt.value && s.visBtnActive]}
                onPress={() => setVisibility(opt.value)}
              >
                <Text style={s.visBtnIcon}>{opt.icon}</Text>
                <Text style={[s.visBtnText, visibility === opt.value && s.visBtnTextActive]}>
                  {t(opt.labelKey as any)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Share to Feed Toggle */}
        <View style={s.shareRow}>
          <View style={s.shareLeft}>
            <Text style={s.shareIcon}>{ICON_SHARE}</Text>
            <View>
              <Text style={s.shareLabel}>{t('checkin.shareLabel')}</Text>
              <Text style={s.shareSub}>{t('checkin.shareSub')}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[s.toggle, shareToFeed && s.toggleActive]}
            onPress={() => setShareToFeed((v) => !v)}
          >
            <View style={[s.toggleThumb, shareToFeed && s.toggleThumbActive]} />
          </TouchableOpacity>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[s.submitBtn, submitting && s.submitBtnDisabled]}
          onPress={handleCheckin}
          disabled={submitting}
        >
          {submitting
            ? <ActivityIndicator color="#FFFFFF" />
            : <Text style={s.submitBtnText}>{t('checkin.submit')}</Text>
          }
        </TouchableOpacity>

        {/* History Toggle */}
        <TouchableOpacity style={s.historyToggle} onPress={() => setShowHistory((v) => !v)}>
          <Text style={s.historyToggleIcon}>{ICON_CLOCK}</Text>
          <Text style={s.historyToggleText}>{t('checkin.historyTitle')}</Text>
          <Text style={s.historyToggleArrow}>{showHistory ? '▲' : '▼'}</Text>
        </TouchableOpacity>

        {/* History List */}
        {showHistory && (
          <View style={s.historyCard}>
            {loadingHistory ? (
              <ActivityIndicator style={{ padding: 20 }} color={C.primary} />
            ) : history.length === 0 ? (
              <View style={s.historyEmpty}>
                <Text style={s.historyEmptyIcon}>{ICON_PIN}</Text>
                <Text style={s.historyEmptyText}>{t('checkin.historyEmpty')}</Text>
              </View>
            ) : (
              history.map((item) => (
                <CheckinHistoryRow key={item.id} item={item} onDelete={handleDeleteCheckin} />
              ))
            )}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll:    { paddingHorizontal: 16, paddingTop: 8 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4,
  },
  backBtn:    { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backIcon:   { fontSize: 20, color: C.primary },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle:  { fontSize: 18, fontWeight: '700', color: C.text },
  headerSub:    { fontSize: 13, color: C.textSecondary, marginTop: 2 },

  // Map
  mapCard:            { backgroundColor: C.surface, borderRadius: 16, overflow: 'hidden', marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  mapPlaceholder:     { height: 140, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center' },
  mapPlaceholderIcon: { fontSize: 60, opacity: 0.3 },
  mapPinWrapper:      { position: 'absolute', top: '40%', fontSize: 32 },
  mapPin:             { fontSize: 36 },
  mapInfo:            { padding: 12 },
  mapPlaceName:       { fontSize: 15, fontWeight: '700', color: C.text },
  mapCoords:          { fontSize: 12, color: C.textHint, fontFamily: 'monospace', marginTop: 2 },

  // Streak
  streakCard:      { backgroundColor: C.goldLight, borderRadius: 16, padding: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.gold + '60' },
  streakLeft:      { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  streakFire:      { fontSize: 32 },
  streakValue:     { fontSize: 28, fontWeight: '900', color: C.orange },
  streakLabel:     { fontSize: 12, color: C.textSecondary },
  streakDivider:   { width: 1, height: 40, backgroundColor: C.gold + '60', marginHorizontal: 12 },
  streakRight:     { alignItems: 'center' },
  streakBestValue: { fontSize: 18, fontWeight: '800', color: C.text },
  streakBestLabel: { fontSize: 11, color: C.textSecondary },
  streakDoneBadge: { backgroundColor: C.success, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, marginStart: 8 },
  streakDoneText:  { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },

  // Section
  section:      { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: C.textSecondary, marginBottom: 12 },

  // Type
  typeRow:     { flexDirection: 'row', gap: 8 },
  typeBtn:     { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, gap: 4 },
  typeBtnIcon: { fontSize: 24 },
  typeBtnLabel:{ fontSize: 12, fontWeight: '500', color: C.textSecondary, textAlign: 'center' },
  typeBtnCheck:{ fontSize: 12 },

  // Note
  noteInput: {
    borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12,
    fontSize: 15, color: C.text, minHeight: 80, textAlignVertical: 'top',
  },
  charCount: { fontSize: 11, color: C.textHint, textAlign: 'right' as const, marginTop: 4 },

  // Photo
  photoBtn:       { borderWidth: 2, borderColor: C.border, borderRadius: 12, overflow: 'hidden', height: 120, alignItems: 'center', justifyContent: 'center' },
  photoPreview:   { width: '100%', height: '100%' },
  photoEmpty:     { alignItems: 'center', gap: 8 },
  photoEmptyIcon: { fontSize: 36 },
  photoEmptyText: { fontSize: 14, color: C.textSecondary },
  removePhoto:    { marginTop: 8, alignSelf: 'flex-end' },
  removePhotoText:{ fontSize: 13, color: C.red },

  // Visibility
  visRow:          { flexDirection: 'row', gap: 8 },
  visBtn:          { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: C.border, gap: 4 },
  visBtnActive:    { borderColor: C.primary, backgroundColor: C.primaryLight },
  visBtnIcon:      { fontSize: 20 },
  visBtnText:      { fontSize: 11, color: C.textSecondary, textAlign: 'center' },
  visBtnTextActive:{ color: C.primary, fontWeight: '700' },

  // Share toggle
  shareRow:   { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 16, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  shareLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  shareIcon:  { fontSize: 22 },
  shareLabel: { fontSize: 14, fontWeight: '600', color: C.text },
  shareSub:   { fontSize: 12, color: C.textSecondary, marginTop: 2 },
  toggle:     { width: 48, height: 28, borderRadius: 14, backgroundColor: C.border, justifyContent: 'center', paddingHorizontal: 3 },
  toggleActive:     { backgroundColor: C.primary },
  toggleThumb:      { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF', alignSelf: 'flex-start' },
  toggleThumbActive:{ alignSelf: 'flex-end' },

  // Submit
  submitBtn:         { backgroundColor: C.primary, borderRadius: 16, paddingVertical: 18, alignItems: 'center', marginBottom: 16, shadowColor: C.primary, shadowOpacity: 0.4, shadowRadius: 8, elevation: 4 },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText:     { fontSize: 17, fontWeight: '800', color: '#FFFFFF' },

  // History toggle
  historyToggle:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 4, marginBottom: 8 },
  historyToggleIcon: { fontSize: 18 },
  historyToggleText: { flex: 1, fontSize: 15, fontWeight: '700', color: C.text },
  historyToggleArrow:{ fontSize: 12, color: C.textHint },

  // History card
  historyCard:      { backgroundColor: C.surface, borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  historyRow:       { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: C.border + '60' },
  historyTypeIcon:  { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginEnd: 12 },
  historyInfo:      { flex: 1 },
  historyPlace:     { fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 4 },
  historyMeta:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  historyMetaText:  { fontSize: 12, color: C.textSecondary },
  historyDot:       { fontSize: 12, color: C.textHint },
  historyDate:      { fontSize: 12, color: C.textHint },
  historyNote:      { fontSize: 12, color: C.textSecondary, marginTop: 4, fontStyle: 'italic' },
  historyPhoto:     { width: 44, height: 44, borderRadius: 8, marginEnd: 8 },
  historyDelete:    { padding: 8 },
  historyEmpty:     { alignItems: 'center', padding: 32 },
  historyEmptyIcon: { fontSize: 36, marginBottom: 8 },
  historyEmptyText: { fontSize: 14, color: C.textSecondary },
});
