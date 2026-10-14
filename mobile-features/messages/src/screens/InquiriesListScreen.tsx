import { type Inquiry } from '@iraq-maps/contracts';
import { Card, EmptyState, Screen, Text, Banner } from '@iraq-maps/ui';
import { useRouter } from 'expo-router';
import { useState, useEffect, type ReactElement } from 'react';
import { ScrollView, RefreshControl } from 'react-native';
import { useMessagingClient } from '../client';
import { t } from '../strings';

export function InquiriesListScreen(): ReactElement {
  const api = useMessagingClient();
  const router = useRouter();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const load = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const res = await api.listInquiries({ query: {} });
      if (res.status === 200) setInquiries(res.body.items);
    } catch {
      setError(t('list.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  if (!loading && inquiries.length === 0 && !error) {
    return <Screen><EmptyState title={t('list.empty')} /></Screen>;
  }

  return (
    <Screen>
      <Text variant="title">{t('list.title')}</Text>
      {error ? <Banner kind="error" message={error} /> : null}
      <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        {inquiries.map((inq) => (
          <Card key={inq.id} onPress={() => router.push({ pathname: '/messages/[requestId]', params: { requestId: inq.id } })}>
            <Text>{inq.text.slice(0, 80)}</Text>
            <Text tone="muted" variant="caption">{inq.createdAt.slice(0, 10)}</Text>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}
