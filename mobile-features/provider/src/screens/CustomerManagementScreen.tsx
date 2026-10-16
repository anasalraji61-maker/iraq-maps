/**
 * CustomerManagementScreen — manage customers who visited or messaged.
 *
 * Features:
 *   • Customer list with visit history, message thread, reviews
 *   • Tag customers: VIP / regular / first-visit
 *   • Private notes per customer
 *   • Message blast to tagged customers (consent-gated)
 *   • Customer stats: repeat visit rate, average spend
 *
 * All text via t(). RTL-safe (start/end, never left/right).
 * Provider data is sensitive — no raw identifiers are displayed.
 */

import {
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
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
import { SkeletonBlock } from '../skeleton';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ─── Palette ──────────────────────────────────────────────────────────────────

const C = {
  primary:     '#1976D2',
  primaryLight:'#E3F2FD',
  success:     '#10B981',
  successBg:   '#ECFDF5',
  warning:     '#F59E0B',
  warningBg:   '#FFFBEB',
  danger:      '#EF4444',
  dangerBg:    '#FEF2F2',
  purple:      '#7C3AED',
  purpleBg:    '#F5F3FF',
  gold:        '#D97706',
  goldBg:      '#FFFBEB',
  bg:          '#F5F7FA',
  card:        '#FFFFFF',
  text:        '#1A202C',
  textMuted:   '#718096',
  border:      '#E2E8F0',
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

type CustomerTag = 'vip' | 'regular' | 'first_visit' | 'none';

interface Customer {
  id: string;
  /** Anonymised display initial — never a real name */
  initial: string;
  tag: CustomerTag;
  visitCount: number;
  lastVisitDaysAgo: number;
  avgSpend: number;
  currency: string;
  rating?: number;       // rating they gave us (if any)
  hasReview: boolean;
  hasMessageThread: boolean;
  privateNote?: string;
  consentBlast: boolean; // has opted in to promotional messages
}

interface CustomerStats {
  total: number;
  repeatRate: number;   // %
  avgSpend: number;
  currency: string;
  newThisMonth: number;
  vipCount: number;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

function buildMockCustomers(): Customer[] {
  return [
    { id: 'c1', initial: 'أ', tag: 'vip', visitCount: 12, lastVisitDaysAgo: 1, avgSpend: 45_000, currency: 'د.ع', rating: 5, hasReview: true, hasMessageThread: true, consentBlast: true, privateNote: 'يفضل التواصل عبر واتساب' },
    { id: 'c2', initial: 'م', tag: 'regular', visitCount: 6, lastVisitDaysAgo: 5, avgSpend: 30_000, currency: 'د.ع', rating: 4, hasReview: false, hasMessageThread: true, consentBlast: true },
    { id: 'c3', initial: 'س', tag: 'first_visit', visitCount: 1, lastVisitDaysAgo: 2, avgSpend: 20_000, currency: 'د.ع', hasReview: false, hasMessageThread: false, consentBlast: false },
    { id: 'c4', initial: 'ن', tag: 'vip', visitCount: 18, lastVisitDaysAgo: 0, avgSpend: 75_000, currency: 'د.ع', rating: 5, hasReview: true, hasMessageThread: true, consentBlast: true },
    { id: 'c5', initial: 'ع', tag: 'regular', visitCount: 4, lastVisitDaysAgo: 8, avgSpend: 25_000, currency: 'د.ع', hasReview: false, hasMessageThread: false, consentBlast: true },
    { id: 'c6', initial: 'ف', tag: 'none', visitCount: 2, lastVisitDaysAgo: 14, avgSpend: 18_000, currency: 'د.ع', rating: 3, hasReview: true, hasMessageThread: false, consentBlast: false },
    { id: 'c7', initial: 'ي', tag: 'regular', visitCount: 7, lastVisitDaysAgo: 3, avgSpend: 35_000, currency: 'د.ع', hasReview: false, hasMessageThread: true, consentBlast: true },
  ];
}

function buildMockStats(): CustomerStats {
  return { total: 128, repeatRate: 62, avgSpend: 32_000, currency: 'د.ع', newThisMonth: 14, vipCount: 9 };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TAG_CONFIG: Record<CustomerTag, { labelKey: string; color: string; bg: string }> = {
  vip:        { labelKey: 'customerMgmt.tagVip', color: C.gold, bg: C.goldBg },
  regular:    { labelKey: 'customerMgmt.tagRegular', color: C.primary, bg: C.primaryLight },
  first_visit:{ labelKey: 'customerMgmt.tagFirstVisit', color: C.success, bg: C.successBg },
  none:       { labelKey: 'customerMgmt.tagNone', color: C.textMuted, bg: C.bg },
};

function TagChip({ tag }: { tag: CustomerTag }): ReactElement {
  const cfg = TAG_CONFIG[tag];
  return (
    <View style={[ss.tagChip, { backgroundColor: cfg.bg }]}>
      <Text style={[ss.tagChipText, { color: cfg.color }]}>
        {t(cfg.labelKey as Parameters<typeof t>[0])}
      </Text>
    </View>
  );
}

function StarsDisplay({ rating }: { rating: number }): ReactElement {
  const full = Math.round(rating);
  const color = full <= 2 ? C.danger : full === 3 ? C.warning : C.gold;
  return (
    <Text style={[ss.starsText, { color }]}>
      {'★'.repeat(full)}{'☆'.repeat(5 - full)}
    </Text>
  );
}

// ─── Stats row ────────────────────────────────────────────────────────────────

function StatsRow({ stats }: { stats: CustomerStats }): ReactElement {
  const tiles = [
    { icon: '👥', value: String(stats.total), label: t('customerMgmt.statsTotal') },
    { icon: '🔄', value: `${stats.repeatRate}%`, label: t('customerMgmt.statsRepeat') },
    { icon: '💰', value: `${(stats.avgSpend / 1000).toFixed(0)}K`, label: t('customerMgmt.statsAvgSpend') },
    { icon: '🌟', value: String(stats.vipCount), label: t('customerMgmt.statsVip') },
  ];
  return (
    <View style={ss.statsRow}>
      {tiles.map(tile => (
        <View key={tile.label} style={ss.statsTile}>
          <Text style={ss.statsTileIcon}>{tile.icon}</Text>
          <Text style={ss.statsTileValue}>{tile.value}</Text>
          <Text style={ss.statsTileLabel}>{tile.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Customer row ─────────────────────────────────────────────────────────────

function CustomerRow({
  customer,
  onPress,
}: {
  customer: Customer;
  onPress: () => void;
}): ReactElement {
  return (
    <TouchableOpacity style={ss.customerRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[ss.customerAvatar, { backgroundColor: customer.tag === 'vip' ? C.goldBg : C.primaryLight }]}>
        <Text style={[ss.customerInitial, { color: customer.tag === 'vip' ? C.gold : C.primary }]}>
          {customer.initial}
        </Text>
        {customer.tag === 'vip' && <Text style={ss.vipCrown}>👑</Text>}
      </View>

      <View style={ss.customerInfo}>
        <View style={ss.customerTopRow}>
          <Text style={ss.customerLabel}>
            {t('customerMgmt.customerLabel', { n: customer.id })}
          </Text>
          <TagChip tag={customer.tag} />
        </View>
        <View style={ss.customerMeta}>
          <Text style={ss.customerMetaText}>
            {t('customers.visitCount', { n: customer.visitCount })}
          </Text>
          <Text style={ss.metaDot}>·</Text>
          <Text style={ss.customerMetaText}>
            {customer.lastVisitDaysAgo === 0
              ? t('inbox.timeJustNow')
              : t('customers.lastSeen', { n: customer.lastVisitDaysAgo })}
          </Text>
        </View>
        <View style={ss.customerMeta}>
          <Text style={ss.customerMetaText}>
            {t('customerMgmt.avgSpend', { amount: customer.avgSpend.toLocaleString('ar-IQ'), currency: customer.currency })}
          </Text>
          {customer.rating !== undefined && (
            <>
              <Text style={ss.metaDot}>·</Text>
              <StarsDisplay rating={customer.rating} />
            </>
          )}
        </View>
      </View>

      <View style={ss.customerIcons}>
        {customer.hasMessageThread && <Text style={ss.iconBubble}>💬</Text>}
        {customer.hasReview && <Text style={ss.iconBubble}>⭐</Text>}
        {customer.consentBlast && <Text style={ss.iconBubble}>📣</Text>}
      </View>

      <Text style={ss.chevron}>›</Text>
    </TouchableOpacity>
  );
}

// ─── Detail modal ─────────────────────────────────────────────────────────────

function CustomerDetailModal({
  customer,
  visible,
  onClose,
  onTagChange,
  onNoteSave,
}: {
  customer: Customer | null;
  visible: boolean;
  onClose: () => void;
  onTagChange: (id: string, tag: CustomerTag) => void;
  onNoteSave: (id: string, note: string) => void;
}): ReactElement {
  const [noteText, setNoteText] = useState('');
  const [noteEditing, setNoteEditing] = useState(false);

  useEffect(() => {
    if (customer) setNoteText(customer.privateNote ?? '');
  }, [customer]);

  if (!customer) return <View />;

  const tags: CustomerTag[] = ['vip', 'regular', 'first_visit', 'none'];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={ss.modalSafe}>
        <View style={ss.modalHeader}>
          <TouchableOpacity onPress={onClose} style={ss.modalCloseBtn}>
            <Text style={ss.modalCloseText}>{t('customerMgmt.close')}</Text>
          </TouchableOpacity>
          <Text style={ss.modalTitle}>{t('customerMgmt.detailTitle')}</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={ss.modalScroll}>
          {/* Avatar + Tag */}
          <View style={ss.detailAvatarRow}>
            <View style={[ss.detailAvatar, { backgroundColor: C.primaryLight }]}>
              <Text style={ss.detailAvatarInitial}>{customer.initial}</Text>
            </View>
            <View style={ss.detailHeaderInfo}>
              <Text style={ss.detailCustomerLabel}>
                {t('customerMgmt.customerLabel', { n: customer.id })}
              </Text>
              <TagChip tag={customer.tag} />
            </View>
          </View>

          {/* Stats */}
          <View style={ss.detailStatsCard}>
            <View style={ss.detailStatRow}>
              <Text style={ss.detailStatLabel}>{t('customerMgmt.detailVisits')}</Text>
              <Text style={ss.detailStatValue}>{customer.visitCount}</Text>
            </View>
            <View style={ss.detailDivider} />
            <View style={ss.detailStatRow}>
              <Text style={ss.detailStatLabel}>{t('customerMgmt.detailLastVisit')}</Text>
              <Text style={ss.detailStatValue}>
                {customer.lastVisitDaysAgo === 0
                  ? t('inbox.timeJustNow')
                  : t('customers.lastSeen', { n: customer.lastVisitDaysAgo })}
              </Text>
            </View>
            <View style={ss.detailDivider} />
            <View style={ss.detailStatRow}>
              <Text style={ss.detailStatLabel}>{t('customerMgmt.detailAvgSpend')}</Text>
              <Text style={ss.detailStatValue}>
                {customer.avgSpend.toLocaleString('ar-IQ')} {customer.currency}
              </Text>
            </View>
            {customer.rating !== undefined && (
              <>
                <View style={ss.detailDivider} />
                <View style={ss.detailStatRow}>
                  <Text style={ss.detailStatLabel}>{t('customerMgmt.detailRating')}</Text>
                  <StarsDisplay rating={customer.rating} />
                </View>
              </>
            )}
            <View style={ss.detailDivider} />
            <View style={ss.detailStatRow}>
              <Text style={ss.detailStatLabel}>{t('customerMgmt.detailBlastConsent')}</Text>
              <Text style={[ss.detailStatValue, { color: customer.consentBlast ? C.success : C.textMuted }]}>
                {customer.consentBlast ? t('customerMgmt.consentYes') : t('customerMgmt.consentNo')}
              </Text>
            </View>
          </View>

          {/* Tag picker */}
          <View style={ss.detailSection}>
            <Text style={ss.detailSectionTitle}>{t('customerMgmt.changeTagTitle')}</Text>
            <View style={ss.tagPickerRow}>
              {tags.map(tag => {
                const cfg = TAG_CONFIG[tag];
                const selected = customer.tag === tag;
                return (
                  <TouchableOpacity
                    key={tag}
                    style={[
                      ss.tagPickerChip,
                      { backgroundColor: selected ? cfg.color : C.bg },
                    ]}
                    onPress={() => onTagChange(customer.id, tag)}
                    activeOpacity={0.7}
                  >
                    <Text style={[ss.tagPickerText, { color: selected ? '#FFF' : cfg.color }]}>
                      {t(cfg.labelKey as Parameters<typeof t>[0])}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Private note */}
          <View style={ss.detailSection}>
            <View style={ss.detailSectionHeader}>
              <Text style={ss.detailSectionTitle}>{t('customerMgmt.privateNoteTitle')}</Text>
              <Text style={ss.privateNoteHint}>{t('customerMgmt.privateNoteHint')}</Text>
            </View>
            {noteEditing ? (
              <View>
                <TextInput
                  style={ss.noteInput}
                  value={noteText}
                  onChangeText={setNoteText}
                  multiline
                  numberOfLines={3}
                  placeholder={t('customerMgmt.notePlaceholder')}
                  placeholderTextColor={C.textMuted}
                  textAlign="right"
                  maxLength={300}
                />
                <View style={ss.noteActions}>
                  <TouchableOpacity
                    style={ss.noteCancelBtn}
                    onPress={() => { setNoteEditing(false); setNoteText(customer.privateNote ?? ''); }}
                  >
                    <Text style={ss.noteCancelText}>{t('customerMgmt.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={ss.noteSaveBtn}
                    onPress={() => { onNoteSave(customer.id, noteText); setNoteEditing(false); }}
                  >
                    <Text style={ss.noteSaveText}>{t('customerMgmt.save')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={ss.noteDisplay} onPress={() => setNoteEditing(true)}>
                <Text style={noteText ? ss.noteText : ss.notePlaceholder}>
                  {noteText || t('customerMgmt.notePlaceholder')}
                </Text>
                <Text style={ss.noteEditIcon}>✏️</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Actions */}
          <View style={ss.detailActions}>
            {customer.hasMessageThread && (
              <TouchableOpacity style={[ss.actionBtn, { backgroundColor: C.primaryLight }]}>
                <Text style={[ss.actionBtnText, { color: C.primary }]}>
                  💬 {t('customerMgmt.openThread')}
                </Text>
              </TouchableOpacity>
            )}
            {customer.hasReview && (
              <TouchableOpacity style={[ss.actionBtn, { backgroundColor: C.goldBg }]}>
                <Text style={[ss.actionBtnText, { color: C.gold }]}>
                  ⭐ {t('customerMgmt.respondReview')}
                </Text>
              </TouchableOpacity>
            )}
            {customer.consentBlast && (
              <TouchableOpacity style={[ss.actionBtn, { backgroundColor: C.successBg }]}>
                <Text style={[ss.actionBtnText, { color: C.success }]}>
                  📣 {t('customerMgmt.sendDirectMessage')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Blast modal ──────────────────────────────────────────────────────────────

function BlastModal({
  visible,
  consentCount,
  onSend,
  onClose,
}: {
  visible: boolean;
  consentCount: number;
  onSend: (msg: string, tag: CustomerTag | 'all') => void;
  onClose: () => void;
}): ReactElement {
  const [msg, setMsg] = useState('');
  const [targetTag, setTargetTag] = useState<CustomerTag | 'all'>('all');
  const MAX = 200;

  const tagOptions: Array<{ key: CustomerTag | 'all'; label: string }> = [
    { key: 'all', label: t('customerMgmt.blastAll') },
    { key: 'vip', label: t('customerMgmt.tagVip') },
    { key: 'regular', label: t('customerMgmt.tagRegular') },
  ];

  const handleSend = () => {
    if (!msg.trim()) return;
    Alert.alert(
      t('customerMgmt.blastConfirmTitle'),
      t('customerMgmt.blastConfirmBody', { n: consentCount }),
      [
        { text: t('customerMgmt.cancel'), style: 'cancel' },
        { text: t('customerMgmt.blastSend'), onPress: () => { onSend(msg, targetTag); setMsg(''); onClose(); } },
      ],
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={ss.modalSafe}>
        <View style={ss.modalHeader}>
          <TouchableOpacity onPress={onClose} style={ss.modalCloseBtn}>
            <Text style={ss.modalCloseText}>{t('customerMgmt.cancel')}</Text>
          </TouchableOpacity>
          <Text style={ss.modalTitle}>{t('customerMgmt.blastTitle')}</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={ss.modalScroll}>
          <View style={ss.blastConsentNotice}>
            <Text style={ss.blastConsentIcon}>🔒</Text>
            <Text style={ss.blastConsentText}>
              {t('customerMgmt.blastConsentNotice', { n: consentCount })}
            </Text>
          </View>

          <Text style={ss.detailSectionTitle}>{t('customerMgmt.blastTargetTitle')}</Text>
          <View style={ss.tagPickerRow}>
            {tagOptions.map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={[ss.tagPickerChip, { backgroundColor: targetTag === opt.key ? C.primary : C.bg }]}
                onPress={() => setTargetTag(opt.key)}
                activeOpacity={0.7}
              >
                <Text style={[ss.tagPickerText, { color: targetTag === opt.key ? '#FFF' : C.text }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[ss.detailSectionTitle, { marginTop: 16 }]}>{t('customerMgmt.blastMessage')}</Text>
          <TextInput
            style={[ss.blastInput, { textAlign: 'right' as const, textAlignVertical: 'top' as const }]}
            value={msg}
            onChangeText={v => setMsg(v.slice(0, MAX))}
            multiline
            numberOfLines={5}
            placeholder={t('customerMgmt.blastPlaceholder')}
            placeholderTextColor={C.textMuted}
          />
          <Text style={ss.charCount}>{MAX - msg.length} / {MAX}</Text>

          <TouchableOpacity
            style={[ss.blastSendBtn, { opacity: msg.trim() ? 1 : 0.4 }]}
            onPress={handleSend}
            disabled={!msg.trim()}
            activeOpacity={0.8}
          >
            <Text style={ss.blastSendText}>{t('customerMgmt.blastSend')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export interface CustomerManagementScreenProps {
  onNavigate?: (screen: string, params?: Record<string, unknown>) => void;
}

export function CustomerManagementScreen({
  onNavigate,
}: CustomerManagementScreenProps): ReactElement {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterTag, setFilterTag] = useState<CustomerTag | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [blastVisible, setBlastVisible] = useState(false);

  const load = useCallback(async () => {
    try {
      await new Promise<void>(r => setTimeout(r, 500));
      setCustomers(buildMockCustomers());
      setStats(buildMockStats());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const filteredCustomers = customers.filter(c => {
    if (filterTag !== 'all' && c.tag !== filterTag) return false;
    if (searchQuery) {
      // Search by tag label or initial (anonymised)
      const q = searchQuery.toLowerCase();
      return c.initial.toLowerCase().includes(q) || c.tag.includes(q);
    }
    return true;
  });

  const consentCount = customers.filter(c => c.consentBlast).length;

  const handleTagChange = useCallback((id: string, tag: CustomerTag) => {
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, tag } : c));
    setSelectedCustomer(prev => prev?.id === id ? { ...prev, tag } : prev);
  }, []);

  const handleNoteSave = useCallback((id: string, note: string) => {
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, privateNote: note } : c));
  }, []);

  const handleBlast = useCallback((_msg: string, _tag: CustomerTag | 'all') => {
    Alert.alert(t('customerMgmt.blastSuccess'));
  }, []);

  const filters: Array<{ key: CustomerTag | 'all'; label: string }> = [
    { key: 'all', label: t('customerMgmt.filterAll') },
    { key: 'vip', label: t('customerMgmt.tagVip') },
    { key: 'regular', label: t('customerMgmt.tagRegular') },
    { key: 'first_visit', label: t('customerMgmt.tagFirstVisit') },
  ];

  return (
    <SafeAreaView style={ss.safeArea}>
      {/* Title bar */}
      <View style={ss.titleBar}>
        <Text style={ss.screenTitle}>{t('customerMgmt.title')}</Text>
        <TouchableOpacity
          style={ss.blastHeaderBtn}
          onPress={() => setBlastVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={ss.blastHeaderBtnText}>📣 {t('customerMgmt.blastBtn')}</Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      {stats && <StatsRow stats={stats} />}

      {/* Search */}
      <View style={ss.searchWrap}>
        <TextInput
          style={ss.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('customerMgmt.searchPlaceholder')}
          placeholderTextColor={C.textMuted}
          textAlign="right"
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={ss.searchClear}>
            <Text style={ss.searchClearText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={ss.filterRow}
      >
        {filters.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[ss.filterTab, filterTag === f.key && ss.filterTabActive]}
            onPress={() => setFilterTag(f.key)}
            activeOpacity={0.7}
          >
            <Text style={[ss.filterTabText, filterTag === f.key && ss.filterTabTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Customer list */}
      {loading ? (
        <ScrollView contentContainerStyle={ss.loadingScroll}>
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonBlock key={i} width="100%" height={80} />
          ))}
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={ss.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />
          }
          showsVerticalScrollIndicator={false}
        >
          {filteredCustomers.length === 0 ? (
            <View style={ss.emptyState}>
              <Text style={ss.emptyIcon}>👥</Text>
              <Text style={ss.emptyTitle}>{t('customerMgmt.emptyTitle')}</Text>
              <Text style={ss.emptyBody}>{t('customerMgmt.emptyBody')}</Text>
            </View>
          ) : (
            filteredCustomers.map(c => (
              <CustomerRow
                key={c.id}
                customer={c}
                onPress={() => {
                  setSelectedCustomer(c);
                  setDetailVisible(true);
                }}
              />
            ))
          )}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      {/* Detail modal */}
      <CustomerDetailModal
        customer={selectedCustomer}
        visible={detailVisible}
        onClose={() => setDetailVisible(false)}
        onTagChange={handleTagChange}
        onNoteSave={handleNoteSave}
      />

      {/* Blast modal */}
      <BlastModal
        visible={blastVisible}
        consentCount={consentCount}
        onSend={handleBlast}
        onClose={() => setBlastVisible(false)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  safeArea:           { flex: 1, backgroundColor: C.bg },

  titleBar:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  screenTitle:        { fontSize: 20, fontWeight: '700', color: C.text },
  blastHeaderBtn:     { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.primaryLight, borderRadius: 10 },
  blastHeaderBtnText: { fontSize: 13, color: C.primary, fontWeight: '600' },

  // Stats
  statsRow:           { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  statsTile:          { flex: 1, backgroundColor: C.card, borderRadius: 10, padding: 10, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, elevation: 2 },
  statsTileIcon:      { fontSize: 18 },
  statsTileValue:     { fontSize: 16, fontWeight: '700', color: C.text, marginVertical: 2 },
  statsTileLabel:     { fontSize: 10, color: C.textMuted, textAlign: 'center' },

  // Search
  searchWrap:         { marginHorizontal: 16, marginBottom: 6, flexDirection: 'row', alignItems: 'center' },
  searchInput:        { flex: 1, backgroundColor: C.card, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, fontSize: 14, borderWidth: 1, borderColor: C.border },
  searchClear:        { position: 'absolute', start: 12, padding: 4 },
  searchClearText:    { fontSize: 13, color: C.textMuted },

  // Filter tabs
  filterRow:          { paddingHorizontal: 12, paddingBottom: 8, gap: 6 },
  filterTab:          { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  filterTabActive:    { backgroundColor: C.primary, borderColor: C.primary },
  filterTabText:      { fontSize: 13, color: C.textMuted },
  filterTabTextActive:{ color: '#FFFFFF', fontWeight: '600' },

  // List
  list:               { paddingHorizontal: 16 },
  loadingScroll:      { paddingHorizontal: 16, gap: 10 },
  skeletonRow:        { height: 80, borderRadius: 12 },

  // Customer row
  customerRow:        { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, padding: 12, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  customerAvatar:     { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginEnd: 10, position: 'relative' },
  customerInitial:    { fontSize: 18, fontWeight: '700' },
  vipCrown:           { position: 'absolute', top: -4, end: -4, fontSize: 12 },
  customerInfo:       { flex: 1 },
  customerTopRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  customerLabel:      { fontSize: 13, fontWeight: '600', color: C.text },
  customerMeta:       { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  customerMetaText:   { fontSize: 12, color: C.textMuted },
  metaDot:            { fontSize: 10, color: C.border },
  starsText:          { fontSize: 12 },
  customerIcons:      { flexDirection: 'row', gap: 2, marginEnd: 6 },
  iconBubble:         { fontSize: 14 },
  chevron:            { fontSize: 20, color: C.textMuted },

  // Tag chip
  tagChip:            { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  tagChipText:        { fontSize: 11, fontWeight: '600' },

  // Empty state
  emptyState:         { alignItems: 'center', paddingTop: 60 },
  emptyIcon:          { fontSize: 48, marginBottom: 12 },
  emptyTitle:         { fontSize: 16, fontWeight: '600', color: C.text, marginBottom: 6 },
  emptyBody:          { fontSize: 14, color: C.textMuted, textAlign: 'center', maxWidth: 260 },

  // Modal
  modalSafe:          { flex: 1, backgroundColor: C.bg },
  modalHeader:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.card },
  modalTitle:         { fontSize: 16, fontWeight: '700', color: C.text },
  modalCloseBtn:      { padding: 4 },
  modalCloseText:     { fontSize: 15, color: C.primary },
  modalScroll:        { padding: 16 },

  // Detail
  detailAvatarRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 14 },
  detailAvatar:       { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  detailAvatarInitial:{ fontSize: 24, fontWeight: '700', color: C.primary },
  detailHeaderInfo:   { gap: 6 },
  detailCustomerLabel:{ fontSize: 16, fontWeight: '700', color: C.text },
  detailStatsCard:    { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, elevation: 2 },
  detailStatRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  detailStatLabel:    { fontSize: 14, color: C.textMuted },
  detailStatValue:    { fontSize: 14, fontWeight: '600', color: C.text },
  detailDivider:      { height: 1, backgroundColor: C.border },
  detailSection:      { marginBottom: 16 },
  detailSectionHeader:{ marginBottom: 8 },
  detailSectionTitle: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 8 },
  privateNoteHint:    { fontSize: 12, color: C.textMuted },
  tagPickerRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagPickerChip:      { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  tagPickerText:      { fontSize: 13, fontWeight: '600' },
  noteDisplay:        { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: C.card, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.border },
  noteText:           { fontSize: 14, color: C.text, flex: 1 },
  notePlaceholder:    { fontSize: 14, color: C.textMuted, flex: 1 },
  noteEditIcon:       { fontSize: 14 },
  noteInput:          { backgroundColor: C.card, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.primary, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },
  noteActions:        { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
  noteCancelBtn:      { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: C.bg },
  noteCancelText:     { fontSize: 14, color: C.textMuted },
  noteSaveBtn:        { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 8, backgroundColor: C.primary },
  noteSaveText:       { fontSize: 14, color: '#FFF', fontWeight: '600' },
  detailActions:      { gap: 10, marginBottom: 20 },
  actionBtn:          { paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  actionBtnText:      { fontSize: 14, fontWeight: '600' },

  // Blast
  blastConsentNotice: { flexDirection: 'row', backgroundColor: C.successBg, borderRadius: 10, padding: 12, marginBottom: 16, gap: 8, alignItems: 'flex-start' },
  blastConsentIcon:   { fontSize: 18, marginTop: 1 },
  blastConsentText:   { fontSize: 13, color: C.success, flex: 1 },
  blastInput:         { backgroundColor: C.card, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.border, fontSize: 14, minHeight: 110, textAlignVertical: 'top' },
  charCount:          { fontSize: 12, color: C.textMuted, textAlign: 'right', marginTop: 4 },
  blastSendBtn:       { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  blastSendText:      { fontSize: 15, color: '#FFF', fontWeight: '700' },
});
