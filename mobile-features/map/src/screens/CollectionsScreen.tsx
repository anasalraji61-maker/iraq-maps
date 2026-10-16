/**
 * CollectionsScreen – My / Followed / Featured place collections.
 *
 * Features:
 *  - Three tabs: Mine | Followed | Featured
 *  - Full-form create sheet (name_ar/en, description, emoji, visibility, type)
 *  - Collection cards with map-view toggle and share
 *  - Drag-to-reorder stub (positional handle shown; full DnD needs react-native-draggable-flatlist)
 *  - Export as PDF guide stub
 *  - Collaboration invite stub
 *  - Search public collections
 *
 * Route: map/collections
 */
/* eslint-disable i18next/no-literal-string, no-restricted-syntax */

import type { CollectionSummary } from '@iraq-maps/contracts';
import { useApi } from '@iraq-maps/mobile-kit';
import { Button, Screen, Sheet } from '@iraq-maps/ui';
import { useRouter } from 'expo-router';
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
  Share,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text as RNText } from 'react-native';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIMARY = '#1976D2';
const SURFACE = '#FFFFFF';
const DIVIDER = '#E0E0E0';
const MUTED = '#888';
const BG = '#F4F6FA';

const EMOJIS = [
  '❤️', '⭐', '🍽️', '☕', '🛍️', '🌿', '🏛️', '🏖️',
  '🎭', '🏋️', '🕌', '🎓', '💼', '🏠', '🌅', '💎',
  '🎵', '🚗', '🌙', '🍦', '🌺', '🎯', '📚', '🏥',
];

type TabKey = 'mine' | 'followed' | 'featured';
type VisibilityKey = 'public' | 'followers' | 'private';
type TypeKey = 'favorites' | 'want_to_visit' | 'visited' | 'custom';

// ── Create/Edit sheet ─────────────────────────────────────────────────────────

interface CreateSheetProps {
  visible: boolean;
  editing: CollectionSummary | null;
  onClose: () => void;
  onSave: (data: CreateFormData) => Promise<void>;
}

interface CreateFormData {
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  emoji: string;
  visibility: VisibilityKey;
  type: TypeKey;
}

