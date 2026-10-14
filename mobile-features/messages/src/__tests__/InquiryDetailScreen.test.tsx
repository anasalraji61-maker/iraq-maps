import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { renderWithProviders } from '@iraq-maps/mobile-kit/testing';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { InquiryDetailScreen } from '../screens/InquiryDetailScreen';
import { messagingTestIDs } from '@iraq-maps/contracts';
import { Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';

const mockInquiry = {
  id: 'inq1',
  userId: 'user1',
  text: 'هل لديكم طاولات؟',
  createdAt: new Date().toISOString(),
  targets: [
    {
      placeId: 'place1',
      channel: 'handoff' as const,
      status: 'handed_off' as const,
      handoffLink: {
        type: 'wa_me' as const,
        url: 'https://wa.me/9641234567?text=test',
        copyText: 'هل لديكم طاولات؟',
      },
    },
  ],
};

const mockGetInquiry = jest.fn(async () => ({ status: 200, body: mockInquiry }));
jest.mock('../client', () => ({ useMessagingClient: () => ({ getInquiry: mockGetInquiry }) }));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: jest.fn(() => ({ requestId: 'inq1' })),
  Stack: { Screen: () => null },
}));

jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);

describe('InquiryDetailScreen — handoff', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('copy button calls Clipboard.setStringAsync with the handoff copyText', async () => {
    const clipSpy = jest.spyOn(Clipboard, 'setStringAsync').mockResolvedValue(true);
    const view = await renderWithProviders(<InquiryDetailScreen />);
    const copyBtn = await waitFor(() => view.getByTestId(messagingTestIDs.handoffCopy));
    fireEvent.press(copyBtn);
    await waitFor(() => expect(clipSpy).toHaveBeenCalledWith('هل لديكم طاولات؟'));
  });
});
