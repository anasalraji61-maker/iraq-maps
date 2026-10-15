import { ZoomableImage } from '@iraq-maps/ui';
import { type ReactElement } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { t } from '../strings';

interface Props {
  photos: { assetId: string; url: string }[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

/** Full-screen photo lightbox with horizontal paging. */
export function PhotoLightbox({ photos, initialIndex, visible, onClose }: Props): ReactElement {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.closeHitArea} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('lightbox.close')}>
          <View style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>{t('lightbox.closeSymbol')}</Text>
          </View>
        </Pressable>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: initialIndex * SCREEN_W, y: 0 }}
          style={styles.pager}
        >
          {photos.map((photo) => (
            <View key={photo.assetId} style={styles.page}>
              <ZoomableImage
                source={{ uri: photo.url }}
                style={styles.image}
                resizeMode="contain"
                accessibilityLabel={t('lightbox.photo')}
              />
            </View>
          ))}
        </ScrollView>
        <Text style={styles.counter}>
          {photos.length > 0
            ? t('lightbox.counter', { total: String(photos.length) })
            : null}
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
  },
  closeHitArea: {
    position: 'absolute',
    top: 0,
    insetInlineEnd: 0,
    zIndex: 10,
    padding: 16,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#fff',
    fontSize: 20,
    lineHeight: 22,
  },
  pager: {
    flex: 1,
  },
  page: {
    width: SCREEN_W,
    height: SCREEN_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: SCREEN_W,
    height: SCREEN_H * 0.8,
  },
  counter: {
    position: 'absolute',
    bottom: 32,
    alignSelf: 'center',
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
  },
});
