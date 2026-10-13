import { testIDs, type ProviderStatus } from '@iraq-maps/contracts';
import { useApi } from '@iraq-maps/mobile-kit';
import { Badge, EmptyState, Screen, Text } from '@iraq-maps/ui';
import { useEffect, useState, type ReactElement } from 'react';
import { t } from '../strings';

/** Provider dashboard: shows current status badge (draft / pending / verified / suspended). */
export function ProviderDashboardScreen(): ReactElement {
  const api = useApi();
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await api.providers.me();
        if (res.status === 200) setStatus(res.body.status);
      } finally {
        setLoading(false);
      }
    })();
  }, [api]);

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
    </Screen>
  );
}
