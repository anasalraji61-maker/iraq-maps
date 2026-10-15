/**
 * FollowedUsersScreen — lists client-side followed users with unfollow action.
 * Accessible from Account → Settings → Following.
 */
import { type ReactElement } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFollows } from '../useFollows';
import { t } from '../strings';
import { COLORS } from './shared';

function FollowedUserRow({ userId, onUnfollow }: { userId: string; onUnfollow: () => void }): ReactElement {
  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{userId.slice(0, 1).toUpperCase()}</Text>
      </View>
      <Text style={styles.userId} numberOfLines={1}>{userId.slice(0, 16)}</Text>
      <Pressable
        style={styles.unfollowBtn}
        onPress={onUnfollow}
        accessibilityRole="button"
        accessibilityLabel={t('followedUsers.unfollowA11y', { userId })}
        testID={`followedUsers.unfollow.${userId}`}
      >
        <Text style={styles.unfollowText}>{t('followedUsers.unfollow')}</Text>
      </Pressable>
    </View>
  );
}

export function FollowedUsersScreen(): ReactElement {
  const { followedIds, toggleFollow, loading } = useFollows();
  const ids = [...followedIds];

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container} testID="followed-users-screen">
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('followedUsers.title')}</Text>
      </View>
      <FlatList
        data={ids}
        keyExtractor={(id) => id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <FollowedUserRow
            userId={item}
            onUnfollow={() => { void toggleFollow(item); }}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('followedUsers.empty')}</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    backgroundColor: '#FFF',
  },
  headerTitle: { fontSize: 18, fontWeight: '600', color: COLORS.textPrimary, textAlign: 'auto' },
  listContent: { paddingVertical: 8 },
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  userId: { flex: 1, fontSize: 14, color: COLORS.textPrimary, textAlign: 'auto' },
  unfollowBtn: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  unfollowText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '500' },
  emptyContainer: { flex: 1, alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 15, color: COLORS.textMuted, textAlign: 'center' },
});
