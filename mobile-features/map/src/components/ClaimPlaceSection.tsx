import { routes, useRouteAvailable } from '@iraq-maps/mobile-kit';
import { useRouter } from 'expo-router';
import { type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '../strings';

interface Props {
  placeId: string;
}

/**
 * Shown on OSM-sourced places that have no provider yet.
 * Taps through to the provider registration flow.
 */
export function ClaimPlaceSection({ placeId }: Props): ReactElement | null {
  const router = useRouter();
  // Only show if the provider registration route is available
  const available = useRouteAvailable('providerRegister' as never);
  if (!available) return null;

  return (
    <View style={styles.container} testID="place.claimSection">
      <Text style={styles.title}>{t('place.claimPlace')}</Text>
      <Text style={styles.subtitle}>{t('place.claimPlaceSubtitle')}</Text>
      <Pressable
        testID="place.claimBtn"
        style={styles.btn}
        accessibilityRole="button"
        accessibilityLabel={t('place.claimPlaceBtn')}
        onPress={() =>
          router.push({
            pathname: (routes as Record<string, string>)['providerRegister'] as never,
            params: { claimPlaceId: placeId },
          })
        }
      >
        <Text style={styles.btnLabel}>{t('place.claimPlaceBtn')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#B3E5FC',
    backgroundColor: '#E1F5FE',
    gap: 6,
  },
  title: { fontSize: 14, fontWeight: '700', color: '#01579B' },
  subtitle: { fontSize: 12, color: '#0277BD' },
  btn: {
    marginTop: 4,
    backgroundColor: '#0288D1',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  btnLabel: { color: '#FFF', fontSize: 13, fontWeight: '600' },
});
