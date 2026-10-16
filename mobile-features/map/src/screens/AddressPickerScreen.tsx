/**
 * AddressPickerScreen — full address picker with:
 *   - Draggable pin map view (reverse geocodes on pin drop)
 *   - Reverse geocode result display
 *   - Manual address entry form (governorate → district → neighbourhood → street → building)
 *   - Nearby landmark freeform input
 *   - Coordinates display toggle
 *   - "Use my location" button
 *   - Save address with name (Home / Work / Other)
 *
 * Route: address/pick
 * Strings: map namespace, keys under `addressPicker`.
 */
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  I18nManager,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Screen } from '@iraq-maps/ui';
import { useApi } from '@iraq-maps/mobile-kit';
import type {
  AddressComponent,
  AddressSuggestion,
  IraqAdminDivision,
  IraqGovernorateId,
  ReverseGeocodeResult,
} from '@iraq-maps/contracts';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
  primary: '#1976D2',
  primaryLight: '#E3F2FD',
  surface: '#FFFFFF',
  bg: '#F5F5F5',
  text: '#1A1A1A',
  textSecondary: '#666666',
  textHint: '#9E9E9E',
  border: '#E0E0E0',
  danger: '#C62828',
  success: '#2E7D32',
  separator: '#EEEEEE',
  pin: '#E53935',
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

interface SavedAddressLabel {
  type: 'home' | 'work' | 'other';
  customName?: string;
}

interface PickerState {
  lat: number;
  lng: number;
  reverseResult: ReverseGeocodeResult | null;
  loadingReverse: boolean;
  // Manual form
  governorateId: IraqGovernorateId | '';
  governorateName: string;
  district: string;
  neighborhood: string;
  street: string;
  building: string;
  landmark: string;
  // UI
  showCoords: boolean;
  showSaveModal: boolean;
  label: SavedAddressLabel;
  saveName: string;
  autocompleteStreet: AddressSuggestion[];
  loadingAutocomplete: boolean;
  divisions: IraqAdminDivision[];
  loadingDivisions: boolean;
  activeTab: 'map' | 'form';
}

const INITIAL_LAT = 33.3152;
const INITIAL_LNG = 44.3661;

