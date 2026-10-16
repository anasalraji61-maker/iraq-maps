/**
 * PaymentQRScreen — generate and share a payment QR code for a business.
 *
 * STUB PHASE — no real payment processing.
 * The QR is a static placeholder image. All payment flow is marked "قريبًا".
 *
 * Features:
 *  - Business name and "Scan to pay" banner
 *  - Fixed vs open-amount toggle
 *  - Amount input (IQD) + note field
 *  - Static QR placeholder image (SVG path drawn inline)
 *  - Accepted payment methods chips (cash, Zain Cash, Asia Hawala, QI Card, …)
 *  - Share QR via system Share sheet (screenshot-based stub)
 *  - Recent stub payments list with status chips
 *  - "Coming soon" ribbon on the QR image
 *
 * All user-visible text goes through t(). Layouts use start/end (RTL-safe).
 * Route: provider/payment-qr
 */
import { useCallback, useState, type ReactElement } from 'react';
import {
  Alert,
  I18nManager,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ─── Design tokens ────────────────────────────────────────────────────────────

const PRIMARY      = '#1976D2';
const PRIMARY_DARK = '#1565C0';
const ACCENT       = '#FF8F00';  // amber — "coming soon" ribbon
const SUCCESS      = '#2E7D32';
const WARNING      = '#F57F17';
const DANGER       = '#C62828';
const SURFACE      = '#FFFFFF';
const BG           = '#F5F5F5';
const BORDER       = '#E0E0E0';
const TEXT_MAIN    = '#212121';
const TEXT_SECOND  = '#616161';
const TEXT_HINT    = '#9E9E9E';
const CHIP_BG      = '#E3F2FD';

// ─── Types ────────────────────────────────────────────────────────────────────

type QrAmountType = 'fixed' | 'open';

type PaymentMethodKey =
  | 'method_cash'
  | 'method_zain_cash'
  | 'method_asia_hawala'
  | 'method_qi_card'
  | 'method_bank_transfer'
  | 'method_credit_card';

type MockPaymentStatus = 'pending' | 'completed' | 'failed';

interface MockPayment {
  id: string;
  labelKey: 'mockPayment1' | 'mockPayment2' | 'mockPayment3';
  amountIqd: number;
  status: MockPaymentStatus;
  date: string;
  methodKey: PaymentMethodKey;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAYMENT_METHODS: PaymentMethodKey[] = [
  'method_cash',
  'method_zain_cash',
  'method_asia_hawala',
  'method_qi_card',
  'method_bank_transfer',
  'method_credit_card',
];

const MOCK_PAYMENTS: MockPayment[] = [
  {
    id: 'p1',
    labelKey: 'mockPayment1',
    amountIqd: 25_000,
    status: 'completed',
    date: '2026-10-15',
    methodKey: 'method_cash',
  },
  {
    id: 'p2',
    labelKey: 'mockPayment2',
    amountIqd: 50_000,
    status: 'completed',
    date: '2026-10-14',
    methodKey: 'method_zain_cash',
  },
  {
    id: 'p3',
    labelKey: 'mockPayment3',
    amountIqd: 120_000,
    status: 'pending',
    date: '2026-10-13',
    methodKey: 'method_bank_transfer',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format IQD integer as Arabic-Indic digits with thousands separator. */
function fmtIqd(amount: number): string {
  const digits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  const s = Math.floor(amount).toString();
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += '٬';
    out += digits[parseInt(s[i]!, 10)];
  }
  return `${out} د.ع`;
}

function statusColor(s: MockPaymentStatus): string {
  if (s === 'completed') return SUCCESS;
  if (s === 'failed') return DANGER;
  return WARNING;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Inline SVG-like QR placeholder drawn with View boxes. */
function QrPlaceholder({ size }: { size: number }): ReactElement {
  const cell = Math.floor(size / 9);
  // A very rough QR-like pattern: three finder squares + some data cells
  const finderCells: [number, number][] = [
    [0,0],[0,1],[0,2],[0,3],[0,4],[0,5],[0,6],
    [1,0],[1,6],
    [2,0],[2,2],[2,3],[2,4],[2,6],
    [3,0],[3,2],[3,4],[3,6],
    [4,0],[4,2],[4,3],[4,4],[4,6],
    [5,0],[5,6],
    [6,0],[6,1],[6,2],[6,3],[6,4],[6,5],[6,6],
    // Bottom-left finder
    [0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],
    // Data dots (stub)
    [1,8],[2,7],[3,8],[4,7],[5,8],
    [7,1],[7,3],[7,5],[8,0],[8,2],[8,4],[8,6],
  ];

  return (
    <View style={{ width: size, height: size, backgroundColor: SURFACE, borderWidth: 2, borderColor: BORDER, borderRadius: 8, overflow: 'hidden' }}>
      {finderCells.map(([row, col]) => (
        <View
          key={`${row}-${col}`}
          style={{
            position: 'absolute',
            top: row * cell,
            start: col * cell,
            width: cell - 1,
            height: cell - 1,
            backgroundColor: TEXT_MAIN,
          }}
        />
      ))}
    </View>
  );
}

/** "Coming soon" amber ribbon overlaid on the QR. */
function ComingSoonRibbon(): ReactElement {
  return (
    <View pointerEvents="none" style={styles.ribbon}>
      <Text style={styles.ribbonText}>{t('paymentQr.comingSoon')}</Text>
    </View>
  );
}

/** A single accepted-payment-method chip. */
function MethodChip({ labelKey }: { labelKey: PaymentMethodKey }): ReactElement {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{t(`paymentQr.${labelKey}`)}</Text>
    </View>
  );
}

/** A row in the recent payments list. */
function PaymentRow({ item }: { item: MockPayment }): ReactElement {
  return (
    <View style={styles.paymentRow}>
      <View style={styles.paymentRowStart}>
        <Text style={styles.paymentLabel}>{t(`paymentQr.${item.labelKey}`)}</Text>
        <Text style={styles.paymentMeta}>
          {item.date} · {t(`paymentQr.${item.methodKey}`)}
        </Text>
      </View>
      <View style={styles.paymentRowEnd}>
        <Text style={styles.paymentAmount}>{fmtIqd(item.amountIqd)}</Text>
        <View style={[styles.statusChip, { backgroundColor: statusColor(item.status) + '22' }]}>
          <Text style={[styles.statusText, { color: statusColor(item.status) }]}>
            {item.status === 'completed'
              ? t('paymentQr.method_cash').slice(0, 1) === 'ن' // rough AR check
                ? 'مكتمل'
                : 'Completed'
              : item.status === 'pending'
              ? 'قيد المعالجة'
              : 'فشل'}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'qr' | 'methods' | 'recent';

function TabBar({ active, onPress }: { active: Tab; onPress: (t: Tab) => void }): ReactElement {
  const tabs: { id: Tab; key: 'tabQr' | 'tabMethods' | 'tabRecent' }[] = [
    { id: 'qr',      key: 'tabQr'      },
    { id: 'methods', key: 'tabMethods' },
    { id: 'recent',  key: 'tabRecent'  },
  ];
  return (
    <View style={styles.tabBar}>
      {tabs.map(tab => (
        <TouchableOpacity
          key={tab.id}
          style={[styles.tab, active === tab.id && styles.tabActive]}
          onPress={() => onPress(tab.id)}
          accessibilityRole="tab"
          accessibilityState={{ selected: active === tab.id }}
        >
          <Text style={[styles.tabText, active === tab.id && styles.tabTextActive]}>
            {t(`paymentQr.${tab.key}`)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PaymentQRScreen(): ReactElement {
  const [activeTab, setActiveTab] = useState<Tab>('qr');
  const [amountType, setAmountType] = useState<QrAmountType>('open');
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [sharing, setSharing] = useState(false);

  const businessName = 'نشاطي التجاري'; // In real app: from provider profile store

  const parsedAmount = parseInt(amountText.replace(/\D/g, ''), 10);
  const validAmount = !isNaN(parsedAmount) && parsedAmount > 0;

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleShare = useCallback(async () => {
    setSharing(true);
    try {
      const summary = amountType === 'fixed' && validAmount
        ? `${businessName} — ${fmtIqd(parsedAmount)}`
        : `${businessName} — ${t('paymentQr.openAmount')}`;

      await Share.share({
        message: `${t('paymentQr.scanToPayTitle')}\n${summary}\n${note ? note + '\n' : ''}[${t('paymentQr.comingSoon')}]`,
        title: t('paymentQr.title'),
      });
    } catch {
      Alert.alert(t('paymentQr.title'), t('paymentQr.comingSoon'));
    } finally {
      setSharing(false);
    }
  }, [amountType, validAmount, parsedAmount, note]);

  const handleSave = useCallback(() => {
    Alert.alert(t('paymentQr.saveQr'), t('paymentQr.comingSoonBanner'));
  }, []);

  const handlePrint = useCallback(() => {
    Alert.alert(t('paymentQr.printQr'), t('paymentQr.comingSoonBanner'));
  }, []);

  // ── Render sections ─────────────────────────────────────────────────────────

  const renderQrTab = (): ReactElement => (
    <ScrollView contentContainerStyle={styles.tabContent} keyboardShouldPersistTaps="handled">
      {/* Coming soon banner */}
      <View style={styles.comingSoonBanner}>
        <Text style={styles.comingSoonIcon}>🔒</Text>
        <Text style={styles.comingSoonBannerText}>{t('paymentQr.comingSoonBanner')}</Text>
      </View>

      {/* Business name */}
      <View style={styles.card}>
        <Text style={styles.businessNameLabel}>{t('paymentQr.businessName')}</Text>
        <Text style={styles.businessName}>{businessName}</Text>
      </View>

      {/* Amount type toggle */}
      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <Text style={styles.fieldLabel}>
            {amountType === 'fixed' ? t('paymentQr.qrTypeFixed') : t('paymentQr.qrTypeOpen')}
          </Text>
          <Switch
            value={amountType === 'fixed'}
            onValueChange={v => setAmountType(v ? 'fixed' : 'open')}
            trackColor={{ false: BORDER, true: PRIMARY }}
            thumbColor={SURFACE}
            accessibilityLabel={t('paymentQr.fixedAmount')}
          />
        </View>

        {amountType === 'fixed' && (
          <View style={styles.inputGroup}>
            <Text style={styles.fieldLabel}>{t('paymentQr.amount')}</Text>
            <TextInput
              style={styles.input}
              value={amountText}
              onChangeText={setAmountText}
              placeholder={t('paymentQr.amountPlaceholder')}
              placeholderTextColor={TEXT_HINT}
              keyboardType="numeric"
              textAlign={I18nManager.isRTL ? 'right' : 'left'}
              accessibilityLabel={t('paymentQr.amount')}
            />
          </View>
        )}

        <View style={styles.inputGroup}>
          <Text style={styles.fieldLabel}>{t('paymentQr.note')}</Text>
          <TextInput
            style={styles.input}
            value={note}
            onChangeText={setNote}
            placeholder={t('paymentQr.notePlaceholder')}
            placeholderTextColor={TEXT_HINT}
            maxLength={120}
            textAlign={I18nManager.isRTL ? 'right' : 'left'}
            accessibilityLabel={t('paymentQr.note')}
          />
        </View>
      </View>

      {/* QR code display */}
      <View style={styles.qrCard}>
        <Text style={styles.scanTitle}>{t('paymentQr.scanToPayTitle')}</Text>
        <Text style={styles.qrBusinessName}>{businessName}</Text>
        {amountType === 'fixed' && validAmount && (
          <Text style={styles.qrAmount}>{fmtIqd(parsedAmount)}</Text>
        )}
        {amountType === 'open' && (
          <Text style={styles.qrAmountOpen}>{t('paymentQr.openAmount')}</Text>
        )}
        {note.length > 0 && (
          <Text style={styles.qrNote}>{note}</Text>
        )}

        {/* QR placeholder with coming-soon ribbon */}
        <View style={styles.qrWrapper}>
          <QrPlaceholder size={200} />
          <ComingSoonRibbon />
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnPrimary]}
          onPress={handleShare}
          disabled={sharing}
          accessibilityRole="button"
          accessibilityLabel={t('paymentQr.shareQr')}
        >
          <Text style={styles.actionBtnTextPrimary}>{t('paymentQr.shareQr')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnSecondary]}
          onPress={handleSave}
          accessibilityRole="button"
          accessibilityLabel={t('paymentQr.saveQr')}
        >
          <Text style={styles.actionBtnTextSecondary}>{t('paymentQr.saveQr')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnSecondary]}
          onPress={handlePrint}
          accessibilityRole="button"
          accessibilityLabel={t('paymentQr.printQr')}
        >
          <Text style={styles.actionBtnTextSecondary}>{t('paymentQr.printQr')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderMethodsTab = (): ReactElement => (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('paymentQr.paymentMethods')}</Text>
        <Text style={styles.sectionSubtitle}>{t('paymentQr.comingSoon')}</Text>
        <View style={styles.chipsGrid}>
          {PAYMENT_METHODS.map(m => (
            <MethodChip key={m} labelKey={m} />
          ))}
        </View>
      </View>

      <View style={[styles.card, styles.comingSoonCard]}>
        <Text style={styles.comingSoonCardTitle}>{t('paymentQr.comingSoon')}</Text>
        <Text style={styles.comingSoonCardBody}>{t('paymentQr.comingSoonBanner')}</Text>
      </View>
    </ScrollView>
  );

  const renderRecentTab = (): ReactElement => (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('paymentQr.recentPayments')}</Text>
        {MOCK_PAYMENTS.length === 0 ? (
          <Text style={styles.emptyText}>{t('paymentQr.noRecentPayments')}</Text>
        ) : (
          MOCK_PAYMENTS.map(p => <PaymentRow key={p.id} item={p} />)
        )}
      </View>
    </ScrollView>
  );

  // ── Main render ─────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('paymentQr.title')}</Text>
        <Text style={styles.headerSubtitle}>{t('paymentQr.subtitle')}</Text>
      </View>

      {/* Tabs */}
      <TabBar active={activeTab} onPress={setActiveTab} />

      {/* Content */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {activeTab === 'qr'      && renderQrTab()}
        {activeTab === 'methods' && renderMethodsTab()}
        {activeTab === 'recent'  && renderRecentTab()}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
  },
  flex: { flex: 1 },

  // Header
  header: {
    backgroundColor: PRIMARY,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: SURFACE,
    textAlign: 'left', // We use writing-direction for RTL, not 'right'
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    backgroundColor: SURFACE,
    borderBottomWidth: 1,
    borderColor: BORDER,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: PRIMARY,
  },
  tabText: {
    fontSize: 13,
    color: TEXT_SECOND,
  },
  tabTextActive: {
    color: PRIMARY,
    fontWeight: '600',
  },

  // Tab content
  tabContent: {
    padding: 16,
    gap: 12,
  },

  // Card
  card: {
    backgroundColor: SURFACE,
    borderRadius: 12,
    padding: 16,
    marginBottom: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },

  // Coming soon banner (inline info box)
  comingSoonBanner: {
    flexDirection: 'row',
    backgroundColor: '#FFF8E1',
    borderRadius: 10,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#FFE082',
    alignItems: 'flex-start',
  },
  comingSoonIcon: { fontSize: 16 },
  comingSoonBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#5D4037',
    lineHeight: 20,
  },

  // Business name card
  businessNameLabel: {
    fontSize: 12,
    color: TEXT_HINT,
    marginBottom: 4,
  },
  businessName: {
    fontSize: 18,
    fontWeight: '700',
    color: TEXT_MAIN,
  },

  // Amount toggle
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 14,
    color: TEXT_SECOND,
    marginBottom: 4,
  },
  inputGroup: {
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: TEXT_MAIN,
    backgroundColor: BG,
  },

  // QR card
  qrCard: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  scanTitle: {
    fontSize: 14,
    color: TEXT_SECOND,
    marginBottom: 4,
  },
  qrBusinessName: {
    fontSize: 20,
    fontWeight: '800',
    color: TEXT_MAIN,
    marginBottom: 4,
    textAlign: 'center',
  },
  qrAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: PRIMARY_DARK,
    marginBottom: 4,
  },
  qrAmountOpen: {
    fontSize: 14,
    color: TEXT_HINT,
    marginBottom: 4,
    fontStyle: 'italic',
  },
  qrNote: {
    fontSize: 13,
    color: TEXT_SECOND,
    marginBottom: 12,
    textAlign: 'center',
  },

  // QR wrapper (relative container for ribbon overlay)
  qrWrapper: {
    marginTop: 8,
    position: 'relative',
    width: 200,
    height: 200,
  },
  // Coming soon ribbon across the QR image
  ribbon: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  ribbonText: {
    fontSize: 18,
    fontWeight: '800',
    color: ACCENT,
    letterSpacing: 1,
  },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  actionBtn: {
    flex: 1,
    minWidth: 100,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  actionBtnPrimary: {
    backgroundColor: PRIMARY,
  },
  actionBtnSecondary: {
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: PRIMARY,
  },
  actionBtnTextPrimary: {
    color: SURFACE,
    fontWeight: '600',
    fontSize: 14,
  },
  actionBtnTextSecondary: {
    color: PRIMARY,
    fontWeight: '600',
    fontSize: 14,
  },

  // Methods tab chips
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT_MAIN,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: ACCENT,
    fontWeight: '600',
    marginBottom: 12,
  },
  chipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: CHIP_BG,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    fontSize: 13,
    color: PRIMARY_DARK,
    fontWeight: '500',
  },

  // Coming soon card (methods tab)
  comingSoonCard: {
    backgroundColor: '#FFF8E1',
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  comingSoonCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: ACCENT,
    marginBottom: 6,
  },
  comingSoonCardBody: {
    fontSize: 13,
    color: '#5D4037',
    lineHeight: 20,
  },

  // Recent payments list
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: BORDER,
  },
  paymentRowStart: {
    flex: 1,
    marginEnd: 8,
  },
  paymentRowEnd: {
    alignItems: 'flex-end',
  },
  paymentLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: TEXT_MAIN,
  },
  paymentMeta: {
    fontSize: 12,
    color: TEXT_HINT,
    marginTop: 2,
  },
  paymentAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: PRIMARY_DARK,
  },
  statusChip: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 14,
    color: TEXT_HINT,
    textAlign: 'center',
    paddingVertical: 24,
  },
});
