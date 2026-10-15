/**
 * Provider earnings tracker — local-only (AsyncStorage).
 * The provider manually logs sales; totals and a 7-day bar chart are shown.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button, EmptyState, Screen } from '@iraq-maps/ui';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  I18nManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../strings';

I18nManager.forceRTL(true);

const STORAGE_KEY = '@iraq_maps/provider_earnings';
const MAX_NOTE = 200;
const PRIMARY = '#1976D2';

export interface SaleEntry {
  id: string;
  amount: number;
  date: string; // YYYY-MM-DD
  note: string;
  createdAt: string;
}

async function loadSales(): Promise<SaleEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SaleEntry[];
  } catch {
    return [];
  }
}

async function saveSales(sales: SaleEntry[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sales));
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function last7Days(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
}

// eslint-disable-next-line @typescript-eslint/no-use-before-define
function SaleAmountText({ amount }: { amount: number }): ReactElement {
  const display = `${amount.toLocaleString('ar-IQ')} ${t('earnings.currency')}`;
  return <Text style={{ fontSize: 16, fontWeight: '700', color: '#1565C0' }}>{display}</Text>;
}

function MiniBar({ value, max }: { value: number; max: number }): ReactElement {
  const flex = max > 0 ? value / max : 0;
  return (
    <View style={barStyles.track}>
      <View style={{ flex: 1 }} />
      <View style={[barStyles.fill, { flex: flex }]} />
    </View>
  );
}

const barStyles = StyleSheet.create({
  track: { width: 28, height: 48, backgroundColor: '#E3F2FD', borderRadius: 4, flexDirection: 'column', overflow: 'hidden' },
  fill: { backgroundColor: PRIMARY, borderRadius: 4 },
});

export function ProviderEarningsScreen(): ReactElement {
  const [sales, setSales] = useState<SaleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await loadSales();
    setSales(data.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleSave() {
    const num = parseFloat(amount.replace(/,/g, ''));
    if (!amount.trim() || isNaN(num) || num <= 0) return;
    setSaving(true);
    const entry: SaleEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      amount: num,
      date,
      note: note.trim().slice(0, MAX_NOTE),
      createdAt: new Date().toISOString(),
    };
    const next = [entry, ...sales];
    await saveSales(next);
    setSales(next);
    setAmount('');
    setDate(todayStr());
    setNote('');
    setShowForm(false);
    setSaving(false);
  }

  async function handleDelete(id: string) {
    Alert.alert(t('earnings.delete'), t('earnings.deleteConfirm'), [
      { text: t('earnings.cancel'), style: 'cancel' },
      {
        text: t('earnings.delete'),
        style: 'destructive',
        onPress: async () => {
          const next = sales.filter((s) => s.id !== id);
          await saveSales(next);
          setSales(next);
        },
      },
    ]);
  }

  const total = sales.reduce((acc, s) => acc + s.amount, 0);
  const totalLabel = `${total.toLocaleString('ar-IQ')} ${t('earnings.currency')}`;

  const days = last7Days();
  const dailyMap: Record<string, number> = {};
  for (const d of days) dailyMap[d] = 0;
  for (const s of sales) {
    if (s.date in dailyMap) dailyMap[s.date] = (dailyMap[s.date] ?? 0) + s.amount;
  }
  const dailyValues = days.map((d) => dailyMap[d] ?? 0);
  const maxDay = Math.max(...dailyValues, 1);

  if (loading) {
    return <Screen><View style={{ flex: 1 }} /></Screen>;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FAFAFA' }}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{t('earnings.title')}</Text>
          <TouchableOpacity onPress={() => setShowForm(true)} style={styles.addBtn}>
            <Text style={styles.addBtnText}>+ {t('earnings.addSale')}</Text>
          </TouchableOpacity>
        </View>

        {/* Total card */}
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>{t('earnings.total')}</Text>
          <Text style={styles.totalAmount}>{totalLabel}</Text>
        </View>

        {/* 7-day chart */}
        {sales.length > 0 && (
          <View style={styles.chartCard}>
            <Text style={styles.chartLabel}>{t('earnings.chart7days')}</Text>
            <View style={styles.bars}>
              {days.map((d, i) => (
                <View key={d} style={styles.barCol}>
                  <MiniBar value={dailyValues[i] ?? 0} max={maxDay} />
                  <Text style={styles.barDay}>{d.slice(8)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Add form */}
        {showForm && (
          <View style={styles.form}>
            <Text style={styles.formLabel}>{t('earnings.amount')}</Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              placeholder={t('earnings.amountPlaceholder')}
              keyboardType="numeric"
              textAlign="right"
            />
            <Text style={styles.formLabel}>{t('earnings.date')}</Text>
            <TextInput
              style={styles.input}
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              keyboardType="ascii-capable"
              textAlign="right"
            />
            <Text style={styles.formLabel}>{t('earnings.note')}</Text>
            <TextInput
              style={[styles.input, { height: 72, textAlignVertical: 'top' }]}
              value={note}
              onChangeText={(v) => setNote(v.slice(0, MAX_NOTE))}
              placeholder={t('earnings.notePlaceholder')}
              multiline
              textAlign="right"
            />
            <View style={styles.formButtons}>
              <Button label={t('earnings.save')} onPress={() => void handleSave()} disabled={saving} />
              <TouchableOpacity onPress={() => setShowForm(false)} style={styles.cancelBtn}>
                <Text style={{ color: '#666' }}>{t('earnings.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Sales list */}
        {sales.length === 0 ? (
          <EmptyState
            title={t('earnings.noSales')}
            body={t('earnings.noSalesBody')}
          />
        ) : (
          <View style={styles.list}>
            {sales.map((s) => (
              <View key={s.id} style={styles.saleRow}>
                <View style={{ flex: 1 }}>
                  <SaleAmountText amount={s.amount} />
                  <Text style={styles.saleDate}>{s.date}</Text>
                  {s.note ? <Text style={styles.saleNote}>{s.note}</Text> : null}
                </View>
                <TouchableOpacity onPress={() => void handleDelete(s.id)} style={styles.deleteBtn}>
                  <Text style={{ color: '#EF4444', fontSize: 13 }}>{t('earnings.delete')}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  addBtn: { backgroundColor: PRIMARY, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 7 },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  totalCard: { backgroundColor: '#1565C0', borderRadius: 12, padding: 20, alignItems: 'center', gap: 4 },
  totalLabel: { color: 'rgba(255,255,255,.8)', fontSize: 13 },
  totalAmount: { color: '#fff', fontSize: 26, fontWeight: '700' },
  chartCard: { backgroundColor: '#fff', borderRadius: 10, padding: 16, elevation: 1, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  chartLabel: { fontSize: 13, color: '#666', marginBottom: 12 },
  bars: { flexDirection: 'row', gap: 8, justifyContent: 'space-between', alignItems: 'flex-end' },
  barCol: { alignItems: 'center', gap: 4 },
  barDay: { fontSize: 10, color: '#999' },
  form: { backgroundColor: '#fff', borderRadius: 10, padding: 16, gap: 8, elevation: 1, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  formLabel: { fontSize: 13, color: '#555', fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 10, fontSize: 15, backgroundColor: '#FAFAFA' },
  formButtons: { flexDirection: 'row', gap: 12, alignItems: 'center', marginTop: 4 },
  cancelBtn: { padding: 8 },
  list: { gap: 8 },
  saleRow: { backgroundColor: '#fff', borderRadius: 10, padding: 14, flexDirection: 'row', alignItems: 'center', elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  saleAmount: { fontSize: 16, fontWeight: '700', color: '#1565C0' },
  saleDate: { fontSize: 12, color: '#888', marginTop: 2 },
  saleNote: { fontSize: 13, color: '#555', marginTop: 4 },
  deleteBtn: { paddingHorizontal: 8, paddingVertical: 4 },
});
