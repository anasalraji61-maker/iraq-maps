import { Banner, Screen, Text } from '@iraq-maps/ui';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, type ReactElement } from 'react';
import { Switch, View, StyleSheet } from 'react-native';
import { ScreenTitle } from './ScreenTitle';
import { t } from './strings';

const STORAGE_KEY = '@iraq-maps/account/privacy-settings';

interface PrivacySettings {
  publicProfile: boolean;
  showFollowerCount: boolean;
  allowMentions: boolean;
  allowDirectMessages: boolean;
}

const DEFAULTS: PrivacySettings = {
  publicProfile: true,
  showFollowerCount: true,
  allowMentions: true,
  allowDirectMessages: true,
};

async function load(): Promise<PrivacySettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<PrivacySettings>) };
  } catch {
    return DEFAULTS;
  }
}

async function save(settings: PrivacySettings): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable — ignore
  }
}

interface ToggleRowProps {
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}

function ToggleRow({ title, subtitle, value, onValueChange }: ToggleRowProps): ReactElement {
  return (
    <View style={styles.row} accessibilityRole="switch" accessibilityLabel={title} accessibilityState={{ checked: value }}>
      <View style={styles.rowText}>
        <Text variant="body">{title}</Text>
        <Text tone="muted" variant="caption">{subtitle}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

/** Toggles for local privacy preferences (publicProfile, allowMentions, allowDirectMessages, showFollowerCount). */
export function PrivacySettingsScreen(): ReactElement {
  const [settings, setSettings] = useState<PrivacySettings>(DEFAULTS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void load().then(setSettings);
  }, []);

  const update = (key: keyof PrivacySettings, value: boolean) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    void save(next).then(() => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  return (
    <Screen scroll>
      <ScreenTitle title={t('privacySettings.title')} />
      {saved ? <Banner kind="success" message={t('privacySettings.saved')} /> : null}
      <ToggleRow
        title={t('privacySettings.publicProfile')}
        subtitle={t('privacySettings.publicProfileSub')}
        value={settings.publicProfile}
        onValueChange={(v) => update('publicProfile', v)}
      />
      <ToggleRow
        title={t('privacySettings.showFollowerCount')}
        subtitle={t('privacySettings.showFollowerCountSub')}
        value={settings.showFollowerCount}
        onValueChange={(v) => update('showFollowerCount', v)}
      />
      <ToggleRow
        title={t('privacySettings.allowMentions')}
        subtitle={t('privacySettings.allowMentionsSub')}
        value={settings.allowMentions}
        onValueChange={(v) => update('allowMentions', v)}
      />
      <ToggleRow
        title={t('privacySettings.allowDirectMessages')}
        subtitle={t('privacySettings.allowDirectMessagesSub')}
        value={settings.allowDirectMessages}
        onValueChange={(v) => update('allowDirectMessages', v)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
});
