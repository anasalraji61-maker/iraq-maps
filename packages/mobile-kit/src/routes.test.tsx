import { describe, expect, it } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AvailableRoutesProvider, href, useRouteAvailable } from './index';

describe('href', () => {
  it('returns static paths as-is and fills [param] segments', () => {
    expect(href('map')).toBe('/');
    expect(href('accountLanguage')).toBe('/account/language');
    expect(href('place', { placeId: 'osm-n123' })).toBe('/place/osm-n123');
    expect(href('providerRequest', { requestId: 'r1' })).toBe('/provider/inbox/r1');
  });

  it('encodes param values', () => {
    expect(href('messageThread', { requestId: 'a/b ق?' })).toBe('/messages/a%2Fb%20%D9%82%3F');
  });

  it('throws when a required param is missing', () => {
    expect(() => href('discoverPost')).toThrow('href(\'discoverPost\') needs the "postId" param');
  });
});

describe('useRouteAvailable', () => {
  it('hides every route without a provider', async () => {
    const { result } = await renderHook(() => useRouteAvailable('map'));
    expect(result.current).toBe(false);
  });

  it('shows only the routes the shell delivered', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => <AvailableRoutesProvider routes={['map', 'account']}>{children}</AvailableRoutesProvider>;
    const { result } = await renderHook(() => [useRouteAvailable('account'), useRouteAvailable('assistant')], { wrapper });
    expect(result.current).toEqual([true, false]);
  });
});
