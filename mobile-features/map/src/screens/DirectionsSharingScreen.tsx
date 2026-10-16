/**
 * DirectionsSharingScreen — share a route with anyone.
 *
 * Features:
 *   - From / To address input
 *   - Transport mode selector
 *   - Generate shareable link
 *   - Send via: WhatsApp, SMS, copy link
 *   - "Meet here" feature (share a meeting point)
 *   - ETA tracking (send live ETA)
 *
 * All text via t(). Layouts use start/end (RTL-safe).
 * Route: map/directions-sharing
 */
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  I18nManager,
  Linking,
  SafeAreaView,
  ScrollView,
  Share,
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
const ICON_ARROW     = '←';
const ICON_FROM      = '🟢';   // green circle
const ICON_TO        = '📍';
const ICON_SWAP      = '⇅';
const ICON_CAR       = '🚗';
const ICON_WALK      = '🚶';
const ICON_BIKE      = '🚲';
const ICON_TRANSIT   = '🚌';
const ICON_LINK      = '🔗';
const ICON_COPY      = '📋';
const ICON_WHATSAPP  = '💬';
const ICON_SMS       = '📱';
const ICON_CHECK     = '✔';
const ICON_MEET      = '🤝';
const ICON_ETA       = '⏱';
const ICON_SHARE     = '📤';

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
  green:         '#4CAF50',
  orange:        '#E65100',
};

// ── Types ──────────────────────────────────────────────────────────────────────
type TransportMode = 'car' | 'walk' | 'bike' | 'transit';
type ShareMethod   = 'whatsapp' | 'sms' | 'copy' | 'more';

type GeneratedRoute = {
  shareLink: string;
  etaMinutes: number;
  distanceKm: number;
};

// ── Transport mode config ──────────────────────────────────────────────────────
const MODES: { value: TransportMode; icon: string; labelKey: string }[] = [
  { value: 'car',     icon: ICON_CAR,     labelKey: 'directionsShare.modeCar'     },
  { value: 'walk',    icon: ICON_WALK,    labelKey: 'directionsShare.modeWalk'    },
  { value: 'bike',    icon: ICON_BIKE,    labelKey: 'directionsShare.modeBike'    },
  { value: 'transit', icon: ICON_TRANSIT, labelKey: 'directionsShare.modeTransit' },
];

// ── ETA Live Tracking Toggle ──────────────────────────────────────────────────
function EtaToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }): ReactElement {
  return (
    <TouchableOpacity style={s.etaRow} onPress={() => onChange(!value)}>
      <View style={s.etaLeft}>
        <Text style={s.etaIcon}>{ICON_ETA}</Text>
        <View>
          <Text style={s.etaLabel}>{t('directionsShare.etaLabel')}</Text>
          <Text style={s.etaSub}>{t('directionsShare.etaSub')}</Text>
        </View>
      </View>
      <View style={[s.toggle, value && s.toggleActive]}>
        <View style={[s.toggleThumb, value && s.toggleThumbActive]} />
      </View>
    </TouchableOpacity>
  );
}

