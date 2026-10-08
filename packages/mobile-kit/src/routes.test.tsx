import { describe, expect, it } from '@jest/globals';
import { Text } from 'react-native';
import { href, useRouteAvailable, type RouteName } from './index';
import { renderWithProviders } from './testing';

function Probe({ name }: { name: RouteName }) {
  return <Text testID={name}>{String(useRouteAvailable(name))}</Text>;
}

describe('routes', () => {
  it('href fills and encodes params', () => {
    expect(href('map')).toBe('/');
    expect(href('place', { placeId: 'p 1/x' })).toBe('/place/p%201%2Fx');
    expect(href('messageThread', { requestId: 'r9' })).toBe('/messages/r9');
  });

  it('useRouteAvailable reflects the delivered routes', async () => {
    const screen = await renderWithProviders(
      <>
        <Probe name="account" />
        <Probe name="devSettings" />
      </>,
      { availableRoutes: ['account'] },
    );
    expect(screen.getByTestId('account')).toHaveTextContent('true');
    expect(screen.getByTestId('devSettings')).toHaveTextContent('false');
  });
});
