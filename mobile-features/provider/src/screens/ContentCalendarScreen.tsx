/**
 * ContentCalendarScreen — schedule posts, view calendar, best-time suggestions.
 */
import { Screen } from '@iraq-maps/ui';
import { type ReactElement, useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  I18nManager,
  Modal,
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

const C = {
  primary: '#1976D2',
  green: '#10B981',
  amber: '#F59E0B',
  red: '#EF4444',
  purple: '#7C3AED',
  bg: '#F5F5F5',
  card: '#FFFFFF',
  text: '#1A1A1A',
  sub: '#666666',
  muted: '#AAAAAA',
  border: '#E0E0E0',
};

type PostStatus = 'scheduled' | 'published' | 'draft';

interface ScheduledPost {
  id: string;
  title: string;
  body: string;
  scheduledAt: Date;
  status: PostStatus;
  performanceViews?: number;
  performanceLikes?: number;
}

interface BestTimeSlot {
  dayLabel: string;
  hour: number;
  score: number; // 0..100
}

function mockPosts(): ScheduledPost[] {
  const now = new Date();
  return [
    { id: '1', title: 'عرض نهاية الأسبوع', body: 'خصم 20% على جميع خدماتنا هذا الجمعة والسبت!', scheduledAt: new Date(now.getTime() + 2 * 86400_000), status: 'scheduled' },
    { id: '2', title: 'ساعات العمل الجديدة', body: 'نُبشّركم بتمديد أوقات عملنا حتى الساعة 11 مساءً.', scheduledAt: new Date(now.getTime() + 5 * 86400_000), status: 'scheduled' },
    { id: '3', title: 'مرحباً بكم في رمضان', body: 'بمناسبة الشهر الفضيل نقدم لكم قائمة خاصة.', scheduledAt: new Date(now.getTime() - 3 * 86400_000), status: 'published', performanceViews: 1240, performanceLikes: 87 },
    { id: '4', title: 'منتج جديد', body: 'أعلن عن إضافة خدمة التوصيل.', scheduledAt: new Date(now.getTime() - 10 * 86400_000), status: 'published', performanceViews: 860, performanceLikes: 54 },
    { id: '5', title: 'مسودة مقال', body: 'محتوى قيد الكتابة...', scheduledAt: new Date(now.getTime() + 1 * 86400_000), status: 'draft' },
  ];
}

function mockBestTimes(): BestTimeSlot[] {
  return [
    { dayLabel: 'جمعة', hour: 18, score: 95 },
    { dayLabel: 'سبت', hour: 12, score: 88 },
    { dayLabel: 'إثنين', hour: 9, score: 76 },
    { dayLabel: 'أربعاء', hour: 20, score: 71 },
  ];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toLocaleDateString('ar-IQ', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatHour(h: number): string {
  const suffix = h < 12 ? 'ص' : 'م';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:00 ${suffix}`;
}

function statusColor(s: PostStatus): string {
  return s === 'published' ? C.green : s === 'scheduled' ? C.primary : C.amber;
}

function statusLabel(s: PostStatus): string {
  return s === 'published'
    ? t('calendar.statusPublished')
    : s === 'scheduled'
    ? t('calendar.statusScheduled')
    : t('calendar.statusDraft');
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: ReactElement | ReactElement[] }): ReactElement {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function PostCard({
  post,
  onEdit,
  onDelete,
  onBoost,
}: {
  post: ScheduledPost;
  onEdit: (p: ScheduledPost) => void;
  onDelete: (id: string) => void;
  onBoost: (id: string) => void;
}): ReactElement {
  const color = statusColor(post.status);
  return (
    <View style={[styles.postCard, { borderStartColor: color }]}>
      <View style={styles.postHeader}>
        <Text style={styles.postTitle}>{post.title}</Text>
        <View style={[styles.statusBadge, { backgroundColor: `${color}22` }]}>
          <Text style={[styles.statusText, { color }]}>{statusLabel(post.status)}</Text>
        </View>
      </View>
      <Text style={styles.postBody} numberOfLines={2}>{post.body}</Text>
      <Text style={styles.postDate}>{formatDate(post.scheduledAt)}</Text>
      {post.status === 'published' && post.performanceViews !== undefined && (
        <View style={styles.perfRow}>
          <Text style={styles.perfText}>👁 {post.performanceViews}</Text>
          <Text style={styles.perfText}>❤️ {post.performanceLikes}</Text>
        </View>
      )}
      <View style={styles.postActions}>
        {post.status !== 'published' && (
          <TouchableOpacity style={styles.actionBtn} onPress={() => onEdit(post)}>
            <Text style={styles.actionBtnText}>{t('calendar.edit')}</Text>
          </TouchableOpacity>
        )}
        {post.status === 'published' && (
          <TouchableOpacity style={[styles.actionBtn, { borderColor: C.purple }]} onPress={() => onBoost(post.id)}>
            <Text style={[styles.actionBtnText, { color: C.purple }]}>{t('calendar.boost')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.actionBtn, { borderColor: C.red }]}
          onPress={() =>
            Alert.alert(t('calendar.deleteConfirmTitle'), t('calendar.deleteConfirmBody'), [
              { text: t('calendar.cancel'), style: 'cancel' },
              { text: t('calendar.delete'), style: 'destructive', onPress: () => onDelete(post.id) },
            ])
          }
        >
          <Text style={[styles.actionBtnText, { color: C.red }]}>{t('calendar.delete')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

interface PostFormData {
  title: string;
  body: string;
  scheduledDate: string;
  scheduledTime: string;
}

function PostEditorModal({
  visible,
  initial,
  onSave,
  onClose,
}: {
  visible: boolean;
  initial: Partial<PostFormData> | null;
  onSave: (d: PostFormData) => void;
  onClose: () => void;
}): ReactElement {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [date, setDate] = useState(initial?.scheduledDate ?? '');
  const [time, setTime] = useState(initial?.scheduledTime ?? '09:00');

  useEffect(() => {
    if (visible) {
      setTitle(initial?.title ?? '');
      setBody(initial?.body ?? '');
      setDate(initial?.scheduledDate ?? '');
      setTime(initial?.scheduledTime ?? '09:00');
    }
  }, [visible, initial]);

  const valid = title.trim().length > 0 && body.trim().length > 0 && date.trim().length > 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalRoot}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalClose}>{t('calendar.cancel')}</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{t('calendar.editPost')}</Text>
          <TouchableOpacity onPress={() => valid && onSave({ title, body, scheduledDate: date, scheduledTime: time })} disabled={!valid}>
            <Text style={[styles.modalSave, { opacity: valid ? 1 : 0.4 }]}>{t('calendar.save')}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.modalContent}>
          <Text style={styles.fieldLabel}>{t('calendar.postTitle')}</Text>
          <TextInput
            style={styles.fieldInput}
            value={title}
            onChangeText={setTitle}
            placeholder={t('calendar.postTitlePlaceholder')}
            placeholderTextColor={C.muted}
          />
          <Text style={styles.fieldLabel}>{t('calendar.postBody')}</Text>
          <TextInput
            style={[styles.fieldInput, styles.fieldTextArea]}
            value={body}
            onChangeText={setBody}
            multiline
            numberOfLines={5}
            placeholder={t('calendar.postBodyPlaceholder')}
            placeholderTextColor={C.muted}
          />
          <Text style={styles.fieldLabel}>{t('calendar.scheduledDate')}</Text>
          <TextInput
            style={styles.fieldInput}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={C.muted}
            keyboardType="numeric"
          />
          <Text style={styles.fieldLabel}>{t('calendar.scheduledTime')}</Text>
          <TextInput
            style={styles.fieldInput}
            value={time}
            onChangeText={setTime}
            placeholder="HH:MM"
            placeholderTextColor={C.muted}
            keyboardType="numeric"
          />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function BestTimeRow({ slot }: { slot: BestTimeSlot }): ReactElement {
  const color = slot.score >= 85 ? C.green : slot.score >= 65 ? C.primary : C.amber;
  return (
    <View style={styles.bestTimeRow}>
      <Text style={styles.bestTimeDay}>{slot.dayLabel}</Text>
      <Text style={styles.bestTimeHour}>{formatHour(slot.hour)}</Text>
      <View style={styles.bestTimeTrack}>
        <View style={[styles.bestTimeFill, { width: `${slot.score}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.bestTimeScore, { color }]}>{slot.score}%</Text>
    </View>
  );
}

