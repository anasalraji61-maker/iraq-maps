/**
 * Feature: Favorite routes — shows saved routes and lets user start or delete them.
 * Also exposes a "Save Route" flow from the active navigation context.
 */
import { Button, Sheet, Text, TextField, tokens } from '@iraq-maps/ui';
import { useEffect, useState, type ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import { favoriteRoutes, type FavoriteRoute } from '../favoriteRoutes';
import { t } from '../strings';

interface SavedRoutesSheetProps {
  visible: boolean;
  onClose: () => void;
  /** When provided, shows "Save current route" form at the top. */
  currentRoute?: {
    placeId: string;
    destinationName: string;
    mode: string;
    distanceM: number;
    durationS: number;
  } | null;
  /** Called when user taps "Start" on a saved route. */
  onStart?: (route: FavoriteRoute) => void;
}

function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.ceil((s % 3600) / 60);
  if (h === 0) return t('active.durationMin', { n: Math.max(1, m) });
  return t('active.durationHourMin', { h, m });
}

function fmtDist(m: number): string {
  return m < 1000
    ? t('active.distM', { n: Math.round(m) })
    : t('active.distKm', { n: (m / 1000).toFixed(1) });
}

export function SavedRoutesSheet({
  visible,
  onClose,
  currentRoute,
  onStart,
}: SavedRoutesSheetProps): ReactElement {
  const [routes, setRoutes] = useState<FavoriteRoute[]>([]);
  const [saveLabel, setSaveLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!visible) return;
    void favoriteRoutes.list().then(setRoutes);
    setSaved(false);
    setSaveLabel('');
  }, [visible]);

  const handleSave = async () => {
    if (!currentRoute || !saveLabel.trim()) return;
    setSaving(true);
    try {
      await favoriteRoutes.add({
        label: saveLabel.trim(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        placeId: currentRoute.placeId as any,
        destinationName: currentRoute.destinationName,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mode: currentRoute.mode as any,
        distanceM: currentRoute.distanceM,
        durationS: currentRoute.durationS,
      });
      const updated = await favoriteRoutes.list();
      setRoutes(updated);
      setSaved(true);
      setSaveLabel('');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await favoriteRoutes.remove(id);
    setRoutes((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text variant="subtitle">{t('active.favoriteRoutes')}</Text>

      {currentRoute ? (
        <View style={styles.saveForm}>
          <TextField
            label={t('active.savedRouteName')}
            placeholder={t('active.savedRouteNamePlaceholder')}
            value={saveLabel}
            onChangeText={setSaveLabel}
          />
          {saved ? (
            <RNText style={styles.savedMsg}>{t('active.savedRouteSaved')}</RNText>
          ) : (
            <View style={styles.saveActions}>
              <View style={styles.flex1}>
                <Button
                  label={t('active.savedRouteAdd')}
                  onPress={() => { void handleSave(); }}
                  variant={saving ? 'secondary' : 'primary'}
                />
              </View>
            </View>
          )}
        </View>
      ) : null}

      {routes.length === 0 ? (
        <Text tone="muted">{t('active.savedRouteEmpty')}</Text>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {routes.map((route) => (
            <View key={route.id} style={styles.routeItem}>
              <View style={styles.routeInfo}>
                <RNText style={styles.routeLabel} numberOfLines={1}>{route.label}</RNText>
                <RNText style={styles.routeMeta} numberOfLines={1}>
                  {`${route.destinationName} · ${fmtDist(route.distanceM)} · ${fmtDuration(route.durationS)}`}
                </RNText>
              </View>
              <View style={styles.routeActions}>
                {onStart ? (
                  <Pressable
                    style={styles.startBtn}
                    onPress={() => onStart(route)}
                    accessibilityRole="button"
                    accessibilityLabel={t('active.savedRouteStart')}
                  >
                    <RNText style={styles.startBtnText}>{t('active.savedRouteStart')}</RNText>
                  </Pressable>
                ) : null}
                <Pressable
                  style={styles.deleteBtn}
                  onPress={() => { void handleDelete(route.id); }}
                  accessibilityRole="button"
                  accessibilityLabel={t('active.savedRouteDelete')}
                >
                  <RNText style={styles.deleteBtnText}>{t('active.savedRouteDelete')}</RNText>
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </Sheet>
  );
}

const { space, color, font } = tokens;
const styles = StyleSheet.create({
  flex1: { flex: 1 },
  saveForm: { gap: space.s, paddingBottom: space.s, borderBottomWidth: 1, borderBottomColor: color.border },
  saveActions: { flexDirection: 'row', gap: space.s },
  savedMsg: { color: '#16A34A', fontSize: 13, fontWeight: '600', textAlign: 'center', paddingVertical: space.xs },
  list: { maxHeight: 320 },
  listContent: { gap: space.s },
  routeItem: { flexDirection: 'row', alignItems: 'center', gap: space.s, paddingVertical: space.xs, borderBottomWidth: 1, borderBottomColor: color.border },
  routeInfo: { flex: 1, gap: 2 },
  routeLabel: { fontSize: font.size.body, fontFamily: font.family, color: color.text, fontWeight: '600' },
  routeMeta: { fontSize: font.size.caption, fontFamily: font.family, color: color.textMuted },
  routeActions: { flexDirection: 'row', gap: space.xs },
  startBtn: { paddingHorizontal: space.s, paddingVertical: space.xs, backgroundColor: color.primary, borderRadius: 6 },
  startBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  deleteBtn: { paddingHorizontal: space.s, paddingVertical: space.xs, backgroundColor: '#FEE2E2', borderRadius: 6 },
  deleteBtnText: { color: '#DC2626', fontSize: 13, fontWeight: '600' },
});
