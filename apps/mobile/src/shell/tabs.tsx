import { testIDs } from '@iraq-maps/contracts';
import { t } from '@iraq-maps/i18n';
import { routes, useLocale } from '@iraq-maps/mobile-kit';
import { EmptyState, Icon, Screen } from '@iraq-maps/ui';
import { usePathname, useSegments } from 'expo-router';
import { Tabs, type BottomTabNavigationOptions } from 'expo-router/js-tabs';
import type { ReactElement } from 'react';
import { DevSettingsButton } from './dev-settings';
import { tabsOptions } from './navigation';
import './strings';

/** Route file under app/(tabs), typed route name and Material Symbols icon of each tab, in tab-bar order. */
const TABS = [
  { file: 'index', route: 'map', icon: 'map' },
  { file: 'discover', route: 'discover', icon: 'explore' },
  { file: 'messages', route: 'messages', icon: 'forum' },
  { file: 'activity', route: 'activity', icon: 'history' },
  { file: 'account', route: 'account', icon: 'person' },
] as const;

function tabOptions({ route, icon }: (typeof TABS)[number]): BottomTabNavigationOptions {
  const label = t(`shell:tabs.${route}`);
  return {
    title: label,
    tabBarAccessibilityLabel: label,
    tabBarButtonTestID: testIDs.tabs[route],
    tabBarIcon: ({ focused, size }) => (
      <Icon name={icon} size={size} color={focused ? tabsOptions.tabBarActiveTintColor : tabsOptions.tabBarInactiveTintColor} />
    ),
    headerRight: route === 'account' ? () => <DevSettingsButton /> : undefined,
  };
}

/** app/(tabs)/_layout.tsx. Labels re-render on every locale change. */
export function TabsLayout(): ReactElement {
  useLocale();
  // Deeper in a tab's own stack (e.g. /account/language) that stack's header, with its back button, replaces the tab header.
  const nested = useSegments().length > 2;
  return (
    <Tabs screenOptions={{ ...tabsOptions, headerShown: !nested }}>
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.file} name={tab.file} options={tabOptions(tab)} />
      ))}
    </Tabs>
  );
}

/** Empty state for a tab whose feature is not delivered yet. */
export function PendingScreen(): ReactElement {
  useLocale();
  const pathname = usePathname();
  const { route } = TABS.find((tab) => routes[tab.route] === pathname) ?? TABS[0];
  return (
    <Screen>
      <EmptyState title={t(`shell:pending.${route}.title`)} body={t(`shell:pending.${route}.body`)} />
    </Screen>
  );
}
