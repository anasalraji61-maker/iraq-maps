/**
 * ReviewResponseScreen – provider review management panel.
 *
 * Lists reviews for the provider's registered place, allows replying,
 * editing and tracking which reviews have been responded to.
 * Uses the live reviewsContract endpoints.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApiBaseUrl, useSession } from '@iraq-maps/mobile-kit';
import { fullReviewsContract, type FullReview } from '@iraq-maps/contracts';
type Review = FullReview;
import { initClient } from '@ts-rest/core';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  I18nManager,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIMARY = '#1976D2';
const GOLD = '#F5A623';
const GREY = '#9E9E9E';
const MAX_RESPONSE = 500;
const STAR = '★';
const STAR_EMPTY = '☆';

// ── Sub-components ────────────────────────────────────────────────────────────

function Stars({ rating }: { rating: number }): ReactElement {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Text key={n} style={{ color: n <= rating ? GOLD : '#DDD', fontSize: 14 }}>
          {n <= rating ? STAR : STAR_EMPTY}
        </Text>
      ))}
    </View>
  );
}

function RatingBadge({ rating }: { rating: number }): ReactElement {
  const color = rating >= 4 ? '#2E7D32' : rating === 3 ? '#F57F17' : '#C62828';
  return (
    <View style={[badgeStyles.badge, { backgroundColor: color }]}>
      <Text style={badgeStyles.text}>{rating}</Text>
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}): ReactElement {
  return (
    <TouchableOpacity
      style={[chipStyles.chip, active && chipStyles.chipActive]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Text style={[chipStyles.label, active && chipStyles.labelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Reply modal ───────────────────────────────────────────────────────────────

interface ReplyModalProps {
  visible: boolean;
  review: Review | null;
  existing: string;
  onSave: (text: string) => Promise<void>;
  onClose: () => void;
}

function ReplyModal({ visible, review, existing, onSave, onClose }: ReplyModalProps): ReactElement {
  const [text, setText] = useState(existing);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    setText(existing);
  }, [existing, visible]);

  const charsLeft = MAX_RESPONSE - text.length;
  const canSave = text.trim().length > 0 && text.length <= MAX_RESPONSE && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave(text.trim());
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <KeyboardAvoidingView
        style={modalStyles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={modalStyles.sheet}>
          {/* Handle */}
          <View style={modalStyles.handle} />

          <Text style={modalStyles.title}>{t('reviewResponse.respond')}</Text>

          {/* The review being responded to */}
          {review && (
            <View style={modalStyles.reviewSnippet}>
              <Stars rating={review.rating} />
              {review.text.length > 0 && (
                <Text style={modalStyles.reviewSnippetText} numberOfLines={3}>
                  {review.text}
                </Text>
              )}
            </View>
          )}

          <TextInput
            ref={inputRef}
            style={modalStyles.input}
            value={text}
            onChangeText={setText}
            placeholder={t('reviewResponse.responsePlaceholder')}
            placeholderTextColor={GREY}
            multiline
            maxLength={MAX_RESPONSE}
            textAlignVertical="top"
            textAlign={I18nManager.isRTL ? 'right' : 'left'}
            autoFocus
            testID="review-response-input"
          />

          <Text
            style={[modalStyles.charsLeft, charsLeft < 50 && { color: '#F44336' }]}
          >
            {t('reviewResponse.charsMax', { max: MAX_RESPONSE })} — {t('reviewResponse.charsMax', { max: charsLeft })} {/* reuse key */}
          </Text>
          <Text style={modalStyles.charsHint}>
            {charsLeft} / {MAX_RESPONSE}
          </Text>

          <View style={modalStyles.btnRow}>
            <TouchableOpacity
              style={[modalStyles.btn, modalStyles.btnCancel]}
              onPress={onClose}
              accessibilityRole="button"
            >
              <Text style={modalStyles.btnCancelText}>{t('reviewResponse.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[modalStyles.btn, modalStyles.btnSave, !canSave && modalStyles.btnDisabled]}
              onPress={handleSave}
              disabled={!canSave}
              accessibilityRole="button"
              testID="review-response-save-btn"
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={modalStyles.btnSaveText}>{t('reviewResponse.save')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Review card ───────────────────────────────────────────────────────────────

interface ReviewCardProps {
  review: Review;
  onReply: (review: Review) => void;
  onEditReply: (review: Review) => void;
}

function ReviewCard({ review, onReply, onEditReply }: ReviewCardProps): ReactElement {
  const hasResponse = review.response !== null;
  const isPositive = review.rating >= 4;
  const isNegative = review.rating <= 2;

  return (
    <View style={cardStyles.container}>
      {/* Header */}
      <View style={cardStyles.header}>
        <View style={{ gap: 4 }}>
          <Stars rating={review.rating} />
          <Text style={cardStyles.date}>
            {new Date(review.createdAt).toLocaleDateString('ar-IQ', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </Text>
        </View>
        <RatingBadge rating={review.rating} />
      </View>

      {/* Tone indicator */}
      {isPositive && (
        <View style={[cardStyles.tonePill, { backgroundColor: '#E8F5E9' }]}>
          <Text style={[cardStyles.tonePillText, { color: '#2E7D32' }]}>
            {t('reviewResponse.stars', { n: review.rating })} — {/* positive label */}
            {review.rating === 5 ? '⭐ ممتاز' : '👍 جيد'}
          </Text>
        </View>
      )}
      {isNegative && (
        <View style={[cardStyles.tonePill, { backgroundColor: '#FFEBEE' }]}>
          <Text style={[cardStyles.tonePillText, { color: '#C62828' }]}>
            {review.rating === 1 ? '⚠️ سلبي جداً' : '⚠️ يحتاج اهتماماً'}
          </Text>
        </View>
      )}

      {/* Review text */}
      {review.text.length > 0 && (
        <Text style={cardStyles.reviewText}>{review.text}</Text>
      )}

      {/* Provider response */}
      {hasResponse && review.response && (
        <View style={cardStyles.responseBox}>
          <Text style={cardStyles.responseLabel}>{t('reviewResponse.ownerResponse')}</Text>
          <Text style={cardStyles.responseText}>{review.response.text}</Text>
          <TouchableOpacity
            onPress={() => onEditReply(review)}
            accessibilityRole="button"
            style={cardStyles.editResponseBtn}
          >
            <Text style={cardStyles.editResponseText}>{t('reviewResponse.editResponse')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Action buttons */}
      {!hasResponse && (
        <View style={cardStyles.actions}>
          <TouchableOpacity
            style={[cardStyles.replyBtn, isNegative && cardStyles.replyBtnUrgent]}
            onPress={() => onReply(review)}
            accessibilityRole="button"
            testID={`review-reply-btn-${review.id}`}
          >
            <Text style={cardStyles.replyBtnText}>
              {isNegative ? '⚠️ ' : ''}{t('reviewResponse.respond')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Helpful count */}
      {review.helpfulCount > 0 && (
        <Text style={cardStyles.helpfulCount}>
          👍 {review.helpfulCount}
        </Text>
      )}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function ReviewResponseScreen(): ReactElement {
  const router = useRouter();
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const baseUrl = useApiBaseUrl();
  const session = useSession();
  const userId = session.state.status === 'signedIn' ? session.state.user.id : null;

  const client = useMemo(
    () => initClient(fullReviewsContract, { baseUrl, baseHeaders: {} }),
    [baseUrl],
  );

  // ── State ───────────────────────────────────────────────────────────────────

  const [reviews, setReviews] = useState<Review[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filterRespondedOnly, setFilterRespondedOnly] = useState<boolean | null>(null); // null = all, true = responded, false = unresponded
  const [filterRating, setFilterRating] = useState<number | null>(null);

  const [replyModalVisible, setReplyModalVisible] = useState(false);
  const [activeReview, setActiveReview] = useState<Review | null>(null);
  const [existingResponse, setExistingResponse] = useState('');

  // ── Derived ─────────────────────────────────────────────────────────────────

  const filteredReviews = useMemo(() => {
    let list = reviews;
    if (filterRespondedOnly === true) list = list.filter((r) => r.response !== null);
    if (filterRespondedOnly === false) list = list.filter((r) => r.response === null);
    if (filterRating !== null) list = list.filter((r) => r.rating === filterRating);
    return list;
  }, [reviews, filterRespondedOnly, filterRating]);

  const unansweredCount = useMemo(
    () => reviews.filter((r) => r.response === null).length,
    [reviews],
  );

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchReviews = useCallback(
    async (cursor?: string, append = false) => {
      if (!placeId) return;
      try {
        const res = await client.getPlaceReviews({
          params: { placeId: placeId as never },
          query: { sort: 'newest', limit: 20, cursor },
        });
        if (res.status === 200) {
          const items = res.body.items as unknown as Review[];
          setReviews((prev) => (append ? [...prev, ...items] : items));
          setNextCursor(res.body.nextCursor);
          setError(null);
        }
      } catch {
        setError('load_error');
      }
    },
    [placeId, client],
  );

  useEffect(() => {
    setLoading(true);
    fetchReviews().finally(() => setLoading(false));
  }, [fetchReviews]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchReviews();
    setRefreshing(false);
  };

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    await fetchReviews(nextCursor, true);
    setLoadingMore(false);
  };

  // ── Reply handlers ───────────────────────────────────────────────────────────

  const openReply = useCallback((review: Review) => {
    setActiveReview(review);
    setExistingResponse(review.response?.text ?? '');
    setReplyModalVisible(true);
  }, []);

  const handleSaveResponse = useCallback(
    async (text: string) => {
      if (!activeReview) return;
      try {
        const res = await client.respondToReview({
          params: { id: activeReview.id },
          body: { text },
        });
        if (res.status === 200) {
          const updated = res.body as unknown as Review['response'];
          // Optimistically update local review list
          setReviews((prev) =>
            prev.map((r) =>
              r.id === activeReview.id ? { ...r, response: updated } : r,
            ),
          );
          Alert.alert(t('reviewResponse.savedSuccess'));
        } else {
          Alert.alert('خطأ', 'تعذّر حفظ الرد');
        }
      } catch {
        Alert.alert('خطأ', 'تعذّر حفظ الرد');
      }
    },
    [activeReview, client],
  );

  // ── Render ───────────────────────────────────────────────────────────────────

  const renderHeader = () => (
    <View style={listStyles.listHeader}>
      {/* Stats row */}
      <View style={listStyles.statsRow}>
        <View style={listStyles.statBox}>
          <Text style={listStyles.statNum}>{reviews.length}</Text>
          <Text style={listStyles.statLabel}>مجموع التقييمات</Text>
        </View>
        <View style={listStyles.statBox}>
          <Text style={[listStyles.statNum, { color: unansweredCount > 0 ? '#F57F17' : '#2E7D32' }]}>
            {unansweredCount}
          </Text>
          <Text style={listStyles.statLabel}>بدون رد</Text>
        </View>
        <View style={listStyles.statBox}>
          <Text style={[listStyles.statNum, { color: GOLD }]}>
            {reviews.length > 0
              ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
              : '—'}
          </Text>
          <Text style={listStyles.statLabel}>متوسط التقييم</Text>
        </View>
      </View>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={listStyles.filtersRow}>
        <FilterChip
          label="الكل"
          active={filterRespondedOnly === null}
          onPress={() => setFilterRespondedOnly(null)}
        />
        <FilterChip
          label="بدون رد"
          active={filterRespondedOnly === false}
          onPress={() => setFilterRespondedOnly(false)}
        />
        <FilterChip
          label="تمت الإجابة"
          active={filterRespondedOnly === true}
          onPress={() => setFilterRespondedOnly(true)}
        />
        {[5, 4, 3, 2, 1].map((r) => (
          <FilterChip
            key={r}
            label={`${r} ⭐`}
            active={filterRating === r}
            onPress={() => setFilterRating((prev) => (prev === r ? null : r))}
          />
        ))}
      </ScrollView>
    </View>
  );

  const renderEmpty = () => (
    <View style={listStyles.empty}>
      <Text style={listStyles.emptyIcon}>📋</Text>
      <Text style={listStyles.emptyTitle}>{t('reviewResponse.noReviews')}</Text>
      <Text style={listStyles.emptyBody}>{t('reviewResponse.noReviewsBody')}</Text>
    </View>
  );

  const renderFooter = () =>
    loadingMore ? (
      <View style={{ paddingVertical: 20 }}>
        <ActivityIndicator color={PRIMARY} />
      </View>
    ) : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Navigation header */}
      <View style={styles.navHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button">
          <Text style={styles.backText}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>{t('reviewResponse.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={PRIMARY} />
        </View>
      ) : error ? (
        <View style={styles.loadingCenter}>
          <Text style={styles.errorText}>تعذّر تحميل التقييمات</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={handleRefresh}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredReviews}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ReviewCard review={item} onReply={openReply} onEditReply={openReply} />
          )}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={PRIMARY} />
          }
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      <ReplyModal
        visible={replyModalVisible}
        review={activeReview}
        existing={existingResponse}
        onSave={handleSaveResponse}
        onClose={() => setReplyModalVisible(false)}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  backText: { fontSize: 28, color: PRIMARY, lineHeight: 32 },
  navTitle: { fontSize: 17, fontWeight: '700', color: '#212121' },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  errorText: { fontSize: 15, color: '#D32F2F' },
  retryBtn: { backgroundColor: PRIMARY, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  retryText: { color: '#FFF', fontWeight: '700' },
});

const listStyles = StyleSheet.create({
  listHeader: { gap: 0 },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    gap: 4,
  },
  statNum: { fontSize: 24, fontWeight: '800', color: '#212121' },
  statLabel: { fontSize: 11, color: GREY, textAlign: 'center' },
  filtersRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FAFAFA',
  },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 12, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#212121', textAlign: 'center' },
  emptyBody: { fontSize: 14, color: GREY, textAlign: 'center', lineHeight: 20 },
});

const cardStyles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  date: { fontSize: 12, color: GREY, marginTop: 2 },
  tonePill: {
    alignSelf: 'flex-start' as const,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tonePillText: { fontSize: 12, fontWeight: '600' },
  reviewText: { fontSize: 14, color: '#424242', lineHeight: 22 },
  responseBox: {
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
    padding: 12,
    gap: 6,
    borderStartWidth: 3,
    borderStartColor: PRIMARY,
  },
  responseLabel: { fontSize: 12, fontWeight: '700', color: PRIMARY },
  responseText: { fontSize: 14, color: '#212121', lineHeight: 20 },
  editResponseBtn: { alignSelf: 'flex-end' as const },
  editResponseText: { fontSize: 13, color: PRIMARY },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
  replyBtn: {
    backgroundColor: PRIMARY,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
  },
  replyBtnUrgent: { backgroundColor: '#D32F2F' },
  replyBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  helpfulCount: { fontSize: 12, color: GREY },
});

const badgeStyles = StyleSheet.create({
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { color: '#FFF', fontWeight: '800', fontSize: 15 },
});

const chipStyles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  chipActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  label: { fontSize: 13, color: '#757575' },
  labelActive: { color: '#FFF', fontWeight: '700' },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFF',
    borderTopStartRadius: 20,
    borderTopEndRadius: 20,
    padding: 20,
    paddingBottom: 32,
    gap: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0E0E0',
    alignSelf: 'center' as const,
    marginBottom: 4,
  },
  title: { fontSize: 17, fontWeight: '700', color: '#212121', textAlign: 'center' },
  reviewSnippet: {
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  reviewSnippetText: { fontSize: 13, color: '#616161', lineHeight: 18 },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    minHeight: 100,
    color: '#212121',
    textAlignVertical: 'top',
  },
  charsLeft: { fontSize: 12, color: GREY, textAlign: 'end' as const },
  charsHint: { fontSize: 12, color: GREY, textAlign: 'end' as const, marginTop: -8 },
  btnRow: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCancel: { backgroundColor: '#F5F5F5' },
  btnCancelText: { color: '#616161', fontWeight: '600', fontSize: 15 },
  btnSave: { backgroundColor: PRIMARY },
  btnSaveText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  btnDisabled: { backgroundColor: '#BDBDBD' },
});
