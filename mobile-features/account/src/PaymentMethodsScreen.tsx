/**
 * PaymentMethodsScreen — list and manage saved payment methods.
 *
 * Supported types: card (display-only stub), wallet (link to WalletScreen),
 * cash_on_delivery (always available).
 */
import { useApi } from '@iraq-maps/mobile-kit';
import { Banner, Button, Screen, Sheet, Text } from '@iraq-maps/ui';
import { href } from '@iraq-maps/mobile-kit';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { ScreenTitle } from './ScreenTitle';
import { t } from './strings';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CardDetails {
  last4: string;
  brand: 'visa' | 'mastercard' | 'other';
  expiryMonth: number;
  expiryYear: number;
  holderName?: string;
}

type RawPaymentMethod =
  | { id: string; userId: string; type: 'card'; card: CardDetails; isDefault: boolean; createdAt: string }
  | { id: string; userId: string; type: 'wallet'; isDefault: boolean; createdAt: string }
  | { id: string; userId: string; type: 'cash_on_delivery'; isDefault: boolean; createdAt: string };

// ─── Method row ───────────────────────────────────────────────────────────────

function MethodRow({
  method,
  onRemove,
  onSetDefault,
}: {
  method: RawPaymentMethod;
  onRemove: (id: string) => void;
  onSetDefault: (id: string) => void;
}): ReactElement {
  const [menuOpen, setMenuOpen] = useState(false);

  const title = (() => {
    if (method.type === 'card') {
      const brandLabel = t(`payment.card.${method.card.brand}` as Parameters<typeof t>[0]);
      return `${brandLabel} · ${t('payment.cardEnding', { last4: method.card.last4 })}`;
    }
    if (method.type === 'wallet') return t('payment.walletMethod');
    return t('payment.cashOnDelivery');
  })();

  const subtitle = (() => {
    if (method.type === 'card') {
      return t('payment.expires', {
        month: method.card.expiryMonth.toString().padStart(2, '0'),
        year: method.card.expiryYear.toString(),
      });
    }
    if (method.type === 'wallet') return t('payment.walletMethodDesc');
    return t('payment.cashOnDeliveryDesc');
  })();

  const icon = method.type === 'card' ? '💳' : method.type === 'wallet' ? '👛' : '💵';

  return (
    <>
      <Pressable
        style={styles.methodRow}
        onPress={() => setMenuOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={title}
      >
        <View style={styles.methodIcon}>
          <Text style={styles.iconText}>{icon}</Text>
        </View>
        <View style={styles.methodInfo}>
          <View style={styles.methodTitleRow}>
            <Text style={styles.methodTitle}>{title}</Text>
            {method.isDefault ? (
              <View style={styles.defaultBadge}>
                <Text style={styles.defaultBadgeText}>{t('payment.defaultBadge')}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.methodSubtitle}>{subtitle}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>

      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)}>
        <Text variant="subtitle">{title}</Text>
        {!method.isDefault ? (
          <Button
            label={t('payment.setDefault')}
            onPress={() => {
              setMenuOpen(false);
              onSetDefault(method.id);
            }}
          />
        ) : null}
        {method.type === 'card' ? (
          <Button
            variant="danger"
            label={t('payment.remove')}
            onPress={() => {
              setMenuOpen(false);
              onRemove(method.id);
            }}
          />
        ) : null}
        <Button
          variant="secondary"
          label={t('actions.cancel' as Parameters<typeof t>[0])}
          onPress={() => setMenuOpen(false)}
        />
      </Sheet>
    </>
  );
}

// ─── Static payment option card ───────────────────────────────────────────────

