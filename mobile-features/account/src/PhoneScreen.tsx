import { testIDs } from '@iraq-maps/contracts';
import { getLocale } from '@iraq-maps/i18n';
import { href, useApi } from '@iraq-maps/mobile-kit';
import { Button, Screen, Text, TextField } from '@iraq-maps/ui';
import { Stack, useRouter } from 'expo-router';
import { useState, type ReactElement } from 'react';
import { normalizeIraqiPhone } from './phone';
import { expectStatus, useRequest } from './request';
import { t } from './strings';

export function PhoneScreen(): ReactElement {
  const api = useApi();
  const router = useRouter();
  const [input, setInput] = useState('');
  const { busy, error, setError, run } = useRequest();

  const submit = () => {
    const phone = normalizeIraqiPhone(input);
    if (!phone) return setError(t('phone.invalid'));
    return run(async () => {
      const { resendAfterSec } = expectStatus(await api.auth.requestOtp({ body: { phone, locale: getLocale() } }), 202);
      router.push({ pathname: href('authOtp'), params: { phone, resendAfterSec } });
    });
  };

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: t('phone.title') }} />
      <Text tone="muted">{t('phone.body')}</Text>
      <TextField
        testID={testIDs.auth.phoneInput}
        label={t('phone.label')}
        placeholder={t('phone.placeholder')}
        value={input}
        onChangeText={setInput}
        error={error}
        keyboardType="phone-pad"
        direction="ltr"
        autoFocus
      />
      <Button testID={testIDs.auth.phoneSubmit} label={t('phone.submit')} onPress={submit} disabled={!input.trim()} loading={busy} />
    </Screen>
  );
}
