import type { ApiClient } from '@iraq-maps/api-client';
import type { Locale } from '@iraq-maps/contracts';
import type { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import type { RouteName, Session } from './index';

export interface RenderOptions {
  session?: Partial<Session>;
  api?: Partial<ApiClient>;
  locale?: Locale;
  availableRoutes?: readonly RouteName[];
}

/** RNTL render wrapped in session, API, i18n and available-routes providers. Import from '@iraq-maps/mobile-kit/testing'. */
export function renderWithProviders(_ui: ReactElement, _opts?: RenderOptions): ReturnType<typeof render> {
  throw new Error('not implemented');
}
