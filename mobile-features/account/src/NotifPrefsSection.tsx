import type { NotificationPrefs } from '@iraq-maps/contracts';
import { ListItem, Text } from '@iraq-maps/ui';
import { type ReactElement } from 'react';
import { Switch } from 'react-native';
import { t } from './strings';

interface Props {
  prefs: NotificationPrefs;
  onToggle(key: keyof NotificationPrefs, value: boolean): Promise<void>;
}

export function NotifPrefsSection({ prefs, onToggle }: Props): ReactElement {
  const keys: Array<{ key: keyof NotificationPrefs; label: string }> = [
    { key: 'newInquiry', label: t('notifPrefs.newInquiry') },
    { key: 'replyReceived', label: t('notifPrefs.replyReceived') },
    { key: 'statusUpdate', label: t('notifPrefs.statusUpdate') },
  ];

  return (
    <>
      <Text variant="subtitle">{t('notifPrefs.title')}</Text>
      {keys.map(({ key, label }) => (
        <ListItem
          key={key}
          title={label}
          trailing={
            <Switch
              value={prefs[key]}
              onValueChange={(val) => { void onToggle(key, val); }}
              accessibilityLabel={label}
            />
          }
        />
      ))}
    </>
  );
}
