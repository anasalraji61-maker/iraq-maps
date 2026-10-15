import { type ConsentScope } from '@iraq-maps/contracts';
import { getLocale } from '@iraq-maps/i18n';
import { useApi } from '@iraq-maps/mobile-kit';
import { Banner, Screen, Text } from '@iraq-maps/ui';
import { useEffect, useState, type ReactElement } from 'react';
import { ActivityIndicator, StyleSheet, Switch, View, Text as RNText } from 'react-native';
import { t } from '../strings';

const SCOPES: ConsentScope[] = [
  'show_phone',
  'social_links',
  'photos',
  'whatsapp_messages',
  'show_prices',
];

/** Current consent text version — bump when wording changes. */
const CONSENT_TEXT_VERSION = '1.0.0';

function ConsentRow({
  scope,
  active,
  busy,
  onToggle,
}: {
  scope: ConsentScope;
  active: boolean;
  busy: boolean;
  onToggle: (scope: ConsentScope, granted: boolean) => void;
}): ReactElement {
  return (
    <View
      style={styles.row}
      accessibilityRole="none"
      testID={`consent-row-${scope}`}
    >
      <View style={styles.rowBody}>
        <RNText style={styles.rowLabel}>{t(`consents.${scope}`)}</RNText>
        {t(`consents.desc_${scope}`) ? (
          <RNText style={styles.rowDesc}>{t(`consents.desc_${scope}`)}</RNText>
        ) : null}
      </View>
      <Switch
        value={active}
        onValueChange={(v) => onToggle(scope, v)}
        disabled={busy}
        testID={`consent-toggle-${scope}`}
        accessibilityLabel={t(`consents.${scope}`)}
      />
    </View>
  );
}

/** Lets a verified provider toggle each consent scope (show_phone, social_links, photos, etc.). */
export function ProviderConsentScreen(): ReactElement {
  const api = useApi();
  const locale = getLocale();
  const [active, setActive] = useState<Set<ConsentScope>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ConsentScope | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.providers.consents()
      .then((res) => {
        if (res.status === 200) {
          setActive(new Set(res.body.active));
        } else {
          setError(t('errors.invalid_request'));
        }
      })
      .catch(() => setError(t('errors.invalid_request')))
      .finally(() => setLoading(false));
  }, [api]);

  const handleToggle = async (scope: ConsentScope, granted: boolean) => {
    setSaving(scope);
    setError(null);
    try {
      const res = await api.providers.setConsent({
        params: { scope },
        body: {
          granted,
          evidence: { textVersion: CONSENT_TEXT_VERSION, locale },
        },
      });
      if (res.status === 200) {
        setActive(new Set(res.body.active));
      } else {
        setError(t('errors.invalid_request'));
      }
    } catch {
      setError(t('errors.invalid_request'));
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <Screen>
        <Text variant="title">{t('consents.title')}</Text>
        <View style={styles.center} testID="consent-loading">
          <ActivityIndicator size="large" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Text variant="title">{t('consents.title')}</Text>
      <RNText style={styles.body}>{t('consents.body')}</RNText>
      {error ? <Banner kind="error" message={error} /> : null}
      <View style={styles.list} testID="consent-list">
        {SCOPES.map((scope) => (
          <ConsentRow
            key={scope}
            scope={scope}
            active={active.has(scope)}
            busy={saving === scope}
            onToggle={(s, v) => { void handleToggle(s, v); }}
          />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 14, color: '#555', marginBottom: 16, lineHeight: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  list: { gap: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
    gap: 12,
  },
  rowBody: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 15, color: '#212121', fontWeight: '500' },
  rowDesc: { fontSize: 12, color: '#757575', lineHeight: 16 },
});
