/**
 * User's own appointments list.
 */
import { appointmentsContract, type Appointment, type AppointmentStatus } from '@iraq-maps/contracts';
import { useApi, useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { EmptyState, Screen } from '@iraq-maps/ui';
import { initClient } from '@ts-rest/core';
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  I18nManager,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../strings';

I18nManager.forceRTL(true);

const STATUS_COLORS: Record<AppointmentStatus, { bg: string; text: string }> = {
  pending: { bg: '#FFF8E1', text: '#F57F17' },
  confirmed: { bg: '#E8F5E9', text: '#1B5E20' },
  cancelled: { bg: '#FFEBEE', text: '#B71C1C' },
  completed: { bg: '#E3F2FD', text: '#0D47A1' },
};

function useAppointmentsApi() {
  const baseUrl = useApiBaseUrl();
  useApi();
  return useMemo(() => initClient(appointmentsContract, { baseUrl, baseHeaders: {} }), [baseUrl]);
}

function AppointmentRow({ item }: { item: Appointment }): ReactElement {
  const colors = STATUS_COLORS[item.status];
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.service}>{item.service}</Text>
        <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
          <Text style={[styles.statusText, { color: colors.text }]}>
            {t(`appointments.status.${item.status}` as Parameters<typeof t>[0])}
          </Text>
        </View>
      </View>
      <Text style={styles.dateTime}>{item.date} · {item.time}</Text>
      {item.notes ? <Text style={styles.notes}>{item.notes}</Text> : null}
    </View>
  );
}

export function MyAppointmentsScreen(): ReactElement {
  const api = useAppointmentsApi();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await api.myAppointments();
      if (res.status === 200) setAppointments(res.body);
    } finally {
      if (refresh) setRefreshing(false); else setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <Screen>
        <SafeAreaView style={styles.container}>
          <Text style={styles.loadingText}>{t('dashboard.status')}</Text>
        </SafeAreaView>
      </Screen>
    );
  }

  return (
    <Screen>
      <SafeAreaView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
        >
          <Text style={styles.screenTitle}>{t('appointments.myAppointments')}</Text>
          {appointments.length === 0 ? (
            <EmptyState title={t('appointments.noAppointments')} body={t('appointments.noAppointmentsBody')} />
          ) : (
            appointments.map((a) => <AppointmentRow key={a.id} item={a} />)
          )}
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 16, gap: 10 },
  screenTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 },
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, gap: 6 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  service: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', flex: 1 },
  dateTime: { fontSize: 13, color: '#1976D2' },
  notes: { fontSize: 12, color: '#888' },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: '600' },
  loadingText: { textAlign: 'center', marginTop: 40, color: '#888' },
});