function StaticOptionCard({
  icon,
  title,
  description,
  note,
}: {
  icon: string;
  title: string;
  description: string;
  note?: string;
}): ReactElement {
  return (
    <View style={styles.staticCard}>
      <Text style={styles.staticIcon}>{icon}</Text>
      <View style={styles.staticInfo}>
        <Text style={styles.staticTitle}>{title}</Text>
        <Text style={styles.staticDesc}>{description}</Text>
        {note ? <Text style={styles.staticNote}>{note}</Text> : null}
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function PaymentMethodsScreen(): ReactElement {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = useApi() as any;

  const [methods, setMethods] = useState<RawPaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showAddCardNote, setShowAddCardNote] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const fetchMethods = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/v1/payments/methods', {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error('load_failed');
      const data = await res.json() as RawPaymentMethod[];
      setMethods(data);
    } catch {
      setError(t('errors.network' as Parameters<typeof t>[0]));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMethods();
  }, [fetchMethods]);

  const handleRemove = useCallback(async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/v1/payments/methods/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.status !== 204) throw new Error('remove_failed');
      setMethods((prev) => prev.filter((m) => m.id !== id));
    } catch {
      setError(t('errors.generic' as Parameters<typeof t>[0]));
    } finally {
      setBusy(false);
      setConfirmRemoveId(null);
    }
  }, []);

  const handleSetDefault = useCallback(async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/v1/payments/methods/${encodeURIComponent(id)}/default`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) throw new Error('set_default_failed');
      const updated = await res.json() as RawPaymentMethod;
      setMethods((prev) =>
        prev.map((m) =>
          m.id === id ? updated : { ...m, isDefault: false },
        ),
      );
    } catch {
      setError(t('errors.generic' as Parameters<typeof t>[0]));
    } finally {
      setBusy(false);
    }
  }, []);

  const savedCards = methods.filter((m) => m.type === 'card');
  const hasWalletMethod = methods.some((m) => m.type === 'wallet');

  return (
    <Screen scroll>
      <ScreenTitle title={t('payment.methods')} />

      {error ? <Banner kind="error" message={error} /> : null}
      {successMsg ? <Banner kind="info" message={successMsg} /> : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <>
          {/* Saved cards */}
          {savedCards.length > 0 ? (
            <View style={styles.section}>
              {savedCards.map((m) => (
                <MethodRow
                  key={m.id}
                  method={m}
                  onRemove={(id) => setConfirmRemoveId(id)}
                  onSetDefault={(id) => { void handleSetDefault(id); }}
                />
              ))}
            </View>
          ) : null}

          {/* Add card stub */}
          <Pressable
            style={styles.addCardRow}
            accessibilityRole="button"
            onPress={() => setShowAddCardNote(!showAddCardNote)}
          >
            <Text style={styles.addCardIcon}>+</Text>
            <Text style={styles.addCardLabel}>{t('payment.addCard')}</Text>
          </Pressable>

          {showAddCardNote ? (
            <Banner kind="info" message={t('payment.addCardNote')} />
          ) : null}

          <View style={styles.divider} />

          {/* Always-available options */}
          <StaticOptionCard
            icon="💵"
            title={t('payment.cashOnDelivery')}
            description={t('payment.cashOnDeliveryDesc')}
          />

          <StaticOptionCard
            icon="👛"
            title={t('payment.walletMethod')}
            description={t('payment.walletMethodDesc')}
          />

          {/* Link to wallet */}
          <View style={styles.walletLinkRow}>
            <Button
              variant="secondary"
              label={t('wallet.title')}
              onPress={() => router.push(href('accountWallet') as never)}
            />
          </View>
        </>
      )}

      {/* Remove confirm sheet */}
      <Sheet visible={!!confirmRemoveId} onClose={() => setConfirmRemoveId(null)}>
        <Text variant="subtitle">{t('payment.remove')}</Text>
        <Text>{t('payment.removeConfirm')}</Text>
        <Button
          variant="danger"
          label={t('payment.remove')}
          loading={busy}
          onPress={() => { void handleRemove(confirmRemoveId!); }}
        />
        <Button
          variant="secondary"
          label={t('actions.cancel' as Parameters<typeof t>[0])}
          onPress={() => setConfirmRemoveId(null)}
          disabled={busy}
        />
      </Sheet>
    </Screen>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  section: {
    marginBottom: 8,
  },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  methodIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: 12,
  },
  iconText: {
    fontSize: 20,
  },
  methodInfo: {
    flex: 1,
    gap: 3,
  },
  methodTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  methodTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#212121',
  },
  methodSubtitle: {
    fontSize: 13,
    color: '#757575',
  },
  defaultBadge: {
    backgroundColor: '#1565C0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  defaultBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  chevron: {
    fontSize: 20,
    color: '#BDBDBD',
    marginStart: 8,
  },
  addCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  addCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#1565C0',
    borderStyle: 'dashed',
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 24,
    color: '#1565C0',
    lineHeight: 44,
  },
  addCardLabel: {
    fontSize: 15,
    color: '#1565C0',
    fontWeight: '500',
  },
  divider: {
    height: 8,
    backgroundColor: '#F5F5F5',
    marginVertical: 8,
  },
  staticCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  staticIcon: {
    fontSize: 28,
    width: 44,
    textAlign: 'center',
  },
  staticInfo: {
    flex: 1,
    gap: 3,
  },
  staticTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#212121',
  },
  staticDesc: {
    fontSize: 13,
    color: '#757575',
  },
  staticNote: {
    fontSize: 12,
    color: '#1565C0',
    marginTop: 4,
  },
  walletLinkRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
});
