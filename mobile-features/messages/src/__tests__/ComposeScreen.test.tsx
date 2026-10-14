import { describe, expect, it, jest } from '@jest/globals';
import { renderWithProviders } from '@iraq-maps/mobile-kit/testing';
import { fireEvent, act } from '@testing-library/react-native';
import { ComposeScreen } from '../screens/ComposeScreen';

jest.mock('../client', () => ({ useMessagingClient: () => ({}) }));

// 5 place IDs pre-filled so adding another hits the cap
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: jest.fn(() => ({ placeIds: 'p1,p2,p3,p4,p5' })),
  Stack: { Screen: () => null },
}));

describe('ComposeScreen — place limit', () => {
  it('shows error when trying to add a 6th place', async () => {
    const view = await renderWithProviders(<ComposeScreen />);
    const addBtn = view.getByText('أضف مكاناً');
    await act(async () => { fireEvent.press(addBtn); });
    expect(view.getByText('الحد الأقصى 5 أماكن')).toBeTruthy();
  });
});
