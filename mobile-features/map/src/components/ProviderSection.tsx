import { type PlaceProviderSection } from '@iraq-maps/contracts';
import { Badge, ListItem, Text } from '@iraq-maps/ui';
import { type ReactElement, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { t } from '../strings';
import { PhotoLightbox } from './PhotoLightbox';

interface Props {
  provider: PlaceProviderSection;
}

/** Shows provider-enriched data (photos, hours, phone, social) from place.provider. */
export function ProviderSection({ provider }: Props): ReactElement | null {
  if (!provider.verified) return null;

  const { photos, hours, phone, social } = provider;
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Text variant="subtitle">{t('place.providerTitle')}</Text>
        <Badge label={t('place.providerVerified')} />
      </View>

      {hours ? (
        <ListItem title={t('place.providerHours')} subtitle={hours} />
      ) : null}

      {phone ? (
        <ListItem
          title={t('place.providerPhone')}
          subtitle={phone}
          onPress={() => Linking.openURL(`tel:${phone.replace(/\s/g, '')}`).catch(() => undefined)}
        />
      ) : null}

      {social.length > 0 ? (
        <View>
          <Text tone="muted">{t('place.providerSocialLinks')}</Text>
          {social.map((link) => (
            <ListItem
              key={link.url}
              title={link.kind}
              subtitle={link.url}
              onPress={() => Linking.openURL(link.url).catch(() => undefined)}
            />
          ))}
        </View>
      ) : null}

      {photos.length > 0 ? (
        <View>
          <Text tone="muted">{t('place.providerPhotos')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
            {photos.map((photo, index) => (
              <Pressable
                key={photo.assetId}
                style={styles.photoThumb}
                onPress={() => setLightboxIndex(index)}
                accessibilityRole="button"
                accessibilityLabel={t('lightbox.photo')}
              >
                <Image
                  source={{ uri: photo.url }}
                  style={styles.photoImage}
                  accessibilityLabel={t('place.providerPhotos')}
                  resizeMode="cover"
                />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {lightboxIndex !== null ? (
        <PhotoLightbox
          photos={photos}
          initialIndex={lightboxIndex}
          visible
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  photoRow: {
    marginTop: 8,
  },
  photoThumb: {
    marginEnd: 8,
  },
  photoImage: {
    width: 96,
    height: 96,
    borderRadius: 8,
  },
});
