import { tokens } from '@iraq-maps/ui';

/** Navigator chrome in the app font and AA colors. */
export const stackOptions = { headerTitleStyle: { fontFamily: tokens.font.familyBold }, headerTintColor: tokens.color.text };
export const tabsOptions = {
  ...stackOptions,
  tabBarLabelStyle: { fontFamily: tokens.font.family },
  tabBarActiveTintColor: tokens.color.primary,
  tabBarInactiveTintColor: tokens.color.textMuted,
};
