/**
 * AccessibilityLayer – MapLibre layer set for wheelchair/accessibility overlays.
 *
 * Features:
 *  - Highlights wheelchair-accessible routes in a distinct colour.
 *  - Markers for accessible entrances (ramp, lift, step-free).
 *  - "Accessible places only" filter that hides inaccessible POIs.
 *  - A floating legend card describing the accessibility symbology.
 *  - Settings persisted to AsyncStorage under ACCESSIBILITY_SETTINGS_KEY.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ACCESSIBILITY_SETTINGS_KEY = '@iraq-maps/accessibility-settings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AccessibilitySettings {
  /** Show the wheelchair-route highlight layer. */
  showWheelchairRoutes: boolean;
  /** Show accessible-entrance markers. */
  showAccessibleEntrances: boolean;
  /** Hide POIs that are not marked wheelchair-accessible. */
  filterAccessibleOnly: boolean;
  /** Show the floating legend. */
  showLegend: boolean;
}

export interface AccessibilityLayerProps {
  /** MapLibre map ref (passed through so layer logic can reference it). */
  mapRef?: React.RefObject<{ setFilter?: (layer: string, filter: unknown) => void }>;
  /** Callback fired whenever settings change. */
  onSettingsChange?: (settings: AccessibilitySettings) => void;
  /** Override initial settings (merged with persisted values). */
  initialSettings?: Partial<AccessibilitySettings>;
}

// MapLibre layer spec shapes (minimal, avoids hard dep on ml-js in this kit)
export interface LayerSpec {
  id: string;
  type: string;
  source?: string;
  'source-layer'?: string;
  filter?: unknown[];
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  minzoom?: number;
  maxzoom?: number;
}

// ---------------------------------------------------------------------------
// Default settings
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS: AccessibilitySettings = {
  showWheelchairRoutes: true,
  showAccessibleEntrances: true,
  filterAccessibleOnly: false,
  showLegend: false,
};

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

async function loadSettings(): Promise<AccessibilitySettings> {
  try {
    const raw = await AsyncStorage.getItem(ACCESSIBILITY_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AccessibilitySettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

async function saveSettings(settings: AccessibilitySettings): Promise<void> {
  try {
    await AsyncStorage.setItem(ACCESSIBILITY_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // best effort
  }
}

// ---------------------------------------------------------------------------
// Layer definitions
// ---------------------------------------------------------------------------

/**
 * Returns MapLibre layer specs for the accessibility overlay.
 * These are intended to be added to the map after the base style loads.
 */
export function buildAccessibilityLayers(settings: AccessibilitySettings): LayerSpec[] {
  const layers: LayerSpec[] = [];

  // ── Wheelchair-accessible route highlight ──────────────────────────────
  if (settings.showWheelchairRoutes) {
    layers.push({
      id: 'wheelchair-routes-casing',
      type: 'line',
      source: 'city',
      'source-layer': 'transportation',
      filter: ['==', ['get', 'wheelchair'], 'yes'],
      paint: {
        'line-color': '#0ea5e9',
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 4, 16, 10],
        'line-opacity': 0.3,
        'line-gap-width': 0,
      },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      minzoom: 13,
    });

    layers.push({
      id: 'wheelchair-routes',
      type: 'line',
      source: 'city',
      'source-layer': 'transportation',
      filter: ['==', ['get', 'wheelchair'], 'yes'],
      paint: {
        'line-color': '#0284c7',
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2, 16, 5],
        'line-dasharray': [2, 1],
      },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      minzoom: 13,
    });
  }

  // ── Accessible entrance highlight circles ─────────────────────────────
  if (settings.showAccessibleEntrances) {
    layers.push({
      id: 'accessible-entrances',
      type: 'circle',
      source: 'city',
      'source-layer': 'poi',
      filter: [
        'any',
        ['==', ['get', 'wheelchair'], 'yes'],
        ['==', ['get', 'entrance'], 'yes'],
        ['==', ['get', 'ramp'], 'yes'],
      ],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 4, 17, 10],
        'circle-color': '#22c55e',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
        'circle-opacity': 0.85,
      },
      minzoom: 14,
    });
  }

  // ── "Accessible only" filter: dim inaccessible POIs ───────────────────
  if (settings.filterAccessibleOnly) {
    layers.push({
      id: 'inaccessible-poi-dim',
      type: 'circle',
      source: 'city',
      'source-layer': 'poi',
      filter: [
        'any',
        ['==', ['get', 'wheelchair'], 'no'],
        ['==', ['get', 'wheelchair'], 'limited'],
        ['!', ['has', 'wheelchair']],
      ],
      paint: {
        'circle-radius': 0,
        'circle-color': 'transparent',
        'circle-opacity': 0,
      },
      minzoom: 12,
    });
  }

  return layers;
}

/**
 * Returns the MapLibre filter expression that hides inaccessible POIs.
 * Apply this to existing POI layers when filterAccessibleOnly is active.
 */
