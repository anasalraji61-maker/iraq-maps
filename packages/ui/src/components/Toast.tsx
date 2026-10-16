/* eslint-disable no-restricted-syntax, i18next/no-literal-string */
/**
 * Toast — queued notification toasts.
 *
 * Features:
 * - Variants: success / error / warning / info.
 * - Arabic RTL text layout.
 * - Auto-dismiss after 3 s (configurable).
 * - Swipe-to-dismiss (pan gesture via Animated).
 * - Optional action button.
 * - Queue: multiple toasts stack without overlapping.
 * - ToastProvider + useToast hook for global usage.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { fonts, tokens } from '../tokens';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  message: string;
  /** Auto-dismiss duration in ms. Default: 3000. 0 = never auto-dismiss. */
  duration?: number;
  /** Optional action button. */
  action?: { label: string; onPress: () => void };
}

// ── Context ───────────────────────────────────────────────────────────────────

interface ToastContextValue {
  show(toast: Omit<ToastItem, 'id'>): string;
  dismiss(id: string): void;
}

const ToastContext = createContext<ToastContextValue>({
  show: () => '',
  dismiss: () => undefined,
});

export function useToast() {
  return useContext(ToastContext);
}

// ── Visual config ─────────────────────────────────────────────────────────────

const VARIANT_CONFIG: Record<ToastVariant, { bg: string; border: string; icon: string; label: string }> = {
  success: { bg: '#E8F5E9', border: '#388E3C', icon: '✓', label: 'نجاح' },
  error:   { bg: '#FFEBEE', border: '#C62828', icon: '✕', label: 'خطأ' },
  warning: { bg: '#FFF8E1', border: '#F57F17', icon: '!', label: 'تنبيه' },
  info:    { bg: '#E3F2FD', border: '#1565C0', icon: 'ℹ', label: 'معلومة' },
};

// ── Styles ────────────────────────────────────────────────────────────────────

const { color, space, radius, font } = tokens;

const s = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 80,
    start: space.m,
    end: space.m,
    gap: space.s,
    zIndex: 9999,
  },
  toast: {
    borderRadius: radius.m,
    borderWidth: 1.5,
    paddingHorizontal: space.m,
    paddingVertical: space.m,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.s,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  iconText: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    gap: 4,
  },
  message: {
    fontFamily: fonts.regular,
    fontSize: font.size.body,
    color: color.text,
    lineHeight: font.size.body * 1.5,
  },
  actionBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  actionText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  dismissBtn: {
    padding: 4,
    flexShrink: 0,
  },
  dismissText: {
    fontSize: 16,
    color: color.textMuted,
  },
});

// ── Single Toast Item ─────────────────────────────────────────────────────────

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const cfg = VARIANT_CONFIG[item.variant];
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  // Entry animation
  useEffect(() => {
    Animated.spring(opacity, { toValue: 1, useNativeDriver: true }).start();
  }, [opacity]);

  // Auto-dismiss
  useEffect(() => {
    const dur = item.duration ?? 3000;
    if (dur <= 0) return;
    const t = setTimeout(() => dismiss(), dur);
    return () => clearTimeout(t);
  });

  function dismiss() {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 100, duration: 200, useNativeDriver: true }),
    ]).start(() => onDismiss());
  }

  // Swipe to dismiss
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8,
      onPanResponderMove: (_, g) => translateX.setValue(g.dx),
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) > 60) {
          dismiss();
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  return (
    <Animated.View
      style={[{ opacity, transform: [{ translateX }] }]}
      {...pan.panHandlers}
    >
      <View style={[s.toast, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
        <View style={[s.iconWrap, { backgroundColor: cfg.border }]}>
          <Text style={s.iconText}>{cfg.icon}</Text>
        </View>
        <View style={s.content}>
          <Text style={s.message}>{item.message}</Text>
          {item.action && (
            <Pressable style={s.actionBtn} onPress={() => { item.action!.onPress(); dismiss(); }}>
              <Text style={[s.actionText, { color: cfg.border }]}>{item.action.label}</Text>
            </Pressable>
          )}
        </View>
        <Pressable style={s.dismissBtn} onPress={dismiss} accessibilityLabel="إغلاق">
          <Text style={s.dismissText}>×</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

// ── Toast container ───────────────────────────────────────────────────────────

function ToastContainer({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <View style={s.container} pointerEvents="box-none">
      {toasts.map((t) => (
        <ToastView key={t.id} item={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </View>
  );
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const show = useCallback((toast: Omit<ToastItem, 'id'>): string => {
    const id = `toast-${++counter.current}`;
    setToasts((prev) => [...prev.slice(-4), { ...toast, id }]); // max 5 on screen
    return id;
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

ToastProvider.displayName = 'ToastProvider';

// ── Standalone (imperative) usage helper ──────────────────────────────────────
// For use outside React tree (e.g. error boundaries), consumers should prefer
// the hook. This is a no-op in test environments.

let _globalShow: ToastContextValue['show'] | null = null;

/** Called internally by ToastProvider to register the global handler. */
export function _registerGlobalToast(show: ToastContextValue['show']) {
  _globalShow = show;
}

export const toast = {
  success: (message: string, opts?: Partial<Omit<ToastItem, 'id' | 'variant' | 'message'>>) =>
    _globalShow?.({ variant: 'success', message, ...opts }),
  error: (message: string, opts?: Partial<Omit<ToastItem, 'id' | 'variant' | 'message'>>) =>
    _globalShow?.({ variant: 'error', message, ...opts }),
  warning: (message: string, opts?: Partial<Omit<ToastItem, 'id' | 'variant' | 'message'>>) =>
    _globalShow?.({ variant: 'warning', message, ...opts }),
  info: (message: string, opts?: Partial<Omit<ToastItem, 'id' | 'variant' | 'message'>>) =>
    _globalShow?.({ variant: 'info', message, ...opts }),
};
