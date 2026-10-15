import { screen, fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '@iraq-maps/mobile-kit/testing';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, waitFor } from '@testing-library/react-native';
import { ProviderConsentScreen } from '../screens/ProviderConsentScreen';

const ACTIVE_CONSENTS = ['show_phone', 'photos'] as const;

function mockApi(overrides?: object) {
  return {
    providers: {
      consents: jest.fn(async () => ({
        status: 200,
        body: {
          active: [...ACTIVE_CONSENTS],
          records: [],
        },
      })),
      setConsent: jest.fn(async ({ params, body }: { params: { scope: string }; body: { granted: boolean } }) => ({
        status: 200,
        body: {
          active: body.granted
            ? [...ACTIVE_CONSENTS, params.scope]
            : ACTIVE_CONSENTS.filter((s) => s !== params.scope),
          records: [],
        },
      })),
      ...overrides,
    },
  };
}

describe('ProviderConsentScreen', () => {
  afterEach(() => { jest.clearAllMocks(); });

  it('shows loading indicator initially', async () => {
    let resolve!: (v: unknown) => void;
    const pending = new Promise((res) => { resolve = res; });
    const api = { providers: { consents: jest.fn(() => pending), setConsent: jest.fn() } };
    await renderWithProviders(<ProviderConsentScreen />, { api: api as never, locale: 'ar' });
    expect(screen.getByTestId('consent-loading')).toBeTruthy();
    await act(async () => {
      resolve({ status: 200, body: { active: [], records: [] } });
    });
  });

  it('renders all consent rows after load', async () => {
    const api = mockApi();
    await renderWithProviders(<ProviderConsentScreen />, { api: api as never, locale: 'ar' });
    await waitFor(() => expect(screen.getByTestId('consent-list')).toBeTruthy());
    expect(screen.getByTestId('consent-row-show_phone')).toBeTruthy();
    expect(screen.getByTestId('consent-row-social_links')).toBeTruthy();
    expect(screen.getByTestId('consent-row-photos')).toBeTruthy();
    expect(screen.getByTestId('consent-row-whatsapp_messages')).toBeTruthy();
    expect(screen.getByTestId('consent-row-show_prices')).toBeTruthy();
  });

  it('show_phone toggle is ON for active consents', async () => {
    const api = mockApi();
    await renderWithProviders(<ProviderConsentScreen />, { api: api as never, locale: 'ar' });
    await waitFor(() => screen.getByTestId('consent-toggle-show_phone'));
    const toggle = screen.getByTestId('consent-toggle-show_phone');
    // Switch with value=true has accessibilityValue checked
    expect(toggle.props.value).toBe(true);
  });

  it('social_links toggle is OFF when not in active list', async () => {
    const api = mockApi();
    await renderWithProviders(<ProviderConsentScreen />, { api: api as never, locale: 'ar' });
    await waitFor(() => screen.getByTestId('consent-toggle-social_links'));
    const toggle = screen.getByTestId('consent-toggle-social_links');
    expect(toggle.props.value).toBe(false);
  });

  it('toggling a scope calls setConsent and updates state', async () => {
    const api = mockApi();
    await renderWithProviders(<ProviderConsentScreen />, { api: api as never, locale: 'ar' });
    await waitFor(() => screen.getByTestId('consent-toggle-social_links'));
    await act(async () => {
      fireEvent(screen.getByTestId('consent-toggle-social_links'), 'valueChange', true);
    });
    expect(api.providers.setConsent).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { scope: 'social_links' },
        body: expect.objectContaining({ granted: true }),
      }),
    );
  });

  it('shows error banner when consents fetch fails', async () => {
    const api = { providers: { consents: jest.fn(async () => ({ status: 401, body: {} })), setConsent: jest.fn() } };
    await renderWithProviders(<ProviderConsentScreen />, { api: api as never, locale: 'ar' });
    await waitFor(() => expect(screen.queryByTestId('consent-loading')).toBeNull());
    // Error banner should be present
    expect(screen.queryByText(/تحقّق/)).toBeTruthy();
  });
});
