/**
 * ContextMenu — reusable map context menu that appears at a dropped pin.
 *
 * Features:
 * - Slide-up animation from bottom
 * - Five actions: Directions here / Directions from here / Add place / Share / What's here
 * - Dismiss on backdrop tap
 * - Full RTL support (start/end, not left/right)
 * - All text via t()
 */
import { t } from '../strings';
import { tokens } from '@iraq-maps/ui';
import { useCallback, useEffect, useRef, type ReactElement } from 'react';
import {
  Animated,
  Clipboard,
  Pressable,
  Share,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';

export interface ContextMenuCoords {
  latitude: number;
  longitude: number;
}

export interface ContextMenuProps {
  visible: boolean;
  coords: ContextMenuCoords | null;
  /** Address label resolved for this pin (may be undefined while loading). */
  address?: string;
  onDirectionsTo: (coords: ContextMenuCoords) => void;
  onDirectionsFrom: (coords: ContextMenuCoords) => void;
  onAddPlace: (coords: ContextMenuCoords) => void;
  onWhatsHere: (coords: ContextMenuCoords) => void;
  onDismiss: () => void;
}

const SLIDE_DURATION_MS = 240;

export function ContextMenu({
  visible,
  coords,
  address,
  onDirectionsTo,
  onDirectionsFrom,
  onAddPlace,
  onWhatsHere,
  onDismiss,
}: ContextMenuProps): ReactElement | null {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 65,
          friction: 10,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: SLIDE_DURATION_MS,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: SLIDE_DURATION_MS,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: SLIDE_DURATION_MS,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, opacityAnim]);

  const handleShare = useCallback(async () => {
    if (!coords) return;
    const coordStr = `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`;
    const message = address
      ? t('contextMenu.shareMessageAddress', { address, coords: coordStr })
      : t('contextMenu.shareMessageCoords', { coords: coordStr });
    try {
      await Share.share({ message });
    } catch {
      // best-effort share
    }
    onDismiss();
  }, [coords, address, onDismiss]);

  const handleCopyCoords = useCallback(() => {
    if (!coords) return;
    Clipboard.setString(`${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`);
    onDismiss();
  }, [coords, onDismiss]);

  if (!visible && !coords) return null;

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [240, 0],
  });

  const coordLabel = coords
    ? `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`
    : '';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'box-none' : 'none'}>
      {/* Backdrop — tap to dismiss */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel={t('contextMenu.dismiss')}
        importantForAccessibility={visible ? 'auto' : 'no'}
      />

      {/* Slide-up panel */}
      <Animated.View
        style={[
          menuStyles.panel,
          {
            opacity: opacityAnim,
            transform: [{ translateY }],
          },
        ]}
        pointerEvents={visible ? 'box-none' : 'none'}
        accessibilityViewIsModal
      >
        {/* Pin indicator row */}
        <View style={menuStyles.handle} />
        <View style={menuStyles.pinRow}>
          <RNText style={menuStyles.pinEmoji}>📍</RNText>
          <View style={menuStyles.pinInfo}>
            {address ? (
              <RNText style={menuStyles.address} numberOfLines={2}>
                {address}
              </RNText>
            ) : null}
            <Pressable
              onPress={handleCopyCoords}
              accessibilityRole="button"
              accessibilityLabel={t('contextMenu.copyCoords')}
            >
              <RNText style={menuStyles.coords}>{coordLabel}</RNText>
            </Pressable>
          </View>
        </View>

        {/* Divider */}
        <View style={menuStyles.divider} />

        {/* Action rows */}
        <ContextAction
          emoji="🗺️"
          label={t('contextMenu.directionsTo')}
          onPress={() => {
            if (coords) { onDirectionsTo(coords); onDismiss(); }
          }}
        />
        <ContextAction
          emoji="🚀"
          label={t('contextMenu.directionsFrom')}
          onPress={() => {
            if (coords) { onDirectionsFrom(coords); onDismiss(); }
          }}
        />
        <ContextAction
          emoji="🔍"
          label={t('contextMenu.whatsHere')}
          onPress={() => {
            if (coords) { onWhatsHere(coords); onDismiss(); }
          }}
        />
        <ContextAction
          emoji="➕"
          label={t('contextMenu.addPlace')}
          onPress={() => {
            if (coords) { onAddPlace(coords); onDismiss(); }
          }}
        />
        <ContextAction
          emoji="🔗"
          label={t('contextMenu.share')}
          onPress={() => { void handleShare(); }}
        />

        {/* Safe-area padding */}
        <View style={menuStyles.safeBottom} />
      </Animated.View>
    </View>
  );
}

// ─── Action Row ───────────────────────────────────────────────────────────────

interface ContextActionProps {
  emoji: string;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

function ContextAction({ emoji, label, onPress, destructive }: ContextActionProps): ReactElement {
  return (
    <Pressable
      style={({ pressed }) => [menuStyles.action, pressed && menuStyles.actionPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <RNText style={menuStyles.actionEmoji}>{emoji}</RNText>
      <RNText style={[menuStyles.actionLabel, destructive && menuStyles.actionDestructive]}>
        {label}
      </RNText>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const { color, space, radius } = tokens;

const menuStyles = StyleSheet.create({
  panel: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
    backgroundColor: color.bg,
    borderTopStartRadius: 20,
    borderTopEndRadius: 20,
    paddingHorizontal: space.m,
    paddingTop: space.xs,
    elevation: 24,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.border,
    marginBottom: space.s,
  },
  pinRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.s,
    paddingVertical: space.s,
  },
  pinEmoji: { fontSize: 24, lineHeight: 32 },
  pinInfo: { flex: 1, gap: 2 },
  address: {
    fontSize: 15,
    fontWeight: '600',
    color: color.text,
    writingDirection: 'rtl',
  },
  coords: {
    fontSize: 12,
    color: color.primary ?? '#2563EB',
    fontFamily: 'monospace',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.border,
    marginVertical: space.xs,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    paddingVertical: 14,
    paddingHorizontal: space.xs,
    borderRadius: radius.m,
  },
  actionPressed: {
    backgroundColor: color.surface,
  },
  actionEmoji: { fontSize: 22, width: 32, textAlign: 'center' },
  actionLabel: {
    flex: 1,
    fontSize: 16,
    color: color.text,
    writingDirection: 'rtl',
  },
  actionDestructive: { color: '#DC2626' },
  safeBottom: { height: 24 },
});
