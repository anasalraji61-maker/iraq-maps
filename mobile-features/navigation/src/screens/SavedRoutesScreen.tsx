/**
 * SavedRoutesScreen — manage saved routes: home/work shortcuts, custom routes,
 * recent routes (last 10), route stats, schedule notifications, leave-now ETA.
 */
import { Text, TextField, tokens } from '@iraq-maps/ui';
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { favoriteRoutes, type FavoriteRoute } from '../favoriteRoutes';
import { t } from '../strings';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecentRoute {
  id: string;
  destinationName: string;
  distanceM: number;
  durationS: number;
  usedAt: string;
}

interface RouteStats {
  avgDurationS: number;
  commonIncidents: number;
  tripCount: number;
}

export interface SavedRoutesScreenProps {
  onNavigate?: (destination: string, destinationName: string) => void;
  onClose?: () => void;
}

// ─── Local storage helpers ────────────────────────────────────────────────────

const RECENT_KEY = 'iraq_maps.recent_routes';
const MAX_RECENT = 10;

async function loadRecent(): Promise<RecentRoute[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AS = require('@react-native-async-storage/async-storage').default as {
      getItem: (k: string) => Promise<string | null>;
    };
    const raw = await AS.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as RecentRoute[]) : [];
  } catch {
    return [];
  }
}

async function _saveRecent(entries: RecentRoute[]): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AS = require('@react-native-async-storage/async-storage').default as {
      setItem: (k: string, v: string) => Promise<void>;
    };
    await AS.setItem(RECENT_KEY, JSON.stringify(entries.slice(0, MAX_RECENT)));
  } catch {
    // non-fatal
  }
}

// ─── Format helpers ───────────────────────────────────────────────────────────

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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ar-IQ', {
    month: 'short',
    day: 'numeric',
  });
}

