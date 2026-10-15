import { IconButton } from '@iraq-maps/ui';
import { type ReactElement, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '../strings';
import type { MapMode } from '../hooks/useMapStyle';

export interface MapStyleMenuProps {
  mode: MapMode;
  onModeChange: (mode: MapMode) => void;
}

const MODES: { key: MapMode; icon: string; labelKey: 'mapStyle.street' | 'mapStyle.satellite' | 'mapStyle.dark' }[] = [
  { key: 'street', icon: 'map', labelKey: 'mapStyle.street' },
  { key: 'satellite', icon: 'satellite', labelKey: 'mapStyle.satellite' },
  { key: 'dark', icon: 'dark_mode', labelKey: 'mapStyle.dark' },
];

/** Floating menu to pick between street, satellite and dark map styles. */
export function MapStyleMenu({ mode, onModeChange }: MapStyleMenuProps): ReactElement {
  const [open, setOpen] = useState(false);

  const current = MODES.find((m) => m.key === mode) ?? MODES[0]!;

  return (
    <View>
      <IconButton
        testID="map.style.toggle"
        icon={current.icon}
        accessibilityLabel={t('mapStyle.label')}
        onPress={() => setOpen((v) => !v)}
      />
      {open ? (
        <View style={styles.menu}>
          {MODES.map((item) => (
            <Pressable
              key={item.key}
              testID={`map.style.${item.key}`}
              style={[styles.item, item.key === mode && styles.itemActive]}
              onPress={() => {
                onModeChange(item.key);
                setOpen(false);
              }}
              accessibilityRole="menuitem"
              accessibilityLabel={t(item.labelKey)}
            >
              <Text style={[styles.itemText, item.key === mode && styles.itemTextActive]}>
                {t(item.labelKey)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    top: 44,
    end: 0,
    backgroundColor: '#fff',
    borderRadius: 8,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    minWidth: 140,
    overflow: 'hidden',
    zIndex: 200,
  },
  item: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  itemActive: { backgroundColor: '#E8F5E9' },
  itemText: { fontSize: 14, color: '#333' },
  itemTextActive: { color: '#1B5E20', fontWeight: '600' },
});
