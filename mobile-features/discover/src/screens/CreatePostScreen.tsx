import { discoverTestIDs } from '@iraq-maps/contracts';
import { useApi } from '@iraq-maps/mobile-kit';
import { useRouter } from 'expo-router';
import { useState, useCallback, type ReactElement } from 'react';
import {
  ActivityIndicator,
  I18nManager,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useDiscoverClient } from '../client';
import { t } from '../strings';

I18nManager.forceRTL(true);

type PostTypeValue = 'photo' | 'tip' | 'event' | 'offer';

const POST_TYPE_VALUES: PostTypeValue[] = ['photo', 'tip', 'event', 'offer'];
const POST_TYPE_KEYS: Record<PostTypeValue, 'post.type.photo' | 'post.type.tip' | 'post.type.event' | 'post.type.offer'> = {
  photo: 'post.type.photo',
  tip: 'post.type.tip',
  event: 'post.type.event',
  offer: 'post.type.offer',
};

export function CreatePostScreen(): ReactElement {
  const api = useDiscoverClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const placesApi = useApi() as any;
  const router = useRouter();
  const [body, setBody] = useState('');
  const [postType, setPostType] = useState<PostTypeValue>('tip');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeResults, setPlaceResults] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedPlace, setSelectedPlace] = useState<{ id: string; name: string } | undefined>();
  const [searchingPlace, setSearchingPlace] = useState(false);

  const handlePlaceSearch = useCallback(async (q: string) => {
    setPlaceQuery(q);
    if (q.trim().length < 2) { setPlaceResults([]); return; }
    setSearchingPlace(true);
    try {
      const res = await placesApi.places.search({ query: { q: q.trim(), city: 'baghdad', limit: 5, lang: 'ar' } });
      if (res.status === 200) {
        setPlaceResults(res.body.items.map((r: { id: string; names: { ar?: string; name: string } }) => ({
          id: r.id,
          name: r.names.ar ?? r.names.name,
        })));
      }
    } catch {
      setPlaceResults([]);
    } finally {
      setSearchingPlace(false);
    }
  }, [placesApi]);

  const handleSelectPlace = useCallback((place: { id: string; name: string }) => {
    setSelectedPlace(place);
    setPlaceQuery('');
    setPlaceResults([]);
  }, []);

  const handleSubmit = async () => {
    if (!body.trim() || submitting) return;
    setSubmitting(true);
    setError(undefined);
    try {
      const res = await api.createPost({
        body: {
          type: postType,
          body: body.trim(),
          mediaAssetIds: [],
          ...(selectedPlace ? { placeId: selectedPlace.id } : {}),
        },
      });
      if (res.status === 201) {
        router.back();
      } else {
        setError(t('create.submitError'));
      }
    } catch {
      setError(t('create.submitError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={80}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('create.title')}</Text>
      </View>
      <Pressable style={styles.dismissArea} onPress={Keyboard.dismiss} accessible={false}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? (
          <View style={styles.errorRow}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Text style={styles.label}>{t('create.typeLabel')}</Text>
        <View style={styles.typeRow}>
          {POST_TYPE_VALUES.map((val) => (
            <Pressable
              key={val}
              style={[styles.typeChip, postType === val && styles.typeChipActive]}
              onPress={() => setPostType(val)}
            >
              <Text style={[styles.typeChipText, postType === val && styles.typeChipTextActive]}>
                {t(POST_TYPE_KEYS[val])}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          testID={discoverTestIDs.postInput}
          style={styles.textInput}
          value={body}
          onChangeText={(text) => setBody(text.slice(0, 1000))}
          placeholder={t('create.placeholder')}
          placeholderTextColor="#999"
          multiline
          maxLength={1000}
          textAlign="right"
          textAlignVertical="top"
        />
        <Text style={styles.charCount}>{t('create.charCount', { count: body.length })}</Text>

        <Text style={styles.label}>{t('create.placeLabel')}</Text>
        {selectedPlace ? (
          <View style={styles.selectedPlaceRow}>
            <Text style={styles.selectedPlaceText}>{t('create.placeSelected', { name: selectedPlace.name })}</Text>
            <Pressable onPress={() => setSelectedPlace(undefined)}>
              <Text style={styles.clearPlaceText}>{t('create.clearPlace')}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.placeSearchBox}>
            <TextInput
              style={styles.placeInput}
              value={placeQuery}
              onChangeText={(q) => { void handlePlaceSearch(q); }}
              placeholder={t('create.placePlaceholder')}
              placeholderTextColor="#999"
              textAlign="right"
            />
            {searchingPlace ? <ActivityIndicator size="small" color="#1976D2" style={styles.placeSpinner} /> : null}
            {placeResults.length > 0 ? (
              <View style={styles.placeDropdown}>
                {placeResults.map((p) => (
                  <Pressable key={p.id} style={styles.placeResultItem} onPress={() => handleSelectPlace(p)}>
                    <Text style={styles.placeResultText}>📍 {p.name}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        )}

        <Pressable
          testID={discoverTestIDs.createPostButton}
          style={[styles.submitBtn, (!body.trim() || submitting) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!body.trim() || submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Text style={styles.submitBtnText}>{t('create.submit')}</Text>
          )}
        </Pressable>
      </ScrollView>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: '#1976D2',
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  dismissArea: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  errorRow: {
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  errorText: {
    color: '#C62828',
    fontSize: 13,
    textAlign: 'auto',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    textAlign: 'auto',
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  typeChip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#E0E0E0',
  },
  typeChipActive: {
    backgroundColor: '#1976D2',
  },
  typeChipText: {
    fontSize: 14,
    color: '#555',
    fontWeight: '500',
  },
  typeChipTextActive: {
    color: '#FFF',
  },
  textInput: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#222',
    minHeight: 160,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    textAlign: 'auto',
  },
  charCount: {
    fontSize: 12,
    color: '#999',
    textAlign: 'auto',
    marginTop: 4,
    marginBottom: 20,
  },
  submitBtn: {
    backgroundColor: '#1976D2',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    backgroundColor: '#B0BEC5',
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  placeSearchBox: {
    marginBottom: 20,
    position: 'relative',
  },
  placeInput: {
    backgroundColor: '#FFF',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#222',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    textAlign: 'auto',
  },
  placeSpinner: {
    position: 'absolute',
    top: 12,
    start: 12,
  },
  placeDropdown: {
    backgroundColor: '#FFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginTop: 4,
    overflow: 'hidden',
  },
  placeResultItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  placeResultText: {
    fontSize: 14,
    color: '#333',
    textAlign: 'auto',
  },
  selectedPlaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 20,
  },
  selectedPlaceText: {
    fontSize: 14,
    color: '#388E3C',
    fontWeight: '500',
    flex: 1,
    textAlign: 'auto',
  },
  clearPlaceText: {
    fontSize: 16,
    color: '#999',
    paddingStart: 8,
  },
});
