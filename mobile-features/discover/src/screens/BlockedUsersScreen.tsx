/**
 * BlockedUsersScreen — lists client-side blocked users with ability to unblock.
 * Accessible from Account → Settings → Blocked Users.
 */
import { type ReactElement } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useBlockedUsers } from '../useBlockedUsers';
import { t } from '../strings';
import { COLORS } from './shared';

function BlockedUserRow({ userId, onUnblock }: { userId: string; onUnblock: () => void }): ReactElement {
  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{userId.slice(0, 1).toUpperCase()}</Text>
      </View>
      <Text style={styles.userId} numberOfLines={1}>{userId.slice(0, 16)}</Text>
      <Pressable
        style={styles.unblockBtn}
        onPress={onUnblock}
        accessibilityRole="button"
        accessibilityLabel={t('blockedUsers.unblockA11y', { userId })}
        testID={`blockedUsers.unblock.${userId}`}
      >
        <Text style={styles.unblockText}>{t('blockedUsers.unblock')}</Text>
      </Pressable>
    </View>
  );
}

export function BlockedUsersScreen(): ReactElement {
  const { blockedIds, unblockUser } = useBlockedUsers();
  const ids = [...blockedIds];

  return (
    <View style={styles.container} testID="blocked-users-screen">
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('blockedUsers.title')}</Text>
      </View>
      <FlatList
        data={ids}
        keyExtractor={(id) => id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <BlockedUserRow
            userId={item}
            onUnblock={() => { void unblockUser(item); }}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('blockedUsers.empty')}</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
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
  unblockBtn: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  unblockText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '500' },
  emptyContainer: { flex: 1, alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 15, color: COLORS.textMuted, textAlign: 'center' },
});
