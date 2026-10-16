/* eslint-disable i18next/no-literal-string, no-restricted-syntax */
import { discoverTestIDs } from '@iraq-maps/contracts';
import { useApi, useApiBaseUrl, useAppRating } from '@iraq-maps/mobile-kit';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useCallback, useEffect, useRef, type ReactElement } from 'react';
import {
  ActivityIndicator,
  I18nManager,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
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
import { sharedStyles, COLORS } from './shared';

const MAX_PHOTOS = 5;

I18nManager.forceRTL(true);

type PostTypeValue = 'photo' | 'tip' | 'event' | 'offer';
type PostCategoryValue = 'food' | 'transport' | 'tourism' | 'shopping' | 'services' | 'other';

const POST_TYPE_VALUES: PostTypeValue[] = ['photo', 'tip', 'event', 'offer'];
const POST_TYPE_KEYS: Record<PostTypeValue, 'post.type.photo' | 'post.type.tip' | 'post.type.event' | 'post.type.offer'> = {
  photo: 'post.type.photo',
  tip: 'post.type.tip',
  event: 'post.type.event',
  offer: 'post.type.offer',
};
const POST_CATEGORY_VALUES: PostCategoryValue[] = ['food', 'transport', 'tourism', 'shopping', 'services', 'other'];
const POST_CATEGORY_KEYS: Record<PostCategoryValue, `feed.categoryFilter.${PostCategoryValue}`> = {
  food: 'feed.categoryFilter.food',
  transport: 'feed.categoryFilter.transport',
  tourism: 'feed.categoryFilter.tourism',
  shopping: 'feed.categoryFilter.shopping',
  services: 'feed.categoryFilter.services',
  other: 'feed.categoryFilter.other',
};

interface UploadedPhoto {
  uri: string;
  assetId: string;
}

// ─── Poll types ───────────────────────────────────────────────────────────────

interface PollOption {
  id: string;
  text: string;
}

interface PollData {
  options: PollOption[];
}

const DRAFT_KEY = '@iraq-maps/create-post/draft';

type AudienceValue = 'everyone' | 'followers';
const AUDIENCE_VALUES: AudienceValue[] = ['everyone', 'followers'];

// ─── Photo layout preview ─────────────────────────────────────────────────────

interface PhotoLayoutPreviewProps {
  photos: UploadedPhoto[];
}

function PhotoLayoutPreview({ photos }: PhotoLayoutPreviewProps): ReactElement | null {
  if (photos.length === 0) return null;

  if (photos.length === 1) {
    return (
      <View style={previewStyles.singleContainer}>
        <Image source={{ uri: photos[0]!.uri }} style={previewStyles.singleImage} resizeMode="cover" />
        <View style={previewStyles.previewLabel}>
          <Text style={previewStyles.previewLabelText}>{t('create.previewLabel')}</Text>
        </View>
      </View>
    );
  }

  if (photos.length === 2) {
    return (
      <View style={previewStyles.twoContainer}>
        {photos.map((p) => (
          <Image key={p.assetId} source={{ uri: p.uri }} style={previewStyles.halfImage} resizeMode="cover" />
        ))}
      </View>
    );
  }

  if (photos.length === 3) {
    return (
      <View style={previewStyles.threeContainer}>
        <Image source={{ uri: photos[0]!.uri }} style={previewStyles.threeMainImage} resizeMode="cover" />
        <View style={previewStyles.threeRight}>
          <Image source={{ uri: photos[1]!.uri }} style={previewStyles.threeSmallImage} resizeMode="cover" />
          <Image source={{ uri: photos[2]!.uri }} style={previewStyles.threeSmallImage} resizeMode="cover" />
        </View>
      </View>
    );
  }

  // 4+ photos: 2x2 grid with overflow counter
  return (
    <View style={previewStyles.gridContainer}>
      {photos.slice(0, 4).map((p, idx) => (
        <View key={p.assetId} style={previewStyles.gridCell}>
          <Image source={{ uri: p.uri }} style={previewStyles.gridImage} resizeMode="cover" />
          {idx === 3 && photos.length > 4 ? (
            <View style={previewStyles.overflowOverlay}>
              <Text style={previewStyles.overflowText}>+{photos.length - 4}</Text>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const previewStyles = StyleSheet.create({
  singleContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    position: 'relative',
  },
  singleImage: {
    width: '100%',
    height: 240,
  },
  previewLabel: {
    position: 'absolute',
    top: 8,
    start: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  previewLabelText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '600',
  },
  twoContainer: {
    flexDirection: 'row',
    gap: 2,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  halfImage: {
    flex: 1,
    height: 180,
  },
  threeContainer: {
    flexDirection: 'row',
    gap: 2,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    height: 180,
  },
  threeMainImage: {
    flex: 2,
    height: '100%',
  },
  threeRight: {
    flex: 1,
    gap: 2,
  },
  threeSmallImage: {
    flex: 1,
    width: '100%',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  gridCell: {
    width: '49.5%',
    height: 120,
    position: 'relative',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  overflowOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overflowText: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: '700',
  },
});

// ─── Schedule picker ──────────────────────────────────────────────────────────

interface SchedulePickerProps {
  visible: boolean;
  onDismiss: () => void;
  onConfirm: (date: Date) => void;
  minDate?: Date;
}

function SchedulePicker({ visible, onDismiss, onConfirm, minDate }: SchedulePickerProps): ReactElement {
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d;
  });

  const handleHourChange = useCallback((delta: number) => {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setHours(next.getHours() + delta);
      if (minDate && next < minDate) return prev;
      return next;
    });
  }, [minDate]);

  const handleDayChange = useCallback((delta: number) => {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + delta);
      if (minDate && next < minDate) return prev;
      return next;
    });
  }, [minDate]);

  const formatDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const formatTime = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:00`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={schedStyles.overlay}>
        <View style={schedStyles.panel}>
          <Text style={schedStyles.title}>{t('create.scheduleTitle')}</Text>

          <View style={schedStyles.row}>
            <Pressable onPress={() => handleDayChange(-1)} style={schedStyles.arrowBtn} accessibilityRole="button" accessibilityLabel={t('common.previous')}>
              <Text style={schedStyles.arrowText}>‹</Text>
            </Pressable>
            <Text style={schedStyles.dateValue}>{formatDate(selectedDate)}</Text>
            <Pressable onPress={() => handleDayChange(1)} style={schedStyles.arrowBtn} accessibilityRole="button" accessibilityLabel={t('common.next')}>
              <Text style={schedStyles.arrowText}>›</Text>
            </Pressable>
          </View>

          <View style={schedStyles.row}>
            <Pressable onPress={() => handleHourChange(-1)} style={schedStyles.arrowBtn} accessibilityRole="button" accessibilityLabel={t('common.previous')}>
              <Text style={schedStyles.arrowText}>‹</Text>
            </Pressable>
            <Text style={schedStyles.dateValue}>{formatTime(selectedDate)}</Text>
            <Pressable onPress={() => handleHourChange(1)} style={schedStyles.arrowBtn} accessibilityRole="button" accessibilityLabel={t('common.next')}>
              <Text style={schedStyles.arrowText}>›</Text>
            </Pressable>
          </View>

          <View style={schedStyles.btnRow}>
            <Pressable style={schedStyles.cancelBtn} onPress={onDismiss} accessibilityRole="button">
              <Text style={schedStyles.cancelBtnText}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable style={schedStyles.confirmBtn} onPress={() => onConfirm(selectedDate)} accessibilityRole="button">
              <Text style={schedStyles.confirmBtnText}>{t('create.scheduleConfirm')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const schedStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
    width: 300,
    gap: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  arrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primaryXLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: {
    fontSize: 22,
    color: COLORS.primary,
    fontWeight: '600',
  },
  dateValue: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textPrimary,
    minWidth: 140,
    textAlign: 'center',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  confirmBtnText: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '700',
  },
});

export function CreatePostScreen(): ReactElement {
  const api = useDiscoverClient();
  const placesApi = useApi();
  const baseUrl = useApiBaseUrl();
  const router = useRouter();
  const { onPostCreated } = useAppRating();
  const [body, setBody] = useState('');
  const [postType, setPostType] = useState<PostTypeValue>('tip');
  const [postCategory, setPostCategory] = useState<PostCategoryValue | undefined>(undefined);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeResults, setPlaceResults] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedPlace, setSelectedPlace] = useState<{ id: string; name: string } | undefined>();
  const [searchingPlace, setSearchingPlace] = useState(false);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  // Mention autocomplete
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<string[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const mentionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Poll state
  const [pollData, setPollData] = useState<PollData | null>(null);
  const [pollError, setPollError] = useState<string | undefined>();

  // Video state
  const [videoUri, setVideoUri] = useState<string | undefined>();
  const [videoAssetId, setVideoAssetId] = useState<string | undefined>();
  const [videoUploading, setVideoUploading] = useState(false);

  // Audience + scheduling
  const [audience, setAudience] = useState<AudienceValue>('everyone');
  const [scheduledAt, setScheduledAt] = useState<Date | undefined>();
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);

  // Photo layout preview toggle
  const [showPreview, setShowPreview] = useState(false);

  // Restore draft on mount
  useEffect(() => {
    AsyncStorage.getItem(DRAFT_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const draft = JSON.parse(raw) as { body: string; postType: PostTypeValue; audience?: AudienceValue };
          if (draft.body) setBody(draft.body);
          if (draft.postType) setPostType(draft.postType);
          if (draft.audience) setAudience(draft.audience);
        } catch { /* ignore corrupt data */ }
      })
      .catch(() => undefined);
  }, []);

  // Auto-save draft + mention detection (debounced)
  const handleBodyChange = useCallback((text: string) => {
    setBody(text.slice(0, 1000));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ body: text.slice(0, 1000), postType, audience })).catch(() => undefined);
    }, 600);
    // Detect @mention at cursor end
    const atMatch = text.slice(0, 1000).match(/@([\p{L}\p{N}_]*)$/u);
    const query = atMatch ? atMatch[1] ?? '' : null;
    if (query === null) {
      setMentionQuery(null);
      setMentionResults([]);
      return;
    }
    setMentionQuery(query);
    if (mentionDebounceRef.current) clearTimeout(mentionDebounceRef.current);
    if (query.length === 0) { setMentionResults([]); return; }
    setMentionLoading(true);
    mentionDebounceRef.current = setTimeout(() => {
      api.searchSuggestions({ query: { q: `@${query}` } })
        .then((res) => {
          if (res.status === 200) setMentionResults(res.body.userIds.slice(0, 5));
        })
        .catch(() => undefined)
        .finally(() => setMentionLoading(false));
    }, 350);
  }, [postType, api]);

  const handleMentionSelect = useCallback((userId: string) => {
    setBody((prev) => prev.replace(/@[\p{L}\p{N}_]*$/u, `@${userId} `));
    setMentionQuery(null);
    setMentionResults([]);
  }, []);

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

  const handleAddPhoto = useCallback(async () => {
    if (photos.length >= MAX_PHOTOS) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0]!;
    const mime = (asset.mimeType === 'image/png' || asset.mimeType === 'image/webp')
      ? asset.mimeType as 'image/png' | 'image/webp'
      : 'image/jpeg';
    const size = asset.fileSize ?? 0;
    setUploadProgress(0);
    setError(undefined);
    try {
      // Step 1: request signed upload ticket
      const ticketRes = await fetch(`${baseUrl}/v1/media/uploads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purpose: 'provider_photo', mime, size }),
      });
      if (!ticketRes.ok) { setError(t('create.uploadError')); setUploadProgress(null); return; }
      const ticket = await ticketRes.json() as { assetId: string; uploadUrl: string; headers: Record<string, string> };

      // Step 2: PUT file bytes to signed URL, track progress via XHR
      const fileRes = await fetch(asset.uri);
      const blob = await fileRes.blob();
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', ticket.uploadUrl);
        Object.entries(ticket.headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`PUT ${xhr.status}`)));
        xhr.onerror = () => reject(new Error('network'));
        xhr.send(blob);
      });

      // Step 3: signal completion
      const completeRes = await fetch(`${baseUrl}/v1/media/uploads/${encodeURIComponent(ticket.assetId)}/complete`, {
        method: 'POST',
      });
      if (!completeRes.ok && completeRes.status !== 409) { setError(t('create.uploadError')); setUploadProgress(null); return; }

      setPhotos((prev) => [...prev, { uri: asset.uri, assetId: ticket.assetId }]);
    } catch {
      setError(t('create.uploadError'));
    } finally {
      setUploadProgress(null);
    }
  }, [photos.length, baseUrl]);

  const handleRemovePhoto = useCallback((assetId: string) => {
    setPhotos((prev) => prev.filter((p) => p.assetId !== assetId));
  }, []);

  const handleAddVideo = useCallback(async () => {
    if (videoUri) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      videoMaxDuration: 15,
      allowsEditing: false,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0]!;
    const mime = 'video/mp4';
    const size = asset.fileSize ?? 0;
    setVideoUploading(true);
    setError(undefined);
    try {
      const ticketRes = await fetch(`${baseUrl}/v1/media/uploads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purpose: 'provider_photo', mime, size }),
      });
      if (!ticketRes.ok) { setError(t('video.uploadError')); setVideoUploading(false); return; }
      const ticket = await ticketRes.json() as { assetId: string; uploadUrl: string; headers: Record<string, string> };
      const fileRes = await fetch(asset.uri);
      const blob = await fileRes.blob();
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', ticket.uploadUrl);
        Object.entries(ticket.headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`PUT ${xhr.status}`)));
        xhr.onerror = () => reject(new Error('network'));
        xhr.send(blob);
      });
      const completeRes = await fetch(`${baseUrl}/v1/media/uploads/${encodeURIComponent(ticket.assetId)}/complete`, {
        method: 'POST',
      });
      if (!completeRes.ok && completeRes.status !== 409) { setError(t('video.uploadError')); setVideoUploading(false); return; }
      setVideoUri(asset.uri);
      setVideoAssetId(ticket.assetId);
    } catch {
      setError(t('video.uploadError'));
    } finally {
      setVideoUploading(false);
    }
  }, [videoUri, baseUrl]);

  const handleRemoveVideo = useCallback(() => {
    setVideoUri(undefined);
    setVideoAssetId(undefined);
  }, []);

  // Poll handlers
  const handleTogglePoll = useCallback(() => {
    if (pollData) {
      setPollData(null);
      setPollError(undefined);
    } else {
      setPollData({
        options: [
          { id: `opt_${Date.now()}_1`, text: '' },
          { id: `opt_${Date.now()}_2`, text: '' },
        ],
      });
    }
  }, [pollData]);

  const handlePollOptionChange = useCallback((optId: string, text: string) => {
    setPollData((prev) => {
      if (!prev) return prev;
      return { ...prev, options: prev.options.map((o) => o.id === optId ? { ...o, text } : o) };
    });
  }, []);

  const handleAddPollOption = useCallback(() => {
    setPollData((prev) => {
      if (!prev || prev.options.length >= 4) return prev;
      return { ...prev, options: [...prev.options, { id: `opt_${Date.now()}`, text: '' }] };
    });
  }, []);

  const handleRemovePollOption = useCallback((optId: string) => {
    setPollData((prev) => {
      if (!prev || prev.options.length <= 2) return prev;
      return { ...prev, options: prev.options.filter((o) => o.id !== optId) };
    });
  }, []);

  const handleSubmit = async () => {
    if (!body.trim() || submitting) return;
    // Validate poll if present
    if (pollData) {
      const filledOptions = pollData.options.filter((o) => o.text.trim());
      if (filledOptions.length < 2) {
        setPollError(t('poll.minOptions'));
        return;
      }
      setPollError(undefined);
    }
    setSubmitting(true);
    setError(undefined);
    const pollMetadata = pollData
      ? {
          poll: {
            options: pollData.options
              .filter((o) => o.text.trim())
              .map((o) => ({ id: o.id, text: o.text.trim(), votes: 0 })),
          },
        }
      : undefined;
    try {
      const res = await api.createPost({
        body: {
          type: postType,
          body: body.trim(),
          mediaAssetIds: [...photos.map((p) => p.assetId), ...(videoAssetId ? [videoAssetId] : [])],
          ...(selectedPlace ? { placeId: selectedPlace.id } : {}),
          ...(postCategory ? { category: postCategory } : {}),
          ...(pollMetadata ? { metadata: pollMetadata } : {}),
          ...(audience === 'followers' ? { audienceFollowersOnly: true } : {}),
          ...(scheduledAt ? { scheduledAt: scheduledAt.toISOString() } : {}),
        },
      });
      if (res.status === 201) {
        AsyncStorage.removeItem(DRAFT_KEY).catch(() => undefined);
        void onPostCreated();
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
              accessibilityRole="button"
              accessibilityState={{ selected: postType === val }}
              accessibilityLabel={t(POST_TYPE_KEYS[val])}
            >
              <Text style={[styles.typeChipText, postType === val && styles.typeChipTextActive]}>
                {t(POST_TYPE_KEYS[val])}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>{t('create.categoryLabel')}</Text>
        <View style={styles.typeRow}>
          {POST_CATEGORY_VALUES.map((val) => (
            <Pressable
              key={val}
              style={[styles.typeChip, postCategory === val && styles.typeChipActive]}
              onPress={() => setPostCategory(postCategory === val ? undefined : val)}
              accessibilityRole="button"
              accessibilityState={{ selected: postCategory === val }}
              accessibilityLabel={t(POST_CATEGORY_KEYS[val])}
            >
              <Text style={[styles.typeChipText, postCategory === val && styles.typeChipTextActive]}>
                {t(POST_CATEGORY_KEYS[val])}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          testID={discoverTestIDs.postInput}
          style={styles.textInput}
          value={body}
          onChangeText={handleBodyChange}
          placeholder={t('create.placeholder')}
          placeholderTextColor="#999"
          multiline
          maxLength={1000}
          textAlign="right"
          textAlignVertical="top"
        />
        <Text style={styles.charCount}>{t('create.charCount', { count: body.length })}</Text>

        {mentionQuery !== null ? (
          <View style={styles.mentionDropdown}>
            {mentionLoading ? (
              <Text style={styles.mentionLoading}>{t('create.mentionLoading')}</Text>
            ) : mentionResults.length === 0 ? null : (
              mentionResults.map((uid) => (
                <Pressable
                  key={uid}
                  style={styles.mentionItem}
                  onPress={() => handleMentionSelect(uid)}
                  accessibilityRole="button"
                  accessibilityLabel={`@${uid}`}
                >
                  <Text style={styles.mentionItemText}>{`@${uid}`}</Text>
                </Pressable>
              ))
            )}
          </View>
        ) : null}

        <View style={styles.photoLabelRow}>
          <Text style={styles.label}>{t('create.photoLabelMulti')}</Text>
          {photos.length > 0 ? (
            <Pressable
              onPress={() => setShowPreview((p) => !p)}
              accessibilityRole="button"
              accessibilityLabel={t('create.previewLabel')}
            >
              <Text style={styles.previewToggle}>{showPreview ? t('create.hidePreview') : t('create.showPreview')}</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Photo layout preview */}
        {showPreview && photos.length > 0 ? (
          <PhotoLayoutPreview photos={photos} />
        ) : null}

        <View style={styles.photoRow}>
          {photos.map((p) => (
            <View key={p.assetId} style={styles.photoThumbWrap}>
              <Image source={{ uri: p.uri }} style={styles.photoThumb} />
              <Pressable style={styles.photoRemoveBtn} onPress={() => handleRemovePhoto(p.assetId)} accessibilityRole="button" accessibilityLabel={t('create.removePhoto')}>
                <Text style={styles.photoRemoveText}>{t('create.removePhoto')}</Text>
              </Pressable>
            </View>
          ))}
          {photos.length < MAX_PHOTOS ? (
            <Pressable
              style={styles.addPhotoBtn}
              onPress={() => { void handleAddPhoto(); }}
              disabled={uploadProgress !== null}
              accessibilityRole="button"
              accessibilityLabel={t('create.addPhoto')}
            >
              {uploadProgress !== null ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <Text style={styles.addPhotoBtnText}>{t('create.addPhoto')}</Text>
              )}
            </Pressable>
          ) : null}
        </View>
        {uploadProgress !== null ? (
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
          </View>
        ) : null}

        {/* Video section */}
        <Text style={styles.label}>{t('video.label')}</Text>
        {videoUri ? (
          <View style={styles.videoPreviewWrap}>
            <View style={styles.videoPreview} accessibilityLabel={t('video.label')}>
              <Text style={styles.videoPlayIcon}>{t('video.play')}</Text>
            </View>
            <Pressable
              style={styles.videoRemoveBtn}
              onPress={handleRemoveVideo}
              accessibilityRole="button"
              accessibilityLabel={t('video.removeVideo')}
            >
              <Text style={styles.videoRemoveText}>{t('create.removePhoto')}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={styles.addVideoBtn}
            onPress={() => { void handleAddVideo(); }}
            disabled={videoUploading}
            accessibilityRole="button"
            accessibilityLabel={t('video.addVideo')}
          >
            {videoUploading ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Text style={styles.addVideoBtnText}>{t('video.addVideo')}</Text>
            )}
          </Pressable>
        )}

        {/* Poll section */}
        <Pressable
          style={styles.togglePollBtn}
          onPress={handleTogglePoll}
          accessibilityRole="button"
          accessibilityLabel={pollData ? t('poll.removePoll') : t('poll.addPoll')}
        >
          <Text style={styles.togglePollText}>{pollData ? t('poll.removePoll') : t('poll.addPoll')}</Text>
        </Pressable>

        {pollData ? (
          <View style={styles.pollContainer}>
            <Text style={styles.label}>{t('poll.label')}</Text>
            {pollError ? <Text style={styles.pollError}>{pollError}</Text> : null}
            {pollData.options.map((opt, idx) => (
              <View key={opt.id} style={styles.pollOptionRow}>
                <TextInput
                  style={styles.pollOptionInput}
                  value={opt.text}
                  onChangeText={(text) => handlePollOptionChange(opt.id, text)}
                  placeholder={t('poll.optionPlaceholder', { n: idx + 1 })}
                  placeholderTextColor="#999"
                  maxLength={80}
                />
                {pollData.options.length > 2 ? (
                  <Pressable
                    style={styles.pollRemoveBtn}
                    onPress={() => handleRemovePollOption(opt.id)}
                    accessibilityRole="button"
                    accessibilityLabel={t('poll.removeOption')}
                  >
                    <Text style={styles.pollRemoveBtnText}>{t('create.removePhoto')}</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
            {pollData.options.length < 4 ? (
              <Pressable
                style={styles.addPollOptionBtn}
                onPress={handleAddPollOption}
                accessibilityRole="button"
                accessibilityLabel={t('poll.addOption')}
              >
                <Text style={styles.addPollOptionText}>{t('poll.addOption')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Audience selector */}
        <Text style={styles.label}>{t('create.audienceLabel')}</Text>
        <View style={styles.typeRow}>
          {(AUDIENCE_VALUES).map((val) => (
            <Pressable
              key={val}
              style={[styles.typeChip, audience === val && styles.typeChipActive]}
              onPress={() => setAudience(val)}
              accessibilityRole="button"
              accessibilityState={{ selected: audience === val }}
              accessibilityLabel={t(`create.audience.${val}` as Parameters<typeof t>[0])}
            >
              <Text style={[styles.typeChipText, audience === val && styles.typeChipTextActive]}>
                {val === 'everyone' ? '🌍 ' : '👥 '}{t(`create.audience.${val}` as Parameters<typeof t>[0])}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Schedule post */}
        <Text style={styles.label}>{t('create.scheduleLabel')}</Text>
        {scheduledAt ? (
          <View style={styles.scheduledRow}>
            <Text style={styles.scheduledText}>
              {/* eslint-disable-next-line i18next/no-literal-string */}
              {scheduledAt.toLocaleDateString()} {String(scheduledAt.getHours()).padStart(2, '0')}:00
            </Text>
            <Pressable
              onPress={() => setScheduledAt(undefined)}
              accessibilityRole="button"
              accessibilityLabel={t('create.clearSchedule')}
            >
              <Text style={styles.clearPlaceText}>{t('create.clearPlace')}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={styles.scheduleBtn}
            onPress={() => setShowSchedulePicker(true)}
            accessibilityRole="button"
            accessibilityLabel={t('create.scheduleBtn')}
          >
            <Text style={styles.scheduleBtnText}>🕐 {t('create.scheduleBtn')}</Text>
          </Pressable>
        )}

        <SchedulePicker
          visible={showSchedulePicker}
          onDismiss={() => setShowSchedulePicker(false)}
          onConfirm={(date) => {
            setScheduledAt(date);
            setShowSchedulePicker(false);
          }}
          minDate={new Date()}
        />

        <Text style={styles.label}>{t('create.placeLabel')}</Text>
        {selectedPlace ? (
          <View style={styles.selectedPlaceRow}>
            <Text style={styles.selectedPlaceText}>{t('create.placeSelected', { name: selectedPlace.name })}</Text>
            <Pressable onPress={() => setSelectedPlace(undefined)} accessibilityRole="button" accessibilityLabel={t('create.clearPlace')}>
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
            {searchingPlace ? <ActivityIndicator size="small" color={COLORS.primary} style={styles.placeSpinner} /> : null}
            {placeResults.length > 0 ? (
              <View style={styles.placeDropdown}>
                {placeResults.map((p) => (
                  <Pressable key={p.id} style={styles.placeResultItem} onPress={() => handleSelectPlace(p)} accessibilityRole="button" accessibilityLabel={p.name}>
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
          accessibilityRole="button"
          accessibilityLabel={t('create.submit')}
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
  container: sharedStyles.container,
  header: sharedStyles.header,
  headerTitle: sharedStyles.headerTitle,
  dismissArea: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  errorRow: { ...sharedStyles.errorRow, borderRadius: 8, marginBottom: 12 },
  errorText: sharedStyles.errorText,
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
    backgroundColor: COLORS.primary,
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
    marginBottom: 4,
  },
  mentionDropdown: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    marginBottom: 12,
    overflow: 'hidden',
  },
  mentionLoading: {
    fontSize: 13,
    color: '#999',
    padding: 10,
  },
  mentionItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  mentionItemText: {
    fontSize: 14,
    color: '#1976D2',
  },
  submitBtn: {
    backgroundColor: COLORS.primary,
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
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  photoThumbWrap: {
    position: 'relative',
    width: 80,
    height: 80,
  },
  photoThumb: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  photoRemoveBtn: {
    position: 'absolute',
    top: 2,
    end: 2,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemoveText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  addPhotoBtn: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E3F2FD',
  },
  addPhotoBtnText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0E0E0',
    marginBottom: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
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
    color: COLORS.success,
    fontWeight: '500',
    flex: 1,
    textAlign: 'auto',
  },
  clearPlaceText: {
    fontSize: 16,
    color: '#999',
    paddingStart: 8,
  },
  togglePollBtn: {
    backgroundColor: COLORS.primaryXLight,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  togglePollText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '600',
  },
  pollContainer: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pollOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  pollOptionInput: {
    flex: 1,
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  pollRemoveBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.errorBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pollRemoveBtnText: {
    fontSize: 12,
    color: COLORS.error,
    fontWeight: '700',
  },
  addPollOptionBtn: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  addPollOptionText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '600',
  },
  pollError: {
    fontSize: 13,
    color: COLORS.error,
    marginBottom: 8,
  },
  videoPreviewWrap: {
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  videoPreview: {
    width: '100%',
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlayIcon: {
    fontSize: 40,
    color: '#FFF',
  },
  videoRemoveBtn: {
    position: 'absolute',
    top: 8,
    end: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 14,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoRemoveText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  addVideoBtn: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    borderRadius: 12,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  addVideoBtnText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
  },
  photoLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  previewToggle: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '600',
  },
  scheduledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primaryXLight,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  scheduledText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '500',
    flex: 1,
    textAlign: 'auto',
  },
  scheduleBtn: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
    alignItems: 'center',
  },
  scheduleBtnText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
  },
  clearScheduleText: {
    fontSize: 16,
    color: '#999',
    paddingStart: 8,
  },
});
