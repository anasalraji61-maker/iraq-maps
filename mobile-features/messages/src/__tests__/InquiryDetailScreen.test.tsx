import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { renderWithProviders } from '@iraq-maps/mobile-kit/testing';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { InquiryDetailScreen } from '../screens/InquiryDetailScreen';
import { messagingTestIDs } from '@iraq-maps/contracts';
import { Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';

jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
  },
}));

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

const mockGetInquiry = jest.fn<() => Promise<{ status: 200; body: unknown }>>().mockResolvedValue({ status: 200, body: mockInquiry });
const mockMarkInquiryRead = jest.fn(async () => ({ status: 200, body: { ok: true } }));
jest.mock('../client', () => ({ useMessagingClient: () => ({ getInquiry: mockGetInquiry, markInquiryRead: mockMarkInquiryRead }) }));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: jest.fn(() => ({ requestId: 'inq1' })),
  Stack: { Screen: () => null },
}));

jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);

const mockInquiryInApp = {
  id: 'inq2',
  userId: 'user1',
  text: 'ما هي أوقات العمل؟',
  createdAt: new Date().toISOString(),
  targets: [
    {
      placeId: 'place2',
      channel: 'in_app' as const,
      status: 'replied' as const,
      handoffLink: undefined,
    },
  ],
};

describe('InquiryDetailScreen — in_app channel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetInquiry.mockResolvedValue({ status: 200, body: mockInquiryInApp });
    mockMarkInquiryRead.mockResolvedValue({ status: 200, body: { ok: true } });
  });

  it('renders inquiry text for in_app channel', async () => {
    const view = await renderWithProviders(<InquiryDetailScreen />);
    await waitFor(() => expect(view.getByText('ما هي أوقات العمل؟')).toBeTruthy());
  });

  it('does not show handoff copy button for in_app channel', async () => {
    const view = await renderWithProviders(<InquiryDetailScreen />);
    await waitFor(() => expect(view.getByText('ما هي أوقات العمل؟')).toBeTruthy());
    expect(view.queryByTestId(messagingTestIDs.handoffCopy)).toBeNull();
  });
});

describe('InquiryDetailScreen — handoff', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetInquiry.mockResolvedValue({ status: 200, body: mockInquiry });
    mockMarkInquiryRead.mockResolvedValue({ status: 200, body: { ok: true } });
  });

  it('copy button calls Clipboard.setStringAsync with the handoff copyText', async () => {
    const clipSpy = jest.spyOn(Clipboard, 'setStringAsync').mockResolvedValue(true);
    const view = await renderWithProviders(<InquiryDetailScreen />);
    const copyBtn = await waitFor(() => view.getByTestId(messagingTestIDs.handoffCopy));
    fireEvent.press(copyBtn);
    await waitFor(() => expect(clipSpy).toHaveBeenCalledWith('هل لديكم طاولات؟'));
  });

  it('re-fetches inquiry on pull-to-refresh', async () => {
    const view = await renderWithProviders(<InquiryDetailScreen />);
    await waitFor(() => view.getByTestId(messagingTestIDs.handoffCopy));
    const callsBefore = mockGetInquiry.mock.calls.length;
    const scrollView = view.getByTestId('inquiry-detail-scroll');
    // fire the onRefresh prop of the refreshControl
    await act(async () => {
      const { onRefresh } = scrollView.props.refreshControl?.props ?? {};
      if (typeof onRefresh === 'function') onRefresh();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(mockGetInquiry.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});

describe('InquiryDetailScreen — auto-close banner', () => {
  const OLD_DATE = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();

  beforeEach(() => {
    jest.clearAllMocks();
    mockMarkInquiryRead.mockResolvedValue({ status: 200, body: { ok: true } });
  });

  it('shows closed banner when inquiry is older than 7 days with no reply', async () => {
    const staleInquiry = {
      id: 'inq-stale',
      userId: 'user1',
      text: 'سؤال قديم',
      createdAt: OLD_DATE,
      targets: [
        {
          placeId: 'place-stale',
          channel: 'in_app' as const,
          status: 'sent' as const,
          handoffLink: undefined,
        },
      ],
    };
    // Override for this test only; no default remains from previous describe
    mockGetInquiry.mockResolvedValue({ status: 200, body: staleInquiry });
    const view = await renderWithProviders(<InquiryDetailScreen />);
    await waitFor(() => view.getByText('سؤال قديم'));
    expect(view.getByTestId('inquiry-closed-banner')).toBeTruthy();
  });

  it('does not show closed banner when inquiry has a reply', async () => {
    const repliedInquiry = {
      id: 'inq-replied',
      userId: 'user1',
      text: 'سؤال مجاب',
      createdAt: OLD_DATE,
      targets: [{ placeId: 'place2', channel: 'in_app' as const, status: 'replied' as const, handoffLink: undefined }],
    };
    mockGetInquiry.mockResolvedValue({ status: 200, body: repliedInquiry });
    const view = await renderWithProviders(<InquiryDetailScreen />);
    await waitFor(() => view.getByText('سؤال مجاب'));
    expect(view.queryByTestId('inquiry-closed-banner')).toBeNull();
  });

  it('does not show closed banner when inquiry is recent', async () => {
    const recentInquiry = {
      id: 'inq-recent',
      userId: 'user1',
      text: 'سؤال حديث',
      createdAt: new Date().toISOString(),
      targets: [{ placeId: 'place3', channel: 'in_app' as const, status: 'sent' as const, handoffLink: undefined }],
    };
    mockGetInquiry.mockResolvedValue({ status: 200, body: recentInquiry });
    const view = await renderWithProviders(<InquiryDetailScreen />);
    await waitFor(() => view.getByText('سؤال حديث'));
    expect(view.queryByTestId('inquiry-closed-banner')).toBeNull();
  });
});
