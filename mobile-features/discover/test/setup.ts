import { jest } from '@jest/globals';

jest.mock('expo-router', () => {
  const router = { push: jest.fn(), back: jest.fn() };
  return {
    useRouter: () => router,
    useLocalSearchParams: jest.fn(() => ({ postId: 'post-uuid-1234-5678-abcd-ef0123456789' })),
    Stack: { Screen: () => null },
  };
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
}));
