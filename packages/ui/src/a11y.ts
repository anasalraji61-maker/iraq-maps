// Non-visible enum props live outside JSX: the repo's i18next/no-literal-string rule (jsx-only) flags every string literal in JSX.
export const a11y = {
  button: { accessibilityRole: 'button' },
  header: { accessibilityRole: 'header' },
  alert: { accessibilityRole: 'alert', accessibilityLiveRegion: 'assertive' },
  polite: { accessibilityLiveRegion: 'polite' },
  hidden: { accessible: false, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' },
} as const;
