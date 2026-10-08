import type { RouteName } from '@iraq-maps/mobile-kit';
import { isProduction } from './config';

/** Screens with a delivered route file in apps/mobile/app. Buttons to anything else stay hidden (useRouteAvailable).
 * The map, discover, messages and activity tabs only show "coming soon" in M0, so they are not listed. */
export const availableRoutes = (): RouteName[] => [
  'account',
  'accountLanguage',
  'authPhone',
  'authOtp',
  'authName',
  ...(isProduction() ? [] : (['devSettings'] as const)),
];
