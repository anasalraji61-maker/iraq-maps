/* eslint-disable no-restricted-syntax, i18next/no-literal-string */
/**
 * PhoneNumber — Iraqi phone number display component.
 *
 * - Formats Iraq phone numbers (+964 7xx xxx xxxx).
 * - Shows Iraqi flag emoji prefix.
 * - WhatsApp deep-link button.
 * - Call deep-link button.
 * - Copy-to-clipboard button with confirmation.
 * - Consent-aware: blurs the number when consent has not been granted.
 * - LTR phone number in RTL layout (numbers read left-to-right always).
 */
import { useCallback, useState } from 'react';
import { Clipboard, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { fonts, tokens } from '../tokens';

// ── Phone formatting ──────────────────────────────────────────────────────────

/**
 * Format an Iraqi mobile number to display form.
 * Accepts: "07701234567", "+9647701234567", "009647701234567"
 * Outputs: "+964 770 123 4567"
 */
export function formatIraqPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  let local: string;
  if (digits.startsWith('964')) {
    local = digits.slice(3);
  } else if (digits.startsWith('00964')) {
    local = digits.slice(5);
  } else if (digits.startsWith('0')) {
    local = digits.slice(1);
  } else {
    local = digits;
  }
  // local = 7xx xxx xxxx (10 digits for Iraqi mobiles)
  if (local.length === 10) {
    return `+964 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  }
  return `+964 ${local}`;
}

/** Build the E.164 form for use in tel: and wa.me links. */
export function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('964')) return `+${digits}`;
  if (digits.startsWith('00964')) return `+${digits.slice(2)}`;
  if (digits.startsWith('0')) return `+964${digits.slice(1)}`;
  return `+964${digits}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type PhoneAction = 'call' | 'whatsapp' | 'copy';

export interface PhoneNumberProps {
  /** Raw phone number in any format. */
  phone: string;
  /**
   * Consent state.
   * - true: full display.
   * - false: blurred / redacted (consent not granted).
   * Default: true.
   */
  consentGranted?: boolean;
  /** Which actions to show. Default: all three. */
  actions?: PhoneAction[];
  /** Compact single-line mode (no action buttons). Default: false. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const { color, space, radius, font } = tokens;

const s = StyleSheet.create({
  root: {
    flexDirection: 'column',
    gap: space.s,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
  },
  flag: {
    fontSize: 20,
  },
  number: {
    fontFamily: fonts.regular,
    fontSize: font.size.body,
    color: color.text,
    // Phone numbers are always LTR
    writingDirection: 'ltr',
    textAlign: 'left',
  },
  blurred: {
    opacity: 0,
    backgroundColor: color.border,
    borderRadius: 4,
    letterSpacing: -6,
  },
  consentNote: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: color.textMuted,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: space.s,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.m,
    paddingVertical: space.s,
    borderRadius: radius.m,
    borderWidth: 1,
    minHeight: 40,
  },
  callBtn: {
    borderColor: color.primary,
    backgroundColor: color.primary + '10',
  },
  whatsappBtn: {
    borderColor: '#25D366',
    backgroundColor: '#25D36610',
  },
  copyBtn: {
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  actionBtnText: {
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  callText: { color: color.primary },
  whatsappText: { color: '#25D366' },
  copyText: { color: color.textMuted },
  copiedText: { color: color.primary },
});

// ── Sub-components ────────────────────────────────────────────────────────────

function ActionButton({
  icon,
  label,
  onPress,
  variant,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  variant: 'call' | 'whatsapp' | 'copy' | 'copied';
}) {
  const btnStyle =
    variant === 'call' ? s.callBtn
    : variant === 'whatsapp' ? s.whatsappBtn
    : s.copyBtn;
  const txtStyle =
    variant === 'call' ? s.callText
    : variant === 'whatsapp' ? s.whatsappText
    : variant === 'copied' ? s.copiedText
    : s.copyText;

  return (
    <Pressable
      style={({ pressed }) => [s.actionBtn, btnStyle, pressed && { opacity: 0.7 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text>{icon}</Text>
      <Text style={[s.actionBtnText, txtStyle]}>{label}</Text>
    </Pressable>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PhoneNumber({
  phone,
  consentGranted = true,
  actions = ['call', 'whatsapp', 'copy'],
  compact = false,
  style,
  testID,
}: PhoneNumberProps) {
  const [copied, setCopied] = useState(false);

  const e164 = toE164(phone);
  const formatted = formatIraqPhone(phone);

  const handleCall = useCallback(() => {
    void Linking.openURL(`tel:${e164}`);
  }, [e164]);

  const handleWhatsApp = useCallback(() => {
    const clean = e164.replace('+', '');
    void Linking.openURL(`https://wa.me/${clean}`);
  }, [e164]);

  const handleCopy = useCallback(() => {
    Clipboard.setString(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [formatted]);

  return (
    <View style={[s.root, style]} testID={testID}>
      <View style={s.phoneRow}>
        <Text style={s.flag} accessibilityElementsHidden>🇮🇶</Text>
        <Text
          style={[s.number, !consentGranted && s.blurred]}
          selectable={consentGranted}
          accessibilityLabel={consentGranted ? `هاتف: ${formatted}` : 'رقم الهاتف مخفي'}
        >
          {consentGranted ? formatted : '•••• •••• ••••'}
        </Text>
      </View>

      {!consentGranted && (
        <Text style={s.consentNote}>
          لم تُمنح إذن عرض بيانات التواصل
        </Text>
      )}

      {!compact && consentGranted && actions.length > 0 && (
        <View style={s.actionsRow}>
          {actions.includes('call') && (
            <ActionButton icon="📞" label="اتصال" onPress={handleCall} variant="call" />
          )}
          {actions.includes('whatsapp') && (
            <ActionButton icon="💬" label="واتساب" onPress={handleWhatsApp} variant="whatsapp" />
          )}
          {actions.includes('copy') && (
            <ActionButton
              icon={copied ? '✓' : '📋'}
              label={copied ? 'تم النسخ' : 'نسخ'}
              onPress={handleCopy}
              variant={copied ? 'copied' : 'copy'}
            />
          )}
        </View>
      )}
    </View>
  );
}

PhoneNumber.displayName = 'PhoneNumber';
