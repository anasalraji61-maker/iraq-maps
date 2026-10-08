import { jest } from '@jest/globals';

// The real MapCanvas needs MapLibre's native module. This stand-in renders the same testIDs (the map and its
// attribution, which MapCanvas always draws) and records its props for the tests.
jest.mock('@iraq-maps/map-kit', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
  const { OSM_ATTRIBUTION, testIDs } = jest.requireActual<typeof import('@iraq-maps/contracts')>('@iraq-maps/contracts');
  const attribution = createElement(Text, { testID: testIDs.map.attribution }, OSM_ATTRIBUTION);
  return { MapCanvas: jest.fn(() => createElement(View, { testID: testIDs.map.view }, attribution)) };
});

jest.mock('expo-location', () => ({ requestForegroundPermissionsAsync: jest.fn(), getCurrentPositionAsync: jest.fn(), Accuracy: { Balanced: 3 } }));

// One shared router: tests assert on router.push instead of mounting a navigator.
jest.mock('expo-router', () => {
  const router = { push: jest.fn() };
  return { useRouter: () => router, useLocalSearchParams: jest.fn(() => ({})), Stack: { Screen: () => null } };
});
