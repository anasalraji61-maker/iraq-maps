/**
 * UserProfileScreen — full user profile with follow stats, post grid, stories
 * highlight row, mutual followers chips, and block/report actions.
 *
 * Route: discover/profile/:userId
 */
import { type ReactElement, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { t } from '../strings';
import { COLORS } from './shared';

// ─── Types ───────────────────────────────────────────────────────────────────

interface FollowStats {
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
  isFollowedBy: boolean;
  mutualCount: number;
}

interface MutualUser {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

interface Post {
  postId: string;
  authorId: string;
  body: string;
  mediaUrl?: string;
  createdAt: string;
}

interface StoryHighlight {
  id: string;
  title: string;
  coverUrl: string | null;
}

interface UserProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  followStats: FollowStats;
  postCount: number;
  isVerified: boolean;
}

interface Props {
  userId: string;
  onNavigateFollowers?: (userId: string, tab: 'followers' | 'following') => void;
  onNavigatePost?: (postId: string) => void;
  onBack?: () => void;
}

// ─── Mock data helpers (replaced by API in production) ───────────────────────

function mockProfile(userId: string): UserProfile {
  return {
    id: userId,
    displayName: t('profile.mock.displayName', { id: userId.slice(0, 6) }),
    avatarUrl: null,
    bio: t('profile.mock.bio'),
    followStats: {
      followersCount: 128,
      followingCount: 64,
      isFollowing: false,
      isFollowedBy: false,
      mutualCount: 3,
    },
    postCount: 42,
    isVerified: false,
  };
}

function mockPosts(userId: string): Post[] {
  return Array.from({ length: 9 }, (_, i) => ({
    postId: `${userId}-post-${i}`,
    authorId: userId,
    body: t('profile.mock.postBody', { n: String(i + 1) }),
    mediaUrl: undefined,
    createdAt: new Date(Date.now() - i * 3600000).toISOString(),
  }));
}

function mockMutualUsers(): MutualUser[] {
  return [
    { userId: 'a1b2c3', displayName: t('profile.mock.mutual1'), avatarUrl: null },
    { userId: 'd4e5f6', displayName: t('profile.mock.mutual2'), avatarUrl: null },
    { userId: 'g7h8i9', displayName: t('profile.mock.mutual3'), avatarUrl: null },
  ];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCountAr(n: number): string {
  return n.toLocaleString('ar-IQ');
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AvatarCircle({
  avatarUrl,
  displayName,
  size,
}: {
  avatarUrl: string | null;
  displayName: string;
  size: number;
}): ReactElement {
  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
        accessibilityLabel={t('profile.avatarA11y', { name: displayName })}
      />
    );
  }
  return (
    <View
      style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}
      accessibilityLabel={t('profile.avatarA11y', { name: displayName })}
    >
      <Text style={[styles.avatarFallbackText, { fontSize: size * 0.4 }]}>
        {displayName.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

function StatPill({
  count,
  label,
  onPress,
}: {
  count: number;
  label: string;
  onPress?: () => void;
}): ReactElement {
  return (
    <Pressable style={styles.statPill} onPress={onPress} accessibilityRole={onPress ? 'button' : 'text'}>
      <Text style={styles.statCount}>{formatCountAr(count)}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Pressable>
  );
}

function VerifiedBadge(): ReactElement {
  return (
    <View style={styles.verifiedBadge} accessibilityLabel={t('profile.verifiedA11y')}>
      <Text style={styles.verifiedIcon}>{t('profile.verifiedIcon')}</Text>
    </View>
  );
}

function MutualChip({ user }: { user: MutualUser }): ReactElement {
  return (
    <View style={styles.mutualChip}>
      <AvatarCircle avatarUrl={user.avatarUrl} displayName={user.displayName} size={24} />
      <Text style={styles.mutualChipText} numberOfLines={1}>{user.displayName}</Text>
    </View>
  );
}

function StoryHighlightRow({ highlights }: { highlights: StoryHighlight[] }): ReactElement {
  if (highlights.length === 0) return <View />;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.highlightsRow}
      contentContainerStyle={styles.highlightsContent}
    >
      {highlights.map((h) => (
        <Pressable key={h.id} style={styles.highlightItem} accessibilityRole="button">
          <View style={styles.highlightCircle}>
            {h.coverUrl ? (
              <Image source={{ uri: h.coverUrl }} style={styles.highlightCover} />
            ) : (
              <Text style={styles.highlightPlaceholder}>⭐</Text>
            )}
          </View>
          <Text style={styles.highlightTitle} numberOfLines={1}>{h.title}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function PostGridItem({ post, onPress }: { post: Post; onPress: () => void }): ReactElement {
  const { width } = Dimensions.get('window');
  const cellSize = (width - 2) / 3;
  return (
    <Pressable
      style={[styles.postGridItem, { width: cellSize, height: cellSize }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('profile.postA11y')}
    >
      {post.mediaUrl ? (
        <Image source={{ uri: post.mediaUrl }} style={styles.postGridImage} />
      ) : (
        <View style={styles.postGridPlaceholder}>
          <Text style={styles.postGridPlaceholderText} numberOfLines={3}>{post.body}</Text>
        </View>
      )}
    </Pressable>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function UserProfileScreen({ userId, onNavigateFollowers, onNavigatePost, onBack }: Props): ReactElement {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [mutualUsers, setMutualUsers] = useState<MutualUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Animated follow button scale for haptic feedback feel
  const followScale = useRef(new Animated.Value(1)).current;

  const highlights: StoryHighlight[] = [
    { id: '1', title: t('profile.highlightFavorites'), coverUrl: null },
    { id: '2', title: t('profile.highlightPlaces'), coverUrl: null },
  ];

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Production: replace with API client calls
      await new Promise((r) => setTimeout(r, 300));
      setProfile(mockProfile(userId));
      setPosts(mockPosts(userId));
      setMutualUsers(mockMutualUsers());
    } catch {
      setError(t('profile.loadError'));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  const handleFollow = useCallback(async () => {
    if (!profile) return;
    setActionLoading(true);

    // Animate button press
    Animated.sequence([
      Animated.timing(followScale, { toValue: 0.92, duration: 80, useNativeDriver: true }),
      Animated.timing(followScale, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();

    try {
      // Production: call API follow/unfollow
      await new Promise((r) => setTimeout(r, 200));
      setProfile((prev) => {
        if (!prev) return prev;
        const wasFollowing = prev.followStats.isFollowing;
        return {
          ...prev,
          followStats: {
            ...prev.followStats,
            isFollowing: !wasFollowing,
            followersCount: prev.followStats.followersCount + (wasFollowing ? -1 : 1),
          },
        };
      });
    } catch {
      Alert.alert(t('profile.followError'));
    } finally {
      setActionLoading(false);
    }
  }, [profile, followScale]);

  const handleBlock = useCallback(() => {
    setMenuVisible(false);
    Alert.alert(
      t('profile.blockConfirmTitle'),
      t('profile.blockConfirmMsg'),
      [
        { text: t('profile.cancel'), style: 'cancel' },
        {
          text: t('profile.blockConfirmOk'),
          style: 'destructive',
          onPress: async () => {
            try {
              // Production: call API block
              await new Promise((r) => setTimeout(r, 200));
              Alert.alert(t('profile.blockSuccess'));
              onBack?.();
            } catch {
              Alert.alert(t('profile.blockError'));
            }
          },
        },
      ],
    );
  }, [onBack]);

  const handleReport = useCallback(() => {
    setMenuVisible(false);
    Alert.alert(t('profile.reportTitle'), t('profile.reportMsg'), [
      { text: t('profile.cancel'), style: 'cancel' },
      { text: t('profile.reportConfirmOk'), onPress: () => { /* production: report API */ } },
    ]);
  }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error ?? t('profile.loadError')}</Text>
        <Pressable onPress={load} style={styles.retryBtn}>
          <Text style={styles.retryText}>{t('profile.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  const isOwnProfile = false; // Replace with auth check in production

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        {onBack && (
          <Pressable onPress={onBack} style={styles.backBtn} accessibilityRole="button" accessibilityLabel={t('profile.back')}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
        )}
        <Text style={styles.headerTitle} numberOfLines={1}>{profile.displayName}</Text>
        {!isOwnProfile && (
          <Pressable
            onPress={() => setMenuVisible(true)}
            style={styles.menuBtn}
            accessibilityRole="button"
            accessibilityLabel={t('profile.menuA11y')}
          >
            <Text style={styles.menuIcon}>{t('profile.menuIcon')}</Text>
          </Pressable>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Profile info section */}
        <View style={styles.profileSection}>
          <View style={styles.topRow}>
            <AvatarCircle avatarUrl={profile.avatarUrl} displayName={profile.displayName} size={80} />
            <View style={styles.statsRow}>
              <StatPill count={profile.postCount} label={t('profile.posts')} />
              <StatPill
                count={profile.followStats.followersCount}
                label={t('profile.followers')}
                onPress={() => onNavigateFollowers?.(userId, 'followers')}
              />
              <StatPill
                count={profile.followStats.followingCount}
                label={t('profile.following')}
                onPress={() => onNavigateFollowers?.(userId, 'following')}
              />
            </View>
          </View>

          {/* Display name + verified badge */}
          <View style={styles.nameRow}>
            <Text style={styles.displayName}>{profile.displayName}</Text>
            {profile.isVerified && <VerifiedBadge />}
          </View>

          {/* Bio */}
          {profile.bio && (
            <Text style={styles.bio}>{profile.bio}</Text>
          )}

          {/* Mutual followers chips */}
          {mutualUsers.length > 0 && !isOwnProfile && (
            <View style={styles.mutualSection}>
              <Text style={styles.mutualLabel}>
                {t('profile.mutualFollowers', { count: profile.followStats.mutualCount })}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mutualChipsRow}>
                {mutualUsers.map((u) => (
                  <MutualChip key={u.userId} user={u} />
                ))}
              </ScrollView>
            </View>
          )}

          {/* Follow / Following button */}
          {!isOwnProfile && (
            <View style={styles.actionsRow}>
              <Animated.View style={{ transform: [{ scale: followScale }], flex: 1 }}>
                <Pressable
                  style={[
                    styles.followBtn,
                    profile.followStats.isFollowing && styles.followingBtn,
                  ]}
                  onPress={handleFollow}
                  disabled={actionLoading}
                  accessibilityRole="button"
                  accessibilityLabel={
                    profile.followStats.isFollowing
                      ? t('profile.unfollowA11y', { name: profile.displayName })
                      : t('profile.followA11y', { name: profile.displayName })
                  }
                  testID="profile.followBtn"
                >
                  {actionLoading ? (
                    <ActivityIndicator size="small" color={profile.followStats.isFollowing ? COLORS.primary : '#FFF'} />
                  ) : (
                    <Text style={[styles.followBtnText, profile.followStats.isFollowing && styles.followingBtnText]}>
                      {profile.followStats.isFollowing
                        ? t('profile.following')
                        : profile.followStats.isFollowedBy
                          ? t('profile.followBack')
                          : t('profile.follow')}
                    </Text>
                  )}
                </Pressable>
              </Animated.View>
            </View>
          )}
        </View>

        {/* Story highlights */}
        <StoryHighlightRow highlights={highlights} />

        {/* Post grid header */}
        <View style={styles.gridHeader}>
          <Text style={styles.gridHeaderText}>{t('profile.gridTitle')}</Text>
        </View>

        {/* Post grid (3-column masonry approximation via FlatList numColumns) */}
        {posts.length === 0 ? (
          <View style={styles.emptyPosts}>
            <Text style={styles.emptyPostsText}>{t('profile.noPosts')}</Text>
          </View>
        ) : (
          <FlatList
            data={posts}
            keyExtractor={(p) => p.postId}
            numColumns={3}
            scrollEnabled={false}
            columnWrapperStyle={styles.gridRow}
            renderItem={({ item }) => (
              <PostGridItem
                post={item}
                onPress={() => onNavigatePost?.(item.postId)}
              />
            )}
          />
        )}
      </ScrollView>

      {/* Context menu modal */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
          <View style={styles.menuSheet}>
            <Text style={styles.menuSheetTitle}>{t('profile.menuTitle')}</Text>
            <Pressable style={styles.menuItem} onPress={handleReport} accessibilityRole="button">
              <Text style={styles.menuItemText}>{t('profile.reportUser')}</Text>
            </Pressable>
            <Pressable style={[styles.menuItem, styles.menuItemDestructive]} onPress={handleBlock} accessibilityRole="button">
              <Text style={[styles.menuItemText, styles.menuItemDestructiveText]}>{t('profile.blockUser')}</Text>
            </Pressable>
            <Pressable style={styles.menuItem} onPress={() => setMenuVisible(false)} accessibilityRole="button">
              <Text style={[styles.menuItemText, styles.menuCancelText]}>{t('profile.cancel')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background ?? '#F5F5F5' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingBottom: 32 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  backBtn: { padding: 6 },
  backIcon: { fontSize: 24, color: COLORS.primary },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: COLORS.textPrimary, textAlign: 'center' },
  menuBtn: { padding: 6 },
  menuIcon: { fontSize: 20, color: COLORS.textPrimary },

  // Profile section
  profileSection: { backgroundColor: '#FFF', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  statsRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  statPill: { alignItems: 'center', gap: 2 },
  statCount: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary },
  statLabel: { fontSize: 12, color: COLORS.textSecondary },

  // Avatar
  avatar: { backgroundColor: '#DDD' },
  avatarFallback: { backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  avatarFallbackText: { color: '#FFF', fontWeight: '700' },

  // Name + verified
  nameRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 6 },
  displayName: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  verifiedBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedIcon: { color: '#FFF', fontSize: 11, fontWeight: '700' },

  // Bio
  bio: { marginTop: 6, fontSize: 13, color: COLORS.textSecondary, lineHeight: 20 },

  // Mutual followers
  mutualSection: { marginTop: 10 },
  mutualLabel: { fontSize: 12, color: COLORS.textMuted, marginBottom: 6 },
  mutualChipsRow: { flexDirection: 'row' },
  mutualChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginEnd: 6,
    gap: 4,
  },
  mutualChipText: { fontSize: 12, color: COLORS.textSecondary, maxWidth: 80 },

  // Follow button
  actionsRow: { flexDirection: 'row', marginTop: 12, gap: 8 },
  followBtn: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  followingBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  followBtnText: { fontSize: 14, fontWeight: '600', color: '#FFF' },
  followingBtnText: { color: COLORS.primary },

  // Story highlights
  highlightsRow: { backgroundColor: '#FFF', marginTop: 1 },
  highlightsContent: { paddingHorizontal: 12, paddingVertical: 12, gap: 12 },
  highlightItem: { alignItems: 'center', width: 66, marginEnd: 12 },
  highlightCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 2,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.inputBg,
    overflow: 'hidden',
  },
  highlightCover: { width: 62, height: 62 },
  highlightPlaceholder: { fontSize: 24 },
  highlightTitle: { fontSize: 11, color: COLORS.textSecondary, marginTop: 4, textAlign: 'center' },

  // Post grid
  gridHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    backgroundColor: '#FFF',
    marginTop: 1,
  },
  gridHeaderText: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary },
  gridRow: { gap: 1 },
  postGridItem: { overflow: 'hidden', backgroundColor: '#EEE' },
  postGridImage: { width: '100%', height: '100%' },
  postGridPlaceholder: {
    flex: 1,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  postGridPlaceholderText: { fontSize: 10, color: COLORS.textMuted, textAlign: 'center' },
  emptyPosts: { alignItems: 'center', paddingTop: 40 },
  emptyPostsText: { fontSize: 14, color: COLORS.textMuted },

  // Error
  errorText: { fontSize: 15, color: COLORS.textMuted, textAlign: 'center', marginHorizontal: 24 },
  retryBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: COLORS.primary, borderRadius: 8 },
  retryText: { color: '#FFF', fontWeight: '600' },

  // Context menu
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  menuSheet: {
    backgroundColor: '#FFF',
    borderTopStartRadius: 16,
    borderTopEndRadius: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },
  menuSheetTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  menuItem: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  menuItemDestructive: {},
  menuItemText: { fontSize: 15, color: COLORS.textPrimary, textAlign: 'center' },
  menuItemDestructiveText: { color: '#E53935' },
  menuCancelText: { color: COLORS.textSecondary },
});
