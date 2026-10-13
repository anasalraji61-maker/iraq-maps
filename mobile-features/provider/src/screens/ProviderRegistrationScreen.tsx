import { testIDs, type PlaceCategory } from '@iraq-maps/contracts';
import { toAsciiDigits } from '@iraq-maps/i18n';
import { useApi, useApiBaseUrl, uploadAsset } from '@iraq-maps/mobile-kit';
import { Banner, Button, ListItem, Screen, Text, TextField } from '@iraq-maps/ui';
import { useRouter } from 'expo-router';
import { useState, type ReactElement } from 'react';
import { normalizeIraqiPhone } from '../phone';
import { expectStatus, useRequest } from '../request';
import { t } from '../strings';

const TOTAL_STEPS = 4;

const CATEGORIES: PlaceCategory[] = [
  'food', 'cafe', 'lodging', 'shopping', 'tourism', 'health',
  'finance', 'fuel', 'office', 'worship', 'education', 'government', 'transport', 'entertainment',
];

type ConsentScope = 'photos' | 'social_links' | 'whatsapp_messages' | 'show_phone' | 'show_prices';
const CONSENT_SCOPES: ConsentScope[] = ['photos', 'social_links', 'whatsapp_messages', 'show_phone', 'show_prices'];

interface State {
  name: string;
  phone: string;
  category: PlaceCategory | null;
  photoUris: string[];
  consents: Set<ConsentScope>;
}

/** 4-step registration wizard: name+phone → category → photos → consents → submit */
export function ProviderRegistrationScreen(): ReactElement {
  const api = useApi();
  const apiBaseUrl = useApiBaseUrl();
  const router = useRouter();
  const { busy, error, setError, run } = useRequest();

  const [step, setStep] = useState(1);
  const [state, setState] = useState<State>({
    name: '',
    phone: '',
    category: null,
    photoUris: [],
    consents: new Set(),
  });

  const updateState = (patch: Partial<State>) => setState((s) => ({ ...s, ...patch }));

  const goNext = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  const goBack = () => setStep((s) => Math.max(s - 1, 1));

  const validateStep1 = (): boolean => {
    if (!state.name.trim()) { setError(t('name.label')); return false; }
    const phone = normalizeIraqiPhone(state.phone);
    if (!phone) { setError(t('name.phone')); return false; }
    return true;
  };

  const handleNext = () => {
    if (step === 1 && !validateStep1()) return;
    goNext();
  };

  // pickPhoto is a stub; the real implementation will use expo-image-picker.
  // uploadAsset handles the upload through the API once a URI is available.
  const pickPhoto = async () => {
    // no-op in this milestone; expo-image-picker wiring is a future step.
    void uploadAsset; // referenced so tree-shaker keeps the import
  };

  const toggleConsent = (scope: ConsentScope) => {
    const next = new Set(state.consents);
    if (next.has(scope)) next.delete(scope); else next.add(scope);
    updateState({ consents: next });
  };

  const submit = () =>
    run(async () => {
      const phone = normalizeIraqiPhone(state.phone)!;
      // Step 1: create the provider record.
      const provider = expectStatus(
        await api.providers.create({ body: { name: state.name.trim(), category: state.category! } }),
        201,
      );
      // Step 2: upload photos and attach them.
      const assetIds = await Promise.all(
        state.photoUris.map((uri) => uploadAsset(api, apiBaseUrl, { uri, purpose: 'provider_photo' })),
      );
      if (assetIds.length > 0) {
        await api.providers.update({ body: { photoAssetIds: assetIds } });
      }
      // Step 3: set consents.
      for (const scope of state.consents) {
        await api.providers.setConsent({
          params: { scope },
          body: { granted: true, evidence: { textVersion: 'v1', locale: 'ar' } },
        });
      }
      // Step 4: start phone verification.
      const { verificationId } = expectStatus(
        await api.providers.phoneStart({ body: { phone, locale: 'ar' } }),
        202,
      );
      router.push({ pathname: '/provider/verify-phone', params: { phone, verificationId } } as never);
      void provider;
    });

  const stepTitle = t('registration.step', { current: step, total: TOTAL_STEPS });
  const banner = error ? <Banner kind="error" message={error} /> : null;

  return (
    <Screen scroll>
      <Text variant="title">{t('registration.title')}</Text>
      <Text tone="muted">{stepTitle}</Text>
      {banner}

      {step === 1 && (
        <>
          <TextField
            testID={testIDs.provider.nameInput}
            label={t('name.label')}
            placeholder={t('name.placeholder')}
            value={state.name}
            onChangeText={(v) => updateState({ name: v })}
          />
          <TextField
            testID={testIDs.provider.phoneInput}
            label={t('name.phone')}
            placeholder={t('name.phonePlaceholder')}
            value={state.phone}
            onChangeText={(v) => updateState({ phone: toAsciiDigits(v) })}
            keyboardType="phone-pad"
            direction="ltr"
            textContentType="telephoneNumber"
          />
        </>
      )}

      {step === 2 && (
        <>
          <Text variant="subtitle">{t('category.title')}</Text>
          {CATEGORIES.map((cat) => (
            <ListItem
              key={cat}
              testID={state.category === cat ? testIDs.provider.category : undefined}
              title={t(`category.${cat}`)}
              onPress={() => updateState({ category: cat })}
              subtitle={state.category === cat ? t('common.selected') : undefined}
            />
          ))}
        </>
      )}

      {step === 3 && (
        <>
          <Text variant="subtitle">{t('photos.title')}</Text>
          <Text tone="muted">{t('photos.body')}</Text>
          <Button
            testID={testIDs.provider.photosAdd}
            variant="secondary"
            label={t('photos.add')}
            onPress={pickPhoto}
            disabled={busy}
          />
        </>
      )}

      {step === 4 && (
        <>
          <Text variant="subtitle">{t('consents.title')}</Text>
          <Text tone="muted">{t('consents.body')}</Text>
          {CONSENT_SCOPES.map((scope) => (
            <ListItem
              key={scope}
              testID={testIDs.provider.consent[scope]}
              title={t(`consents.${scope}`)}
              onPress={() => toggleConsent(scope)}
              subtitle={state.consents.has(scope) ? t('common.selected') : undefined}
            />
          ))}
        </>
      )}

      {step > 1 && (
        <Button variant="secondary" label={t('registration.back')} onPress={goBack} disabled={busy} />
      )}
      {step < TOTAL_STEPS ? (
        <Button
          testID={testIDs.provider.save}
          label={t('registration.next')}
          onPress={handleNext}
          disabled={step === 2 && !state.category}
        />
      ) : (
        <Button
          testID={testIDs.provider.submit}
          label={t('registration.submit')}
          onPress={submit}
          loading={busy}
          disabled={!state.category}
        />
      )}
    </Screen>
  );
}
