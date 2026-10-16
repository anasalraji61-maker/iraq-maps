/**
 * AccessibilityWrapper — wraps any React Native component with computed
 * accessibility props derived from its semantic role and content.
 *
 * Usage:
 *   <AccessibilityWrapper role="button" label={t('common:ok')} onPress={…}>
 *     <Pressable>…</Pressable>
 *   </AccessibilityWrapper>
 *
 * The wrapper infers a reasonable `accessibilityHint` when one is not given,
 * and automatically surfaces errors, disabled state and loading state.
 */

import React from 'react';
import { View, type AccessibilityRole, type ViewStyle } from 'react-native';

// ─── Types ───────────────────────────────────────────────────────────────────

export type WrapperRole =
  | 'button'
  | 'link'
  | 'image'
  | 'text'
  | 'header'
  | 'tab'
  | 'menu'
  | 'menuitem'
  | 'list'
  | 'listitem'
  | 'checkbox'
  | 'radio'
  | 'switch'
  | 'slider'
  | 'search'
  | 'combobox'
  | 'alert'
  | 'none';

export interface AccessibilityWrapperProps {
  /** The semantic role of this element. */
  role: WrapperRole;
  /** Human-readable label announced by the screen reader. */
  label: string;
  /** Short hint describing what happens on activation. Auto-generated when omitted. */
  hint?: string;
  /** Whether the element is disabled. */
  disabled?: boolean;
  /** Whether the element is currently loading (announced as "جار التحميل"). */
  loading?: boolean;
  /** Whether the element is selected (tabs, radio buttons, etc.). */
  selected?: boolean;
  /** Whether the element is checked (checkboxes, switches). */
  checked?: boolean;
  /** Whether the element has a validation error. */
  error?: boolean;
  /** Error message to append to the label. */
  errorMessage?: string;
  /** Override style on the wrapping View. */
  style?: ViewStyle;
  children: React.ReactNode;
}

// ─── Default hints by role ───────────────────────────────────────────────────

const DEFAULT_HINTS: Partial<Record<WrapperRole, string>> = {
  button: 'انقر للتفعيل',
  link: 'انقر لفتح الرابط',
  checkbox: 'انقر للتحديد أو إلغاء التحديد',
  radio: 'انقر للاختيار',
  switch: 'انقر للتبديل',
  tab: 'انقر لفتح هذا التبويب',
  menuitem: 'انقر لاختيار هذا العنصر',
  combobox: 'انقر لفتح قائمة الاختيارات',
  search: 'أدخل نصًا للبحث',
  slider: 'اسحب لضبط القيمة',
};

// ─── Role mapping ─────────────────────────────────────────────────────────────

const RN_ROLE_MAP: Record<WrapperRole, AccessibilityRole> = {
  button: 'button',
  link: 'link',
  image: 'image',
  text: 'text',
  header: 'header',
  tab: 'tab',
  menu: 'menu',
  menuitem: 'menuitem',
  list: 'list',
  listitem: 'none', // React Native has no 'listitem' role; none is closest
  checkbox: 'checkbox',
  radio: 'radio',
  switch: 'switch',
  slider: 'adjustable',
  search: 'search',
  combobox: 'combobox',
  alert: 'alert',
  none: 'none',
};

// ─── Component ───────────────────────────────────────────────────────────────

export function AccessibilityWrapper({
  role,
  label,
  hint,
  disabled = false,
  loading = false,
  selected,
  checked,
  error = false,
  errorMessage,
  style,
  children,
}: AccessibilityWrapperProps): React.ReactElement {
  // Build the final label, appending error and loading state.
  let finalLabel = label;
  if (loading) {
    finalLabel = `${label}، جار التحميل`;
  } else if (error && errorMessage) {
    finalLabel = `${label}، خطأ: ${errorMessage}`;
  }

  const finalHint = hint ?? DEFAULT_HINTS[role];

  // Build accessibilityState.
  const state: Record<string, boolean | undefined> = { disabled };
  if (selected !== undefined) state.selected = selected;
  if (checked !== undefined) state.checked = checked;
  if (loading) state.busy = true;

  return (
    <View
      accessible
      accessibilityRole={RN_ROLE_MAP[role]}
      accessibilityLabel={finalLabel}
      accessibilityHint={finalHint}
      accessibilityState={state}
      style={style}
    >
      {children}
    </View>
  );
}