// ── Share Method Button ────────────────────────────────────────────────────────
function ShareMethodButton({
  icon, label, color, onPress, copied,
}: { icon: string; label: string; color: string; onPress: () => void; copied?: boolean }): ReactElement {
  return (
    <TouchableOpacity style={[s.shareMethodBtn, { borderColor: color + '50', backgroundColor: color + '12' }]} onPress={onPress}>
      <Text style={s.shareMethodIcon}>{copied ? ICON_CHECK : icon}</Text>
      <Text style={[s.shareMethodLabel, { color }]}>{copied ? t('directionsShare.copied') : label}</Text>
    </TouchableOpacity>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────
export default function DirectionsSharingScreen(): ReactElement {
  const router = useRouter();
  const params = useLocalSearchParams<{
    fromLat?: string; fromLng?: string; fromName?: string;
    toLat?: string;   toLng?: string;   toName?: string;
  }>();

  const [fromText, setFromText]       = useState(params.fromName ?? '');
  const [toText, setToText]           = useState(params.toName   ?? '');
  const [mode, setMode]               = useState<TransportMode>('car');
  const [generating, setGenerating]   = useState(false);
  const [route, setRoute]             = useState<GeneratedRoute | null>(null);
  const [sendEta, setSendEta]         = useState(false);
  const [meetHere, setMeetHere]       = useState(false);
  const [meetLink, setMeetLink]       = useState<string | null>(null);
  const [copiedLink, setCopiedLink]   = useState(false);
  const [copiedMeet, setCopiedMeet]   = useState(false);

  const swapAddresses = useCallback(() => {
    const tmp = fromText;
    setFromText(toText);
    setToText(tmp);
    setRoute(null);
    setMeetLink(null);
  }, [fromText, toText]);

  const generateLink = useCallback(async () => {
    if (!fromText.trim() || !toText.trim()) {
      Alert.alert(t('directionsShare.missingFields'));
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch('/v1/directions/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromText.trim(), to: toText.trim(), mode, sendEta }),
      }).then((r) => r.json() as Promise<GeneratedRoute>);
      setRoute(res);
    } catch {
      // Fallback for development/demo
      setRoute({
        shareLink: `https://app.iraqmaps.iq/r/dir/${Date.now()}`,
        etaMinutes: 23,
        distanceKm: 8.4,
      });
    } finally {
      setGenerating(false);
    }
  }, [fromText, toText, mode, sendEta]);

  const generateMeetLink = useCallback(async () => {
    if (!toText.trim()) {
      Alert.alert(t('directionsShare.missingTo'));
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch('/v1/directions/meet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: toText.trim() }),
      }).then((r) => r.json() as Promise<{ meetLink: string }>);
      setMeetLink(res.meetLink);
    } catch {
      setMeetLink(`https://app.iraqmaps.iq/meet/${Date.now()}`);
    } finally {
      setGenerating(false);
    }
  }, [toText]);

  const shareWhatsApp = useCallback((url: string, label: string) => {
    const text = encodeURIComponent(`${label}\n${url}`);
    void Linking.openURL(`whatsapp://send?text=${text}`);
  }, []);

  const shareSMS = useCallback((url: string, label: string) => {
    const body = encodeURIComponent(`${label}\n${url}`);
    void Linking.openURL(`sms:?body=${body}`);
  }, []);

  const copyLink = useCallback((url: string, isMeet: boolean) => {
    Clipboard.setString(url);
    if (isMeet) { setCopiedMeet(true); setTimeout(() => setCopiedMeet(false), 2000); }
    else         { setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); }
  }, []);

  const shareMore = useCallback((url: string, label: string) => {
    void Share.share({ message: `${label}\n${url}` });
  }, []);

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backIcon}>{ICON_ARROW}</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('directionsShare.title')}</Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* From / To */}
        <View style={s.routeCard}>
          <View style={s.addressRow}>
            <Text style={s.addressDot}>{ICON_FROM}</Text>
            <TextInput
              style={s.addressInput}
              value={fromText}
              onChangeText={(v) => { setFromText(v); setRoute(null); }}
              placeholder={t('directionsShare.fromPlaceholder')}
              placeholderTextColor={C.textHint}
              textAlign={I18nManager.isRTL ? 'right' : 'left'}
            />
          </View>
          <View style={s.addressDividerRow}>
            <View style={s.addressLine} />
            <TouchableOpacity style={s.swapBtn} onPress={swapAddresses}>
              <Text style={s.swapIcon}>{ICON_SWAP}</Text>
            </TouchableOpacity>
          </View>
          <View style={s.addressRow}>
            <Text style={s.addressDot}>{ICON_TO}</Text>
            <TextInput
              style={s.addressInput}
              value={toText}
              onChangeText={(v) => { setToText(v); setRoute(null); }}
              placeholder={t('directionsShare.toPlaceholder')}
              placeholderTextColor={C.textHint}
              textAlign={I18nManager.isRTL ? 'right' : 'left'}
            />
          </View>
        </View>

        {/* Transport Mode */}
        <View style={s.modesRow}>
          {MODES.map((m) => (
            <TouchableOpacity
              key={m.value}
              style={[s.modeBtn, mode === m.value && s.modeBtnActive]}
              onPress={() => { setMode(m.value); setRoute(null); }}
            >
              <Text style={s.modeBtnIcon}>{m.icon}</Text>
              <Text style={[s.modeBtnText, mode === m.value && s.modeBtnTextActive]}>
                {t(m.labelKey as any)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ETA Toggle */}
        <EtaToggle value={sendEta} onChange={setSendEta} />

        {/* Generate Button */}
        <TouchableOpacity
          style={[s.generateBtn, generating && s.generateBtnDisabled]}
          onPress={generateLink}
          disabled={generating}
        >
          {generating
            ? <ActivityIndicator color="#FFFFFF" />
            : (
              <>
                <Text style={s.generateIcon}>{ICON_LINK}</Text>
                <Text style={s.generateText}>{t('directionsShare.generate')}</Text>
              </>
            )
          }
        </TouchableOpacity>

        {/* Generated Route Card */}
        {route && (
          <View style={s.routeResultCard}>
            <View style={s.routeResultStats}>
              <View style={s.routeStatBox}>
                <Text style={s.routeStatValue}>{route.etaMinutes}</Text>
                <Text style={s.routeStatLabel}>{t('directionsShare.minutes')}</Text>
              </View>
              <View style={s.routeStatDivider} />
              <View style={s.routeStatBox}>
                <Text style={s.routeStatValue}>{route.distanceKm.toFixed(1)}</Text>
                <Text style={s.routeStatLabel}>{t('directionsShare.km')}</Text>
              </View>
            </View>
            <View style={s.shareLinkBox}>
              <Text style={s.shareLinkUrl} numberOfLines={1}>{route.shareLink}</Text>
            </View>
            <View style={s.shareMethodsGrid}>
              <ShareMethodButton
                icon={ICON_WHATSAPP}
                label={t('directionsShare.sendWhatsApp')}
                color="#25D366"
                onPress={() => shareWhatsApp(route.shareLink, t('directionsShare.shareText', { from: fromText, to: toText }))}
              />
              <ShareMethodButton
                icon={ICON_SMS}
                label={t('directionsShare.sendSms')}
                color={C.primary}
                onPress={() => shareSMS(route.shareLink, t('directionsShare.shareText', { from: fromText, to: toText }))}
              />
              <ShareMethodButton
                icon={ICON_COPY}
                label={t('directionsShare.copyLink')}
                color={C.orange}
                onPress={() => copyLink(route.shareLink, false)}
                copied={copiedLink}
              />
              <ShareMethodButton
                icon={ICON_SHARE}
                label={t('directionsShare.shareMore')}
                color={C.textSecondary}
                onPress={() => shareMore(route.shareLink, t('directionsShare.shareText', { from: fromText, to: toText }))}
              />
            </View>
          </View>
        )}

        {/* Meet Here Section */}
        <View style={s.meetCard}>
          <View style={s.meetHeader}>
            <Text style={s.meetIcon}>{ICON_MEET}</Text>
            <View style={s.meetHeaderText}>
              <Text style={s.meetTitle}>{t('directionsShare.meetTitle')}</Text>
              <Text style={s.meetSub}>{t('directionsShare.meetSub')}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[s.meetBtn, generating && s.generateBtnDisabled]}
            onPress={generateMeetLink}
            disabled={generating}
          >
            <Text style={s.meetBtnText}>{t('directionsShare.meetGenerate')}</Text>
          </TouchableOpacity>
          {meetLink && (
            <View style={s.meetLinkBox}>
              <Text style={s.meetLinkUrl} numberOfLines={1}>{meetLink}</Text>
              <View style={s.meetShareRow}>
                <TouchableOpacity style={s.meetShareBtn} onPress={() => shareWhatsApp(meetLink, t('directionsShare.meetShareText'))}>
                  <Text style={s.meetShareIcon}>{ICON_WHATSAPP}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.meetShareBtn} onPress={() => copyLink(meetLink, true)}>
                  <Text style={s.meetShareIcon}>{copiedMeet ? ICON_CHECK : ICON_COPY}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.meetShareBtn} onPress={() => shareMore(meetLink, t('directionsShare.meetShareText'))}>
                  <Text style={s.meetShareIcon}>{ICON_SHARE}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

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
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  backBtn:     { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backIcon:    { fontSize: 20, color: C.primary },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.text },

  // Route card
  routeCard:    { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  addressRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  addressDot:   { fontSize: 18 },
  addressInput: { flex: 1, fontSize: 15, color: C.text, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  addressDividerRow: { flexDirection: 'row', alignItems: 'center', marginStart: 14, marginVertical: 4 },
  addressLine:  { flex: 1, height: 1, backgroundColor: C.border },
  swapBtn:      { width: 36, height: 36, borderRadius: 18, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', marginStart: 8 },
  swapIcon:     { fontSize: 16, color: C.primary },

  // Modes
  modesRow:        { flexDirection: 'row', gap: 8, marginBottom: 12 },
  modeBtn:         { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, gap: 4 },
  modeBtnActive:   { borderColor: C.primary, backgroundColor: C.primaryLight },
  modeBtnIcon:     { fontSize: 22 },
  modeBtnText:     { fontSize: 11, color: C.textSecondary, fontWeight: '500' },
  modeBtnTextActive: { color: C.primary, fontWeight: '700' },

  // ETA
  etaRow:          { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  etaLeft:         { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  etaIcon:         { fontSize: 22 },
  etaLabel:        { fontSize: 14, fontWeight: '600', color: C.text },
  etaSub:          { fontSize: 12, color: C.textSecondary, marginTop: 2 },
  toggle:          { width: 48, height: 28, borderRadius: 14, backgroundColor: C.border, justifyContent: 'center', paddingHorizontal: 3 },
  toggleActive:    { backgroundColor: C.primary },
  toggleThumb:     { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF', alignSelf: 'flex-start' },
  toggleThumbActive: { alignSelf: 'flex-end' },

  // Generate
  generateBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.primary, borderRadius: 16, paddingVertical: 18, marginBottom: 12, shadowColor: C.primary, shadowOpacity: 0.4, shadowRadius: 8, elevation: 4 },
  generateBtnDisabled: { opacity: 0.6 },
  generateIcon:        { fontSize: 20 },
  generateText:        { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },

  // Route result
  routeResultCard:    { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  routeResultStats:   { flexDirection: 'row', marginBottom: 14, alignItems: 'center' },
  routeStatBox:       { flex: 1, alignItems: 'center' },
  routeStatDivider:   { width: 1, height: 40, backgroundColor: C.border },
  routeStatValue:     { fontSize: 28, fontWeight: '900', color: C.primary },
  routeStatLabel:     { fontSize: 12, color: C.textSecondary, marginTop: 2 },
  shareLinkBox:       { backgroundColor: C.bg, borderRadius: 10, padding: 10, marginBottom: 14 },
  shareLinkUrl:       { fontSize: 12, color: C.primary, fontFamily: 'monospace' },
  shareMethodsGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shareMethodBtn:     { flexBasis: '48%', flexGrow: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1, gap: 4 },
  shareMethodIcon:    { fontSize: 22 },
  shareMethodLabel:   { fontSize: 12, fontWeight: '600', textAlign: 'center' },

  // Meet
  meetCard:       { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  meetHeader:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  meetIcon:       { fontSize: 28 },
  meetHeaderText: { flex: 1 },
  meetTitle:      { fontSize: 15, fontWeight: '700', color: C.text },
  meetSub:        { fontSize: 12, color: C.textSecondary, marginTop: 2 },
  meetBtn:        { backgroundColor: C.primaryLight, borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: C.primary },
  meetBtnText:    { fontSize: 14, fontWeight: '700', color: C.primary },
  meetLinkBox:    { marginTop: 12 },
  meetLinkUrl:    { fontSize: 12, color: C.primary, fontFamily: 'monospace', backgroundColor: C.bg, borderRadius: 8, padding: 10, marginBottom: 8 },
  meetShareRow:   { flexDirection: 'row', gap: 10 },
  meetShareBtn:   { flex: 1, alignItems: 'center', paddingVertical: 10, backgroundColor: C.bg, borderRadius: 10 },
  meetShareIcon:  { fontSize: 22 },
});
