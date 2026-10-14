import { jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-router', () => {
  const router = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() };
  return { useRouter: () => router, useLocalSearchParams: jest.fn(() => ({})), Stack: { Screen: () => null } };
});
