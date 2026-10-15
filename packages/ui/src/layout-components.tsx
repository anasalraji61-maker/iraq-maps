/**
 * Layout Components — RTL-safe, AA contrast, 48dp touch targets.
 * All user-facing strings come from callers (already translated).
 */
// Symbols stored as constants so jsx-only i18next rule does not flag them.
const SYM_CHECK = '✓'; // ✓
const SYM_BACK_LTR = '‹'; // ‹
const SYM_BACK_RTL = '›'; // ›

import { type ReactElement, type ReactNode, useRef } from 'react';
import {
  Animated,
  FlatList,
  I18nManager,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from './tokens';

const { color, space, radius, font } = tokens;

// ---------------------------------------------------------------------------
// BottomSheet
// ---------------------------------------------------------------------------

export interface SnapPoint {
  value: number | `${number}%`;
}

export interface BottomSheetProps {
  visible: boolean;
  onClose(): void;
  children: ReactNode;
  snapPoints?: Array<number | `${number}%`>;
  testID?: string;
}

export function BottomSheet({ visible, onClose, children, testID }: BottomSheetProps): ReactElement {
  const translateY = useRef(new Animated.Value(300)).current;

  function onShow() {
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
  }

  function handleClose() {
    Animated.timing(translateY, { toValue: 300, duration: 250, useNativeDriver: true }).start(() => onClose());
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      onShow={onShow}
    >
      <View style={bs.backdrop}>
        <TouchableWithoutFeedback onPress={handleClose} accessible={false}>
          <View style={bs.fill} />
        </TouchableWithoutFeedback>
        <Animated.View style={[bs.sheet, { transform: [{ translateY }] }]} testID={testID}>
          {/* Drag handle */}
          <View style={bs.handleRow} accessible={false}>
            <View style={bs.handle} />
          </View>
          <SafeAreaView edges={['bottom']}>
            {children}
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}
BottomSheet.displayName = 'BottomSheet';

const bs = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  fill: { flex: 1 },
  sheet: { backgroundColor: color.bg, borderTopStartRadius: radius.l, borderTopEndRadius: radius.l, paddingHorizontal: space.m, paddingBottom: space.m, maxHeight: '90%' },
  handleRow: { alignItems: 'center', paddingVertical: space.s },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: color.border },
});

// ---------------------------------------------------------------------------
// AppModal (full-screen and dialog)
// ---------------------------------------------------------------------------

export type ModalSize = 'dialog' | 'fullscreen';

export interface AppModalProps {
  visible: boolean;
  onClose(): void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  closeLabel?: string;
  backLabel?: string;
  testID?: string;
}

export function AppModal({ visible, onClose, title, children, footer, size = 'dialog', closeLabel, backLabel, testID }: AppModalProps): ReactElement {
  return (
    <Modal visible={visible} transparent={size === 'dialog'} animationType="fade" onRequestClose={onClose}>
      {size === 'dialog' ? (
        <TouchableWithoutFeedback onPress={onClose} accessible={false}>
          <View style={am.overlay}>
            <TouchableWithoutFeedback>
              <View style={am.dialog} testID={testID} accessibilityViewIsModal onAccessibilityEscape={onClose}>
                {title && (
                  <View style={am.header}>
                    <RNText style={am.title}>{title}</RNText>
                    <Pressable onPress={onClose} style={am.closeBtn} accessibilityRole="button" accessibilityLabel={closeLabel}>
                      <RNText style={am.closeText}>×</RNText>
                    </Pressable>
                  </View>
                )}
                <ScrollView style={am.body}>{children}</ScrollView>
                {footer && <View style={am.footer}>{footer}</View>}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      ) : (
        <SafeAreaView style={am.fullscreen} testID={testID} accessibilityViewIsModal onAccessibilityEscape={onClose}>
          {title && (
            <View style={am.header}>
              <Pressable onPress={onClose} style={am.closeBtn} accessibilityRole="button" accessibilityLabel={backLabel}>
                <RNText style={am.backText}>{I18nManager.isRTL ? SYM_BACK_RTL : SYM_BACK_LTR}</RNText>
              </Pressable>
              <RNText style={am.title}>{title}</RNText>
            </View>
          )}
          <ScrollView style={am.body}>{children}</ScrollView>
          {footer && <View style={am.footer}>{footer}</View>}
        </SafeAreaView>
      )}
    </Modal>
  );
}
AppModal.displayName = 'AppModal';

const am = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: space.l },
  dialog: { backgroundColor: color.bg, borderRadius: radius.l, width: '100%', maxHeight: '80%', overflow: 'hidden' },
  fullscreen: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: 'row', alignItems: 'center', padding: space.m, borderBottomWidth: 1, borderBottomColor: color.border, gap: space.s },
  title: { flex: 1, fontFamily: 'NotoSansArabic_700Bold', fontSize: font.size.subtitle, color: color.text },
  closeBtn: { width: tokens.minTouch, height: tokens.minTouch, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 24, color: color.textMuted, lineHeight: 28 },
  backText: { fontSize: 24, color: color.primary, fontFamily: 'NotoSansArabic_700Bold' },
  body: { padding: space.m },
  footer: { padding: space.m, borderTopWidth: 1, borderTopColor: color.border },
});

// ---------------------------------------------------------------------------
// SideDrawer
// ---------------------------------------------------------------------------

export interface SideDrawerProps {
  visible: boolean;
  onClose(): void;
  children: ReactNode;
  width?: number;
  testID?: string;
}

