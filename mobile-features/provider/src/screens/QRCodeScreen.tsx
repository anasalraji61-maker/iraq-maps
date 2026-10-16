/**
 * QRCodeScreen — generate and share QR codes for a provider.
 * Supports multiple QR types (menu, booking, messages, review, profile),
 * displays a large printable QR, PNG download stub, poster template,
 * and basic scan analytics.
 */
import { useApi } from '@iraq-maps/mobile-kit';
import { Screen } from '@iraq-maps/ui';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  Alert,
  I18nManager,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../strings';

I18nManager.forceRTL(true);

const PRIMARY = '#1976D2';
const SURFACE = '#FFFFFF';
const BG = '#F5F5F5';
const BORDER = '#E0E0E0';
const SCREEN_W = Dimensions.get('window').width;

// ─── Types ────────────────────────────────────────────────────────────────────

export type QrType = 'profile' | 'menu' | 'booking' | 'messages' | 'review';

interface QrStats {
  totalScans: number;
  scansToday: number;
  scansThisWeek: number;
}

const MOCK_STATS: Record<QrType, QrStats> = {
  profile:  { totalScans: 342, scansToday: 12, scansThisWeek: 67 },
  menu:     { totalScans: 219, scansToday: 8,  scansThisWeek: 44 },
  booking:  { totalScans: 88,  scansToday: 3,  scansThisWeek: 18 },
  messages: { totalScans: 156, scansToday: 5,  scansThisWeek: 29 },
  review:   { totalScans: 74,  scansToday: 2,  scansThisWeek: 11 },
};

// ─── QR type config ───────────────────────────────────────────────────────────

interface QrTypeConfig {
  type: QrType;
  labelKey: Parameters<typeof t>[0];
  emoji: string;
  color: string;
}

const QR_TYPES: QrTypeConfig[] = [
  { type: 'profile',  labelKey: 'qr.typeProfile',  emoji: '🏠', color: '#1976D2' },
  { type: 'menu',     labelKey: 'qr.typeMenu',     emoji: '🍽', color: '#16A34A' },
  { type: 'booking',  labelKey: 'qr.typeBooking',  emoji: '📅', color: '#7C3AED' },
  { type: 'messages', labelKey: 'qr.typeMessages', emoji: '💬', color: '#D97706' },
  { type: 'review',   labelKey: 'qr.typeReview',   emoji: '⭐', color: '#EF4444' },
];

// ─── Simple QR placeholder ────────────────────────────────────────────────────
// In production this would use a library like react-native-qrcode-svg.
// We render a visually representative placeholder that looks like a QR.

function QrPlaceholder({ url, size, color }: { url: string; size: number; color: string }): ReactElement {
  // Draw a grid of cells that visually suggests a QR code
  const cellSize = size / 21;
  // Deterministic pattern derived from url hash
  let hash = 0;
  for (let i = 0; i < url.length; i++) { hash = (hash * 31 + url.charCodeAt(i)) >>> 0; }

  const cells: boolean[][] = Array.from({ length: 21 }, (_, row) =>
    Array.from({ length: 21 }, (_, col) => {
      // Fixed position detection patterns (corners)
      if ((row < 7 && col < 7) || (row < 7 && col > 13) || (row > 13 && col < 7)) {
        const inOuter = row === 0 || row === 6 || col === 0 || col === 6;
        const inInner = row >= 2 && row <= 4 && col >= 2 && col <= 4;
        if ((row < 7 && col < 7)) return inOuter || inInner;
        if ((row < 7 && col > 13)) { const c = col - 14; return c === 0 || c === 6 || row === 0 || row === 6 || (c >= 2 && c <= 4 && row >= 2 && row <= 4); }
        if ((row > 13 && col < 7)) { const r = row - 14; return r === 0 || r === 6 || col === 0 || col === 6 || (r >= 2 && r <= 4 && col >= 2 && col <= 4); }
      }
      // Timing patterns
      if (row === 6 || col === 6) return (row + col) % 2 === 0;
      // Data cells — use hash
      const idx = row * 21 + col;
      return Boolean((hash >> (idx % 32)) & 1) !== (idx % 3 === 0);
    }),
  );

  return (
    <View style={{ width: size, height: size, backgroundColor: SURFACE, padding: 8 }}>
      {cells.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          {row.map((on, c) => (
            <View key={c} style={{ width: cellSize, height: cellSize, backgroundColor: on ? color : SURFACE }} />
          ))}
        </View>
      ))}
    </View>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: number }): ReactElement {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value.toLocaleString('ar-IQ')}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Poster template ──────────────────────────────────────────────────────────

