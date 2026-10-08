import type { RouteName } from '@iraq-maps/mobile-kit';
import { devToolsEnabled } from './server-url';

const delivered: readonly RouteName[] = ['map', 'discover', 'messages', 'activity', 'account', 'accountLanguage', 'authPhone', 'authOtp', 'authName'];

/** Screens this build has; useRouteAvailable() hides every action that leads anywhere else. Extended each milestone. */
export const availableRoutes = (): readonly RouteName[] => (devToolsEnabled() ? [...delivered, 'devSettings'] : delivered);
