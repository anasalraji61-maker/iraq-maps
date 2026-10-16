/**
 * MapLayersScreen – manage map layers: toggle, opacity, download for offline,
 * save custom combinations ("My Layers"), and view layer source/metadata.
 *
 * RTL-safe (start/end), Arabic-first via t().
 */
/* eslint-disable i18next/no-literal-string, no-restricted-syntax */

import { Button, tokens } from '@iraq-maps/ui';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text as RNText,
  View,
} from 'react-native';
import { t } from '../strings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LayerCategory = 'traffic' | 'places' | 'transit' | 'satellite' | 'terrain' | 'custom';

interface LayerDefinition {
  id: string;
  category: LayerCategory;
  nameKey: string;
  icon: string;
  descKey: string;
  source: string;
  supportsOpacity: boolean;
  supportsOffline: boolean;
  lastUpdated?: string;
}

interface LayerState {
  enabled: boolean;
  opacity: number; // 0–1
  downloading: boolean;
  downloaded: boolean;
  downloadProgress: number; // 0–100
}

interface SavedPreset {
  id: string;
  name: string;
  layers: Record<string, boolean>;
}

interface AppState {
  layerStates: Record<string, LayerState>;
  savedPresets: SavedPreset[];
  activePresetId: string | null;
  infoLayerId: string | null;
  addPresetVisible: boolean;
  newPresetName: string;
}

type Action =
  | { type: 'TOGGLE'; id: string }
  | { type: 'SET_OPACITY'; id: string; opacity: number }
  | { type: 'START_DOWNLOAD'; id: string }
  | { type: 'DOWNLOAD_PROGRESS'; id: string; progress: number }
  | { type: 'DOWNLOAD_DONE'; id: string }
  | { type: 'DELETE_OFFLINE'; id: string }
  | { type: 'SHOW_INFO'; id: string | null }
  | { type: 'SHOW_ADD_PRESET'; visible: boolean }
  | { type: 'SET_NEW_PRESET_NAME'; name: string }
  | { type: 'SAVE_PRESET'; name: string }
  | { type: 'DELETE_PRESET'; id: string }
  | { type: 'APPLY_PRESET'; id: string }
  | { type: 'INIT_LAYERS'; states: Record<string, LayerState> };

// ---------------------------------------------------------------------------
// Layer catalogue
// ---------------------------------------------------------------------------

