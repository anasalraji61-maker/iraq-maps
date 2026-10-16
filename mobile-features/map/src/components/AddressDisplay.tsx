/**
 * AddressDisplay — reusable component for displaying an Iraqi address.
 *
 * Variants:
 *   - full:    multi-line with copy and share buttons
 *   - compact: single line with truncation
 *
 * Props:
 *   address      FormattedAddress from geocoding
 *   variant      'full' | 'compact' (default: 'full')
 *   onOpenMaps   optional callback — "open in maps" tapped
 *   style        container override
 *
 * Strings: map namespace, keys under `addressDisplay`.
 */
import { useCallback, type ReactElement } from 'react';
import {
  Clipboard,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  type TextStyle,
  type ViewStyle,
  View,
} from 'react-native';
import type { FormattedAddress } from '@iraq-maps/contracts';
import { t } from '../strings';

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  primary: '#1976D2',
  surface: '#FFFFFF',
  bg: '#F5F5F5',
  text: '#1A1A1A',
  textSecondary: '#666666',
  textHint: '#9E9E9E',
  border: '#E0E0E0',
  separator: '#EEEEEE',
  success: '#2E7D32',
  successLight: '#E8F5E9',
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AddressDisplayProps {
  address: FormattedAddress;
  variant?: 'full' | 'compact';
  onOpenMaps?: () => void;
  /** Whether to show the "Open in maps" button. Default: false. */
  showOpenMaps?: boolean;
  containerStyle?: ViewStyle;
  /** Number of lines for compact variant. Default: 1. */
  compactLines?: number;
  testID?: string;
}

// ── Compact variant ────────────────────────────────────────────────────────────

function CompactAddress({
  address,
  lines = 1,
  style,
  testID,
}: {
  address: FormattedAddress;
  lines?: number;
  style?: TextStyle;
  testID?: string;
}): ReactElement {
  return (
    <Text
      style={[compactStyles.text, style]}
      numberOfLines={lines}
      testID={testID ?? 'address.compact'}
      accessibilityLabel={address.short}
    >
      {address.short}
    </Text>
  );
}

const compactStyles = StyleSheet.create({
  text: {
    fontSize: 14,
    color: C.textSecondary,
    textAlign: 'auto',
  },
});

// ── Action button ─────────────────────────────────────────────────────────────

function ActionButton({
  label,
  onPress,
  testID,
  icon,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
  icon?: string;
}): ReactElement {
  return (
    <Pressable
      style={({ pressed }) => [actionStyles.btn, pressed && actionStyles.btnPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      hitSlop={4}
    >
      {icon ? <Text style={actionStyles.icon}>{icon}</Text> : null}
      <Text style={actionStyles.label}>{label}</Text>
    </Pressable>
  );
}

const actionStyles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.bg,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  btnPressed: { opacity: 0.7 },
  icon: { fontSize: 13 },
  label: { fontSize: 12, color: C.primary, fontWeight: '600' },
});

// ── Component row ─────────────────────────────────────────────────────────────

function ComponentRow({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={rowStyles.value}>{value}</Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.separator,
  },
  label: { fontSize: 12, color: C.textHint, flex: 1, textAlign: 'auto' },
  value: { fontSize: 13, color: C.text, flex: 2, textAlign: 'auto', fontWeight: '500' },
});

// ── Full variant ───────────────────────────────────────────────────────────────

function FullAddress({
  address,
  onOpenMaps,
  showOpenMaps,
  testID,
}: {
  address: FormattedAddress;
  onOpenMaps?: () => void;
  showOpenMaps?: boolean;
  testID?: string;
}): ReactElement {
  const handleCopy = useCallback(() => {
    Clipboard.setString(address.full);
  }, [address.full]);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({ message: address.full, title: address.short });
    } catch {
      // User cancelled
    }
  }, [address]);

  const { components } = address;

  return (
    <View style={fullStyles.container} testID={testID ?? 'address.full'}>
      {/* Full address string */}
      <Text style={fullStyles.fullText} accessibilityLabel={address.full}>
        {address.full}
      </Text>

      {/* Action buttons */}
      <View style={fullStyles.actions}>
        <ActionButton
          label={t('addressDisplay.copy')}
          icon="📋"
          onPress={handleCopy}
          testID="address.copy"
        />
        <ActionButton
          label={t('addressDisplay.share')}
          icon="🔗"
          onPress={() => void handleShare()}
          testID="address.share"
        />
        {showOpenMaps && onOpenMaps && (
          <ActionButton
            label={t('addressDisplay.openInMaps')}
            icon="🗺️"
            onPress={onOpenMaps}
            testID="address.openMaps"
          />
        )}
      </View>

      {/* Components breakdown */}
      <View style={fullStyles.breakdown}>
        {components.governorate ? (
          <ComponentRow label={t('addressDisplay.governorate')} value={components.governorate} />
        ) : null}
        {components.city ? (
          <ComponentRow label={t('addressDisplay.city')} value={components.city} />
        ) : null}
        {components.district ? (
          <ComponentRow label={t('addressDisplay.district')} value={components.district} />
        ) : null}
        {components.neighborhood ? (
          <ComponentRow label={t('addressDisplay.neighborhood')} value={components.neighborhood} />
        ) : null}
        {components.street ? (
          <ComponentRow label={t('addressDisplay.street')} value={components.street} />
        ) : null}
        {components.houseNumber ? (
          <ComponentRow label={t('addressDisplay.building')} value={components.houseNumber} />
        ) : null}
        {components.landmark ? (
          <ComponentRow label={t('addressDisplay.landmark')} value={components.landmark} />
        ) : null}
        {components.postcode ? (
          <ComponentRow label={t('addressDisplay.postcode')} value={components.postcode} />
        ) : null}
      </View>
    </View>
  );
}

const fullStyles = StyleSheet.create({
  container: {
    backgroundColor: C.surface,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    gap: 10,
  },
  fullText: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
    lineHeight: 24,
    textAlign: 'auto',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  breakdown: {
    gap: 0,
    backgroundColor: C.bg,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
});

// ── Public component ───────────────────────────────────────────────────────────

/**
 * AddressDisplay — renders a FormattedAddress in either 'full' or 'compact' mode.
 *
 * @example Full
 * ```tsx
 * <AddressDisplay address={reverseResult.address} showOpenMaps onOpenMaps={openNavigator} />
 * ```
 *
 * @example Compact (one line)
 * ```tsx
 * <AddressDisplay address={result.address} variant="compact" />
 * ```
 */
export function AddressDisplay({
  address,
  variant = 'full',
  onOpenMaps,
  showOpenMaps = false,
  containerStyle,
  compactLines = 1,
  testID,
}: AddressDisplayProps): ReactElement {
  if (variant === 'compact') {
    return (
      <View style={containerStyle}>
        <CompactAddress address={address} lines={compactLines} testID={testID} />
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <FullAddress
        address={address}
        onOpenMaps={onOpenMaps}
        showOpenMaps={showOpenMaps}
        testID={testID}
      />
    </View>
  );
}
