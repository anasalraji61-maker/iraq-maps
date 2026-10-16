/**
 * WalletScreen — displays wallet balance and transaction history.
 *
 * Balance is shown in IQD with Arabic-Indic digits (٬ thousands separator, د.ع suffix).
 * Transaction history is paginated and shows type, amount, description and date.
 */
import { Banner, Screen, Text } from '@iraq-maps/ui';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { ScreenTitle } from './ScreenTitle';
import { t } from './strings';

// ─── IQD formatter (Arabic-Indic digits) ─────────────────────────────────────

/** Format an IQD integer amount using Arabic-Indic digits and Arabic thousands separator. */
export function formatIqdArabic(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return t('wallet.iqdSuffixZero');

  const digits = t('wallet.iqdDigits');
  const sep = t('wallet.iqdThousandSep');
  const suffix = t('wallet.iqdSuffix');

  const intStr = Math.floor(amount).toString();
  let result = '';
  for (let i = 0; i < intStr.length; i++) {
    if (i > 0 && (intStr.length - i) % 3 === 0) {
      result += sep;
    }
    const digit = parseInt(intStr[i]!, 10);
    result += digits[digit] ?? intStr[i]!;
  }
  return `${result}${suffix}`;
}

/** Format an IQD amount using Western digits (for accessibility / English locale). */
export function formatIqdWestern(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return '0 IQD';
  return `${Math.floor(amount).toLocaleString('en-US')} IQD`;
}

// ─── Types (mirroring contract shapes without importing the branded types) ────

interface WalletData {
  id: string;
  balanceIqd: number;
  heldIqd: number;
  availableIqd: number;
}

interface TransactionRow {
  id: string;
  type: 'credit' | 'debit' | 'hold' | 'release' | 'refund';
  status: 'pending' | 'completed' | 'failed' | 'reversed';
  amountIqd: number;
  description: string;
  createdAt: string;
}

// ─── Transaction row component ────────────────────────────────────────────────

function TxRow({ item }: { item: TransactionRow }): ReactElement {
  const isIncoming = item.type === 'credit' || item.type === 'release' || item.type === 'refund';
  const amountColor = isIncoming ? '#2E7D32' : '#C62828';
  const sign = isIncoming ? '+' : '−';

  const typeLabel = t(`wallet.txType.${item.type}` as Parameters<typeof t>[0]);
  const statusLabel =
    item.status !== 'completed'
      ? ` · ${t(`wallet.txStatus.${item.status}` as Parameters<typeof t>[0])}`
      : '';

  const dateStr = new Date(item.createdAt).toLocaleDateString('ar-IQ', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <View style={styles.txRow}>
      <View style={styles.txLeft}>
        <RNText style={styles.txDesc} numberOfLines={1}>
          {item.description || typeLabel}
        </RNText>
        <Text style={styles.txMeta}>
          {typeLabel}
          {statusLabel} · {dateStr}
        </Text>
      </View>
      <Text style={[styles.txAmount, { color: amountColor }]}>
        {sign}
        {formatIqdArabic(item.amountIqd)}
      </Text>
    </View>
  );
}

// ─── Balance card ─────────────────────────────────────────────────────────────

function BalanceCard({ wallet }: { wallet: WalletData }): ReactElement {
  return (
    <View style={styles.card} accessibilityRole="summary">
      <Text style={styles.balanceLabel}>{t('wallet.balance')}</Text>
      <RNText
        style={styles.balanceAmount}
        accessibilityLabel={formatIqdWestern(wallet.availableIqd)}
      >
        {formatIqdArabic(wallet.availableIqd)}
      </RNText>
      {wallet.heldIqd > 0 && (
        <Text style={styles.heldAmount}>
          {t('wallet.held')}: {formatIqdArabic(wallet.heldIqd)}
        </Text>
      )}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function WalletScreen(): ReactElement {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTopUpInfo, setShowTopUpInfo] = useState(false);
  const [showTransferInfo, setShowTransferInfo] = useState(false);

  const fetchWallet = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/v1/payments/wallet', {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error('wallet_load_failed');
      const data = await res.json() as WalletData;
      setWallet(data);

      const txRes = await fetch('/v1/payments/wallet/transactions?limit=20', {
        headers: { Accept: 'application/json' },
      });
      if (txRes.ok) {
        const txData = await txRes.json() as { items: TransactionRow[]; nextCursor: string | null };
        setTransactions(txData.items);
        setNextCursor(txData.nextCursor);
      }
    } catch {
      setError(t('errors.network' as Parameters<typeof t>[0]));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const url = `/v1/payments/wallet/transactions?limit=20&cursor=${encodeURIComponent(nextCursor)}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const data = await res.json() as { items: TransactionRow[]; nextCursor: string | null };
        setTransactions((prev) => [...prev, ...data.items]);
        setNextCursor(data.nextCursor);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  useEffect(() => {
    void fetchWallet();
  }, [fetchWallet]);

  if (loading) {
    return (
      <Screen>
        <ScreenTitle title={t('wallet.title')} />
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <ScreenTitle title={t('wallet.title')} />

      {error ? (
        <Banner kind="error" message={error} />
      ) : null}

      {wallet ? <BalanceCard wallet={wallet} /> : null}

      <View style={styles.actions}>
        <Pressable
          style={styles.actionBtn}
          accessibilityRole="button"
          onPress={() => setShowTopUpInfo(true)}
        >
          <Text style={styles.actionBtnText}>{t('wallet.topUp')}</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.actionBtnSecondary]}
          accessibilityRole="button"
          onPress={() => setShowTransferInfo(true)}
        >
          <Text style={styles.actionBtnTextSecondary}>{t('wallet.transfer')}</Text>
        </Pressable>
      </View>

      {showTopUpInfo ? (
        <Banner kind="info" message={t('wallet.comingSoon')} />
      ) : null}

      {showTransferInfo ? (
        <Banner kind="info" message={t('wallet.comingSoon')} />
      ) : null}

      <Text style={styles.sectionHeader}>{t('wallet.history')}</Text>

      {transactions.length === 0 ? (
        <View style={styles.center}>
          <Text tone="muted">{t('wallet.emptyHistory')}</Text>
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <TxRow item={item} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          onEndReached={() => { void loadMore(); }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.center}>
                <ActivityIndicator size="small" />
              </View>
            ) : null
          }
        />
      )}
    </Screen>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    margin: 16,
    padding: 20,
    backgroundColor: '#1565C0',
    borderRadius: 16,
    alignItems: 'center',
    gap: 8,
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
  },
  balanceAmount: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
  },
  heldAmount: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 16,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#1565C0',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionBtnSecondary: {
    backgroundColor: '#E3F2FD',
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  actionBtnTextSecondary: {
    color: '#1565C0',
    fontWeight: '600',
    fontSize: 15,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  txRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  txLeft: {
    flex: 1,
    marginEnd: 12,
    gap: 4,
  },
  txDesc: {
    fontSize: 14,
    color: '#212121',
  },
  txMeta: {
    fontSize: 12,
    color: '#757575',
  },
  txAmount: {
    fontSize: 15,
    fontWeight: '600',
  },
  separator: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginHorizontal: 16,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
});