const LAYER_DEFS: LayerDefinition[] = [
  // Traffic
  {
    id: 'traffic-flow',
    category: 'traffic',
    nameKey: 'layers.trafficFlow',
    icon: '🚦',
    descKey: 'layers.trafficFlowDesc',
    source: t('layers.sourceBackend'),
    supportsOpacity: true,
    supportsOffline: false,
  },
  {
    id: 'traffic-incidents',
    category: 'traffic',
    nameKey: 'layers.trafficIncidents',
    icon: '⚠️',
    descKey: 'layers.trafficIncidentsDesc',
    source: t('layers.sourceBackend'),
    supportsOpacity: false,
    supportsOffline: false,
  },
  // Places
  {
    id: 'poi-restaurants',
    category: 'places',
    nameKey: 'layers.restaurants',
    icon: '🍽️',
    descKey: 'layers.restaurantsDesc',
    source: t('layers.sourceOsm'),
    supportsOpacity: false,
    supportsOffline: true,
  },
  {
    id: 'poi-healthcare',
    category: 'places',
    nameKey: 'layers.healthcare',
    icon: '🏥',
    descKey: 'layers.healthcareDesc',
    source: t('layers.sourceOsm'),
    supportsOpacity: false,
    supportsOffline: true,
  },
  {
    id: 'poi-fuel',
    category: 'places',
    nameKey: 'layers.fuel',
    icon: '⛽',
    descKey: 'layers.fuelDesc',
    source: t('layers.sourceOsm'),
    supportsOpacity: false,
    supportsOffline: true,
  },
  {
    id: 'poi-banks',
    category: 'places',
    nameKey: 'layers.banks',
    icon: '🏦',
    descKey: 'layers.banksDesc',
    source: t('layers.sourceOsm'),
    supportsOpacity: false,
    supportsOffline: true,
  },
  {
    id: 'poi-education',
    category: 'places',
    nameKey: 'layers.education',
    icon: '🏫',
    descKey: 'layers.educationDesc',
    source: t('layers.sourceOsm'),
    supportsOpacity: false,
    supportsOffline: true,
  },
  {
    id: 'poi-worship',
    category: 'places',
    nameKey: 'layers.worship',
    icon: '🕌',
    descKey: 'layers.worshipDesc',
    source: t('layers.sourceOsm'),
    supportsOpacity: false,
    supportsOffline: true,
  },
  // Public transit
  {
    id: 'transit-bus',
    category: 'transit',
    nameKey: 'layers.transitBus',
    icon: '🚌',
    descKey: 'layers.transitBusDesc',
    source: t('layers.sourceBackend'),
    supportsOpacity: true,
    supportsOffline: false,
  },
  {
    id: 'transit-stops',
    category: 'transit',
    nameKey: 'layers.transitStops',
    icon: '🚏',
    descKey: 'layers.transitStopsDesc',
    source: t('layers.sourceBackend'),
    supportsOpacity: false,
    supportsOffline: true,
  },
  // Satellite
  {
    id: 'satellite-imagery',
    category: 'satellite',
    nameKey: 'layers.satellite',
    icon: '🛰️',
    descKey: 'layers.satelliteDesc',
    source: t('layers.sourceSatellite'),
    supportsOpacity: true,
    supportsOffline: true,
  },
  // Terrain
  {
    id: 'terrain-hillshade',
    category: 'terrain',
    nameKey: 'layers.hillshade',
    icon: '⛰️',
    descKey: 'layers.hillshadeDesc',
    source: t('layers.sourceOsm'),
    supportsOpacity: true,
    supportsOffline: false,
  },
  {
    id: 'terrain-contours',
    category: 'terrain',
    nameKey: 'layers.contours',
    icon: '📏',
    descKey: 'layers.contoursDesc',
    source: t('layers.sourceOsm'),
    supportsOpacity: true,
    supportsOffline: false,
  },
  // Custom
  {
    id: 'custom-pois',
    category: 'custom',
    nameKey: 'layers.customPois',
    icon: '📌',
    descKey: 'layers.customPoisDesc',
    source: t('layers.sourceUser'),
    supportsOpacity: false,
    supportsOffline: true,
  },
];

const CATEGORY_ORDER: LayerCategory[] = ['traffic', 'places', 'transit', 'satellite', 'terrain', 'custom'];

const CATEGORY_ICONS: Record<LayerCategory, string> = {
  traffic: '🚗',
  places: '📍',
  transit: '🚌',
  satellite: '🛰️',
  terrain: '🏔️',
  custom: '🔧',
};

