import { useSession } from '@iraq-maps/mobile-kit';
import { Banner, Button, ListItem, Screen, Text } from '@iraq-maps/ui';
import { useState, type ReactElement } from 'react';
import { StyleSheet, View, Text as RNText } from 'react-native';
import { ScreenTitle } from './ScreenTitle';
import { t } from './strings';

/** Represents one linkable external identity provider. */
type Provider = {
  id: string;
  name: string;
  icon: string;
  /** Whether this stub provider is "linked" in the UI. */
  linked: boolean;
};

const PROVIDERS_INITIAL: Provider[] = [
  { id: 'google', name: 'Google', icon: '🟥', linked: false },
  { id: 'apple', name: 'Apple', icon: '🍎', linked: false },
  { id: 'facebook', name: 'Facebook', icon: '🟦', linked: false },
];

function ProviderRow({
  provider,
  onLink,
  onUnlink,
  busy,
}: {
  provider: Provider;
  onLink: () => void;
  onUnlink: () => void;
  busy: boolean;
}): ReactElement {
  return (
    <View style={styles.providerRow}>
      <View style={styles.providerInfo}>
        <RNText style={styles.providerIcon}>{provider.icon}</RNText>
        <View>
          <Text variant="subtitle">{provider.name}</Text>
          <Text tone="muted" variant="caption">
            {provider.linked ? t('linkedAccounts.linked') : t('linkedAccounts.notLinked')}
          </Text>
        </View>
      </View>
      <Button
        variant={provider.linked ? 'danger' : 'secondary'}
        label={provider.linked ? t('linkedAccounts.disconnect') : t('linkedAccounts.connect')}
        onPress={provider.linked ? onUnlink : onLink}
        disabled={busy}
      />
    </View>
  );
}

/**
 * LinkedAccountsScreen — shows phone number and stub social account connections.
 * Social linking is not yet implemented; providers show as stubs with a "coming soon" notice.
 */
export function LinkedAccountsScreen(): ReactElement {
  const { state } = useSession();
  const phone = state.status === 'signedIn' ? (state.user as { phone?: string }).phone ?? null : null;
  const [providers, setProviders] = useState<Provider[]>(PROVIDERS_INITIAL);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const link = (id: string) => {
    setBusy(true);
    // Stub: social linking not yet implemented
    setTimeout(() => {
      setProviders((prev) => prev.map((p) => (p.id === id ? { ...p, linked: true } : p)));
      setMessage(t('linkedAccounts.linkSuccess'));
      setBusy(false);
      setTimeout(() => setMessage(null), 3000);
    }, 600);
  };

  const unlink = (id: string) => {
    setBusy(true);
    setTimeout(() => {
      setProviders((prev) => prev.map((p) => (p.id === id ? { ...p, linked: false } : p)));
      setMessage(t('linkedAccounts.unlinkSuccess'));
      setBusy(false);
      setTimeout(() => setMessage(null), 3000);
    }, 600);
  };

  return (
    <Screen scroll>
      <ScreenTitle title={t('linkedAccounts.title')} />
      <Text tone="muted">{t('linkedAccounts.body')}</Text>

      {message ? <Banner kind="success" message={message} /> : null}

      {/* Phone number section */}
      <View style={styles.section}>
        <Text variant="subtitle" style={styles.sectionHeading}>{t('linkedAccounts.phone.heading')}</Text>
        <ListItem
          title={t('linkedAccounts.phone.label')}
          subtitle={phone ?? t('linkedAccounts.phone.none')}
          onPress={undefined}
        />
        <Text tone="muted" variant="caption">{t('linkedAccounts.phone.hint')}</Text>
      </View>

      {/* Social accounts section */}
      <View style={styles.section}>
        <Text variant="subtitle" style={styles.sectionHeading}>{t('linkedAccounts.social.heading')}</Text>
        <Banner kind="info" message={t('linkedAccounts.social.comingSoon')} />
        {providers.map((p) => (
          <ProviderRow
            key={p.id}
            provider={p}
            onLink={() => link(p.id)}
            onUnlink={() => unlink(p.id)}
            busy={busy}
          />
        ))}
      </View>

      {/* Security notice */}
      <View style={styles.notice}>
        <Text tone="muted" variant="caption">{t('linkedAccounts.securityNotice')}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  sectionHeading: { marginBottom: 4 },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#FAFAFA',
  },
  providerInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  providerIcon: { fontSize: 28 },
  notice: { paddingVertical: 8 },
});
