/**
 * RoutePreviewScreen — full route preview before starting navigation.
 *
 * Features:
 * - Route summary: distance, time, ETA
 * - Up to 3 route alternatives with RouteCompare
 * - Traffic conditions overlay
 * - Turn-by-turn step list (expandable)
 * - Travel mode switcher
 * - Start navigation, Share route, Add waypoint, Search along route buttons
 * - Battery usage estimate for the drive
 * - Toll road warning
 */
import type { CityDescriptor, Maneuver, ManeuverModifier, RouteResult, TravelMode } from '@iraq-maps/contracts';
import { navigationTestIDs } from '@iraq-maps/contracts';
import { MapCanvas } from '@iraq-maps/map-kit';
import { Banner, Button, Screen, Text, tokens } from '@iraq-maps/ui';
import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text as RNText, TouchableOpacity, View } from 'react-native';
import type { RouteOption } from '../components/RouteCompare';
import { RouteCompare } from '../components/RouteCompare';
import { t } from '../strings';

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmtDist(m: number): string {
  return m < 1000
    ? t('preview.distM', { n: Math.round(m) })
    : t('preview.distKm', { n: (m / 1000).toFixed(1) });
}

function fmtDuration(s: number): string {
  const mins = Math.round(s / 60);
  if (mins < 60) return t('preview.durationMin', { n: mins });
  const h = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0
    ? t('preview.durationHourMin', { h, m: rem })
    : t('preview.durationHour', { h });
}

