/**
 * FormAccessibility — ARIA-like helpers for React Native form elements.
 *
 * React Native does not have a DOM so there is no native ARIA.
 * This module provides the accessibility props that map to:
 *   - accessibilityLabel  (replaces the visual label for screen readers)
 *   - accessibilityHint   (describes what happens when the element is activated)
 *   - accessibilityRole   (maps to ARIA role)
 *   - accessibilityState  (maps to ARIA state properties)
 *   - accessibilityValue  (value text for sliders / progress bars)
 *
 * All returned objects are plain-object spreads: `<TextInput {...fieldProps(…)} />`
 */

import type { AccessibilityRole, AccessibilityState } from 'react-native';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FieldConfig {
  /** Human-readable label — the string the screen reader announces. */
  label: string;
  /** Short hint describing what the field does or its expected format. */
  hint?: string;
  /** Whether the field is required. Appended to the label when true. */
  required?: boolean;
  /** Whether the field has a validation error. */
  error?: boolean;
  /** Validation error message (announced after the label when set). */
  errorMessage?: string;
  /** Whether the field is disabled (read-only). */
  disabled?: boolean;
  /**
   * Current value — used for sliders and steppers.
   * Passed through to `accessibilityValue.text`.
   */
  value?: string;
}

export interface FieldGroup {
  /** Screen-reader label for the group container. */
  label: string;
  /** Short description of what the group contains. */
  hint?: string;
}

export type FormFieldProps = {
  accessible: true;
  accessibilityLabel: string;
  accessibilityHint?: string;
  accessibilityRole: AccessibilityRole;
  accessibilityState: AccessibilityState;
  accessibilityValue?: { text: string };
};

// ─── Field props ─────────────────────────────────────────────────────────────

/**
 * Returns accessibility props for a text input field.
 *
 * @example
 * <TextInput {...textFieldProps({ label: 'البريد الإلكتروني', required: true })} />
 */
export function textFieldProps(config: FieldConfig): FormFieldProps {
  return buildFieldProps('text', config);
}

/**
 * Returns accessibility props for a search field.
 */
export function searchFieldProps(config: FieldConfig): FormFieldProps {
  return buildFieldProps('search', config);
}

/**
 * Returns accessibility props for a password field.
 */
export function passwordFieldProps(config: FieldConfig): FormFieldProps {
  return buildFieldProps('text', { ...config, hint: config.hint ?? 'كلمة المرور' });
}

/**
 * Returns accessibility props for a button.
 */
export function buttonProps(config: Pick<FieldConfig, 'label' | 'hint' | 'disabled'>): FormFieldProps {
  return buildFieldProps('button', { ...config, required: false });
}

/**
 * Returns accessibility props for a checkbox.
 */
export function checkboxProps(
  config: FieldConfig & { checked: boolean },
): FormFieldProps & { accessibilityState: AccessibilityState & { checked: boolean } } {
  const base = buildFieldProps('checkbox', config);
  return {
    ...base,
    accessibilityState: { ...base.accessibilityState, checked: config.checked },
  };
}

/**
 * Returns accessibility props for a radio button.
 */
export function radioProps(
  config: FieldConfig & { selected: boolean },
): FormFieldProps & { accessibilityState: AccessibilityState & { selected: boolean } } {
  const base = buildFieldProps('radio', config);
  return {
    ...base,
    accessibilityState: { ...base.accessibilityState, selected: config.selected },
  };
}

/**
 * Returns accessibility props for a switch / toggle.
 */
export function switchProps(
  config: FieldConfig & { checked: boolean },
): FormFieldProps & { accessibilityState: AccessibilityState & { checked: boolean } } {
  const base = buildFieldProps('switch', config);
  return {
    ...base,
    accessibilityState: { ...base.accessibilityState, checked: config.checked },
  };
}

/**
 * Returns accessibility props for a slider or range input.
 */
export function sliderProps(
  config: FieldConfig & { min: number; max: number; current: number },
): FormFieldProps {
  const base = buildFieldProps('adjustable', config);
  return {
    ...base,
    accessibilityValue: { text: config.value ?? String(config.current) },
  };
}

/**
 * Returns accessibility props for a picker / dropdown.
 */
export function pickerProps(config: FieldConfig): FormFieldProps {
  return buildFieldProps('combobox', config);
}

/**
 * Returns accessibility props for a form group container (View).
 * Wrap a set of related fields with this so VoiceOver / TalkBack can
 * announce the group heading.
 */
export function groupProps(group: FieldGroup): {
  accessible: true;
  accessibilityRole: 'group';
  accessibilityLabel: string;
  accessibilityHint?: string;
} {
  return {
    accessible: true,
    accessibilityRole: 'group',
    accessibilityLabel: group.label,
    ...(group.hint ? { accessibilityHint: group.hint } : {}),
  };
}

// ─── Error announcement ───────────────────────────────────────────────────────

/**
 * Builds the accessibility label that includes the error message.
 * Appended to the field label when there is a validation error.
 * Returns undefined when there is no error.
 *
 * @example
 * const errLabel = errorLabel('البريد الإلكتروني', 'البريد غير صالح');
 * // → 'البريد الإلكتروني، خطأ: البريد غير صالح'
 */
export function errorLabel(fieldLabel: string, errorMessage: string): string {
  return `${fieldLabel}، خطأ: ${errorMessage}`;
}

/**
 * Returns the complete accessibility label for a field, including
 * required indicator and any error message.
 */
export function buildLabel(config: FieldConfig): string {
  let label = config.label;
  if (config.required) label += '، مطلوب';
  if (config.error && config.errorMessage) {
    label = errorLabel(label, config.errorMessage);
  }
  return label;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildFieldProps(role: AccessibilityRole, config: FieldConfig): FormFieldProps {
  const label = buildLabel(config);
  return {
    accessible: true,
    accessibilityLabel: label,
    ...(config.hint ? { accessibilityHint: config.hint } : {}),
    accessibilityRole: role,
    accessibilityState: {
      disabled: config.disabled ?? false,
    },
    ...(config.value !== undefined
      ? { accessibilityValue: { text: config.value } }
      : {}),
  };
}