// ─── Calendar mini-view (week strip) ─────────────────────────────────────────

function WeekCalendar({ posts }: { posts: ScheduledPost[] }): ReactElement {
  const today = new Date();
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today.getTime() + i * 86400_000);
    const dayPosts = posts.filter((p) => {
      const pd = p.scheduledAt;
      return pd.getDate() === d.getDate() && pd.getMonth() === d.getMonth();
    });
    return { date: d, posts: dayPosts };
  });

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.weekRow}>
        {days.map(({ date, posts: dp }, i) => {
          const isToday = i === 0;
          const hasPosts = dp.length > 0;
          return (
            <View key={i} style={[styles.dayCell, isToday && styles.dayCellToday]}>
              <Text style={[styles.dayName, isToday && styles.dayCellTodayText]}>
                {date.toLocaleDateString('ar-IQ', { weekday: 'narrow' })}
              </Text>
              <Text style={[styles.dayNum, isToday && styles.dayCellTodayText]}>
                {date.getDate()}
              </Text>
              {hasPosts && (
                <View style={styles.dayDotRow}>
                  {dp.slice(0, 3).map((p, pi) => (
                    <View key={pi} style={[styles.dayDot, { backgroundColor: statusColor(p.status) }]} />
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export function ContentCalendarScreen({ providerId }: { providerId: string }): ReactElement {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [bestTimes, setBestTimes] = useState<BestTimeSlot[]>([]);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingPost, setEditingPost] = useState<ScheduledPost | null>(null);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'published' | 'draft'>('upcoming');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    await new Promise((r) => setTimeout(r, 500));
    setPosts(mockPosts());
    setBestTimes(mockBestTimes());
    if (refresh) setRefreshing(false); else setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleDelete = useCallback((id: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleBoost = useCallback((id: string) => {
    Alert.alert(t('calendar.boostTitle'), t('calendar.boostBody'));
  }, []);

  const handleEdit = useCallback((post: ScheduledPost) => {
    setEditingPost(post);
    setEditorVisible(true);
  }, []);

  const handleSave = useCallback((data: PostFormData) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === editingPost?.id
          ? { ...p, title: data.title, body: data.body, scheduledAt: new Date(`${data.scheduledDate}T${data.scheduledTime}`) }
          : p,
      ),
    );
    setEditorVisible(false);
    setEditingPost(null);
  }, [editingPost]);

  const handleNew = useCallback(() => {
    setEditingPost(null);
    setEditorVisible(true);
  }, []);

  const filteredPosts = posts.filter((p) => {
    if (activeTab === 'upcoming') return p.status === 'scheduled' || p.status === 'draft';
    if (activeTab === 'published') return p.status === 'published';
    return p.status === 'draft';
  });

  const TABS: Array<{ key: 'upcoming' | 'published' | 'draft'; label: string }> = [
    { key: 'upcoming', label: t('calendar.tabUpcoming') },
    { key: 'published', label: t('calendar.tabPublished') },
    { key: 'draft', label: t('calendar.tabDraft') },
  ];

  return (
    <Screen>
      <SafeAreaView style={styles.root}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.screenTitle}>{t('calendar.title')}</Text>
            <TouchableOpacity style={styles.newBtn} onPress={handleNew}>
              <Text style={styles.newBtnText}>+ {t('calendar.newPost')}</Text>
            </TouchableOpacity>
          </View>

          {/* Calendar strip */}
          {loading ? (
            <SkeletonBlock width="100%" height={72} />
          ) : (
            <SectionCard title={t('calendar.calendarView')}>
              <WeekCalendar posts={posts} />
            </SectionCard>
          )}

          {/* Best times */}
          <SectionCard title={t('calendar.bestTimes')}>
            <>
              {loading ? (
                <View style={{ gap: 8 }}>
                  {[1, 2, 3].map((k) => <SkeletonBlock key={k} width="100%" height={28} />)}
                </View>
              ) : (
                bestTimes.map((slot, i) => <BestTimeRow key={i} slot={slot} />)
              )}
            </>
          </SectionCard>

          {/* Posts list with tabs */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('calendar.posts')}</Text>
            {/* Tabs */}
            <View style={styles.tabRow}>
              {TABS.map((tab) => (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.tab, activeTab === tab.key && styles.tabActive]}
                  onPress={() => setActiveTab(tab.key)}
                >
                  <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {loading ? (
              <View style={{ gap: 8 }}>
                {[1, 2].map((k) => <SkeletonBlock key={k} width="100%" height={100} />)}
              </View>
            ) : filteredPosts.length === 0 ? (
              <Text style={styles.emptyText}>{t('calendar.noPosts')}</Text>
            ) : (
              <View style={{ gap: 10 }}>
                {filteredPosts.map((p) => (
                  <PostCard key={p.id} post={p} onEdit={handleEdit} onDelete={handleDelete} onBoost={handleBoost} />
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>

      <PostEditorModal
        visible={editorVisible}
        initial={
          editingPost
            ? {
                title: editingPost.title,
                body: editingPost.body,
                scheduledDate: editingPost.scheduledAt.toISOString().slice(0, 10),
                scheduledTime: editingPost.scheduledAt.toISOString().slice(11, 16),
              }
            : null
        }
        onSave={handleSave}
        onClose={() => setEditorVisible(false)}
      />
    </Screen>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  screenTitle: { fontSize: 20, fontWeight: '700', color: C.text },
  newBtn: { backgroundColor: C.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  newBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  card: { backgroundColor: C.card, borderRadius: 12, padding: 14, gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  tabRow: { flexDirection: 'row', gap: 6 },
  tab: { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 8, backgroundColor: '#F0F0F0' },
  tabActive: { backgroundColor: C.primary },
  tabText: { fontSize: 12, fontWeight: '600', color: C.sub },
  tabTextActive: { color: '#FFF' },
  emptyText: { textAlign: 'center', color: C.muted, fontSize: 13, paddingVertical: 16 },
  postCard: { borderRadius: 10, backgroundColor: '#F9FAFB', padding: 12, borderStartWidth: 3, gap: 6 },
  postHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  postTitle: { fontSize: 14, fontWeight: '700', color: C.text, flex: 1 },
  statusBadge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },
  postBody: { fontSize: 12, color: C.sub, lineHeight: 18 },
  postDate: { fontSize: 11, color: C.muted },
  perfRow: { flexDirection: 'row', gap: 12 },
  perfText: { fontSize: 12, color: C.sub },
  postActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionBtn: { borderWidth: 1, borderColor: C.border, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  actionBtnText: { fontSize: 12, fontWeight: '600', color: C.sub },
  weekRow: { flexDirection: 'row', gap: 6 },
  dayCell: { width: 44, alignItems: 'center', paddingVertical: 6, borderRadius: 10, backgroundColor: '#F5F5F5', gap: 2 },
  dayCellToday: { backgroundColor: C.primary },
  dayCellTodayText: { color: '#FFF' },
  dayName: { fontSize: 10, color: C.muted },
  dayNum: { fontSize: 15, fontWeight: '700', color: C.text },
  dayDotRow: { flexDirection: 'row', gap: 2 },
  dayDot: { width: 5, height: 5, borderRadius: 3 },
  bestTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bestTimeDay: { width: 40, fontSize: 12, color: C.sub },
  bestTimeHour: { width: 56, fontSize: 12, fontWeight: '600', color: C.text },
  bestTimeTrack: { flex: 1, height: 10, backgroundColor: '#EEE', borderRadius: 5, overflow: 'hidden' },
  bestTimeFill: { height: '100%', borderRadius: 5 },
  bestTimeScore: { width: 36, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  // Modal
  modalRoot: { flex: 1, backgroundColor: '#FFF' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  modalClose: { fontSize: 15, color: C.red },
  modalTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  modalSave: { fontSize: 15, color: C.primary, fontWeight: '700' },
  modalContent: { padding: 16, gap: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: C.sub, marginTop: 8 },
  fieldInput: { borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 10, fontSize: 14, color: C.text },
  fieldTextArea: { height: 120, textAlignVertical: 'top' },
});
