/**
 * User-facing Request Appointment Screen — pick date/time and service.
 */
import { appointmentsContract, type ProviderId } from '@iraq-maps/contracts';
import { useApi, useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { Button, Screen } from '@iraq-maps/ui';
import { initClient } from '@ts-rest/core';
import { useCallback, useMemo, useState, type ReactElement } from 'react';
import {
  I18nManager,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../strings';

I18nManager.forceRTL(true);

function useAppointmentsApi() {
  const baseUrl = useApiBaseUrl();
  useApi();
  return useMemo(() => initClient(appointmentsContract, { baseUrl, baseHeaders: {} }), [baseUrl]);
}

function today(): string {
  return new Date().toISOString().split('T')[0] ?? '';
}

export function RequestAppointmentScreen({
  providerId,
  onSuccess,
  onCancel,
}: {
  providerId: ProviderId;
  onSuccess?: () => void;
  onCancel?: () => void;
}): ReactElement {
  const api = useAppointmentsApi();
  const [date, setDate] = useState(today());
  const [time, setTime] = useState('10:00');
  const [service, setService] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!service.trim()) return;
    setSaving(true);
    try {
      const res = await api.request({
        params: { providerId },
        body: {
          date,
          time,
          service: service.trim(),
          notes: notes.trim() || undefined,
        },
      });
      if (res.status === 201) {
        onSuccess?.();
      }
    } finally {
      setSaving(false);
    }
  }, [api, date, notes, onSuccess, providerId, service, time]);

  return (
    <Screen>
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.screenTitle}>{t('appointments.request')}</Text>

          <Text style={styles.label}>{t('appointments.service')}</Text>
          <TextInput
            style={styles.input}
            value={service}
            onChangeText={setService}
            placeholder={t('appointments.servicePlaceholder')}
            maxLength={200}
          />

          <Text style={styles.label}>{t('appointments.date')}</Text>
          <TextInput
            style={styles.input}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
          />

          <Text style={styles.label}>{t('appointments.time')}</Text>
          <TextInput
            style={styles.input}
            value={time}
            onChangeText={setTime}
            placeholder={t('appointments.timePlaceholder')}
          />

          <Text style={styles.label}>{t('appointments.notes')}</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={notes}
            onChangeText={setNotes}
            placeholder={t('appointments.notesPlaceholder')}
            multiline
            maxLength={500}
          />

          <View style={styles.btnRow}>
            {onCancel && (
              <Button label={t('appointments.cancel')} onPress={onCancel} />
            )}
            <Button label={t('appointments.submit')} onPress={() => void handleSubmit()} loading={saving} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 16, gap: 10 },
  screenTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 2 },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: '#FFF' },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
});
