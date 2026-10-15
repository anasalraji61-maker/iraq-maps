/**
 * M75: Reviews section for PlaceScreen.
 * Shows average rating, a list of reviews, and a form to submit or update your own.
 */
import { type PlaceId, type Review, type RatingSummary } from '@iraq-maps/contracts';
import { useApi, useSession } from '@iraq-maps/mobile-kit';
import { Banner, Button, Text } from '@iraq-maps/ui';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { StyleSheet, Text as RNText, TextInput, TouchableOpacity, View } from 'react-native';
import { t } from '../strings';

// ── Star row ─────────────────────────────────────────────────────────────────

const STAR = '★'; // Unicode star character, not user-visible text

function StarRow({
  value,
  onChange,
  readonly = false,
}: {
  value: number;
  onChange?: (v: number) => void;
  readonly?: boolean;
}): ReactElement {
  return (
    <View style={styles.stars} accessibilityLabel={`${value} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity
          key={n}
          onPress={readonly ? undefined : () => onChange?.(n)}
          disabled={readonly}
          accessibilityRole={readonly ? 'text' : 'button'}
          accessibilityLabel={`${n}`}
          testID={`star-${n}`}
        >
          <RNText style={{ fontSize: 24, color: n <= value ? '#F5A623' : '#CCC' }}>{STAR}</RNText>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Review card ───────────────────────────────────────────────────────────────

function ReviewCard({ review }: { review: Review }): ReactElement {
  return (
    <View style={styles.card}>
      <StarRow value={review.rating} readonly />
      {review.text ? <Text variant="caption">{review.text}</Text> : null}
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ReviewsSection({ placeId }: { placeId: PlaceId }): ReactElement {
  const api = useApi();
  const session = useSession();
  const isSignedIn = session.state.status === 'signedIn';

  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState<RatingSummary | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(async () => {
    try {
      const res = await api.reviews.list({ params: { placeId } });
      if (res.status === 200) {
        setReviews(res.body.items);
        setSummary(res.body.summary);
      }
    } catch {
      // ignore load errors silently
    }
  }, [api.reviews, placeId]);

  useEffect(() => { void load(); }, [load]);

  const handleSubmit = async () => {
    if (rating === 0) return;
    setSubmitting(true);
    setError(undefined);
    try {
      const res = await api.reviews.submit({
        params: { placeId },
        body: { rating, text: reviewText || undefined },
      });
      if (res.status === 201) {
        setShowForm(false);
        setRating(0);
        setReviewText('');
        await load();
      }
    } catch {
      setError('error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container} testID="reviews-section">
      <Text variant="subtitle">{t('reviews.title')}</Text>
      {summary && summary.count > 0 ? (
        <Text tone="muted">
          {t('reviews.avgRating', {
            avg: String(summary.average ?? 0),
            count: String(summary.count),
          })}
        </Text>
      ) : null}

      {!isSignedIn ? (
        <Text tone="muted" variant="caption">{t('reviews.loginRequired')}</Text>
      ) : showForm ? (
        <View style={styles.form}>
          <Text variant="caption">{t('reviews.ratingLabel')}</Text>
          <StarRow value={rating} onChange={setRating} />
          <TextInput
            placeholder={t('reviews.textPlaceholder')}
            value={reviewText}
            onChangeText={setReviewText}
            multiline
            accessibilityLabel={t('reviews.textPlaceholder')}
            style={styles.textInput}
          />
          {error ? <Banner kind="error" message={error} /> : null}
          <Button
            label={t('reviews.submitLabel')}
            onPress={() => { void handleSubmit(); }}
            disabled={rating === 0 || submitting}
            testID="review-submit"
          />
          <Button
            label={t('reviews.deleteOwn')}
            variant="secondary"
            onPress={() => setShowForm(false)}
          />
        </View>
      ) : (
        <Button
          label={t('reviews.writeReview')}
          variant="secondary"
          onPress={() => setShowForm(true)}
          testID="write-review-btn"
        />
      )}

      {reviews.length === 0 ? (
        <Text tone="muted" variant="caption">{t('reviews.empty')}</Text>
      ) : (
        reviews.map((r) => <ReviewCard key={r.id} review={r} />)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 16, gap: 8 },
  stars: { flexDirection: 'row', gap: 4 },
  card: { gap: 4, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E0E0E0' },
  form: { gap: 8 },
  textInput: { borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 8, padding: 10, minHeight: 80, textAlignVertical: 'top' },
});
