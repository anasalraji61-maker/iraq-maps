import { ListingCategory } from '@iraq-maps/contracts';
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
import { useMarketplaceClient } from '../socialClient';
import { t } from '../strings';
import { COLORS } from './shared';

const CATEGORIES = ListingCategory.options;

export function CreateListingScreen() {
  const client = useMarketplaceClient();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [currency, setCurrency] = useState('IQD');
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [imagesText, setImagesText] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!title.trim() || !priceStr) return;
    const images = imagesText.split('\n').map((s) => s.trim()).filter(Boolean);
    setLoading(true);
    try {
      const res = await client.createListing({
        body: {
          title: title.trim(),
          description: description.trim(),
          price: parseFloat(priceStr) || 0,
          currency,
          category: category as never,
          images,
        },
      });
      if (res.status === 201) {
        router.back();
      } else {
        Alert.alert(t('marketplace.createError'));
      }
    } catch {
      Alert.alert(t('marketplace.createError'));
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ flex: 1, backgroundColor: COLORS.bg }} contentContainerStyle={{ padding: 16 }}>
        <Text style={[styles.screenTitle, { color: COLORS.text }]}>{t('marketplace.createTitle')}</Text>

        <Text style={[styles.label, { color: COLORS.secondary }]}>{t('marketplace.titleLabel')}</Text>
        <TextInput
          style={[styles.input, { color: COLORS.text, borderColor: COLORS.border, backgroundColor: COLORS.surface }]}
          value={title}
          onChangeText={setTitle}
          placeholder={t('marketplace.titleLabel')}
          placeholderTextColor={COLORS.secondary}
        />

        <Text style={[styles.label, { color: COLORS.secondary }]}>{t('marketplace.descriptionLabel')}</Text>
        <TextInput
          style={[styles.input, styles.multiline, { color: COLORS.text, borderColor: COLORS.border, backgroundColor: COLORS.surface }]}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          placeholder={t('marketplace.descriptionLabel')}
          placeholderTextColor={COLORS.secondary}
        />

        <Text style={[styles.label, { color: COLORS.secondary }]}>{t('marketplace.priceLabel')}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            style={[styles.input, { flex: 2, color: COLORS.text, borderColor: COLORS.border, backgroundColor: COLORS.surface }]}
            value={priceStr}
            onChangeText={setPriceStr}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={COLORS.secondary}
          />
          <TextInput
            style={[styles.input, { flex: 1, color: COLORS.text, borderColor: COLORS.border, backgroundColor: COLORS.surface }]}
            value={currency}
            onChangeText={setCurrency}
            placeholder="IQD"
            placeholderTextColor={COLORS.secondary}
            maxLength={3}
          />
        </View>

        <Text style={[styles.label, { color: COLORS.secondary }]}>{t('marketplace.categoryLabel')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          {CATEGORIES.map((cat) => (
            <Pressable
              key={cat}
              style={[styles.catChip, { backgroundColor: cat === category ? COLORS.accent : COLORS.surface, borderColor: COLORS.border }]}
              onPress={() => setCategory(cat)}
            >
              <Text style={{ color: cat === category ? '#fff' : COLORS.text, fontSize: 13 }}>
                {t(`marketplace.categories.${cat}` as never)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={[styles.label, { color: COLORS.secondary }]}>{t('marketplace.imagesLabel')}</Text>
        <TextInput
          style={[styles.input, styles.multiline, { color: COLORS.text, borderColor: COLORS.border, backgroundColor: COLORS.surface }]}
          value={imagesText}
          onChangeText={setImagesText}
          multiline
          numberOfLines={3}
          placeholder={t('marketplace.imagesLabel')}
          placeholderTextColor={COLORS.secondary}
          keyboardType="url"
        />

        <Pressable
          style={[styles.submitBtn, { backgroundColor: loading ? '#aaa' : COLORS.accent }]}
          onPress={handleCreate}
          disabled={loading}
          accessibilityRole="button"
        >
          {loading ? <ActivityIndicator color="#fff" /> : (
            <Text style={styles.submitBtnText}>{t('marketplace.submitCreate')}</Text>
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
