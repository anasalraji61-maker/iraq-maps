/**
 * ReportIncidentScreen – full-screen incident reporting flow.
 *
 * Tabs:
 *  1. Report – pin location on map, pick type, severity, description, submit.
 *  2. My Reports – list of incidents the current user has reported.
 *
 * All text goes through t(). Layouts use start/end instead of left/right.
 */
import type { Incident, IncidentSeverity, IncidentType, LngLat } from '@iraq-maps/contracts';
import { useApi } from '@iraq-maps/mobile-kit';
import { tokens } from '@iraq-maps/ui';
import { Camera, Map as MapView, ShapeSource, SymbolLayer } from '@maplibre/maplibre-react-native';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { t } from '../strings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = 'report' | 'myReports';

interface ReportIncidentScreenProps {
  /** Initial location to pre-fill the pin (user's current location). */
  initialLocation?: LngLat | null;
  onClose?: () => void;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const INCIDENT_TYPES: Array<{
  type: IncidentType;
  emoji: string;
  labelKey: Parameters<typeof t>[0];
}> = [
  { type: 'accident',     emoji: '🚨', labelKey: 'incidents.typeAccident' },
  { type: 'road_closure', emoji: '🚫', labelKey: 'incidents.typeRoadClosure' },
  { type: 'pothole',      emoji: '🕳️', labelKey: 'incidents.typePothole' },
  { type: 'flooding',     emoji: '🌊', labelKey: 'incidents.typeFlooding' },
  { type: 'traffic_jam',  emoji: '🚗', labelKey: 'incidents.typeTrafficJam' },
  { type: 'wrong_way',    emoji: '⛔', labelKey: 'incidents.typeWrongWay' },
  { type: 'hazard',       emoji: '⚠️', labelKey: 'incidents.typeHazard' },
  { type: 'police',       emoji: '👮', labelKey: 'incidents.typePolice' },
  { type: 'speed_camera', emoji: '📷', labelKey: 'incidents.typeSpeedCamera' },
  { type: 'construction', emoji: '🏗️', labelKey: 'incidents.typeConstruction' },
  { type: 'other',        emoji: '❓', labelKey: 'incidents.typeOther' },
];

const SEVERITY_OPTIONS: Array<{
  value: IncidentSeverity;
  labelKey: Parameters<typeof t>[0];
  color: string;
}> = [
  { value: 'minor',    labelKey: 'incidents.severityMinor',    color: '#F59E0B' },
  { value: 'moderate', labelKey: 'incidents.severityModerate', color: '#F97316' },
  { value: 'severe',   labelKey: 'incidents.severitySevere',   color: '#EF4444' },
];

const SEVERITY_COLOR: Record<IncidentSeverity, string> = {
  minor: '#F59E0B',
  moderate: '#F97316',
  severe: '#EF4444',
};

const TYPE_EMOJI: Partial<Record<IncidentType, string>> = Object.fromEntries(
  INCIDENT_TYPES.map(({ type, emoji }) => [type, emoji]),
);

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function ReportIncidentScreen({
  initialLocation,
  onClose,
}: ReportIncidentScreenProps): ReactElement {
  const [activeTab, setActiveTab] = useState<Tab>('report');

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('incidents.screenTitle')}</Text>
        {onClose ? (
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('incidents.close')} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TabButton label={t('incidents.tabReport')} active={activeTab === 'report'} onPress={() => setActiveTab('report')} />
        <TabButton label={t('incidents.tabMyReports')} active={activeTab === 'myReports'} onPress={() => setActiveTab('myReports')} />
      </View>

      {activeTab === 'report' ? (
        <ReportTab initialLocation={initialLocation} onSuccess={() => setActiveTab('myReports')} />
      ) : (
        <MyReportsTab />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tab button
// ---------------------------------------------------------------------------

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}): ReactElement {
  return (
    <Pressable
      style={[styles.tab, active && styles.tabActive]}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Report tab
// ---------------------------------------------------------------------------

function ReportTab({
  initialLocation,
  onSuccess,
}: {
  initialLocation?: LngLat | null;
  onSuccess?: () => void;
}): ReactElement {
  const api = useApi();
  const defaultLoc: LngLat = initialLocation ?? [44.361, 33.325]; // Baghdad centre
  const [pinLocation, setPinLocation] = useState<LngLat>(defaultLoc);
  const [selectedType, setSelectedType] = useState<IncidentType | null>(null);
  const [selectedSeverity, setSelectedSeverity] = useState<IncidentSeverity>('moderate');
  const [description, setDescription] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = selectedType !== null && !submitting;

  const handleMapPress = useCallback((event: { geometry?: { coordinates?: [number, number] } }) => {
    const coords = event?.geometry?.coordinates;
    if (coords && coords.length === 2) {
      setPinLocation([coords[0], coords[1]]);
    }
  }, []);

  const handleSubmit = async () => {
    if (!selectedType) return;
    setSubmitting(true);
    try {
      const res = await api.incidents.create({
        body: {
          type: selectedType,
          severity: selectedSeverity,
          location: pinLocation,
          description: description.trim() || undefined,
          ttlHours: 2,
          anonymous,
        },
      });
      if (res.status === 201) {
        Alert.alert(t('incidents.reportedTitle'), t('incidents.reportedMsg'));
        onSuccess?.();
      } else {
        Alert.alert(t('incidents.errorTitle'), t('incidents.errorMsg'));
      }
    } catch {
      Alert.alert(t('incidents.errorTitle'), t('incidents.errorMsg'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.reportScroll} keyboardShouldPersistTaps="handled">
      {/* Map pin selector */}
      <Text style={styles.sectionLabel}>{t('incidents.pinLabel')}</Text>
      <View style={styles.mapContainer}>
        <MapView
          style={styles.map}
          onPress={handleMapPress}
          compassEnabled={false}
          logoEnabled={false}
          attributionEnabled={false}
        >
          <Camera
            zoomLevel={14}
            centerCoordinate={pinLocation}
            animationMode="flyTo"
            animationDuration={400}
          />
          <ShapeSource
            id="pin"
            shape={{ type: 'Feature', geometry: { type: 'Point', coordinates: pinLocation }, properties: {} }}
          >
            <SymbolLayer
              id="pinSymbol"
              style={{ iconSize: 1.5, iconAllowOverlap: true }}
            />
          </ShapeSource>
        </MapView>
        <View style={styles.mapOverlay} pointerEvents="none">
          <Text style={styles.mapOverlayText}>{t('incidents.tapToPin')}</Text>
        </View>
      </View>

      {/* Type selector */}
      <Text style={styles.sectionLabel}>{t('incidents.typeLabel')}</Text>
      <View style={styles.typeGrid}>
        {INCIDENT_TYPES.map(({ type, emoji, labelKey }) => (
          <Pressable
            key={type}
            style={[styles.typeBtn, selectedType === type && styles.typeBtnSelected]}
            onPress={() => setSelectedType(type)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selectedType === type }}
            accessibilityLabel={t(labelKey)}
          >
            <Text style={styles.typeEmoji}>{emoji}</Text>
            <Text style={[styles.typeBtnLabel, selectedType === type && styles.typeBtnLabelSelected]}>
              {t(labelKey)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Severity picker */}
      <Text style={styles.sectionLabel}>{t('incidents.severityLabel')}</Text>
      <View style={styles.severityRow}>
        {SEVERITY_OPTIONS.map(({ value, labelKey, color }) => (
          <Pressable
            key={value}
            style={[
              styles.severityBtn,
              selectedSeverity === value && { borderColor: color, backgroundColor: `${color}20` },
            ]}
            onPress={() => setSelectedSeverity(value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selectedSeverity === value }}
            accessibilityLabel={t(labelKey)}
          >
            <View style={[styles.severityDot, { backgroundColor: color }]} />
            <Text style={[styles.severityLabel, selectedSeverity === value && { color }]}>
              {t(labelKey)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Description */}
      <Text style={styles.sectionLabel}>{t('incidents.descriptionLabel')}</Text>
      <TextInput
        style={styles.descInput}
        value={description}
        onChangeText={(v) => setDescription(v.slice(0, 500))}
        placeholder={t('incidents.descriptionPlaceholder')}
        placeholderTextColor={tokens.color.textMuted}
        multiline
        maxLength={500}
        textAlign="right"
        accessibilityLabel={t('incidents.descriptionLabel')}
      />
      <Text style={styles.charCount}>{500 - description.length}</Text>

      {/* Anonymous toggle */}
      <View style={styles.toggleRow}>
        <View style={styles.toggleLabelGroup}>
          <Text style={styles.toggleLabel}>{t('incidents.anonymousLabel')}</Text>
          <Text style={styles.toggleSubLabel}>{t('incidents.anonymousSub')}</Text>
        </View>
        <Switch
          value={anonymous}
          onValueChange={setAnonymous}
          accessibilityLabel={t('incidents.anonymousLabel')}
        />
      </View>

      {/* Submit */}
      <Pressable
        style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
        onPress={() => { void handleSubmit(); }}
        disabled={!canSubmit}
        accessibilityRole="button"
        accessibilityLabel={t('incidents.submitBtn')}
      >
        {submitting ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.submitBtnText}>{t('incidents.submitBtn')}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// My reports tab
// ---------------------------------------------------------------------------

function MyReportsTab(): ReactElement {
  const api = useApi();
  const [items, setItems] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // List near Baghdad centre as proxy; in production filter by userId server-side
      const res = await api.incidents.list({
        query: { lat: 33.325, lng: 44.361, radiusKm: 50 },
      });
      if (res.status === 200) {
        setItems(res.body.items);
      } else {
        setError(t('incidents.errorMsg'));
      }
    } catch {
      setError(t('incidents.errorMsg'));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <View style={styles.centerFlex}>
        <ActivityIndicator size="large" color={tokens.color.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerFlex}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable onPress={() => { void load(); }} style={styles.retryBtn}>
          <Text style={styles.retryBtnText}>{t('incidents.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.centerFlex}>
        <Text style={styles.emptyEmoji}>🚦</Text>
        <Text style={styles.emptyText}>{t('incidents.noReports')}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => <IncidentListItem incident={item} />}
    />
  );
}

// ---------------------------------------------------------------------------
// Incident list item
// ---------------------------------------------------------------------------

function IncidentListItem({ incident }: { incident: Incident }): ReactElement {
  const cfg = INCIDENT_TYPES.find((x) => x.type === incident.type) ?? INCIDENT_TYPES[INCIDENT_TYPES.length - 1];
  const severityColor = SEVERITY_COLOR[incident.severity] ?? '#6B7280';
  const now = new Date();
  const expiresAt = new Date(incident.expiresAt);
  const remainingMs = expiresAt.getTime() - now.getTime();
  const remainingH = Math.max(0, Math.round(remainingMs / 3_600_000));

  return (
    <View style={styles.listItem}>
      <View style={[styles.listItemIcon, { backgroundColor: `${severityColor}20` }]}>
        <Text style={styles.listItemEmoji}>{cfg?.emoji ?? '⚠️'}</Text>
      </View>
      <View style={styles.listItemBody}>
        <Text style={styles.listItemType}>{t(cfg?.labelKey ?? 'incidents.typeOther')}</Text>
        {incident.description ? (
          <Text style={styles.listItemDesc} numberOfLines={2}>{incident.description}</Text>
        ) : null}
        <View style={styles.listItemMeta}>
          <View style={[styles.severityBadge, { backgroundColor: `${severityColor}20` }]}>
            <Text style={[styles.severityBadgeText, { color: severityColor }]}>
              {t(SEVERITY_OPTIONS.find((s) => s.value === incident.severity)?.labelKey ?? 'incidents.severityModerate')}
            </Text>
          </View>
          <Text style={styles.listItemExpiry}>
            {remainingH === 0
              ? t('incidents.expiresLessThanHour')
              : t('incidents.expiresHours', { h: remainingH })}
          </Text>
        </View>
        <View style={styles.voteRow}>
          <Text style={styles.voteCount}>✓ {incident.confirmedCount}</Text>
          <Text style={styles.voteCount}>✗ {incident.disputedCount}</Text>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.space.m,
    paddingVertical: tokens.space.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: tokens.color.text,
  },
  closeBtn: {
    padding: tokens.space.s,
  },
  closeBtnText: {
    fontSize: 18,
    color: tokens.color.textMuted,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: tokens.color.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.border,
  },
  tab: {
    flex: 1,
    paddingVertical: tokens.space.m,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: tokens.color.primary,
  },
  tabText: {
    fontSize: 14,
    color: tokens.color.textMuted,
    fontWeight: '500',
  },
  tabTextActive: {
    color: tokens.color.primary,
    fontWeight: '700',
  },
  reportScroll: {
    padding: tokens.space.m,
    paddingBottom: tokens.space.xl,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: tokens.color.textMuted,
    marginTop: tokens.space.l,
    marginBottom: tokens.space.s,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mapContainer: {
    height: 200,
    borderRadius: tokens.radius.m,
    overflow: 'hidden',
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  mapOverlay: {
    position: 'absolute',
    bottom: tokens.space.s,
    start: tokens.space.s,
    end: tokens.space.s,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: tokens.radius.s,
    padding: tokens.space.xs,
    alignItems: 'center',
  },
  mapOverlayText: {
    color: '#FFF',
    fontSize: 12,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.space.s,
  },
  typeBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.m,
    padding: tokens.space.s,
    minWidth: 76,
    borderWidth: 1.5,
    borderColor: tokens.color.border,
    gap: tokens.space.xs,
  },
  typeBtnSelected: {
    borderColor: tokens.color.primary,
    backgroundColor: `${tokens.color.primary}15`,
  },
  typeEmoji: {
    fontSize: 24,
  },
  typeBtnLabel: {
    fontSize: 11,
    color: tokens.color.textMuted,
    textAlign: 'center',
  },
  typeBtnLabelSelected: {
    color: tokens.color.primary,
    fontWeight: '600',
  },
  severityRow: {
    flexDirection: 'row',
    gap: tokens.space.s,
  },
  severityBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space.xs,
    paddingVertical: tokens.space.s,
    borderRadius: tokens.radius.m,
    borderWidth: 1.5,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  severityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  severityLabel: {
    fontSize: 12,
    color: tokens.color.textMuted,
    fontWeight: '500',
  },
  descInput: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.m,
    padding: tokens.space.m,
    fontSize: 15,
    color: tokens.color.text,
    minHeight: 80,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.color.border,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 11,
    color: tokens.color.textMuted,
    textAlign: 'right',
    marginTop: tokens.space.xs,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.m,
    padding: tokens.space.m,
    marginTop: tokens.space.m,
  },
  toggleLabelGroup: {
    flex: 1,
    marginEnd: tokens.space.m,
  },
  toggleLabel: {
    fontSize: 15,
    color: tokens.color.text,
    fontWeight: '500',
  },
  toggleSubLabel: {
    fontSize: 12,
    color: tokens.color.textMuted,
    marginTop: 2,
  },
  submitBtn: {
    backgroundColor: tokens.color.primary,
    borderRadius: tokens.radius.m,
    paddingVertical: tokens.space.m,
    alignItems: 'center',
    marginTop: tokens.space.l,
  },
  submitBtnDisabled: {
    backgroundColor: tokens.color.textMuted,
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  centerFlex: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space.m,
    padding: tokens.space.l,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: tokens.color.primary,
    borderRadius: tokens.radius.m,
    paddingHorizontal: tokens.space.l,
    paddingVertical: tokens.space.s,
  },
  retryBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyEmoji: {
    fontSize: 48,
  },
  emptyText: {
    fontSize: 15,
    color: tokens.color.textMuted,
    textAlign: 'center',
  },
  listContent: {
    padding: tokens.space.m,
    gap: tokens.space.s,
  },
  listItem: {
    flexDirection: 'row',
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.m,
    padding: tokens.space.m,
    gap: tokens.space.m,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  listItemIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listItemEmoji: {
    fontSize: 22,
  },
  listItemBody: {
    flex: 1,
    gap: tokens.space.xs,
  },
  listItemType: {
    fontSize: 15,
    fontWeight: '700',
    color: tokens.color.text,
  },
  listItemDesc: {
    fontSize: 13,
    color: tokens.color.textMuted,
  },
  listItemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.s,
  },
  severityBadge: {
    paddingHorizontal: tokens.space.s,
    paddingVertical: 2,
    borderRadius: tokens.radius.s,
  },
  severityBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  listItemExpiry: {
    fontSize: 11,
    color: tokens.color.textMuted,
  },
  voteRow: {
    flexDirection: 'row',
    gap: tokens.space.m,
  },
  voteCount: {
    fontSize: 12,
    color: tokens.color.textMuted,
  },
});