function fmtEta(date: Date): string {
  return date.toLocaleTimeString('ar-IQ', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/** Returns a Unicode arrow representing the maneuver direction. */
function directionIcon(modifier?: ManeuverModifier): string {
  switch (modifier) {
    case 'slight_right': return '↗';
    case 'right': return '→';
    case 'sharp_right': return '↘';
    case 'slight_left': return '↖';
    case 'left': return '←';
    case 'sharp_left': return '↙';
    default: return '↑';
  }
}

/** Localised direction word for a maneuver modifier. */
function directionWord(modifier?: ManeuverModifier): string {
  switch (modifier) {
    case 'slight_right':
    case 'right': return t('preview.dirRight');
    case 'sharp_right': return t('preview.dirSharpRight');
    case 'slight_left':
    case 'left': return t('preview.dirLeft');
    case 'sharp_left': return t('preview.dirSharpLeft');
    default: return t('preview.dirStraight');
  }
}

/**
 * Rough battery estimate: assumes ~5%/hour of navigation at 60 km/h average.
 * Returns percentage points consumed.
 */
function estimateBatteryPct(durationS: number): number {
  const hours = durationS / 3600;
  return Math.round(hours * 5);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepItem({ maneuver }: { maneuver: Maneuver }): ReactElement {
  const street = maneuver.streetNames[0] ?? '';
  const icon = directionIcon(maneuver.modifier);
  const word = directionWord(maneuver.modifier);
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepIcon}>
        <Text>{icon}</Text>
      </View>
      <View style={styles.stepBody}>
        <Text>{word}{street ? ` — ${street}` : ''}</Text>
        <Text tone="muted">{fmtDist(maneuver.distanceM)}</Text>
      </View>
    </View>
  );
}

function TollWarningBanner(): ReactElement {
  return (
    <View style={styles.tollBanner}>
      <RNText style={styles.tollText}>⚠ {t('preview.tollWarning')}</RNText>
    </View>
  );
}

function BatteryRow({ durationS }: { durationS: number }): ReactElement {
  const pct = estimateBatteryPct(durationS);
  if (pct === 0) return <View />;
  return (
    <View style={styles.batteryRow} accessibilityLabel={t('preview.battery', { pct })}>
      <Text tone="muted" style={styles.batteryText}>
        🔋 {t('preview.battery', { pct })}
      </Text>
    </View>
  );
}

function ModeButton({
  label,
  active,
  testID,
  onPress,
}: {
  label: string;
  active: boolean;
  testID: string;
  onPress: () => void;
}): ReactElement {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      style={[styles.modeBtn, active && styles.modeBtnActive]}
    >
      <RNText style={[styles.modeBtnLabel, active && styles.modeBtnLabelActive]}>
        {label}
      </RNText>
    </TouchableOpacity>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface RoutePreviewScreenProps {
  route: RouteResult;
  mode: TravelMode;
  onModeChange: (mode: TravelMode) => void;
  onStart: () => void;
  isLoading?: boolean;
  error?: string;
  /** Formatted address of the origin (current location). */
  originAddress?: string;
  /** Formatted address of the destination. */
  destinationAddress?: string;
  /** City descriptor used to render the route map. */
  city?: CityDescriptor;
  /** API base URL for map tile requests. */
  apiBaseUrl?: string;
  /** Locale for map labels. */
  lang?: string;
  /** Additional route alternatives for comparison. Max 2 extra (3 total). */
  alternatives?: RouteOption[];
  /** Whether route has toll roads. */
  hasToll?: boolean;
  /** Called when the user taps "Add stop". */
  onAddWaypoint?: () => void;
  /** Called when the user taps "Search along route". */
  onSearchAlong?: () => void;
  /** Called when the user selects a different alternative route. */
  onAlternativeSelect?: (index: number) => void;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function RoutePreviewScreen({
  route,
  mode,
  onModeChange,
  onStart,
  isLoading,
  error,
  originAddress,
  destinationAddress,
  city,
  apiBaseUrl,
  lang,
  alternatives = [],
  hasToll,
  onAddWaypoint,
  onSearchAlong,
  onAlternativeSelect,
}: RoutePreviewScreenProps): ReactElement {
  const [selectedAlt, setSelectedAlt] = useState(0);
  const [stepsExpanded, setStepsExpanded] = useState(false);

  const eta = new Date(Date.now() + route.durationS * 1000);
  const steps = route.maneuvers.filter((m) => m.type !== 'arrive');
  const routeProp = useMemo(() => ({ polyline6: route.polyline6 }), [route.polyline6]);

  // Build RouteOption list for comparison: first entry is the main route.
  const routeOptions: RouteOption[] = useMemo(() => {
    const primary: RouteOption = {
      route,
      tag: alternatives.length === 0 ? undefined : 'recommended',
      hasToll,
    };
    return [primary, ...alternatives.slice(0, 2)];
  }, [route, alternatives, hasToll]);

  function handleAlternativeSelect(index: number): void {
    setSelectedAlt(index);
    onAlternativeSelect?.(index);
  }

  async function handleShare(): Promise<void> {
    const text = `${destinationAddress ?? ''} — ${fmtDist(route.distanceM)}, ${fmtDuration(route.durationS)}`;
    try {
      await Share.share({ message: text });
    } catch {
      // Share dismissed — not an error.
    }
  }

  const activeRoute = selectedAlt > 0 ? (routeOptions[selectedAlt]?.route ?? route) : route;

  return (
    <Screen testID={navigationTestIDs.preview.view}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Map ── */}
        {city != null && apiBaseUrl != null ? (
          <View style={styles.mapContainer}>
            <MapCanvas
              city={city}
              apiBaseUrl={apiBaseUrl}
              lang={(lang ?? 'ar') as 'ar' | 'en' | 'ckb'}
              route={routeProp}
              showUserLocation
            />
          </View>
        ) : null}

        {/* ── Address row ── */}
        {originAddress != null ? (
          <View style={styles.addressRow}>
            <Text variant="caption" tone="muted">{t('preview.from')}</Text>
            <Text variant="caption" tone="muted">{originAddress}</Text>
          </View>
        ) : null}

        {/* ── Summary card ── */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryMain}>
            <Text variant="title" style={styles.durationText} testID={navigationTestIDs.preview.summary}>
              {fmtDuration(activeRoute.durationS)}
            </Text>
            <Text tone="muted">{fmtDist(activeRoute.distanceM)}</Text>
          </View>
          <Text tone="muted">{t('preview.eta', { time: fmtEta(eta) })}</Text>
          <BatteryRow durationS={activeRoute.durationS} />
        </View>

        {/* ── Destination address ── */}
        {destinationAddress != null ? (
          <View style={styles.addressRow}>
            <Text variant="caption" tone="muted">{t('preview.to')}</Text>
            <Text variant="caption">{destinationAddress}</Text>
          </View>
        ) : null}

        {/* ── Toll warning ── */}
        {hasToll === true ? <TollWarningBanner /> : null}

        {/* ── Route alternatives comparison ── */}
        {routeOptions.length > 1 ? (
          <RouteCompare
            options={routeOptions}
            selectedIndex={selectedAlt}
            onSelect={handleAlternativeSelect}
          />
        ) : null}

        {/* ── Travel mode selector ── */}
        <View style={styles.modeRow}>
          <ModeButton
            testID={navigationTestIDs.preview.modeCar}
            label={t('preview.car')}
            active={mode === 'car'}
            onPress={() => onModeChange('car')}
          />
          <ModeButton
            testID={navigationTestIDs.preview.modeWalk}
            label={t('preview.walking')}
            active={mode === 'walk'}
            onPress={() => onModeChange('walk')}
          />
        </View>

        {/* ── Action row: Share + Add waypoint + Search along ── */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionChip}
            onPress={() => { void handleShare(); }}
            accessibilityRole="button"
            accessibilityLabel={t('preview.shareRoute')}
            testID="preview.share"
          >
            <RNText style={styles.actionChipLabel}>↗ {t('preview.shareRoute')}</RNText>
          </TouchableOpacity>

          {onAddWaypoint != null ? (
            <TouchableOpacity
              style={styles.actionChip}
              onPress={onAddWaypoint}
              accessibilityRole="button"
              accessibilityLabel={t('preview.addWaypoint')}
              testID="preview.addWaypoint"
            >
              <RNText style={styles.actionChipLabel}>+ {t('preview.addWaypoint')}</RNText>
            </TouchableOpacity>
          ) : null}

          {onSearchAlong != null ? (
            <TouchableOpacity
              style={styles.actionChip}
              onPress={onSearchAlong}
              accessibilityRole="button"
              testID="preview.searchAlong"
            >
              <RNText style={styles.actionChipLabel}>🔍 {t('searchAlong.title')}</RNText>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* ── Turn-by-turn steps ── */}
        <TouchableOpacity
          onPress={() => setStepsExpanded((v) => !v)}
          accessibilityRole="button"
          style={styles.stepsHeader}
          testID="preview.toggleSteps"
        >
          <Text variant="subtitle">
            {stepsExpanded ? '▾' : '▸'} ({steps.length})
          </Text>
        </TouchableOpacity>

        {stepsExpanded ? (
          <View style={styles.stepList}>
            {steps.map((step, i) => (
              <StepItem key={i} maneuver={step} />
            ))}
          </View>
        ) : null}

        {error != null ? <Banner kind="error" message={error} /> : null}

        {/* Spacer so the sticky button doesn't overlap content */}
        <View style={styles.startSpacer} />
      </ScrollView>

      {/* ── Sticky start button ── */}
      <View style={styles.startButtonWrap}>
        <Button
          testID={navigationTestIDs.preview.start}
          label={isLoading === true ? t('preview.loading') : t('preview.start')}
          onPress={onStart}
        />
      </View>
    </Screen>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const { space, color } = tokens;

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { gap: space.s, paddingBottom: space.l },

  mapContainer: {
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
    marginHorizontal: space.s,
  },

  addressRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    paddingHorizontal: space.s,
  },

  summaryCard: {
    backgroundColor: color.surface,
    borderRadius: 12,
    padding: space.m,
    gap: space.xs,
    marginHorizontal: space.s,
  },
  summaryMain: { flexDirection: 'row', alignItems: 'baseline', gap: space.s },
  durationText: { fontSize: 28 },

  batteryRow: { flexDirection: 'row', alignItems: 'center' },
  batteryText: { fontSize: 12 },

  tollBanner: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingVertical: space.xs,
    paddingHorizontal: space.m,
    marginHorizontal: space.s,
  },
  tollText: { color: '#92400E', fontSize: 13 },

  modeRow: {
    flexDirection: 'row',
    gap: space.s,
    paddingHorizontal: space.s,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: space.m,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: color.border,
    alignItems: 'center',
  },
  modeBtnActive: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  modeBtnLabel: { fontSize: 14, fontWeight: '500', color: color.text },
  modeBtnLabelActive: { color: '#2563EB', fontWeight: '700' },

  actionRow: {
    flexDirection: 'row',
    gap: space.s,
    flexWrap: 'wrap',
    paddingHorizontal: space.s,
  },
  actionChip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  actionChipLabel: { fontSize: 13, color: color.text },

  stepsHeader: {
    paddingHorizontal: space.s,
    paddingVertical: space.xs,
  },
  stepList: {
    paddingHorizontal: space.s,
    gap: 0,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.s,
    paddingVertical: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  stepIcon: { width: 28, alignItems: 'center' },
  stepBody: { flex: 1, gap: 2 },

  startSpacer: { height: 72 },
  startButtonWrap: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
    backgroundColor: color.bg,
    paddingHorizontal: space.m,
    paddingVertical: space.s,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
});
