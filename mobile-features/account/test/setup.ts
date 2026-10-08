import { jest } from '@jest/globals';

// Screens navigate with expo-router; tests assert on these calls instead of mounting a navigator.
jest.mock('expo-router', () => {
  const router = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() };
  return { useRouter: () => router, useLocalSearchParams: jest.fn(() => ({})) };
});
