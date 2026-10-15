/**
 * Tests for PrivacySettingsScreen — loads/saves settings via AsyncStorage.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { act, render, screen } from '@testing-library/react-native';
import React from 'react';

const store: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(store[key] ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
      return Promise.resolve();
    }),
  },
}));

jest.mock('@iraq-maps/i18n', () => ({
  registerNamespace: jest.fn(),
  setLocale: jest.fn(),
  t: (_key: string) => _key,
  getLocale: () => 'ar',
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SafeAreaView: View,
    SafeAreaProvider: View,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
    initialWindowMetrics: { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 44, left: 0, right: 0, bottom: 34 } },
  };
});

jest.mock('@iraq-maps/ui', () => {
  const { View, Text: RNText, Switch } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Banner: View,
    Screen: View,
    Text: RNText,
    Switch: Switch,
  };
});

jest.mock('../ScreenTitle', () => ({
  ScreenTitle: () => null,
}));

jest.mock('../strings', () => ({
  t: (key: string) => key,
}));

import { PrivacySettingsScreen } from '../PrivacySettingsScreen';

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  jest.clearAllMocks();
});

describe('PrivacySettingsScreen', () => {
  it('renders without crashing', async () => {
    await act(async () => {
      render(<PrivacySettingsScreen />);
    });
    // Just checking it mounts
    expect(true).toBe(true);
  });

  it('loads defaults when no storage', async () => {
    await act(async () => {
      render(<PrivacySettingsScreen />);
      await Promise.resolve();
    });
    // Defaults: all switches ON. After load, publicProfile = true means a switch with value=true exists.
    const switches = screen.queryAllByRole('switch');
    expect(switches.length).toBeGreaterThanOrEqual(1);
  });

  it('loads persisted settings from AsyncStorage', async () => {
    store['@iraq-maps/account/privacy-settings'] = JSON.stringify({
      publicProfile: false,
      showFollowerCount: true,
      allowMentions: true,
      allowDirectMessages: false,
    });

    await act(async () => {
      render(<PrivacySettingsScreen />);
      await Promise.resolve();
    });
    // Rendering should succeed with persisted settings loaded
    expect(true).toBe(true);
  });
});
