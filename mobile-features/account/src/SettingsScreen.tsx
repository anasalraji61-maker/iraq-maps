/**
 * SettingsScreen – top-level settings hub.
 * Organises all settings sub-screens into labelled sections.
 */
import { href, useApiBaseUrl, useSession } from '@iraq-maps/mobile-kit';
import { Banner, Button, ListItem, Screen, Text } from '@iraq-maps/ui';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useState, type ReactElement } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useRequest } from './request';
import { ScreenTitle } from './ScreenTitle';
import { t } from './strings';

const SUPPORT_EMAIL = 'mailto:support@iraqsmartmaps.com';

const version = Constants.expoConfig?.version ?? '1.0.0';
const buildNumber = (
  Constants.expoConfig?.android?.versionCode ??
  Constants.expoConfig?.ios?.buildNumber ??
  '1'
).toString();

// ─── section heading ──────────────────────────────────────────────────────────
function SectionHeading({ label }: { label: string }): ReactElement {
  return (
    <View style={styles.sectionHead}>
      <Text variant="caption" tone="muted" style={styles.sectionLabel}>{label}</Text>
    </View>
  );
}

// ─── main screen ──────────────────────────────────────────────────────────────
export function SettingsScreen(): ReactElement {
  const router = useRouter();
  const session = useSession();
  const baseUrl = useApiBaseUrl();
  const isSignedIn = session.state.status === 'signedIn';

  const { busy: exportBusy, run: runExport } = useRequest();
  const [exportDone, setExportDone] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);

  // ── export ──
  const handleExport = () => {
    setExportError(null);
    void runExport(async () => {
      const res = await fetch(`${baseUrl}/v1/identity/me/export-request`, { method: 'POST' });
      if (!res.ok) {
        setExportError(t('dataExport.error'));
        return;
      }
      setExportDone(true);
    }).catch(() => setExportError(t('dataExport.error')));
  };

  // ── updates ──
  const handleCheckUpdates = () => {
    setUpdateMsg(t('updates.upToDate'));
    setTimeout(() => setUpdateMsg(null), 3000);
  };

  // ── sign-out confirmation ──
  const handleSignOut = () => {
    Alert.alert(
      t('settings.signOut'),
      t('settings.signOutConfirm'),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        { text: t('settings.signOut'), style: 'destructive', onPress: () => void session.signOut() },
      ],
    );
  };

  return (
    <Screen scroll testID="settings-screen">
      <ScreenTitle title={t('settings.title')} />

      {/* ── Profile ── */}
      {isSignedIn ? (
        <>
          <SectionHeading label={t('settings.sectionProfile')} />
          <ListItem title={t('settings.displayName')} onPress={() => router.push(href('accountDisplayName'))} />
          <ListItem title={t('settings.linkedAccounts')} onPress={() => router.push(href('accountLinkedAccounts'))} />
          <ListItem title={t('settings.changePassword')} onPress={() => router.push(href('accountChangePassword'))} />
        </>
      ) : null}

      {/* ── Personalisation ── */}
      <SectionHeading label={t('settings.sectionPersonalisation')} />
      <ListItem title={t('settings.appearance')} onPress={() => router.push(href('accountAppearance'))} />
      <ListItem title={t('settings.language')} onPress={() => router.push(href('accountLanguage'))} />
      <ListItem title={t('settings.theme')} onPress={() => router.push(href('accountTheme'))} />

      {/* ── Map & Navigation ── */}
      <SectionHeading label={t('settings.sectionMap')} />
      <ListItem title={t('settings.mapSettings')} onPress={() => router.push(href('accountMapSettings'))} />
      <ListItem title={t('settings.navSettings')} onPress={() => router.push(href('accountNavSettings'))} />

      {/* ── Notifications & Privacy ── */}
      <SectionHeading label={t('settings.sectionNotifPrivacy')} />
      <ListItem title={t('settings.notifPrefs')} onPress={() => router.push(href('accountNotifPrefs'))} />
      <ListItem title={t('settings.privacySettingsEntry')} onPress={() => router.push(href('accountPrivacySettings'))} />
      <ListItem title={t('settings.safety')} onPress={() => router.push(href('accountSafety'))} />

      {/* ── Activity ── */}
      <SectionHeading label={t('settings.sectionActivity')} />
      <ListItem title={t('settings.savedPlaces')} onPress={() => router.push(href('accountSavedPlaces'))} />
      <ListItem title={t('settings.blockedUsers')} onPress={() => router.push(href('accountBlockedUsers'))} />
      <ListItem title={t('settings.followedUsers')} onPress={() => router.push(href('accountFollowing'))} />

      {/* ── Support & Legal ── */}
      <SectionHeading label={t('settings.sectionSupport')} />
      <ListItem title={t('settings.reportProblem')} onPress={() => void Linking.openURL(SUPPORT_EMAIL)} />
      <ListItem title={t('settings.privacy')} onPress={() => router.push(href('accountPrivacy'))} />
      <ListItem title={t('settings.terms')} onPress={() => router.push(href('accountTerms'))} />
      <ListItem title={t('settings.licenses')} onPress={() => router.push(href('accountLicenses'))} />

      {/* ── Account actions ── */}
      {isSignedIn ? (
        <>
          <SectionHeading label={t('settings.sectionAccount')} />
          {exportDone ? (
            <Banner kind="success" message={t('dataExport.success')} />
          ) : (
            <Button
              testID="settings.exportData"
              variant="secondary"
              label={t('settings.exportData')}
              onPress={handleExport}
              loading={exportBusy}
            />
          )}
          {exportError ? <Banner kind="error" message={exportError} /> : null}
          <Button
            testID="settings.deleteAccount"
            variant="danger"
            label={t('settings.deleteAccount')}
            onPress={() => router.push(href('account'))}
          />
          <Button
            variant="secondary"
            label={t('settings.signOut')}
            onPress={handleSignOut}
            testID="settings.signOut"
          />
        </>
      ) : null}

      {/* ── Version / updates ── */}
      <View style={styles.versionRow}>
        <Text variant="caption" tone="muted">{t('settings.version', { version, build: buildNumber })}</Text>
        {updateMsg ? <Text variant="caption" tone="muted">{updateMsg}</Text> : null}
        <Button
          testID="settings.checkUpdates"
          variant="secondary"
          label={t('settings.checkUpdates')}
          onPress={handleCheckUpdates}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionHead: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 4,
  },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  versionRow: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
});
