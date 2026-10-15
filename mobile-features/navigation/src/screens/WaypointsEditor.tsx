/**
 * Inline waypoints editor for the route preview.
 * Lets the user add up to 3 intermediate stops by searching for a place name.
 */
import type { LngLat, PlaceSummary } from '@iraq-maps/contracts';
import { pickName } from '@iraq-maps/contracts';
import { getLocale } from '@iraq-maps/i18n';
import { useApi } from '@iraq-maps/mobile-kit';
import { Button, Text, tokens } from '@iraq-maps/ui';
import { type ReactElement, useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { t } from '../strings';

export interface WaypointEntry {
  place: PlaceSummary;
  lngLat: LngLat;
}

interface Props {
  cityId: string;
  waypoints: WaypointEntry[];
  onChange: (waypoints: WaypointEntry[]) => void;
}

const MAX_WAYPOINTS = 3;

/** Single waypoint search row. */
function WaypointSearchRow({
  index,
  cityId,
  onAdd,
  onCancel,
}: {
  index: number;
  cityId: string;
  onAdd: (entry: WaypointEntry) => void;
  onCancel: () => void;
}): ReactElement {
  const api = useApi();
  const lang = getLocale();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await api.places.search({ query: { q: query.trim(), city: cityId, lang } });
      if (res.status === 200) setResults(res.body.items.slice(0, 5));
    } finally {
      setLoading(false);
    }
  }, [api, query, cityId, lang]);

  return (
    <View style={styles.searchRow}>
      <Text variant="caption">{t('waypoints.label', { n: index + 1 })}</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder={t('waypoints.placeholder')}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={search}
          returnKeyType="search"
          accessibilityLabel={t('waypoints.placeholder')}
        />
        <Pressable style={styles.searchBtn} onPress={() => void search()} accessibilityRole="button" accessibilityLabel={t('waypoints.search')}>
          {loading ? <ActivityIndicator size="small" /> : <Text>{t('waypoints.search')}</Text>}
        </Pressable>
      </View>
      {results.length === 0 && !loading && query.trim() ? (
        <Text tone="muted">{t('waypoints.noResults')}</Text>
      ) : null}
      {results.map((place) => {
        const name = pickName(place.names, lang);
        return (
          <Pressable
            key={place.id}
            style={styles.result}
            onPress={() => onAdd({ place, lngLat: place.location as LngLat })}
            accessibilityRole="button"
            accessibilityLabel={name}
          >
            <Text>{name}</Text>
          </Pressable>
        );
      })}
      <Pressable style={styles.cancelBtn} onPress={onCancel} accessibilityRole="button" accessibilityLabel={t('waypoints.remove')}>
        <Text tone="muted">{t('waypoints.remove')}</Text>
      </Pressable>
    </View>
  );
}

/** Editor that shows current waypoints and lets the user add or remove them. */
export function WaypointsEditor({ cityId, waypoints, onChange }: Props): ReactElement {
  const lang = getLocale();
  const [addingIndex, setAddingIndex] = useState<number | null>(null);

  const handleAdd = useCallback(
    (entry: WaypointEntry) => {
      onChange([...waypoints, entry]);
      setAddingIndex(null);
    },
    [waypoints, onChange],
  );

  const handleRemove = useCallback(
    (idx: number) => {
      onChange(waypoints.filter((_, i) => i !== idx));
    },
    [waypoints, onChange],
  );

  return (
    <View style={styles.container}>
      {waypoints.map((wp, idx) => (
        <View key={wp.place.id} style={styles.waypointRow}>
          <Text variant="caption">{t('waypoints.label', { n: idx + 1 })}</Text>
          <Text>{pickName(wp.place.names, lang)}</Text>
          <Pressable
            onPress={() => handleRemove(idx)}
            style={styles.removeBtn}
            accessibilityRole="button"
            accessibilityLabel={t('waypoints.remove')}
          >
            <Text tone="muted">{t('waypoints.remove')}</Text>
          </Pressable>
        </View>
      ))}
      {addingIndex !== null ? (
        <WaypointSearchRow
          index={waypoints.length}
          cityId={cityId}
          onAdd={handleAdd}
          onCancel={() => setAddingIndex(null)}
        />
      ) : null}
      {waypoints.length < MAX_WAYPOINTS && addingIndex === null ? (
        <Button
          label={t('waypoints.add')}
          variant="secondary"
          onPress={() => setAddingIndex(waypoints.length)}
        />
      ) : null}
    </View>
  );
}

const { space, color, radius } = tokens;
const styles = StyleSheet.create({
  container: { gap: space.s },
  waypointRow: { flexDirection: 'row', alignItems: 'center', gap: space.s, backgroundColor: color.surface, borderRadius: radius.m, padding: space.s },
  removeBtn: { marginStart: 8 },
  searchRow: { gap: space.xs, backgroundColor: color.surface, borderRadius: radius.m, padding: space.s },
  inputRow: { flexDirection: 'row', gap: space.xs, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: color.border, borderRadius: radius.s, paddingHorizontal: space.s, paddingVertical: space.xs, fontSize: 14 },
  searchBtn: { paddingHorizontal: space.s, paddingVertical: space.xs, backgroundColor: color.primary, borderRadius: radius.s },
  result: { paddingHorizontal: space.s, paddingVertical: space.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border },
  cancelBtn: { alignSelf: 'flex-end' },
});
