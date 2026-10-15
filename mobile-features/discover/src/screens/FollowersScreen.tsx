/**
 * FollowersScreen — tabbed Followers | Following list for a user.
 * Features: search within list, follow-back button, mutual badge, remove follower.
 *
 * Route: discover/profile/:userId/followers
 */
import { type ReactElement, useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { t } from '../strings';
import { COLORS } from './shared';

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'followers' | 'following';

interface FollowUser {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  isFollowing: boolean;
  isFollowedBy: boolean;
  isVerified: boolean;
  mutualCount: number;
}

interface Props {
  userId: string;
  initialTab?: Tab;
  isOwnProfile?: boolean;
  onNavigateProfile?: (userId: string) => void;
  onBack?: () => void;
}

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function mockUsers(tab: Tab): FollowUser[] {
  return Array.from({ length: 15 }, (_, i) => ({
    userId: `user-${tab}-${i}`,
    displayName: `مستخدم ${i + 1}`,
    avatarUrl: null,
    isFollowing: i % 3 === 0,
    isFollowedBy: i % 4 === 0,
    isVerified: i % 7 === 0,
    mutualCount: i % 5,
  }));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function UserRow({
  user,
  isOwnFollowers,
  onFollow,
  onRemove,
  onPress,
}: {
  user: FollowUser;
  isOwnFollowers: boolean;
  onFollow: (userId: string, currentlyFollowing: boolean) => Promise<void>;
  onRemove: (userId: string) => Promise<void>;
  onPress: (userId: string) => void;
}): ReactElement {
  const [following, setFollowing] = useState(user.isFollowing);
  const [loading, setLoading] = useState(false);

  const handleFollow = useCallback(async () => {
    setLoading(true);
    try {
      await onFollow(user.userId, following);
      setFollowing((prev) => !prev);
    } catch {
      Alert.alert(t('followers.followError'));
    } finally {
      setLoading(false);
    }
  }, [user.userId, following, onFollow]);

  const handleRemove = useCallback(async () => {
    Alert.alert(
      t('followers.removeTitle'),
      t('followers.removeMsg', { name: user.displayName }),
      [
        { text: t('followers.cancel'), style: 'cancel' },
        {
          text: t('followers.removeConfirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              await onRemove(user.userId);
            } catch {
              Alert.alert(t('followers.removeError'));
            }
          },
        },
      ],
    );
  }, [user.userId, user.displayName, onRemove]);

  return (
    <Pressable
      style={styles.row}
      onPress={() => onPress(user.userId)}
      accessibilityRole="button"
    >
      {/* Avatar */}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{user.displayName.slice(0, 1)}</Text>
      </View>

      {/* Name + badges */}
      <View style={styles.userInfo}>
        <View style={styles.nameRow}>
          <Text style={styles.displayName} numberOfLines={1}>{user.displayName}</Text>
          {user.isVerified && (
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedIcon}>✓</Text>
            </View>
          )}
          {user.isFollowedBy && (
            <View style={styles.followsYouBadge}>
              <Text style={styles.followsYouText}>{t('followers.followsYou')}</Text>
            </View>
          )}
        </View>
        {user.mutualCount > 0 && (
          <Text style={styles.mutualText}>
            {t('followers.mutualCount', { count: user.mutualCount })}
          </Text>
        )}
      </View>

      {/* Actions */}
      <View style={styles.rowActions}>
        {/* Follow / Following button */}
        <Pressable
          style={[styles.followBtn, following && styles.followingBtn]}
          onPress={handleFollow}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={following ? t('followers.unfollowA11y') : t('followers.followA11y')}
          testID={`followers.follow.${user.userId}`}
        >
          {loading ? (
            <ActivityIndicator size="small" color={following ? COLORS.primary : '#FFF'} />
          ) : (
            <Text style={[styles.followBtnText, following && styles.followingBtnText]}>
              {following ? t('followers.following') : t('followers.follow')}
            </Text>
          )}
        </Pressable>

        {/* Remove follower (only on own followers tab) */}
        {isOwnFollowers && (
          <Pressable
            style={styles.removeBtn}
            onPress={handleRemove}
            accessibilityRole="button"
            accessibilityLabel={t('followers.removeA11y', { name: user.displayName })}
          >
            <Text style={styles.removeIcon}>✕</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function FollowersScreen({
  userId,
  initialTab = 'followers',
  isOwnProfile = false,
  onNavigateProfile,
  onBack,
}: Props): ReactElement {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<FollowUser[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<FollowUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (tab: Tab) => {
    setLoading(true);
    setError(null);
    try {
      await new Promise((r) => setTimeout(r, 200));
      const data = mockUsers(tab);
      setUsers(data);
      setFilteredUsers(data);
    } catch {
      setError(t('followers.loadError'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(activeTab); }, [activeTab, load]);

  useEffect(() => {
    if (!query.trim()) {
      setFilteredUsers(users);
      return;
    }
    const q = query.toLowerCase();
    setFilteredUsers(users.filter((u) => u.displayName.toLowerCase().includes(q)));
  }, [query, users]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(activeTab);
    setRefreshing(false);
  }, [activeTab, load]);

  const handleFollow = useCallback(async (targetId: string, currentlyFollowing: boolean) => {
    // Production: call API follow/unfollow
    await new Promise((r) => setTimeout(r, 150));
    void targetId;
    void currentlyFollowing;
  }, []);

  const handleRemove = useCallback(async (targetId: string) => {
    // Production: call API removeFollower
    await new Promise((r) => setTimeout(r, 150));
    setUsers((prev) => prev.filter((u) => u.userId !== targetId));
    void targetId;
  }, []);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'followers', label: t('followers.tabFollowers') },
    { key: 'following', label: t('followers.tabFollowing') },
  ];

  return (
    <View style={styles.screen} testID="followers-screen">
      {/* Header */}
      <View style={styles.header}>
        {onBack && (
          <Pressable onPress={onBack} style={styles.backBtn} accessibilityRole="button" accessibilityLabel={t('followers.back')}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
        )}
        <Text style={styles.headerTitle}>{t('followers.title')}</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.activeTab]}
            onPress={() => { setActiveTab(tab.key); setQuery(''); }}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === tab.key }}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={t('followers.searchPlaceholder')}
          placeholderTextColor={COLORS.textMuted}
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel={t('followers.searchA11y')}
          testID="followers.search"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel={t('followers.clearSearch')}>
            <Text style={styles.clearIcon}>✕</Text>
          </Pressable>
        )}
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => load(activeTab)} style={styles.retryBtn}>
            <Text style={styles.retryText}>{t('followers.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={(u) => u.userId}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <UserRow
              user={item}
              isOwnFollowers={isOwnProfile && activeTab === 'followers'}
              onFollow={handleFollow}
              onRemove={handleRemove}
              onPress={(uid) => onNavigateProfile?.(uid)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {query.trim()
                  ? t('followers.searchEmpty', { q: query })
                  : activeTab === 'followers'
                    ? t('followers.emptyFollowers')
                    : t('followers.emptyFollowing')}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F5F5' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingVertical: 8 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  backBtn: { width: 36, padding: 4 },
  backIcon: { fontSize: 24, color: COLORS.primary },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: COLORS.textPrimary, textAlign: 'center' },

  tabs: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: { borderBottomColor: COLORS.primary },
  tabText: { fontSize: 14, fontWeight: '500', color: COLORS.textSecondary },
  activeTabText: { color: COLORS.primary, fontWeight: '700' },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFF',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    gap: 8,
  },
  searchIcon: { fontSize: 14 },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textPrimary,
    paddingVertical: 2,
    textAlign: 'auto',
  },
  clearIcon: { fontSize: 14, color: COLORS.textMuted, paddingHorizontal: 4 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 10,
    gap: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  userInfo: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  displayName: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  verifiedBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedIcon: { color: '#FFF', fontSize: 9, fontWeight: '700' },
  followsYouBadge: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  followsYouText: { fontSize: 10, color: COLORS.textSecondary },
  mutualText: { fontSize: 12, color: COLORS.textMuted },

  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  followBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minWidth: 70,
    alignItems: 'center',
  },
  followingBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  followBtnText: { fontSize: 13, fontWeight: '600', color: '#FFF' },
  followingBtnText: { color: COLORS.primary },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeIcon: { fontSize: 12, color: COLORS.textMuted },

  emptyContainer: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 24 },
  emptyText: { fontSize: 15, color: COLORS.textMuted, textAlign: 'center' },

  errorText: { fontSize: 15, color: COLORS.textMuted, textAlign: 'center', marginHorizontal: 24 },
  retryBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: COLORS.primary, borderRadius: 8 },
  retryText: { color: '#FFF', fontWeight: '600' },
});
