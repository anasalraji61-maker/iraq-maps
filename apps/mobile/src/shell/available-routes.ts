import type { RouteName } from '@iraq-maps/mobile-kit';
import { isProduction } from './config';

/** Screens with a delivered route file in apps/mobile/app. Buttons to anything else stay hidden (useRouteAvailable).
 * The discover, messages and activity tabs only show "coming soon". */
export const availableRoutes = (): RouteName[] => [
  'map',
  'account',
  'accountLanguage',
  'authPhone',
  'authOtp',
  'authName',
  'place',
  ...(isProduction() ? [] : (['devSettings'] as const)),
];
