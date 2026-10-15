import { testIDs, type NotificationPrefs } from '@iraq-maps/contracts';
import { getLocale } from '@iraq-maps/i18n';
import { href, useApi, useSession } from '@iraq-maps/mobile-kit';
import { Banner, Button, EmptyState, ListItem, Screen, Sheet, Text } from '@iraq-maps/ui';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Animated, Platform, StyleSheet, Text as RNText, View } from 'react-native';
import { NotifPrefsSection } from './NotifPrefsSection';
import { expectStatus, useRequest } from './request';
import { t } from './strings';

const PRIMARY = '#1976D2';
import { useNotifApi } from './useNotifApi';

// ─── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonBlock({ width, height }: { width: number; height: number }): ReactElement {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 600, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return <Animated.View style={[{ width, height, backgroundColor: '#E0E0E0', borderRadius: 6 }, { opacity }]} accessibilityElementsHidden />;
}

function AccountSkeleton(): ReactElement {
  return (
    <Screen>
      <View testID="skeleton-account" style={{ alignItems: 'center', paddingVertical: 24, gap: 12 }}>
        <SkeletonBlock width={80} height={80} />
        <SkeletonBlock width={120} height={16} />
      </View>
      {[1, 2, 3, 4].map((k) => (
        <View key={k} style={{ paddingHorizontal: 16, paddingVertical: 14, gap: 6 }}>
          <SkeletonBlock width={100} height={13} />
          <SkeletonBlock width={160} height={11} />
        </View>
      ))}
    </Screen>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/** Derives up to 2 initials from a display name. */
function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

function AvatarCircle({ name }: { name: string | null | undefined }): ReactElement {
  return (
    <View style={styles.avatar} accessibilityRole="image" accessibilityLabel={name ?? ''}>
      <RNText style={styles.avatarText}>{initials(name)}</RNText>
    </View>
  );
}

export function AccountScreen(): ReactElement {
  const api = useApi();
  const session = useSession();
  const router = useRouter();
  const notifApi = useNotifApi();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs | null>(null);
  const { busy, error, run } = useRequest();
  const { state } = session;

  // Register device push token and load notification prefs on sign-in
  useEffect(() => {
    if (state.status !== 'signedIn') return;
    void (async () => {
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status === 'granted') {
          const tokenData = await Notifications.getExpoPushTokenAsync();
          const platform = Platform.OS === 'ios' ? 'ios' : 'android';
          await notifApi.registerDevice(tokenData.data, platform);
        }
      } catch {
        // gracefully skip if unavailable
      }
      try {
        const prefs = await notifApi.getPrefs();
        setNotifPrefs(prefs);
      } catch {
        // gracefully skip
      }
    })();
  }, [state.status, notifApi]);

  if (state.status === 'loading') return <AccountSkeleton />;

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  const languageItem = (
    <ListItem
      testID={testIDs.account.language}
      title={t('profile.language')}
      subtitle={t(`languages.${getLocale()}`)}
      onPress={() => router.push(href('accountLanguage'))}
    />
  );

  const settingsItem = (
    <ListItem
      title={t('settings.title')}
      onPress={() => router.push(href('accountSettings'))}
    />
  );

  if (state.status === 'signedOut') {
    return (
      <Screen>
        <EmptyState title={t('profile.signedOutTitle')} body={t('profile.signedOutBody')} />
        <Button testID={testIDs.account.signIn} label={t('profile.signIn')} onPress={() => router.push(href('authPhone'))} />
        {languageItem}
        {settingsItem}
        <View style={styles.versionRow}>
          <Text variant="caption">{t('profile.version', { version: appVersion })}</Text>
        </View>
      </Screen>
    );
  }

  const deleteAccount = () =>
    run(async () => {
      expectStatus(await api.me.remove(), 204);
      setConfirmingDelete(false);
      await session.signOut();
    });
  const banner = error ? <Banner kind="error" message={error} /> : null;

  return (
    <Screen scroll>
      {confirmingDelete ? null : banner}
      <View style={styles.profileHeader}>
        <AvatarCircle name={state.user.name} />
        <Text variant="subtitle">{state.user.name ?? t('profile.noName')}</Text>
      </View>
      <ListItem title={t('profile.name')} subtitle={state.user.name ?? t('profile.noName')} onPress={() => router.push(href('authName'))} />
      <ListItem title={t('savedPlaces.entry')} onPress={() => router.push(href('accountSavedPlaces'))} />
      <ListItem
        testID="account.myPosts"
        title={t('profile.myPosts')}
        onPress={() => router.push(`/discover/user/${state.user.id}` as never)}
      />
      <ListItem testID={testIDs.provider.entry} title={t('profile.registerBusiness')} onPress={() => router.push(href('providerRegister'))} />
      {languageItem}
      {settingsItem}
      {notifPrefs ? (
        <NotifPrefsSection
          prefs={notifPrefs}
          onToggle={async (key, value) => {
            const updated = await notifApi.updatePrefs({ [key]: value });
            setNotifPrefs(updated);
          }}
        />
      ) : null}
      <Button testID={testIDs.account.logout} variant="secondary" label={t('profile.logout')} onPress={() => run(() => session.signOut())} loading={busy} />
      <Button testID={testIDs.account.delete} variant="danger" label={t('profile.delete')} onPress={() => setConfirmingDelete(true)} disabled={busy} />
      <Sheet visible={confirmingDelete} onClose={() => setConfirmingDelete(false)}>
        <Text variant="subtitle">{t('deleteSheet.title')}</Text>
        <Text>{t('deleteSheet.body')}</Text>
        {banner}
        <Button testID={testIDs.account.deleteConfirm} variant="danger" label={t('deleteSheet.confirm')} onPress={deleteAccount} loading={busy} />
        <Button variant="secondary" label={t('deleteSheet.cancel')} onPress={() => setConfirmingDelete(false)} disabled={busy} />
      </Sheet>
      <View style={styles.versionRow}>
        <Text variant="caption">{t('profile.version', { version: appVersion })}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 12,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  versionRow: {
    alignItems: 'center',
    paddingVertical: 24,
  },
});
