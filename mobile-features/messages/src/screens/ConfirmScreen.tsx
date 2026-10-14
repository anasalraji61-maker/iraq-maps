import { messagingTestIDs, type MessagingChannelKind } from '@iraq-maps/contracts';
import { InquiryOutbox } from '@iraq-maps/mobile-kit';
import { Badge, Banner, Button, ListItem, Screen, Text } from '@iraq-maps/ui';
import { useLocalSearchParams } from 'expo-router';
import { fetchNetInfo } from '../netinfo';
import { useState, type ReactElement } from 'react';
import { v4 as uuid } from 'uuid';
import { useMessagingClient } from '../client';
import { t } from '../strings';

function channelLabel(channel: MessagingChannelKind): string {
  return t(`confirm.channel.${channel}`);
}

export function ConfirmScreen(): ReactElement {
  const params = useLocalSearchParams<{ text?: string; placeIds?: string }>();
  const text = params.text ?? '';
  const placeIds = params.placeIds ? params.placeIds.split(',').filter(Boolean) : [];
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const api = useMessagingClient();

  const onSend = async () => {
    setSending(true);
    setError(undefined);
    setOffline(false);
    const outbox = new InquiryOutbox();
    const idempotencyKey = uuid();
    const entry = { id: idempotencyKey, text, placeIds, queuedAt: Date.now() };

    try {
      const netState = await fetchNetInfo();
      await outbox.enqueue(entry);

      if (netState.isConnected) {
        const res = await api.createInquiry({
          headers: { 'idempotency-key': idempotencyKey },
          body: { text, placeIds: placeIds as [string, ...string[]], confirm: true },
        });
        if (res.status === 201) {
          await outbox.markSent(idempotencyKey);
        } else {
          throw new Error(`server error: ${res.status}`);
        }
      } else {
        setOffline(true);
      }
      setSent(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setSending(false);
    }
  };

  if (sent && !offline) {
    return (
      <Screen>
        <Banner kind="success" message={t('confirm.send')} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Text variant="title">{t('confirm.title')}</Text>
      {offline ? <Banner kind="info" message={t('confirm.offline')} /> : null}
      {error ? <Banner kind="error" message={error} /> : null}
      {placeIds.map((id) => (
        <ListItem
          key={id}
          title={id}
          trailing={
            <Badge
              label={channelLabel('in_app')}
              testID={messagingTestIDs.channelBadge(id)}
            />
          }
        />
      ))}
      <Button
        label={t('confirm.send')}
        onPress={onSend}
        loading={sending}
        testID={messagingTestIDs.confirmSend}
      />
    </Screen>
  );
}
