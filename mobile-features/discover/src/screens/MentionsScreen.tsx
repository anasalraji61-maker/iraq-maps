/**
 * MentionsScreen — posts, reviews and comments where the user is tagged.
 *
 * Features:
 *   - Posts where I'm tagged
 *   - Places where I'm mentioned in reviews
 *   - Comments where I'm mentioned
 *   - Reply to mention
 *   - "Clear all" mentions
 *   - Filter by type
 *
 * All text via t(). Layouts use start/end (RTL-safe).
 * Route: discover/mentions
 */
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  I18nManager,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { t } from '../strings';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const td = t as (k: any) => string;

I18nManager.forceRTL(true);

// ── Icons ──────────────────────────────────────────────────────────────────────
const ICON_ARROW    = '←';
const ICON_AT       = '@';
const ICON_POST     = '📝';
const ICON_REVIEW   = '⭐';
const ICON_COMMENT  = '💬';
const ICON_REPLY    = '↪';
const ICON_TRASH    = '🗑';
const _ICON_FILTER   = '🔍';
const _ICON_CHECK    = '✔';
const ICON_BELL     = '🔔';

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
  red:           '#C62828',
  redLight:      '#FFEBEE',
  purple:        '#6A1B9A',
  purpleLight:   '#F3E5F5',
  orange:        '#E65100',
  orangeLight:   '#FFF3E0',
};

// ── Types ──────────────────────────────────────────────────────────────────────
type MentionType = 'post' | 'review' | 'comment';

type Mention = {
  id: string;
  type: MentionType;
  fromUser: { id: string; name: string };
  excerpt: string;          // snippet of the text with the tag
  entityName: string;       // place name, post title, etc.
  entityId: string;
  createdAt: string;
  isRead: boolean;
};

type FilterType = 'all' | MentionType;

// ── Type config ────────────────────────────────────────────────────────────────
const TYPE_CONFIG: Record<MentionType, { icon: string; color: string; labelKey: string }> = {
  post:    { icon: ICON_POST,    color: C.primary, labelKey: 'mentions.typePost'    },
  review:  { icon: ICON_REVIEW,  color: C.orange,  labelKey: 'mentions.typeReview'  },
  comment: { icon: ICON_COMMENT, color: C.purple,  labelKey: 'mentions.typeComment' },
};

const FILTER_OPTIONS: { value: FilterType; labelKey: string }[] = [
  { value: 'all',     labelKey: 'mentions.filterAll'     },
  { value: 'post',    labelKey: 'mentions.filterPosts'   },
  { value: 'review',  labelKey: 'mentions.filterReviews' },
  { value: 'comment', labelKey: 'mentions.filterComments'},
];

