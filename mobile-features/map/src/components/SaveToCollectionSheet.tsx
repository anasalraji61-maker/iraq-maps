/**
 * SaveToCollectionSheet – bottom sheet to add/remove a place from collections.
 *
 * Features:
 *  - Shows all user's collections with current membership state
 *  - Toggle to add/remove a place in one tap
 *  - Inline quick-create new collection
 *  - Loading and optimistic update
 *  - ODbL clean: collection membership is user-owned, not OSM data
 *
 * Usage:
 *   <SaveToCollectionSheet
 *     visible={visible}
 *     onClose={() => setVisible(false)}
 *     placeId="abc"
 *     placeName="مطعم البيت"
 *     placeNameAr="مطعم البيت"
 *     placeCategory="restaurant"
 *     location={[44.3661, 33.3152]}
 *   />
 */
/* eslint-disable i18next/no-literal-string, no-restricted-syntax */

import type { CollectionId, CollectionSummary } from '@iraq-maps/contracts';
import { useApi } from '@iraq-maps/mobile-kit';
import { Sheet } from '@iraq-maps/ui';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  I18nManager,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text as RNText } from 'react-native';
import { t } from '../strings';

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIMARY = '#1976D2';
const DIVIDER = '#E0E0E0';
const MUTED = '#888';
const SUCCESS = '#2E7D32';

const QUICK_EMOJIS = ['❤️', '⭐', '🍽️', '☕', '🛍️', '🌿', '🏛️', '🕌', '🎯', '📚'];

// ── Props ──────────────────────────────────────────────────────────────────────

export interface SaveToCollectionSheetProps {
  visible: boolean;
  onClose: () => void;
  placeId: string;
  placeName: string;
  placeNameAr?: string;
  placeCategory?: string;
  location?: [number, number];
  coverImageUrl?: string;
  rating?: number;
  /** Called after toggling, with the updated set of collection IDs containing the place */
  onSaved?: (collectionIds: CollectionId[]) => void;
}

// ── Collection row ─────────────────────────────────────────────────────────────

function CollectionRow({
  collection,
  isInCollection,
  onToggle,
  toggling,
}: {
  collection: CollectionSummary;
  isInCollection: boolean;
  onToggle: () => void;
  toggling: boolean;
}): ReactElement {
  const checkAnim = useRef(new Animated.Value(isInCollection ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(checkAnim, { toValue: isInCollection ? 1 : 0, useNativeDriver: true, tension: 150, friction: 10 }).start();
  }, [isInCollection, checkAnim]);

  const checkScale = checkAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });

  return (
    <TouchableOpacity
      style={[rowStyles.row, isInCollection && rowStyles.rowActive]}
      onPress={onToggle}
      disabled={toggling}
      activeOpacity={0.75}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isInCollection }}
      accessibilityLabel={collection.nameAr}
    >
      {/* Emoji */}
      <View style={[rowStyles.emoji, isInCollection && rowStyles.emojiActive]}>
        <RNText style={rowStyles.emojiText}>{collection.emoji ?? '📌'}</RNText>
      </View>

      {/* Info */}
      <View style={rowStyles.info}>
        <RNText style={rowStyles.name} numberOfLines={1}>{collection.nameAr}</RNText>
        <RNText style={rowStyles.count}>
          {t('collections.placeCount', { count: collection.placeCount })}
        </RNText>
      </View>

      {/* Check / add indicator */}
      {toggling ? (
        <ActivityIndicator size="small" color={PRIMARY} />
      ) : (
        <Animated.View
          style={[
            rowStyles.check,
            isInCollection && rowStyles.checkActive,
            { transform: [{ scale: checkScale }] },
          ]}
        >
          <RNText style={[rowStyles.checkIcon, isInCollection && rowStyles.checkIconActive]}>
            {isInCollection ? '✓' : '+'}
          </RNText>
        </Animated.View>
      )}
    </TouchableOpacity>
  );
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 13, gap: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  rowActive: { backgroundColor: '#F0F7FF' },
  emoji: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center' },
  emojiActive: { backgroundColor: '#E3F2FD' },
  emojiText: { fontSize: 20 },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: '#111' },
  count: { fontSize: 12, color: MUTED, marginTop: 1 },
  check: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#DDD' },
  checkActive: { backgroundColor: SUCCESS, borderColor: SUCCESS },
  checkIcon: { fontSize: 14, fontWeight: '700', color: '#999' },
  checkIconActive: { color: '#fff' },
});

// ── Quick create form ──────────────────────────────────────────────────────────

interface QuickCreateProps {
  onCreated: (collection: CollectionSummary) => void;
  onCancel: () => void;
}

