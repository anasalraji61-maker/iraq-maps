/**
 * IncidentMarker – a single animated map marker for a traffic incident.
 *
 * Features:
 *  - Per-type emoji icon with severity-coded border color.
 *  - Pulse animation for incidents younger than 10 minutes.
 *  - Expanded tooltip with confirm / dispute inline buttons.
 *  - Expiry countdown.
 *
 * Used by IncidentMarkers (the collection wrapper).
 */
/* eslint-disable i18next/no-literal-string, no-restricted-syntax */
import type { Incident, IncidentSeverity, IncidentType } from '@iraq-maps/contracts';
import { Marker as MarkerView } from '@maplibre/maplibre-react-native';
import { tokens } from '@iraq-maps/ui';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '../strings';

// ---------------------------------------------------------------------------
// Visual config
// ---------------------------------------------------------------------------

const INCIDENT_CONFIG: Record<
  IncidentType,
  { emoji: string; labelKey: Parameters<typeof t>[0] }
> = {
  accident:     { emoji: '🚨', labelKey: 'incidents.typeAccident' },
  road_closure: { emoji: '🚫', labelKey: 'incidents.typeRoadClosure' },
  pothole:      { emoji: '🕳️', labelKey: 'incidents.typePothole' },
  flooding:     { emoji: '🌊', labelKey: 'incidents.typeFlooding' },
  traffic_jam:  { emoji: '🚗', labelKey: 'incidents.typeTrafficJam' },
  wrong_way:    { emoji: '⛔', labelKey: 'incidents.typeWrongWay' },
  hazard:       { emoji: '⚠️', labelKey: 'incidents.typeHazard' },
  police:       { emoji: '👮', labelKey: 'incidents.typePolice' },
  speed_camera: { emoji: '📷', labelKey: 'incidents.typeSpeedCamera' },
  roadblock:    { emoji: '🚧', labelKey: 'incidents.typeRoadblock' },
  flood:        { emoji: '🌊', labelKey: 'incidents.typeFlood' },
  construction: { emoji: '🏗️', labelKey: 'incidents.typeConstruction' },
  other:        { emoji: '❓', labelKey: 'incidents.typeOther' },
};

const SEVERITY_COLOR: Record<IncidentSeverity, string> = {
  minor:    '#F59E0B',
  moderate: '#F97316',
  severe:   '#EF4444',
};

/** Incidents created within this many ms show a pulse animation. */
const PULSE_WINDOW_MS = 10 * 60_000; // 10 minutes

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface IncidentMarkerProps {
  incident: Incident;
  onConfirm?: (id: string) => void;
  onDispute?: (id: string) => void;
}

export function IncidentMarker({
  incident,
  onConfirm,
  onDispute,
}: IncidentMarkerProps): ReactElement {
  const cfg = INCIDENT_CONFIG[incident.type] ?? INCIDENT_CONFIG.other;
  const severityColor = SEVERITY_COLOR[incident.severity] ?? SEVERITY_COLOR.moderate;
  const [lng, lat] = incident.location;
  const [expanded, setExpanded] = useState(false);

  const isRecent =
    Date.now() - new Date(incident.createdAt).getTime() < PULSE_WINDOW_MS;

  return (
    <MarkerView lngLat={[lng, lat]}>
      <View>
        {/* Pulse ring for recent incidents */}
        {isRecent && <PulseRing color={severityColor} />}

        {/* Pin */}
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={t(cfg.labelKey)}
          style={styles.pinWrapper}
        >
          <View
            style={[
              styles.pin,
              {
                borderColor: severityColor,
                backgroundColor: `${severityColor}22`,
              },
            ]}
          >
            <Text style={styles.pinEmoji}>{cfg.emoji}</Text>
          </View>
        </Pressable>

        {/* Tooltip */}
        {expanded && (
          <IncidentTooltip
            incident={incident}
            cfg={cfg}
            severityColor={severityColor}
            onConfirm={onConfirm}
            onDispute={onDispute}
            onClose={() => setExpanded(false)}
          />
        )}
      </View>
    </MarkerView>
  );
}

// ---------------------------------------------------------------------------
// Pulse ring
// ---------------------------------------------------------------------------

function PulseRing({ color }: { color: string }): ReactElement {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 2.2, duration: 900, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1,   duration: 0,   useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0, duration: 900, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.6, duration: 0, useNativeDriver: true }),
        ]),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [scale, opacity]);

  return (
    <Animated.View
      style={[
        styles.pulseRing,
        { borderColor: color, transform: [{ scale }], opacity },
      ]}
      pointerEvents="none"
    />
  );
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

interface TooltipProps {
  incident: Incident;
  cfg: { emoji: string; labelKey: Parameters<typeof t>[0] };
  severityColor: string;
  onConfirm?: (id: string) => void;
  onDispute?: (id: string) => void;
  onClose: () => void;
}

