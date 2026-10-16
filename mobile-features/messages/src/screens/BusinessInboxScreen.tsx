/**
 * BusinessInboxScreen — provider-side inbox for managing customer inquiries.
 *
 * Features:
 * - Separate business view (not the customer's personal list)
 * - Filter: all / unread / awaiting reply
 * - Quick-reply template insertion
 * - Assign conversation to a staff member
 * - Mark as resolved
 * - Customer context panel (reviews, past messages)
 * - Business-hours indicator
 * - Auto-reply toggle
 */
import { Banner, EmptyState, Screen, Text } from '@iraq-maps/ui';
import { useRouter } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  Animated,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  View,
  Text as RNText,
  TextInput,
} from 'react-native';
import { InquiryCard, type CustomerInquiry, type InquiryStatus } from '../components/InquiryCard';
import { t } from '../strings';

// ─── Types ────────────────────────────────────────────────────────────────────

type InboxFilter = 'all' | 'unread' | 'awaiting';

interface StaffMember {
  id: string;
  name: string;
  role: string;
  isOnline: boolean;
}

interface QuickReply {
  id: string;
  label: string;
  text: string;
}

interface BusinessHours {
  isOpen: boolean;
  opensAt?: string;
  closesAt?: string;
  timezone: string;
}

interface AutoReply {
  enabled: boolean;
  message: string;
}

interface CustomerContext {
  customerId: string;
  customerName: string;
  totalInquiries: number;
  lastContactAt: string;
  reviewCount: number;
  avgRating: number;
}

// ─── Mock data (replaced by real API calls in integration) ────────────────────
/* eslint-disable no-restricted-syntax */

const MOCK_STAFF: StaffMember[] = [
  { id: 'staff-1', name: 'أحمد محمد', role: 'مدير', isOnline: true },
  { id: 'staff-2', name: 'سارة علي', role: 'موظف خدمة عملاء', isOnline: false },
  { id: 'staff-3', name: 'محمود حسن', role: 'مسؤول مبيعات', isOnline: true },
];

const MOCK_QUICK_REPLIES: QuickReply[] = [
  { id: 'qr-1', label: t('inbox.qr.greeting'), text: t('inbox.qr.greetingText') },
  { id: 'qr-2', label: t('inbox.qr.hours'), text: t('inbox.qr.hoursText') },
  { id: 'qr-3', label: t('inbox.qr.price'), text: t('inbox.qr.priceText') },
  { id: 'qr-4', label: t('inbox.qr.thanks'), text: t('inbox.qr.thanksText') },
];

function makeMockInquiries(): CustomerInquiry[] {
  const statuses: InquiryStatus[] = ['new', 'open', 'replied', 'resolved'];
  return Array.from({ length: 12 }, (_, i) => ({
    id: `inq-${i}`,
    customerId: `cust-${i}`,
    customerName: ['علي حسين', 'فاطمة أحمد', 'محمد كريم', 'زينب ناصر', 'عمر سعيد'][i % 5]!,
    firstMessage: [
      'ما هي أسعار المنتجات لديكم؟',
      'هل تقبلون الطلبات عبر الإنترنت؟',
      'متى يكون المحل مفتوحاً في عطلة نهاية الأسبوع؟',
      'هل لديكم خدمة التوصيل للمنازل؟',
      'ما هي أقرب طريقة للوصول إليكم؟',
    ][i % 5]!,
    lastMessageAt: new Date(Date.now() - i * 3_600_000).toISOString(),
    status: statuses[i % 4]!,
    unreadCount: i % 4 === 0 ? i + 1 : 0,
    assignedTo: i % 3 === 0 ? MOCK_STAFF[0] : undefined,
  }));
}
/* eslint-enable no-restricted-syntax */

// ─── Helpers ──────────────────────────────────────────────────────────────────

function filterInquiries(items: CustomerInquiry[], filter: InboxFilter): CustomerInquiry[] {
  if (filter === 'all') return items;
  if (filter === 'unread') return items.filter((i) => i.unreadCount > 0);
  if (filter === 'awaiting') return items.filter((i) => i.status === 'new' || i.status === 'open');
  return items;
}

// ─── Business Hours Banner ────────────────────────────────────────────────────

