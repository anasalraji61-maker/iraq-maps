/**
 * Provider Appointments Screen — view incoming appointments, confirm/cancel.
 */
import { appointmentsContract, type Appointment, type AppointmentStatus } from '@iraq-maps/contracts';
import { useApi, useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { EmptyState, Screen } from '@iraq-maps/ui';
import { initClient } from '@ts-rest/core';
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  Alert,
  I18nManager,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../strings';

I18nManager.forceRTL(true);

const PRIMARY = '#1976D2';
const DANGER = '#EF4444';
const SUCCESS = '#10B981';

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

function AppointmentCard({
  item,
  providerId,
  onUpdate,
}: {
  item: Appointment;
  providerId: string;
  onUpdate: (updated: Appointment) => void;
}): ReactElement {
  const api = useAppointmentsApi();
  const colors = STATUS_COLORS[item.status];
  const [loading, setLoading] = useState(false);

  const doUpdate = useCallback(async (status: 'confirmed' | 'cancelled' | 'completed') => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await api.update({ params: { providerId: providerId as any, id: item.id as any }, body: { status } });
      if (res.status === 200) onUpdate(res.body);
    } finally {
      setLoading(false);
    }
  }, [api, item.id, onUpdate, providerId]);

  const confirmCancel = useCallback(() => {
    Alert.alert(t('appointments.cancelAppointment'), t('appointments.confirmCancel'), [
      { text: t('appointments.cancel'), style: 'cancel' },
      { text: t('appointments.cancelAppointment'), style: 'destructive', onPress: () => void doUpdate('cancelled') },
    ]);
  }, [doUpdate]);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.service}>{item.service}</Text>
          <Text style={styles.dateTime}>{item.date} · {item.time}</Text>
          {item.notes ? <Text style={styles.notes}>{item.notes}</Text> : null}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
          <Text style={[styles.statusText, { color: colors.text }]}>
            {t(`appointments.status.${item.status}` as Parameters<typeof t>[0])}
          </Text>
        </View>
      </View>
      <Text style={styles.requested}>{t('appointments.requestedOn', { date: new Date(item.createdAt).toLocaleDateString('ar-IQ') })}</Text>
      {item.status === 'pending' && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: SUCCESS }]}
            onPress={() => void doUpdate('confirmed')}
            disabled={loading}
          >
            <Text style={styles.actionBtnText}>{t('appointments.confirm')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: DANGER }]}
            onPress={confirmCancel}
            disabled={loading}
          >
            <Text style={styles.actionBtnText}>{t('appointments.cancelAppointment')}</Text>
          </TouchableOpacity>
        </View>
      )}
      {item.status === 'confirmed' && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: PRIMARY }]}
            onPress={() => void doUpdate('completed')}
            disabled={loading}
          >
            <Text style={styles.actionBtnText}>{t('appointments.complete')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: DANGER }]}
            onPress={confirmCancel}
            disabled={loading}
          >
            <Text style={styles.actionBtnText}>{t('appointments.cancelAppointment')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export function ProviderAppointmentsScreen({ providerId }: { providerId: string }): ReactElement {
  const api = useAppointmentsApi();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await api.listForProvider({ params: { providerId: providerId as any } });
      if (res.status === 200) setAppointments(res.body);
    } finally {
      if (refresh) setRefreshing(false); else setLoading(false);
    }
  }, [api, providerId]);

  useEffect(() => { void load(); }, [load]);

  const handleUpdate = useCallback((updated: Appointment) => {
    setAppointments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }, []);

  if (loading) {
    return (
      <Screen>
        <SafeAreaView style={styles.container}>
          <Text style={styles.loadingText}>{t('dashboard.status')}</Text>
        </SafeAreaView>
      </Screen>
    );
  }

  const grouped = {
    pending: appointments.filter((a) => a.status === 'pending'),
    confirmed: appointments.filter((a) => a.status === 'confirmed'),
    past: appointments.filter((a) => a.status === 'cancelled' || a.status === 'completed'),
  };

  return (
    <Screen>
      <SafeAreaView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
        >
          <Text style={styles.screenTitle}>{t('appointments.title')}</Text>

          {appointments.length === 0 ? (
            <EmptyState title={t('appointments.noAppointments')} body={t('appointments.noAppointmentsBody')} />
          ) : (
            <>
              {grouped.pending.length > 0 && (
                <View>
                  <Text style={styles.groupLabel}>{t('appointments.status.pending')} ({grouped.pending.length})</Text>
                  {grouped.pending.map((a) => (
                    <AppointmentCard key={a.id} item={a} providerId={providerId} onUpdate={handleUpdate} />
                  ))}
                </View>
              )}
              {grouped.confirmed.length > 0 && (
                <View>
                  <Text style={styles.groupLabel}>{t('appointments.status.confirmed')} ({grouped.confirmed.length})</Text>
                  {grouped.confirmed.map((a) => (
                    <AppointmentCard key={a.id} item={a} providerId={providerId} onUpdate={handleUpdate} />
                  ))}
                </View>
              )}
              {grouped.past.length > 0 && (
                <View>
                  <Text style={styles.groupLabel}>{t('appointments.status.completed')}</Text>
                  {grouped.past.map((a) => (
                    <AppointmentCard key={a.id} item={a} providerId={providerId} onUpdate={handleUpdate} />
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 16, gap: 12 },
  screenTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 },
  groupLabel: { fontSize: 14, fontWeight: '600', color: '#555', marginTop: 8, marginBottom: 4 },
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, gap: 8, marginBottom: 4 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  service: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  dateTime: { fontSize: 13, color: PRIMARY, marginTop: 2 },
  notes: { fontSize: 12, color: '#888', marginTop: 2 },
  requested: { fontSize: 11, color: '#AAA' },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  statusText: { fontSize: 12, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionBtn: { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  actionBtnText: { color: '#FFF', fontWeight: '600', fontSize: 13 },
  loadingText: { textAlign: 'center', marginTop: 40, color: '#888' },
});
