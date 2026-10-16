/**
 * ReferralScreen — invite friends and earn rewards.
 *
 * Features:
 *   - My referral code (big, copyable)
 *   - Share invite link
 *   - Referred friends list (joined / pending)
 *   - Points earned from referrals
 *   - Progress to next reward tier
 *   - Referral leaderboard
 *   - "Share via WhatsApp" button
 *   - QR code for referral
 *
 * All text via t(). Layouts use start/end (RTL-safe).
 * Route: account/referral
 */
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Animated,
  Clipboard,
  I18nManager,
  Linking,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ── Icons (Unicode) ────────────────────────────────────────────────────────────
const ICON_COPY     = '📋';
const ICON_SHARE    = '📤';
const ICON_CHECK    = '✅';
const ICON_CLOCK    = '⏳';
const ICON_STAR     = '⭐';
const ICON_TROPHY   = '🏆';
const ICON_CROWN    = '👑';
const ICON_ARROW    = '←';
const ICON_QR       = '📱';
const ICON_WHATSAPP = '💬';
const ICON_MEDAL    = '🏅';
const ICON_FIRE     = '🔥';
const ICON_GIFT     = '🎁';
const ICON_PEOPLE   = '👥';

// ── Palette ────────────────────────────────────────────────────────────────────
const C = {
  primary:       '#1565C0',
  primaryLight:  '#E3F2FD',
  gold:          '#F9A825',
  goldLight:     '#FFF8E1',
  silver:        '#78909C',
  bronze:        '#8D6E63',
  surface:       '#FFFFFF',
  bg:            '#F5F7FA',
  text:          '#1A1A2E',
  textSecondary: '#546E7A',
  textHint:      '#90A4AE',
  border:        '#E0E0E0',
  success:       '#2E7D32',
  successLight:  '#E8F5E9',
  pending:       '#E65100',
  pendingLight:  '#FFF3E0',
  green:         '#388E3C',
  tier1:         '#78909C',
  tier2:         '#F9A825',
  tier3:         '#1565C0',
};

// ── Types ──────────────────────────────────────────────────────────────────────
type ReferredFriend = {
  id: string;
  name: string;
  joinedAt: string | null; // null = still pending
  pointsEarned: number;
};

type LeaderboardEntry = {
  rank: number;
  userId: string;
  name: string;
  referrals: number;
  isMe: boolean;
};

type ReferralStats = {
  code: string;
  link: string;
  totalReferred: number;
  totalPoints: number;
  pendingCount: number;
  currentTier: number;    // 1, 2, 3
  currentTierName: string;
  nextTierAt: number;     // referrals needed for next tier
  nextTierReward: string;
};

type Tab = 'friends' | 'leaderboard';

// ── QR Modal ──────────────────────────────────────────────────────────────────
function QrModal({ visible, code, onClose }: { visible: boolean; code: string; onClose: () => void }): ReactElement {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.modalOverlay} onPress={onClose}>
        <View style={s.qrCard}>
          <Text style={s.qrTitle}>{t('referral.qrTitle')}</Text>
          {/* QR placeholder — in production replace with a real QR library */}
          <View style={s.qrBox}>
            <Text style={s.qrPlaceholder}>{ICON_QR}</Text>
            <Text style={s.qrCode}>{code}</Text>
          </View>
          <Text style={s.qrHint}>{t('referral.qrHint')}</Text>
          <TouchableOpacity style={s.qrClose} onPress={onClose}>
            <Text style={s.qrCloseText}>{t('referral.close')}</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

// ── Tier Badge ────────────────────────────────────────────────────────────────
function TierBadge({ tier, name }: { tier: number; name: string }): ReactElement {
  const color = tier === 3 ? C.gold : tier === 2 ? C.primary : C.silver;
  const icon  = tier === 3 ? ICON_CROWN : tier === 2 ? ICON_TROPHY : ICON_STAR;
  return (
    <View style={[s.tierBadge, { borderColor: color, backgroundColor: color + '22' }]}>
      <Text style={s.tierIcon}>{icon}</Text>
      <Text style={[s.tierName, { color }]}>{name}</Text>
    </View>
  );
}