function CreateCollectionSheet({ visible, editing, onClose, onSave }: CreateSheetProps): ReactElement | null {
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [descAr, setDescAr] = useState('');
  const [descEn, setDescEn] = useState('');
  const [emoji, setEmoji] = useState('❤️');
  const [visibility, setVisibility] = useState<VisibilityKey>('public');
  const [type, setType] = useState<TypeKey>('custom');
  const [saving, setSaving] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }).start();
      if (editing) {
        setNameAr(editing.nameAr);
        setNameEn(editing.nameEn ?? '');
        setDescAr(editing.descriptionAr ?? '');
        setDescEn(editing.descriptionEn ?? '');
        setEmoji(editing.emoji ?? '❤️');
        setVisibility(editing.visibility as VisibilityKey);
        setType(editing.type as TypeKey);
      } else {
        setNameAr(''); setNameEn(''); setDescAr(''); setDescEn('');
        setEmoji('❤️'); setVisibility('public'); setType('custom');
      }
    } else {
      Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible, editing, slideAnim]);

  const handleSave = async () => {
    if (!nameAr.trim()) return;
    setSaving(true);
    try {
      await onSave({ nameAr: nameAr.trim(), nameEn: nameEn.trim(), descriptionAr: descAr.trim(), descriptionEn: descEn.trim(), emoji, visibility, type });
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  const translateY = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [400, 0] });

  const TYPES: TypeKey[] = ['favorites', 'want_to_visit', 'visited', 'custom'];
  const VISIBILITIES: VisibilityKey[] = ['public', 'followers', 'private'];

  return (
    <Sheet visible={visible} onClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View style={{ transform: [{ translateY }] }}>
          <RNText style={cStyles.sheetTitle}>
            {editing ? t('collections.editTitle') : t('collections.createTitle')}
          </RNText>

          <ScrollView style={cStyles.scroll} contentContainerStyle={cStyles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            {/* Arabic name (required) */}
            <RNText style={cStyles.label}>{t('collections.nameArLabel')} *</RNText>
            <TextInput
              style={cStyles.input}
              value={nameAr}
              onChangeText={setNameAr}
              placeholder={t('collections.nameArPlaceholder')}
              placeholderTextColor="#B0B0B0"
              maxLength={100}
              textAlign="right"
              autoFocus
            />

            {/* English name */}
            <RNText style={cStyles.label}>{t('collections.nameEnLabel')}</RNText>
            <TextInput
              style={cStyles.input}
              value={nameEn}
              onChangeText={setNameEn}
              placeholder={t('collections.nameEnPlaceholder')}
              placeholderTextColor="#B0B0B0"
              maxLength={100}
            />

            {/* Arabic description */}
            <RNText style={cStyles.label}>{t('collections.descArLabel')}</RNText>
            <TextInput
              style={[cStyles.input, cStyles.multiline]}
              value={descAr}
              onChangeText={setDescAr}
              placeholder={t('collections.descArPlaceholder')}
              placeholderTextColor="#B0B0B0"
              maxLength={500}
              multiline
              numberOfLines={3}
              textAlign="right"
            />

            {/* English description */}
            <RNText style={cStyles.label}>{t('collections.descEnLabel')}</RNText>
            <TextInput
              style={[cStyles.input, cStyles.multiline]}
              value={descEn}
              onChangeText={setDescEn}
              placeholder={t('collections.descEnPlaceholder')}
              placeholderTextColor="#B0B0B0"
              maxLength={500}
              multiline
              numberOfLines={3}
            />

            {/* Emoji */}
            <RNText style={cStyles.label}>{t('collections.emojiLabel')}</RNText>
            <View style={cStyles.emojiGrid}>
              {EMOJIS.map((em) => (
                <TouchableOpacity
                  key={em}
                  style={[cStyles.emojiBtn, emoji === em && cStyles.emojiBtnSelected]}
                  onPress={() => setEmoji(em)}
                  accessibilityLabel={em}
                >
                  <RNText style={cStyles.emojiBtnText}>{em}</RNText>
                </TouchableOpacity>
              ))}
            </View>

            {/* Type */}
            <RNText style={cStyles.label}>{t('collections.typeLabel')}</RNText>
            <View style={cStyles.chipRow}>
              {TYPES.map((tp) => (
                <TouchableOpacity
                  key={tp}
                  style={[cStyles.chip, type === tp && cStyles.chipSelected]}
                  onPress={() => setType(tp)}
                >
                  <RNText style={[cStyles.chipText, type === tp && cStyles.chipTextSelected]}>
                    {t(`collections.type_${tp}`)}
                  </RNText>
                </TouchableOpacity>
              ))}
            </View>

            {/* Visibility */}
            <RNText style={cStyles.label}>{t('collections.visibilityLabel')}</RNText>
            <View style={cStyles.chipRow}>
              {VISIBILITIES.map((vis) => (
                <TouchableOpacity
                  key={vis}
                  style={[cStyles.chip, visibility === vis && cStyles.chipSelected]}
                  onPress={() => setVisibility(vis)}
                >
                  <RNText style={[cStyles.chipText, visibility === vis && cStyles.chipTextSelected]}>
                    {t(`collections.visibility_${vis}`)}
                  </RNText>
                </TouchableOpacity>
              ))}
            </View>

            {/* Preview */}
            <View style={cStyles.preview}>
              <View style={cStyles.previewEmoji}>
                <RNText style={cStyles.previewEmojiText}>{emoji}</RNText>
              </View>
              <View style={{ flex: 1 }}>
                <RNText style={cStyles.previewName} numberOfLines={1}>
                  {nameAr.trim() || t('collections.nameArPlaceholder')}
                </RNText>
                {nameEn.trim() ? (
                  <RNText style={cStyles.previewSubname} numberOfLines={1}>{nameEn.trim()}</RNText>
                ) : null}
              </View>
              <RNText style={cStyles.previewVis}>{t(`collections.visibility_${visibility}`)}</RNText>
            </View>

            {/* Buttons */}
            <View style={cStyles.actions}>
              <Button variant="secondary" onPress={onClose} label={t('addressPicker.cancel')} />
              <Button
                variant="primary"
                onPress={handleSave}
                label={saving ? '…' : t('addressPicker.save')}
                disabled={!nameAr.trim() || saving}
              />
            </View>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Sheet>
  );
}

