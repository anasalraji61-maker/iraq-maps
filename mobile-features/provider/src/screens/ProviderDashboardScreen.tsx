import { testIDs, type ProviderStatus } from '@iraq-maps/contracts';
import { useApi } from '@iraq-maps/mobile-kit';
import { Badge, Button, EmptyState, Screen, Text } from '@iraq-maps/ui';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { t } from '../strings';

const POLL_INTERVAL_MS = 30_000;

/** Provider dashboard: shows current status badge (draft / pending / verified / suspended). */
export function ProviderDashboardScreen(): ReactElement {
  const api = useApi();
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.providers.me();
      if (res.status === 200) setStatus(res.body.status);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  // Auto-poll every 30 s while verification is in progress
  useEffect(() => {
    if (status === 'verified' || status === null) return;
    const interval = setInterval(() => {
      void fetchStatus();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [status, fetchStatus]);

  if (loading) return <Screen>{null}</Screen>;

  if (!status) {
    return (
      <Screen>
        <EmptyState title={t('dashboard.title')} body={t('dashboard.status')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text variant="title">{t('dashboard.title')}</Text>
      <Text>{t('dashboard.status')}</Text>
      <Badge testID={testIDs.provider.status} label={t(`dashboard.${status}`)} />
      {status !== 'verified' && (
        <Button
          label={t('dashboard.refresh')}
          onPress={() => { void fetchStatus(); }}
        />
      )}
    </Screen>
  );
}
