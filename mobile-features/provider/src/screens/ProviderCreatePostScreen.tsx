/**
 * ProviderCreatePostScreen — lets a provider publish a post tagged to their business.
 */
import { useApi } from '@iraq-maps/mobile-kit';
import { Button, Screen, Text } from '@iraq-maps/ui';
import { useRouter } from 'expo-router';
import { useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
} from 'react-native';
import { t } from '../strings';

const MAX_CHARS = 1000;

export function ProviderCreatePostScreen(): ReactElement {
  const api = useApi();
  const router = useRouter();
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const remaining = MAX_CHARS - body.length;

  async function handleSubmit() {
    if (!body.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.discover.createPost({
        body: { type: 'tip', body: body.trim() },
      });
      if (res.status === 201) {
        setDone(true);
        setTimeout(() => router.back(), 1200);
      } else {
        setError(String((res.body as { message?: string }).message ?? 'error'));
      }
    } catch (e) {
      setError(String((e as Error).message ?? 'error'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <View style={styles.container}>
        <Text variant="title">{t('posts.title')}</Text>

        <TextInput
          style={styles.input}
          value={body}
          onChangeText={setBody}
          placeholder={t('posts.placeholder')}
          multiline
          maxLength={MAX_CHARS}
          testID="post-body-input"
          accessibilityLabel={t('posts.label')}
        />

        <RNText style={[styles.counter, remaining < 50 && styles.counterWarn]}>
          {t('posts.charsMax', { max: MAX_CHARS })} — {t('posts.charCount', { n: body.length })}
        </RNText>

        {error ? <RNText style={styles.error}>{error}</RNText> : null}
        {done ? <RNText style={styles.success}>{t('posts.success')}</RNText> : null}

        <View style={styles.row}>
          <Button
            variant="secondary"
            label={t('posts.cancel')}
            onPress={() => router.back()}
          />
          {submitting ? (
            <ActivityIndicator color="#1976D2" />
          ) : (
            <Button
              label={t('posts.submit')}
              onPress={() => { void handleSubmit(); }}
              testID="post-submit-btn"
            />
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, flex: 1 },
  input: {
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    minHeight: 140,
    textAlignVertical: 'top',
    textAlign: 'auto',
    color: '#222',
    backgroundColor: '#FAFAFA',
  },
  counter: { fontSize: 12, color: '#888', textAlign: 'auto' },
  counterWarn: { color: '#E53935' },
  error: { color: '#E53935', fontSize: 13 },
  success: { color: '#2E7D32', fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end', marginTop: 8 },
});
