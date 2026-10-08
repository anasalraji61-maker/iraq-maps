import type { ReactNode } from 'react';
import type { TextInputProps } from 'react-native';

type Base = { testID?: string };

export interface ScreenProps extends Base { children: ReactNode; scroll?: boolean }
export interface TextProps extends Base { children: ReactNode; variant?: 'title' | 'subtitle' | 'body' | 'caption'; tone?: 'default' | 'muted' | 'danger' }
export interface ButtonProps extends Base { label: string; onPress(): void; variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean; loading?: boolean }
export interface TextFieldProps extends Base {
  label: string;
  value: string;
  onChangeText(text: string): void;
  error?: string;
  placeholder?: string;
  /** phone-pad, number-pad, numeric, decimal-pad, email-address and url keep their content left-to-right in RTL layouts. */
  keyboardType?: TextInputProps['keyboardType'];
  autoFocus?: boolean;
  maxLength?: number;
}
export interface ListItemProps extends Base { title: string; subtitle?: string; onPress?(): void; trailing?: ReactNode }
export interface CardProps extends Base { children: ReactNode; onPress?(): void }
export interface SheetProps extends Base {
  visible: boolean;
  onClose(): void;
  children: ReactNode;
  /** Translated accessible name of the backdrop (e.g. "Close"). Without it only Android back closes the sheet for screen readers. */
  closeLabel?: string;
}
export interface BannerProps extends Base { kind: 'info' | 'success' | 'error'; message: string }
export interface EmptyStateProps extends Base { title: string; body?: string; action?: { label: string; onPress(): void } }
/** `icon` is a Google Material Symbols name, e.g. `settings`. */
export interface IconButtonProps extends Base { icon: string; accessibilityLabel: string; onPress(): void }
/** Decorative Material Symbols icon, hidden from screen readers. */
export interface IconProps extends Base { name: string; size?: number; color?: string }
