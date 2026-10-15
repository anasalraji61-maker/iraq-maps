import { jest } from '@jest/globals';

// AsyncStorage requires a native module; mock it for Jest.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
}));

// expo-store-review is a native module; mock it for Jest.
jest.mock('expo-store-review', () => ({
  isAvailableAsync: jest.fn(async () => false),
  requestReview: jest.fn(async () => undefined),
}));

// @react-native-community/netinfo requires a native module; mock it for Jest.
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));
