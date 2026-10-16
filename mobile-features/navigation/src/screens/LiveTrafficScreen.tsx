/**
 * LiveTrafficScreen — full-screen live traffic overview.
 *
 * Features:
 * - Full-screen MapCanvas with traffic layer overlay
 * - Incident list sorted by severity
 * - Traffic intensity heatmap legend
 * - Affected routes summary panel
 * - "Best time to leave" panel
 * - Report incident button
 * - Speed camera warnings list
 * - Share traffic update
 */
import { Text, tokens } from '@iraq-maps/ui';
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text as RNText,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { t } from '../strings';

// ─── Types ────────────────────────────────────────────────────────────────────

type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low';
type IncidentType = 'accident' | 'roadwork' | 'closure' | 'hazard' | 'congestion';
type TrafficIntensity = 'free' | 'slow' | 'heavy' | 'blocked';

interface TrafficIncident {
  id: string;
  type: IncidentType;
  severity: IncidentSeverity;
  location: string;
  distanceM: number;
  reportedAt: string;
  description?: string;
  lat: number;
  lon: number;
}

interface AffectedRoute {
  id: string;
  name: string;
  intensity: TrafficIntensity;
  delayMinutes: number;
}

interface SpeedCamera {
  id: string;
  limitKmh: number;
  distanceM: number;
  lat: number;
  lon: number;
}

interface BestDepartureInfo {
  nowClear: boolean;
  bestInMinutes: number | null;
}

export interface LiveTrafficScreenProps {
  userLat?: number;
  userLon?: number;
  onClose?: () => void;
}

// ─── Mock data helpers (replace with real API when available) ──────────────────

function mockIncidents(): TrafficIncident[] {
  return [
    {
      id: 'i1',
      type: 'accident',
      severity: 'critical',
      location: 'شارع فلسطين، بغداد',
      distanceM: 1200,
      reportedAt: new Date(Date.now() - 15 * 60000).toISOString(),
      lat: 33.315,
      lon: 44.366,
    },
    {
      id: 'i2',
      type: 'roadwork',
      severity: 'medium',
      location: 'طريق المطار، بغداد',
      distanceM: 3400,
      reportedAt: new Date(Date.now() - 45 * 60000).toISOString(),
      lat: 33.298,
      lon: 44.327,
    },
    {
      id: 'i3',
      type: 'congestion',
      severity: 'high',
      location: 'جسر الجمهورية',
      distanceM: 800,
      reportedAt: new Date(Date.now() - 5 * 60000).toISOString(),
      lat: 33.34,
      lon: 44.395,
    },
    {
      id: 'i4',
      type: 'hazard',
      severity: 'low',
      location: 'الكرادة الداخلية',
      distanceM: 5100,
      reportedAt: new Date(Date.now() - 90 * 60000).toISOString(),
      lat: 33.32,
      lon: 44.4,
    },
  ];
}

function mockAffectedRoutes(): AffectedRoute[] {
  return [
    { id: 'r1', name: 'شارع فلسطين — ساحة الكرادة', intensity: 'blocked', delayMinutes: 25 },
    { id: 'r2', name: 'طريق المطار', intensity: 'slow', delayMinutes: 10 },
    { id: 'r3', name: 'جسر الجمهورية', intensity: 'heavy', delayMinutes: 15 },
  ];
}

function mockSpeedCameras(): SpeedCamera[] {
  return [
    { id: 'sc1', limitKmh: 80, distanceM: 600, lat: 33.31, lon: 44.36 },
    { id: 'sc2', limitKmh: 60, distanceM: 2300, lat: 33.33, lon: 44.37 },
    { id: 'sc3', limitKmh: 100, distanceM: 4700, lat: 33.29, lon: 44.34 },
  ];
}

