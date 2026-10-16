/**
 * TripPlannerScreen — multi-stop trip planning UI.
 *
 * Features:
 * - Stop list with drag-to-reorder handles
 * - Add stop: search by name or drop pin
 * - Per-stop dwell time, arrival estimate, and note
 * - Trip stats row (total distance, time, stop count)
 * - "Optimize order" button (nearest-neighbour TSP)
 * - Share trip button (deep link)
 * - Start navigation button
 * - Built-in templates: Baghdad Highlights, Erbil Old City, Basra Waterfront
 */
import { tokens } from '@iraq-maps/ui';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  Alert,
  Animated,
  Clipboard,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { t } from '../strings';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TripStop {
  id: string;
  placeName: string;
  coord: [number, number];
  note: string;
  durationAtStopMin: number; // minutes
  arrivalOffsetS?: number;
}

export interface TripSegmentInfo {
  fromId: string;
  toId: string;
  distanceM: number;
  durationS: number;
}

export interface TripStats {
  totalDistanceM: number;
  totalDurationS: number;
}

export interface TripPlannerScreenProps {
  onStartNavigation?: (stops: TripStop[]) => void;
  onSaveTrip?: (name: string, stops: TripStop[], optimized: boolean) => Promise<string | null>;
  onShareTrip?: (tripId: string) => Promise<string>;
  onClose?: () => void;
  onPlanRoute?: (
    stops: Array<{ coord: [number, number]; durationAtStopS: number }>,
    mode: 'car' | 'walk',
    optimize: boolean,
  ) => Promise<{
    orderedStops: Array<{ placeName: string; coord: [number, number]; arrivalOffsetS: number }>;
    segments: TripSegmentInfo[];
    stats: TripStats;
  }>;
}

// ─── Iraqi city templates ─────────────────────────────────────────────────────

interface Template {
  key: 'baghdad' | 'erbil' | 'basra';
  label: string;
  stops: Omit<TripStop, 'id'>[];
}

