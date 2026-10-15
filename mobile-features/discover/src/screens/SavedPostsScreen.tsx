/**
 * SavedPostsScreen — shows posts the current user has bookmarked locally,
 * with named collection management.
 */
import type { DiscoverPostType } from '@iraq-maps/contracts';
import { useRouter } from 'expo-router';
import { type ReactElement, useState, useCallback } from 'react';
import {
  Alert,
  FlatList,
  I18nManager,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { t } from '../strings';
import { useSavedPosts } from '../useSavedPosts';
import { useCollections } from '../useCollections';
import { COLORS, getTypeBadgeColors, formatRelativeTime, SkeletonBlock } from './shared';

I18nManager.forceRTL(true);

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SavedPostSkeletonCard(): ReactElement {
  return (
    <View testID="skeleton-saved-post" style={[styles.card, { gap: 8 }]}>
      <View style={styles.cardHeader}>
        <SkeletonBlock width={50} height={14} />
        <SkeletonBlock width={60} height={10} />
      </View>
      <SkeletonBlock width={240} height={12} />
      <SkeletonBlock width={180} height={12} />
      <SkeletonBlock width={120} height={12} />
      <View style={styles.cardFooter}>
        <SkeletonBlock width={100} height={10} />
        <SkeletonBlock width={60} height={26} />
      </View>
    </View>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function SavedPostRow({ post, onUnsave }: { post: DiscoverPostType; onUnsave: (p: DiscoverPostType) => void }): ReactElement {
  const router = useRouter();
  const badge = getTypeBadgeColors(post.type);

  return (
    <Pressable
      style={styles.card}
      onPress={() => router.push(`/discover/${post.id}` as never)}
      accessibilityRole="button"
      accessibilityLabel={post.body}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.typeBadge, { backgroundColor: badge.bg, color: badge.text }]}>
          {t(`post.type.${post.type}` as never)}
        </Text>
        <Text style={styles.time}>{formatRelativeTime(post.createdAt, t)}</Text>
      </View>

      <Text style={styles.body} numberOfLines={3}>{post.body}</Text>

      <View style={styles.cardFooter}>
        <Text style={styles.stats}>
          {t('feed.trendingStats', { likes: post.likeCount, comments: post.commentCount })}
        </Text>
        <Pressable
          style={styles.unsaveBtn}
          onPress={() => onUnsave(post)}
          accessibilityRole="button"
          accessibilityLabel={t('saved.remove')}
          hitSlop={8}
        >
          <Text style={styles.unsaveTxt}>{t('saved.remove')}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

// ─── Collection picker modal ──────────────────────────────────────────────────

function CollectionPickerModal({
  visible,
  postId,
  onClose,
}: {
  visible: boolean;
  postId: string | null;
  onClose: () => void;
}): ReactElement {
  const { collections, createCollection, addPostToCollection, removePostFromCollection, getCollectionsForPost } = useCollections();
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();

  const postCollections = postId ? getCollectionsForPost(postId) : [];
  const postCollectionIds = new Set(postCollections.map((c) => c.id));

  const handleToggle = useCallback(async (colId: string) => {
    if (!postId) return;
    if (postCollectionIds.has(colId)) {
      await removePostFromCollection(colId, postId);
    } else {
      await addPostToCollection(colId, postId);
    }
  }, [postId, postCollectionIds, addPostToCollection, removePostFromCollection]);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) { setNameError(t('collections.nameEmpty')); return; }
    setCreating(true);
    setNameError(undefined);
    const col = await createCollection(newName);
    if (postId) await addPostToCollection(col.id, postId);
    setNewName('');
    setCreating(false);
  }, [newName, createCollection, postId, addPostToCollection]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={colStyles.overlay}>
        <View style={colStyles.sheet}>
          <View style={colStyles.headerRow}>
            <Text style={colStyles.title}>{t('collections.save')}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('collections.cancel')}>
              <Text style={colStyles.closeText}>{t('comments.cancelReplyIcon')}</Text>
            </Pressable>
          </View>

          <ScrollView style={colStyles.list}>
            {collections.length === 0 ? (
              <Text style={colStyles.emptyText}>{t('collections.empty')}</Text>
            ) : (
              collections.map((col) => (
                <Pressable
                  key={col.id}
                  style={[colStyles.colRow, postCollectionIds.has(col.id) && colStyles.colRowActive]}
                  onPress={() => { void handleToggle(col.id); }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: postCollectionIds.has(col.id) }}
                  accessibilityLabel={col.name}
                >
                  <Text style={colStyles.colName}>{col.name}</Text>
                  <Text style={colStyles.colMeta}>{t('collections.postsCount', { n: (col.postIds ?? []).length })}</Text>
                  {postCollectionIds.has(col.id) ? <Text style={colStyles.checkmark}>{t('post.verifiedIcon')}</Text> : null}
                </Pressable>
              ))
            )}
          </ScrollView>

          <View style={colStyles.createRow}>
            <TextInput
              style={colStyles.createInput}
              value={newName}
              onChangeText={setNewName}
              placeholder={t('collections.namePlaceholder')}
              placeholderTextColor="#999"
              maxLength={40}
            />
            <Pressable
              style={[colStyles.createBtn, creating && colStyles.createBtnDisabled]}
              onPress={() => { void handleCreate(); }}
              disabled={creating}
              accessibilityRole="button"
              accessibilityLabel={t('collections.create')}
            >
              <Text style={colStyles.createBtnText}>{t('collections.create')}</Text>
            </Pressable>
          </View>
          {nameError ? <Text style={colStyles.nameError}>{nameError}</Text> : null}
        </View>
      </View>
    </Modal>
  );
}

const colStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', borderTopStartRadius: 16, borderTopEndRadius: 16, maxHeight: '60%', paddingBottom: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  title: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary },
  closeText: { fontSize: 16, color: '#666', padding: 4 },
  list: { maxHeight: 200 },
  emptyText: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', paddingVertical: 20 },
  colRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.divider },
  colRowActive: { backgroundColor: COLORS.primaryXLight },
  colName: { flex: 1, fontSize: 15, color: COLORS.textPrimary },
  colMeta: { fontSize: 12, color: COLORS.textMuted, marginEnd: 8 },
  checkmark: { fontSize: 16, color: COLORS.primary, fontWeight: '700' },
  createRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  createInput: { flex: 1, backgroundColor: COLORS.inputBg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: COLORS.textPrimary },
  createBtn: { backgroundColor: COLORS.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  createBtnDisabled: { backgroundColor: COLORS.muted },
  createBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  nameError: { fontSize: 12, color: COLORS.error, paddingHorizontal: 16, paddingTop: 4 },
});

// ─── Collection management tab ────────────────────────────────────────────────

function CollectionsTab(): ReactElement {
  const { collections, deleteCollection } = useCollections();

  if (collections.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTxt}>{t('collections.empty')}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={collections}
      keyExtractor={(c) => c.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.body}>{item.name}</Text>
            <Text style={styles.stats}>{t('collections.postsCount', { n: item.postIds.length })}</Text>
          </View>
          <Pressable
            style={styles.unsaveBtn}
            onPress={() => {
              Alert.alert(
                t('collections.deleteConfirm'),
                t('collections.deleteMsg'),
                [
                  { text: t('collections.deleteCancel'), style: 'cancel' },
                  { text: t('collections.deleteOk'), style: 'destructive', onPress: () => { void deleteCollection(item.id); } },
                ],
              );
            }}
            accessibilityRole="button"
            accessibilityLabel={t('collections.deleteConfirm')}
          >
            <Text style={styles.unsaveTxt}>{t('collections.deleteOk')}</Text>
          </Pressable>
        </View>
      )}
    />
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function SavedPostsScreen(): ReactElement {
  const { savedPosts, toggleSave, loading } = useSavedPosts();
  const [activeTab, setActiveTab] = useState<'saved' | 'collections'>('saved');
  const [colPickerPostId, setColPickerPostId] = useState<string | null>(null);

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>{t('saved.title')}</Text>
        <View style={styles.list}>
          {Array.from({ length: 4 }, (_, i) => <SavedPostSkeletonCard key={i} />)}
        </View>
      </View>
    );
  }

  const count = (savedPosts as DiscoverPostType[]).length;
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{t('saved.title')}</Text>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, activeTab === 'saved' && styles.tabActive]}
          onPress={() => setActiveTab('saved')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'saved' }}
        >
          <Text style={[styles.tabText, activeTab === 'saved' && styles.tabTextActive]}>{t('saved.title')}</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'collections' && styles.tabActive]}
          onPress={() => setActiveTab('collections')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'collections' }}
        >
          <Text style={[styles.tabText, activeTab === 'collections' && styles.tabTextActive]}>{t('collections.title')}</Text>
        </Pressable>
      </View>

      {activeTab === 'collections' ? (
        <CollectionsTab />
      ) : (
        <>
          {count > 0 ? (
            <Text style={styles.countText} testID="saved-count">
              {t('saved.count', { n: String(count) })}
            </Text>
          ) : null}
          <FlatList
            data={savedPosts as DiscoverPostType[]}
            keyExtractor={(p) => p.id}
            renderItem={({ item }) => (
              <View>
                <SavedPostRow post={item} onUnsave={(p) => { void toggleSave(p); }} />
                <Pressable
                  style={styles.addToCollectionBtn}
                  onPress={() => setColPickerPostId(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={t('collections.save')}
                >
                  <Text style={styles.addToCollectionText}>{t('collections.save')}</Text>
                </Pressable>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyTxt}>{t('saved.empty')}</Text>
              </View>
            }
            contentContainerStyle={styles.list}
          />
        </>
      )}

      <CollectionPickerModal
        visible={colPickerPostId !== null}
        postId={colPickerPostId}
        onClose={() => setColPickerPostId(null)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 13, color: COLORS.textSecondary, paddingHorizontal: 16, paddingBottom: 4 },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    textAlign: 'auto',
  },
  list: { padding: 12, paddingBottom: 32 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  typeBadge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  time: { fontSize: 12, color: COLORS.textMuted },
  body: { fontSize: 14, color: COLORS.textPrimary, lineHeight: 20, marginBottom: 10 },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stats: { fontSize: 13, color: COLORS.textSecondary },
  unsaveBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: COLORS.errorBg,
  },
  unsaveTxt: { fontSize: 12, color: COLORS.error, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyTxt: { fontSize: 15, color: COLORS.textMuted, textAlign: 'center' },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginHorizontal: 12,
    marginBottom: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: COLORS.primary },
  tabText: { fontSize: 14, color: COLORS.textMuted, fontWeight: '500' },
  tabTextActive: { color: COLORS.primary, fontWeight: '700' },
  addToCollectionBtn: {
    marginHorizontal: 14,
    marginTop: -6,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  addToCollectionText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '500',
  },
});
