import { messagingTestIDs } from '@iraq-maps/contracts';
import { Badge, Banner, Button, Screen, Text, TextField } from '@iraq-maps/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState, type ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import { t } from '../strings';

const MAX_CHARS = 500;
const MAX_PLACES = 5;

const TEMPLATE_KEYS = ['price', 'hours', 'available', 'location', 'delivery'] as const;
type TemplateKey = (typeof TEMPLATE_KEYS)[number];

function QuickReplyChips({ onSelect }: { onSelect: (text: string) => void }): ReactElement {
  return (
    <View style={chipStyles.container}>
      <RNText style={chipStyles.label}>{t('compose.templatesLabel')}</RNText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={chipStyles.row}>
        {TEMPLATE_KEYS.map((key: TemplateKey) => (
          <Pressable
            key={key}
            style={chipStyles.chip}
            onPress={() => onSelect(t(`compose.templates.${key}`))}
            accessibilityRole="button"
            accessibilityLabel={t(`compose.templates.${key}`)}
          >
            <RNText style={chipStyles.chipText}>{t(`compose.templates.${key}`)}</RNText>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  container: { marginBottom: 8 },
  label: { fontSize: 12, color: '#757575', marginBottom: 6, textAlign: 'auto' },
  row: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#E3F2FD',
    borderWidth: 1,
    borderColor: '#BBDEFB',
  },
  chipText: { fontSize: 13, color: '#1565C0', fontWeight: '500' },
});

export function ComposeScreen(): ReactElement {
  const params = useLocalSearchParams<{ text?: string; placeIds?: string }>();
  const initialText = params.text ?? '';
  const initialPlaceIds: string[] = params.placeIds ? params.placeIds.split(',').filter(Boolean) : [];

  const [text, setText] = useState(initialText);
  const [placeIds, _setPlaceIds] = useState<string[]>(initialPlaceIds);
  const [error, setError] = useState<string | undefined>();
  const router = useRouter();

  const handleTemplateSelect = useCallback((tpl: string) => {
    setText((prev) => {
      const combined = prev.trim() ? `${prev.trim()} ${tpl}` : tpl;
      return combined.slice(0, MAX_CHARS);
    });
  }, []);

  const tryAddPlace = () => {
    if (placeIds.length >= MAX_PLACES) {
      setError(t('compose.maxPlaces'));
    }
  };

  const onContinue = () => {
    if (!text.trim()) return;
    router.push({
      pathname: '/messages/confirm',
      params: { text, placeIds: placeIds.join(',') },
    });
  };

  return (
    <Screen scroll>
      <Text variant="title">{t('compose.title')}</Text>
      {error ? <Banner kind="error" message={error} /> : null}
      <QuickReplyChips onSelect={handleTemplateSelect} />
      <TextField
        autoFocus
        testID="messaging.compose.input"
        label={t('compose.title')}
        value={text}
        onChangeText={(v) => {
          if (v.length <= MAX_CHARS) setText(v);
        }}
        placeholder={t('compose.placeholder')}
      />
      <View style={{ alignItems: 'flex-end' }}>
        <Text tone="muted" variant="caption">
          {t('compose.charCount', { count: text.length })}
        </Text>
      </View>
      {placeIds.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {placeIds.map((id) => (
            <Badge key={id} label={id} testID={messagingTestIDs.placeChip(id)} />
          ))}
        </View>
      ) : null}
      <Button
        label={t('compose.addPlace')}
        variant="secondary"
        onPress={tryAddPlace}
      />
      <Button
        label={t('compose.continue')}
        onPress={onContinue}
        disabled={!text.trim()}
        testID={messagingTestIDs.composeButton}
      />
    </Screen>
  );
}
