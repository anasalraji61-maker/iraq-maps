/**
 * ProviderPhotoGalleryScreen — view, add and delete business photos.
 *
 * Photos are uploaded via the media API (createUpload → PUT → complete) and
 * then saved to the provider via providers.update({ photoAssetIds }).
 */
import { useApi, useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { Button, EmptyState, Screen, Text } from '@iraq-maps/ui';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { t } from '../strings';

interface Photo {
  assetId: string;
  url: string;
}

export function ProviderPhotoGalleryScreen(): ReactElement {
  const api = useApi();
  const apiBaseUrl = useApiBaseUrl();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.providers.me();
      if (res.status === 200) {
        const ids = (res.body.photos ?? []).map((p) => p.assetId);
        setAssetIds(ids);
        setPhotos(
          (res.body.photos ?? []).map((p) => ({
            assetId: p.assetId,
            url: p.url ?? `${apiBaseUrl}/v1/media/${p.assetId}/url`,
          })),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [api, apiBaseUrl]);

  useEffect(() => { void load(); }, [load]);

  const uploadPhoto = async (uri: string): Promise<string | null> => {
    try {
      // 1. Fetch file bytes first to know the size
      const fileRes = await fetch(uri);
      const blob = await fileRes.blob();

      // 2. Request a signed upload URL
      const createRes = await api.media.createUpload({
        body: { mime: 'image/jpeg', purpose: 'provider_photo', size: blob.size },
      });
      if (createRes.status !== 201) return null;
      const { assetId, uploadUrl } = createRes.body;
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: blob,
        headers: { 'Content-Type': 'image/jpeg' },
      });
      if (!putRes.ok) return null;

      // 3. Mark upload as complete so the backend can process it
      const completeRes = await api.media.completeUpload({ params: { assetId } });
      if (completeRes.status !== 202 && completeRes.status !== 409) return null;

      return assetId;
    } catch {
      return null;
    }
  };

  const handleAdd = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: true,
    });
    if (result.canceled || result.assets.length === 0) return;

    setUploading(true);
    setError(null);
    try {
      const newId = await uploadPhoto(result.assets[0]!.uri);
      if (!newId) {
        setError(t('gallery.uploadFailed'));
        return;
      }
      const newIds = [...assetIds, newId];
      const patchRes = await api.providers.update({ body: { photoAssetIds: newIds } });
      if (patchRes.status === 200) {
        await load();
      } else {
        setError(t('gallery.uploadFailed'));
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = (assetId: string) => {
    Alert.alert(t('gallery.delete'), t('gallery.deleteConfirm'), [
      { text: t('gallery.delete'), style: 'destructive', onPress: () => void doDelete(assetId) },
      { text: t('posts.cancel'), style: 'cancel' },
    ]);
  };

  const doDelete = async (assetId: string) => {
    const newIds = assetIds.filter((id) => id !== assetId);
    const res = await api.providers.update({ body: { photoAssetIds: newIds } });
    if (res.status === 200) {
      setAssetIds(newIds);
      setPhotos((prev) => prev.filter((p) => p.assetId !== assetId));
    }
  };

  if (loading) return <Screen><ActivityIndicator style={{ marginTop: 40 }} /></Screen>;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container}>
        <Text variant="title">{t('gallery.title')}</Text>

        {error ? <RNText style={styles.error}>{error}</RNText> : null}

        {photos.length === 0 ? (
          <EmptyState title={t('gallery.empty')} body={t('gallery.emptyBody')} />
        ) : (
          <View style={styles.grid}>
            {photos.map((photo) => (
              <View key={photo.assetId} style={styles.photoWrap}>
                <Image source={{ uri: photo.url }} style={styles.photo} />
                <Pressable
                  style={styles.deleteBtn}
                  onPress={() => handleDelete(photo.assetId)}
                  accessibilityLabel={t('gallery.delete')}
                  testID={`photo-delete-${photo.assetId}`}
                >
                  <RNText style={styles.deleteBtnText}>{t('gallery.deleteIcon')}</RNText>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {uploading ? (
          <View style={styles.uploadingRow}>
            <ActivityIndicator color="#1976D2" />
            <RNText style={styles.uploadingText}>{t('gallery.uploading')}</RNText>
          </View>
        ) : (
          <Button
            label={t('gallery.add')}
            onPress={() => { void handleAdd(); }}
            testID="gallery-add-btn"
          />
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  photoWrap: { position: 'relative', width: '47%', aspectRatio: 1 },
  photo: { width: '100%', height: '100%', borderRadius: 8, backgroundColor: '#EEE' },
  deleteBtn: {
    position: 'absolute',
    top: 4,
    insetInlineEnd: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  uploadingRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  uploadingText: { fontSize: 14, color: '#666' },
  error: { color: '#E53935', fontSize: 13 },
});
