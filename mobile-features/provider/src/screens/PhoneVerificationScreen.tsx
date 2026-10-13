import { testIDs } from '@iraq-maps/contracts';
import { formatNumber, getLocale, toAsciiDigits } from '@iraq-maps/i18n';
import { useApi } from '@iraq-maps/mobile-kit';
import { Banner, Button, Screen, Text, TextField } from '@iraq-maps/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, type ReactElement } from 'react';
import { isolateLtr } from '../phone';
import { expectStatus, useRequest } from '../request';
import { t } from '../strings';

/** Whole seconds until `deadline` (epoch ms). */
function useSecondsLeft(deadline: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline]);
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/** m:ss in the current locale's digits. */
const clock = (seconds: number): string =>
  `${formatNumber(Math.floor(seconds / 60))}:${formatNumber(seconds % 60, { minimumIntegerDigits: 2 })}`;

/** Route params set by ProviderRegistrationScreen. */
export function PhoneVerificationScreen(): ReactElement {
  const api = useApi();
  const router = useRouter();
  const { phone = '', verificationId = '' } = useLocalSearchParams<{ phone: string; verificationId: string }>();
  const [code, setCode] = useState('');
  const [currentVerificationId, setCurrentVerificationId] = useState(verificationId);
  const [resendAt, setResendAt] = useState(() => Date.now() + 60_000);
  const secondsLeft = useSecondsLeft(resendAt);
  const { busy, error, run } = useRequest();

  const verify = () =>
    run(async () => {
      expectStatus(
        await api.providers.phoneConfirm({ body: { verificationId: currentVerificationId, code } }),
        200,
      );
      router.replace('/provider/dashboard' as never);
    });

  const resend = () =>
    run(async () => {
      const { verificationId: newId } = expectStatus(
        await api.providers.phoneStart({ body: { phone, locale: getLocale() } }),
        202,
      );
      setCurrentVerificationId(newId);
      setResendAt(Date.now() + 60_000);
    });

  return (
    <Screen scroll>
      <Text variant="title">{t('otp.title')}</Text>
      <Text tone="muted">{t('otp.sentTo', { phone: isolateLtr(phone) })}</Text>
      {error ? <Banner kind="error" message={error} /> : null}
      <TextField
        testID={testIDs.provider.otpInput}
        label={t('otp.label')}
        value={code}
        onChangeText={(text) => setCode(toAsciiDigits(text).replace(/\D/g, ''))}
        error={error}
        keyboardType="number-pad"
        direction="ltr"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        maxLength={6}
        autoFocus
      />
      <Button
        testID={testIDs.provider.otpSubmit}
        label={t('otp.submit')}
        onPress={verify}
        disabled={code.length !== 6}
        loading={busy}
      />
      <Button
        variant="secondary"
        label={secondsLeft > 0 ? t('otp.resendIn', { time: clock(secondsLeft) }) : t('otp.resend')}
        onPress={resend}
        disabled={secondsLeft > 0 || busy}
      />
    </Screen>
  );
}