function IncidentTooltip({
  incident,
  cfg,
  severityColor,
  onConfirm,
  onDispute,
  onClose,
}: TooltipProps): ReactElement {
  const remaining = formatRemaining(incident.expiresAt);
  const [confirming, setConfirming] = useState(false);
  const [disputing, setDisputing] = useState(false);

  const handleConfirm = async () => {
    if (!onConfirm) return;
    setConfirming(true);
    try { onConfirm(incident.id); } finally { setConfirming(false); }
  };

  const handleDispute = async () => {
    if (!onDispute) return;
    setDisputing(true);
    try { onDispute(incident.id); } finally { setDisputing(false); }
  };

  return (
    <View style={styles.tooltip}>
      {/* Header row */}
      <View style={styles.tooltipHeader}>
        <Text style={styles.tooltipEmoji}>{cfg.emoji}</Text>
        <Text style={styles.tooltipType}>{t(cfg.labelKey)}</Text>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('incidents.close')}>
          <Text style={styles.tooltipClose}>✕</Text>
        </Pressable>
      </View>

      {/* Severity badge */}
      <View style={[styles.severityBadge, { backgroundColor: `${severityColor}20` }]}>
        <Text style={[styles.severityBadgeText, { color: severityColor }]}>
          {t(`incidents.severity${capitalize(incident.severity)}` as Parameters<typeof t>[0])}
        </Text>
      </View>

      {/* Description */}
      {incident.description ? (
        <Text style={styles.tooltipDesc} numberOfLines={3}>
          {incident.description}
        </Text>
      ) : null}

      {/* Expiry */}
      <Text style={styles.tooltipExpiry}>
        {t('incidents.expiresAt', { time: remaining })}
      </Text>

      {/* Vote buttons */}
      <View style={styles.voteRow}>
        <Pressable
          style={[
            styles.voteBtn,
            styles.voteBtnConfirm,
            incident.confirmedByMe && styles.voteBtnActive,
            confirming && styles.voteBtnDisabled,
          ]}
          onPress={() => { void handleConfirm(); }}
          disabled={confirming}
          accessibilityRole="button"
          accessibilityLabel={t('incidents.confirmBtn')}
        >
          <Text style={styles.voteBtnText}>
            ✓ {t('incidents.confirmBtn')} ({incident.confirmedCount})
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.voteBtn,
            styles.voteBtnDispute,
            incident.disputedByMe && styles.voteBtnActiveRed,
            disputing && styles.voteBtnDisabled,
          ]}
          onPress={() => { void handleDispute(); }}
          disabled={disputing}
          accessibilityRole="button"
          accessibilityLabel={t('incidents.disputeBtn')}
        >
          <Text style={styles.voteBtnText}>
            ✗ {t('incidents.disputeBtn')} ({incident.disputedCount})
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRemaining(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  const totalMinutes = Math.max(0, Math.round(diff / 60_000));
  if (totalMinutes < 1) return t('incidents.expiresLessThanHour');
  if (totalMinutes < 60) return t('incidents.expiresMinutes', { m: totalMinutes });
  const h = Math.round(totalMinutes / 60);
  return t('incidents.expiresHours', { h });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  pinWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pin: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  pinEmoji: {
    fontSize: 18,
  },
  pulseRing: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    top: 0,
    start: 0,
  },
  tooltip: {
    position: 'absolute',
    bottom: 44,
    start: -80,
    width: 220,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.m,
    padding: tokens.space.m,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    gap: tokens.space.xs,
  },
  tooltipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.xs,
  },
  tooltipEmoji: {
    fontSize: 16,
  },
  tooltipType: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: tokens.color.text,
  },
  tooltipClose: {
    fontSize: 14,
    color: tokens.color.textMuted,
    padding: 2,
  },
  severityBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: tokens.space.s,
    paddingVertical: 2,
    borderRadius: tokens.radius.s,
  },
  severityBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  tooltipDesc: {
    fontSize: 12,
    color: tokens.color.textMuted,
    lineHeight: 16,
  },
  tooltipExpiry: {
    fontSize: 11,
    color: tokens.color.textMuted,
  },
  voteRow: {
    flexDirection: 'row',
    gap: tokens.space.xs,
    marginTop: tokens.space.xs,
  },
  voteBtn: {
    flex: 1,
    paddingVertical: tokens.space.xs,
    borderRadius: tokens.radius.s,
    alignItems: 'center',
    borderWidth: 1,
  },
  voteBtnConfirm: {
    borderColor: '#22C55E',
    backgroundColor: '#F0FDF4',
  },
  voteBtnDispute: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  voteBtnActive: {
    backgroundColor: '#22C55E',
  },
  voteBtnActiveRed: {
    backgroundColor: '#EF4444',
  },
  voteBtnDisabled: {
    opacity: 0.5,
  },
  voteBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: tokens.color.text,
  },
});