function PosterPreview({ businessName, qrType, color, url }: { businessName: string; qrType: QrType; color: string; url: string }): ReactElement {
  const cfg = QR_TYPES.find(c => c.type === qrType)!;
  return (
    <View style={[styles.poster, { borderColor: color }]}>
      <View style={[styles.posterHeader, { backgroundColor: color }]}>
        <Text style={styles.posterEmoji}>{cfg.emoji}</Text>
        <Text style={styles.posterBusinessName}>{businessName}</Text>
      </View>
      <View style={styles.posterBody}>
        <QrPlaceholder url={url} size={120} color={color} />
        <Text style={styles.posterScanText}>{t('qr.scanToConnect')}</Text>
        <Text style={styles.posterTypeLabel}>{t(cfg.labelKey)}</Text>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

const MOCK_BUSINESS_NAME = 'مطعم النخيل';
const BASE_URL = 'https://iraq-maps.app/biz/mock-provider-id';

export function QRCodeScreen(): ReactElement {
  const [selectedType, setSelectedType] = useState<QrType>('profile');
  const [downloading, setDownloading] = useState(false);
  const [showPoster, setShowPoster] = useState(false);

  const cfg = QR_TYPES.find(c => c.type === selectedType)!;
  const qrUrl = `${BASE_URL}?type=${selectedType}`;
  const stats = MOCK_STATS[selectedType];
  const qrSize = Math.min(SCREEN_W - 80, 260);

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    // In production: use react-native-view-shot + MediaLibrary
    await new Promise(r => setTimeout(r, 900));
    setDownloading(false);
    Alert.alert(t('qr.downloadSuccess'));
  }, []);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({ message: `${MOCK_BUSINESS_NAME}\n${qrUrl}`, url: qrUrl });
    } catch {
      // user cancelled
    }
  }, [qrUrl]);

  const handlePrint = useCallback(() => {
    Alert.alert(t('qr.print'), t('qr.posterTemplate'));
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Title */}
        <Text style={styles.screenTitle}>{t('qr.title')}</Text>

        {/* Type selector */}
        <Text style={styles.sectionLabel}>{t('qr.selectType')}</Text>
        <View style={styles.typeGrid}>
          {QR_TYPES.map(c => (
            <TouchableOpacity
              key={c.type}
              style={[styles.typeChip, selectedType === c.type && { borderColor: c.color, backgroundColor: c.color + '18' }]}
              onPress={() => setSelectedType(c.type)}
              accessibilityRole="radio"
              accessibilityState={{ selected: selectedType === c.type }}
            >
              <Text style={styles.typeChipEmoji}>{c.emoji}</Text>
              <Text style={[styles.typeChipLabel, selectedType === c.type && { color: c.color, fontWeight: '700' }]}>{t(c.labelKey)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* QR display */}
        <View style={styles.qrContainer}>
          <View style={[styles.qrFrame, { borderColor: cfg.color }]}>
            <QrPlaceholder url={qrUrl} size={qrSize} color={cfg.color} />
          </View>
          <Text style={styles.qrUrl} numberOfLines={2}>{qrUrl}</Text>
        </View>

        {/* Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: cfg.color }]} onPress={handleDownload} disabled={downloading}>
            {downloading ? (
              <ActivityIndicator color={SURFACE} size="small" />
            ) : (
              <Text style={styles.actionBtnText}>⬇ {t('qr.download')}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtnOutline} onPress={handleShare}>
            <Text style={[styles.actionBtnOutlineText, { color: cfg.color }]}>↗ {t('qr.share')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtnOutline} onPress={handlePrint}>
            <Text style={[styles.actionBtnOutlineText, { color: cfg.color }]}>🖨 {t('qr.print')}</Text>
          </TouchableOpacity>
        </View>

        {/* Poster template toggle */}
        <TouchableOpacity style={styles.posterToggle} onPress={() => setShowPoster(v => !v)}>
          <Text style={[styles.posterToggleText, { color: cfg.color }]}>
            {showPoster ? '▲' : '▼'} {t('qr.posterTemplate')}
          </Text>
        </TouchableOpacity>

        {showPoster && (
          <View style={styles.posterWrapper}>
            <PosterPreview businessName={MOCK_BUSINESS_NAME} qrType={selectedType} color={cfg.color} url={qrUrl} />
          </View>
        )}

        {/* Analytics */}
        <View style={styles.analyticsSection}>
          <Text style={styles.sectionLabel}>{t('qr.usageAnalytics')}</Text>
          {stats.totalScans === 0 ? (
            <Text style={styles.noScans}>{t('qr.noScans')}</Text>
          ) : (
            <View style={styles.statsRow}>
              <StatCard label={t('qr.totalScans')} value={stats.totalScans} />
              <StatCard label={t('qr.scansToday')} value={stats.scansToday} />
              <StatCard label={t('qr.scansThisWeek')} value={stats.scansThisWeek} />
            </View>
          )}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  scrollContent: { padding: 16 },
  screenTitle: { fontSize: 22, fontWeight: '800', color: '#111', textAlign: 'right', marginBottom: 16 },
  sectionLabel: { fontSize: 14, color: '#555', textAlign: 'right', marginBottom: 8, fontWeight: '600' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: BORDER, backgroundColor: SURFACE },
  typeChipEmoji: { fontSize: 16 },
  typeChipLabel: { fontSize: 13, color: '#444' },
  qrContainer: { alignItems: 'center', marginBottom: 20 },
  qrFrame: { borderWidth: 3, borderRadius: 16, overflow: 'hidden', padding: 12, backgroundColor: SURFACE },
  qrUrl: { marginTop: 10, fontSize: 12, color: '#888', textAlign: 'center', paddingHorizontal: 16 },
  actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 16, justifyContent: 'center', flexWrap: 'wrap' },
  actionBtn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10, minWidth: 110, alignItems: 'center' },
  actionBtnText: { color: SURFACE, fontWeight: '700', fontSize: 14 },
  actionBtnOutline: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: BORDER, minWidth: 90, alignItems: 'center' },
  actionBtnOutlineText: { fontWeight: '700', fontSize: 14 },
  posterToggle: { alignItems: 'center', paddingVertical: 10, marginBottom: 8 },
  posterToggleText: { fontSize: 14, fontWeight: '600' },
  posterWrapper: { alignItems: 'center', marginBottom: 16 },
  poster: { width: 240, borderWidth: 3, borderRadius: 12, overflow: 'hidden' },
  posterHeader: { paddingVertical: 12, alignItems: 'center' },
  posterEmoji: { fontSize: 28 },
  posterBusinessName: { color: SURFACE, fontWeight: '800', fontSize: 14, marginTop: 4, textAlign: 'center' },
  posterBody: { backgroundColor: SURFACE, alignItems: 'center', padding: 12, gap: 8 },
  posterScanText: { fontSize: 14, fontWeight: '700', color: '#111' },
  posterTypeLabel: { fontSize: 12, color: '#666' },
  analyticsSection: { marginTop: 8 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, backgroundColor: SURFACE, borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: BORDER },
  statValue: { fontSize: 22, fontWeight: '800', color: PRIMARY },
  statLabel: { fontSize: 11, color: '#666', textAlign: 'center', marginTop: 4 },
  noScans: { textAlign: 'center', color: '#999', paddingVertical: 12 },
});
