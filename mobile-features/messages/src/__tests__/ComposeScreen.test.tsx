import { describe, expect, it, jest } from '@jest/globals';
import { renderWithProviders } from '@iraq-maps/mobile-kit/testing';
import { fireEvent, act } from '@testing-library/react-native';
import { ComposeScreen } from '../screens/ComposeScreen';

jest.mock('../client', () => ({ useMessagingClient: () => ({}) }));

const mockUseLocalSearchParams = jest.fn(() => ({ placeIds: 'p1,p2,p3,p4,p5' }));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
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

describe('ComposeScreen — char count', () => {
  it('renders compose input and starts empty', async () => {
    mockUseLocalSearchParams.mockReturnValue({ placeIds: '' });
    const view = await renderWithProviders(<ComposeScreen />);
    const input = view.getByTestId('messaging.compose.input');
    expect(input).toBeTruthy();
    expect(input.props.value).toBe('');
  });

  it('updates input value after typing', async () => {
    mockUseLocalSearchParams.mockReturnValue({ placeIds: '' });
    const view = await renderWithProviders(<ComposeScreen />);
    const input = view.getByTestId('messaging.compose.input');
    await act(async () => { fireEvent.changeText(input, 'مرحبا'); });
    expect(input.props.value).toBe('مرحبا');
  });
});
