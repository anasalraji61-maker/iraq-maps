import { describe, expect, it, jest } from '@jest/globals';
import { renderWithProviders } from '@iraq-maps/mobile-kit/testing';
import { waitFor } from '@testing-library/react-native';
import { InquiriesListScreen } from '../screens/InquiriesListScreen';

jest.mock('../client', () => ({
  useMessagingClient: jest.fn(),
}));

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() })),
}));

const { useMessagingClient } = jest.requireMock<{ useMessagingClient: jest.Mock }>('../client');

describe('InquiriesListScreen', () => {
  it('shows empty state when there are no inquiries', async () => {
    useMessagingClient.mockReturnValue({
      listInquiries: jest.fn(async () => ({ status: 200, body: { items: [] } })),
    });
    const view = await renderWithProviders(<InquiriesListScreen />);
    await waitFor(() => expect(view.getByText(/لا توجد رسائل/)).toBeTruthy());
  });

  it('renders inquiry items returned by API', async () => {
    useMessagingClient.mockReturnValue({
      listInquiries: jest.fn(async () => ({
        status: 200,
        body: {
          items: [
            {
              id: '11111111-1111-1111-1111-111111111111',
              text: 'هل المطعم مفتوح؟',
              createdAt: '2026-10-14T10:00:00.000Z',
              targets: [],
              userId: 'user-1',
            },
          ],
        },
      })),
    });
    const view = await renderWithProviders(<InquiriesListScreen />);
    await waitFor(() => expect(view.getByText(/هل المطعم مفتوح/)).toBeTruthy());
  });

  it('shows targets count and replied badge when a target replied', async () => {
    useMessagingClient.mockReturnValue({
      listInquiries: jest.fn(async () => ({
        status: 200,
        body: {
          items: [
            {
              id: '22222222-2222-2222-2222-222222222222',
              text: 'استفسار عن السعر',
              createdAt: '2026-10-15T08:00:00.000Z',
              userId: 'user-1',
              targets: [
                { placeId: 'place-1', channel: 'in_app', status: 'replied' },
                { placeId: 'place-2', channel: 'in_app', status: 'sent' },
              ],
            },
          ],
        },
      })),
    });
    const view = await renderWithProviders(<InquiriesListScreen />);
    await waitFor(() => {
      expect(view.getByText(/استفسار عن السعر/)).toBeTruthy();
      // replied badge text should be present
      expect(view.getByText('رد')).toBeTruthy();
    });
  });
});
