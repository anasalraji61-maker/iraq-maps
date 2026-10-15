import {
  messagingTestIDs,
  type DeliveryTarget,
  type Inquiry,
  type InquiryId,
  type MessageStatus,
} from '@iraq-maps/contracts';
import { Badge, Banner, Button, Card, ListItem, Text } from '@iraq-maps/ui';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useCallback, type ReactElement } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View, Text as RNText } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMessagingClient } from '../client';
import { useMarkRead } from '../hooks/useReadReceipts';
import { t } from '../strings';

// URL detection regex (simple, covers http/https)
const URL_REGEX = /https?:\/\/[^\s]+/g;

/** Returns checkmark indicator for message status */
function statusIcon(status: MessageStatus): string {
  switch (status) {
    case 'read':
      return '✓✓';
    case 'delivered':
      return '✓✓';
    case 'sent':
      return '✓';
    default:
      return '';
  }
}

const STATUS_COLORS: Partial<Record<MessageStatus, string>> = {
  read: '#1976D2',
  delivered: '#757575',
  sent: '#757575',
  replied: '#2E7D32',
  failed: '#C62828',
};

function StatusIndicator({ status }: { status: MessageStatus }): ReactElement | null {
  const icon = statusIcon(status);
  const color = STATUS_COLORS[status];
  if (!icon) return null;
  return (
    <View style={{ marginStart: 4 }}>
      <RNText style={{ fontSize: 11, color: color ?? '#757575' }}>
        {icon}
      </RNText>
    </View>
  );
}

/** Format ISO datetime to Arabic time string like "٣:٤٥ م" */
function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch {
    return '';
  }
}

/** Simple URL preview card — just a tappable link, no remote fetch */
function UrlPreview({ url }: { url: string }): ReactElement {
  const openUrl = () => { void Linking.openURL(url); };
  return (
    <TouchableOpacity
      onPress={openUrl}
      accessibilityRole="link"
      accessibilityLabel={t('detail.urlPreview')}
    >
      <View
        style={{
          borderWidth: 1,
          borderColor: '#E0E0E0',
          borderRadius: 8,
          padding: 8,
          marginTop: 4,
          backgroundColor: '#F8F8F8',
        }}
      >
        <Text variant="caption" tone="default">
          {url.length > 60 ? `${url.slice(0, 60)}…` : url}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

/** Renders inquiry message text with optional URL previews below */
function MessageText({ text }: { text: string }): ReactElement {
  const urls = text.match(URL_REGEX) ?? [];
  return (
    <View>
      <Text>{text}</Text>
      {urls.map((url) => (
        <UrlPreview key={url} url={url} />
      ))}
    </View>
  );
}

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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text tone="muted" variant="caption">{t(`detail.status.${target.status}`)}</Text>
        <StatusIndicator status={target.status} />
      </View>
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

/** WhatsApp button — only rendered when a whatsapp channel target exists (consent already
 *  encoded in the server's channel selection: if the channel is 'whatsapp' the provider
 *  consented to whatsapp_messages). */
function WhatsAppButton({ targets }: { targets: DeliveryTarget[] }): ReactElement | null {
  const waTarget = targets.find((t) => t.channel === 'whatsapp' && t.handoffLink?.type === 'wa_me');
  if (!waTarget?.handoffLink) return null;
  const url = waTarget.handoffLink.url;
  return (
    <Button
      label={t('detail.whatsapp')}
      variant="secondary"
      onPress={() => { void Linking.openURL(url); }}
      testID={messagingTestIDs.channelBadge('whatsapp')}
    />
  );
}

export function InquiryDetailScreen(): ReactElement {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const api = useMessagingClient();
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [refreshing, setRefreshing] = useState(false);
  const [seenAt, setSeenAt] = useState<string | null>(null);

  const markRead = useMarkRead(requestId);

  const loadInquiry = useCallback(async (isRefresh = false) => {
    if (!requestId) return;
    if (isRefresh) setRefreshing(true);
    try {
      const res = await api.getInquiry({ params: { id: requestId as InquiryId } });
      if (res.status === 200) setInquiry(res.body);
    } catch {
      setError(t('detail.loadError'));
    } finally {
      setRefreshing(false);
    }
  }, [api, requestId]);

  useEffect(() => { void loadInquiry(); }, [loadInquiry]);

  // Mark as read when screen opens
  useEffect(() => {
    void markRead().then((ts) => { if (ts) setSeenAt(ts); });
  }, [markRead]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        testID="inquiry-detail-scroll"
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl testID="inquiry-detail-refresh" refreshing={refreshing} onRefresh={() => { void loadInquiry(true); }} colors={['#1976D2']} />}
      >
        <Text variant="title">{t('detail.title')}</Text>
        {error ? <Banner kind="error" message={error} /> : null}
        {inquiry ? (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <MessageText text={inquiry.text} />
              </View>
              <View style={{ marginStart: 8, alignItems: 'flex-end' }}>
                <Text tone="muted" variant="caption">
                  {formatTime(inquiry.createdAt)}
                </Text>
                {seenAt ? (
                  <RNText
                    testID="seen-at-label"
                    style={{ color: '#1976D2', marginTop: 2, fontSize: 11 }}
                  >
                    {t('detail.seenAt', { time: formatTime(seenAt) })}
                  </RNText>
                ) : null}
              </View>
            </View>
            {inquiry.targets.map((target) => (
              <TargetRow key={target.placeId} target={target} />
            ))}
            <WhatsAppButton targets={inquiry.targets} />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFF' },
  content: { padding: 16 },
});
