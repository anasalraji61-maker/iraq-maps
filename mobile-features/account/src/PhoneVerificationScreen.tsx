import { testIDs } from '@iraq-maps/contracts';
import { formatNumber, getLocale, toAsciiDigits } from '@iraq-maps/i18n';
import { href, useApi, useSession } from '@iraq-maps/mobile-kit';
import { Button, Screen, Text } from '@iraq-maps/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Animated, StyleSheet, TextInput, View } from 'react-native';
import { isolateLtr } from './phone';
import { expectStatus, useRequest } from './request';
import { ScreenTitle } from './ScreenTitle';
import { t } from './strings';

const PRIMARY = '#1976D2';
const OTP_LENGTH = 6;

/** Whole seconds left until `deadline` (epoch ms). */
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

/** m:ss in current locale's digits. */
const clock = (seconds: number): string =>
  `${formatNumber(Math.floor(seconds / 60))}:${formatNumber(seconds % 60, { minimumIntegerDigits: 2 })}`;

function OtpBox({
  value,
  isFocused,
  hasError,
}: {
  value: string;
  isFocused: boolean;
  hasError: boolean;
}): ReactElement {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isFocused) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [isFocused, pulseAnim]);

  return (
    <View
      style={[
        styles.otpBox,
        isFocused && styles.otpBoxFocused,
        hasError && styles.otpBoxError,
        value && styles.otpBoxFilled,
      ]}
    >
      {value ? (
        <Text style={styles.otpDigit}>{value}</Text>
      ) : isFocused ? (
        <Animated.View style={[styles.cursor, { opacity: pulseAnim }]} />
      ) : null}
    </View>
  );
}

/** Custom 6-box OTP input with auto-advance. */
function OtpInput({
  value,
  onChange,
  hasError,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  hasError: boolean;
  disabled: boolean;
}): ReactElement {
  const inputRef = useRef<TextInput>(null);
  const digits = value.padEnd(OTP_LENGTH, '').split('');
  const focusedIndex = Math.min(value.length, OTP_LENGTH - 1);

  return (
    <View style={styles.otpRow} accessibilityRole="none">
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(text) => {
          const cleaned = toAsciiDigits(text).replace(/\D/g, '').slice(0, OTP_LENGTH);
          onChange(cleaned);
        }}
        keyboardType="number-pad"
        maxLength={OTP_LENGTH}
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        style={styles.hiddenInput}
        autoFocus
        editable={!disabled}
        accessibilityLabel={t('phoneVerification.otp.label')}
      />
      <View style={styles.boxes} onTouchEnd={() => inputRef.current?.focus()}>
        {digits.map((d, i) => (
          <OtpBox
            key={i}
            value={d}
            isFocused={!disabled && i === focusedIndex}
            hasError={hasError}
          />
        ))}
      </View>
    </View>
  );
}

function SuccessAnimation(): ReactElement {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 7 }).start();
  }, [scaleAnim]);
  return (
    <Animated.View style={[styles.successCircle, { transform: [{ scale: scaleAnim }] }]}>
      <Text style={styles.successCheck}>{t('phoneVerification.checkmark')}</Text>
    </Animated.View>
  );
}

/**
 * Enhanced phone verification screen with a visual OTP grid, resend timer and success animation.
 * Route params: `phone` (E.164), `resendAfterSec`.
 */
export function PhoneVerificationScreen(): ReactElement {
  const api = useApi();
  const session = useSession();
  const router = useRouter();
  const { phone = '', resendAfterSec } = useLocalSearchParams<{ phone: string; resendAfterSec?: string }>();
  const [code, setCode] = useState('');
  const [resendAt, setResendAt] = useState(() => Date.now() + Number(resendAfterSec ?? 0) * 1000);
  const [succeeded, setSucceeded] = useState(false);
  const secondsLeft = useSecondsLeft(resendAt);
  const { busy, error, run } = useRequest();

  const verify = () =>
    run(async () => {
      const { user, isNewUser, ...tokens } = expectStatus(
        await api.auth.verifyOtp({ body: { phone, code } }),
        200,
      );
      await session.signIn(tokens, user);
      setSucceeded(true);
      // Brief success pause then navigate
      await new Promise((r) => setTimeout(r, 800));
      if (isNewUser) router.replace(href('authName'));
      else router.dismissTo(href('account'));
    });

  const resend = () =>
    run(async () => {
      const { resendAfterSec: wait } = expectStatus(
        await api.auth.requestOtp({ body: { phone, locale: getLocale() } }),
        202,
      );
      setResendAt(Date.now() + wait * 1000);
      setCode('');
    });

  // Auto-submit when all 6 digits are entered; verify is intentionally excluded from deps
  useEffect(() => {
    if (code.length === OTP_LENGTH && !busy && !succeeded) verify();
  }, [code, busy, succeeded]);

  return (
    <Screen scroll>
      <ScreenTitle title={t('phoneVerification.title')} />
      <Text tone="muted">{t('phoneVerification.sentTo', { phone: isolateLtr(phone) })}</Text>

      {succeeded ? (
        <View style={styles.successContainer}>
          <SuccessAnimation />
          <Text style={styles.successText}>{t('phoneVerification.success')}</Text>
        </View>
      ) : (
        <>
          <OtpInput
            value={code}
            onChange={setCode}
            hasError={!!error}
            disabled={busy}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Button
            testID={testIDs.auth.otpSubmit}
            label={t('phoneVerification.verify')}
            onPress={verify}
            disabled={code.length !== OTP_LENGTH}
            loading={busy}
          />

          <Button
            testID={testIDs.auth.otpResend}
            variant="secondary"
            label={
              secondsLeft > 0
                ? t('phoneVerification.resendIn', { time: clock(secondsLeft) })
                : t('phoneVerification.resend')
            }
            onPress={resend}
            disabled={secondsLeft > 0 || busy}
          />

          <View style={styles.hintRow}>
            <Text tone="muted" variant="caption">{t('phoneVerification.hint')}</Text>
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  otpRow: { alignItems: 'center', marginVertical: 24 },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
  boxes: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
  },
  otpBox: {
    width: 44,
    height: 56,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#BDBDBD',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAFA',
  },
  otpBoxFocused: { borderColor: PRIMARY, backgroundColor: '#E3F2FD' },
  otpBoxError: { borderColor: '#C62828', backgroundColor: '#FFEBEE' },
  otpBoxFilled: { borderColor: PRIMARY },
  otpDigit: { fontSize: 24, fontWeight: '700', color: '#212121' },
  cursor: {
    width: 2,
    height: 28,
    backgroundColor: PRIMARY,
    borderRadius: 1,
  },
  errorText: { color: '#C62828', textAlign: 'center', marginTop: -8 },
  hintRow: { alignItems: 'center', paddingVertical: 8 },
  successContainer: { alignItems: 'center', paddingVertical: 48, gap: 16 },
  successCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#2E7D32',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successCheck: { fontSize: 40, color: '#fff', fontWeight: '700' },
  successText: { fontSize: 18, fontWeight: '600', color: '#2E7D32', textAlign: 'center' },
});