export function buildAccessiblePoiFilter(): unknown[] {
  return [
    'any',
    ['==', ['get', 'wheelchair'], 'yes'],
    ['==', ['get', 'wheelchair'], 'designated'],
  ];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * React hook that manages accessibility settings and returns derived layer specs.
 * Persists settings to AsyncStorage on every change.
 */
export function useAccessibilityLayer(
  onSettingsChange?: (s: AccessibilitySettings) => void,
  initialOverrides?: Partial<AccessibilitySettings>,
) {
  const [settings, setSettings] = useState<AccessibilitySettings>({
    ...DEFAULT_SETTINGS,
    ...initialOverrides,
  });
  const [loaded, setLoaded] = useState(false);

  // Load persisted settings on mount
  useEffect(() => {
    loadSettings().then((persisted) => {
      setSettings({ ...persisted, ...initialOverrides });
      setLoaded(true);
    });
  }, []);

  const updateSettings = useCallback(
    async (patch: Partial<AccessibilitySettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        void saveSettings(next);
        onSettingsChange?.(next);
        return next;
      });
    },
    [onSettingsChange],
  );

  const layers = useMemo(
    () => (loaded ? buildAccessibilityLayers(settings) : []),
    [settings, loaded],
  );

  return { settings, updateSettings, layers, loaded };
}

// ---------------------------------------------------------------------------
// AccessibilityControls component
// ---------------------------------------------------------------------------

/**
 * A control panel (floating card) that lets the user toggle accessibility layers.
 * Place it on top of the MapCanvas inside an absolute-positioned container.
 */
export function AccessibilityControls({
  mapRef,
  onSettingsChange,
  initialSettings,
}: AccessibilityLayerProps): ReactElement {
  const { settings, updateSettings } = useAccessibilityLayer(
    onSettingsChange,
    initialSettings,
  );

  return (
    <View style={styles.panel} accessibilityRole="none">
      <Text style={styles.panelTitle}>إمكانية الوصول</Text>

      <ToggleRow
        label="مسارات الكراسي المتحركة"
        value={settings.showWheelchairRoutes}
        onToggle={(v) => {
          void updateSettings({ showWheelchairRoutes: v });
          // Optionally hide/show the layer on the map ref
          void mapRef;
        }}
      />
      <ToggleRow
        label="مداخل الوصول"
        value={settings.showAccessibleEntrances}
        onToggle={(v) => void updateSettings({ showAccessibleEntrances: v })}
      />
      <ToggleRow
        label="الأماكن المتاحة فقط"
        value={settings.filterAccessibleOnly}
        onToggle={(v) => void updateSettings({ filterAccessibleOnly: v })}
      />
      <ToggleRow
        label="إظهار وسيلة الإيضاح"
        value={settings.showLegend}
        onToggle={(v) => void updateSettings({ showLegend: v })}
      />

      {settings.showLegend && <AccessibilityLegend />}
    </View>
  );
}

// ---------------------------------------------------------------------------
// AccessibilityLegend component
// ---------------------------------------------------------------------------

/**
 * A compact floating legend describing the accessibility colour coding.
 */
export function AccessibilityLegend(): ReactElement {
  const items = [
    { color: '#0284c7', label: 'مسار متاح لذوي الاحتياجات الخاصة', dashed: true },
    { color: '#22c55e', label: 'مدخل بدون عتبة / رامب' },
    { color: '#f59e0b', label: 'وصول محدود' },
    { color: '#ef4444', label: 'غير متاح' },
  ];

  return (
    <View style={styles.legend}>
      <Text style={styles.legendTitle}>دليل الألوان</Text>
      <ScrollView>
        {items.map((item) => (
          <View key={item.label} style={styles.legendRow}>
            <View
              style={[
                styles.legendSwatch,
                { backgroundColor: item.color },
                item.dashed && styles.legendSwatchDashed,
              ]}
            />
            <Text style={styles.legendLabel}>{item.label}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// ToggleRow
// ---------------------------------------------------------------------------

interface ToggleRowProps {
  label: string;
  value: boolean;
  onToggle: (v: boolean) => void;
}

function ToggleRow({ label, value, onToggle }: ToggleRowProps): ReactElement {
  return (
    <Pressable
      onPress={() => onToggle(!value)}
      style={styles.toggleRow}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
    >
      <Text style={styles.toggleLabel}>{label}</Text>
      <View style={[styles.toggleTrack, value && styles.toggleTrackOn]}>
        <View style={[styles.toggleThumb, value && styles.toggleThumbOn]} />
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  panel: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12,
    padding: 12,
    minWidth: 240,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  panelTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
    textAlign: 'right',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    gap: 8,
  },
  toggleLabel: {
    fontSize: 13,
    color: '#374151',
    flex: 1,
    textAlign: 'right',
  },
  toggleTrack: {
    width: 40,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#d1d5db',
    justifyContent: 'center',
    padding: 2,
  },
  toggleTrackOn: {
    backgroundColor: '#0284c7',
  },
  toggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
  },
  toggleThumbOn: {
    alignSelf: 'flex-end',
  },
  legend: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  legendTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 6,
    textAlign: 'right',
  },
  legendRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  legendSwatch: {
    width: 20,
    height: 6,
    borderRadius: 3,
  },
  legendSwatchDashed: {
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  legendLabel: {
    fontSize: 12,
    color: '#374151',
    flex: 1,
    textAlign: 'right',
  },
});
