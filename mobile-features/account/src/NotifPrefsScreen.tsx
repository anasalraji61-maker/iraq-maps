/**
 * M73: Dedicated notification preferences screen.
 * Accessible from Settings → Notification Preferences.
 */
import type { NotificationPrefs } from '@iraq-maps/contracts';
import { Screen } from '@iraq-maps/ui';
import { useEffect, useState, type ReactElement } from 'react';
import { NotifPrefsSection } from './NotifPrefsSection';
import { ScreenTitle } from './ScreenTitle';
import { t } from './strings';
import { useNotifApi } from './useNotifApi';

export function NotifPrefsScreen(): ReactElement {
  const notifApi = useNotifApi();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);

  useEffect(() => {
    void notifApi.getPrefs().then(setPrefs).catch(() => undefined);
  }, [notifApi]);

  const handleToggle = async (key: keyof NotificationPrefs, value: boolean): Promise<void> => {
    if (!prefs) return;
    const optimistic = { ...prefs, [key]: value };
    setPrefs(optimistic);
    try {
      const updated = await notifApi.updatePrefs({ [key]: value });
      setPrefs(updated);
    } catch {
      setPrefs(prefs); // revert
    }
  };

  return (
    <Screen scroll testID="notif-prefs-screen">
      <ScreenTitle title={t('notifPrefs.title')} />
      {prefs ? (
        <NotifPrefsSection prefs={prefs} onToggle={handleToggle} />
      ) : null}
    </Screen>
  );
}