// ── Referred Friend Row ────────────────────────────────────────────────────────
function FriendRow({ item }: { item: ReferredFriend }): ReactElement {
  const joined = item.joinedAt !== null;
  return (
    <View style={s.friendRow}>
      <View style={s.friendAvatar}>
        <Text style={s.friendAvatarText}>{item.name.charAt(0)}</Text>
      </View>
      <View style={s.friendInfo}>
        <Text style={s.friendName}>{item.name}</Text>
        <View style={[s.friendBadge, joined ? s.badgeJoined : s.badgePending]}>
          <Text style={s.friendBadgeIcon}>{joined ? ICON_CHECK : ICON_CLOCK}</Text>
          <Text style={[s.friendBadgeText, { color: joined ? C.success : C.pending }]}>
            {joined ? t('referral.joined') : t('referral.pending')}
          </Text>
        </View>
      </View>
      <View style={s.friendPoints}>
        <Text style={s.friendPointsValue}>+{item.pointsEarned}</Text>
        <Text style={s.friendPointsLabel}>{t('referral.pts')}</Text>
      </View>
    </View>
  );
}

// ── Leaderboard Row ────────────────────────────────────────────────────────────
function LeaderboardRow({ item }: { item: LeaderboardEntry }): ReactElement {
  const rankIcon = item.rank === 1 ? ICON_CROWN : item.rank === 2 ? ICON_TROPHY : item.rank === 3 ? ICON_MEDAL : `${item.rank}.`;
  return (
    <View style={[s.lbRow, item.isMe && s.lbRowMe]}>
      <Text style={s.lbRank}>{rankIcon}</Text>
      <View style={s.lbAvatar}>
        <Text style={s.lbAvatarText}>{item.name.charAt(0)}</Text>
      </View>
      <Text style={[s.lbName, item.isMe && s.lbNameMe]} numberOfLines={1}>{item.name}</Text>
      <View style={s.lbCount}>
        <Text style={s.lbCountValue}>{item.referrals}</Text>
        <Text style={s.lbCountLabel}>{t('referral.referred')}</Text>
      </View>
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────
export default function ReferralScreen(): ReactElement {
  const router  = useRouter();

  const [stats, setStats]           = useState<ReferralStats | null>(null);
  const [friends, setFriends]       = useState<ReferredFriend[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading]       = useState(true);
  const [tab, setTab]               = useState<Tab>('friends');
  const [copied, setCopied]         = useState(false);
  const [qrVisible, setQrVisible]   = useState(false);

  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    void loadData();
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, friendsRes, lbRes] = await Promise.all([
        fetch('/v1/me/referral/stats').then((r) => r.json() as Promise<ReferralStats>),
        fetch('/v1/me/referral/friends').then((r) => r.json() as Promise<ReferredFriend[]>),
        fetch('/v1/referral/leaderboard').then((r) => r.json() as Promise<LeaderboardEntry[]>),
      ]);
      setStats(statsRes);
      setFriends(friendsRes);
      setLeaderboard(lbRes);

      if (statsRes) {
        const progress = statsRes.nextTierAt > 0
          ? Math.min(statsRes.totalReferred / statsRes.nextTierAt, 1)
          : 1;
        Animated.timing(progressAnim, {
          toValue: progress,
          duration: 800,
          useNativeDriver: false,
        }).start();
      }
    } catch {
      // silently show empty state
    } finally {
      setLoading(false);
    }
  }, [progressAnim]);

  const copyCode = useCallback(() => {
    if (!stats) return;
    Clipboard.setString(stats.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [stats]);

  const shareLink = useCallback(async () => {
    if (!stats) return;
    await Share.share({ message: `${t('referral.shareMessage', { code: stats.code })}\n${stats.link}` });
  }, [stats]);

  const shareWhatsApp = useCallback(() => {
    if (!stats) return;
    const msg = encodeURIComponent(`${t('referral.shareMessage', { code: stats.code })}\n${stats.link}`);
    void Linking.openURL(`whatsapp://send?text=${msg}`);
  }, [stats]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={s.centered}>
        <ActivityIndicator size="large" color={C.primary} />
      </SafeAreaView>
    );
  }

  const MOCK_STATS: ReferralStats = stats ?? {
    code: 'IRAQ1234',
    link: 'https://app.iraqmaps.iq/r/IRAQ1234',
    totalReferred: 4,
    totalPoints: 800,
    pendingCount: 1,
    currentTier: 2,
    currentTierName: t('referral.tierGold'),
    nextTierAt: 10,
    nextTierReward: t('referral.tier3Reward'),
  };

  const progressPct = MOCK_STATS.nextTierAt > 0
    ? Math.round((MOCK_STATS.totalReferred / MOCK_STATS.nextTierAt) * 100)
    : 100;

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backIcon}>{ICON_ARROW}</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('referral.title')}</Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* My Code Card */}
        <View style={s.codeCard}>
          <Text style={s.codeLabel}>{t('referral.myCode')}</Text>
          <Text style={s.codeValue}>{MOCK_STATS.code}</Text>
          <View style={s.codeActions}>
            <TouchableOpacity style={[s.codeBtn, copied && s.codeBtnCopied]} onPress={copyCode}>
              <Text style={s.codeBtnIcon}>{copied ? ICON_CHECK : ICON_COPY}</Text>
              <Text style={[s.codeBtnText, copied && s.codeBtnTextCopied]}>
                {copied ? t('referral.copied') : t('referral.copy')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.codeBtn} onPress={() => setQrVisible(true)}>
              <Text style={s.codeBtnIcon}>{ICON_QR}</Text>
              <Text style={s.codeBtnText}>{t('referral.showQr')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Share Buttons */}
        <View style={s.shareRow}>
          <TouchableOpacity style={s.whatsappBtn} onPress={shareWhatsApp}>
            <Text style={s.whatsappIcon}>{ICON_WHATSAPP}</Text>
            <Text style={s.whatsappText}>{t('referral.shareWhatsApp')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.shareBtn} onPress={shareLink}>
            <Text style={s.shareBtnIcon}>{ICON_SHARE}</Text>
            <Text style={s.shareBtnText}>{t('referral.shareMore')}</Text>
          </TouchableOpacity>
        </View>

        {/* Stats Row */}
        <View style={s.statsRow}>
          <View style={s.statBox}>
            <Text style={s.statValue}>{MOCK_STATS.totalReferred}</Text>
            <Text style={s.statLabel}>{ICON_PEOPLE} {t('referral.statReferred')}</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statBox}>
            <Text style={[s.statValue, { color: C.gold }]}>{MOCK_STATS.totalPoints}</Text>
            <Text style={s.statLabel}>{ICON_STAR} {t('referral.statPoints')}</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statBox}>
            <Text style={[s.statValue, { color: C.pending }]}>{MOCK_STATS.pendingCount}</Text>
            <Text style={s.statLabel}>{ICON_CLOCK} {t('referral.statPending')}</Text>
          </View>
        </View>

        {/* Tier Progress */}
        <View style={s.tierCard}>
          <View style={s.tierHeader}>
            <TierBadge tier={MOCK_STATS.currentTier} name={MOCK_STATS.currentTierName} />
            <Text style={s.tierProgress}>
              {MOCK_STATS.totalReferred} / {MOCK_STATS.nextTierAt} {t('referral.toNext')}
            </Text>
          </View>
          <View style={s.progressTrack}>
            <Animated.View
              style={[
                s.progressBar,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
          <Text style={s.progressPct}>{progressPct}%</Text>
          <View style={s.nextRewardRow}>
            <Text style={s.nextRewardIcon}>{ICON_GIFT}</Text>
            <Text style={s.nextRewardText}>
              {t('referral.nextReward')}: {MOCK_STATS.nextTierReward}
            </Text>
          </View>
          <View style={s.tierSteps}>
            {[
              { tier: 1, label: t('referral.tierSilver'), at: 0 },
              { tier: 2, label: t('referral.tierGold'), at: 5 },
              { tier: 3, label: t('referral.tierPlatinum'), at: 10 },
            ].map((step) => (
              <View key={step.tier} style={s.tierStep}>
                <View style={[s.tierDot, step.tier <= MOCK_STATS.currentTier && s.tierDotActive]} />
                <Text style={s.tierStepLabel}>{step.label}</Text>
                <Text style={s.tierStepAt}>{step.at}+</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Tabs */}
        <View style={s.tabRow}>
          <TouchableOpacity
            style={[s.tabBtn, tab === 'friends' && s.tabBtnActive]}
            onPress={() => setTab('friends')}
          >
            <Text style={[s.tabBtnText, tab === 'friends' && s.tabBtnTextActive]}>
              {ICON_PEOPLE} {t('referral.tabFriends')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tabBtn, tab === 'leaderboard' && s.tabBtnActive]}
            onPress={() => setTab('leaderboard')}
          >
            <Text style={[s.tabBtnText, tab === 'leaderboard' && s.tabBtnTextActive]}>
              {ICON_TROPHY} {t('referral.tabLeaderboard')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Friends List */}
        {tab === 'friends' && (
          <View style={s.listCard}>
            {friends.length === 0 ? (
              <View style={s.emptyBox}>
                <Text style={s.emptyIcon}>{ICON_FIRE}</Text>
                <Text style={s.emptyTitle}>{t('referral.emptyTitle')}</Text>
                <Text style={s.emptyBody}>{t('referral.emptyBody')}</Text>
              </View>
            ) : (
              friends.map((f) => <FriendRow key={f.id} item={f} />)
            )}
          </View>
        )}

        {/* Leaderboard */}
        {tab === 'leaderboard' && (
          <View style={s.listCard}>
            {leaderboard.length === 0 ? (
              <View style={s.emptyBox}>
                <Text style={s.emptyIcon}>{ICON_TROPHY}</Text>
                <Text style={s.emptyTitle}>{t('referral.lbEmpty')}</Text>
              </View>
            ) : (
              leaderboard.map((entry) => <LeaderboardRow key={entry.userId} item={entry} />)
            )}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* QR Modal */}
      <QrModal
        visible={qrVisible}
        code={MOCK_STATS.code}
        onClose={() => setQrVisible(false)}
      />
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  scroll:    { paddingHorizontal: 16, paddingTop: 8 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4,
  },
  backBtn:  { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 20, color: C.primary },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.text },

  // Code Card
  codeCard: {
    backgroundColor: C.primary, borderRadius: 16, padding: 24,
    alignItems: 'center', marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 4,
  },
  codeLabel: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginBottom: 8 },
  codeValue: {
    fontSize: 36, fontWeight: '900', color: '#FFFFFF', letterSpacing: 6,
    fontFamily: 'monospace', marginBottom: 20,
  },
  codeActions: { flexDirection: 'row', gap: 12 },
  codeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16,
  },
  codeBtnCopied: { backgroundColor: C.success },
  codeBtnIcon:   { fontSize: 16 },
  codeBtnText:   { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  codeBtnTextCopied: { color: '#FFFFFF' },

  // Share
  shareRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  whatsappBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#25D366', borderRadius: 12, paddingVertical: 14,
  },
  whatsappIcon: { fontSize: 20 },
  whatsappText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  shareBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: C.surface, borderRadius: 12, paddingVertical: 14,
    borderWidth: 1, borderColor: C.border,
  },
  shareBtnIcon: { fontSize: 18 },
  shareBtnText: { fontSize: 14, fontWeight: '600', color: C.primary },

  // Stats
  statsRow: {
    flexDirection: 'row', backgroundColor: C.surface, borderRadius: 16,
    padding: 16, marginBottom: 12, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  statBox:     { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 40, backgroundColor: C.border },
  statValue:   { fontSize: 24, fontWeight: '800', color: C.primary, marginBottom: 4 },
  statLabel:   { fontSize: 12, color: C.textSecondary, textAlign: 'center' },

  // Tier
  tierCard: {
    backgroundColor: C.surface, borderRadius: 16, padding: 20, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  tierHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  tierBadge:     { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: 20, paddingVertical: 4, paddingHorizontal: 10 },
  tierIcon:      { fontSize: 18 },
  tierName:      { fontSize: 14, fontWeight: '700' },
  tierProgress:  { fontSize: 13, color: C.textSecondary },
  progressTrack: { height: 10, backgroundColor: C.border, borderRadius: 5, overflow: 'hidden', marginBottom: 6 },
  progressBar:   { height: '100%', backgroundColor: C.gold, borderRadius: 5 },
  progressPct:   { fontSize: 12, color: C.textHint, textAlign: 'right' as const, marginBottom: 10 },
  nextRewardRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.goldLight, borderRadius: 10, padding: 10, marginBottom: 12 },
  nextRewardIcon:{ fontSize: 16 },
  nextRewardText:{ fontSize: 13, color: C.text, fontWeight: '500', flex: 1 },
  tierSteps:     { flexDirection: 'row', justifyContent: 'space-between' },
  tierStep:      { alignItems: 'center', gap: 4 },
  tierDot:       { width: 12, height: 12, borderRadius: 6, backgroundColor: C.border },
  tierDotActive: { backgroundColor: C.gold },
  tierStepLabel: { fontSize: 11, color: C.textSecondary },
  tierStepAt:    { fontSize: 10, color: C.textHint },

  // Tabs
  tabRow:        { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tabBtn:        { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  tabBtnActive:  { backgroundColor: C.primaryLight, borderColor: C.primary },
  tabBtnText:    { fontSize: 13, fontWeight: '600', color: C.textSecondary },
  tabBtnTextActive: { color: C.primary },

  // List
  listCard: {
    backgroundColor: C.surface, borderRadius: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  // Friend row
  friendRow:       { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: C.border + '60' },
  friendAvatar:    { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', marginEnd: 12 },
  friendAvatarText:{ fontSize: 18, fontWeight: '700', color: C.primary },
  friendInfo:      { flex: 1 },
  friendName:      { fontSize: 15, fontWeight: '600', color: C.text, marginBottom: 4 },
  friendBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: 8, paddingVertical: 2, paddingHorizontal: 8 },
  badgeJoined:     { backgroundColor: C.successLight },
  badgePending:    { backgroundColor: C.pendingLight },
  friendBadgeIcon: { fontSize: 12 },
  friendBadgeText: { fontSize: 12, fontWeight: '600' },
  friendPoints:    { alignItems: 'flex-end' },
  friendPointsValue:{ fontSize: 16, fontWeight: '800', color: C.gold },
  friendPointsLabel:{ fontSize: 11, color: C.textHint },

  // Leaderboard
  lbRow:       { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: C.border + '60' },
  lbRowMe:     { backgroundColor: C.primaryLight },
  lbRank:      { width: 32, fontSize: 18, textAlign: 'center', marginEnd: 8 },
  lbAvatar:    { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', marginEnd: 10 },
  lbAvatarText:{ fontSize: 16, fontWeight: '700', color: C.primary },
  lbName:      { flex: 1, fontSize: 15, fontWeight: '500', color: C.text },
  lbNameMe:    { fontWeight: '700', color: C.primary },
  lbCount:     { alignItems: 'flex-end' },
  lbCountValue:{ fontSize: 18, fontWeight: '800', color: C.primary },
  lbCountLabel:{ fontSize: 11, color: C.textHint },

  // Empty
  emptyBox:    { alignItems: 'center', padding: 40 },
  emptyIcon:   { fontSize: 48, marginBottom: 12 },
  emptyTitle:  { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 6, textAlign: 'center' },
  emptyBody:   { fontSize: 13, color: C.textSecondary, textAlign: 'center', lineHeight: 20 },

  // QR Modal
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  qrCard:          { backgroundColor: C.surface, borderRadius: 20, padding: 28, alignItems: 'center', width: 280 },
  qrTitle:         { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 20 },
  qrBox:           { alignItems: 'center', marginBottom: 16 },
  qrPlaceholder:   { fontSize: 80, marginBottom: 8 },
  qrCode:          { fontSize: 24, fontWeight: '900', letterSpacing: 4, color: C.primary, fontFamily: 'monospace' },
  qrHint:          { fontSize: 13, color: C.textSecondary, textAlign: 'center', marginBottom: 20 },
  qrClose:         { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32 },
  qrCloseText:     { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
