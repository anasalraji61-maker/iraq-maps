import type { RouteName } from '@iraq-maps/mobile-kit';
import { isProduction } from './config';

/** Screens with a delivered route file in apps/mobile/app. Buttons to anything else stay hidden (useRouteAvailable). */
export const availableRoutes = (): RouteName[] => [
  'map',
  'account',
  'accountLanguage',
  'accountSettings',
  'accountNotifPrefs',
  'accountPrivacySettings',
  'accountDisplayName',
  'accountTheme',
  'accountSavedPlaces',
  'authPhone',
  'authOtp',
  'authName',
  'place',
  'routePreview',
  'navigation',
  'assistant',
  'discover',
  'discoverPost',
  'discoverNewPost',
  'messages',
  'messageCompose',
  'messageThread',
  'activity',
  'providerRegister',
  'providerInbox',
  'providerRequest',
  ...(isProduction() ? [] : (['devSettings'] as const)),
];
