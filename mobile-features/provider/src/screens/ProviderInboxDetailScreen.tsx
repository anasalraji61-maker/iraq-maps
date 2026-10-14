import { messagingTestIDs, type InquiryId } from '@iraq-maps/contracts';
import { Banner, Button, Screen, Text } from '@iraq-maps/ui';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useMessagingApi } from '../messaging-api';
import { useRequest } from '../request';
import { t } from '../strings';

/** Provider inbox detail: full inquiry, reply thread, reply input and opt-out. */
export function ProviderInboxDetailScreen(): ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useMessagingApi();
  const [replyText, setReplyText] = useState('');
  const [sentReply, setSentReply] = useState('');
  const [inquiryText, setInquiryText] = useState('');
  const [loading, setLoading] = useState(true);
  const { busy, error, run } = useRequest();

  const load = useCallback(async () => {
    try {
      const res = await api.getInquiry({ params: { id: id as InquiryId } });
      if (res.status === 200) {
        setInquiryText(res.body.text);
      }
    } finally {
      setLoading(false);
    }
  }, [api, id]);

  useEffect(() => { void load(); }, [load]);

  const sendReply = () =>
    run(async () => {
      if (!replyText.trim()) return;
      await api.replyToInquiry({ params: { id: id as InquiryId }, body: { text: replyText.trim() } });
      setSentReply(replyText.trim());
      setReplyText('');
    });

  const handleOptOut = () => {
    Alert.alert(
      t('inbox.optOut'),
      t('inbox.optOutConfirm'),
      [
        {
          text: t('inbox.optOut'),
          style: 'destructive',
          onPress: () => run(() => api.optOut({ body: {} }).then(() => undefined)),
        },
        { text: t('inbox.cancel'), style: 'cancel' },
      ],
    );
  };

  if (loading) return <Screen>{null}</Screen>;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container}>
        <Text variant="title">{t('inbox.title')}</Text>
        {error ? <Banner kind="error" message={error} /> : null}

        <View style={styles.bubble}>
          <Text>{inquiryText}</Text>
        </View>

        {sentReply ? (
          <View style={styles.replyBubble}>
            <Text>{sentReply}</Text>
          </View>
        ) : null}

        <TextInput
          testID={messagingTestIDs.replyInput}
          style={styles.input}
          placeholder={t('inbox.reply')}
          value={replyText}
          onChangeText={setReplyText}
          multiline
          accessibilityLabel={t('inbox.reply')}
        />

        <Button testID="provider.inbox.reply.send" label={t('inbox.reply')} onPress={sendReply} loading={busy} disabled={!replyText.trim()} />

        <Button
          testID={messagingTestIDs.optOutButton}
          variant="secondary"
          label={t('inbox.optOut')}
          onPress={handleOptOut}
          disabled={busy}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  bubble: { backgroundColor: '#F3F4F6', borderRadius: 12, padding: 12 },
  replyBubble: { backgroundColor: '#DBEAFE', borderRadius: 12, padding: 12, alignSelf: 'flex-end', maxWidth: '80%' },
  input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, padding: 12, minHeight: 80, textAlignVertical: 'top' },
});
