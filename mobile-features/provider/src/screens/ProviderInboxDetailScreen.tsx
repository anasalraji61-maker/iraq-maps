import { messagingTestIDs, type InquiryId } from '@iraq-maps/contracts';
import { Banner, Button, Screen, Text } from '@iraq-maps/ui';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Alert, I18nManager, Pressable, RefreshControl, ScrollView, StyleSheet, Text as RNText, TextInput, View } from 'react-native';

I18nManager.forceRTL(true);
import { useMessagingApi } from '../messaging-api';
import { useRequest } from '../request';
import { t } from '../strings';
import { SkeletonBlock } from '../skeleton';

const MAX_REPLY_LENGTH = 1000;

/** Keys and labels for the built-in quick reply templates. */
const QUICK_REPLY_KEYS = ['welcome', 'hours', 'closed', 'available', 'notAvailable', 'callUs'] as const;
type QuickReplyKey = typeof QUICK_REPLY_KEYS[number];

/** Provider inbox detail: full inquiry, reply thread, reply input and opt-out. */
export function ProviderInboxDetailScreen(): ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useMessagingApi();
  const [replyText, setReplyText] = useState('');
  const [sentReply, setSentReply] = useState('');
  const [inquiryText, setInquiryText] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { busy, error, run } = useRequest();

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await api.getInquiry({ params: { id: id as InquiryId } });
      if (res.status === 200) {
        setInquiryText(res.body.text);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
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

  if (loading) {
    return (
      <Screen>
        <View style={styles.container}>
          <View testID="skeleton-inbox-detail" style={{ gap: 12 }}>
            <SkeletonBlock width={160} height={20} />
            <View style={[styles.bubble, { gap: 8 }]}>
              <SkeletonBlock width={280} height={13} />
              <SkeletonBlock width={220} height={13} />
              <SkeletonBlock width={160} height={13} />
            </View>
            <SkeletonBlock width={180} height={40} />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        testID="provider-inbox-detail-scroll"
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void load(true); }} colors={['#1976D2']} />}
      >
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

        {/* Quick reply template chips */}
        <View>
          <RNText style={styles.quickReplyLabel}>{t('quickReply.sectionLabel')}</RNText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {QUICK_REPLY_KEYS.map((key: QuickReplyKey) => (
              <Pressable
                key={key}
                testID={`provider.quickReply.${key}`}
                style={styles.chip}
                onPress={() => setReplyText(t(`quickReply.${key}`))}
                accessibilityRole="button"
                accessibilityLabel={t(`quickReply.${key}`)}
              >
                <RNText style={styles.chipText} numberOfLines={1}>{t(`quickReply.${key}`)}</RNText>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <TextInput
          testID={messagingTestIDs.replyInput}
          style={[styles.input, replyText.length > MAX_REPLY_LENGTH && styles.inputOver]}
          placeholder={t('inbox.reply')}
          value={replyText}
          onChangeText={setReplyText}
          multiline
          maxLength={MAX_REPLY_LENGTH + 50}
          accessibilityLabel={t('inbox.reply')}
        />
        {replyText.length > 0 ? (
          <RNText style={[styles.charCount, replyText.length > MAX_REPLY_LENGTH && styles.charCountOver]}>
            {t('inbox.replyCharsRemaining', { n: MAX_REPLY_LENGTH - replyText.length })}
          </RNText>
        ) : null}

        <Button testID="provider.inbox.reply.send" label={t('inbox.reply')} onPress={sendReply} loading={busy} disabled={!replyText.trim() || replyText.length > MAX_REPLY_LENGTH} />

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
  inputOver: { borderColor: '#DC2626' },
  charCount: { fontSize: 11, color: '#6B7280' },
  charCountOver: { color: '#DC2626', fontWeight: '600' },
  quickReplyLabel: { fontSize: 12, color: '#6B7280', marginBottom: 6 },
  chipRow: { gap: 8, paddingVertical: 4 },
  chip: { backgroundColor: '#EFF6FF', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#BFDBFE', maxWidth: 200 },
  chipText: { fontSize: 12, color: '#1D4ED8' },
});