const CATEGORY_NAME_KEYS: Record<LayerCategory, string> = {
  traffic: 'layers.catTraffic',
  places: 'layers.catPlaces',
  transit: 'layers.catTransit',
  satellite: 'layers.catSatellite',
  terrain: 'layers.catTerrain',
  custom: 'layers.catCustom',
};

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function buildInitialLayerStates(): Record<string, LayerState> {
  return Object.fromEntries(
    LAYER_DEFS.map((d) => [
      d.id,
      { enabled: false, opacity: 1, downloading: false, downloaded: false, downloadProgress: 0 },
    ]),
  );
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'INIT_LAYERS':
      return { ...state, layerStates: action.states };
    case 'TOGGLE': {
      const prev = state.layerStates[action.id];
      if (!prev) return state;
      return {
        ...state,
        layerStates: { ...state.layerStates, [action.id]: { ...prev, enabled: !prev.enabled } },
        activePresetId: null,
      };
    }
    case 'SET_OPACITY': {
      const prev = state.layerStates[action.id];
      if (!prev) return state;
      return {
        ...state,
        layerStates: { ...state.layerStates, [action.id]: { ...prev, opacity: action.opacity } },
      };
    }
    case 'START_DOWNLOAD': {
      const prev = state.layerStates[action.id];
      if (!prev) return state;
      return {
        ...state,
        layerStates: { ...state.layerStates, [action.id]: { ...prev, downloading: true, downloadProgress: 0 } },
      };
    }
    case 'DOWNLOAD_PROGRESS': {
      const prev = state.layerStates[action.id];
      if (!prev) return state;
      return {
        ...state,
        layerStates: { ...state.layerStates, [action.id]: { ...prev, downloadProgress: action.progress } },
      };
    }
    case 'DOWNLOAD_DONE': {
      const prev = state.layerStates[action.id];
      if (!prev) return state;
      return {
        ...state,
        layerStates: {
          ...state.layerStates,
          [action.id]: { ...prev, downloading: false, downloaded: true, downloadProgress: 100 },
        },
      };
    }
    case 'DELETE_OFFLINE': {
      const prev = state.layerStates[action.id];
      if (!prev) return state;
      return {
        ...state,
        layerStates: {
          ...state.layerStates,
          [action.id]: { ...prev, downloaded: false, downloadProgress: 0 },
        },
      };
    }
    case 'SHOW_INFO':
      return { ...state, infoLayerId: action.id };
    case 'SHOW_ADD_PRESET':
      return { ...state, addPresetVisible: action.visible, newPresetName: '' };
    case 'SET_NEW_PRESET_NAME':
      return { ...state, newPresetName: action.name };
    case 'SAVE_PRESET': {
      const layers = Object.fromEntries(
        Object.entries(state.layerStates).map(([id, s]) => [id, s.enabled]),
      );
      const preset: SavedPreset = {
        id: `preset-${Date.now()}`,
        name: action.name,
        layers,
      };
      return {
        ...state,
        savedPresets: [...state.savedPresets, preset],
        activePresetId: preset.id,
        addPresetVisible: false,
      };
    }
    case 'DELETE_PRESET':
      return {
        ...state,
        savedPresets: state.savedPresets.filter((p) => p.id !== action.id),
        activePresetId: state.activePresetId === action.id ? null : state.activePresetId,
      };
    case 'APPLY_PRESET': {
      const preset = state.savedPresets.find((p) => p.id === action.id);
      if (!preset) return state;
      const layerStates = { ...state.layerStates };
      for (const [id, enabled] of Object.entries(preset.layers)) {
        if (layerStates[id]) layerStates[id] = { ...layerStates[id], enabled };
      }
      return { ...state, layerStates, activePresetId: action.id };
    }
    default:
      return state;
  }
}

