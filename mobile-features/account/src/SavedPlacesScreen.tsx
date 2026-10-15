/**
 * M185: Saved places screen.
 * Shows all locally-stored bookmarked places with ability to remove them or navigate to their detail.
 */
import { href, savedPlaces, type SavedPlace } from '@iraq-maps/mobile-kit';
import { EmptyState, Screen } from '@iraq-maps/ui';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { ScreenTitle } from './ScreenTitle';
import { t } from './strings';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function PlaceRow({ item, onRemove, onPress }: { item: SavedPlace; onRemove: (id: string) => void; onPress: (id: string) => void }): ReactElement {
  return (
    <Pressable
      style={styles.row}
      onPress={() => onPress(item.placeId)}
      accessibilityRole="button"
      accessibilityLabel={item.name}
    >
      <View style={styles.rowContent}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        {item.category ? <Text style={styles.category} numberOfLines={1}>{item.category}</Text> : null}
        <Text style={styles.date}>{t('savedPlaces.savedAt', { date: formatDate(item.savedAt) })}</Text>
      </View>
      <Pressable
        style={styles.removeBtn}
        onPress={() => onRemove(item.placeId)}
        accessibilityRole="button"
        accessibilityLabel={t('savedPlaces.unsaveA11y', { name: item.name })}
        hitSlop={8}
      >
        <Text style={styles.removeBtnText}>{t('savedPlaces.unsave')}</Text>
      </Pressable>
    </Pressable>
  );
}

export function SavedPlacesScreen(): ReactElement {
  const router = useRouter();
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void savedPlaces.list().then((list) => {
      setPlaces(list);
      setLoading(false);
    });
  }, []);

  const handleRemove = useCallback(async (placeId: string) => {
    await savedPlaces.remove(placeId as Parameters<typeof savedPlaces.remove>[0]);
    setPlaces((prev) => prev.filter((p) => p.placeId !== placeId));
  }, []);

  const handlePress = useCallback((placeId: string) => {
    router.push(href('place', { placeId }));
  }, [router]);

  if (loading) {
    return <Screen><ScreenTitle title={t('savedPlaces.title')} /></Screen>;
  }

  return (
    <Screen testID="saved-places-screen">
      <ScreenTitle title={t('savedPlaces.title')} />
      {places.length === 0 ? (
        <EmptyState title={t('savedPlaces.empty')} body={t('savedPlaces.emptyBody')} />
      ) : (
        <FlatList
          data={places}
          keyExtractor={(item) => item.placeId}
          renderItem={({ item }) => (
            <PlaceRow item={item} onRemove={(id) => void handleRemove(id)} onPress={handlePress} />
          )}
          contentContainerStyle={styles.list}
          scrollEnabled={false}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  rowContent: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '500', color: '#1A1A1A', textAlign: 'auto' },
  category: { fontSize: 13, color: '#666', textAlign: 'auto' },
  date: { fontSize: 12, color: '#999', marginTop: 2, textAlign: 'auto' },
  removeBtn: {
    marginStart: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FDECEA',
    borderRadius: 6,
  },
  removeBtnText: { fontSize: 13, color: '#C62828', fontWeight: '500' },
});
