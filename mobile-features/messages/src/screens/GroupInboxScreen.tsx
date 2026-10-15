/**
 * GroupInboxScreen – list all groups the user is a member of.
 */
import { useRouter } from 'expo-router';
import { type ReactElement, useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  I18nManager,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useGroupsClient } from '../client';
import { t } from '../strings';
import type { GroupType } from '@iraq-maps/contracts';

I18nManager.forceRTL(true);

export function GroupInboxScreen(): ReactElement {
  const router = useRouter();
  const client = useGroupsClient();
  const [groups, setGroups] = useState<GroupType[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await client.listGroups({ query: {} });
      if (res.status === 200) {
        setGroups(res.body.items);
        setError(null);
      }
    } catch {
      setError(t('groups.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [client]);

  useEffect(() => { load(); }, [load]);

  const renderItem = ({ item }: { item: GroupType }) => (
    <Pressable
      style={styles.row}
      onPress={() => router.push({ pathname: '/messages/groups/[groupId]' as Parameters<typeof router.push>[0], params: { groupId: item.id } })}
      accessibilityRole="button"
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.groupName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.memberCount}>{t('groups.memberCount', { n: item.memberCount })}</Text>
      </View>
    </Pressable>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('groups.title')}</Text>
        <TouchableOpacity
          onPress={() => router.push('/messages/groups/create' as Parameters<typeof router.push>[0])}
          accessibilityRole="button"
          accessibilityLabel={t('groups.create')}
        >
          <Text style={styles.createBtn}>+</Text>
        </TouchableOpacity>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <FlatList
        data={groups}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={<Text style={styles.empty}>{t('groups.empty')}</Text>}
        contentContainerStyle={groups.length === 0 ? styles.emptyContainer : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  createBtn: { fontSize: 28, fontWeight: '700', color: '#2196F3', paddingHorizontal: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '700', color: '#1565C0' },
  rowContent: { flex: 1 },
  groupName: { fontSize: 16, fontWeight: '600', color: '#212121' },
  memberCount: { fontSize: 13, color: '#757575', marginTop: 2 },
  errorText: { color: '#D32F2F', textAlign: 'center', padding: 16 },
  empty: { color: '#9E9E9E', textAlign: 'center', padding: 24 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
