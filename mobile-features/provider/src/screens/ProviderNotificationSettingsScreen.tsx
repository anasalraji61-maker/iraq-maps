/**
 * ProviderNotificationSettingsScreen — toggles which push notifications a provider receives.
 *
 * Settings are persisted to AsyncStorage (provider-local) because there is no
 * dedicated notifications-preferences endpoint yet. The screen is wired for a
 * future PATCH call when the backend contract is ready.
 */
import { Button, Screen, Text } from '@iraq-maps/ui';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, type ReactElement } from 'react';
import { StyleSheet, Switch, Text as RNText, View } from 'react-native';
import { t } from '../strings';

const STORAGE_KEY = 'provider_notification_prefs_v1';

interface NotifPrefs {
  newInquiry: boolean;
  inquiryUpdate: boolean;
  verificationUpdate: boolean;
  marketingTips: boolean;
}

const DEFAULTS: NotifPrefs = {
  newInquiry: true,
  inquiryUpdate: true,
  verificationUpdate: true,
  marketingTips: false,
};

type PrefKey = keyof NotifPrefs;

interface Row {
  key: PrefKey;
  labelKey: 'notifications.newInquiry' | 'notifications.inquiryUpdate' | 'notifications.verificationUpdate' | 'notifications.marketingTips';
  descKey: 'notifications.newInquiryDesc' | 'notifications.inquiryUpdateDesc' | 'notifications.verificationUpdateDesc' | 'notifications.marketingTipsDesc';
}

const ROWS: Row[] = [
  { key: 'newInquiry', labelKey: 'notifications.newInquiry', descKey: 'notifications.newInquiryDesc' },
  { key: 'inquiryUpdate', labelKey: 'notifications.inquiryUpdate', descKey: 'notifications.inquiryUpdateDesc' },
  { key: 'verificationUpdate', labelKey: 'notifications.verificationUpdate', descKey: 'notifications.verificationUpdateDesc' },
  { key: 'marketingTips', labelKey: 'notifications.marketingTips', descKey: 'notifications.marketingTipsDesc' },
];

export function ProviderNotificationSettingsScreen(): ReactElement {
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULTS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          try {
            setPrefs({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<NotifPrefs>) });
          } catch {
            // ignore
          }
        }
      })
      .catch(() => undefined);
  }, []);

  function toggle(key: PrefKey) {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
    setSaved(false);
  }

  async function handleSave() {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // non-critical; silently ignore
    }
  }

  return (
    <Screen>
      <View style={styles.container}>
        <Text variant="title">{t('notifications.title')}</Text>

        {ROWS.map(({ key, labelKey, descKey }) => (
          <View key={key} style={styles.row} testID={`notif-row-${key}`}>
            <View style={styles.rowText}>
              <RNText style={styles.rowLabel}>{t(labelKey)}</RNText>
              <RNText style={styles.rowDesc}>{t(descKey)}</RNText>
            </View>
            <Switch
              value={prefs[key]}
              onValueChange={() => toggle(key)}
              thumbColor={prefs[key] ? '#1976D2' : '#CCC'}
              trackColor={{ true: '#BBDEFB', false: '#EEE' }}
              testID={`notif-switch-${key}`}
            />
          </View>
        ))}

        {saved ? <RNText style={styles.saved}>{t('notifications.saved')}</RNText> : null}

        <Button
          label={t('notifications.save')}
          onPress={() => { void handleSave(); }}
          testID="notif-save-btn"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FAFAFA',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EEE',
  },
  rowText: { flex: 1, gap: 2, paddingInlineEnd: 12 },
  rowLabel: { fontSize: 15, fontWeight: '600', color: '#222', textAlign: 'auto' },
  rowDesc: { fontSize: 12, color: '#888', textAlign: 'auto' },
  saved: { color: '#2E7D32', fontSize: 13, fontWeight: '600', textAlign: 'auto' },
});
