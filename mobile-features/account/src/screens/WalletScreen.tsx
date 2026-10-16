/**
 * WalletScreen — user wallet and payment management.
 *
 * STUB PHASE — no real payment processing. All actions show "قريبًا" notices.
 *
 * Features:
 *  - Balance card with IQD + USD toggle (placeholder amounts)
 *  - On-hold balance indicator
 *  - Quick-action buttons: Top Up, Send (both stub)
 *  - Payment methods list (Cash, Zain Cash, Asia Hawala, QI Card, Bank Transfer, Credit Card)
 *  - Add payment method stub form (card details input, read-only notice)
 *  - Recent transactions list with type/status chips (mock data)
 *  - Full transaction history stub
 *  - "Coming soon" ribbon on balance card
 *
 * All user-visible text goes through t(). Layouts use start/end (RTL-safe).
 * Route: account/wallet
 */
import { useCallback, useState, type ReactElement } from 'react';
import {
  Alert,
  FlatList,
  I18nManager,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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

// ─── Design tokens ────────────────────────────────────────────────────────────

const PRIMARY      = '#1976D2';
const PRIMARY_DARK = '#1565C0';
const ACCENT       = '#FF8F00';
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
const HELD_BG      = '#FFF3E0';
const HELD_TEXT    = '#E65100';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'balance' | 'methods' | 'history';

type TxType = 'credit' | 'debit' | 'hold' | 'release' | 'refund';
type TxStatus = 'pending' | 'completed' | 'failed' | 'reversed';

interface MockTransaction {
  id: string;
  type: TxType;
  status: TxStatus;
  amountIqd: number;
  descriptionKey: 'mockTx1' | 'mockTx2' | 'mockTx3' | 'mockTx4';
  createdAt: string;
}

type SavedMethodType = 'card' | 'wallet' | 'cash_on_delivery';

interface SavedMethod {
  id: string;
  type: SavedMethodType;
  isDefault: boolean;
  label: string;
  sublabel?: string;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_BALANCE_IQD = 750_000;
const MOCK_HELD_IQD    = 50_000;
const USD_RATE         = 1_310; // 1 USD = 1310 IQD (illustrative, not live)

const MOCK_TRANSACTIONS: MockTransaction[] = [
  { id: 't1', type: 'debit',  status: 'completed', amountIqd: 25_000,  descriptionKey: 'mockTx1', createdAt: '2026-10-15T14:30:00Z' },
  { id: 't2', type: 'credit', status: 'completed', amountIqd: 200_000, descriptionKey: 'mockTx2', createdAt: '2026-10-14T09:00:00Z' },
  { id: 't3', type: 'refund', status: 'completed', amountIqd: 15_000,  descriptionKey: 'mockTx3', createdAt: '2026-10-13T18:45:00Z' },
  { id: 't4', type: 'debit',  status: 'completed', amountIqd: 8_500,   descriptionKey: 'mockTx4', createdAt: '2026-10-12T11:10:00Z' },
];

const MOCK_METHODS: SavedMethod[] = [
  { id: 'm1', type: 'wallet',           isDefault: true,  label: t('walletScreen.method_wallet')   },
  { id: 'm2', type: 'cash_on_delivery', isDefault: false, label: t('walletScreen.method_cod')      },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format IQD integer with Arabic-Indic digits and thousands separator. */
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

/** Format IQD as approximate USD (illustrative only). */
function fmtUsd(iqd: number): string {
  const usd = iqd / USD_RATE;
  return `$${usd.toFixed(2)}`;
}

function txTypeColor(type: TxType): string {
  if (type === 'credit' || type === 'refund' || type === 'release') return SUCCESS;
  if (type === 'hold') return WARNING;
  return DANGER;
}

function txStatusColor(s: TxStatus): string {
  if (s === 'completed') return SUCCESS;
  if (s === 'failed' || s === 'reversed') return DANGER;
  return WARNING;
}

function txSign(type: TxType): '+' | '-' | '' {
  if (type === 'credit' || type === 'refund' || type === 'release') return '+';
  if (type === 'debit'  || type === 'hold')                         return '-';
  return '';
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ar-IQ', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Large balance card with IQD/USD toggle and coming-soon overlay. */
function BalanceCard({ showUsd, onToggle }: { showUsd: boolean; onToggle: () => void }): ReactElement {
  const available = MOCK_BALANCE_IQD - MOCK_HELD_IQD;

  return (
    <View style={styles.balanceCard}>
      {/* Coming soon ribbon */}
      <View style={styles.balanceRibbon}>
        <Text style={styles.balanceRibbonText}>{t('walletScreen.comingSoon')}</Text>
      </View>

      <Text style={styles.balanceLabel}>{t('walletScreen.availableBalance')}</Text>
      <Text style={styles.balanceAmount}>
        {showUsd ? fmtUsd(available) : fmtIqd(available)}
      </Text>

      {/* Held amount row */}
      <View style={styles.heldRow}>
        <View style={styles.heldBadge}>
          <Text style={styles.heldBadgeText}>{t('walletScreen.heldBalance')}</Text>
        </View>
        <Text style={styles.heldAmount}>
          {showUsd ? fmtUsd(MOCK_HELD_IQD) : fmtIqd(MOCK_HELD_IQD)}
        </Text>
      </View>

      {/* Currency toggle */}
      <TouchableOpacity
        style={styles.currencyToggle}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={showUsd ? t('walletScreen.switchCurrencyIqd') : t('walletScreen.switchCurrency')}
      >
        <Text style={styles.currencyToggleText}>
          {showUsd ? t('walletScreen.switchCurrencyIqd') : t('walletScreen.switchCurrency')}
        </Text>
      </TouchableOpacity>

      {/* Quick actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.quickActionBtn}
          onPress={() => Alert.alert(t('walletScreen.topUp'), t('walletScreen.topUpComingSoon'))}
          accessibilityRole="button"
          accessibilityLabel={t('walletScreen.topUp')}
        >
          <Text style={styles.quickActionIcon}>＋</Text>
          <Text style={styles.quickActionLabel}>{t('walletScreen.topUp')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.quickActionBtn}
          onPress={() => Alert.alert(t('walletScreen.send'), t('walletScreen.sendComingSoon'))}
          accessibilityRole="button"
          accessibilityLabel={t('walletScreen.send')}
        >
          <Text style={styles.quickActionIcon}>→</Text>
          <Text style={styles.quickActionLabel}>{t('walletScreen.send')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** A single transaction row in the history list. */
function TransactionRow({ item }: { item: MockTransaction }): ReactElement {
  const sign = txSign(item.type);
  const amtColor = item.type === 'credit' || item.type === 'refund' ? SUCCESS : TEXT_MAIN;

  return (
    <View style={styles.txRow}>
      <View style={[styles.txTypeIndicator, { backgroundColor: txTypeColor(item.type) + '22' }]}>
        <Text style={[styles.txTypeIndicatorText, { color: txTypeColor(item.type) }]}>
          {sign || '·'}
        </Text>
      </View>

      <View style={styles.txMain}>
        <Text style={styles.txDesc}>{t(`walletScreen.${item.descriptionKey}`)}</Text>
        <View style={styles.txMeta}>
          <Text style={styles.txDate}>{fmtDate(item.createdAt)}</Text>
          <View style={[styles.txStatusChip, { backgroundColor: txStatusColor(item.status) + '22' }]}>
            <Text style={[styles.txStatusText, { color: txStatusColor(item.status) }]}>
              {t(`walletScreen.status${item.status.charAt(0).toUpperCase()}${item.status.slice(1)}` as 'walletScreen.statusCompleted')}
            </Text>
          </View>
        </View>
      </View>

      <Text style={[styles.txAmount, { color: amtColor }]}>
        {sign}{fmtIqd(item.amountIqd)}
      </Text>
    </View>
  );
}

/** A saved payment method row. */
function MethodRow({
  item,
  onRemove,
  onSetDefault,
}: {
  item: SavedMethod;
  onRemove: (id: string) => void;
  onSetDefault: (id: string) => void;
}): ReactElement {
  return (
    <View style={styles.methodRow}>
      <View style={styles.methodMain}>
        <Text style={styles.methodLabel}>{item.label}</Text>
        {item.sublabel && (
          <Text style={styles.methodSublabel}>{item.sublabel}</Text>
        )}
        {item.isDefault && (
          <View style={styles.defaultBadge}>
            <Text style={styles.defaultBadgeText}>{t('walletScreen.defaultBadge')}</Text>
          </View>
        )}
      </View>
      <View style={styles.methodActions}>
        {!item.isDefault && (
          <TouchableOpacity
            onPress={() => onSetDefault(item.id)}
            style={styles.methodActionBtn}
            accessibilityRole="button"
            accessibilityLabel={t('walletScreen.setDefault')}
          >
            <Text style={styles.methodActionText}>{t('walletScreen.setDefault')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => {
            Alert.alert(
              t('walletScreen.remove'),
              t('walletScreen.removeConfirm'),
              [
                { text: 'إلغاء', style: 'cancel' },
                { text: t('walletScreen.remove'), style: 'destructive', onPress: () => onRemove(item.id) },
              ],
            );
          }}
          style={styles.methodActionBtn}
          accessibilityRole="button"
          accessibilityLabel={t('walletScreen.remove')}
        >
          <Text style={[styles.methodActionText, { color: DANGER }]}>{t('walletScreen.remove')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** Modal form for adding a new payment method (stub — no real processing). */
function AddMethodModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}): ReactElement {
  const [cardLast4, setCardLast4]   = useState('');
  const [expiry, setExpiry]         = useState('');
  const [holder, setHolder]         = useState('');

  const handleSubmit = (): void => {
    Alert.alert(t('walletScreen.addMethod'), t('walletScreen.addCardComingSoon'));
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalSafe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.modalContent}>
            {/* Modal header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('walletScreen.addMethod')}</Text>
              <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="إغلاق">
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Coming soon notice */}
            <View style={styles.comingSoonNotice}>
              <Text style={styles.comingSoonNoticeText}>
                {t('walletScreen.addCardComingSoon')}
              </Text>
            </View>

            {/* Card form (read-only stub) */}
            <Text style={styles.formGroupLabel}>{t('walletScreen.method_card')}</Text>

            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>{t('payment.cardEnding')}</Text>
              <TextInput
                style={[styles.input, styles.inputDisabled]}
                value={cardLast4}
                onChangeText={t => setCardLast4(t.replace(/\D/g, '').slice(0, 4))}
                placeholder="XXXX"
                placeholderTextColor={TEXT_HINT}
                keyboardType="numeric"
                maxLength={4}
                editable={false}
                textAlign="center"
              />
            </View>

            <View style={styles.formRow}>
              <View style={[styles.formGroup, styles.flex]}>
                <Text style={styles.fieldLabel}>{t('payment.expires')}</Text>
                <TextInput
                  style={[styles.input, styles.inputDisabled]}
                  value={expiry}
                  onChangeText={setExpiry}
                  placeholder="MM/YY"
                  placeholderTextColor={TEXT_HINT}
                  keyboardType="numeric"
                  maxLength={5}
                  editable={false}
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={[styles.formGroup, styles.flex]}>
                <Text style={styles.fieldLabel}>{t('payment.addCardNote')}</Text>
                <TextInput
                  style={[styles.input, styles.inputDisabled]}
                  value={holder}
                  onChangeText={setHolder}
                  placeholder="الاسم"
                  placeholderTextColor={TEXT_HINT}
                  editable={false}
                />
              </View>
            </View>

            {/* Payment method chips */}
            <Text style={styles.formGroupLabel}>{t('walletScreen.paymentMethods')}</Text>
            <View style={styles.methodChipsRow}>
              {(['method_cash', 'method_zain_cash', 'method_asia_hawala', 'method_qi_card'] as const).map(m => (
                <View key={m} style={styles.methodChip}>
                  <Text style={styles.methodChipText}>{t(`walletScreen.${m}`)}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleSubmit}
              accessibilityRole="button"
            >
              <Text style={styles.submitBtnText}>{t('walletScreen.addMethod')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function WalletScreen(): ReactElement {
  const [activeTab, setActiveTab]     = useState<Tab>('balance');
  const [showUsd, setShowUsd]         = useState(false);
  const [methods, setMethods]         = useState<SavedMethod[]>(MOCK_METHODS);
  const [addModalVisible, setAddModal] = useState(false);

  const handleRemoveMethod = useCallback((id: string) => {
    setMethods(prev => prev.filter(m => m.id !== id));
  }, []);

  const handleSetDefault = useCallback((id: string) => {
    setMethods(prev => prev.map(m => ({ ...m, isDefault: m.id === id })));
  }, []);

  // ── Tabs ────────────────────────────────────────────────────────────────────

  const tabs: { id: Tab; key: 'tabBalance' | 'tabMethods' | 'tabHistory' }[] = [
    { id: 'balance',  key: 'tabBalance'  },
    { id: 'methods',  key: 'tabMethods'  },
    { id: 'history',  key: 'tabHistory'  },
  ];

  // ── Tab renderers ───────────────────────────────────────────────────────────

  const renderBalanceTab = (): ReactElement => (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <BalanceCard showUsd={showUsd} onToggle={() => setShowUsd(v => !v)} />

      {/* Coming soon banner */}
      <View style={styles.comingSoonBanner}>
        <Text style={styles.comingSoonBannerTitle}>{t('walletScreen.comingSoon')}</Text>
        <Text style={styles.comingSoonBannerBody}>{t('walletScreen.comingSoonBanner')}</Text>
      </View>

      {/* Mini-preview of latest transaction */}
      {MOCK_TRANSACTIONS.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('walletScreen.recentTransactions')}</Text>
          {MOCK_TRANSACTIONS.slice(0, 3).map(tx => (
            <TransactionRow key={tx.id} item={tx} />
          ))}
          <TouchableOpacity
            style={styles.viewAllBtn}
            onPress={() => setActiveTab('history')}
            accessibilityRole="button"
          >
            <Text style={styles.viewAllText}>{t('walletScreen.allTransactions')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );

  const renderMethodsTab = (): ReactElement => (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('walletScreen.paymentMethods')}</Text>
          <TouchableOpacity
            onPress={() => setAddModal(true)}
            style={styles.addBtn}
            accessibilityRole="button"
            accessibilityLabel={t('walletScreen.addMethod')}
          >
            <Text style={styles.addBtnText}>＋ {t('walletScreen.addMethod')}</Text>
          </TouchableOpacity>
        </View>

        {methods.length === 0 ? (
          <Text style={styles.emptyText}>{t('walletScreen.noMethods')}</Text>
        ) : (
          methods.map(m => (
            <MethodRow
              key={m.id}
              item={m}
              onRemove={handleRemoveMethod}
              onSetDefault={handleSetDefault}
            />
          ))
        )}
      </View>

      {/* Available methods info */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('walletScreen.paymentMethods')}</Text>
        <Text style={styles.sectionSubtitle}>{t('walletScreen.comingSoon')}</Text>
        <View style={styles.methodChipsRow}>
          {(
            [
              'method_cash',
              'method_zain_cash',
              'method_asia_hawala',
              'method_qi_card',
              'method_bank_transfer',
              'method_credit_card',
            ] as const
          ).map(m => (
            <View key={m} style={styles.methodChip}>
              <Text style={styles.methodChipText}>{t(`walletScreen.${m}`)}</Text>
            </View>
          ))}
        </View>
      </View>

      <AddMethodModal visible={addModalVisible} onClose={() => setAddModal(false)} />
    </ScrollView>
  );

  const renderHistoryTab = (): ReactElement => (
    <FlatList
      data={MOCK_TRANSACTIONS}
      keyExtractor={tx => tx.id}
      contentContainerStyle={styles.tabContent}
      ListHeaderComponent={
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('walletScreen.allTransactions')}</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <TransactionRow item={item} />
        </View>
      )}
      ListEmptyComponent={
        <Text style={styles.emptyText}>{t('walletScreen.noTransactions')}</Text>
      }
    />
  );

  // ── Main render ─────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('walletScreen.title')}</Text>
        <Text style={styles.headerSubtitle}>{t('walletScreen.subtitle')}</Text>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
            onPress={() => setActiveTab(tab.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === tab.id }}
          >
            <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
              {t(`walletScreen.${tab.key}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {activeTab === 'balance' && renderBalanceTab()}
      {activeTab === 'methods' && renderMethodsTab()}
      {activeTab === 'history' && renderHistoryTab()}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
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
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },

  // Tab bar
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
  tabText: { fontSize: 13, color: TEXT_SECOND },
  tabTextActive: { color: PRIMARY, fontWeight: '600' },

  // Tab content
  tabContent: {
    padding: 16,
    gap: 12,
  },

  // Balance card
  balanceCard: {
    backgroundColor: PRIMARY,
    borderRadius: 16,
    padding: 20,
    overflow: 'hidden',
  },
  balanceRibbon: {
    position: 'absolute',
    top: 10,
    end: 12,
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  balanceRibbonText: {
    color: SURFACE,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    marginBottom: 6,
  },
  balanceAmount: {
    color: SURFACE,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 8,
  },

  // Held
  heldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  heldBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  heldBadgeText: { color: 'rgba(255,255,255,0.9)', fontSize: 11 },
  heldAmount: { color: 'rgba(255,255,255,0.75)', fontSize: 14 },

  // Currency toggle
  currencyToggle: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 16,
  },
  currencyToggleText: { color: SURFACE, fontSize: 13, fontWeight: '500' },

  // Quick action buttons
  quickActions: {
    flexDirection: 'row',
    gap: 10,
  },
  quickActionBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 4,
  },
  quickActionIcon: { color: SURFACE, fontSize: 20 },
  quickActionLabel: { color: SURFACE, fontSize: 13, fontWeight: '600' },

  // Generic card
  card: {
    backgroundColor: SURFACE,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },

  // Coming soon banner
  comingSoonBanner: {
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  comingSoonBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: ACCENT,
    marginBottom: 4,
  },
  comingSoonBannerBody: {
    fontSize: 13,
    color: '#5D4037',
    lineHeight: 20,
  },

  // Section header with add button
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT_MAIN,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: ACCENT,
    fontWeight: '600',
    marginBottom: 10,
  },

  // Add button
  addBtn: {
    backgroundColor: CHIP_BG,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  addBtnText: { color: PRIMARY, fontSize: 13, fontWeight: '600' },

  // View all link
  viewAllBtn: {
    marginTop: 10,
    alignItems: 'center',
  },
  viewAllText: { color: PRIMARY, fontSize: 13, fontWeight: '600' },

  // Transaction row
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: BORDER,
    gap: 10,
  },
  txTypeIndicator: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  txTypeIndicatorText: {
    fontSize: 18,
    fontWeight: '700',
  },
  txMain: { flex: 1 },
  txDesc: { fontSize: 14, fontWeight: '600', color: TEXT_MAIN },
  txMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  txDate: { fontSize: 12, color: TEXT_HINT },
  txStatusChip: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  txStatusText: { fontSize: 11, fontWeight: '600' },
  txAmount: { fontSize: 14, fontWeight: '700' },

  // Method rows
  methodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: BORDER,
    gap: 8,
  },
  methodMain: { flex: 1 },
  methodLabel: { fontSize: 15, fontWeight: '600', color: TEXT_MAIN },
  methodSublabel: { fontSize: 12, color: TEXT_HINT, marginTop: 2 },
  defaultBadge: {
    marginTop: 4,
    alignSelf: 'flex-start',
    backgroundColor: PRIMARY + '22',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  defaultBadgeText: { fontSize: 11, color: PRIMARY, fontWeight: '600' },
  methodActions: { flexDirection: 'row', gap: 8 },
  methodActionBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  methodActionText: { fontSize: 12, color: PRIMARY, fontWeight: '500' },

  // Method chips
  methodChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  methodChip: {
    backgroundColor: CHIP_BG,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  methodChipText: { fontSize: 13, color: PRIMARY_DARK, fontWeight: '500' },

  // Form inside modal
  formGroupLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: TEXT_MAIN,
    marginTop: 16,
    marginBottom: 8,
  },
  formGroup: { marginBottom: 12 },
  formRow: { flexDirection: 'row' },
  fieldLabel: { fontSize: 12, color: TEXT_HINT, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: TEXT_MAIN,
    backgroundColor: SURFACE,
  },
  inputDisabled: { backgroundColor: BG, color: TEXT_HINT },

  submitBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  submitBtnText: { color: SURFACE, fontWeight: '700', fontSize: 16 },

  emptyText: {
    fontSize: 14,
    color: TEXT_HINT,
    textAlign: 'center',
    paddingVertical: 24,
  },

  // Modal
  modalSafe: { flex: 1, backgroundColor: SURFACE },
  modalContent: { padding: 16 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderColor: BORDER,
    marginBottom: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: TEXT_MAIN },
  modalClose: { fontSize: 18, color: TEXT_SECOND, paddingHorizontal: 4 },

  // Coming soon notice inside modal
  comingSoonNotice: {
    backgroundColor: '#FFF8E1',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  comingSoonNoticeText: {
    fontSize: 13,
    color: '#5D4037',
    lineHeight: 20,
  },
});
