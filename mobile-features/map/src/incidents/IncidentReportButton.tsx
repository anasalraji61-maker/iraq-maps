/**
 * IncidentReportButton – floating action button that opens a sheet to report
 * a new traffic incident at the user's current location.
 */
import type { IncidentType, LngLat } from '@iraq-maps/contracts';
import { useApi } from '@iraq-maps/mobile-kit';
import { Button, IconButton, Sheet, Text, tokens } from '@iraq-maps/ui';
import { useState, type ReactElement } from 'react';
import { Alert, Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { t } from '../strings';

// ---------------------------------------------------------------------------
// Incident types the user can report
// ---------------------------------------------------------------------------
const REPORT_TYPES: Array<{ type: IncidentType; emoji: string; labelKey: string }> = [
  { type: 'accident',     emoji: '🚨', labelKey: 'incidents.typeAccident' },
  { type: 'roadblock',    emoji: '🚧', labelKey: 'incidents.typeRoadblock' },
  { type: 'flood',        emoji: '🌊', labelKey: 'incidents.typeFlood' },
  { type: 'construction', emoji: '🏗️', labelKey: 'incidents.typeConstruction' },
  { type: 'other',        emoji: '⚠️', labelKey: 'incidents.typeOther' },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface IncidentReportButtonProps {
  /** The user's current location; nil when location is unavailable. */
  userLocation: LngLat | null;
  /** Called after a successful report so the caller can refresh the list. */
  onReported?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function IncidentReportButton({
  userLocation,
  onReported,
}: IncidentReportButtonProps): ReactElement {
  const api = useApi();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleReport = async (type: IncidentType) => {
    if (!userLocation) {
      Alert.alert(t('incidents.noLocationTitle'), t('incidents.noLocationMsg'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.incidents.create({
        body: {
          type,
          location: userLocation,
          ttlHours: 2,
        },
      });
      if (res.status === 201) {
        setSheetOpen(false);
        onReported?.();
        Alert.alert(t('incidents.reportedTitle'), t('incidents.reportedMsg'));
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
    <>
      <IconButton
        testID="map.incident-report-btn"
        icon="🚨"
        accessibilityLabel={t('incidents.reportBtn')}
        onPress={() => {
          if (!userLocation) {
            Alert.alert(t('incidents.noLocationTitle'), t('incidents.noLocationMsg'));
            return;
          }
          setSheetOpen(true);
        }}
      />

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)}>
        <Text variant="subtitle">{t('incidents.reportTitle')}</Text>
        <Text variant="caption" tone="muted">
          {t('incidents.reportSubtitle')}
        </Text>

        <View style={styles.typeGrid}>
          {REPORT_TYPES.map(({ type, emoji, labelKey }) => (
            <Pressable
              key={type}
              style={styles.typeBtn}
              onPress={() => { void handleReport(type); }}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel={t(labelKey as Parameters<typeof t>[0])}
            >
              <RNText style={styles.typeEmoji}>{emoji}</RNText>
              <Text variant="caption">
                {t(labelKey as Parameters<typeof t>[0])}
              </Text>
            </Pressable>
          ))}
        </View>

        <Button
          label={t('incidents.cancel')}
          variant="secondary"
          onPress={() => setSheetOpen(false)}
        />
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.space.s,
    marginVertical: tokens.space.m,
  },
  typeBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.m,
    padding: tokens.space.m,
    minWidth: 80,
    gap: tokens.space.xs,
  },
  typeEmoji: {
    fontSize: 28,
  },
});