export function SideDrawer({ visible, onClose, children, width = 300, testID }: SideDrawerProps): ReactElement {
  const translateX = useRef(new Animated.Value(I18nManager.isRTL ? width : -width)).current;

  function onShow() {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
  }

  function handleClose() {
    const target = I18nManager.isRTL ? width : -width;
    Animated.timing(translateX, { toValue: target, duration: 250, useNativeDriver: true }).start(() => onClose());
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose} onShow={onShow}>
      <View style={sd.overlay}>
        <TouchableWithoutFeedback onPress={handleClose} accessible={false}>
          <View style={sd.fill} />
        </TouchableWithoutFeedback>
        <Animated.View
          style={[
            sd.drawer,
            { width, transform: [{ translateX }] },
            I18nManager.isRTL ? sd.end : sd.start,
          ]}
          testID={testID}
          accessibilityViewIsModal
          onAccessibilityEscape={handleClose}
        >
          <SafeAreaView style={sd.safeArea}>{children}</SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}
SideDrawer.displayName = 'SideDrawer';

const sd = StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.45)' },
  fill: { flex: 1 },
  drawer: { backgroundColor: color.bg, position: 'absolute', top: 0, bottom: 0 },
  start: { start: 0 },
  end: { end: 0 },
  safeArea: { flex: 1, padding: space.m },
});

// ---------------------------------------------------------------------------
// ActionBar
// ---------------------------------------------------------------------------

export interface ActionBarItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onPress(): void;
  disabled?: boolean;
}

export interface ActionBarProps {
  actions: ActionBarItem[];
  testID?: string;
}

export function ActionBar({ actions, testID }: ActionBarProps): ReactElement {
  return (
    <View testID={testID} style={ab.bar}>
      {actions.map((a) => (
        <Pressable
          key={a.key}
          onPress={a.onPress}
          disabled={a.disabled}
          style={[ab.btn, a.disabled && ab.disabled]}
          accessibilityRole="button"
          accessibilityLabel={a.label}
          accessibilityState={{ disabled: a.disabled }}
        >
          {a.icon && <View>{a.icon}</View>}
          <RNText style={ab.label}>{a.label}</RNText>
        </Pressable>
      ))}
    </View>
  );
}
ActionBar.displayName = 'ActionBar';

const ab = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: color.bg, borderRadius: radius.l, padding: space.xs, gap: space.xs, elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowOffset: { width: 0, height: 3 }, shadowRadius: 6 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.m, paddingVertical: space.s, borderRadius: radius.m, minHeight: tokens.minTouch, backgroundColor: color.primary },
  label: { fontSize: font.size.caption, color: color.onPrimary, fontFamily: 'NotoSansArabic_700Bold' },
  disabled: { opacity: 0.4 },
});

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------

export type StepState = 'completed' | 'active' | 'upcoming';

export interface Step {
  key: string;
  label: string;
  state: StepState;
}

export interface StepperProps {
  steps: Step[];
  testID?: string;
}

const stepColors: Record<StepState, { bg: string; fg: string; border: string }> = {
  completed: { bg: color.primary, fg: color.onPrimary, border: color.primary },
  active:    { bg: color.bg,      fg: color.primary,   border: color.primary },
  upcoming:  { bg: color.bg,      fg: color.textMuted, border: color.border  },
};

export function Stepper({ steps, testID }: StepperProps): ReactElement {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} testID={testID}>
      <View style={st.row}>
        {steps.map((step, i) => {
          const c = stepColors[step.state];
          return (
            <View key={step.key} style={st.stepWrap}>
              {i > 0 && <View style={[st.connector, step.state !== 'upcoming' && st.connectorActive]} />}
              <View style={[st.circle, { backgroundColor: c.bg, borderColor: c.border }]}>
                {step.state === 'completed'
                  ? <RNText style={[st.num, { color: c.fg }]}>{SYM_CHECK}</RNText>
                  : <RNText style={[st.num, { color: c.fg }]}>{i + 1}</RNText>}
              </View>
              <RNText style={[st.label, { color: c.fg }]} numberOfLines={2}>{step.label}</RNText>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
Stepper.displayName = 'Stepper';

const CIRCLE = 32;

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: space.m },
  stepWrap: { alignItems: 'center', width: 72 },
  connector: { position: 'absolute', top: CIRCLE / 2, width: 72, height: 2, backgroundColor: color.border, start: -36 },
  connectorActive: { backgroundColor: color.primary },
  circle: { width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, borderWidth: 2, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  num: { fontSize: font.size.caption, fontFamily: 'NotoSansArabic_700Bold' },
  label: { fontSize: 11, textAlign: 'center', marginTop: space.xs, maxWidth: 68 },
});

// ---------------------------------------------------------------------------
// CardCarousel
// ---------------------------------------------------------------------------

export interface CardCarouselProps {
  data: Array<{ key: string; content: ReactNode }>;
  cardWidth?: number;
  testID?: string;
}

export function CardCarousel({ data, cardWidth = 240, testID }: CardCarouselProps): ReactElement {
  return (
    <FlatList
      testID={testID}
      horizontal
      data={data}
      keyExtractor={(item) => item.key}
      showsHorizontalScrollIndicator={false}
      snapToInterval={cardWidth + space.m}
      decelerationRate="fast"
      contentContainerStyle={{ gap: space.m, paddingHorizontal: space.m }}
      renderItem={({ item }) => (
        <View style={[cc.card, { width: cardWidth }]}>{item.content}</View>
      )}
    />
  );
}
CardCarousel.displayName = 'CardCarousel';

const cc = StyleSheet.create({
  card: { backgroundColor: color.surface, borderRadius: radius.l, padding: space.m, overflow: 'hidden' },
});
