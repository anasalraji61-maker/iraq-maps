/**
 * IncidentMarkers – renders coloured pin markers for traffic incidents on the map.
 *
 * Uses React Native View markers (via MapLibre's MarkerView) overlaid on the
 * MapCanvas.  Each incident type gets a distinct emoji + colour.
 */
import type { Incident, IncidentType } from '@iraq-maps/contracts';
import { Marker as MarkerView } from '@maplibre/maplibre-react-native';
import { tokens } from '@iraq-maps/ui';
import { useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { t } from '../strings';

// ---------------------------------------------------------------------------
// Incident type visual config
// ---------------------------------------------------------------------------
const INCIDENT_CONFIG: Record<
  IncidentType,
  { emoji: string; color: string; labelKey: string }
> = {
  accident:     { emoji: '🚨', color: '#EF4444', labelKey: 'incidents.typeAccident' },
  roadblock:    { emoji: '🚧', color: '#F59E0B', labelKey: 'incidents.typeRoadblock' },
  flood:        { emoji: '🌊', color: '#3B82F6', labelKey: 'incidents.typeFlood' },
  construction: { emoji: '🏗️', color: '#F97316', labelKey: 'incidents.typeConstruction' },
  other:        { emoji: '⚠️', color: '#6B7280', labelKey: 'incidents.typeOther' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface IncidentMarkersProps {
  incidents: Incident[];
}

export function IncidentMarkers({ incidents }: IncidentMarkersProps): ReactElement {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <>
      {incidents.map((inc) => {
        const cfg = INCIDENT_CONFIG[inc.type] ?? INCIDENT_CONFIG.other;
        const [lng, lat] = inc.location;
        const isSelected = selectedId === inc.id;

        return (
          <MarkerView key={inc.id} lngLat={[lng, lat]}>
            <Pressable
              onPress={() => setSelectedId((prev) => (prev === inc.id ? null : inc.id))}
              accessibilityRole="button"
              accessibilityLabel={t(cfg.labelKey as Parameters<typeof t>[0])}
            >
              <View style={[styles.pin, { backgroundColor: cfg.color }]}>
                <RNText style={styles.emoji}>{cfg.emoji}</RNText>
              </View>

              {isSelected && (
                <View style={styles.tooltip} accessibilityRole="text">
                  <RNText style={styles.tooltipType}>
                    {t(cfg.labelKey as Parameters<typeof t>[0])}
                  </RNText>
                  {inc.description ? (
                    <RNText style={styles.tooltipDesc} numberOfLines={3}>
                      {inc.description}
                    </RNText>
                  ) : null}
                  <RNText style={styles.tooltipTime}>
                    {t('incidents.expiresAt', { time: formatRelative(inc.expiresAt) })}
                  </RNText>
                </View>
              )}
            </Pressable>
          </MarkerView>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatRelative(isoDate: string): string {
  const diff = new Date(isoDate).getTime() - Date.now();
  const h = Math.max(0, Math.round(diff / 3_600_000));
  if (h === 0) return t('incidents.expiresLessThanHour');
  return t('incidents.expiresHours', { h: String(h) });
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  pin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  emoji: {
    fontSize: 16,
  },
  tooltip: {
    position: 'absolute',
    bottom: 38,
    start: 0,
    backgroundColor: tokens.color.bg,
    borderRadius: tokens.radius.m,
    padding: tokens.space.s,
    minWidth: 160,
    maxWidth: 240,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    gap: tokens.space.xs,
  },
  tooltipType: {
    fontWeight: '700',
    fontSize: 13,
    color: tokens.color.text,
  },
  tooltipDesc: {
    fontSize: 12,
    color: tokens.color.textMuted,
  },
  tooltipTime: {
    fontSize: 11,
    color: tokens.color.textMuted,
  },
});
