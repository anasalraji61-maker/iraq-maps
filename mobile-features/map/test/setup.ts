import { jest } from '@jest/globals';

// MapLibre's native module cannot load in Jest: map-kit's mock renders the real MapCanvas on host views.
jest.mock('@maplibre/maplibre-react-native', () => jest.requireActual('@iraq-maps/map-kit/jest-mock'));

// AsyncStorage is a native module; it requires a mock in Jest.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
}));

jest.mock('expo-location', () => ({ requestForegroundPermissionsAsync: jest.fn(), getCurrentPositionAsync: jest.fn(), Accuracy: { Balanced: 3 } }));

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
    addEventListener: jest.fn(() => () => undefined),
  },
}));

// One shared router: tests assert on router.push instead of mounting a navigator.
jest.mock('expo-router', () => {
  const router = { push: jest.fn() };
  return { useRouter: () => router, useLocalSearchParams: jest.fn(() => ({})), Stack: { Screen: () => null } };
});
