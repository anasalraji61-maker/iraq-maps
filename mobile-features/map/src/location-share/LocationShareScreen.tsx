/**
 * LocationShareScreen – lets the authenticated user create a live location share
 * link, update their position, and stop sharing.
 */
import type { LocationShare, LngLat } from '@iraq-maps/contracts';
import { useApi } from '@iraq-maps/mobile-kit';
import { Button, Text, tokens } from '@iraq-maps/ui';
import { useCallback, useState, type ReactElement } from 'react';
import { Alert, Share, StyleSheet, View } from 'react-native';
import { t } from '../strings';

const APP_BASE_URL = process.env['EXPO_PUBLIC_APP_URL'] ?? 'https://iraqmaps.app';

interface LocationShareScreenProps {
  userLocation: LngLat | null;
}

export function LocationShareScreen({ userLocation }: LocationShareScreenProps): ReactElement {
  const api = useApi();
  const [share, setShare] = useState<LocationShare | null>(null);
  const [loading, setLoading] = useState(false);

  const startSharing = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.locationShare.create({ body: { ttlHours: 2 } });
      if (res.status === 201) {
        setShare(res.body);
        const url = `${APP_BASE_URL}/map/location-share-view?shareId=${res.body.shareId}`;
        await Share.share({ message: t('locationShare.shareMessage'), url });
      }
    } catch {
      Alert.alert(t('locationShare.errorTitle'), t('locationShare.errorBody'));
    } finally {
      setLoading(false);
    }
  }, [api]);

  const pushLocation = useCallback(async () => {
    if (!share || !userLocation) {
      Alert.alert(t('locationShare.noLocationTitle'), t('locationShare.noLocationBody'));
      return;
    }
    try {
      const res = await api.locationShare.update({
        params: { shareId: share.shareId },
        body: { location: userLocation },
      });
      if (res.status === 200) {
        setShare(res.body);
      } else if (res.status === 410) {
        Alert.alert(t('locationShare.expiredTitle'), t('locationShare.expiredBody'));
        setShare(null);
      }
    } catch {
      Alert.alert(t('locationShare.errorTitle'), t('locationShare.errorBody'));
    }
  }, [api, share, userLocation]);

  const stopSharing = useCallback(() => {
    setShare(null);
  }, []);

  const shareLink = useCallback(async () => {
    if (!share) return;
    const url = `${APP_BASE_URL}/map/location-share-view?shareId=${share.shareId}`;
    await Share.share({ message: t('locationShare.shareMessage'), url });
  }, [share]);

  return (
    <View style={styles.container}>
      <Text variant="title" style={styles.title}>
        {t('locationShare.title')}
      </Text>

      {!share ? (
        <>
          <Text variant="body" style={styles.description}>
            {t('locationShare.description')}
          </Text>
          <Button
            label={loading ? t('locationShare.creating') : t('locationShare.start')}
            onPress={() => void startSharing()}
            disabled={loading}
          />
        </>
      ) : (
        <>
          <View style={styles.activeCard}>
            <Text variant="caption" style={styles.activeLabel}>
              {t('locationShare.active')}
            </Text>
            <Text variant="body" style={styles.expiry}>
              {t('locationShare.expiresAt', { time: new Date(share.expiresAt).toLocaleTimeString() })}
            </Text>
          </View>

          <View style={styles.actions}>
            <Button
              label={t('locationShare.updateLocation')}
              onPress={() => void pushLocation()}
              disabled={!userLocation}
            />
            <Button
              label={t('locationShare.shareLink')}
              onPress={() => void shareLink()}
            />
            <Button
              label={t('locationShare.stop')}
              onPress={stopSharing}
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.color.bg,
    padding: tokens.space.m,
  },
  title: {
    marginBottom: tokens.space.s,
  },
  description: {
    color: tokens.color.textMuted,
    marginBottom: tokens.space.l,
  },
  activeCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.m,
    padding: tokens.space.m,
    marginBottom: tokens.space.m,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  activeLabel: {
    color: tokens.color.primary,
    marginBottom: tokens.space.xs,
  },
  expiry: {
    color: tokens.color.textMuted,
  },
  actions: {
    gap: tokens.space.s,
  },
});
