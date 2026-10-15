import { EventCategory } from '@iraq-maps/contracts';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useEventsClient } from '../socialClient';
import { t } from '../strings';
import { COLORS } from './shared';

const CATEGORIES = EventCategory.options;

export function CreateEventScreen() {
  const client = useEventsClient();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [latStr, setLatStr] = useState('');
  const [lngStr, setLngStr] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [maxStr, setMaxStr] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!title.trim() || !startTime || !endTime) return;
    setLoading(true);
    try {
      const res = await client.createEvent({
        body: {
          title: title.trim(),
          description: description.trim(),
          lat: parseFloat(latStr) || 33.3,
          lng: parseFloat(lngStr) || 44.4,
          address: address.trim(),
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
          maxAttendees: maxStr ? parseInt(maxStr, 10) : undefined,
          imageUrl: imageUrl.trim() || undefined,
          category: category as never,
        },
      });
      if (res.status === 201) {
        router.back();
      } else {
        Alert.alert(t('events.createError'));
      }
    } catch {
      Alert.alert(t('events.createError'));
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ flex: 1, backgroundColor: COLORS.bg }} contentContainerStyle={{ padding: 16 }}>
        <Text style={[styles.screenTitle, { color: COLORS.text }]}>{t('events.createTitle')}</Text>

        <Text style={[styles.label, { color: COLORS.secondary }]}>{t('events.titleLabel')}</Text>
        <TextInput
          style={[styles.input, { color: COLORS.text, borderColor: COLORS.border, backgroundColor: COLORS.surface }]}
          value={title}
          onChangeText={setTitle}
          placeholder={t('events.titleLabel')}
          placeholderTextColor={COLORS.secondary}
        />

        <Text style={[styles.label, { color: COLORS.secondary }]}>{t('events.descriptionLabel')}</Text>
        <TextInput
          style={[styles.input, styles.multiline, { color: COLORS.text, borderColor: COLORS.border, backgroundColor: COLORS.surface }]}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          placeholder={t('events.descriptionLabel')}
          placeholderTextColor={COLORS.secondary}
        />

        <Text style={[styles.label, { color: COLORS.secondary }]}>{t('events.address')}</Text>
        <TextInput
          style={[styles.input, { color: COLORS.text, borderColor: COLORS.border, backgroundColor: COLORS.surface }]}
          value={address}
          onChangeText={setAddress}
          placeholder={t('events.address')}
          placeholderTextColor={COLORS.secondary}
        />

        <Text style={[styles.label, { color: COLORS.secondary }]}>{t('events.locationLabel')}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            style={[styles.input, { flex: 1, color: COLORS.text, borderColor: COLORS.border, backgroundColor: COLORS.surface }]}
            value={latStr}
            onChangeText={setLatStr}
            keyboardType="numeric"
            placeholder="33.3"
            placeholderTextColor={COLORS.secondary}
          />
          <TextInput
            style={[styles.input, { flex: 1, color: COLORS.text, borderColor: COLORS.border, backgroundColor: COLORS.surface }]}
            value={lngStr}
            onChangeText={setLngStr}
            keyboardType="numeric"
            placeholder="44.4"
            placeholderTextColor={COLORS.secondary}
          />
        </View>

        <Text style={[styles.label, { color: COLORS.secondary }]}>{t('events.startTime')}</Text>
        <TextInput
          style={[styles.input, { color: COLORS.text, borderColor: COLORS.border, backgroundColor: COLORS.surface }]}
          value={startTime}
          onChangeText={setStartTime}
          placeholderTextColor={COLORS.secondary}
        />

        <Text style={[styles.label, { color: COLORS.secondary }]}>{t('events.endTime')}</Text>
        <TextInput
          style={[styles.input, { color: COLORS.text, borderColor: COLORS.border, backgroundColor: COLORS.surface }]}
          value={endTime}
          onChangeText={setEndTime}
          placeholderTextColor={COLORS.secondary}
        />

        <Text style={[styles.label, { color: COLORS.secondary }]}>{t('events.maxAttendeesLabel')}</Text>
        <TextInput
          style={[styles.input, { color: COLORS.text, borderColor: COLORS.border, backgroundColor: COLORS.surface }]}
          value={maxStr}
          onChangeText={setMaxStr}
          keyboardType="numeric"
          placeholder="100"
          placeholderTextColor={COLORS.secondary}
        />

        <Text style={[styles.label, { color: COLORS.secondary }]}>{t('events.imageUrlLabel')}</Text>
        <TextInput
          style={[styles.input, { color: COLORS.text, borderColor: COLORS.border, backgroundColor: COLORS.surface }]}
          value={imageUrl}
          onChangeText={setImageUrl}
          placeholder={t('events.imageUrlLabel')}
          placeholderTextColor={COLORS.secondary}
          keyboardType="url"
        />

        <Text style={[styles.label, { color: COLORS.secondary }]}>{t('events.category')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          {CATEGORIES.map((cat) => (
            <Pressable
              key={cat}
              style={[styles.catChip, { backgroundColor: cat === category ? COLORS.accent : COLORS.surface, borderColor: COLORS.border }]}
              onPress={() => setCategory(cat)}
            >
              <Text style={{ color: cat === category ? '#fff' : COLORS.text, fontSize: 13 }}>
                {t(`events.categories.${cat}` as never)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Pressable
          style={[styles.submitBtn, { backgroundColor: loading ? '#aaa' : COLORS.accent }]}
          onPress={handleCreate}
          disabled={loading}
          accessibilityRole="button"
        >
          {loading ? <ActivityIndicator color="#fff" /> : (
            <Text style={styles.submitBtnText}>{t('events.submitCreate')}</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screenTitle: { fontSize: 20, fontWeight: '700', marginBottom: 20 },
  label: { fontSize: 13, marginBottom: 4, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14 },
  multiline: { height: 100, textAlignVertical: 'top' },
  catChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, marginEnd: 8 },
  submitBtn: { marginTop: 24, paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 40 },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
