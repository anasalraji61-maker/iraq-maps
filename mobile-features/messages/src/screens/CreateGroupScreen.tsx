/**
 * CreateGroupScreen – create a new messaging group.
 */
import { useRouter } from 'expo-router';
import { type ReactElement, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  I18nManager,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useGroupsClient } from '../client';
import { t } from '../strings';

I18nManager.forceRTL(true);

export function CreateGroupScreen(): ReactElement {
  const router = useRouter();
  const client = useGroupsClient();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      const res = await client.createGroup({ body: { name: trimmed } });
      if (res.status === 201) {
        router.replace({
          pathname: '/messages/groups/[groupId]' as Parameters<typeof router.replace>[0],
          params: { groupId: res.body.id, groupName: res.body.name },
        });
      } else {
        Alert.alert(t('groups.createError'));
      }
    } catch {
      Alert.alert(t('groups.createError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>{t('compose.cancel')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('groups.create')}</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>{t('groups.nameLabel')}</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={t('groups.namePlaceholder')}
          placeholderTextColor="#9E9E9E"
          maxLength={100}
          autoFocus
          textAlign={I18nManager.isRTL ? 'right' : 'left'}
          returnKeyType="done"
          onSubmitEditing={handleCreate}
        />
      </View>

      <View style={styles.footer}>
        {loading ? (
          <ActivityIndicator size="large" color="#2196F3" />
        ) : (
          <TouchableOpacity
            style={[styles.createBtn, !name.trim() && styles.createBtnDisabled]}
            onPress={handleCreate}
            disabled={!name.trim()}
            accessibilityRole="button"
          >
            <Text style={styles.createBtnText}>{t('groups.create')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  cancelBtn: { width: 60 },
  cancelText: { color: '#2196F3', fontSize: 16 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  form: { padding: 20, gap: 8 },
  label: { fontSize: 14, color: '#757575', fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#212121',
  },
  footer: { padding: 20, alignItems: 'center' },
  createBtn: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 48,
    paddingVertical: 14,
    borderRadius: 28,
  },
  createBtnDisabled: { backgroundColor: '#BDBDBD' },
  createBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
