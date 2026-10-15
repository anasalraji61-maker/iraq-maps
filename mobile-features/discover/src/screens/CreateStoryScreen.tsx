/**
 * CreateStoryScreen – pick image/video from camera roll, then post as a story.
 */
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { type ReactElement, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useStoriesClient } from '../storiesClient';
import { t } from '../strings';

export function CreateStoryScreen(): ReactElement {
  const router = useRouter();
  const client = useStoriesClient();
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [uploading, setUploading] = useState(false);

  const pickMedia = async (type: 'image' | 'video') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: type === 'image' ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.Videos,
      quality: 0.9,
      videoMaxDuration: 30,
    });
    if (!result.canceled && result.assets[0]) {
      setMediaUri(result.assets[0].uri);
      setMediaType(type);
    }
  };

  const handlePost = async () => {
    if (!mediaUri) return;
    setUploading(true);
    try {
      // In a real implementation, upload to media service first.
      // Here we use the URI directly (works for dev/testing).
      const res = await client.createStory({
        body: { mediaUrl: mediaUri, mediaType, duration: mediaType === 'video' ? 15 : 5 },
      });
      if (res.status === 201) {
        router.back();
      } else {
        Alert.alert(t('stories.uploadError'));
      }
    } catch {
      Alert.alert(t('stories.uploadError'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('stories.create')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Preview */}
      {mediaUri ? (
        <View style={styles.preview}>
          <Image source={{ uri: mediaUri }} style={styles.previewImage} resizeMode="cover" />
          <TouchableOpacity
            style={styles.changeBtn}
            onPress={() => setMediaUri(null)}
          >
            <Text style={styles.changeBtnText}>{t('stories.pickMedia')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.pickArea}>
          <Pressable style={styles.pickButton} onPress={() => pickMedia('image')}>
            <Text style={styles.pickIcon}>🖼️</Text>
            <Text style={styles.pickLabel}>{t('stories.pickPhoto')}</Text>
          </Pressable>
          <Pressable style={styles.pickButton} onPress={() => pickMedia('video')}>
            <Text style={styles.pickIcon}>🎬</Text>
            <Text style={styles.pickLabel}>{t('stories.pickVideo')}</Text>
          </Pressable>
        </View>
      )}

      {/* Post button */}
      {mediaUri && (
        <View style={styles.footer}>
          {uploading ? (
            <ActivityIndicator size="large" color="#2196F3" />
          ) : (
            <TouchableOpacity
              style={styles.postBtn}
              onPress={handlePost}
              accessibilityRole="button"
            >
              <Text style={styles.postBtnText}>{t('create.submit')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  backBtnText: { color: '#FFF', fontSize: 20 },
  headerTitle: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  preview: { flex: 1, position: 'relative' },
  previewImage: { flex: 1 },
  changeBtn: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  changeBtnText: { color: '#FFF', fontSize: 14 },
  pickArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    backgroundColor: '#111',
  },
  pickButton: {
    width: 120,
    height: 120,
    backgroundColor: '#222',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pickIcon: { fontSize: 36 },
  pickLabel: { color: '#FFF', fontSize: 13, textAlign: 'center' },
  footer: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  postBtn: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 48,
    paddingVertical: 14,
    borderRadius: 28,
  },
  postBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
