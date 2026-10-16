/**
 * RTL-safe primitives. All text comes from callers (already translated);
 * touch targets >= 48dp; AA contrast.
 */
export type { ErrorToastProps } from './components';
export type * from './types';
export { Badge, Banner, Button, Card, EmptyState, ErrorToast, IconButton, ListItem, PlaceSummaryCard, Screen, Sheet, Text, TextField } from './components';
export { ZoomableImage } from './ZoomableImage';
export { tokens, useUiFonts } from './tokens';
export { darkTheme, lightTheme, useTheme, useAppTheme, ThemeProvider } from './theme';
export type { Theme, ThemeMode } from './theme';

// Data Display Components
export {
  Accordion,
  DataTable,
  ProgressRing,
  StatCard,
  StatusBadge,
  Timeline,
  Tooltip,
} from './data-display';
export type {
  AccordionItem,
  AccordionProps,
  BadgeSize,
  BadgeVariant,
  DataTableColumn,
  DataTableProps,
  ProgressRingProps,
  StatCardProps,
  StatusBadgeProps,
  TimelineItem,
  TimelineProps,
  TooltipProps,
  TrendDirection,
} from './data-display';

// Form Components
export {
  DatePicker,
  MultiSelect,
  PhoneInput,
  PriceInput,
  RatingStars,
  TagInput,
  TimePicker,
} from './form-components';
export type {
  DatePickerProps,
  MultiSelectOption,
  MultiSelectProps,
  PhoneInputProps,
  PriceCurrency,
  PriceInputProps,
  RatingStarsProps,
  TagInputProps,
  TimePickerProps,
} from './form-components';

// Accessible Button
export { AccessibleButton } from './components/AccessibleButton';
export type { AccessibleButtonProps, ButtonVariant, ButtonSize } from './components/AccessibleButton';

// Layout Components
export {
  ActionBar,
  AppModal,
  BottomSheet,
  CardCarousel,
  SideDrawer,
  Stepper,
} from './layout-components';
export type {
  ActionBarItem,
  ActionBarProps,
  AppModalProps,
  BottomSheetProps,
  CardCarouselProps,
  ModalSize,
  SideDrawerProps,
  SnapPoint,
  Step,
  StepperProps,
  StepState,
} from './layout-components';

// ── New component library ────────────────────────────────────────────────────

// ArabicText
export {
  ArabicText,
  ArabicTitle,
  ArabicSubtitle,
  ArabicCaption,
  ArabicNumber,
  containsArabic,
  containsHebrew,
  detectDirection,
  toArabicIndic,
  fromArabicIndic,
  resolveNumerals,
} from './components/ArabicText';
export type { ArabicTextProps, ArabicTextVariant, ArabicTextTone, ArabicTextWeight } from './components/ArabicText';

// DateTimePicker
export {
  DateTimePicker,
  toHijri,
  baghdadNow,
  GREGORIAN_MONTHS_AR,
  HIJRI_MONTHS_AR,
  DAYS_AR,
} from './components/DateTimePicker';
export type {
  DateTimePickerProps,
  CalendarMode,
  PickerMode,
  HijriDate,
} from './components/DateTimePicker';

// StarRating
export { StarRating } from './components/StarRating';
export type { StarRatingProps, StarSize } from './components/StarRating';

// MapPreview
export { MapPreview } from './components/MapPreview';
export type { MapPreviewProps } from './components/MapPreview';

// PriceDisplay
export { PriceDisplay, formatIQD, formatThousands } from './components/PriceDisplay';
export type { PriceDisplayProps, PriceState, PriceSize } from './components/PriceDisplay';

// PhoneNumber
export { PhoneNumber, formatIraqPhone, toE164 } from './components/PhoneNumber';
export type { PhoneNumberProps, PhoneAction } from './components/PhoneNumber';

// VerifiedBadge
export { VerifiedBadge } from './components/VerifiedBadge';
export type { VerifiedBadgeProps, VerifiedBadgeSize } from './components/VerifiedBadge';

// LoadingSpinner
export { LoadingSpinner } from './components/LoadingSpinner';
export type { LoadingSpinnerProps, SpinnerVariant, SpinnerSize } from './components/LoadingSpinner';

// EnhancedEmptyState
export { EnhancedEmptyState } from './components/EnhancedEmptyState';
export type { EnhancedEmptyStateProps, EmptyStateVariant, EmptyStateAction } from './components/EnhancedEmptyState';

// Toast
export {
  ToastProvider,
  useToast,
  toast,
  _registerGlobalToast,
} from './components/Toast';
export type { ToastItem, ToastVariant } from './components/Toast';

// ── Hooks ────────────────────────────────────────────────────────────────────

export { useHaptic } from './hooks/useHaptic';
export type { HapticControls } from './hooks/useHaptic';

export { useDebounce, useDebounceCallback, useIsDebouncing } from './hooks/useDebounce';

export { useThrottle, useThrottleCallback, useThrottleTrailing } from './hooks/useThrottle';

export { useKeyboard, useAvoidKeyboard } from './hooks/useKeyboard';
export type { KeyboardState } from './hooks/useKeyboard';

export { useLocation, BAGHDAD_CENTER } from './hooks/useLocation';
export type { LocationState, Coordinates, PermissionStatus } from './hooks/useLocation';

export { usePullToRefresh } from './hooks/usePullToRefresh';
export type { PullToRefreshOptions, PullToRefreshResult } from './hooks/usePullToRefresh';

export { useInfiniteScroll } from './hooks/useInfiniteScroll';
export type { InfiniteScrollOptions, InfiniteScrollResult, PageResult } from './hooks/useInfiniteScroll';

export { useShare } from './hooks/useShare';
export type { UseShareResult, ShareContent, ShareResult } from './hooks/useShare';
