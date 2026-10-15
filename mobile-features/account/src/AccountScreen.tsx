import { testIDs, type NotificationPrefs } from '@iraq-maps/contracts';
import { getLocale } from '@iraq-maps/i18n';
import { href, useApi, useApiBaseUrl, useSession } from '@iraq-maps/mobile-kit';
import { Banner, Button, EmptyState, ListItem, Screen, Sheet, Text, TextField } from '@iraq-maps/ui';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Animated, Image, Platform, Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { NotifPrefsSection } from './NotifPrefsSection';
import { expectStatus, useRequest } from './request';
import { t } from './strings';

const PRIMARY = '#1976D2';
const AVATAR_STORAGE_KEY = '@iraq-maps/account/avatar-uri';
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

function AvatarCircle({ name, uri }: { name: string | null | undefined; uri?: string | null }): ReactElement {
  return (
    <View style={styles.avatar} accessibilityRole="image" accessibilityLabel={name ?? ''}>
      {uri ? (
        <Image source={{ uri }} style={styles.avatarImage} />
      ) : (
        <RNText style={styles.avatarText}>{initials(name)}</RNText>
      )}
    </View>
  );
}

export function AccountScreen(): ReactElement {
  const api = useApi();
  const session = useSession();
  const router = useRouter();
  const notifApi = useNotifApi();
  const baseUrl = useApiBaseUrl();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const { busy, error, run } = useRequest();
  const { state } = session;

  // Load stored avatar URI
  useEffect(() => {
    AsyncStorage.getItem(AVATAR_STORAGE_KEY).then((v) => { if (v) setAvatarUri(v); }).catch(() => undefined);
  }, []);

  const handleChangePhoto = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0]!;
    setAvatarUri(asset.uri);
    AsyncStorage.setItem(AVATAR_STORAGE_KEY, asset.uri).catch(() => undefined);
    // Best-effort upload
    setAvatarUploading(true);
    try {
      const mime = (asset.mimeType === 'image/png' || asset.mimeType === 'image/webp')
        ? asset.mimeType as 'image/png' | 'image/webp'
        : 'image/jpeg';
      const size = asset.fileSize ?? 0;
      const ticketRes = await fetch(`${baseUrl}/v1/media/uploads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purpose: 'provider_photo', mime, size }),
      });
      if (ticketRes.ok) {
        const ticket = await ticketRes.json() as { assetId: string; uploadUrl: string; headers: Record<string, string> };
        const fileRes = await fetch(asset.uri);
        const blob = await fileRes.blob();
        await fetch(ticket.uploadUrl, { method: 'PUT', headers: ticket.headers, body: blob });
        await fetch(`${baseUrl}/v1/media/uploads/${encodeURIComponent(ticket.assetId)}/complete`, { method: 'POST' });
      }
    } catch {
      // Best-effort: local URI already set, ignore upload failure
    } finally {
      setAvatarUploading(false);
    }
  }, [baseUrl]);

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
      if (deleteInput !== 'DELETE') return;
      expectStatus(await api.me.remove(), 204);
      setConfirmingDelete(false);
      setDeleteInput('');
      await session.signOut();
    });
  const banner = error ? <Banner kind="error" message={error} /> : null;

  return (
    <Screen scroll>
      {confirmingDelete ? null : banner}
      <View style={styles.profileHeader}>
        <Pressable
          onPress={() => { void handleChangePhoto(); }}
          accessibilityRole="button"
          accessibilityLabel={t('profile.changePhoto')}
          disabled={avatarUploading}
        >
          <AvatarCircle name={state.user.name} uri={avatarUri} />
          <View style={styles.photoEditBadge}>
            <RNText style={styles.photoEditBadgeText}>{avatarUploading ? '…' : '📷'}</RNText>
          </View>
        </Pressable>
        <Text variant="subtitle">{state.user.name ?? t('profile.noName')}</Text>
      </View>
      <ListItem title={t('profile.name')} subtitle={state.user.name ?? t('profile.noName')} onPress={() => router.push(href('accountDisplayName'))} />
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
      <Sheet visible={confirmingDelete} onClose={() => { setConfirmingDelete(false); setDeleteInput(''); }}>
        <Text variant="subtitle">{t('deleteSheet.title')}</Text>
        <Text>{t('deleteSheet.body')}</Text>
        <Text tone="muted">{t('deleteConfirm.body')}</Text>
        <TextField
          label={t('deleteConfirm.label')}
          placeholder={t('deleteConfirm.placeholder')}
          value={deleteInput}
          onChangeText={setDeleteInput}
          error={deleteInput.length > 0 && deleteInput !== 'DELETE' ? t('deleteConfirm.mismatch') : undefined}
        />
        {banner}
        <Button testID={testIDs.account.deleteConfirm} variant="danger" label={t('deleteSheet.confirm')} onPress={deleteAccount} loading={busy} disabled={deleteInput !== 'DELETE'} />
        <Button variant="secondary" label={t('deleteSheet.cancel')} onPress={() => { setConfirmingDelete(false); setDeleteInput(''); }} disabled={busy} />
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
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  photoEditBadge: {
    position: 'absolute',
    bottom: 0,
    end: 0,
    backgroundColor: '#fff',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  photoEditBadgeText: {
    fontSize: 12,
  },
  versionRow: {
    alignItems: 'center',
    paddingVertical: 24,
  },
});
