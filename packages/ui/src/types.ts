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
  keyboardType?: TextInputProps['keyboardType'];
  autoFocus?: boolean;
  maxLength?: number;
  /** 'ltr' for phone numbers, codes and URLs: keeps `0770 123 4567` in order inside an RTL layout. */
  direction?: 'ltr';
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
}
export interface ListItemProps extends Base {
  title: string;
  subtitle?: string;
  onPress?(): void;
  trailing?: ReactNode;
  /** On a pressable row: exposes it as a radio option, checked when true (e.g. the language list). */
  selected?: boolean;
  /** On a pressable row: dims it and ignores presses (e.g. while a choice is being saved). */
  disabled?: boolean;
}
/** A small outlined label, e.g. the data source of a place. */
export interface BadgeProps extends Base { label: string }
/** One place in a list (search results and later Discover/assistant). Every text arrives translated and formatted. */
export interface PlaceSummaryCardProps extends Base {
  name: string;
  /** The category label, or the kind for streets and areas. */
  category?: string;
  /** The neighbourhood. */
  area?: string;
  /** Already formatted for the locale, e.g. "١٫٢ كم". */
  distance?: string;
  /** The source badge, e.g. "OpenStreetMap". */
  source?: string;
  onPress(): void;
}
export interface CardProps extends Base { children: ReactNode; onPress?(): void }
export interface SheetProps extends Base { visible: boolean; onClose(): void; children: ReactNode }
export interface BannerProps extends Base { kind: 'info' | 'success' | 'error'; message: string }
export interface EmptyStateProps extends Base { title: string; body?: string; action?: { label: string; onPress(): void } }
export interface IconButtonProps extends Base { icon: string; accessibilityLabel: string; onPress(): void }

export interface Tokens {
  color: Record<'bg' | 'surface' | 'text' | 'textMuted' | 'primary' | 'onPrimary' | 'danger' | 'border', string>;
  space: Record<'xs' | 's' | 'm' | 'l' | 'xl', number>;
  radius: Record<'s' | 'm' | 'l', number>;
  font: { family: string; size: Record<'caption' | 'body' | 'subtitle' | 'title', number> };
  minTouch: 48;
}
