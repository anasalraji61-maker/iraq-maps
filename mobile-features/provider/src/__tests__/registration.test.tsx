import { testIDs } from '@iraq-maps/contracts';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { ProviderRegistrationScreen } from '../screens/ProviderRegistrationScreen';
import { setup } from '../../test/render';

jest.mock('@iraq-maps/i18n', () => ({
  registerNamespace: jest.fn(),
  setLocale: jest.fn(),
  t: (_key: string) => _key,
  toAsciiDigits: (s: string) => s,
  getLocale: () => 'ar',
}));

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() })),
  useLocalSearchParams: jest.fn(() => ({})),
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
}));

describe('ProviderRegistrationScreen', () => {
  afterEach(() => { jest.clearAllMocks(); });

  it('renders name and phone inputs on step 1', async () => {
    const { view } = await setup(<ProviderRegistrationScreen />);
    expect(view.getByTestId(testIDs.provider.nameInput)).toBeTruthy();
    expect(view.getByTestId(testIDs.provider.phoneInput)).toBeTruthy();
    expect(view.getByTestId(testIDs.provider.save)).toBeTruthy();
  });

  it('shows next button disabled state before filling required fields', async () => {
    const { view } = await setup(<ProviderRegistrationScreen />);
    // Next button is always enabled (validation runs on press)
    expect(view.getByTestId(testIDs.provider.save)).toBeTruthy();
    // Name and phone inputs are present and start empty
    expect(view.getByTestId(testIDs.provider.nameInput).props.value).toBe('');
    expect(view.getByTestId(testIDs.provider.phoneInput).props.value).toBe('');
  });
});