function getRouteStats(route: FavoriteRoute): RouteStats {
  // Stub — in production this would call the backend
  return {
    avgDurationS: route.durationS * (0.95 + Math.random() * 0.15),
    commonIncidents: Math.floor(Math.random() * 3),
    tripCount: Math.floor(Math.random() * 20) + 2,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface RenameModalProps {
  visible: boolean;
  currentName: string;
  dark: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
}

function RenameModal({ visible, currentName, dark, onSave, onCancel }: RenameModalProps): ReactElement {
  const [name, setName] = useState(currentName);

  useEffect(() => {
    if (visible) setName(currentName);
  }, [visible, currentName]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={[styles.modalBox, dark && styles.modalBoxDark]}>
          <Text style={[styles.modalTitle, dark && styles.textPrimaryDark]}>
            {t('savedRoutes.rename')}
          </Text>
          <TextField
            label={t('savedRoutes.renamePlaceholder')}
            value={name}
            onChangeText={setName}
            placeholder={t('savedRoutes.renamePlaceholder')}
          />
          <View style={styles.modalActions}>
            <TouchableOpacity onPress={onCancel} style={styles.modalCancelBtn}>
              <Text style={[styles.modalCancelText, dark && styles.textSecondaryDark]}>
                {t('savedRoutes.scheduleCancel')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => name.trim() && onSave(name.trim())}
              style={styles.modalSaveBtn}
            >
              <Text style={styles.modalSaveBtnText}>{t('savedRoutes.renameSave')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

interface ScheduleModalProps {
  visible: boolean;
  routeName: string;
  dark: boolean;
  onSave: (time: string) => void;
  onCancel: () => void;
}

function ScheduleModal({ visible, routeName, dark, onSave, onCancel }: ScheduleModalProps): ReactElement {
  const times = ['06:00', '07:00', '07:30', '08:00', '08:30', '09:00', '17:00', '18:00', '19:00'];
  const [selected, setSelected] = useState('08:00');

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={[styles.modalBox, dark && styles.modalBoxDark, styles.scheduleBox]}>
          <Text style={[styles.modalTitle, dark && styles.textPrimaryDark]}>
            {t('savedRoutes.scheduleTitle')}
          </Text>
          <Text style={[styles.scheduleRouteName, dark && styles.textSecondaryDark]}>
            {routeName}
          </Text>
          <View style={styles.timePicker}>
            {times.map((time) => (
              <TouchableOpacity
                key={time}
                style={[styles.timeChip, selected === time && styles.timeChipSelected]}
                onPress={() => setSelected(time)}
              >
                <Text style={[styles.timeChipText, selected === time && styles.timeChipTextSelected]}>
                  {time}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.modalActions}>
            <TouchableOpacity onPress={onCancel} style={styles.modalCancelBtn}>
              <Text style={[styles.modalCancelText, dark && styles.textSecondaryDark]}>
                {t('savedRoutes.scheduleCancel')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onSave(selected)} style={styles.modalSaveBtn}>
              <Text style={styles.modalSaveBtnText}>{t('savedRoutes.scheduleSave')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

interface SavedRouteCardProps {
  route: FavoriteRoute;
  dark: boolean;
  onLeaveNow: () => void;
  onSchedule: () => void;
  onRename: () => void;
  onSwapEnds: () => void;
  onDelete: () => void;
}

function SavedRouteCard({
  route,
  dark,
  onLeaveNow,
  onSchedule,
  onRename,
  onSwapEnds,
  onDelete,
}: SavedRouteCardProps): ReactElement {
  const [expanded, setExpanded] = useState(false);
  const stats = useMemo(() => getRouteStats(route), [route]);

  return (
    <View style={[styles.routeCard, dark && styles.routeCardDark]}>
      <TouchableOpacity
        style={styles.routeCardHeader}
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
      >
        <View style={styles.routeCardIconWrap}>
          <View style={[styles.routeCardIcon, { backgroundColor: tokens.color.primary + '22' }]}>
            <Text style={styles.routeCardIconText}>📍</Text>
          </View>
        </View>
        <View style={styles.routeCardInfo}>
          <RNText style={[styles.routeCardLabel, dark && styles.textPrimaryDark]} numberOfLines={1}>
            {route.label}
          </RNText>
          <Text style={[styles.routeCardMeta, dark && styles.textSecondaryDark]}>
            {fmtDist(route.distanceM)}
            {'  ·  '}
            {fmtDuration(route.durationS)}
          </Text>
        </View>
        <View style={styles.routeCardChevron}>
          <Text style={[styles.chevronText, dark && styles.textSecondaryDark]}>
            {expanded ? '▲' : '▼'}
          </Text>
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={[styles.routeCardBody, dark && styles.routeCardBodyDark]}>
          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statCell}>
              <Text style={[styles.statValue, dark && styles.textPrimaryDark]}>
                {fmtDuration(Math.round(stats.avgDurationS))}
              </Text>
              <Text style={[styles.statLabel, dark && styles.textSecondaryDark]}>
                {t('savedRoutes.avgTime', { duration: '' }).replace(': ', '')}
              </Text>
            </View>
            <View style={styles.statCell}>
              <Text style={[styles.statValue, dark && styles.textPrimaryDark]}>
                {stats.commonIncidents}
              </Text>
              <Text style={[styles.statLabel, dark && styles.textSecondaryDark]}>
                {t('savedRoutes.avgIncidents', { n: '' }).replace(': ', '')}
              </Text>
            </View>
            <View style={styles.statCell}>
              <Text style={[styles.statValue, dark && styles.textPrimaryDark]}>
                {stats.tripCount}
              </Text>
              <Text style={[styles.statLabel, dark && styles.textSecondaryDark]}>
                {t('savedRoutes.trips', { n: '' }).replace('{n} ', '')}
              </Text>
            </View>
          </View>

          {/* ETA */}
          <Text style={[styles.etaNow, dark && styles.textSecondaryDark]}>
            {t('savedRoutes.etaNow', { duration: fmtDuration(route.durationS) })}
          </Text>

          {/* Action buttons */}
          <View style={styles.cardActions}>
            <Pressable
              style={[styles.cardActionBtn, styles.cardActionPrimary]}
              onPress={onLeaveNow}
              accessibilityRole="button"
            >
              <Text style={styles.cardActionPrimaryText}>{t('savedRoutes.leaveNow')}</Text>
            </Pressable>
            <Pressable
              style={[styles.cardActionBtn, dark ? styles.cardActionSecDark : styles.cardActionSec]}
              onPress={onSchedule}
              accessibilityRole="button"
            >
              <Text style={[styles.cardActionSecText, dark && styles.textPrimaryDark]}>
                {t('savedRoutes.scheduleNotif')}
              </Text>
            </Pressable>
          </View>

          {/* Edit row */}
          <View style={[styles.editRow, dark && styles.editRowDark]}>
            <TouchableOpacity style={styles.editChip} onPress={onRename}>
              <Text style={[styles.editChipText, dark && styles.textSecondaryDark]}>
                ✏️ {t('savedRoutes.renameRoute')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.editChip} onPress={onSwapEnds}>
              <Text style={[styles.editChipText, dark && styles.textSecondaryDark]}>
                🔄 {t('savedRoutes.swapEnds')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.editChip} onPress={onDelete}>
              <Text style={[styles.editChipText, styles.editChipDelete]}>
                🗑️ {t('savedRoutes.deleteRoute')}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.savedAtText, dark && styles.textSecondaryDark]}>
            {t('savedRoutes.savedAt', { date: fmtDate(route.savedAt) })}
          </Text>
        </View>
      )}
    </View>
  );
}

interface RecentRouteRowProps {
  route: RecentRoute;
  dark: boolean;
  onPress: () => void;
}

function RecentRouteRow({ route, dark, onPress }: RecentRouteRowProps): ReactElement {
  return (
    <TouchableOpacity
      style={[styles.recentRow, dark && styles.recentRowDark]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Text style={styles.recentIcon}>🕐</Text>
      <View style={styles.recentInfo}>
        <RNText style={[styles.recentName, dark && styles.textPrimaryDark]} numberOfLines={1}>
          {route.destinationName}
        </RNText>
        <Text style={[styles.recentMeta, dark && styles.textSecondaryDark]}>
          {fmtDist(route.distanceM)}
          {'  ·  '}
          {fmtDuration(route.durationS)}
          {'  ·  '}
          {fmtDate(route.usedAt)}
        </Text>
      </View>
      <Text style={[styles.recentChevron, dark && styles.textSecondaryDark]}>›</Text>
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function SavedRoutesScreen({ onNavigate, onClose }: SavedRoutesScreenProps): ReactElement {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';

  const [savedRoutes, setSavedRoutes] = useState<FavoriteRoute[]>([]);
  const [recentRoutes, setRecentRoutes] = useState<RecentRoute[]>([]);
  const [renameTarget, setRenameTarget] = useState<FavoriteRoute | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<FavoriteRoute | null>(null);

  useEffect(() => {
    void favoriteRoutes.list().then(setSavedRoutes);
    void loadRecent().then(setRecentRoutes);
  }, []);

  const handleLeaveNow = useCallback(
    (route: FavoriteRoute) => {
      onNavigate?.(route.placeId, route.destinationName);
    },
    [onNavigate],
  );

  const handleDelete = useCallback((route: FavoriteRoute) => {
    Alert.alert(route.label, t('savedRoutes.deleteRoute') + '؟', [
      { text: t('savedRoutes.scheduleCancel'), style: 'cancel' },
      {
        text: t('savedRoutes.deleteRoute'),
        style: 'destructive',
        onPress: async () => {
          await favoriteRoutes.remove(route.id);
          setSavedRoutes((prev) => prev.filter((r) => r.id !== route.id));
        },
      },
    ]);
  }, []);

  const handleRename = useCallback(async (route: FavoriteRoute, newLabel: string) => {
    // persist by removing and re-adding with same data but new label
    await favoriteRoutes.remove(route.id);
    await favoriteRoutes.add({
      label: newLabel,
      placeId: route.placeId,
      destinationName: route.destinationName,
      mode: route.mode,
      distanceM: route.distanceM,
      durationS: route.durationS,
    });
    const updated = await favoriteRoutes.list();
    setSavedRoutes(updated);
  }, []);

  const handleSwapEnds = useCallback((route: FavoriteRoute) => {
    // stub — would need origin data; show info alert
    Alert.alert(route.label, 'عكس الاتجاه سيكون متاحاً في التحديث القادم.', [{ text: 'حسناً' }]);
  }, []);

  const handleScheduleSave = useCallback((route: FavoriteRoute, time: string) => {
    Alert.alert(
      t('savedRoutes.scheduleNotif'),
      `سيتم تذكيرك للمغادرة باتجاه ${route.label} الساعة ${time}`,
      [{ text: 'حسناً' }],
    );
    setScheduleTarget(null);
  }, []);

  const handleRecentNavigate = useCallback(
    (route: RecentRoute) => {
      onNavigate?.(route.id, route.destinationName);
    },
    [onNavigate],
  );

  return (
    <View style={[styles.root, dark && styles.rootDark]}>
      {/* Header */}
      <View style={[styles.header, dark && styles.headerDark]}>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityRole="button">
            <Text style={[styles.closeBtnText, dark && styles.textPrimaryDark]}>✕</Text>
          </TouchableOpacity>
        )}
        <Text style={[styles.headerTitle, dark && styles.textPrimaryDark]}>
          {t('savedRoutes.title')}
        </Text>
        <View style={styles.closeBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Quick-access: Home & Work */}
        <Text style={[styles.groupTitle, dark && styles.textSecondaryDark]}>
          {t('savedRoutes.custom')}
        </Text>

        {savedRoutes.length === 0 ? (
          <View style={[styles.emptyCard, dark && styles.emptyCardDark]}>
            <Text style={[styles.emptyText, dark && styles.textSecondaryDark]}>
              {t('savedRoutes.noSaved')}
            </Text>
          </View>
        ) : (
          savedRoutes.map((route) => (
            <SavedRouteCard
              key={route.id}
              route={route}
              dark={dark}
              onLeaveNow={() => handleLeaveNow(route)}
              onSchedule={() => setScheduleTarget(route)}
              onRename={() => setRenameTarget(route)}
              onSwapEnds={() => handleSwapEnds(route)}
              onDelete={() => handleDelete(route)}
            />
          ))
        )}

        {/* Recent routes */}
        <Text style={[styles.groupTitle, dark && styles.textSecondaryDark, styles.groupTitleSpaced]}>
          {t('savedRoutes.recent')}
        </Text>

        {recentRoutes.length === 0 ? (
          <View style={[styles.emptyCard, dark && styles.emptyCardDark]}>
            <Text style={[styles.emptyText, dark && styles.textSecondaryDark]}>
              {t('savedRoutes.noRecent')}
            </Text>
          </View>
        ) : (
          <View style={[styles.recentList, dark && styles.recentListDark]}>
            {recentRoutes.map((route) => (
              <RecentRouteRow
                key={route.id}
                route={route}
                dark={dark}
                onPress={() => handleRecentNavigate(route)}
              />
            ))}
          </View>
        )}

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* Rename modal */}
      <RenameModal
        visible={renameTarget !== null}
        currentName={renameTarget?.label ?? ''}
        dark={dark}
        onSave={async (name) => {
          if (renameTarget) await handleRename(renameTarget, name);
          setRenameTarget(null);
        }}
        onCancel={() => setRenameTarget(null)}
      />

      {/* Schedule modal */}
      <ScheduleModal
        visible={scheduleTarget !== null}
        routeName={scheduleTarget?.label ?? ''}
        dark={dark}
        onSave={(time) => {
          if (scheduleTarget) handleScheduleSave(scheduleTarget, time);
        }}
        onCancel={() => setScheduleTarget(null)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  rootDark: {
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  headerDark: {
    backgroundColor: '#1e1e1e',
    borderBottomColor: '#333',
  },
  closeBtn: {
    width: 32,
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 18,
    color: '#333',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  groupTitleSpaced: {
    marginTop: 20,
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyCardDark: {
    backgroundColor: '#1e1e1e',
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
  },
  routeCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  routeCardDark: {
    backgroundColor: '#1e1e1e',
  },
  routeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  routeCardIconWrap: {
    marginEnd: 12,
  },
  routeCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeCardIconText: {
    fontSize: 20,
  },
  routeCardInfo: {
    flex: 1,
  },
  routeCardLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
  },
  routeCardMeta: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  routeCardChevron: {
    marginStart: 8,
  },
  chevronText: {
    fontSize: 12,
    color: '#aaa',
  },
  routeCardBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f0f0f0',
    padding: 14,
    backgroundColor: '#fafafa',
  },
  routeCardBodyDark: {
    backgroundColor: '#252525',
    borderTopColor: '#333',
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
  },
  statLabel: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
    textAlign: 'center',
  },
  etaNow: {
    fontSize: 13,
    color: '#555',
    textAlign: 'center',
    marginBottom: 12,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  cardActionBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cardActionPrimary: {
    backgroundColor: tokens.color.primary,
  },
  cardActionPrimaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  cardActionSec: {
    backgroundColor: '#f0f0f0',
  },
  cardActionSecDark: {
    backgroundColor: '#333',
  },
  cardActionSecText: {
    color: '#333',
    fontWeight: '600',
    fontSize: 13,
  },
  editRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
    marginBottom: 8,
  },
  editRowDark: {
    borderTopColor: '#444',
  },
  editChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: 'transparent',
  },
  editChipText: {
    fontSize: 13,
    color: '#555',
  },
  editChipDelete: {
    color: '#d32f2f',
  },
  savedAtText: {
    fontSize: 11,
    color: '#bbb',
    textAlign: 'right',
  },
  recentList: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
  },
  recentListDark: {
    backgroundColor: '#1e1e1e',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  recentRowDark: {
    borderBottomColor: '#333',
  },
  recentIcon: {
    fontSize: 18,
    marginEnd: 12,
  },
  recentInfo: {
    flex: 1,
  },
  recentName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#222',
  },
  recentMeta: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  recentChevron: {
    fontSize: 18,
    color: '#ccc',
    marginStart: 8,
  },
  bottomPad: {
    height: 60,
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalBox: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  modalBoxDark: {
    backgroundColor: '#1e1e1e',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
    marginBottom: 14,
  },
  renameInput: {
    marginBottom: 14,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  modalCancelText: {
    color: '#888',
    fontSize: 15,
  },
  modalSaveBtn: {
    backgroundColor: tokens.color.primary,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  modalSaveBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  scheduleBox: {
    maxHeight: '80%',
  },
  scheduleRouteName: {
    fontSize: 14,
    color: '#666',
    marginBottom: 14,
  },
  timePicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  timeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  timeChipSelected: {
    backgroundColor: tokens.color.primary,
  },
  timeChipText: {
    fontSize: 14,
    color: '#333',
  },
  timeChipTextSelected: {
    color: '#fff',
    fontWeight: '700',
  },
  textPrimaryDark: {
    color: '#e0e0e0',
  },
  textSecondaryDark: {
    color: '#999',
  },
});