const initialState: AppState = {
  layerStates: buildInitialLayerStates(),
  savedPresets: [],
  activePresetId: null,
  infoLayerId: null,
  addPresetVisible: false,
  newPresetName: '',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface OpacitySliderProps {
  value: number;
  onChange: (v: number) => void;
}

function OpacitySlider({ value, onChange }: OpacitySliderProps) {
  const steps = [0, 0.25, 0.5, 0.75, 1];
  return (
    <View style={sl.sliderRow} accessibilityLabel={t('layers.opacityA11y')}>
      <RNText style={sl.sliderLabel}>{t('layers.opacity')}</RNText>
      <View style={sl.sliderTrack}>
        {steps.map((step) => (
          <Pressable
            key={step}
            onPress={() => onChange(step)}
            style={[sl.sliderDot, value >= step && sl.sliderDotActive]}
            accessibilityRole="radio"
            accessibilityState={{ checked: Math.abs(value - step) < 0.01 }}
          />
        ))}
        <View style={[sl.sliderFill, { width: `${value * 100}%` as unknown as number }]} />
      </View>
      <RNText style={sl.sliderValue}>{Math.round(value * 100)}%</RNText>
    </View>
  );
}

interface LayerRowProps {
  def: LayerDefinition;
  state: LayerState;
  onToggle: () => void;
  onOpacity: (v: number) => void;
  onDownload: () => void;
  onDeleteOffline: () => void;
  onInfo: () => void;
}

function LayerRow({ def, state, onToggle, onOpacity, onDownload, onDeleteOffline, onInfo }: LayerRowProps) {
  return (
    <View style={sl.layerCard}>
      <View style={sl.layerHeader}>
        <RNText style={sl.layerIcon}>{def.icon}</RNText>
        <View style={sl.layerMeta}>
          <RNText style={sl.layerName}>{t(def.nameKey as Parameters<typeof t>[0])}</RNText>
        </View>
        <Pressable onPress={onInfo} style={sl.infoBtn} accessibilityLabel={t('layers.infoA11y')}>
          <RNText style={sl.infoBtnText}>ℹ️</RNText>
        </Pressable>
        <Switch
          value={state.enabled}
          onValueChange={onToggle}
          trackColor={{ false: tokens.color.border, true: tokens.color.primary }}
          accessibilityLabel={t(def.nameKey as Parameters<typeof t>[0])}
        />
      </View>

      {state.enabled && def.supportsOpacity && (
        <OpacitySlider value={state.opacity} onChange={onOpacity} />
      )}

      {def.supportsOffline && (
        <View style={sl.offlineRow}>
          {state.downloading ? (
            <View style={sl.progressRow}>
              <ActivityIndicator size="small" color={tokens.color.primary} />
              <RNText style={sl.progressText}>{state.downloadProgress}%</RNText>
            </View>
          ) : state.downloaded ? (
            <View style={sl.downloadedRow}>
              <RNText style={sl.downloadedBadge}>{t('layers.downloaded')}</RNText>
              <Pressable onPress={onDeleteOffline} accessibilityLabel={t('layers.deleteOfflineA11y')}>
                <RNText style={sl.deleteOfflineText}>{t('layers.deleteOffline')}</RNText>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={onDownload} style={sl.downloadBtn}>
              <RNText style={sl.downloadBtnText}>{t('layers.downloadOffline')}</RNText>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function MapLayersScreen() {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [selectedCategory, setSelectedCategory] = useState<LayerCategory>('traffic');
  const downloadTimersRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  // Simulate layer download with progress ticks
  const startDownload = useCallback(
    (id: string) => {
      dispatch({ type: 'START_DOWNLOAD', id });
      let progress = 0;
      const timer = setInterval(() => {
        progress += Math.floor(Math.random() * 15) + 5;
        if (progress >= 100) {
          clearInterval(downloadTimersRef.current[id]);
          dispatch({ type: 'DOWNLOAD_DONE', id });
        } else {
          dispatch({ type: 'DOWNLOAD_PROGRESS', id, progress });
        }
      }, 300);
      downloadTimersRef.current[id] = timer;
    },
    [],
  );

  useEffect(() => {
    return () => {
      for (const timer of Object.values(downloadTimersRef.current)) clearInterval(timer);
    };
  }, []);

  const handleDeleteOffline = (id: string) => {
    Alert.alert(t('layers.deleteOfflineTitle'), t('layers.deleteOfflineMsg'), [
      { text: t('actions.close'), style: 'cancel' },
      {
        text: t('layers.deleteOffline'),
        style: 'destructive',
        onPress: () => dispatch({ type: 'DELETE_OFFLINE', id }),
      },
    ]);
  };

  const handleSavePreset = () => {
    if (!state.newPresetName.trim()) return;
    dispatch({ type: 'SAVE_PRESET', name: state.newPresetName.trim() });
  };

  const handleDeletePreset = (id: string) => {
    Alert.alert(t('layers.deletePresetTitle'), t('layers.deletePresetMsg'), [
      { text: t('actions.close'), style: 'cancel' },
      {
        text: t('layers.deletePreset'),
        style: 'destructive',
        onPress: () => dispatch({ type: 'DELETE_PRESET', id }),
      },
    ]);
  };

  const infoLayer = state.infoLayerId ? LAYER_DEFS.find((d) => d.id === state.infoLayerId) : null;
  const filteredLayers = LAYER_DEFS.filter((d) => d.category === selectedCategory);

  return (
    <View style={sl.container}>
      {/* Header */}
      <View style={sl.header}>
        <Pressable onPress={() => router.back()} style={sl.backBtn} accessibilityLabel={t('search.backBtn')}>
          <RNText style={sl.backBtnText}>‹</RNText>
        </Pressable>
        <RNText style={sl.title}>{t('layers.title')}</RNText>
      </View>

      {/* Category tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={sl.catScroll}
        style={sl.catScrollContainer}
      >
        {CATEGORY_ORDER.map((cat) => (
          <Pressable
            key={cat}
            onPress={() => setSelectedCategory(cat)}
            style={[sl.catChip, selectedCategory === cat && sl.catChipActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: selectedCategory === cat }}
          >
            <RNText style={sl.catChipIcon}>{CATEGORY_ICONS[cat]}</RNText>
            <RNText style={[sl.catChipText, selectedCategory === cat && sl.catChipTextActive]}>
              {t(CATEGORY_NAME_KEYS[cat] as Parameters<typeof t>[0])}
            </RNText>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView style={sl.scroll} contentContainerStyle={sl.scrollContent}>
        {/* My Layers presets */}
        {state.savedPresets.length > 0 && (
          <View style={sl.presetsSection}>
            <RNText style={sl.sectionTitle}>{t('layers.myLayers')}</RNText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={sl.presetsRow}>
              {state.savedPresets.map((preset) => (
                <View key={preset.id} style={sl.presetChipWrap}>
                  <Pressable
                    onPress={() => dispatch({ type: 'APPLY_PRESET', id: preset.id })}
                    style={[sl.presetChip, state.activePresetId === preset.id && sl.presetChipActive]}
                    accessibilityRole="button"
                  >
                    <RNText
                      style={[
                        sl.presetChipText,
                        state.activePresetId === preset.id && sl.presetChipTextActive,
                      ]}
                    >
                      {preset.name}
                    </RNText>
                  </Pressable>
                  <Pressable
                    onPress={() => handleDeletePreset(preset.id)}
                    style={sl.presetDelete}
                    accessibilityLabel={t('layers.deletePresetA11y')}
                  >
                    <RNText style={sl.presetDeleteText}>✕</RNText>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Save current as preset */}
        <Pressable
          onPress={() => dispatch({ type: 'SHOW_ADD_PRESET', visible: true })}
          style={sl.savePresetBtn}
          accessibilityRole="button"
        >
          <RNText style={sl.savePresetBtnText}>{t('layers.saveAsPreset')}</RNText>
        </Pressable>

        {/* Layer rows for selected category */}
        <RNText style={sl.sectionTitle}>
          {CATEGORY_ICONS[selectedCategory]} {t(CATEGORY_NAME_KEYS[selectedCategory] as Parameters<typeof t>[0])}
        </RNText>

        {filteredLayers.map((def) => {
          const layerState = state.layerStates[def.id] ?? {
            enabled: false,
            opacity: 1,
            downloading: false,
            downloaded: false,
            downloadProgress: 0,
          };
          return (
            <LayerRow
              key={def.id}
              def={def}
              state={layerState}
              onToggle={() => dispatch({ type: 'TOGGLE', id: def.id })}
              onOpacity={(opacity) => dispatch({ type: 'SET_OPACITY', id: def.id, opacity })}
              onDownload={() => startDownload(def.id)}
              onDeleteOffline={() => handleDeleteOffline(def.id)}
              onInfo={() => dispatch({ type: 'SHOW_INFO', id: def.id })}
            />
          );
        })}

        <View style={sl.bottomPad} />
      </ScrollView>

      {/* Layer info modal */}
      <Modal
        visible={state.infoLayerId !== null}
        transparent
        animationType="slide"
        onRequestClose={() => dispatch({ type: 'SHOW_INFO', id: null })}
      >
        <Pressable style={sl.modalOverlay} onPress={() => dispatch({ type: 'SHOW_INFO', id: null })}>
          <View style={sl.infoSheet}>
            {infoLayer && (
              <>
                <RNText style={sl.infoTitle}>
                  {infoLayer.icon} {t(infoLayer.nameKey as Parameters<typeof t>[0])}
                </RNText>
                <RNText style={sl.infoDesc}>{t(infoLayer.descKey as Parameters<typeof t>[0])}</RNText>
                <View style={sl.infoRow}>
                  <RNText style={sl.infoRowLabel}>{t('layers.infoSource')}</RNText>
                  <RNText style={sl.infoRowValue}>{infoLayer.source}</RNText>
                </View>
                {infoLayer.lastUpdated && (
                  <View style={sl.infoRow}>
                    <RNText style={sl.infoRowLabel}>{t('layers.infoLastUpdated')}</RNText>
                    <RNText style={sl.infoRowValue}>{infoLayer.lastUpdated}</RNText>
                  </View>
                )}
                <View style={sl.infoRow}>
                  <RNText style={sl.infoRowLabel}>{t('layers.infoOffline')}</RNText>
                  <RNText style={sl.infoRowValue}>
                    {infoLayer.supportsOffline ? t('layers.yes') : t('layers.no')}
                  </RNText>
                </View>
              </>
            )}
            <Button label={t('actions.close')} onPress={() => dispatch({ type: 'SHOW_INFO', id: null })} />
          </View>
        </Pressable>
      </Modal>

      {/* Add preset modal */}
      <Modal
        visible={state.addPresetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => dispatch({ type: 'SHOW_ADD_PRESET', visible: false })}
      >
        <Pressable
          style={sl.modalOverlay}
          onPress={() => dispatch({ type: 'SHOW_ADD_PRESET', visible: false })}
        >
          <View style={sl.infoSheet}>
            <RNText style={sl.infoTitle}>{t('layers.savePresetTitle')}</RNText>
            <View style={sl.presetInputWrap}>
              <RNText style={sl.presetInputLabel}>{t('layers.presetNameLabel')}</RNText>
            </View>
            <View style={sl.presetBtnRow}>
              <Button
                label={t('actions.close')}
                onPress={() => dispatch({ type: 'SHOW_ADD_PRESET', visible: false })}
              />
              <Button label={t('layers.savePreset')} onPress={handleSavePreset} />
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const sl = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  backBtn: { marginEnd: 12, padding: 4 },
  backBtnText: { fontSize: 24, color: tokens.color.primary },
  title: { fontSize: 18, fontWeight: '700', color: tokens.color.text, writingDirection: 'rtl' },
  catScrollContainer: { maxHeight: 56, backgroundColor: tokens.color.surface },
  catScroll: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    flexDirection: 'row',
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: tokens.color.bg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    gap: 4,
  },
  catChipActive: {
    backgroundColor: tokens.color.primary,
    borderColor: tokens.color.primary,
  },
  catChipIcon: { fontSize: 14 },
  catChipText: { fontSize: 13, color: tokens.color.textMuted },
  catChipTextActive: { color: '#fff', fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },
  presetsSection: { marginBottom: 4 },
  presetsRow: { gap: 8, flexDirection: 'row', paddingVertical: 4 },
  presetChipWrap: { flexDirection: 'row', alignItems: 'center' },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: tokens.color.bg,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  presetChipActive: { backgroundColor: tokens.color.primary, borderColor: tokens.color.primary },
  presetChipText: { fontSize: 13, color: tokens.color.text },
  presetChipTextActive: { color: '#fff', fontWeight: '600' },
  presetDelete: { marginStart: 4, padding: 4 },
  presetDeleteText: { fontSize: 11, color: tokens.color.textMuted },
  savePresetBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: tokens.color.primary,
    marginBottom: 4,
  },
  savePresetBtnText: { fontSize: 13, color: tokens.color.primary, fontWeight: '600' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: tokens.color.textMuted, marginBottom: 8 },
  layerCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  layerHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  layerIcon: { fontSize: 22 },
  layerMeta: { flex: 1 },
  layerName: { fontSize: 15, fontWeight: '600', color: tokens.color.text, writingDirection: 'rtl' },
  infoBtn: { padding: 4 },
  infoBtnText: { fontSize: 16 },
  sliderRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 },
  sliderLabel: { fontSize: 12, color: tokens.color.textMuted, minWidth: 50 },
  sliderTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.color.border,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  sliderDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: tokens.color.border,
    position: 'absolute',
    zIndex: 1,
  },
  sliderDotActive: { backgroundColor: tokens.color.primary },
  sliderFill: {
    position: 'absolute',
    top: 0,
    start: 0,
    height: '100%',
    backgroundColor: tokens.color.primary,
    opacity: 0.4,
  },
  sliderValue: { fontSize: 12, color: tokens.color.textMuted, minWidth: 36, textAlign: 'center' },
  offlineRow: { marginTop: 10 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressText: { fontSize: 13, color: tokens.color.textMuted },
  downloadedRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  downloadedBadge: {
    fontSize: 12,
    color: '#2e7d32',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  deleteOfflineText: { fontSize: 12, color: tokens.color.danger },
  downloadBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: tokens.color.primary,
  },
  downloadBtnText: { fontSize: 12, color: tokens.color.primary },
  bottomPad: { height: 40 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  infoSheet: {
    backgroundColor: tokens.color.surface,
    borderTopStartRadius: 20,
    borderTopEndRadius: 20,
    padding: 24,
    gap: 12,
  },
  infoTitle: { fontSize: 17, fontWeight: '700', color: tokens.color.text, writingDirection: 'rtl' },
  infoDesc: { fontSize: 14, color: tokens.color.textMuted, lineHeight: 20, writingDirection: 'rtl' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: tokens.color.border },
  infoRowLabel: { fontSize: 13, color: tokens.color.textMuted },
  infoRowValue: { fontSize: 13, color: tokens.color.text, fontWeight: '600' },
  presetInputWrap: { marginVertical: 4 },
  presetInputLabel: { fontSize: 14, color: tokens.color.textMuted, marginBottom: 4 },
  presetBtnRow: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
});