function QuickCreateForm({ onCreated, onCancel }: QuickCreateProps): ReactElement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = useApi() as any;
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('❤️');
  const [saving, setSaving] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true, tension: 100, friction: 12 }).start();
  }, [slideAnim]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await api.post('/v1/collections', {
        body: { nameAr: name.trim(), emoji, visibility: 'private', type: 'custom' },
      });
      if (res.status === 201) {
        const body = res.body as { collection: CollectionSummary };
        onCreated(body.collection);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const translateY = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [80, 0] });

  return (
    <Animated.View style={[qcStyles.container, { transform: [{ translateY }] }]}>
      <View style={qcStyles.header}>
        <RNText style={qcStyles.title}>{t('collections.quickCreateTitle')}</RNText>
        <TouchableOpacity onPress={onCancel} style={qcStyles.cancelBtn}>
          <RNText style={qcStyles.cancelIcon}>✕</RNText>
        </TouchableOpacity>
      </View>

      {/* Emoji picker */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={qcStyles.emojiRow}>
        {QUICK_EMOJIS.map((em) => (
          <TouchableOpacity
            key={em}
            style={[qcStyles.emojiBtn, emoji === em && qcStyles.emojiBtnSelected]}
            onPress={() => setEmoji(em)}
            accessibilityLabel={em}
          >
            <RNText style={qcStyles.emojiBtnText}>{em}</RNText>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Name input */}
      <View style={qcStyles.inputRow}>
        <View style={qcStyles.selectedEmoji}>
          <RNText style={qcStyles.selectedEmojiText}>{emoji}</RNText>
        </View>
        <TextInput
          style={qcStyles.input}
          value={name}
          onChangeText={setName}
          placeholder={t('collections.nameArPlaceholder')}
          placeholderTextColor="#B0B0B0"
          maxLength={100}
          textAlign={I18nManager.isRTL ? 'right' : 'left'}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleSave}
        />
      </View>

      {/* Save */}
      <TouchableOpacity
        style={[qcStyles.saveBtn, (!name.trim() || saving) && qcStyles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={!name.trim() || saving}
      >
        {saving ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <RNText style={qcStyles.saveBtnText}>{t('collections.quickCreateSave')}</RNText>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const qcStyles = StyleSheet.create({
  container: { borderTopWidth: 1, borderTopColor: DIVIDER, paddingTop: 12, paddingHorizontal: 20, paddingBottom: 8, backgroundColor: '#FAFEFF' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  title: { flex: 1, fontSize: 14, fontWeight: '700', color: '#222' },
  cancelBtn: { padding: 4 },
  cancelIcon: { fontSize: 14, color: MUTED },
  emojiRow: { gap: 8, paddingVertical: 4, paddingHorizontal: 2, marginBottom: 10 },
  emojiBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  emojiBtnSelected: { borderColor: PRIMARY, backgroundColor: '#E3F2FD' },
  emojiBtnText: { fontSize: 20 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  selectedEmoji: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E3F2FD', alignItems: 'center', justifyContent: 'center' },
  selectedEmojiText: { fontSize: 20 },
  input: { flex: 1, borderWidth: 1, borderColor: DIVIDER, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: '#111', backgroundColor: '#FAFAFA' },
  saveBtn: { backgroundColor: PRIMARY, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  saveBtnDisabled: { backgroundColor: '#BDBDBD' },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});

// ── Main component ─────────────────────────────────────────────────────────────

export function SaveToCollectionSheet({
  visible,
  onClose,
  placeId,
  placeName,
  placeNameAr,
  onSaved,
}: SaveToCollectionSheetProps): ReactElement | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = useApi() as any;

  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [memberOf, setMemberOf] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);

  // ── Load on open ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!visible) { setShowCreate(false); return; }

    const load = async () => {
      setLoading(true);
      try {
        const [myRes, memberRes] = await Promise.all([
          api.get('/v1/collections/mine'),
          api.get(`/v1/collections/by-place/${placeId}`),
        ]);

        if (myRes.status === 200) {
          const body = myRes.body as { collections: CollectionSummary[] };
          setCollections(body.collections ?? []);
        }

        if (memberRes.status === 200) {
          const body = memberRes.body as { collectionIds: CollectionId[] };
          setMemberOf(new Set(body.collectionIds));
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [visible, placeId, api]);

  // ── Toggle place in collection ────────────────────────────────────────────

  const handleToggle = useCallback(async (collectionId: string) => {
    const isIn = memberOf.has(collectionId);
    setToggling((prev) => new Set([...prev, collectionId]));

    // Optimistic update
    setMemberOf((prev) => {
      const next = new Set(prev);
      if (isIn) next.delete(collectionId);
      else next.add(collectionId);
      return next;
    });

    try {
      if (isIn) {
        await api.delete(`/v1/collections/${collectionId}/places/${placeId}`, { body: {} });
      } else {
        await api.post(`/v1/collections/${collectionId}/places`, {
          body: {
            placeId,
            ...(placeNameAr ? {} : {}), // metadata sent as placeMetadata on the service layer
          },
        });
      }

      // Update place count on the collection row
      setCollections((prev) => prev.map((c) => {
        if (c.id !== collectionId) return c;
        return { ...c, placeCount: isIn ? Math.max(0, c.placeCount - 1) : c.placeCount + 1 };
      }));

      const updatedMemberOf = new Set(memberOf);
      if (isIn) updatedMemberOf.delete(collectionId);
      else updatedMemberOf.add(collectionId);
      onSaved?.([...updatedMemberOf] as CollectionId[]);
    } catch {
      // Revert optimistic
      setMemberOf((prev) => {
        const next = new Set(prev);
        if (isIn) next.add(collectionId);
        else next.delete(collectionId);
        return next;
      });
    } finally {
      setToggling((prev) => { const next = new Set(prev); next.delete(collectionId); return next; });
    }
  }, [memberOf, placeId, api, placeNameAr, onSaved]);

  // ── Handle quick create ───────────────────────────────────────────────────

  const handleCreated = useCallback((collection: CollectionSummary) => {
    setCollections((prev) => [collection, ...prev]);
    setShowCreate(false);
    // Auto-add to the new collection
    void handleToggle(collection.id);
  }, [handleToggle]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!visible) return null;

  const savedCount = memberOf.size;

  return (
    <Sheet visible={visible} onClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <RNText style={styles.headerTitle}>{t('collections.saveToCollection')}</RNText>
            <RNText style={styles.placeName} numberOfLines={1}>{placeNameAr ?? placeName}</RNText>
          </View>
          {savedCount > 0 && (
            <View style={styles.savedBadge}>
              <RNText style={styles.savedBadgeText}>
                {t('collections.savedToCount', { count: savedCount })}
              </RNText>
            </View>
          )}
          <TouchableOpacity style={styles.doneBtn} onPress={onClose} accessibilityLabel={t('collections.done')}>
            <RNText style={styles.doneBtnText}>{t('collections.done')}</RNText>
          </TouchableOpacity>
        </View>

        {/* Loading */}
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={PRIMARY} size="small" />
          </View>
        ) : (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            {/* Collections list */}
            {collections.length === 0 && !showCreate ? (
              <View style={styles.emptyState}>
                <RNText style={styles.emptyIcon}>📚</RNText>
                <RNText style={styles.emptyText}>{t('collections.noCollectionsYet')}</RNText>
              </View>
            ) : (
              collections.map((collection) => (
                <CollectionRow
                  key={collection.id}
                  collection={collection}
                  isInCollection={memberOf.has(collection.id)}
                  onToggle={() => handleToggle(collection.id)}
                  toggling={toggling.has(collection.id)}
                />
              ))
            )}

            {/* Quick create */}
            {showCreate ? (
              <QuickCreateForm onCreated={handleCreated} onCancel={() => setShowCreate(false)} />
            ) : (
              <TouchableOpacity style={styles.newCollectionBtn} onPress={() => setShowCreate(true)} accessibilityRole="button">
                <View style={styles.newCollectionIcon}>
                  <RNText style={styles.newCollectionIconText}>+</RNText>
                </View>
                <RNText style={styles.newCollectionText}>{t('collections.newCollection')}</RNText>
              </TouchableOpacity>
            )}

            <View style={{ height: 16 }} />
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Sheet>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: DIVIDER, gap: 10 },
  headerLeft: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  placeName: { fontSize: 12, color: MUTED, marginTop: 2 },
  savedBadge: { backgroundColor: '#E8F5E9', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: '#A5D6A7' },
  savedBadgeText: { fontSize: 12, color: SUCCESS, fontWeight: '600' },
  doneBtn: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: PRIMARY, borderRadius: 16 },
  doneBtnText: { fontSize: 13, color: '#fff', fontWeight: '600' },
  loading: { height: 120, alignItems: 'center', justifyContent: 'center' },
  scroll: { maxHeight: 440 },
  scrollContent: { paddingBottom: 8 },
  emptyState: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: 14, color: MUTED },
  newCollectionBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 12, borderTopWidth: 1, borderTopColor: DIVIDER, marginTop: 4 },
  newCollectionIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#DDD', borderStyle: 'dashed' },
  newCollectionIconText: { fontSize: 22, color: PRIMARY, fontWeight: '700', lineHeight: 26 },
  newCollectionText: { fontSize: 15, fontWeight: '600', color: PRIMARY },
});
