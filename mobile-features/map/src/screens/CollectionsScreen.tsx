/**
 * CollectionsScreen – place collections (user-created, friends', official curated).
 *
 * Features:
 *  - Create collection (name, icon, color)
 *  - Add/remove places from collection
 *  - Share collection
 *  - View collection on map
 *  - My Collections + Friends' Collections tabs
 *  - Official curated lists
 *
 * Route: map/collections
 */

import type { PlaceSearchResult } from '@iraq-maps/contracts';
import { useApi } from '@iraq-maps/mobile-kit';
import { Button, Screen, Sheet } from '@iraq-maps/ui';
import { useRouter } from 'expo-router';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  ActivityIndicator,
  I18nManager,
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

const COLLECTION_ICONS = [
  '❤️', '⭐', '🍽️', '☕', '🛍️', '🌿', '🏛️', '🏖️',
  '🎭', '🏋️', '🕌', '🎓', '💼', '🏠', '🌅', '💎',
];

const COLLECTION_COLORS = [
  '#EF5350', '#EC407A', '#AB47BC', '#5C6BC0',
  '#1E88E5', '#00ACC1', '#26A69A', '#66BB6A',
  '#D4E157', '#FFA726', '#FF7043', '#8D6E63',
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Collection {
  id: string;
  name: string;
  icon: string;
  color: string;
  placeCount: number;
  isOwner: boolean;
  ownerName?: string;
  ownerAvatarUrl?: string | null;
  isOfficial?: boolean;
  description?: string;
  places?: PlaceSearchResult[];
  createdAt: string;
  shareUrl?: string;
}

type TabKey = 'mine' | 'friends' | 'official';

// ── Create/edit sheet ─────────────────────────────────────────────────────────

function CreateCollectionSheet({
  visible,
  editing,
  onClose,
  onSave,
}: {
  visible: boolean;
  editing?: Collection | null;
  onClose: () => void;
  onSave: (name: string, icon: string, color: string) => void;
}): ReactElement | null {
  const [name, setName] = useState(editing?.name ?? '');
  const [icon, setIcon] = useState(editing?.icon ?? '❤️');
  const [color, setColor] = useState(editing?.color ?? COLLECTION_COLORS[0]!);

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setIcon(editing.icon);
      setColor(editing.color);
    } else {
      setName('');
      setIcon('❤️');
      setColor(COLLECTION_COLORS[0]!);
    }
  }, [editing, visible]);

  if (!visible) return null;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
    >
      <RNText style={createStyles.sheetTitle}>
        {editing ? t('collections.editTitle') : t('collections.createTitle')}
      </RNText>
      <ScrollView
        style={createStyles.scroll}
        contentContainerStyle={createStyles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Name */}
        <RNText style={createStyles.label}>{t('collections.nameLabel')}</RNText>
        <TextInput
          style={createStyles.input}
          value={name}
          onChangeText={setName}
          placeholder={t('collections.namePlaceholder')}
          placeholderTextColor="#9E9E9E"
          maxLength={50}
          textAlign={I18nManager.isRTL ? 'right' : 'left'}
          autoFocus
        />

        {/* Icon picker */}
        <RNText style={createStyles.label}>{t('collections.iconLabel')}</RNText>
        <View style={createStyles.iconGrid}>
          {COLLECTION_ICONS.map((ic) => (
            <TouchableOpacity
              key={ic}
              style={[
                createStyles.iconBtn,
                icon === ic && { borderColor: color, borderWidth: 2 },
              ]}
              onPress={() => setIcon(ic)}
            >
              <RNText style={createStyles.iconBtnText}>{ic}</RNText>
            </TouchableOpacity>
          ))}
        </View>

        {/* Color picker */}
        <RNText style={createStyles.label}>{t('collections.colorLabel')}</RNText>
        <View style={createStyles.colorGrid}>
          {COLLECTION_COLORS.map((c) => (
            <TouchableOpacity
              key={c}
              style={[
                createStyles.colorBtn,
                { backgroundColor: c },
                color === c && createStyles.colorBtnSelected,
              ]}
              onPress={() => setColor(c)}
              accessibilityLabel={c}
            >
              {color === c && (
                <RNText style={createStyles.colorBtnCheck}>✓</RNText>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Preview */}
        <View style={createStyles.preview}>
          <View
            style={[createStyles.previewIcon, { backgroundColor: color + '22' }]}
          >
            <RNText style={createStyles.previewIconText}>{icon}</RNText>
          </View>
          <RNText style={createStyles.previewName}>
            {name || t('collections.namePlaceholder')}
          </RNText>
        </View>

        {/* Actions */}
        <View style={createStyles.actions}>
          <Button variant="secondary" onPress={onClose} label={t('addressPicker.cancel')} />
          <Button
            variant="primary"
            onPress={() => onSave(name.trim(), icon, color)}
            label={t('addressPicker.save')}
            disabled={!name.trim()}
          />
        </View>
      </ScrollView>
    </Sheet>
  );
}

const createStyles = StyleSheet.create({
  scroll: { maxHeight: 520 },
  scrollContent: { padding: 16, gap: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: DIVIDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#111',
    backgroundColor: '#FAFAFA',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  iconBtnText: { fontSize: 22 },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  colorBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorBtnSelected: {
    borderWidth: 3,
    borderColor: '#fff',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  colorBtnCheck: { fontSize: 14, color: '#fff', fontWeight: '700' },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: DIVIDER,
  },
  previewIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewIconText: { fontSize: 24 },
  previewName: { fontSize: 16, fontWeight: '600', color: '#111' },
  actions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    marginBottom: 4,
  },
});

// ── Collection card ───────────────────────────────────────────────────────────

function CollectionCard({
  collection,
  onPress,
  onShare,
  onViewMap,
  onDelete,
}: {
  collection: Collection;
  onPress: () => void;
  onShare: () => void;
  onViewMap: () => void;
  onDelete?: () => void;
}): ReactElement {
  const [menuVisible, setMenuVisible] = useState(false);

  return (
    <TouchableOpacity
      style={styles.collectionCard}
      onPress={onPress}
      onLongPress={() => setMenuVisible(true)}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={collection.name}
    >
      {/* Icon */}
      <View
        style={[
          styles.collectionIcon,
          { backgroundColor: collection.color + '22' },
        ]}
      >
        <RNText style={styles.collectionIconText}>{collection.icon}</RNText>
      </View>

      {/* Info */}
      <View style={styles.collectionInfo}>
        <RNText style={styles.collectionName} numberOfLines={1}>
          {collection.name}
        </RNText>
        <View style={styles.collectionMeta}>
          {collection.isOfficial && (
            <View style={styles.officialBadge}>
              <RNText style={styles.officialBadgeText}>
                {t('collections.officialBadge')}
              </RNText>
            </View>
          )}
          <RNText style={styles.collectionCount}>
            {t('collections.placeCount', { count: collection.placeCount })}
          </RNText>
          {!collection.isOwner && collection.ownerName && (
            <RNText style={styles.collectionOwner} numberOfLines={1}>
              · {collection.ownerName}
            </RNText>
          )}
        </View>
        {collection.description && (
          <RNText style={styles.collectionDesc} numberOfLines={2}>
            {collection.description}
          </RNText>
        )}
      </View>

      {/* Actions */}
      <View style={styles.collectionActions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={onViewMap}
          accessibilityLabel={t('collections.viewOnMap')}
        >
          <RNText style={styles.actionIcon}>🗺️</RNText>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={onShare}
          accessibilityLabel={t('collections.share')}
        >
          <RNText style={styles.actionIcon}>↗️</RNText>
        </TouchableOpacity>
        {collection.isOwner && onDelete && (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={onDelete}
            accessibilityLabel={t('collections.delete')}
          >
            <RNText style={styles.actionIcon}>🗑️</RNText>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function CollectionsScreen(): ReactElement {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = useApi() as any;

  const [activeTab, setActiveTab] = useState<TabKey>('mine');
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [createVisible, setCreateVisible] = useState(false);
  const [editingCollection, setEditingCollection] =
    useState<Collection | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadCollections = useCallback(
    async (tab: TabKey) => {
      setLoading(true);
      try {
        const res = await api.get(
          `/v1/search/collections?scope=${tab}`,
        );
        if (res.status === 200) {
          const body = res.body as { collections: Collection[] };
          setCollections(body.collections ?? []);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    },
    [api],
  );

  useEffect(() => {
    void loadCollections(activeTab);
  }, [activeTab, loadCollections]);

  // ── Create ────────────────────────────────────────────────────────────────

  const handleCreate = useCallback(
    async (name: string, icon: string, color: string) => {
      setCreateVisible(false);
      try {
        const res = await api.post('/v1/search/collections', {
          body: { name, icon, color },
        });
        if (res.status === 201) {
          const body = res.body as { collection: Collection };
          setCollections((prev) => [body.collection, ...prev]);
        }
      } catch {
        // ignore
      }
    },
    [api],
  );

  // ── Edit ──────────────────────────────────────────────────────────────────

  const handleEdit = useCallback(
    async (name: string, icon: string, color: string) => {
      if (!editingCollection) return;
      const id = editingCollection.id;
      setEditingCollection(null);

      setCollections((prev) =>
        prev.map((c) => (c.id === id ? { ...c, name, icon, color } : c)),
      );

      await api
        .patch(`/v1/search/collections/${id}`, { body: { name, icon, color } })
        .catch(() => null);
    },
    [editingCollection, api],
  );

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = useCallback(
    async (id: string) => {
      setCollections((prev) => prev.filter((c) => c.id !== id));
      await api.delete(`/v1/search/collections/${id}`).catch(() => null);
    },
    [api],
  );

  // ── Share ─────────────────────────────────────────────────────────────────

  const handleShare = useCallback(async (collection: Collection) => {
    await Share.share({
      message: `${collection.name} — ${collection.shareUrl ?? ''}`,
    }).catch(() => null);
  }, []);

  // ── View on map ───────────────────────────────────────────────────────────

  const handleViewMap = useCallback(
    (collection: Collection) => {
      router.push(`/collections/${collection.id}/map`);
    },
    [router],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('search.backBtn')}
        >
          <RNText style={styles.backIcon}>→</RNText>
        </TouchableOpacity>
        <RNText style={styles.headerTitle}>{t('collections.title')}</RNText>
        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => setCreateVisible(true)}
          accessibilityRole="button"
          accessibilityLabel={t('collections.create')}
        >
          <RNText style={styles.createBtnText}>+</RNText>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['mine', 'friends', 'official'] as TabKey[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === tab }}
          >
            <RNText
              style={[
                styles.tabText,
                activeTab === tab && styles.tabTextActive,
              ]}
            >
              {t(`collections.tab_${tab}`)}
            </RNText>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={PRIMARY} size="large" />
        </View>
      ) : collections.length === 0 ? (
        <View style={styles.emptyState}>
          <RNText style={styles.emptyIcon}>📚</RNText>
          <RNText style={styles.emptyTitle}>
            {t(`collections.empty_${activeTab}_title`)}
          </RNText>
          <RNText style={styles.emptyBody}>
            {t(`collections.empty_${activeTab}_body`)}
          </RNText>
          {activeTab === 'mine' && (
            <TouchableOpacity
              style={styles.emptyCreateBtn}
              onPress={() => setCreateVisible(true)}
            >
              <RNText style={styles.emptyCreateBtnText}>
                + {t('collections.create')}
              </RNText>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {collections.map((collection) => (
            <CollectionCard
              key={collection.id}
              collection={collection}
              onPress={() => router.push(`/collections/${collection.id}`)}
              onShare={() => handleShare(collection)}
              onViewMap={() => handleViewMap(collection)}
              onDelete={
                collection.isOwner
                  ? () => handleDelete(collection.id)
                  : undefined
              }
            />
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* Create sheet */}
      <CreateCollectionSheet
        visible={createVisible || !!editingCollection}
        editing={editingCollection}
        onClose={() => {
          setCreateVisible(false);
          setEditingCollection(null);
        }}
        onSave={editingCollection ? handleEdit : handleCreate}
      />
    </Screen>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: SURFACE,
    borderBottomWidth: 1,
    borderBottomColor: DIVIDER,
    gap: 10,
  },
  backBtn: { padding: 8 },
  backIcon: { fontSize: 18, color: '#444', transform: [{ scaleX: I18nManager.isRTL ? 1 : -1 }] },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#111' },
  createBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtnText: { fontSize: 22, color: '#fff', lineHeight: 26 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: SURFACE,
    borderBottomWidth: 1,
    borderBottomColor: DIVIDER,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: PRIMARY },
  tabText: { fontSize: 14, color: '#888' },
  tabTextActive: { color: PRIMARY, fontWeight: '600' },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#222',
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyCreateBtn: {
    marginTop: 8,
    backgroundColor: PRIMARY,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 20,
  },
  emptyCreateBtnText: { fontSize: 14, color: '#fff', fontWeight: '600' },
  scroll: { flex: 1, backgroundColor: '#F8F8F8' },
  scrollContent: { padding: 16, gap: 10 },
  collectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SURFACE,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: DIVIDER,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  collectionIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  collectionIconText: { fontSize: 26 },
  collectionInfo: { flex: 1, gap: 3 },
  collectionName: { fontSize: 15, fontWeight: '600', color: '#111' },
  collectionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  officialBadge: {
    backgroundColor: '#FFF8E1',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#FFD54F',
  },
  officialBadgeText: { fontSize: 10, color: '#F57F17', fontWeight: '600' },
  collectionCount: { fontSize: 12, color: '#888' },
  collectionOwner: { fontSize: 12, color: '#888', flex: 1 },
  collectionDesc: { fontSize: 12, color: '#999', lineHeight: 16 },
  collectionActions: { flexDirection: 'row', gap: 4 },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIcon: { fontSize: 16 },
});
