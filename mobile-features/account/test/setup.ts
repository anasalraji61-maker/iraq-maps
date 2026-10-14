import { jest } from '@jest/globals';

// Screens navigate with expo-router; tests assert on these calls instead of mounting a navigator.
jest.mock('expo-router', () => {
  const router = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() };
  return { useRouter: () => router, useLocalSearchParams: jest.fn(() => ({})), Stack: { Screen: () => null } };
});

// AsyncStorage is used by the messaging outbox; mock it so account tests don't fail on the native module.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiSet: jest.fn(() => Promise.resolve()),
  multiRemove: jest.fn(() => Promise.resolve()),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  clear: jest.fn(() => Promise.resolve()),
}));
