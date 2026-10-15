/**
 * Provider Promotions Management Screen — create, view, delete promotions.
 */
import { promotionsContract, type Promotion } from '@iraq-maps/contracts';
import { useApi, useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { Button, EmptyState, Screen } from '@iraq-maps/ui';
import { initClient } from '@ts-rest/core';
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  Alert,
  I18nManager,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../strings';

I18nManager.forceRTL(true);

const PRIMARY = '#1976D2';
const DANGER = '#EF4444';

function usePromotionsApi() {
  const baseUrl = useApiBaseUrl();
  useApi();
  return useMemo(() => initClient(promotionsContract, { baseUrl, baseHeaders: {} }), [baseUrl]);
}

function PromotionBadge({ discountPct }: { discountPct: number | null }): ReactElement | null {
  if (!discountPct) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{t('promotions.discountBadge', { pct: discountPct })}</Text>
    </View>
  );
}

function PromotionCard({ item, onDelete }: { item: Promotion; onDelete: (id: string) => void }): ReactElement {
  const isActive = item.status === 'active';
  const validTo = new Date(item.validTo).toLocaleDateString('ar-IQ');
  return (
    <View style={[styles.card, !isActive && styles.cardExpired]}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardDesc}>{item.description}</Text>
        </View>
        <PromotionBadge discountPct={item.discountPct} />
      </View>
      <Text style={styles.cardDate}>{t('promotions.validUntil', { date: validTo })}</Text>
      {item.conditions ? <Text style={styles.cardConditions}>{item.conditions}</Text> : null}
      <View style={styles.cardFooter}>
        <Text style={[styles.statusBadge, isActive ? styles.statusActive : styles.statusExpired]}>
          {t(`promotions.${item.status}` as Parameters<typeof t>[0])}
        </Text>
        {isActive && (
          <TouchableOpacity onPress={() => onDelete(item.id)} style={styles.deleteBtn}>
            <Text style={styles.deleteBtnText}>{t('promotions.delete')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

interface FormState {
  title: string;
  description: string;
  discountPct: string;
  validFrom: string;
  validTo: string;
  conditions: string;
}

function today(): string {
  return new Date().toISOString().split('T')[0] ?? '';
}
function inDays(n: number): string {
  const d = new Date(Date.now() + n * 86400000);
  return d.toISOString().split('T')[0] ?? '';
}

export function ProviderPromotionsScreen(): ReactElement {
  const api = usePromotionsApi();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    title: '',
    description: '',
    discountPct: '',
    validFrom: today(),
    validTo: inDays(30),
    conditions: '',
  });

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await api.listActive();
      if (res.status === 200) setPromotions(res.body);
    } finally {
      if (refresh) setRefreshing(false); else setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const handleSave = useCallback(async () => {
    if (!form.title.trim() || !form.description.trim()) return;
    setSaving(true);
    try {
      const body = {
        title: form.title.trim(),
        description: form.description.trim(),
        discountPct: form.discountPct ? parseInt(form.discountPct, 10) : undefined,
        validFrom: new Date(form.validFrom + 'T00:00:00Z').toISOString(),
        validTo: new Date(form.validTo + 'T23:59:59Z').toISOString(),
        conditions: form.conditions.trim() || undefined,
      };
      const res = await api.create({ body });
      if (res.status === 201) {
        setPromotions((p) => [res.body, ...p]);
        setShowForm(false);
        setForm({ title: '', description: '', discountPct: '', validFrom: today(), validTo: inDays(30), conditions: '' });
      }
    } finally {
      setSaving(false);
    }
  }, [api, form]);

  const handleDelete = useCallback((id: string) => {
    Alert.alert(t('promotions.delete'), t('promotions.deleteConfirm'), [
      { text: t('promotions.cancel'), style: 'cancel' },
      {
        text: t('promotions.delete'), style: 'destructive',
        onPress: async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const res = await api.delete({ params: { id: id as any } });
          if (res.status === 204) {
            setPromotions((p) => p.filter((x) => x.id !== id));
          }
        },
      },
    ]);
  }, [api]);

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
          <View style={styles.headerRow}>
            <Text style={styles.screenTitle}>{t('promotions.title')}</Text>
            <TouchableOpacity onPress={() => setShowForm((v) => !v)} style={styles.addBtn}>
              <Text style={styles.addBtnText}>{showForm ? t('promotions.cancel') : t('promotions.add')}</Text>
            </TouchableOpacity>
          </View>

          {showForm && (
            <View style={styles.form}>
              <Text style={styles.label}>{t('promotions.titleLabel')}</Text>
              <TextInput
                style={styles.input}
                value={form.title}
                onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
                placeholder={t('promotions.titlePlaceholder')}
                maxLength={120}
              />
              <Text style={styles.label}>{t('promotions.description')}</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={form.description}
                onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
                placeholder={t('promotions.descriptionPlaceholder')}
                multiline
                maxLength={500}
              />
              <Text style={styles.label}>{t('promotions.discountPct')}</Text>
              <TextInput
                style={styles.input}
                value={form.discountPct}
                onChangeText={(v) => setForm((f) => ({ ...f, discountPct: v }))}
                keyboardType="numeric"
                maxLength={3}
              />
              <Text style={styles.label}>{t('promotions.validFrom')}</Text>
              <TextInput
                style={styles.input}
                value={form.validFrom}
                onChangeText={(v) => setForm((f) => ({ ...f, validFrom: v }))}
                placeholder="YYYY-MM-DD"
              />
              <Text style={styles.label}>{t('promotions.validTo')}</Text>
              <TextInput
                style={styles.input}
                value={form.validTo}
                onChangeText={(v) => setForm((f) => ({ ...f, validTo: v }))}
                placeholder="YYYY-MM-DD"
              />
              <Text style={styles.label}>{t('promotions.conditions')}</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={form.conditions}
                onChangeText={(v) => setForm((f) => ({ ...f, conditions: v }))}
                placeholder={t('promotions.conditionsPlaceholder')}
                multiline
                maxLength={300}
              />
              <Button label={t('promotions.save')} onPress={() => void handleSave()} loading={saving} />
            </View>
          )}

          {promotions.length === 0 ? (
            <EmptyState title={t('promotions.noPromotions')} body={t('promotions.noPromotionsBody')} />
          ) : (
            promotions.map((p) => <PromotionCard key={p.id} item={p} onDelete={handleDelete} />)
          )}
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 16, gap: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  screenTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  addBtn: { backgroundColor: PRIMARY, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: '#FFF', fontWeight: '600', fontSize: 14 },
  form: { backgroundColor: '#FFF', borderRadius: 12, padding: 16, gap: 8, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 2 },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: '#FAFAFA' },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, gap: 6 },
  cardExpired: { opacity: 0.6 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  cardDesc: { fontSize: 13, color: '#555', marginTop: 2 },
  cardDate: { fontSize: 12, color: '#888' },
  cardConditions: { fontSize: 12, color: '#888', fontStyle: 'italic' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  badge: { backgroundColor: '#FFF3E0', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { color: '#E65100', fontWeight: '700', fontSize: 13 },
  statusBadge: { fontSize: 12, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusActive: { backgroundColor: '#E8F5E9', color: '#1B5E20' },
  statusExpired: { backgroundColor: '#F5F5F5', color: '#757575' },
  deleteBtn: { paddingHorizontal: 10, paddingVertical: 4 },
  deleteBtnText: { color: DANGER, fontWeight: '600', fontSize: 13 },
  loadingText: { textAlign: 'center', marginTop: 40, color: '#888' },
});

/** Re-usable badge to show on a provider place card. */
export { PromotionBadge };