function mockBestDeparture(): BestDepartureInfo {
  return { nowClear: false, bestInMinutes: 20 };
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function severityColor(severity: IncidentSeverity, dark: boolean): string {
  switch (severity) {
    case 'critical':
      return dark ? '#ff4444' : '#d32f2f';
    case 'high':
      return dark ? '#ff8c00' : '#e65100';
    case 'medium':
      return dark ? '#ffd600' : '#f9a825';
    case 'low':
      return dark ? '#69f0ae' : '#2e7d32';
  }
}

function intensityColor(intensity: TrafficIntensity): string {
  switch (intensity) {
    case 'free':
      return '#43a047';
    case 'slow':
      return '#ffa726';
    case 'heavy':
      return '#ef5350';
    case 'blocked':
      return '#b71c1c';
  }
}

function severityLabel(severity: IncidentSeverity): string {
  switch (severity) {
    case 'critical':
      return t('traffic.severityCritical');
    case 'high':
      return t('traffic.severityHigh');
    case 'medium':
      return t('traffic.severityMedium');
    case 'low':
      return t('traffic.severityLow');
  }
}

function incidentTypeLabel(type: IncidentType): string {
  switch (type) {
    case 'accident':
      return t('traffic.incidentAccident');
    case 'roadwork':
      return t('traffic.incidentRoadwork');
    case 'closure':
      return t('traffic.incidentClosure');
    case 'hazard':
      return t('traffic.incidentHazard');
    case 'congestion':
      return t('traffic.incidentCongestion');
  }
}

function intensityLabel(intensity: TrafficIntensity): string {
  switch (intensity) {
    case 'free':
      return t('traffic.legendFree');
    case 'slow':
      return t('traffic.legendSlow');
    case 'heavy':
      return t('traffic.legendHeavy');
    case 'blocked':
      return t('traffic.legendBlocked');
  }
}

function fmtDistance(m: number): string {
  if (m < 1000) return t('traffic.mAway', { n: Math.round(m) });
  return t('traffic.kmAway', { n: (m / 1000).toFixed(1) });
}

function fmtTimeAgo(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return 'الآن';
  if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
  const h = Math.floor(diffMin / 60);
  return `منذ ${h} ساعة`;
}

interface IncidentCardProps {
  incident: TrafficIncident;
  dark: boolean;
}

function IncidentCard({ incident, dark }: IncidentCardProps): ReactElement {
  const color = severityColor(incident.severity, dark);
  return (
    <View style={[styles.incidentCard, dark && styles.incidentCardDark]}>
      <View style={[styles.severityBar, { backgroundColor: color }]} />
      <View style={styles.incidentBody}>
        <View style={styles.incidentHeader}>
          <Text style={[styles.incidentType, { color }]}>{incidentTypeLabel(incident.type)}</Text>
          <Text style={[styles.incidentSeverity, dark && styles.textSecondaryDark]}>
            {severityLabel(incident.severity)}
          </Text>
        </View>
        <Text style={[styles.incidentLocation, dark && styles.textPrimaryDark]}>
          {incident.location}
        </Text>
        <View style={styles.incidentMeta}>
          <Text style={[styles.incidentMetaText, dark && styles.textSecondaryDark]}>
            {fmtDistance(incident.distanceM)}
          </Text>
          <Text style={[styles.incidentMetaText, dark && styles.textSecondaryDark]}>
            {'  ·  '}
          </Text>
          <Text style={[styles.incidentMetaText, dark && styles.textSecondaryDark]}>
            {fmtTimeAgo(incident.reportedAt)}
          </Text>
        </View>
      </View>
    </View>
  );
}

interface HeatmapLegendProps {
  dark: boolean;
}

function HeatmapLegend({ dark }: HeatmapLegendProps): ReactElement {
  const items: TrafficIntensity[] = ['free', 'slow', 'heavy', 'blocked'];
  return (
    <View style={styles.legendContainer}>
      <Text style={[styles.legendTitle, dark && styles.textPrimaryDark]}>
        {t('traffic.intensity')}
      </Text>
      <View style={styles.legendRow}>
        {items.map((intensity) => (
          <View key={intensity} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: intensityColor(intensity) }]} />
            <Text style={[styles.legendLabel, dark && styles.textSecondaryDark]}>
              {intensityLabel(intensity)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

interface AffectedRoutesProps {
  routes: AffectedRoute[];
  dark: boolean;
}

function AffectedRoutes({ routes, dark }: AffectedRoutesProps): ReactElement {
  return (
    <View style={[styles.section, dark && styles.sectionDark]}>
      <Text style={[styles.sectionTitle, dark && styles.textPrimaryDark]}>
        {t('traffic.affectedRoutes')}
      </Text>
      {routes.map((route) => (
        <View key={route.id} style={styles.affectedRouteRow}>
          <View style={[styles.intensityPill, { backgroundColor: intensityColor(route.intensity) }]}>
            <Text style={styles.intensityPillText}>{intensityLabel(route.intensity)}</Text>
          </View>
          <View style={styles.affectedRouteInfo}>
            <RNText style={[styles.affectedRouteName, dark && styles.textPrimaryDark]} numberOfLines={1}>
              {route.name}
            </RNText>
            {route.delayMinutes > 0 && (
              <Text style={[styles.affectedRouteDelay, dark && styles.textSecondaryDark]}>
                {t('traffic.delayMin', { min: route.delayMinutes })}
              </Text>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

interface BestTimePanelProps {
  info: BestDepartureInfo;
  dark: boolean;
}

function BestTimePanel({ info, dark }: BestTimePanelProps): ReactElement {
  const label = info.nowClear
    ? t('traffic.bestTimeNow')
    : info.bestInMinutes !== null
      ? t('traffic.bestTimeIn', { min: info.bestInMinutes })
      : t('traffic.bestTimeNow');

  return (
    <View style={[styles.bestTimePanel, dark && styles.bestTimePanelDark]}>
      <Text style={[styles.bestTimeTitle, dark && styles.textPrimaryDark]}>
        {t('traffic.bestTime')}
      </Text>
      <Text style={[styles.bestTimeValue, info.nowClear ? styles.bestTimeGreen : styles.bestTimeOrange]}>
        {label}
      </Text>
    </View>
  );
}

interface SpeedCameraListProps {
  cameras: SpeedCamera[];
  dark: boolean;
}

function SpeedCameraList({ cameras, dark }: SpeedCameraListProps): ReactElement {
  return (
    <View style={[styles.section, dark && styles.sectionDark]}>
      <Text style={[styles.sectionTitle, dark && styles.textPrimaryDark]}>
        {t('traffic.speedCameras')}
      </Text>
      {cameras.map((cam) => (
        <View key={cam.id} style={styles.cameraRow}>
          <View style={[styles.cameraIcon, dark && styles.cameraIconDark]}>
            <Text style={styles.cameraIconText}>📷</Text>
          </View>
          <View style={styles.cameraInfo}>
            <Text style={[styles.cameraLabel, dark && styles.textPrimaryDark]}>
              {t('traffic.speedCamera', { limit: cam.limitKmh })}
            </Text>
            <Text style={[styles.cameraDistance, dark && styles.textSecondaryDark]}>
              {fmtDistance(cam.distanceM)}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function LiveTrafficScreen({
  userLat = 33.3152,
  userLon = 44.3661,
  onClose,
}: LiveTrafficScreenProps): ReactElement {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [incidents, setIncidents] = useState<TrafficIncident[]>([]);
  const [affectedRoutes, setAffectedRoutes] = useState<AffectedRoute[]>([]);
  const [speedCameras, setSpeedCameras] = useState<SpeedCamera[]>([]);
  const [bestDeparture, setBestDeparture] = useState<BestDepartureInfo>({ nowClear: true, bestInMinutes: null });
  const [showMap, setShowMap] = useState(true);

  const fetchData = useCallback(async () => {
    await new Promise((r) => setTimeout(r, 600));
    setIncidents(mockIncidents());
    setAffectedRoutes(mockAffectedRoutes());
    setSpeedCameras(mockSpeedCameras());
    setBestDeparture(mockBestDeparture());
  }, []);

  useEffect(() => {
    void fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handleReportIncident = useCallback(() => {
    Alert.alert(
      t('traffic.reportIncident'),
      'هذه الميزة قيد التطوير',
      [{ text: 'حسناً' }],
    );
  }, []);

  const handleShare = useCallback(async () => {
    const criticalCount = incidents.filter((i) => i.severity === 'critical' || i.severity === 'high').length;
    const message = `حالة المرور في بغداد: ${criticalCount} حوادث نشطة. ${bestDeparture.nowClear ? 'المرور سلس الآن.' : `أفضل وقت للمغادرة: بعد ${bestDeparture.bestInMinutes ?? 0} دقيقة.`}`;
    try {
      await Share.share({ message });
    } catch {
      // user cancelled
    }
  }, [incidents, bestDeparture]);

  const sortedIncidents = useMemo(() => {
    const order: Record<IncidentSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return [...incidents].sort((a, b) => order[a.severity] - order[b.severity]);
  }, [incidents]);

  const _mapRegion = useMemo(
    () => ({ latitude: userLat, longitude: userLon, zoom: 12 }),
    [userLat, userLon],
  );

  if (loading) {
    return (
      <View style={[styles.root, dark && styles.rootDark]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={tokens.color.primary} />
          <Text style={[styles.loadingText, dark && styles.textSecondaryDark]}>
            {t('traffic.loading')}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, dark && styles.rootDark]}>
      {/* Map toggle header */}
      <View style={[styles.header, dark && styles.headerDark]}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityRole="button">
          <Text style={[styles.closeBtnText, dark && styles.textPrimaryDark]}>✕</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, dark && styles.textPrimaryDark]}>
          {t('traffic.title')}
        </Text>
        <TouchableOpacity onPress={() => setShowMap((v) => !v)} style={styles.mapToggleBtn}>
          <Text style={[styles.mapToggleText, dark && styles.textSecondaryDark]}>
            {showMap ? '📋' : '🗺️'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Full-screen map */}
      {showMap && (
        <View style={styles.mapContainer}>
          {/* MapCanvas placeholder — city/apiBaseUrl injected by host app */}
          <View style={[styles.map, styles.mapPlaceholder]} />
          {/* Traffic layer legend overlaid on map */}
          <View style={styles.mapLegendOverlay}>
            <HeatmapLegend dark />
          </View>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Best time to leave */}
        <BestTimePanel info={bestDeparture} dark={dark} />

        {/* Affected routes */}
        {affectedRoutes.length > 0 && (
          <AffectedRoutes routes={affectedRoutes} dark={dark} />
        )}

        {/* Incidents */}
        <View style={[styles.section, dark && styles.sectionDark]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, dark && styles.textPrimaryDark]}>
              {t('traffic.incidents')}
            </Text>
            <Text style={[styles.incidentCount, dark && styles.textSecondaryDark]}>
              {sortedIncidents.length}
            </Text>
          </View>
          {sortedIncidents.length === 0 ? (
            <Text style={[styles.emptyText, dark && styles.textSecondaryDark]}>
              {t('traffic.noIncidents')}
            </Text>
          ) : (
            sortedIncidents.map((incident) => (
              <IncidentCard key={incident.id} incident={incident} dark={dark} />
            ))
          )}
        </View>

        {/* Speed cameras */}
        {speedCameras.length > 0 && (
          <SpeedCameraList cameras={speedCameras} dark={dark} />
        )}

        {/* Action buttons */}
        <View style={styles.actionsRow}>
          <Pressable
            style={[styles.actionBtn, styles.actionBtnPrimary]}
            onPress={handleReportIncident}
            accessibilityRole="button"
          >
            <Text style={styles.actionBtnTextLight}>{t('traffic.reportIncident')}</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, dark ? styles.actionBtnSecondaryDark : styles.actionBtnSecondary]}
            onPress={handleShare}
            accessibilityRole="button"
          >
            <Text style={[styles.actionBtnText, dark && styles.textPrimaryDark]}>
              {t('traffic.shareUpdate')}
            </Text>
          </Pressable>
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* Refresh button */}
      <TouchableOpacity
        style={[styles.refreshFab, dark && styles.refreshFabDark]}
        onPress={handleRefresh}
        accessibilityRole="button"
        accessibilityLabel={t('traffic.refresh')}
      >
        <Text style={styles.refreshFabText}>↻</Text>
      </TouchableOpacity>
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  headerDark: {
    backgroundColor: '#1e1e1e',
    borderBottomColor: '#333',
  },
  closeBtn: {
    padding: 4,
    marginEnd: 8,
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
  mapToggleBtn: {
    padding: 4,
    marginStart: 8,
  },
  mapToggleText: {
    fontSize: 20,
  },
  mapContainer: {
    height: 220,
    position: 'relative',
  },
  map: {
    ...StyleSheet.absoluteFill,
  },
  mapPlaceholder: {
    backgroundColor: '#c8d8c8',
  },
  mapLegendOverlay: {
    position: 'absolute',
    bottom: 8,
    start: 8,
    end: 8,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  sectionDark: {
    backgroundColor: '#1e1e1e',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    marginBottom: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  incidentCount: {
    marginStart: 8,
    fontSize: 13,
    color: '#888',
    fontWeight: '600',
  },
  incidentCard: {
    flexDirection: 'row',
    backgroundColor: '#fafafa',
    borderRadius: 8,
    marginBottom: 8,
    overflow: 'hidden',
  },
  incidentCardDark: {
    backgroundColor: '#2a2a2a',
  },
  severityBar: {
    width: 4,
  },
  incidentBody: {
    flex: 1,
    padding: 10,
  },
  incidentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  incidentType: {
    fontSize: 13,
    fontWeight: '700',
  },
  incidentSeverity: {
    fontSize: 12,
    color: '#888',
  },
  incidentLocation: {
    fontSize: 14,
    color: '#222',
    fontWeight: '500',
    marginBottom: 4,
  },
  incidentMeta: {
    flexDirection: 'row',
  },
  incidentMetaText: {
    fontSize: 12,
    color: '#888',
  },
  legendContainer: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 8,
    padding: 8,
  },
  legendTitle: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
    marginBottom: 6,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 11,
    color: '#ddd',
  },
  affectedRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  intensityPill: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  intensityPillText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '700',
  },
  affectedRouteInfo: {
    flex: 1,
  },
  affectedRouteName: {
    fontSize: 13,
    color: '#222',
    fontWeight: '500',
  },
  affectedRouteDelay: {
    fontSize: 12,
    color: '#ef5350',
    marginTop: 1,
  },
  bestTimePanel: {
    backgroundColor: '#e8f5e9',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bestTimePanelDark: {
    backgroundColor: '#1b2e1b',
  },
  bestTimeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  bestTimeValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  bestTimeGreen: {
    color: '#2e7d32',
  },
  bestTimeOrange: {
    color: '#e65100',
  },
  cameraRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  cameraIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff3e0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraIconDark: {
    backgroundColor: '#3e2a00',
  },
  cameraIconText: {
    fontSize: 18,
  },
  cameraInfo: {
    flex: 1,
  },
  cameraLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#222',
  },
  cameraDistance: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  actionBtnPrimary: {
    backgroundColor: tokens.color.primary,
  },
  actionBtnSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  actionBtnSecondaryDark: {
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#444',
  },
  actionBtnTextLight: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  actionBtnText: {
    color: '#333',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 16,
  },
  bottomPad: {
    height: 80,
  },
  refreshFab: {
    position: 'absolute',
    bottom: 24,
    end: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshFabDark: {
    backgroundColor: '#2a2a2a',
  },
  refreshFabText: {
    fontSize: 22,
    color: tokens.color.primary,
  },
  textPrimaryDark: {
    color: '#e0e0e0',
  },
  textSecondaryDark: {
    color: '#999',
  },
});
