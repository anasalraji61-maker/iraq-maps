/**
 * GifPicker — modal GIF picker for comments and posts.
 * Uses local mock data (no API key required).
 */
import { type ReactElement, useState, useCallback } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { t } from '../strings';
import { COLORS } from './shared';
import { TRENDING_GIFS, searchGifs, type MockGif } from '../mockGifs';

interface GifPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (gif: MockGif) => void;
}

export function GifPicker({ visible, onClose, onSelect }: GifPickerProps): ReactElement {
  const [query, setQuery] = useState('');
  const results = query.trim() ? searchGifs(query) : TRENDING_GIFS;

  const handleClose = useCallback(() => {
    setQuery('');
    onClose();
  }, [onClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{t('gif.label')}</Text>
            <Pressable
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel={t('post.editCancel')}
              style={styles.closeBtn}
            >
              <Text style={styles.closeBtnText}>{t('comments.cancelReplyIcon')}</Text>
            </Pressable>
          </View>

          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={t('gif.search')}
            placeholderTextColor="#999"
            returnKeyType="search"
          />

          {results.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>{t('gif.empty')}</Text>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              numColumns={2}
              columnWrapperStyle={styles.row}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.gifCell}
                  onPress={() => { onSelect(item); handleClose(); }}
                  accessibilityRole="button"
                  accessibilityLabel={item.searchKey}
                >
                  <Image
                    source={{ uri: item.thumbUrl }}
                    style={styles.gifThumb}
                    resizeMode="cover"
                  />
                </Pressable>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFF',
    borderTopStartRadius: 16,
    borderTopEndRadius: 16,
    maxHeight: '70%',
    paddingBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  closeBtn: { padding: 6 },
  closeBtnText: { fontSize: 16, color: '#666' },
  searchInput: {
    marginHorizontal: 12,
    marginVertical: 10,
    backgroundColor: COLORS.inputBg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  row: { gap: 8, paddingHorizontal: 12, marginBottom: 8 },
  gifCell: {
    flex: 1,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: COLORS.inputBg,
  },
  gifThumb: {
    width: '100%',
    height: 120,
  },
  gifTitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    paddingHorizontal: 6,
    paddingVertical: 4,
    textAlign: 'center',
  },
  emptyContainer: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 14, color: COLORS.textMuted },
});