function BusinessHoursBanner({ hours }: { hours: BusinessHours }): ReactElement {
  return (
    <View style={[bhStyles.container, { backgroundColor: hours.isOpen ? '#E8F5E9' : '#FFF3E0' }]}>
      <View style={[bhStyles.dot, { backgroundColor: hours.isOpen ? '#388E3C' : '#F57C00' }]} />
      <RNText style={[bhStyles.text, { color: hours.isOpen ? '#2E7D32' : '#E65100' }]}>
        {hours.isOpen
          ? t('inbox.hours.open', { closes: hours.closesAt ?? '' })
          : t('inbox.hours.closed', { opens: hours.opensAt ?? '' })}
      </RNText>
    </View>
  );
}

const bhStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    gap: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontSize: 13, fontWeight: '500', flex: 1 },
});

// ─── Filter Tabs ──────────────────────────────────────────────────────────────

const FILTER_KEYS: InboxFilter[] = ['all', 'unread', 'awaiting'];

function FilterTabs({
  active,
  counts,
  onChange,
}: {
  active: InboxFilter;
  counts: Record<InboxFilter, number>;
  onChange: (f: InboxFilter) => void;
}): ReactElement {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={ftStyles.row} contentContainerStyle={ftStyles.content}>
      {FILTER_KEYS.map((key) => {
        const isActive = active === key;
        const label = t(`inbox.filter.${key}` as Parameters<typeof t>[0]);
        const count = counts[key];
        return (
          <Pressable
            key={key}
            style={[ftStyles.tab, isActive && ftStyles.activeTab]}
            onPress={() => onChange(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            testID={`inbox-filter-${key}`}
          >
            <RNText style={[ftStyles.tabText, isActive && ftStyles.activeTabText]}>
              {label}
              {count > 0 ? ` (${count})` : ''}
            </RNText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const ftStyles = StyleSheet.create({
  row: { marginBottom: 8 },
  content: { gap: 8, paddingVertical: 4 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
  },
  activeTab: { backgroundColor: '#1976D2' },
  tabText: { fontSize: 13, color: '#555', fontWeight: '500' },
  activeTabText: { color: '#FFF' },
});

// ─── Assign Modal ─────────────────────────────────────────────────────────────

function AssignModal({
  visible,
  staff,
  current,
  onAssign,
  onClose,
}: {
  visible: boolean;
  staff: StaffMember[];
  current?: string;
  onAssign: (staffId: string, staffName: string) => void;
  onClose: () => void;
}): ReactElement {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={modalStyles.overlay} onPress={onClose}>
        <View style={modalStyles.sheet}>
          <RNText style={modalStyles.title}>{t('inbox.assign.title')}</RNText>
          {staff.map((s) => (
            <Pressable
              key={s.id}
              style={[modalStyles.staffRow, s.id === current && modalStyles.staffRowActive]}
              onPress={() => { onAssign(s.id, s.name); onClose(); }}
              accessibilityRole="button"
            >
              <View style={[modalStyles.onlineDot, { backgroundColor: s.isOnline ? '#388E3C' : '#BDBDBD' }]} />
              <View style={{ flex: 1 }}>
                <RNText style={modalStyles.staffName}>{s.name}</RNText>
                <RNText style={modalStyles.staffRole}>{s.role}</RNText>
              </View>
              {/* eslint-disable-next-line i18next/no-literal-string */}
              {s.id === current ? <RNText style={modalStyles.checkmark}>{'✓'}</RNText> : null}
            </Pressable>
          ))}
          <Pressable style={modalStyles.cancelBtn} onPress={onClose}>
            <RNText style={modalStyles.cancelText}>{t('compose.cancel')}</RNText>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

// ─── Customer Context Panel ───────────────────────────────────────────────────

function CustomerContextPanel({
  ctx,
  onClose,
}: {
  ctx: CustomerContext;
  onClose: () => void;
}): ReactElement {
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={modalStyles.overlay} onPress={onClose}>
        <View style={[modalStyles.sheet, { paddingBottom: 32 }]}>
          <RNText style={modalStyles.title}>{ctx.customerName}</RNText>
          <View style={ctxStyles.statRow}>
            <View style={ctxStyles.stat}>
              <RNText style={ctxStyles.statValue}>{ctx.totalInquiries}</RNText>
              <RNText style={ctxStyles.statLabel}>{t('inbox.ctx.inquiries')}</RNText>
            </View>
            <View style={ctxStyles.stat}>
              <RNText style={ctxStyles.statValue}>{ctx.reviewCount}</RNText>
              <RNText style={ctxStyles.statLabel}>{t('inbox.ctx.reviews')}</RNText>
            </View>
            <View style={ctxStyles.stat}>
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <RNText style={ctxStyles.statValue}>{ctx.avgRating.toFixed(1)} {'★'}</RNText>
              <RNText style={ctxStyles.statLabel}>{t('inbox.ctx.rating')}</RNText>
            </View>
          </View>
          <RNText style={ctxStyles.lastContact}>
            {t('inbox.ctx.lastContact', { date: new Date(ctx.lastContactAt).toLocaleDateString('ar') })}
          </RNText>
          <Pressable style={modalStyles.cancelBtn} onPress={onClose}>
            <RNText style={modalStyles.cancelText}>{t('compose.cancel')}</RNText>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const ctxStyles = StyleSheet.create({
  statRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 16 },
  stat: { alignItems: 'center', gap: 4 },
  statValue: { fontSize: 22, fontWeight: '700', color: '#1976D2' },
  statLabel: { fontSize: 12, color: '#757575' },
  lastContact: { textAlign: 'center', fontSize: 13, color: '#9E9E9E', marginBottom: 12 },
});

// ─── Auto-Reply Settings Card ─────────────────────────────────────────────────

function AutoReplyCard({
  autoReply,
  onChange,
}: {
  autoReply: AutoReply;
  onChange: (ar: AutoReply) => void;
}): ReactElement {
  return (
    <View style={arStyles.card}>
      <View style={arStyles.header}>
        <RNText style={arStyles.title}>{t('inbox.autoReply.title')}</RNText>
        <Switch
          value={autoReply.enabled}
          onValueChange={(v) => onChange({ ...autoReply, enabled: v })}
          accessibilityLabel={t('inbox.autoReply.toggle')}
          trackColor={{ true: '#1976D2' }}
        />
      </View>
      {autoReply.enabled ? (
        <TextInput
          style={arStyles.input}
          value={autoReply.message}
          onChangeText={(text) => onChange({ ...autoReply, message: text })}
          multiline
          numberOfLines={3}
          placeholder={t('inbox.autoReply.placeholder')}
          accessibilityLabel={t('inbox.autoReply.inputLabel')}
          textAlignVertical="top"
        />
      ) : null}
    </View>
  );
}

const arStyles = StyleSheet.create({
  card: {
    backgroundColor: '#F8F9FF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E3E8FF',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 14, fontWeight: '600', color: '#212121' },
  input: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#C5CAE9',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: '#212121',
    minHeight: 72,
    backgroundColor: '#FFF',
  },
});

// ─── Quick Reply Chip ─────────────────────────────────────────────────────────

function QuickReplyChip({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}): ReactElement {
  return (
    <Pressable
      onPress={onPress}
      style={qrStyles.chip}
      accessibilityRole="button"
    >
      <RNText style={qrStyles.chipText}>{label}</RNText>
    </Pressable>
  );
}

const qrStyles = StyleSheet.create({
  chip: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1976D2',
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginEnd: 8,
    marginBottom: 6,
  },
  chipText: { fontSize: 12, color: '#1976D2', fontWeight: '500' },
});

// ─── Conversation Action Menu ─────────────────────────────────────────────────

function ConversationActionsMenu({
  inquiry,
  visible,
  onClose,
  onResolve,
  onAssign,
  onViewCustomer,
}: {
  inquiry: CustomerInquiry | null;
  visible: boolean;
  onClose: () => void;
  onResolve: (id: string) => void;
  onAssign: (id: string) => void;
  onViewCustomer: (id: string) => void;
}): ReactElement {
  if (!inquiry) return <></>;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={modalStyles.overlay} onPress={onClose}>
        <View style={modalStyles.actionsSheet}>
          <RNText style={modalStyles.title} numberOfLines={1}>{inquiry.customerName}</RNText>
          <Pressable style={modalStyles.actionRow} onPress={() => { onViewCustomer(inquiry.customerId); onClose(); }}>
            <RNText style={modalStyles.actionIcon}>👤</RNText>
            <RNText style={modalStyles.actionText}>{t('inbox.actions.viewCustomer')}</RNText>
          </Pressable>
          <Pressable style={modalStyles.actionRow} onPress={() => { onAssign(inquiry.id); onClose(); }}>
            <RNText style={modalStyles.actionIcon}>📋</RNText>
            <RNText style={modalStyles.actionText}>{t('inbox.actions.assign')}</RNText>
          </Pressable>
          {inquiry.status !== 'resolved' ? (
            <Pressable style={modalStyles.actionRow} onPress={() => { onResolve(inquiry.id); onClose(); }}>
              <RNText style={modalStyles.actionIcon}>✅</RNText>
              <RNText style={[modalStyles.actionText, { color: '#388E3C' }]}>{t('inbox.actions.resolve')}</RNText>
            </Pressable>
          ) : null}
          <Pressable style={[modalStyles.cancelBtn, { marginTop: 8 }]} onPress={onClose}>
            <RNText style={modalStyles.cancelText}>{t('compose.cancel')}</RNText>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

// ─── Shared modal styles ──────────────────────────────────────────────────────

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#00000055',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFF',
    borderTopStartRadius: 20,
    borderTopEndRadius: 20,
    padding: 20,
    gap: 0,
  },
  actionsSheet: {
    backgroundColor: '#FFF',
    borderTopStartRadius: 20,
    borderTopEndRadius: 20,
    padding: 20,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 16,
    textAlign: 'center',
  },
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    gap: 10,
  },
  staffRowActive: { backgroundColor: '#E3F2FD' },
  onlineDot: { width: 10, height: 10, borderRadius: 5 },
  staffName: { fontSize: 14, fontWeight: '600', color: '#212121' },
  staffRole: { fontSize: 12, color: '#757575' },
  checkmark: { fontSize: 16, color: '#1976D2' },
  cancelBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  cancelText: { fontSize: 15, color: '#757575', fontWeight: '500' },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
    gap: 12,
  },
  actionIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  actionText: { fontSize: 15, color: '#212121' },
});

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard(): ReactElement {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 600, useNativeDriver: true }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [opacity]);
  return (
    <Animated.View style={[skStyles.card, { opacity }]}>
      <View style={skStyles.avatar} />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={skStyles.line1} />
        <View style={skStyles.line2} />
        <View style={skStyles.line3} />
      </View>
    </Animated.View>
  );
}

const skStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E0E0E0' },
  line1: { height: 13, borderRadius: 6, backgroundColor: '#E0E0E0', width: '70%' },
  line2: { height: 11, borderRadius: 6, backgroundColor: '#E0E0E0', width: '90%' },
  line3: { height: 11, borderRadius: 6, backgroundColor: '#E0E0E0', width: '40%' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function BusinessInboxScreen(): ReactElement {
  const router = useRouter();

  // Data
  const [inquiries, setInquiries] = useState<CustomerInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // Filters
  const [activeFilter, setActiveFilter] = useState<InboxFilter>('all');

  // Business hours (mock)
  const [businessHours] = useState<BusinessHours>({
    isOpen: new Date().getHours() >= 9 && new Date().getHours() < 22,
    closesAt: '22:00',
    opensAt: '09:00',
    timezone: 'Asia/Baghdad',
  });

  // Auto-reply
  const [autoReply, setAutoReply] = useState<AutoReply>({
    enabled: false,
    message: '',
  });
  const [showSettings, setShowSettings] = useState(false);

  // Modals
  const [actionTarget, setActionTarget] = useState<CustomerInquiry | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignForId, setAssignForId] = useState<string | undefined>();
  const [customerCtx, setCustomerCtx] = useState<CustomerContext | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(undefined);
    try {
      // Real: call getBusinessInbox(providerId, filter, pagination)
      await new Promise((r) => setTimeout(r, 600));
      setInquiries(makeMockInquiries());
    } catch {
      setError(t('inbox.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleRefresh = () => {
    setRefreshing(true);
    void load(true);
  };

  const handleResolve = (id: string) => {
    setInquiries((prev) =>
      prev.map((inq) => (inq.id === id ? { ...inq, status: 'resolved' as InquiryStatus } : inq)),
    );
  };

  const handleAssign = (inquiryId: string) => {
    setAssignForId(inquiryId);
    setShowAssignModal(true);
  };

  const handleAssignConfirm = (staffId: string, staffName: string) => {
    if (!assignForId) return;
    setInquiries((prev) =>
      prev.map((inq) =>
        inq.id === assignForId
          ? { ...inq, assignedTo: { id: staffId, name: staffName } }
          : inq,
      ),
    );
    setAssignForId(undefined);
  };

  const handleViewCustomer = (customerId: string) => {
    // Fetch real context from API; mock here
    setCustomerCtx({
      customerId,
      customerName: inquiries.find((i) => i.customerId === customerId)?.customerName ?? '',
      totalInquiries: Math.floor(Math.random() * 10) + 1,
      lastContactAt: new Date().toISOString(),
      reviewCount: Math.floor(Math.random() * 5),
      avgRating: 3.5 + Math.random() * 1.5,
    });
  };

  const filtered = useMemo(() => filterInquiries(inquiries, activeFilter), [inquiries, activeFilter]);

  const filterCounts = useMemo(
    () => ({
      all: inquiries.length,
      unread: inquiries.filter((i) => i.unreadCount > 0).length,
      awaiting: inquiries.filter((i) => i.status === 'new' || i.status === 'open').length,
    }),
    [inquiries],
  );

  return (
    <Screen>
      {/* Header row */}
      <View style={styles.headerRow}>
        <Text variant="title">{t('inbox.title')}</Text>
        <Pressable
          onPress={() => setShowSettings((v) => !v)}
          style={styles.settingsBtn}
          accessibilityRole="button"
          accessibilityLabel={t('inbox.settings')}
        >
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <RNText style={styles.settingsIcon}>{'⚙️'}</RNText>
        </Pressable>
      </View>

      {/* Business hours */}
      <BusinessHoursBanner hours={businessHours} />

      {/* Auto-reply settings panel */}
      {showSettings ? (
        <AutoReplyCard autoReply={autoReply} onChange={setAutoReply} />
      ) : null}

      {/* Quick reply chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        {MOCK_QUICK_REPLIES.map((qr) => (
          <QuickReplyChip
            key={qr.id}
            label={qr.label}
            onPress={() => router.push('/messages/quick-replies')}
          />
        ))}
      </ScrollView>

      {/* Filter tabs */}
      <FilterTabs active={activeFilter} counts={filterCounts} onChange={setActiveFilter} />

      {error ? <Banner kind="error" message={error} /> : null}

      {/* List */}
      {loading && inquiries.length === 0 ? (
        <View>
          {[1, 2, 3, 4].map((k) => <SkeletonCard key={k} />)}
        </View>
      ) : (
        <ScrollView
          testID="business-inbox-scroll"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          {filtered.length === 0 ? (
            <EmptyState
              title={t('inbox.empty')}
              body={t('inbox.emptyBody')}
            />
          ) : null}
          {filtered.map((inq) => (
            <InquiryCard
              key={inq.id}
              inquiry={inq}
              onPress={(id) => router.push({ pathname: '/messages/business/[id]', params: { id } })}
              onLongPress={(id) => {
                const found = inquiries.find((i) => i.id === id);
                if (found) setActionTarget(found);
              }}
            />
          ))}
          {/* Bottom spacer */}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      {/* Conversation actions menu */}
      <ConversationActionsMenu
        inquiry={actionTarget}
        visible={actionTarget !== null}
        onClose={() => setActionTarget(null)}
        onResolve={handleResolve}
        onAssign={handleAssign}
        onViewCustomer={handleViewCustomer}
      />

      {/* Assign staff modal */}
      <AssignModal
        visible={showAssignModal}
        staff={MOCK_STAFF}
        current={
          assignForId
            ? inquiries.find((i) => i.id === assignForId)?.assignedTo?.id
            : undefined
        }
        onAssign={handleAssignConfirm}
        onClose={() => setShowAssignModal(false)}
      />

      {/* Customer context panel */}
      {customerCtx ? (
        <CustomerContextPanel ctx={customerCtx} onClose={() => setCustomerCtx(null)} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  settingsBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
  },
  settingsIcon: { fontSize: 20 },
  chipRow: { marginBottom: 8 },
});
