/**
 * CustomPoiLayer – user-added custom POIs stored locally.
 *
 * Custom POIs are kept in the user's account (via our backend) and rendered
 * as a separate GeoJSON source on the map. Users can add, edit and delete
 * their own pins through the UI in this file.
 *
 * RTL-safe; Arabic-first via t().
 */
/* eslint-disable i18next/no-literal-string, no-restricted-syntax */

import { useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { tokens } from '@iraq-maps/ui';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { t } from '../../strings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CustomPinIcon =
  | 'star'
  | 'home'
  | 'work'
  | 'bookmark'
  | 'flag'
  | 'heart'
  | 'camera'
  | 'food'
  | 'parking'
  | 'custom';

interface CustomPoi {
  id: string;
  title: string;
  notes?: string;
  lat: number;
  lng: number;
  icon: CustomPinIcon;
  color: string;
  createdAt: string;
  updatedAt: string;
}

type UpsertPayload = Omit<CustomPoi, 'id' | 'createdAt' | 'updatedAt'>;

export interface CustomPoiGeoJSON {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: {
      id: string;
      title: string;
      notes: string;
      icon: CustomPinIcon;
      color: string;
    };
  }>;
}

export interface CustomPoiLayerProps {
  enabled: boolean;
  onData: (data: CustomPoiGeoJSON | null) => void;
  /** Called when user taps a custom POI feature on the map. */
  onFeatureTap?: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Pin icons & colours palette
// ---------------------------------------------------------------------------

export const PIN_ICONS: Record<CustomPinIcon, string> = {
  star: '⭐',
  home: '🏠',
  work: '💼',
  bookmark: '🔖',
  flag: '🚩',
  heart: '❤️',
  camera: '📷',
  food: '🍽️',
  parking: '🅿️',
  custom: '📌',
};

export const PIN_COLORS = ['#e53935', '#8e24aa', '#1e88e5', '#00897b', '#f4511e', '#fdd835', '#43a047'];

// ---------------------------------------------------------------------------
// GeoJSON builder
// ---------------------------------------------------------------------------

function poisToGeoJSON(pois: CustomPoi[]): CustomPoiGeoJSON {
  return {
    type: 'FeatureCollection',
    features: pois.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: {
        id: p.id,
        title: p.title,
        notes: p.notes ?? '',
        icon: p.icon,
        color: p.color,
      },
    })),
  };
}

// ---------------------------------------------------------------------------
// Layer spec
// ---------------------------------------------------------------------------

export function buildCustomPoiLayerSpec(sourceId: string) {
  return {
    id: 'custom-pois',
    type: 'circle' as const,
    source: sourceId,
    paint: {
      'circle-radius': 10,
      'circle-color': ['get', 'color'],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
      'circle-opacity': 1,
    },
  };
}