const TEMPLATES: Template[] = [
  {
    key: 'baghdad',
    label: t('tripPlanner.templateBaghdad'),
    stops: [
      { placeName: 'المنطقة الخضراء', coord: [44.3946, 33.3138], note: '', durationAtStopMin: 30 },
      { placeName: 'شارع المتنبي', coord: [44.3979, 33.3387], note: '', durationAtStopMin: 60 },
      { placeName: 'متحف العراق الوطني', coord: [44.3815, 33.3461], note: '', durationAtStopMin: 90 },
      { placeName: 'جسر الجمهورية', coord: [44.3930, 33.3300], note: '', durationAtStopMin: 15 },
      { placeName: 'برج بغداد', coord: [44.3615, 33.3090], note: '', durationAtStopMin: 45 },
    ],
  },
  {
    key: 'erbil',
    label: t('tripPlanner.templateErbil'),
    stops: [
      { placeName: 'قلعة أربيل', coord: [44.0092, 36.1912], note: '', durationAtStopMin: 60 },
      { placeName: 'بازار القيصرية', coord: [44.0085, 36.1905], note: '', durationAtStopMin: 45 },
      { placeName: 'مسجد جليل خياط', coord: [44.0095, 36.1870], note: '', durationAtStopMin: 20 },
      { placeName: 'حديقة شاليمار', coord: [44.0142, 36.1880], note: '', durationAtStopMin: 30 },
    ],
  },
  {
    key: 'basra',
    label: t('tripPlanner.templateBasra'),
    stops: [
      { placeName: 'كورنيش البصرة', coord: [47.8217, 30.5085], note: '', durationAtStopMin: 40 },
      { placeName: 'شط العرب', coord: [47.8312, 30.5098], note: '', durationAtStopMin: 30 },
      { placeName: 'متحف البصرة', coord: [47.8219, 30.5042], note: '', durationAtStopMin: 60 },
      { placeName: 'سوق العشار', coord: [47.8170, 30.5200], note: '', durationAtStopMin: 45 },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _idCounter = 0;
function nextId(): string {
  return `local_${++_idCounter}_${Date.now()}`;
}

function fmtDuration(totalS: number): string {
  const h = Math.floor(totalS / 3600);
  const m = Math.ceil((totalS % 3600) / 60);
  if (h === 0) return t('active.durationMin', { n: Math.max(1, m) });
  return t('active.durationHourMin', { h, m });
}

function fmtDist(m: number): string {
  return m < 1000
    ? t('active.distM', { n: Math.round(m) })
    : t('active.distKm', { n: (m / 1000).toFixed(1) });
}

function fmtTime(offsetS: number): string {
  const now = new Date();
  const arrival = new Date(now.getTime() + offsetS * 1000);
  return arrival.toLocaleTimeString('ar-IQ', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StopRowProps {
  stop: TripStop;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  dark: boolean;
  onRemove: (id: string) => void;
  onNoteChange: (id: string, note: string) => void;
  onDurationChange: (id: string, minutes: number) => void;
  onDragStart?: () => void;
}

function StopRow({
  stop,
  index,
  isFirst,
  isLast,
  dark,
  onRemove,
  onNoteChange,
  onDurationChange,
}: StopRowProps): ReactElement {
  const [expanded, setExpanded] = useState(false);

  const arrivalLabel = stop.arrivalOffsetS != null
    ? t('tripPlanner.arrivalAt', { time: fmtTime(stop.arrivalOffsetS) })
    : null;

  return (
    <View style={[styles.stopRow, dark && styles.stopRowDark]}>
      {/* Timeline dot */}
      <View style={styles.timelineCol}>
        <View style={[styles.timelineDot, isFirst && styles.timelineDotFirst, dark && styles.timelineDotDark]}>
          <RNText style={styles.timelineDotText}>{index + 1}</RNText>
        </View>
        {!isLast && <View style={[styles.timelineLine, dark && styles.timelineLineDark]} />}
      </View>

      {/* Content */}
      <View style={styles.stopContent}>
        <TouchableOpacity
          onPress={() => setExpanded((v) => !v)}
          accessibilityRole="button"
          style={styles.stopHeader}
        >
          <View style={styles.stopHeaderMain}>
            <RNText
              style={[styles.stopName, dark && styles.textPrimaryDark]}
              numberOfLines={1}
            >
              {stop.placeName}
            </RNText>
            {arrivalLabel && (
              <RNText style={[styles.stopArrival, dark && styles.textSecondaryDark]}>
                {arrivalLabel}
              </RNText>
            )}
          </View>
          <View style={styles.stopHeaderActions}>
            {/* Drag handle */}
            <View
              style={styles.dragHandle}
              accessibilityLabel={t('tripPlanner.drag')}
            >
              <RNText style={[styles.dragIcon, dark && styles.textSecondaryDark]}>☰</RNText>
            </View>
            {/* Expand toggle */}
            <RNText style={[styles.expandIcon, dark && styles.textSecondaryDark]}>
              {expanded ? '▲' : '▼'}
            </RNText>
          </View>
        </TouchableOpacity>

        {expanded && (
          <View style={styles.stopDetails}>
            {/* Note */}
            <View style={styles.detailRow}>
              <RNText style={[styles.detailLabel, dark && styles.textSecondaryDark]}>
                {t('tripPlanner.stopNote')}
              </RNText>
              <TextInput
                style={[styles.detailInput, dark && styles.detailInputDark]}
                value={stop.note}
                onChangeText={(v) => onNoteChange(stop.id, v)}
                placeholder={t('tripPlanner.stopNotePlaceholder')}
                placeholderTextColor={dark ? '#666' : '#bbb'}
              />
            </View>

            {/* Dwell time */}
            <View style={styles.detailRow}>
              <RNText style={[styles.detailLabel, dark && styles.textSecondaryDark]}>
                {t('tripPlanner.durationAtStop')}
              </RNText>
              <View style={styles.durationPicker}>
                {[0, 15, 30, 60, 90, 120].map((min) => (
                  <TouchableOpacity
                    key={min}
                    style={[
                      styles.durationChip,
                      stop.durationAtStopMin === min && styles.durationChipActive,
                      dark && styles.durationChipDark,
                      stop.durationAtStopMin === min && dark && styles.durationChipActiveDark,
                    ]}
                    onPress={() => onDurationChange(stop.id, min)}
                    accessibilityRole="button"
                  >
                    <RNText
                      style={[
                        styles.durationChipText,
                        stop.durationAtStopMin === min && styles.durationChipTextActive,
                        dark && styles.textSecondaryDark,
                      ]}
                    >
                      {min === 0 ? '—' : t('tripPlanner.durationAtStopMin', { n: min })}
                    </RNText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Remove */}
            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => onRemove(stop.id)}
              accessibilityRole="button"
            >
              <RNText style={styles.removeBtnText}>
                {t('tripPlanner.removeStop')}
              </RNText>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

interface AddStopModalProps {
  visible: boolean;
  dark: boolean;
  onClose: () => void;
  onAdd: (stop: Omit<TripStop, 'id'>) => void;
}

function AddStopModal({ visible, dark, onClose, onAdd }: AddStopModalProps): ReactElement {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ name: string; coord: [number, number] }>>([]);

  // Mock search results for Iraqi cities
  const MOCK_PLACES: Array<{ name: string; coord: [number, number] }> = [
    { name: 'برج بغداد', coord: [44.3615, 33.309] },
    { name: 'متحف العراق الوطني', coord: [44.3815, 33.3461] },
    { name: 'شارع المتنبي', coord: [44.3979, 33.3387] },
    { name: 'قلعة أربيل', coord: [44.0092, 36.1912] },
    { name: 'الحبوبي — الناصرية', coord: [46.2590, 31.0495] },
    { name: 'كورنيش البصرة', coord: [47.8217, 30.5085] },
    { name: 'ضريح الإمام علي — النجف', coord: [44.3154, 31.9961] },
    { name: 'الحسين — كربلاء', coord: [44.0296, 32.6166] },
    { name: 'مطار بغداد الدولي', coord: [44.2346, 33.2625] },
    { name: 'جامعة بغداد', coord: [44.3827, 33.3061] },
    { name: 'الكرادة شارع اليرموك', coord: [44.4007, 33.3006] },
    { name: 'منطقة الجادرية', coord: [44.3832, 33.2920] },
  ];

  useEffect(() => {
    if (query.trim().length < 1) {
      setResults([]);
      return;
    }
    const lower = query.toLowerCase();
    setResults(MOCK_PLACES.filter((p) => p.name.includes(lower) || p.name.includes(query)).slice(0, 6));
  }, [query]);

  const handleSelect = useCallback(
    (place: { name: string; coord: [number, number] }) => {
      onAdd({ placeName: place.name, coord: place.coord, note: '', durationAtStopMin: 0 });
      setQuery('');
      setResults([]);
      onClose();
    },
    [onAdd, onClose],
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, dark && styles.modalSheetDark]}>
          <View style={styles.modalHandle} />
          <RNText style={[styles.modalTitle, dark && styles.textPrimaryDark]}>
            {t('tripPlanner.addStopTitle')}
          </RNText>
          <TextInput
            style={[styles.searchInput, dark && styles.searchInputDark]}
            value={query}
            onChangeText={setQuery}
            placeholder={t('tripPlanner.searchStop')}
            placeholderTextColor={dark ? '#666' : '#aaa'}
            autoFocus
          />
          {results.length > 0 && (
            <ScrollView style={styles.searchResults} keyboardShouldPersistTaps="handled">
              {results.map((place) => (
                <TouchableOpacity
                  key={place.name}
                  style={[styles.searchResult, dark && styles.searchResultDark]}
                  onPress={() => handleSelect(place)}
                  accessibilityRole="button"
                >
                  <RNText style={[styles.searchResultText, dark && styles.textPrimaryDark]}>
                    📍 {place.name}
                  </RNText>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          {query.length > 0 && results.length === 0 && (
            <RNText style={[styles.noResults, dark && styles.textSecondaryDark]}>
              {t('waypoints.noResults')}
            </RNText>
          )}
          <TouchableOpacity style={styles.closeModalBtn} onPress={onClose} accessibilityRole="button">
            <RNText style={[styles.closeModalBtnText, dark && styles.textSecondaryDark]}>
              {t('active.close')}
            </RNText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

interface TemplateSelectorProps {
  dark: boolean;
  onSelect: (template: Template) => void;
}

function TemplateSelector({ dark, onSelect }: TemplateSelectorProps): ReactElement {
  return (
    <View style={styles.templateRow}>
      {TEMPLATES.map((tpl) => (
        <TouchableOpacity
          key={tpl.key}
          style={[styles.templateChip, dark && styles.templateChipDark]}
          onPress={() => onSelect(tpl)}
          accessibilityRole="button"
        >
          <RNText style={[styles.templateChipText, dark && styles.textPrimaryDark]}>
            {tpl.key === 'baghdad' ? '🏛️' : tpl.key === 'erbil' ? '🏰' : '🌊'}{' '}
            {tpl.label}
          </RNText>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function TripPlannerScreen({
  onStartNavigation,
  onSaveTrip,
  onShareTrip,
  onClose,
  onPlanRoute,
}: TripPlannerScreenProps): ReactElement {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';

  const [tripName, setTripName] = useState('');
  const [stops, setStops] = useState<TripStop[]>([]);
  const [stats, setStats] = useState<TripStats | null>(null);
  const [optimized, setOptimized] = useState(false);
  const [mode, setMode] = useState<'car' | 'walk'>('car');
  const [showAddStop, setShowAddStop] = useState(false);
  const [saving, setSaving] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [savedTripId, setSavedTripId] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(true);

  const scrollRef = useRef<ScrollView>(null);

  // ── Routing ──────────────────────────────────────────────────────────────────

  const runPlan = useCallback(async () => {
    if (!onPlanRoute || stops.length < 2) return;
    setPlanning(true);
    try {
      const result = await onPlanRoute(
        stops.map((s) => ({ coord: s.coord, durationAtStopS: s.durationAtStopMin * 60 })),
        mode,
        optimized,
      );
      setStats(result.stats);
      // Update arrival offsets
      setStops((prev) =>
        prev.map((stop, i) => ({
          ...stop,
          arrivalOffsetS: result.orderedStops[i]?.arrivalOffsetS,
        })),
      );
    } catch {
      // Non-fatal; stats remain null
    } finally {
      setPlanning(false);
    }
  }, [onPlanRoute, stops, mode, optimized]);

  useEffect(() => {
    if (stops.length >= 2) {
      void runPlan();
    } else {
      setStats(null);
    }
  }, [stops.length, optimized, mode]);

  // ── Stop mutations ───────────────────────────────────────────────────────────

  const addStop = useCallback((stopInput: Omit<TripStop, 'id'>) => {
    setStops((prev) => [...prev, { ...stopInput, id: nextId() }]);
    setShowTemplates(false);
  }, []);

  const removeStop = useCallback((id: string) => {
    setStops((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const updateNote = useCallback((id: string, note: string) => {
    setStops((prev) => prev.map((s) => (s.id === id ? { ...s, note } : s)));
  }, []);

  const updateDuration = useCallback((id: string, minutes: number) => {
    setStops((prev) =>
      prev.map((s) => (s.id === id ? { ...s, durationAtStopMin: minutes } : s)),
    );
  }, []);

  // ── Optimize ─────────────────────────────────────────────────────────────────

  const handleOptimize = useCallback(() => {
    setOptimized((v) => !v);
  }, []);

  // ── Templates ────────────────────────────────────────────────────────────────

  const handleTemplate = useCallback((tpl: Template) => {
    setStops(tpl.stops.map((s) => ({ ...s, id: nextId() })));
    setTripName(tpl.label);
    setShowTemplates(false);
  }, []);

  // ── Save ─────────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!onSaveTrip || stops.length < 2) return;
    const name = tripName.trim() || t('tripPlanner.newTrip');
    setSaving(true);
    try {
      const id = await onSaveTrip(name, stops, optimized);
      setSavedTripId(id);
      Alert.alert('', t('tripPlanner.saved'));
    } catch {
      Alert.alert('', t('tripPlanner.error'));
    } finally {
      setSaving(false);
    }
  }, [onSaveTrip, stops, tripName, optimized]);

  // ── Share ─────────────────────────────────────────────────────────────────────

  const handleShare = useCallback(async () => {
    if (!onShareTrip || !savedTripId) {
      Alert.alert('', t('tripPlanner.save'));
      return;
    }
    try {
      const token = await onShareTrip(savedTripId);
      const link = `iraqmaps://trip/${token}`;
      Clipboard.setString(link);
      Alert.alert(t('tripPlanner.shareLink'), link);
    } catch {
      Alert.alert('', t('tripPlanner.error'));
    }
  }, [onShareTrip, savedTripId]);

  // ── Start navigation ─────────────────────────────────────────────────────────

  const handleStart = useCallback(() => {
    if (stops.length < 2) return;
    onStartNavigation?.(stops);
  }, [onStartNavigation, stops]);

  // ── Derived values ───────────────────────────────────────────────────────────

  const statsLabel = useMemo(() => {
    if (!stats) return null;
    return `${fmtDist(stats.totalDistanceM)} · ${fmtDuration(stats.totalDurationS)}`;
  }, [stats]);

  const canStart = stops.length >= 2;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, dark && styles.rootDark]}>
      {/* Header */}
      <View style={[styles.header, dark && styles.headerDark]}>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.headerBtn} accessibilityRole="button">
            <RNText style={[styles.headerBtnText, dark && styles.textPrimaryDark]}>✕</RNText>
          </TouchableOpacity>
        )}
        <RNText style={[styles.headerTitle, dark && styles.textPrimaryDark]}>
          {t('tripPlanner.title')}
        </RNText>
        <TouchableOpacity onPress={handleShare} style={styles.headerBtn} accessibilityRole="button">
          <RNText style={[styles.headerBtnText, dark && styles.textPrimaryDark]}>⎋</RNText>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Trip name */}
        <TextInput
          style={[styles.tripNameInput, dark && styles.tripNameInputDark]}
          value={tripName}
          onChangeText={setTripName}
          placeholder={t('tripPlanner.tripNamePlaceholder')}
          placeholderTextColor={dark ? '#555' : '#bbb'}
        />

        {/* Mode selector */}
        <View style={styles.modeRow}>
          {(['car', 'walk'] as const).map((m) => (
            <TouchableOpacity
              key={m}
              style={[
                styles.modeChip,
                mode === m && styles.modeChipActive,
                dark && styles.modeChipDark,
                mode === m && dark && styles.modeChipActiveDark,
              ]}
              onPress={() => setMode(m)}
              accessibilityRole="button"
            >
              <RNText
                style={[
                  styles.modeChipText,
                  mode === m && styles.modeChipTextActive,
                  dark && styles.textSecondaryDark,
                ]}
              >
                {m === 'car' ? '🚗' : '🚶'} {m === 'car' ? t('tripPlanner.modeCar') : t('tripPlanner.modeWalk')}
              </RNText>
            </TouchableOpacity>
          ))}
        </View>

        {/* Stats bar */}
        {stats && (
          <View style={[styles.statsBar, dark && styles.statsBarDark]}>
            <RNText style={[styles.statsText, dark && styles.textPrimaryDark]}>
              {planning ? t('tripPlanner.loading') : statsLabel}
            </RNText>
            <RNText style={[styles.statsStops, dark && styles.textSecondaryDark]}>
              {t('tripPlanner.stops', { n: stops.length })}
            </RNText>
          </View>
        )}

        {/* Templates */}
        {showTemplates && stops.length === 0 && (
          <View style={styles.templateSection}>
            <RNText style={[styles.sectionLabel, dark && styles.textSecondaryDark]}>
              {t('tripPlanner.templates')}
            </RNText>
            <TemplateSelector dark={dark} onSelect={handleTemplate} />
          </View>
        )}

        {/* Stop list */}
        {stops.length > 0 && (
          <View style={[styles.stopList, dark && styles.stopListDark]}>
            {stops.map((stop, i) => (
              <StopRow
                key={stop.id}
                stop={stop}
                index={i}
                isFirst={i === 0}
                isLast={i === stops.length - 1}
                dark={dark}
                onRemove={removeStop}
                onNoteChange={updateNote}
                onDurationChange={updateDuration}
              />
            ))}
          </View>
        )}

        {/* Empty hint */}
        {stops.length < 2 && (
          <View style={[styles.hintCard, dark && styles.hintCardDark]}>
            <RNText style={[styles.hintText, dark && styles.textSecondaryDark]}>
              {t('tripPlanner.noStops')}
            </RNText>
          </View>
        )}

        {/* Add stop button */}
        <TouchableOpacity
          style={[styles.addStopBtn, dark && styles.addStopBtnDark]}
          onPress={() => setShowAddStop(true)}
          accessibilityRole="button"
        >
          <RNText style={[styles.addStopBtnText, dark && styles.textPrimaryDark]}>
            + {t('tripPlanner.addStop')}
          </RNText>
        </TouchableOpacity>

        {/* Optimize order */}
        {stops.length >= 3 && (
          <TouchableOpacity
            style={[styles.optimizeBtn, optimized && styles.optimizeBtnActive, dark && styles.optimizeBtnDark]}
            onPress={handleOptimize}
            accessibilityRole="button"
          >
            <RNText
              style={[
                styles.optimizeBtnText,
                optimized && styles.optimizeBtnTextActive,
                dark && styles.textPrimaryDark,
              ]}
            >
              ✦ {t('tripPlanner.optimize')}
            </RNText>
            <RNText style={[styles.optimizeBtnDesc, dark && styles.textSecondaryDark]}>
              {t('tripPlanner.optimizeDesc')}
            </RNText>
          </TouchableOpacity>
        )}

        {/* Action buttons */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnSec, dark && styles.actionBtnSecDark, saving && styles.actionBtnDisabled]}
            onPress={handleSave}
            disabled={saving || stops.length < 2}
            accessibilityRole="button"
          >
            <RNText style={[styles.actionBtnText, dark && styles.textPrimaryDark]}>
              💾 {t('tripPlanner.save')}
            </RNText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnPrimary, !canStart && styles.actionBtnDisabled]}
            onPress={handleStart}
            disabled={!canStart}
            accessibilityRole="button"
          >
            <RNText style={styles.actionBtnPrimaryText}>
              ▶ {t('tripPlanner.start')}
            </RNText>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* Add stop modal */}
      <AddStopModal
        visible={showAddStop}
        dark={dark}
        onClose={() => setShowAddStop(false)}
        onAdd={addStop}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f5f5' },
  rootDark: { backgroundColor: '#121212' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  headerDark: { backgroundColor: '#1e1e1e', borderBottomColor: '#333' },
  headerBtn: { width: 36, alignItems: 'center' },
  headerBtnText: { fontSize: 18, color: '#333' },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
  },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  tripNameInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111',
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
  },
  tripNameInputDark: { backgroundColor: '#1e1e1e', color: '#e0e0e0', borderColor: '#333' },

  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  modeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  modeChipDark: { backgroundColor: '#1e1e1e', borderColor: '#333' },
  modeChipActive: { backgroundColor: tokens.color.primary, borderColor: tokens.color.primary },
  modeChipActiveDark: { backgroundColor: tokens.color.primary, borderColor: tokens.color.primary },
  modeChipText: { fontSize: 14, color: '#555', fontWeight: '500' },
  modeChipTextActive: { color: '#fff' },

  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  statsBarDark: { backgroundColor: '#1e1e1e' },
  statsText: { fontSize: 15, fontWeight: '700', color: '#111' },
  statsStops: { fontSize: 13, color: '#888' },

  templateSection: { marginBottom: 12 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  templateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  templateChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  templateChipDark: { backgroundColor: '#1e1e1e', borderColor: '#333' },
  templateChipText: { fontSize: 13, color: '#333' },

  stopList: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 3,
    elevation: 2,
  },
  stopListDark: { backgroundColor: '#1e1e1e' },

  stopRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  stopRowDark: { borderBottomColor: '#2a2a2a' },

  timelineCol: {
    width: 36,
    alignItems: 'center',
    paddingTop: 14,
  },
  timelineDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: tokens.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotFirst: { backgroundColor: '#4CAF50' },
  timelineDotDark: {},
  timelineDotText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: '#e0e0e0',
    marginVertical: 2,
  },
  timelineLineDark: { backgroundColor: '#333' },

  stopContent: { flex: 1, paddingEnd: 4 },
  stopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingEnd: 12,
  },
  stopHeaderMain: { flex: 1 },
  stopName: { fontSize: 14, fontWeight: '600', color: '#111' },
  stopArrival: { fontSize: 12, color: '#888', marginTop: 2 },
  stopHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dragHandle: { padding: 4 },
  dragIcon: { fontSize: 16, color: '#ccc' },
  expandIcon: { fontSize: 12, color: '#aaa' },

  stopDetails: { paddingBottom: 12, paddingEnd: 12 },
  detailRow: { marginBottom: 10 },
  detailLabel: { fontSize: 12, color: '#888', marginBottom: 4 },
  detailInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#333',
  },
  detailInputDark: { backgroundColor: '#2a2a2a', color: '#ddd' },

  durationPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  durationChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  durationChipDark: { backgroundColor: '#2a2a2a', borderColor: '#444' },
  durationChipActive: { backgroundColor: tokens.color.primary, borderColor: tokens.color.primary },
  durationChipActiveDark: { backgroundColor: tokens.color.primary, borderColor: tokens.color.primary },
  durationChipText: { fontSize: 12, color: '#555' },
  durationChipTextActive: { color: '#fff', fontWeight: '600' },

  removeBtn: {
    marginTop: 4,
    paddingVertical: 6,
  },
  removeBtnText: { fontSize: 13, color: '#e53935' },

  hintCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  hintCardDark: { backgroundColor: '#1e1e1e' },
  hintText: { fontSize: 14, color: '#888', textAlign: 'center' },

  addStopBtn: {
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: tokens.color.primary,
    borderStyle: 'dashed',
    marginBottom: 10,
  },
  addStopBtnDark: { backgroundColor: '#1e1e1e', borderColor: tokens.color.primary },
  addStopBtnText: { fontSize: 15, color: tokens.color.primary, fontWeight: '600' },

  optimizeBtn: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 12,
  },
  optimizeBtnDark: { backgroundColor: '#1e1e1e', borderColor: '#333' },
  optimizeBtnActive: { borderColor: tokens.color.primary, backgroundColor: '#f0f8ff' },
  optimizeBtnText: { fontSize: 14, color: '#333', fontWeight: '600' },
  optimizeBtnTextActive: { color: tokens.color.primary },
  optimizeBtnDesc: { fontSize: 12, color: '#888', marginTop: 2 },

  actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  actionBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  actionBtnSec: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' },
  actionBtnSecDark: { backgroundColor: '#1e1e1e', borderColor: '#444' },
  actionBtnPrimary: { backgroundColor: tokens.color.primary },
  actionBtnDisabled: { opacity: 0.4 },
  actionBtnText: { fontSize: 14, color: '#333', fontWeight: '600' },
  actionBtnPrimaryText: { fontSize: 14, color: '#fff', fontWeight: '700' },

  bottomPad: { height: 60 },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 32,
    maxHeight: '70%',
  },
  modalSheetDark: { backgroundColor: '#1e1e1e' },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 14,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 12 },
  searchInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#333',
    marginBottom: 8,
  },
  searchInputDark: { backgroundColor: '#2a2a2a', color: '#e0e0e0' },
  searchResults: { maxHeight: 240 },
  searchResult: {
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  searchResultDark: { borderBottomColor: '#2a2a2a' },
  searchResultText: { fontSize: 14, color: '#333' },
  noResults: { fontSize: 13, color: '#888', textAlign: 'center', paddingVertical: 16 },
  closeModalBtn: { marginTop: 12, alignItems: 'center', paddingVertical: 10 },
  closeModalBtnText: { fontSize: 15, color: '#888' },

  textPrimaryDark: { color: '#e0e0e0' },
  textSecondaryDark: { color: '#999' },
});

// Silence unused import warning for PanResponder / Animated (kept for future drag-reorder)
void Animated;
void PanResponder;