// ── MapPinView (placeholder until MapLibre is wired) ──────────────────────────
function MapPinView({
  lat,
  lng,
  onPinMoved,
}: {
  lat: number;
  lng: number;
  onPinMoved: (lat: number, lng: number) => void;
}): ReactElement {
  return (
    <View style={mapStyles.container}>
      {/* Placeholder: in production replace with MapLibre map + draggable symbol layer */}
      <View style={mapStyles.placeholder}>
        <Text style={mapStyles.placeholderText}>{t('addressPicker.mapPlaceholder')}</Text>
        <Text style={mapStyles.coordText}>
          {lat.toFixed(6)}, {lng.toFixed(6)}
        </Text>
        <View style={mapStyles.pin} />
        {/* Tap zones to simulate pin movement in dev */}
        <View style={mapStyles.tapRow}>
          <Pressable
            style={mapStyles.tapBtn}
            onPress={() => onPinMoved(lat + 0.001, lng)}
            accessibilityLabel="move pin north"
          >
            <Text style={mapStyles.tapBtnText}>↑</Text>
          </Pressable>
          <Pressable
            style={mapStyles.tapBtn}
            onPress={() => onPinMoved(lat, lng - 0.001)}
            accessibilityLabel="move pin west"
          >
            <Text style={mapStyles.tapBtnText}>←</Text>
          </Pressable>
          <Pressable
            style={mapStyles.tapBtn}
            onPress={() => onPinMoved(lat, lng + 0.001)}
            accessibilityLabel="move pin east"
          >
            <Text style={mapStyles.tapBtnText}>→</Text>
          </Pressable>
          <Pressable
            style={mapStyles.tapBtn}
            onPress={() => onPinMoved(lat - 0.001, lng)}
            accessibilityLabel="move pin south"
          >
            <Text style={mapStyles.tapBtnText}>↓</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const mapStyles = StyleSheet.create({
  container: { height: 240, borderRadius: 12, overflow: 'hidden', backgroundColor: '#CFE2F3' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  placeholderText: { fontSize: 13, color: '#555', fontStyle: 'italic' },
  coordText: { fontSize: 12, color: '#1976D2', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  pin: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.pin,
    borderWidth: 2,
    borderColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 4,
  },
  tapRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  tapBtn: { backgroundColor: '#FFF', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6, elevation: 2 },
  tapBtnText: { fontSize: 18, color: C.primary },
});

// ── GovernorateSheet ──────────────────────────────────────────────────────────
function GovernorateSheet({
  divisions,
  onSelect,
  onClose,
}: {
  divisions: IraqAdminDivision[];
  onSelect: (div: IraqAdminDivision) => void;
  onClose: () => void;
}): ReactElement {
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={sheetStyles.backdrop} onPress={onClose} />
      <View style={sheetStyles.sheet}>
        <View style={sheetStyles.handle} />
        <Text style={sheetStyles.title}>{t('addressPicker.selectGovernorate')}</Text>
        <ScrollView>
          {divisions.map((div) => (
            <Pressable
              key={div.id}
              style={sheetStyles.row}
              onPress={() => onSelect(div)}
              accessibilityRole="button"
              accessibilityLabel={div.names.ar}
            >
              <Text style={sheetStyles.rowText}>{div.names.ar}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    backgroundColor: C.surface,
    borderTopStartRadius: 20,
    borderTopEndRadius: 20,
    maxHeight: '70%',
    paddingBottom: 32,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#DDD', alignSelf: 'center', marginTop: 12, marginBottom: 8 },
  title: { fontSize: 17, fontWeight: '600', color: C.text, paddingHorizontal: 20, paddingBottom: 8, textAlign: 'auto' },
  row: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.separator,
  },
  rowText: { fontSize: 16, color: C.text, textAlign: 'auto' },
});

// ── DistrictSheet ─────────────────────────────────────────────────────────────
function DistrictSheet({
  districts,
  onSelect,
  onClose,
}: {
  districts: IraqAdminDivision['districts'];
  onSelect: (name: string) => void;
  onClose: () => void;
}): ReactElement {
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={sheetStyles.backdrop} onPress={onClose} />
      <View style={sheetStyles.sheet}>
        <View style={sheetStyles.handle} />
        <Text style={sheetStyles.title}>{t('addressPicker.selectDistrict')}</Text>
        <ScrollView>
          {districts.map((d) => (
            <Pressable
              key={d.id}
              style={sheetStyles.row}
              onPress={() => onSelect(d.names.ar)}
              accessibilityRole="button"
              accessibilityLabel={d.names.ar}
            >
              <Text style={sheetStyles.rowText}>{d.names.ar}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── SaveModal ─────────────────────────────────────────────────────────────────
function SaveModal({
  label,
  saveName,
  onChangeType,
  onChangeName,
  onSave,
  onClose,
}: {
  label: SavedAddressLabel;
  saveName: string;
  onChangeType: (type: SavedAddressLabel['type']) => void;
  onChangeName: (name: string) => void;
  onSave: () => void;
  onClose: () => void;
}): ReactElement {
  const types: Array<{ type: SavedAddressLabel['type']; label: string }> = [
    { type: 'home', label: t('addressPicker.labelHome') },
    { type: 'work', label: t('addressPicker.labelWork') },
    { type: 'other', label: t('addressPicker.labelOther') },
  ];

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={saveStyles.overlay}>
        <View style={saveStyles.card}>
          <Text style={saveStyles.title}>{t('addressPicker.saveAddressTitle')}</Text>
          <View style={saveStyles.typeRow}>
            {types.map((item) => (
              <Pressable
                key={item.type}
                style={[saveStyles.typeBtn, label.type === item.type && saveStyles.typeBtnActive]}
                onPress={() => onChangeType(item.type)}
                accessibilityRole="radio"
                accessibilityState={{ selected: label.type === item.type }}
              >
                <Text style={[saveStyles.typeBtnText, label.type === item.type && saveStyles.typeBtnTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {label.type === 'other' && (
            <TextInput
              style={saveStyles.input}
              placeholder={t('addressPicker.customNamePlaceholder')}
              value={saveName}
              onChangeText={onChangeName}
              textAlign="right"
              returnKeyType="done"
            />
          )}
          <View style={saveStyles.actions}>
            <Pressable style={saveStyles.cancelBtn} onPress={onClose}>
              <Text style={saveStyles.cancelText}>{t('addressPicker.cancel')}</Text>
            </Pressable>
            <Pressable style={saveStyles.saveBtn} onPress={onSave}>
              <Text style={saveStyles.saveText}>{t('addressPicker.save')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const saveStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: C.surface, borderRadius: 16, padding: 24, width: '85%', gap: 16 },
  title: { fontSize: 18, fontWeight: '700', color: C.text, textAlign: 'auto' },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: 'center',
  },
  typeBtnActive: { borderColor: C.primary, backgroundColor: C.primaryLight },
  typeBtnText: { fontSize: 14, color: C.textSecondary, fontWeight: '500' },
  typeBtnTextActive: { color: C.primary },
  input: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: C.text,
    backgroundColor: C.bg,
  },
  actions: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end', paddingTop: 4 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 10 },
  cancelText: { fontSize: 15, color: C.textSecondary },
  saveBtn: { backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  saveText: { fontSize: 15, color: '#FFF', fontWeight: '600' },
});

// ── AutocompleteList ──────────────────────────────────────────────────────────
function AutocompleteList({
  suggestions,
  onSelect,
}: {
  suggestions: AddressSuggestion[];
  onSelect: (s: AddressSuggestion) => void;
}): ReactElement | null {
  if (suggestions.length === 0) return null;
  return (
    <View style={acStyles.list}>
      {suggestions.map((s) => (
        <Pressable key={s.id} style={acStyles.item} onPress={() => onSelect(s)}>
          <Text style={acStyles.label} numberOfLines={1}>{s.label}</Text>
          {s.sublabel ? <Text style={acStyles.sub} numberOfLines={1}>{s.sublabel}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

const acStyles = StyleSheet.create({
  list: {
    backgroundColor: C.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    marginTop: 4,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  item: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.separator },
  label: { fontSize: 15, color: C.text, textAlign: 'auto' },
  sub: { fontSize: 12, color: C.textSecondary, marginTop: 2, textAlign: 'auto' },
});

// ── FormField ─────────────────────────────────────────────────────────────────
function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  onPress,
  testID,
  children,
}: {
  label: string;
  value?: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  onPress?: () => void;
  testID?: string;
  children?: ReactElement;
}): ReactElement {
  const isReadOnly = !!onPress;
  return (
    <View style={fieldStyles.wrap}>
      <Text style={fieldStyles.label}>{label}</Text>
      {isReadOnly ? (
        <Pressable style={fieldStyles.select} onPress={onPress} testID={testID}>
          <Text style={[fieldStyles.selectText, !value && fieldStyles.placeholderText]} numberOfLines={1}>
            {value || placeholder}
          </Text>
          <Text style={fieldStyles.chevron}>›</Text>
        </Pressable>
      ) : (
        <TextInput
          style={fieldStyles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.textHint}
          textAlign="right"
          testID={testID}
        />
      )}
      {children}
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: C.textSecondary, marginBottom: 6, textAlign: 'auto' },
  input: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: C.text,
    backgroundColor: C.surface,
  },
  select: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: C.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectText: { fontSize: 15, color: C.text, flex: 1, textAlign: 'auto' },
  placeholderText: { color: C.textHint },
  chevron: { fontSize: 20, color: C.textSecondary, marginStart: 8 },
});

// ── Main Screen ────────────────────────────────────────────────────────────────
export function AddressPickerScreen(): ReactElement {
  const router = useRouter();
  const api = useApi();
  const autocompleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, setState] = useState<PickerState>({
    lat: INITIAL_LAT,
    lng: INITIAL_LNG,
    reverseResult: null,
    loadingReverse: false,
    governorateId: '',
    governorateName: '',
    district: '',
    neighborhood: '',
    street: '',
    building: '',
    landmark: '',
    showCoords: false,
    showSaveModal: false,
    label: { type: 'home' },
    saveName: '',
    autocompleteStreet: [],
    loadingAutocomplete: false,
    divisions: [],
    loadingDivisions: false,
    activeTab: 'map',
  });

  const [showGovSheet, setShowGovSheet] = useState(false);
  const [showDistSheet, setShowDistSheet] = useState(false);

  // Load admin divisions once
  useEffect(() => {
    setState((s) => ({ ...s, loadingDivisions: true }));
    api
      .get<{ divisions: IraqAdminDivision[] }>('/v1/geocode/admin-divisions')
      .then((res) => {
        setState((s) => ({ ...s, divisions: res.data.divisions, loadingDivisions: false }));
      })
      .catch(() => setState((s) => ({ ...s, loadingDivisions: false })));
  }, [api]);

  // Reverse geocode on pin move
  const onPinMoved = useCallback(
    async (lat: number, lng: number) => {
      setState((s) => ({ ...s, lat, lng, loadingReverse: true, reverseResult: null }));
      try {
        const res = await api.get<ReverseGeocodeResult>(
          `/v1/geocode/reverse?lat=${lat}&lng=${lng}&locale=ar`,
        );
        const rr: ReverseGeocodeResult = res.data;
        setState((s) => ({
          ...s,
          loadingReverse: false,
          reverseResult: rr,
          // Pre-fill form from reverse result
          district: rr.address.components.district ?? s.district,
          neighborhood: rr.address.components.neighborhood ?? s.neighborhood,
          street: rr.address.components.street ?? s.street,
          building: rr.address.components.houseNumber ?? s.building,
        }));
      } catch {
        setState((s) => ({ ...s, loadingReverse: false }));
      }
    },
    [api],
  );

  // Use my location
  const onUseLocation = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('addressPicker.locationDeniedTitle'), t('addressPicker.locationDeniedBody'));
      return;
    }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    await onPinMoved(loc.coords.latitude, loc.coords.longitude);
  }, [onPinMoved]);

  // Street autocomplete with debounce
  const onStreetChange = useCallback(
    (text: string) => {
      setState((s) => ({ ...s, street: text, autocompleteStreet: [] }));
      if (autocompleteTimer.current) clearTimeout(autocompleteTimer.current);
      if (text.trim().length < 2) return;

      autocompleteTimer.current = setTimeout(async () => {
        setState((s) => ({ ...s, loadingAutocomplete: true }));
        try {
          const govParam = state.governorateId ? `&governorateId=${state.governorateId}` : '';
          const res = await api.get<{ suggestions: AddressSuggestion[] }>(
            `/v1/geocode/autocomplete?partial=${encodeURIComponent(text)}&limit=5&locale=ar${govParam}`,
          );
          setState((s) => ({ ...s, autocompleteStreet: res.data.suggestions, loadingAutocomplete: false }));
        } catch {
          setState((s) => ({ ...s, loadingAutocomplete: false }));
        }
      }, 300);
    },
    [api, state.governorateId],
  );

  const onStreetSuggestionSelect = useCallback((s: AddressSuggestion) => {
    setState((prev) => ({
      ...prev,
      street: s.label,
      autocompleteStreet: [],
      lat: s.location[1],
      lng: s.location[0],
    }));
  }, []);

  // Governorate selection
  const onGovernorateSelect = useCallback((div: IraqAdminDivision) => {
    setState((s) => ({
      ...s,
      governorateId: div.id,
      governorateName: div.names.ar,
      district: '',
      neighborhood: '',
    }));
    setShowGovSheet(false);
  }, []);

  // District selection
  const onDistrictSelect = useCallback((name: string) => {
    setState((s) => ({ ...s, district: name }));
    setShowDistSheet(false);
  }, []);

  // Save handler
  const onSave = useCallback(() => {
    const address: AddressComponent = {
      governorate: state.governorateName || undefined,
      governorateId: state.governorateId || undefined,
      district: state.district || undefined,
      neighborhood: state.neighborhood || undefined,
      street: state.street || undefined,
      houseNumber: state.building || undefined,
      landmark: state.landmark || undefined,
    };

    // In production: save to account savedAddresses via API; for now log
    console.log('[AddressPicker] save', {
      address,
      lat: state.lat,
      lng: state.lng,
      label: state.label,
      name: state.label.type === 'other' ? state.saveName : state.label.type,
    });

    setState((s) => ({ ...s, showSaveModal: false }));
    router.back();
  }, [state, router]);

  const selectedDiv = state.divisions.find((d) => d.id === state.governorateId);

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {/* Tab Bar */}
        <View style={styles.tabBar}>
          <Pressable
            style={[styles.tab, state.activeTab === 'map' && styles.tabActive]}
            onPress={() => setState((s) => ({ ...s, activeTab: 'map' }))}
          >
            <Text style={[styles.tabText, state.activeTab === 'map' && styles.tabTextActive]}>
              {t('addressPicker.tabMap')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, state.activeTab === 'form' && styles.tabActive]}
            onPress={() => setState((s) => ({ ...s, activeTab: 'form' }))}
          >
            <Text style={[styles.tabText, state.activeTab === 'form' && styles.tabTextActive]}>
              {t('addressPicker.tabForm')}
            </Text>
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {state.activeTab === 'map' && (
            <View style={styles.mapSection}>
              {/* Map */}
              <MapPinView lat={state.lat} lng={state.lng} onPinMoved={(lat, lng) => void onPinMoved(lat, lng)} />

              {/* Use my location */}
              <Pressable style={styles.locBtn} onPress={() => void onUseLocation()}>
                <Text style={styles.locBtnText}>{t('addressPicker.useMyLocation')}</Text>
              </Pressable>

              {/* Reverse geocode result */}
              {state.loadingReverse && (
                <View style={styles.reverseCard}>
                  <ActivityIndicator size="small" color={C.primary} />
                  <Text style={styles.reverseLoading}>{t('addressPicker.locating')}</Text>
                </View>
              )}
              {!state.loadingReverse && state.reverseResult && (
                <View style={styles.reverseCard}>
                  <Text style={styles.reverseTitle}>{t('addressPicker.detectedAddress')}</Text>
                  <Text style={styles.reverseFull}>{state.reverseResult.address.full}</Text>
                  <Text style={styles.reverseShort}>{state.reverseResult.address.short}</Text>
                </View>
              )}

              {/* Coordinates toggle */}
              <Pressable
                style={styles.coordToggle}
                onPress={() => setState((s) => ({ ...s, showCoords: !s.showCoords }))}
              >
                <Text style={styles.coordToggleText}>{t('addressPicker.showCoords')}</Text>
              </Pressable>
              {state.showCoords && (
                <View style={styles.coordBox}>
                  <Text style={styles.coordLabel}>{t('addressPicker.lat')}: <Text style={styles.coordValue}>{state.lat.toFixed(7)}</Text></Text>
                  <Text style={styles.coordLabel}>{t('addressPicker.lng')}: <Text style={styles.coordValue}>{state.lng.toFixed(7)}</Text></Text>
                </View>
              )}
            </View>
          )}

          {state.activeTab === 'form' && (
            <View style={styles.formSection}>
              {/* Governorate picker */}
              <FormField
                label={t('addressPicker.governorate')}
                value={state.governorateName}
                placeholder={t('addressPicker.selectGovernorate')}
                onPress={() => setShowGovSheet(true)}
                testID="addressPicker.governorate"
              />

              {/* District picker (only if governorate selected) */}
              {selectedDiv && (
                <FormField
                  label={t('addressPicker.district')}
                  value={state.district}
                  placeholder={t('addressPicker.selectDistrict')}
                  onPress={() => setShowDistSheet(true)}
                  testID="addressPicker.district"
                />
              )}

              {/* Neighbourhood */}
              <FormField
                label={t('addressPicker.neighborhood')}
                value={state.neighborhood}
                onChangeText={(t) => setState((s) => ({ ...s, neighborhood: t }))}
                placeholder={t('addressPicker.neighborhoodPlaceholder')}
                testID="addressPicker.neighborhood"
              />

              {/* Street with autocomplete */}
              <FormField
                label={t('addressPicker.street')}
                value={state.street}
                onChangeText={onStreetChange}
                placeholder={t('addressPicker.streetPlaceholder')}
                testID="addressPicker.street"
              >
                <>
                  {state.loadingAutocomplete && (
                    <ActivityIndicator size="small" color={C.primary} style={{ marginTop: 4 }} />
                  )}
                  <AutocompleteList
                    suggestions={state.autocompleteStreet}
                    onSelect={onStreetSuggestionSelect}
                  />
                </>
              </FormField>

              {/* Building / apartment */}
              <FormField
                label={t('addressPicker.building')}
                value={state.building}
                onChangeText={(t) => setState((s) => ({ ...s, building: t }))}
                placeholder={t('addressPicker.buildingPlaceholder')}
                testID="addressPicker.building"
              />

              {/* Landmark */}
              <FormField
                label={t('addressPicker.landmark')}
                value={state.landmark}
                onChangeText={(t) => setState((s) => ({ ...s, landmark: t }))}
                placeholder={t('addressPicker.landmarkPlaceholder')}
                testID="addressPicker.landmark"
              />

              {/* Coordinates */}
              <Pressable
                style={styles.coordToggle}
                onPress={() => setState((s) => ({ ...s, showCoords: !s.showCoords }))}
              >
                <Text style={styles.coordToggleText}>{t('addressPicker.showCoords')}</Text>
              </Pressable>
              {state.showCoords && (
                <View style={styles.coordBox}>
                  <Text style={styles.coordLabel}>{t('addressPicker.lat')}: <Text style={styles.coordValue}>{state.lat.toFixed(7)}</Text></Text>
                  <Text style={styles.coordLabel}>{t('addressPicker.lng')}: <Text style={styles.coordValue}>{state.lng.toFixed(7)}</Text></Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>

        {/* Confirm / Save bar */}
        <View style={styles.actionBar}>
          <Pressable
            style={styles.saveAddressBtn}
            onPress={() => setState((s) => ({ ...s, showSaveModal: true }))}
          >
            <Text style={styles.saveAddressBtnText}>{t('addressPicker.saveAddress')}</Text>
          </Pressable>
          <Pressable style={styles.confirmBtn} onPress={() => router.back()}>
            <Text style={styles.confirmBtnText}>{t('addressPicker.confirm')}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Governorate sheet */}
      {showGovSheet && (
        <GovernorateSheet
          divisions={state.divisions}
          onSelect={onGovernorateSelect}
          onClose={() => setShowGovSheet(false)}
        />
      )}

      {/* District sheet */}
      {showDistSheet && selectedDiv && (
        <DistrictSheet
          districts={selectedDiv.districts}
          onSelect={onDistrictSelect}
          onClose={() => setShowDistSheet(false)}
        />
      )}

      {/* Save modal */}
      {state.showSaveModal && (
        <SaveModal
          label={state.label}
          saveName={state.saveName}
          onChangeType={(type) => setState((s) => ({ ...s, label: { type } }))}
          onChangeName={(name) => setState((s) => ({ ...s, saveName: name }))}
          onSave={onSave}
          onClose={() => setState((s) => ({ ...s, showSaveModal: false }))}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.surface,
  },
  tab: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: C.primary,
  },
  tabText: { fontSize: 15, color: C.textSecondary, fontWeight: '500' },
  tabTextActive: { color: C.primary, fontWeight: '700' },
  scroll: { padding: 16, paddingBottom: 24 },
  mapSection: { gap: 12 },
  formSection: { gap: 0 },
  locBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.primaryLight,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  locBtnText: { fontSize: 14, color: C.primary, fontWeight: '600' },
  reverseCard: {
    backgroundColor: C.surface,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    gap: 4,
  },
  reverseTitle: { fontSize: 12, color: C.textSecondary, fontWeight: '600', textAlign: 'auto' },
  reverseFull: { fontSize: 15, color: C.text, fontWeight: '500', textAlign: 'auto' },
  reverseShort: { fontSize: 13, color: C.textSecondary, textAlign: 'auto' },
  reverseLoading: { fontSize: 14, color: C.textSecondary, marginStart: 8 },
  coordToggle: { alignSelf: 'flex-start' },
  coordToggleText: { fontSize: 13, color: C.primary, textDecorationLine: 'underline' },
  coordBox: {
    backgroundColor: '#F0F4FF',
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  coordLabel: { fontSize: 13, color: C.textSecondary, textAlign: 'auto' },
  coordValue: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: C.text },
  actionBar: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  saveAddressBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: C.primary,
    alignItems: 'center',
  },
  saveAddressBtnText: { fontSize: 15, color: C.primary, fontWeight: '600' },
  confirmBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: C.primary,
    alignItems: 'center',
  },
  confirmBtnText: { fontSize: 15, color: '#FFF', fontWeight: '700' },
});