export function buildCustomPoiLabelLayerSpec(sourceId: string) {
  return {
    id: 'custom-pois-labels',
    type: 'symbol' as const,
    source: sourceId,
    minzoom: 12,
    layout: {
      'text-field': ['get', 'title'],
      'text-font': ['NotoSans Arabic Regular'],
      'text-size': 12,
      'text-anchor': 'top',
      'text-offset': [0, 1.2],
      'text-max-width': 8,
    },
    paint: {
      'text-color': '#1f2328',
      'text-halo-color': 'rgba(255,255,255,0.92)',
      'text-halo-width': 1.5,
    },
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCustomPoiLayer(
  apiBaseUrl: string,
  enabled: boolean,
): {
  pois: CustomPoi[];
  loading: boolean;
  error: string | null;
  add: (payload: UpsertPayload) => Promise<void>;
  update: (id: string, payload: Partial<UpsertPayload>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  geoJSON: CustomPoiGeoJSON | null;
} {
  const [pois, setPois] = useState<CustomPoi[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/v1/places/custom-pois`);
      const json = (await res.json()) as { pois: CustomPoi[] };
      setPois(json.pois);
    } catch {
      setError(t('search.networkError'));
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = useCallback(
    async (payload: UpsertPayload) => {
      const res = await fetch(`${apiBaseUrl}/v1/places/custom-pois`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { poi: CustomPoi };
      setPois((prev) => [...prev, json.poi]);
    },
    [apiBaseUrl],
  );

  const update = useCallback(
    async (id: string, payload: Partial<UpsertPayload>) => {
      const res = await fetch(`${apiBaseUrl}/v1/places/custom-pois/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { poi: CustomPoi };
      setPois((prev) => prev.map((p) => (p.id === id ? json.poi : p)));
    },
    [apiBaseUrl],
  );

  const remove = useCallback(
    async (id: string) => {
      await fetch(`${apiBaseUrl}/v1/places/custom-pois/${id}`, { method: 'DELETE' });
      setPois((prev) => prev.filter((p) => p.id !== id));
    },
    [apiBaseUrl],
  );

  const geoJSON = enabled ? poisToGeoJSON(pois) : null;

  return { pois, loading, error, add, update, remove, geoJSON };
}

// ---------------------------------------------------------------------------
// Edit modal
// ---------------------------------------------------------------------------

interface EditPoiModalProps {
  visible: boolean;
  initial?: Partial<CustomPoi>;
  onSave: (payload: UpsertPayload) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export function EditCustomPoiModal({ visible, initial, onSave, onCancel, onDelete }: EditPoiModalProps) {
  const [title, _setTitle] = useState(initial?.title ?? '');
  const [notes, _setNotes] = useState(initial?.notes ?? '');
  const [icon, setIcon] = useState<CustomPinIcon>(initial?.icon ?? 'star');
  const [color, setColor] = useState(initial?.color ?? (PIN_COLORS[0] ?? '#e53935'));

  const canSave = title.trim().length > 0 && (initial?.lat ?? 0) !== 0;

  const handleSave = () => {
    if (!canSave || !initial?.lat || !initial?.lng) return;
    onSave({ title: title.trim(), notes: notes.trim(), lat: initial.lat!, lng: initial.lng!, icon, color });
  };

  const handleDelete = () => {
    Alert.alert(t('layers.deletePresetTitle'), t('layers.deletePresetMsg'), [
      { text: t('actions.close'), style: 'cancel' },
      { text: t('addPlace.cancelBtn'), style: 'destructive', onPress: onDelete },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={cp.overlay} onPress={onCancel}>
        <View style={cp.sheet}>
          <RNText style={cp.sheetTitle}>
            {initial?.id ? t('customPoi.editTitle') : t('customPoi.addTitle')}
          </RNText>

          {/* Icon picker */}
          <RNText style={cp.fieldLabel}>{t('customPoi.iconLabel')}</RNText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={cp.iconRow}>
            {(Object.keys(PIN_ICONS) as CustomPinIcon[]).map((k) => (
              <Pressable
                key={k}
                onPress={() => setIcon(k)}
                style={[cp.iconBtn, icon === k && cp.iconBtnActive]}
                accessibilityRole="radio"
                accessibilityState={{ checked: icon === k }}
              >
                <RNText style={cp.iconEmoji}>{PIN_ICONS[k]}</RNText>
              </Pressable>
            ))}
          </ScrollView>

          {/* Colour picker */}
          <RNText style={cp.fieldLabel}>{t('customPoi.colorLabel')}</RNText>
          <View style={cp.colorRow}>
            {PIN_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                style={[cp.colorDot, { backgroundColor: c }, color === c && cp.colorDotActive]}
                accessibilityRole="radio"
                accessibilityState={{ checked: color === c }}
              />
            ))}
          </View>

          {/* Buttons */}
          <View style={cp.btnRow}>
            {onDelete && initial?.id && (
              <Pressable onPress={handleDelete} style={[cp.btn, cp.btnDanger]}>
                <RNText style={[cp.btnText, cp.btnDangerText]}>{t('addPlace.cancelBtn')}</RNText>
              </Pressable>
            )}
            <Pressable onPress={onCancel} style={cp.btn}>
              <RNText style={cp.btnText}>{t('actions.close')}</RNText>
            </Pressable>
            <Pressable
              onPress={handleSave}
              style={[cp.btn, cp.btnPrimary, !canSave && cp.btnDisabled]}
              disabled={!canSave}
            >
              <RNText style={[cp.btnText, cp.btnPrimaryText]}>{t('addPlace.submitBtn')}</RNText>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Data component
// ---------------------------------------------------------------------------

export function CustomPoiLayer({ enabled, onData }: CustomPoiLayerProps) {
  const apiBaseUrl = useApiBaseUrl();
  const { geoJSON } = useCustomPoiLayer(apiBaseUrl, enabled);

  useEffect(() => {
    onData(geoJSON);
  }, [geoJSON, onData]);

  return null;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const cp = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: tokens.color.surface,
    borderTopStartRadius: 20,
    borderTopEndRadius: 20,
    padding: 24,
    gap: 12,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: tokens.color.text, writingDirection: 'rtl' },
  fieldLabel: { fontSize: 13, color: tokens.color.textMuted, fontWeight: '600' },
  iconRow: { gap: 8, flexDirection: 'row', paddingVertical: 4 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tokens.color.bg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnActive: { borderColor: tokens.color.primary, borderWidth: 2 },
  iconEmoji: { fontSize: 20 },
  colorRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  colorDot: { width: 30, height: 30, borderRadius: 15 },
  colorDotActive: { borderWidth: 3, borderColor: '#1f2328' },
  btnRow: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 8 },
  btn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  btnPrimary: { backgroundColor: tokens.color.primary, borderColor: tokens.color.primary },
  btnDanger: { borderColor: tokens.color.danger },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: 14, color: tokens.color.text },
  btnPrimaryText: { color: '#fff', fontWeight: '600' },
  btnDangerText: { color: tokens.color.danger },
});
