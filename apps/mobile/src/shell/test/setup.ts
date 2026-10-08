import { beforeEach, jest } from '@jest/globals';
import { setLocale } from '@iraq-maps/i18n';
import { I18nManager } from 'react-native';

// Every shell test starts in Arabic on a native layout that is already RTL, with an empty in-memory expo-secure-store
// and a reloadAppAsync that only records the call.
const mockSecureStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  __esModule: true,
  getItemAsync: (key: string) => Promise.resolve(mockSecureStore.get(key) ?? null),
  setItemAsync: (key: string, value: string) => Promise.resolve(void mockSecureStore.set(key, value)),
  deleteItemAsync: (key: string) => Promise.resolve(void mockSecureStore.delete(key)),
}));
jest.mock('expo', () => ({ ...jest.requireActual<object>('expo'), reloadAppAsync: jest.fn(() => Promise.resolve()) }));

beforeEach(() => {
  mockSecureStore.clear();
  jest.clearAllMocks();
  jest.restoreAllMocks();
  setLocale('ar');
  jest.replaceProperty(I18nManager, 'isRTL', true);
});
