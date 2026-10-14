// Jest setup for the mobile app shell.
// Regular jest.mock calls here ARE hoisted by babel-jest (unlike jest.mock from @jest/globals).
/* eslint-disable @typescript-eslint/no-require-imports */

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
    multiGet: jest.fn(async () => []),
    multiSet: jest.fn(async () => undefined),
    multiRemove: jest.fn(async () => undefined),
    clear: jest.fn(async () => undefined),
    getAllKeys: jest.fn(async () => []),
  },
}));

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(() => jest.fn()),
    fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
  },
  useNetInfo: jest.fn(() => ({ isConnected: true, isInternetReachable: true })),
  NetInfoStateType: { none: 'none', unknown: 'unknown', cellular: 'cellular', wifi: 'wifi' },
}));
