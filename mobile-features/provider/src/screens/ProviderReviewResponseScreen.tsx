/**
 * Provider review response screen.
 *
 * Fetches place reviews via the existing reviewsContract (list endpoint).
 * Provider responses are stored locally with AsyncStorage until the backend
 * contract is extended (see docs/contract-requests/M-review-response-provider.md).
 * When the response endpoint is live, replace the AsyncStorage write/read with
 * the ts-rest call.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button, EmptyState, Screen } from '@iraq-maps/ui';
import { useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { initClient } from '@ts-rest/core';
import { reviewsContract, type Review, type PlaceId } from '@iraq-maps/contracts';
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  Alert,
  I18nManager,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../strings';
import { SkeletonBlock } from '../skeleton';

I18nManager.forceRTL(true);

const RESPONSES_KEY = '@iraq_maps/provider_review_responses';
const MAX_RESPONSE = 500;
const PRIMARY = '#1976D2';

type ResponseMap = Record<string, string>; // reviewId → response text

async function loadResponses(): Promise<ResponseMap> {
  try {
    const raw = await AsyncStorage.getItem(RESPONSES_KEY);
    return raw ? (JSON.parse(raw) as ResponseMap) : {};
  } catch {
    return {};
  }
}

async function saveResponses(map: ResponseMap): Promise<void> {
  await AsyncStorage.setItem(RESPONSES_KEY, JSON.stringify(map));
}

const STAR_FILLED = '★';
const STAR_EMPTY = '☆';

function StarRow({ rating }: { rating: number }): ReactElement {
  const stars = Array.from({ length: 5 }, (_, i) => (i < rating ? STAR_FILLED : STAR_EMPTY)).join('');
  return <Text style={{ color: '#F59E0B', fontSize: 14, letterSpacing: 2 }}>{stars}</Text>;
}

interface ReviewCardProps {
  review: Review;
  response: string | undefined;
  onSave: (text: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

function ReviewCard({ review, response, onSave, onDelete }: ReviewCardProps): ReactElement {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(response ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave(draft.trim());
    setEditing(false);
    setSaving(false);
  }

  async function handleDelete() {
    Alert.alert(t('reviewResponse.deleteResponse'), t('reviewResponse.deleteResponse'), [
      { text: t('reviewResponse.cancel'), style: 'cancel' },
      { text: t('reviewResponse.deleteResponse'), style: 'destructive', onPress: async () => { await onDelete(); } },
    ]);
  }

  return (
    <View style={cardStyles.card}>
      <View style={cardStyles.reviewHeader}>
        <StarRow rating={review.rating} />
        <Text style={cardStyles.date}>{new Date(review.createdAt).toLocaleDateString()}</Text>
      </View>
      {review.text ? <Text style={cardStyles.body}>{review.text}</Text> : null}

      {response && !editing ? (
        <View style={cardStyles.responseBox}>
          <Text style={cardStyles.responseLabel}>{t('reviewResponse.ownerResponse')}</Text>
          <Text style={cardStyles.responseText}>{response}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TouchableOpacity onPress={() => { setDraft(response); setEditing(true); }}>
              <Text style={{ color: PRIMARY, fontSize: 13 }}>{t('reviewResponse.editResponse')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => void handleDelete()}>
              <Text style={{ color: '#EF4444', fontSize: 13 }}>{t('reviewResponse.deleteResponse')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : editing ? (
        <View style={{ marginTop: 8, gap: 8 }}>
          <TextInput
            style={cardStyles.input}
            value={draft}
            onChangeText={(v) => setDraft(v.slice(0, MAX_RESPONSE))}
            placeholder={t('reviewResponse.responsePlaceholder')}
            multiline
            textAlignVertical="top"
          />
          <Text style={cardStyles.charCount}>
            {draft.length}/{MAX_RESPONSE}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label={t('reviewResponse.save')} onPress={() => void handleSave()} disabled={saving || !draft.trim()} />
            <TouchableOpacity onPress={() => setEditing(false)} style={{ justifyContent: 'center' }}>
              <Text style={{ color: '#666' }}>{t('reviewResponse.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          onPress={() => { setDraft(''); setEditing(true); }}
          style={cardStyles.respondBtn}
        >
          <Text style={{ color: PRIMARY, fontSize: 13, fontWeight: '600' }}>{t('reviewResponse.respond')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  date: { fontSize: 11, color: '#999' },
  body: { fontSize: 14, color: '#333', lineHeight: 20 },
  responseBox: { marginTop: 10, backgroundColor: '#F5F5F5', borderRadius: 8, padding: 10 },
  responseLabel: { fontSize: 11, color: '#888', marginBottom: 4, fontWeight: '600' },
  responseText: { fontSize: 14, color: '#444', lineHeight: 20 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 10, fontSize: 14, minHeight: 80, backgroundColor: '#FAFAFA' },
  charCount: { fontSize: 11, color: '#aaa', textAlign: 'auto' },
  respondBtn: { marginTop: 8, paddingVertical: 6 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

interface Props {
  placeId: string;
}

export function ProviderReviewResponseScreen({ placeId }: Props): ReactElement {
  const baseUrl = useApiBaseUrl();
  const client = useMemo(
    () => initClient(reviewsContract, { baseUrl, baseHeaders: {} }),
    [baseUrl],
  );

  const [reviews, setReviews] = useState<Review[]>([]);
  const [responses, setResponses] = useState<ResponseMap>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [res, stored] = await Promise.all([
        client.list({ params: { placeId: placeId as PlaceId }, query: {} }),
        loadResponses(),
      ]);
      if (res.status === 200) {
        setReviews(res.body.items);
      }
      setResponses(stored);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [client, placeId]);

  useEffect(() => { void load(); }, [load]);

  async function handleSave(reviewId: string, text: string) {
    const next = { ...responses, [reviewId]: text };
    await saveResponses(next);
    setResponses(next);
  }

  async function handleDelete(reviewId: string) {
    const { [reviewId]: _removed, ...next } = responses;
    await saveResponses(next);
    setResponses(next);
  }

  if (loading) {
    return (
      <Screen>
        <View style={{ gap: 12, padding: 16 }}>
          {[1, 2, 3].map((k) => <SkeletonBlock key={k} width={340} height={80} />)}
        </View>
      </Screen>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FAFAFA' }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
      >
        <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 4 }}>{t('reviewResponse.title')}</Text>
        {reviews.length === 0 ? (
          <EmptyState title={t('reviewResponse.noReviews')} body={t('reviewResponse.noReviewsBody')} />
        ) : (
          reviews.map((r) => (
            <ReviewCard
              key={r.id}
              review={r}
              response={responses[r.id]}
              onSave={(text) => handleSave(r.id, text)}
              onDelete={() => handleDelete(r.id)}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
