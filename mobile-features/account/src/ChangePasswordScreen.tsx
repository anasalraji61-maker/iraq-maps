/**
 * ChangePasswordScreen — placeholder for future password auth.
 *
 * The app currently uses phone/OTP only. This screen is included for completeness
 * and is gated behind the `linkedAccounts.password.enabled` feature flag (always
 * false for now). It will become active when email/password login is added.
 */
import { Button, Screen, Text, TextField } from '@iraq-maps/ui';
import { useState, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { ScreenTitle } from './ScreenTitle';
import { t } from './strings';

type Strength = 'none' | 'weak' | 'fair' | 'strong' | 'very_strong';

function passwordStrength(pw: string): Strength {
  if (!pw) return 'none';
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return 'weak';
  if (score === 2) return 'fair';
  if (score === 3) return 'strong';
  return 'very_strong';
}

const STRENGTH_COLOR: Record<Strength, string> = {
  none: '#E0E0E0',
  weak: '#C62828',
  fair: '#F57F17',
  strong: '#2E7D32',
  very_strong: '#1565C0',
};

const STRENGTH_LABEL_KEY: Record<Strength, Parameters<typeof t>[0]> = {
  none: 'changePassword.strength.none',
  weak: 'changePassword.strength.weak',
  fair: 'changePassword.strength.fair',
  strong: 'changePassword.strength.strong',
  very_strong: 'changePassword.strength.veryStrong',
};

const STRENGTH_SEGMENTS = 4;

function StrengthBar({ strength }: { strength: Strength }): ReactElement {
  const filled =
    strength === 'none' ? 0
    : strength === 'weak' ? 1
    : strength === 'fair' ? 2
    : strength === 'strong' ? 3
    : 4;

  return (
    <View style={styles.strengthContainer}>
      <View style={styles.strengthBars}>
        {Array.from({ length: STRENGTH_SEGMENTS }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.strengthSegment,
              { backgroundColor: i < filled ? STRENGTH_COLOR[strength] : '#E0E0E0' },
            ]}
          />
        ))}
      </View>
      {strength !== 'none' && (
        <Text
          variant="caption"
          style={[styles.strengthLabel, { color: STRENGTH_COLOR[strength] }]}
        >
          {t(STRENGTH_LABEL_KEY[strength])}
        </Text>
      )}
    </View>
  );
}

export function ChangePasswordScreen(): ReactElement {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const strength = passwordStrength(next);
  const mismatch = submitted && confirm.length > 0 && next !== confirm;
  const tooWeak = submitted && (strength === 'weak' || strength === 'none');
  const canSubmit = current.length > 0 && next.length >= 8 && next === confirm && strength !== 'weak';

  const REQUIREMENTS: { met: boolean; key: Parameters<typeof t>[0] }[] = [
    { met: next.length >= 8, key: 'changePassword.req.length' },
    { met: /[A-Z]/.test(next), key: 'changePassword.req.upper' },
    { met: /[0-9]/.test(next), key: 'changePassword.req.digit' },
    { met: /[^A-Za-z0-9]/.test(next), key: 'changePassword.req.special' },
  ];

  const handleSubmit = () => {
    setSubmitted(true);
    if (!canSubmit) return;
    // Stub: password change is not yet implemented (OTP-only app)
  };

  return (
    <Screen scroll>
      <ScreenTitle title={t('changePassword.title')} />
      <Text tone="muted">{t('changePassword.body')}</Text>

      <TextField
        label={t('changePassword.current')}
        value={current}
        onChangeText={setCurrent}
        secureTextEntry={!showCurrent}
        textContentType="password"
        autoComplete="current-password"
        rightElement={
          <Text
            onPress={() => setShowCurrent((v) => !v)}
            style={styles.toggle}
            accessibilityRole="button"
          >
            {showCurrent ? t('changePassword.hide') : t('changePassword.show')}
          </Text>
        }
      />

      <TextField
        label={t('changePassword.new')}
        value={next}
        onChangeText={setNext}
        secureTextEntry={!showNext}
        textContentType="newPassword"
        autoComplete="new-password"
        error={tooWeak ? t('changePassword.tooWeak') : undefined}
        rightElement={
          <Text
            onPress={() => setShowNext((v) => !v)}
            style={styles.toggle}
            accessibilityRole="button"
          >
            {showNext ? t('changePassword.hide') : t('changePassword.show')}
          </Text>
        }
      />

      <StrengthBar strength={strength} />

      <View style={styles.requirements}>
        {REQUIREMENTS.map(({ met, key }) => (
          <Text key={key} variant="caption" style={[styles.req, met ? styles.reqMet : styles.reqUnmet]}>
            {met ? t('changePassword.req.met') : t('changePassword.req.unmet')}{t(key)}
          </Text>
        ))}
      </View>

      <TextField
        label={t('changePassword.confirm')}
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        textContentType="newPassword"
        autoComplete="new-password"
        error={mismatch ? t('changePassword.mismatch') : undefined}
      />

      <Button
        label={t('changePassword.save')}
        onPress={handleSubmit}
        disabled={!canSubmit}
      />
      <Text tone="muted" variant="caption" style={styles.notice}>{t('changePassword.notice')}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  toggle: { color: '#1976D2', paddingHorizontal: 4 },
  strengthContainer: { gap: 4, marginTop: -8 },
  strengthBars: { flexDirection: 'row', gap: 4 },
  strengthSegment: { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel: { fontWeight: '600' },
  requirements: { gap: 4 },
  req: { lineHeight: 20 },
  reqMet: { color: '#2E7D32' },
  reqUnmet: { color: '#9E9E9E' },
  notice: { textAlign: 'center', paddingTop: 8 },
});
