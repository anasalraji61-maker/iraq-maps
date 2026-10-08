import { testIDs } from '@iraq-maps/contracts';
import { formatNumber, getLocale, toAsciiDigits } from '@iraq-maps/i18n';
import { href, useApi, useSession } from '@iraq-maps/mobile-kit';
import { Button, Screen, Text, TextField } from '@iraq-maps/ui';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, type ReactElement } from 'react';
import { isolateLtr } from './phone';
import { expectStatus, useRequest } from './request';
import { t } from './strings';

/** Whole seconds left until `deadline` (epoch ms). Wall-clock based, so time spent reading the SMS counts. */
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

/** m:ss in the current locale's digits (Arabic-Indic for ar and ckb). */
const clock = (seconds: number): string =>
  `${formatNumber(Math.floor(seconds / 60))}:${formatNumber(seconds % 60, { minimumIntegerDigits: 2 })}`;

/** Route params (set by PhoneScreen): `phone` in E.164, `resendAfterSec` from the server's 202. */
export function OtpScreen(): ReactElement {
  const api = useApi();
  const session = useSession();
  const router = useRouter();
  const { phone = '', resendAfterSec } = useLocalSearchParams<{ phone: string; resendAfterSec?: string }>();
  const [code, setCode] = useState('');
  const [resendAt, setResendAt] = useState(() => Date.now() + Number(resendAfterSec ?? 0) * 1000);
  const secondsLeft = useSecondsLeft(resendAt);
  const { busy, error, run } = useRequest();

  const verify = () =>
    run(async () => {
      const { user, isNewUser, ...tokens } = expectStatus(await api.auth.verifyOtp({ body: { phone, code } }), 200);
      await session.signIn(tokens, user);
      if (isNewUser) router.replace(href('authName'));
      else router.dismissTo(href('account'));
    });

  const resend = () =>
    run(async () => {
      const { resendAfterSec: wait } = expectStatus(await api.auth.requestOtp({ body: { phone, locale: getLocale() } }), 202);
      setResendAt(Date.now() + wait * 1000);
    });

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: t('otp.title') }} />
      <Text tone="muted">{t('otp.sentTo', { phone: isolateLtr(phone) })}</Text>
      <TextField
        testID={testIDs.auth.otpInput}
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
      <Button testID={testIDs.auth.otpSubmit} label={t('otp.submit')} onPress={verify} disabled={code.length !== 6} loading={busy} />
      <Button
        testID={testIDs.auth.otpResend}
        variant="secondary"
        label={secondsLeft > 0 ? t('otp.resendIn', { time: clock(secondsLeft) }) : t('otp.resend')}
        onPress={resend}
        disabled={secondsLeft > 0 || busy}
      />
    </Screen>
  );
}
