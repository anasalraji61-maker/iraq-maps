import { messagingTestIDs, type DeliveryTarget, type Inquiry } from '@iraq-maps/contracts';
import { Badge, Banner, Button, Card, ListItem, Screen, Text } from '@iraq-maps/ui';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { useState, useEffect, type ReactElement } from 'react';
import { Linking } from 'react-native';
import { useMessagingClient } from '../client';
import { t } from '../strings';

function TargetRow({ target }: { target: DeliveryTarget }): ReactElement {
  const copyHandoff = async (copyText: string) => {
    await Clipboard.setStringAsync(copyText);
  };
  const openHandoff = (url: string) => { void Linking.openURL(url); };

  return (
    <Card>
      <ListItem
        title={target.placeId}
        trailing={<Badge label={t(`confirm.channel.${target.channel}`)} testID={messagingTestIDs.channelBadge(target.placeId)} />}
      />
      <Text tone="muted" variant="caption">{t(`detail.status.${target.status}`)}</Text>
      {target.handoffLink ? (
        <>
          <Button
            label={t('detail.copy')}
            variant="secondary"
            onPress={() => { void copyHandoff(target.handoffLink!.copyText); }}
            testID={messagingTestIDs.handoffCopy}
          />
          <Button
            label={t('detail.open')}
            variant="secondary"
            onPress={() => openHandoff(target.handoffLink!.url)}
          />
        </>
      ) : null}
    </Card>
  );
}

export function InquiryDetailScreen(): ReactElement {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const api = useMessagingClient();
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!requestId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.getInquiry({ params: { id: requestId as any } })
      .then((res) => { if (res.status === 200) setInquiry(res.body); })
      .catch(() => setError(t('detail.loadError')));
  }, [requestId]);

  return (
    <Screen scroll>
      <Text variant="title">{t('detail.title')}</Text>
      {error ? <Banner kind="error" message={error} /> : null}
      {inquiry ? (
        <>
          <Text>{inquiry.text}</Text>
          {inquiry.targets.map((target) => (
            <TargetRow key={target.placeId} target={target} />
          ))}
        </>
      ) : null}
    </Screen>
  );
}
