import { jest } from '@jest/globals';

// MapLibre's native module cannot load in Jest: map-kit's mock renders the real MapCanvas on host views.
jest.mock('@maplibre/maplibre-react-native', () => jest.requireActual('@iraq-maps/map-kit/jest-mock'));

jest.mock('expo-location', () => ({ requestForegroundPermissionsAsync: jest.fn(), getCurrentPositionAsync: jest.fn(), Accuracy: { Balanced: 3 } }));

// One shared router: tests assert on router.push instead of mounting a navigator.
jest.mock('expo-router', () => {
  const router = { push: jest.fn() };
  return { useRouter: () => router, useLocalSearchParams: jest.fn(() => ({})), Stack: { Screen: () => null } };
});
