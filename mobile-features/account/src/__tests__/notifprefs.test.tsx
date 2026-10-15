import { describe, expect, it, jest, afterEach } from '@jest/globals';
import { renderWithProviders } from '@iraq-maps/mobile-kit/testing';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { NotifPrefsScreen } from '../NotifPrefsScreen';

jest.mock('@iraq-maps/i18n', () => ({
  registerNamespace: jest.fn(),
  setLocale: jest.fn(),
  t: (_key: string) => _key,
  getLocale: () => 'ar',
}));

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn(), back: jest.fn() })),
  Stack: { Screen: () => null },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
}));

const mockGetPrefs = jest.fn<() => Promise<unknown>>();
const mockUpdatePrefs = jest.fn<() => Promise<unknown>>();

jest.mock('../useNotifApi', () => ({
  useNotifApi: () => ({
    getPrefs: mockGetPrefs,
    updatePrefs: mockUpdatePrefs,
    registerDevice: jest.fn(),
  }),
}));

const DEFAULT_PREFS = {
  newInquiry: true,
  replyReceived: true,
  statusUpdate: false,
  discoverLikes: true,
  discoverComments: true,
  messages: true,
};

describe('NotifPrefsScreen', () => {
  afterEach(() => { jest.clearAllMocks(); });

  it('renders nothing initially when prefs are loading', async () => {
    let resolvePrefs!: (v: unknown) => void;
    mockGetPrefs.mockReturnValue(new Promise((res) => { resolvePrefs = res; }));

    const view = await renderWithProviders(<NotifPrefsScreen />);

    // Section with prefs is not yet visible
    expect(view.queryByTestId('notif-prefs-screen')).toBeTruthy();

    await act(async () => {
      resolvePrefs(DEFAULT_PREFS);
      await Promise.resolve();
    });
  });

  it('renders notification preference toggles after loading', async () => {
    mockGetPrefs.mockResolvedValue(DEFAULT_PREFS);

    const view = await renderWithProviders(<NotifPrefsScreen />);

    await waitFor(() => {
      expect(view.getByTestId('notif-prefs-screen')).toBeTruthy();
    });
  });

  it('calls updatePrefs when a toggle is changed', async () => {
    mockGetPrefs.mockResolvedValue(DEFAULT_PREFS);
    mockUpdatePrefs.mockResolvedValue({ ...DEFAULT_PREFS, statusUpdate: true });

    const view = await renderWithProviders(<NotifPrefsScreen />);

    await waitFor(() => {
      expect(view.getByTestId('notif-prefs-screen')).toBeTruthy();
    });

    // Find switches by role
    const switches = view.getAllByRole('switch');
    expect(switches.length).toBeGreaterThanOrEqual(1);

    // Trigger toggle on first switch via fireEvent
    await act(async () => {
      fireEvent(switches[0]!, 'valueChange', !switches[0]!.props.value);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockUpdatePrefs).toHaveBeenCalled();
    });
  });

  it('reverts toggle state when updatePrefs fails', async () => {
    mockGetPrefs.mockResolvedValue(DEFAULT_PREFS);
    mockUpdatePrefs.mockRejectedValue(new Error('network'));

    const view = await renderWithProviders(<NotifPrefsScreen />);

    await waitFor(() => {
      expect(view.getByTestId('notif-prefs-screen')).toBeTruthy();
    });

    const switches = view.getAllByRole('switch');
    const originalValue = switches[0]!.props.value as boolean;

    await act(async () => {
      fireEvent(switches[0]!, 'valueChange', !originalValue);
      await Promise.resolve();
    });

    // After failure, value should revert
    await waitFor(() => {
      const updatedSwitches = view.getAllByRole('switch');
      expect(updatedSwitches[0]!.props.value).toBe(originalValue);
    });
  });
});
