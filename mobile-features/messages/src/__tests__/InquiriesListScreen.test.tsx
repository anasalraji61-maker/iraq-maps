import { describe, expect, it, jest } from '@jest/globals';
import { renderWithProviders } from '@iraq-maps/mobile-kit/testing';
import { act, waitFor } from '@testing-library/react-native';
import { InquiriesListScreen } from '../screens/InquiriesListScreen';

jest.mock('../client', () => ({
  useMessagingClient: jest.fn(),
}));

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() })),
}));

const { useMessagingClient } = jest.requireMock<{ useMessagingClient: jest.Mock }>('../client');

describe('InquiriesListScreen', () => {
  it('shows skeleton cards while loading', async () => {
    let resolveList!: (v: unknown) => void;
    useMessagingClient.mockReturnValue({
      listInquiries: jest.fn(() => new Promise((res) => { resolveList = res; })),
    });
    const view = await renderWithProviders(<InquiriesListScreen />);
    // Skeleton cards should be visible immediately before data arrives
    const skeletons = view.getAllByTestId('skeleton-inquiry-card');
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
    // Clean up
    await act(async () => {
      resolveList({ status: 200, body: { items: [] } });
      await Promise.resolve();
    });
  });

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

  it('re-fetches inquiries on pull-to-refresh', async () => {
    const item = { id: '33333333-3333-3333-3333-333333333333', text: 'سؤال', createdAt: '2026-10-15T08:00:00.000Z', userId: 'user-1', targets: [] };
    const listInquiries = jest.fn(async () => ({ status: 200, body: { items: [item] } }));
    useMessagingClient.mockReturnValue({ listInquiries });
    const view = await renderWithProviders(<InquiriesListScreen />);
    await waitFor(() => expect(listInquiries).toHaveBeenCalled());
    const callsBefore = listInquiries.mock.calls.length;

    const scrollView = view.getByTestId('inquiries-list-scroll');
    await act(async () => {
      const { onRefresh } = scrollView.props.refreshControl?.props ?? {};
      if (typeof onRefresh === 'function') onRefresh();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(listInquiries.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it('shows replied badge when at least one target replied', async () => {
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
      expect(view.getByText('تم الرد')).toBeTruthy();
    });
  });

  it('shows sent badge when targets are sent/delivered/read but none replied', async () => {
    useMessagingClient.mockReturnValue({
      listInquiries: jest.fn(async () => ({
        status: 200,
        body: {
          items: [
            {
              id: '44444444-4444-4444-4444-444444444444',
              text: 'سؤال عن المواعيد',
              createdAt: '2026-10-15T09:00:00.000Z',
              userId: 'user-1',
              targets: [
                { placeId: 'place-1', channel: 'in_app', status: 'sent' },
                { placeId: 'place-2', channel: 'in_app', status: 'delivered' },
              ],
            },
          ],
        },
      })),
    });
    const view = await renderWithProviders(<InquiriesListScreen />);
    await waitFor(() => {
      expect(view.getByText('مُرسَل')).toBeTruthy();
    });
  });

  it('shows pending badge when all targets are queued', async () => {
    useMessagingClient.mockReturnValue({
      listInquiries: jest.fn(async () => ({
        status: 200,
        body: {
          items: [
            {
              id: '55555555-5555-5555-5555-555555555555',
              text: 'رسالة قيد الانتظار',
              createdAt: '2026-10-15T10:00:00.000Z',
              userId: 'user-1',
              targets: [
                { placeId: 'place-1', channel: 'in_app', status: 'queued' },
              ],
            },
          ],
        },
      })),
    });
    const view = await renderWithProviders(<InquiriesListScreen />);
    await waitFor(() => {
      expect(view.getByText('في الانتظار')).toBeTruthy();
    });
  });

  it('shows failed badge when all targets failed', async () => {
    useMessagingClient.mockReturnValue({
      listInquiries: jest.fn(async () => ({
        status: 200,
        body: {
          items: [
            {
              id: '66666666-6666-6666-6666-666666666666',
              text: 'رسالة فاشلة',
              createdAt: '2026-10-15T11:00:00.000Z',
              userId: 'user-1',
              targets: [
                { placeId: 'place-1', channel: 'in_app', status: 'failed' },
                { placeId: 'place-2', channel: 'in_app', status: 'failed' },
              ],
            },
          ],
        },
      })),
    });
    const view = await renderWithProviders(<InquiriesListScreen />);
    await waitFor(() => {
      expect(view.getByText('فشل')).toBeTruthy();
    });
  });
});
