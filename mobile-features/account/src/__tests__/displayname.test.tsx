/**
 * Tests for DisplayNameScreen.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

const mockUpdate = jest.fn();
const mockBack = jest.fn();

jest.mock('@iraq-maps/mobile-kit', () => ({
  useApi: jest.fn(() => ({
    me: {
      update: mockUpdate,
    },
  })),
  useSession: jest.fn(() => ({
    state: {
      status: 'signedIn',
      user: { name: 'Existing Name', id: 'user-1' },
    },
    updateUser: jest.fn(),
  })),
}));

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({ back: mockBack })),
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
  const { View, Text: RNText, TextInput, TouchableOpacity } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Button: ({ label, onPress, disabled, loading }: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean }) =>
      <TouchableOpacity onPress={onPress} disabled={disabled || loading} testID="save-btn"><RNText>{label}</RNText></TouchableOpacity>,
    Screen: View,
    Text: RNText,
    TextField: ({ label: _l, value, onChangeText, maxLength }: { label: string; value: string; onChangeText: (v: string) => void; error?: string | null; maxLength?: number }) =>
      <TextInput value={value} onChangeText={onChangeText} maxLength={maxLength} testID="name-input" />,
  };
});

jest.mock('../ScreenTitle', () => ({
  ScreenTitle: () => null,
}));

jest.mock('../request', () => ({
  expectStatus: (_res: unknown, _status: number) => _res,
  useRequest: jest.fn(() => ({
    busy: false,
    error: null,
    run: jest.fn((fn: () => Promise<void>) => fn()),
  })),
}));

jest.mock('../strings', () => ({
  t: (key: string) => key,
}));

import { DisplayNameScreen } from '../DisplayNameScreen';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('DisplayNameScreen', () => {
  it('renders with existing name pre-filled', async () => {
    await act(async () => {
      render(<DisplayNameScreen />);
    });
    const input = screen.getByTestId('name-input');
    expect(input.props.value).toBe('Existing Name');
  });

  it('save button is disabled when name is empty', async () => {
    await act(async () => {
      render(<DisplayNameScreen />);
    });

    const input = screen.getByTestId('name-input');
    await act(async () => { fireEvent.changeText(input, ''); });

    const btn = screen.getByTestId('save-btn');
    // disabled or accessibilityState.disabled indicates button is not pressable
    expect(btn.props.disabled || btn.props.accessibilityState?.disabled).toBeTruthy();
  });

  it('save button is enabled when name is not empty', async () => {
    await act(async () => {
      render(<DisplayNameScreen />);
    });

    const input = screen.getByTestId('name-input');
    await act(async () => { fireEvent.changeText(input, 'New Name'); });

    const btn = screen.getByTestId('save-btn');
    expect(btn.props.disabled).toBeFalsy();
  });

  it('calls api.me.update on save', async () => {
    mockUpdate.mockResolvedValue({ status: 200, body: { name: 'New Name' } } as never);

    await act(async () => {
      render(<DisplayNameScreen />);
    });

    const input = screen.getByTestId('name-input');
    await act(async () => { fireEvent.changeText(input, 'New Name'); });

    const btn = screen.getByTestId('save-btn');
    await act(async () => { fireEvent.press(btn); });

    expect(mockUpdate).toHaveBeenCalledWith({ body: { name: 'New Name' } });
  });

  it('renders without crash when user is signed out', async () => {
    const { useSession } = jest.requireMock('@iraq-maps/mobile-kit') as { useSession: jest.Mock };
    useSession.mockReturnValue({
      state: { status: 'signedOut' },
      updateUser: jest.fn(),
    });

    await act(async () => {
      render(<DisplayNameScreen />);
    });

    const input = screen.getByTestId('name-input');
    expect(input.props.value).toBe('');
  });
});