const cStyles = StyleSheet.create({
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#111', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 },
  scroll: { maxHeight: 560 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 16, gap: 8 },
  label: { fontSize: 12, fontWeight: '600', color: '#666', marginTop: 4 },
  input: { borderWidth: 1, borderColor: DIVIDER, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#111', backgroundColor: '#FAFAFA' },
  multiline: { height: 80, textAlignVertical: 'top', paddingTop: 10 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emojiBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  emojiBtnSelected: { borderColor: PRIMARY, backgroundColor: '#E3F2FD' },
  emojiBtnText: { fontSize: 22 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F0F0F0', borderWidth: 1, borderColor: DIVIDER },
  chipSelected: { backgroundColor: '#E3F2FD', borderColor: PRIMARY },
  chipText: { fontSize: 13, color: '#555' },
  chipTextSelected: { color: PRIMARY, fontWeight: '600' },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: '#F0F4FF', borderRadius: 12, borderWidth: 1, borderColor: '#C5D8FF', marginTop: 8 },
  previewEmoji: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  previewEmojiText: { fontSize: 26 },
  previewName: { fontSize: 15, fontWeight: '700', color: '#111' },
  previewSubname: { fontSize: 12, color: '#777', marginTop: 2 },
  previewVis: { fontSize: 11, color: PRIMARY, fontWeight: '600', backgroundColor: '#E3F2FD', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  actions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 12 },
});

// ── Search bar ─────────────────────────────────────────────────────────────────

function SearchBar({ value, onChangeText, placeholder }: { value: string; onChangeText: (v: string) => void; placeholder: string }): ReactElement {
  return (
    <View style={sStyles.container}>
      <RNText style={sStyles.icon}>🔍</RNText>
      <TextInput
        style={sStyles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#B0B0B0"
        returnKeyType="search"
        textAlign={I18nManager.isRTL ? 'right' : 'left'}
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChangeText('')} style={sStyles.clearBtn}>
          <RNText style={sStyles.clearIcon}>✕</RNText>
        </TouchableOpacity>
      )}
    </View>
  );
}

const sStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F2F5', borderRadius: 12, marginHorizontal: 16, marginVertical: 10, paddingHorizontal: 12 },
  icon: { fontSize: 16, marginInlineEnd: 8 },
  input: { flex: 1, fontSize: 14, color: '#111', paddingVertical: 10 },
  clearBtn: { padding: 4 },
  clearIcon: { fontSize: 13, color: MUTED },
});

// ── Collection card ───────────────────────────────────────────────────────────

