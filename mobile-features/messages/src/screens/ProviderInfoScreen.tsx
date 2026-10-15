/**
 * Shows provider details, past inquiry count, and first contact date.
 * Opened by tapping the provider name in a conversation.
 */
import { type Inquiry } from '@iraq-maps/contracts';
import { Card, Screen, Text } from '@iraq-maps/ui';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMessagingClient } from '../client';
import { t } from '../strings';

function InfoRow({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <View style={styles.row}>
      <Text tone="muted" variant="caption">{label}</Text>
      <Text>{value}</Text>
    </View>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ar-IQ', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function ProviderInfoScreen(): ReactElement {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const api = useMessagingClient();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);

  useEffect(() => {
    if (!placeId) return;
    void api.listInquiries({ query: {} }).then((res) => {
      if (res.status === 200) {
        // Filter inquiries that mention this placeId
        const filtered = res.body.items.filter((inq) =>
          inq.targets.some((tgt) => tgt.placeId === placeId),
        );
        setInquiries(filtered);
      }
    });
  }, [api, placeId]);

  const firstInquiry = inquiries.at(-1);
  const firstContact = firstInquiry ? formatDate(firstInquiry.createdAt) : t('providerInfo.noData');

  return (
    <Screen scroll>
      <Text variant="title">{t('providerInfo.title')}</Text>
      <Card>
        <InfoRow label={t('providerInfo.totalInquiries')} value={String(inquiries.length)} />
        <InfoRow label={t('providerInfo.firstContact')} value={firstContact} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 8, gap: 4 },
});
