/**
 * M74: Dark mode / appearance selector.
 * Lets the user pick system default, light, or dark theme.
 */
import { type ThemeMode, useAppTheme } from '@iraq-maps/ui';
import { ListItem, Screen } from '@iraq-maps/ui';
import { type ReactElement } from 'react';
import { ScreenTitle } from './ScreenTitle';
import { t } from './strings';

const MODES: { value: ThemeMode; labelKey: 'theme.system' | 'theme.light' | 'theme.dark' }[] = [
  { value: 'system', labelKey: 'theme.system' },
  { value: 'light', labelKey: 'theme.light' },
  { value: 'dark', labelKey: 'theme.dark' },
];

export function ThemeScreen(): ReactElement {
  const { mode, setMode } = useAppTheme();

  return (
    <Screen scroll testID="theme-screen">
      <ScreenTitle title={t('theme.title')} />
      {MODES.map(({ value, labelKey }) => (
        <ListItem
          key={value}
          title={t(labelKey)}
          selected={mode === value}
          onPress={() => setMode(value)}
          testID={`theme-option-${value}`}
        />
      ))}
    </Screen>
  );
}
