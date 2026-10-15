import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { render } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockSavedList = jest.fn<() => Promise<any>>();
const mockSavedRemove = jest.fn<() => Promise<void>>();

jest.mock('@iraq-maps/mobile-kit', () => ({
  savedPlaces: {
    list: () => mockSavedList(),
    remove: (id: string) => (mockSavedRemove as (id: string) => Promise<void>)(id),
  },
  href: (_name: string, params?: Record<string, string>) =>
    params ? `/${Object.values(params).join('/')}` : `/${_name}`,
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

import { SavedPlacesScreen } from '../SavedPlacesScreen';

const PLACES = [
  { placeId: 'p1', name: 'مطعم البيت', category: 'مطاعم', savedAt: '2024-01-15T10:00:00Z' },
  { placeId: 'p2', name: 'متحف الموصل', savedAt: '2024-02-01T08:00:00Z' },
];

function renderScreen() {
  return render(
    <SafeAreaProvider>
      <SavedPlacesScreen />
    </SafeAreaProvider>,
  );
}

describe('SavedPlacesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSavedRemove.mockResolvedValue(undefined);
  });

  it('shows empty state when no saved places', async () => {
    mockSavedList.mockResolvedValue([]);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('saved-places-screen')).toBeTruthy();
    });
  });

  it('renders saved places list', async () => {
    mockSavedList.mockResolvedValue(PLACES);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText('مطعم البيت')).toBeTruthy();
      expect(screen.getByText('متحف الموصل')).toBeTruthy();
    });
  });

  it('removes a place when unsave is pressed', async () => {
    mockSavedList.mockResolvedValue([...PLACES]);
    renderScreen();
    await waitFor(() => expect(screen.getAllByText('account:savedPlaces.unsave').length).toBeGreaterThan(0));

    const removeBtns = screen.getAllByText('account:savedPlaces.unsave');
    await act(async () => {
      fireEvent.press(removeBtns[0]!);
      await Promise.resolve();
    });
    expect(mockSavedRemove).toHaveBeenCalledWith('p1');
  });
});