// ── Reply Modal ────────────────────────────────────────────────────────────────
function ReplyModal({
  visible,
  mention,
  onClose,
  onSend,
}: {
  visible: boolean;
  mention: Mention | null;
  onClose: () => void;
  onSend: (text: string) => Promise<void>;
}): ReactElement {
  const [text, setText]         = useState('');
  const [sending, setSending]   = useState(false);

  const handleSend = useCallback(async () => {
    if (!text.trim()) return;
    setSending(true);
    await onSend(text.trim());
    setSending(false);
    setText('');
    onClose();
  }, [text, onSend, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.modalOverlay} onPress={onClose}>
        <Pressable style={s.replySheet} onPress={() => {}}>
          <Text style={s.replyTitle}>{t('mentions.replyTo', { name: mention?.fromUser.name ?? '' })}</Text>
          {mention && (
            <View style={s.replyQuote}>
              <Text style={s.replyQuoteText} numberOfLines={2}>{mention.excerpt}</Text>
            </View>
          )}
          <TextInput
            style={s.replyInput}
            value={text}
            onChangeText={setText}
            placeholder={t('mentions.replyPlaceholder')}
            placeholderTextColor={C.textHint}
            multiline
            maxLength={500}
            textAlign={I18nManager.isRTL ? 'right' : 'left'}
            autoFocus
          />
          <View style={s.replyActions}>
            <TouchableOpacity style={s.replyCancelBtn} onPress={onClose}>
              <Text style={s.replyCancelText}>{t('mentions.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.replySendBtn, (!text.trim() || sending) && s.replySendDisabled]}
              onPress={handleSend}
              disabled={!text.trim() || sending}
            >
              {sending
                ? <ActivityIndicator color="#FFFFFF" size="small" />
                : <Text style={s.replySendText}>{t('mentions.send')}</Text>
              }
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Mention Row ────────────────────────────────────────────────────────────────
function MentionRow({
  item,
  onReply,
  onDelete,
}: {
  item: Mention;
  onReply: (m: Mention) => void;
  onDelete: (id: string) => void;
}): ReactElement {
  const cfg  = TYPE_CONFIG[item.type];
  const date = new Date(item.createdAt).toLocaleDateString('ar-IQ', { day: 'numeric', month: 'short' });

  return (
    <View style={[s.mentionRow, !item.isRead && s.mentionRowUnread]}>
      {/* Type icon */}
      <View style={[s.mentionTypeIcon, { backgroundColor: cfg.color + '20' }]}>
        <Text style={{ fontSize: 20 }}>{cfg.icon}</Text>
      </View>
      {/* Content */}
      <View style={s.mentionContent}>
        <View style={s.mentionTop}>
          <Text style={s.mentionFrom} numberOfLines={1}>
            <Text style={s.mentionAt}>{ICON_AT}</Text> {item.fromUser.name}
          </Text>
          <Text style={s.mentionDate}>{date}</Text>
        </View>
        <Text style={s.mentionEntity} numberOfLines={1}>{item.entityName}</Text>
        <Text style={s.mentionExcerpt} numberOfLines={2}>{item.excerpt}</Text>
        <View style={s.mentionActions}>
          <TouchableOpacity style={s.replyBtn} onPress={() => onReply(item)}>
            <Text style={s.replyBtnIcon}>{ICON_REPLY}</Text>
            <Text style={s.replyBtnText}>{t('mentions.reply')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.deleteBtn} onPress={() => onDelete(item.id)}>
            <Text style={{ fontSize: 14, color: C.red }}>{ICON_TRASH}</Text>
          </TouchableOpacity>
        </View>
      </View>
      {/* Unread dot */}
      {!item.isRead && <View style={s.unreadDot} />}
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────
export default function MentionsScreen(): ReactElement {
  const router = useRouter();

  const [mentions, setMentions]       = useState<Mention[]>([]);
  const [filter, setFilter]           = useState<FilterType>('all');
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [replyTarget, setReplyTarget] = useState<Mention | null>(null);

  useEffect(() => { void load(); }, []);

  const load = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetch('/v1/me/mentions').then((r) => r.json() as Promise<Mention[]>);
      setMentions(res);
    } catch {
      setMentions([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleClearAll = useCallback(() => {
    Alert.alert(t('mentions.clearTitle'), t('mentions.clearBody'), [
      { text: t('mentions.cancel'), style: 'cancel' },
      {
        text: t('mentions.clearConfirm'),
        style: 'destructive',
        onPress: async () => {
          try {
            await fetch('/v1/me/mentions', { method: 'DELETE' });
            setMentions([]);
          } catch {
            Alert.alert(t('mentions.clearError'));
          }
        },
      },
    ]);
  }, []);

  const handleDelete = useCallback((id: string) => {
    setMentions((prev) => prev.filter((m) => m.id !== id));
    void fetch(`/v1/me/mentions/${id}`, { method: 'DELETE' }).catch(() => {});
  }, []);

  const handleSendReply = useCallback(async (text: string) => {
    if (!replyTarget) return;
    await fetch('/v1/me/mentions/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mentionId: replyTarget.id, text }),
    });
  }, [replyTarget]);

  const filtered = filter === 'all' ? mentions : mentions.filter((m) => m.type === filter);
  const unreadCount = mentions.filter((m) => !m.isRead).length;

  const renderItem = useCallback(({ item }: { item: Mention }) => (
    <MentionRow item={item} onReply={setReplyTarget} onDelete={handleDelete} />
  ), [handleDelete]);

  const ListEmpty = (
    <View style={s.emptyBox}>
      <Text style={s.emptyIcon}>{ICON_BELL}</Text>
      <Text style={s.emptyTitle}>{t('mentions.emptyTitle')}</Text>
      <Text style={s.emptyBody}>{t('mentions.emptyBody')}</Text>
    </View>
  );

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backIcon}>{ICON_ARROW}</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>{t('mentions.title')}</Text>
          {unreadCount > 0 && (
            <View style={s.unreadBadge}>
              <Text style={s.unreadBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        {mentions.length > 0 ? (
          <TouchableOpacity onPress={handleClearAll} style={s.clearBtn}>
            <Text style={s.clearBtnText}>{t('mentions.clearAll')}</Text>
          </TouchableOpacity>
        ) : (
          <View style={s.backBtn} />
        )}
      </View>

      {/* Filter Tabs */}
      <View style={s.filterRow}>
        {FILTER_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[s.filterBtn, filter === opt.value && s.filterBtnActive]}
            onPress={() => setFilter(opt.value)}
          >
            <Text style={[s.filterBtnText, filter === opt.value && s.filterBtnTextActive]}>
              {td(opt.labelKey)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={filtered.length === 0 ? s.emptyContainer : s.listContent}
          ListEmptyComponent={ListEmpty}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.primary} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Reply Modal */}
      <ReplyModal
        visible={replyTarget !== null}
        mention={replyTarget}
        onClose={() => setReplyTarget(null)}
        onSend={handleSendReply}
      />
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent:   { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 },
  emptyContainer:{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },

  // Header
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  backBtn:      { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backIcon:     { fontSize: 20, color: C.primary },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  headerTitle:  { fontSize: 18, fontWeight: '700', color: C.text },
  unreadBadge:  { backgroundColor: C.primary, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  unreadBadgeText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
  clearBtn:     { paddingHorizontal: 8, paddingVertical: 6 },
  clearBtnText: { fontSize: 13, color: C.red, fontWeight: '600' },

  // Filter
  filterRow:         { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  filterBtn:         { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  filterBtnActive:   { borderColor: C.primary, backgroundColor: C.primaryLight },
  filterBtnText:     { fontSize: 12, fontWeight: '500', color: C.textSecondary },
  filterBtnTextActive: { color: C.primary, fontWeight: '700' },

  // Mention row
  mentionRow: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: C.surface,
    borderRadius: 16, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  mentionRowUnread:  { borderStartWidth: 3, borderStartColor: C.primary },
  mentionTypeIcon:   { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginEnd: 12 },
  mentionContent:    { flex: 1 },
  mentionTop:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  mentionFrom:       { fontSize: 14, fontWeight: '700', color: C.text, flex: 1 },
  mentionAt:         { fontSize: 12, color: C.primary },
  mentionDate:       { fontSize: 11, color: C.textHint, marginStart: 8 },
  mentionEntity:     { fontSize: 12, color: C.primary, fontWeight: '600', marginBottom: 4 },
  mentionExcerpt:    { fontSize: 13, color: C.textSecondary, lineHeight: 18, marginBottom: 8 },
  mentionActions:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  replyBtn:          { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.primaryLight, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 },
  replyBtnIcon:      { fontSize: 14 },
  replyBtnText:      { fontSize: 12, fontWeight: '600', color: C.primary },
  deleteBtn:         { padding: 4 },
  unreadDot:         { width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary, marginStart: 8, marginTop: 4 },

  // Empty
  emptyBox:    { alignItems: 'center' },
  emptyIcon:   { fontSize: 56, marginBottom: 16 },
  emptyTitle:  { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 8, textAlign: 'center' },
  emptyBody:   { fontSize: 14, color: C.textSecondary, textAlign: 'center', lineHeight: 22 },

  // Reply Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  replySheet:   { backgroundColor: C.surface, borderTopStartRadius: 24, borderTopEndRadius: 24, padding: 24, paddingBottom: 40 },
  replyTitle:   { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 12 },
  replyQuote:   { backgroundColor: C.bg, borderRadius: 10, padding: 10, borderStartWidth: 3, borderStartColor: C.primary, marginBottom: 12 },
  replyQuoteText:{ fontSize: 13, color: C.textSecondary, fontStyle: 'italic' },
  replyInput:   { borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, fontSize: 15, color: C.text, minHeight: 80, textAlignVertical: 'top', marginBottom: 12 },
  replyActions: { flexDirection: 'row', gap: 10 },
  replyCancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  replyCancelText:{ fontSize: 14, fontWeight: '600', color: C.textSecondary },
  replySendBtn:   { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: C.primary },
  replySendDisabled: { opacity: 0.5 },
  replySendText:  { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