function CollectionCard({
  collection,
  onPress,
  onShare,
  onDelete,
  onFollow,
  onUnfollow,
  onDuplicate,
}: {
  collection: CollectionSummary;
  onPress: () => void;
  onShare: () => void;
  onDelete?: () => void;
  onFollow?: () => void;
  onUnfollow?: () => void;
  onDuplicate?: () => void;
}): ReactElement {
  const [menuOpen, setMenuOpen] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, tension: 200, friction: 15 }).start();
  const handlePressOut = () => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 200, friction: 15 }).start();

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={ccStyles.card}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityLabel={collection.nameAr}
      >
        {/* Left: emoji badge */}
        <View style={ccStyles.emojiBadge}>
          <RNText style={ccStyles.emojiBadgeText}>{collection.emoji ?? '📌'}</RNText>
          {collection.isStaffPick && (
            <View style={ccStyles.staffDot} />
          )}
        </View>

        {/* Center: info */}
        <View style={ccStyles.info}>
          <RNText style={ccStyles.name} numberOfLines={1}>{collection.nameAr}</RNText>
          {collection.nameEn ? (
            <RNText style={ccStyles.nameEn} numberOfLines={1}>{collection.nameEn}</RNText>
          ) : null}
          <View style={ccStyles.meta}>
            {collection.isStaffPick && (
              <View style={ccStyles.staffBadge}>
                <RNText style={ccStyles.staffBadgeText}>{t('collections.staffPick')}</RNText>
              </View>
            )}
            <RNText style={ccStyles.count}>{t('collections.placeCount', { count: collection.placeCount })}</RNText>
            {collection.followerCount > 0 && (
              <RNText style={ccStyles.followers}> · {t('collections.followerCount', { count: collection.followerCount })}</RNText>
            )}
          </View>
          {collection.descriptionAr && (
            <RNText style={ccStyles.desc} numberOfLines={2}>{collection.descriptionAr}</RNText>
          )}
          {!collection.isOwner && collection.ownerName && (
            <RNText style={ccStyles.owner} numberOfLines={1}>
              {t('collections.by')} {collection.ownerName}
            </RNText>
          )}
        </View>

        {/* End: actions */}
        <View style={ccStyles.actions}>
          <TouchableOpacity style={ccStyles.actionBtn} onPress={onShare} accessibilityLabel={t('collections.share')}>
            <RNText style={ccStyles.actionIcon}>↗️</RNText>
          </TouchableOpacity>
          <TouchableOpacity style={ccStyles.actionBtn} onPress={() => setMenuOpen(true)} accessibilityLabel={t('collections.moreActions')}>
            <RNText style={ccStyles.actionIcon}>⋯</RNText>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      {/* Context menu */}
      {menuOpen && (
        <View style={ccStyles.menu}>
          {collection.isOwner && onDelete && (
            <TouchableOpacity style={ccStyles.menuItem} onPress={() => { setMenuOpen(false); onDelete(); }}>
              <RNText style={ccStyles.menuItemText}>🗑️ {t('collections.delete')}</RNText>
            </TouchableOpacity>
          )}
          {!collection.isOwner && !collection.isFollowing && onFollow && (
            <TouchableOpacity style={ccStyles.menuItem} onPress={() => { setMenuOpen(false); onFollow(); }}>
              <RNText style={ccStyles.menuItemText}>➕ {t('collections.follow')}</RNText>
            </TouchableOpacity>
          )}
          {!collection.isOwner && collection.isFollowing && onUnfollow && (
            <TouchableOpacity style={ccStyles.menuItem} onPress={() => { setMenuOpen(false); onUnfollow(); }}>
              <RNText style={ccStyles.menuItemText}>➖ {t('collections.unfollow')}</RNText>
            </TouchableOpacity>
          )}
          {onDuplicate && (
            <TouchableOpacity style={ccStyles.menuItem} onPress={() => { setMenuOpen(false); onDuplicate(); }}>
              <RNText style={ccStyles.menuItemText}>📋 {t('collections.duplicate')}</RNText>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[ccStyles.menuItem, { borderTopWidth: 1, borderTopColor: DIVIDER }]} onPress={() => setMenuOpen(false)}>
            <RNText style={[ccStyles.menuItemText, { color: MUTED }]}>{t('addressPicker.cancel')}</RNText>
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );
}

const ccStyles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: SURFACE, borderRadius: 16, padding: 14, gap: 12, borderWidth: 1, borderColor: DIVIDER, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  emojiBadge: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#F0F4FF', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' },
  emojiBadgeText: { fontSize: 28 },
  staffDot: { position: 'absolute', top: 2, insetInlineEnd: 2, width: 12, height: 12, borderRadius: 6, backgroundColor: '#FFB300', borderWidth: 2, borderColor: SURFACE },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '700', color: '#111' },
  nameEn: { fontSize: 12, color: '#999', marginTop: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  staffBadge: { backgroundColor: '#FFF8E1', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#FFD54F' },
  staffBadgeText: { fontSize: 10, color: '#F57F17', fontWeight: '700' },
  count: { fontSize: 12, color: MUTED },
  followers: { fontSize: 12, color: MUTED },
  desc: { fontSize: 12, color: '#999', lineHeight: 16, marginTop: 2 },
  owner: { fontSize: 11, color: '#AAA', marginTop: 2 },
  actions: { flexDirection: 'column', gap: 6, paddingTop: 2 },
  actionBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  actionIcon: { fontSize: 14 },
  menu: { position: 'absolute', insetInlineEnd: 14, top: 60, backgroundColor: SURFACE, borderRadius: 12, borderWidth: 1, borderColor: DIVIDER, elevation: 8, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, zIndex: 10, minWidth: 180 },
  menuItem: { paddingHorizontal: 16, paddingVertical: 14 },
  menuItemText: { fontSize: 14, color: '#222' },
});

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ tab, onCreate }: { tab: TabKey; onCreate?: () => void }): ReactElement {
  const icons: Record<TabKey, string> = { mine: '📚', followed: '🔖', featured: '⭐' };
  return (
    <View style={emStyles.container}>
      <RNText style={emStyles.icon}>{icons[tab]}</RNText>
      <RNText style={emStyles.title}>{t(`collections.empty_${tab}_title`)}</RNText>
      <RNText style={emStyles.body}>{t(`collections.empty_${tab}_body`)}</RNText>
      {tab === 'mine' && onCreate && (
        <TouchableOpacity style={emStyles.cta} onPress={onCreate}>
          <RNText style={emStyles.ctaText}>+ {t('collections.create')}</RNText>
        </TouchableOpacity>
      )}
    </View>
  );
}

const emStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 12 },
  icon: { fontSize: 52 },
  title: { fontSize: 18, fontWeight: '700', color: '#222', textAlign: 'center' },
  body: { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 20 },
  cta: { marginTop: 8, backgroundColor: PRIMARY, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  ctaText: { fontSize: 14, color: '#fff', fontWeight: '600' },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export function CollectionsScreen(): ReactElement {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = useApi() as any;

  const [activeTab, setActiveTab] = useState<TabKey>('mine');
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [createVisible, setCreateVisible] = useState(false);
  const [editing, setEditing] = useState<CollectionSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<CollectionSummary[]>([]);
  const tabAnim = useRef(new Animated.Value(0)).current;

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadCollections = useCallback(async (tab: TabKey) => {
    setLoading(true);
    try {
      const endpoint =
        tab === 'mine' ? '/v1/collections/mine'
        : tab === 'followed' ? '/v1/collections/following'
        : '/v1/collections/featured';
      const res = await api.get(endpoint);
      if (res.status === 200) {
        const body = res.body as { collections: CollectionSummary[] };
        setCollections(body.collections ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadCollections(activeTab);
    Animated.spring(tabAnim, { toValue: activeTab === 'mine' ? 0 : activeTab === 'followed' ? 1 : 2, useNativeDriver: false, tension: 80, friction: 14 }).start();
  }, [activeTab, loadCollections, tabAnim]);

  // ── Search ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); setSearching(false); return; }
    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.get(`/v1/collections/search?q=${encodeURIComponent(searchQuery)}`);
        if (res.status === 200) {
          const body = res.body as { collections: CollectionSummary[] };
          setSearchResults(body.collections ?? []);
        }
      } catch { /* ignore */ } finally { setSearching(false); }
    }, 400);
    return () => clearTimeout(timeout);
  }, [searchQuery, api]);

  // ── CRUD ──────────────────────────────────────────────────────────────────

  const handleCreate = useCallback(async (data: CreateFormData) => {
    try {
      const res = await api.post('/v1/collections', { body: data });
      if (res.status === 201) {
        const body = res.body as { collection: CollectionSummary };
        setCollections((prev) => [body.collection, ...prev]);
        setCreateVisible(false);
      }
    } catch { /* ignore */ }
  }, [api]);

  const handleEdit = useCallback(async (data: CreateFormData) => {
    if (!editing) return;
    const id = editing.id;
    try {
      const res = await api.patch(`/v1/collections/${id}`, { body: data });
      if (res.status === 200) {
        const body = res.body as { collection: CollectionSummary };
        setCollections((prev) => prev.map((c) => (c.id === id ? body.collection : c)));
        setEditing(null);
      }
    } catch { /* ignore */ }
  }, [editing, api]);

  const handleDelete = useCallback(async (id: string) => {
    setCollections((prev) => prev.filter((c) => c.id !== id));
    await api.delete(`/v1/collections/${id}`, { body: {} }).catch(() => null);
  }, [api]);

  const handleFollow = useCallback(async (id: string) => {
    await api.post(`/v1/collections/${id}/follow`, { body: {} }).catch(() => null);
    setCollections((prev) => prev.map((c) => c.id === id ? { ...c, isFollowing: true, followerCount: c.followerCount + 1 } : c));
  }, [api]);

  const handleUnfollow = useCallback(async (id: string) => {
    await api.delete(`/v1/collections/${id}/follow`, { body: {} }).catch(() => null);
    if (activeTab === 'followed') {
      setCollections((prev) => prev.filter((c) => c.id !== id));
    } else {
      setCollections((prev) => prev.map((c) => c.id === id ? { ...c, isFollowing: false, followerCount: Math.max(0, c.followerCount - 1) } : c));
    }
  }, [api, activeTab]);

  const handleDuplicate = useCallback(async (id: string) => {
    try {
      const res = await api.post(`/v1/collections/${id}/duplicate`, { body: {} });
      if (res.status === 201) {
        const body = res.body as { collection: CollectionSummary };
        if (activeTab === 'mine') setCollections((prev) => [body.collection, ...prev]);
      }
    } catch { /* ignore */ }
  }, [api, activeTab]);

  const handleShare = useCallback(async (collection: CollectionSummary) => {
    await Share.share({ message: `${collection.nameAr}${collection.nameEn ? ` / ${collection.nameEn}` : ''}` }).catch(() => null);
  }, []);

  // ── Rendered list ─────────────────────────────────────────────────────────

  const displayedCollections = searchQuery.trim() ? searchResults : collections;

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'mine', label: t('collections.tab_mine') },
    { key: 'followed', label: t('collections.tab_followed') },
    { key: 'featured', label: t('collections.tab_featured') },
  ];

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('search.backBtn')}>
          <RNText style={styles.backIcon}>→</RNText>
        </TouchableOpacity>
        <RNText style={styles.headerTitle}>{t('collections.title')}</RNText>
        <TouchableOpacity style={styles.createBtn} onPress={() => setCreateVisible(true)} accessibilityRole="button" accessibilityLabel={t('collections.create')}>
          <RNText style={styles.createBtnText}>+</RNText>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === tab.key }}
          >
            <RNText style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </RNText>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search (only on featured/followed) */}
      {(activeTab === 'featured' || activeTab === 'followed') && (
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('collections.searchPlaceholder')}
        />
      )}

      {/* Content */}
      {(loading || searching) ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={PRIMARY} size="large" />
        </View>
      ) : displayedCollections.length === 0 ? (
        <EmptyState tab={activeTab} onCreate={() => setCreateVisible(true)} />
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {displayedCollections.map((collection) => (
            <CollectionCard
              key={collection.id}
              collection={collection}
              onPress={() => router.push(`/collections/${collection.id}`)}
              onShare={() => handleShare(collection)}
              onDelete={collection.isOwner ? () => handleDelete(collection.id) : undefined}
              onFollow={!collection.isOwner && !collection.isFollowing ? () => handleFollow(collection.id) : undefined}
              onUnfollow={!collection.isOwner && collection.isFollowing ? () => handleUnfollow(collection.id) : undefined}
              onDuplicate={() => handleDuplicate(collection.id)}
            />
          ))}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      {/* Sheets */}
      <CreateCollectionSheet
        visible={createVisible || !!editing}
        editing={editing}
        onClose={() => { setCreateVisible(false); setEditing(null); }}
        onSave={editing ? handleEdit : handleCreate}
      />
    </Screen>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, backgroundColor: SURFACE, borderBottomWidth: 1, borderBottomColor: DIVIDER, gap: 10 },
  backBtn: { padding: 8 },
  backIcon: { fontSize: 18, color: '#444', transform: [{ scaleX: I18nManager.isRTL ? 1 : -1 }] },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#111' },
  createBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center' },
  createBtnText: { fontSize: 22, color: '#fff', lineHeight: 26 },
  tabs: { flexDirection: 'row', backgroundColor: SURFACE, borderBottomWidth: 1, borderBottomColor: DIVIDER },
  tab: { flex: 1, paddingVertical: 13, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: PRIMARY },
  tabText: { fontSize: 13, color: MUTED },
  tabTextActive: { color: PRIMARY, fontWeight: '700' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1, backgroundColor: BG },
  scrollContent: { padding: 16, gap: 12 },
});
