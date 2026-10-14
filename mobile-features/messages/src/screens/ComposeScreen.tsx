import { messagingTestIDs } from '@iraq-maps/contracts';
import { Badge, Banner, Button, Screen, Text, TextField } from '@iraq-maps/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactElement } from 'react';
import { View } from 'react-native';
import { t } from '../strings';

const MAX_PLACES = 5;

export function ComposeScreen(): ReactElement {
  const params = useLocalSearchParams<{ text?: string; placeIds?: string }>();
  const initialText = params.text ?? '';
  const initialPlaceIds: string[] = params.placeIds ? params.placeIds.split(',').filter(Boolean) : [];

  const [text, setText] = useState(initialText);
  const [placeIds, _setPlaceIds] = useState<string[]>(initialPlaceIds);
  const [error, setError] = useState<string | undefined>();
  const router = useRouter();

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
      <TextField
        label={t('compose.title')}
        value={text}
        onChangeText={(v) => {
          if (v.length <= 500) setText(v);
        }}
        placeholder={t('compose.placeholder')}
      />
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
