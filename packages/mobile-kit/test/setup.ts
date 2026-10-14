import { jest } from '@jest/globals';

// AsyncStorage requires a native module; mock it for Jest.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
}));
