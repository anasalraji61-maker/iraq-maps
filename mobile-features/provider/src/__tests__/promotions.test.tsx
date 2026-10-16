/**
 * Unit tests for Provider Promotions, Appointments, and Insights screens.
 */
import { type ProviderPromotion as Promotion, type Appointment, type ProviderInsights } from '@iraq-maps/contracts';
import { renderWithProviders } from '@iraq-maps/mobile-kit/testing';

import { screen, waitFor } from '@testing-library/react-native';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { ProviderPromotionsScreen } from '../screens/ProviderPromotionsScreen';
import { ProviderAppointmentsScreen } from '../screens/ProviderAppointmentsScreen';
import { MyAppointmentsScreen } from '../screens/MyAppointmentsScreen';
import { InsightsDashboardScreen } from '../screens/InsightsDashboardScreen';

// ─── Mock ts-rest initClient ──────────────────────────────────────────────────

const mockCreate = jest.fn(async () => ({ status: 201, body: makePromotion() }));
const mockListActive = jest.fn(async () => ({ status: 200, body: [makePromotion()] }));
const mockListByProvider = jest.fn(async () => ({ status: 200, body: [makePromotion()] }));
const mockDelete = jest.fn(async () => ({ status: 204, body: undefined }));
const mockRequest = jest.fn(async () => ({ status: 201, body: makeAppointment() }));
const mockListForProvider = jest.fn(async () => ({ status: 200, body: [makeAppointment()] }));
const mockUpdate = jest.fn(async () => ({ status: 200, body: { ...makeAppointment(), status: 'confirmed' as const } }));
const mockMyAppointments = jest.fn(async () => ({ status: 200, body: [makeAppointment()] }));
const mockInsightsGet = jest.fn(async () => ({ status: 200, body: makeInsights() }));

jest.mock('@ts-rest/core', () => {
  const actual = jest.requireActual<typeof import('@ts-rest/core')>('@ts-rest/core');
  return {
    ...actual,
    initClient: jest.fn(() => ({
      create: mockCreate,
      listActive: mockListActive,
      listByProvider: mockListByProvider,
      delete: mockDelete,
      request: mockRequest,
      listForProvider: mockListForProvider,
      update: mockUpdate,
      myAppointments: mockMyAppointments,
      get: mockInsightsGet,
    })),
  };
});

const PROMO_ID = '33333333-3333-3333-3333-333333333333';
const PROVIDER_ID = '44444444-4444-4444-4444-444444444444';

function makePromotion(overrides?: Partial<Promotion>): Promotion {
  return {
    id: PROMO_ID as Promotion['id'],
    providerId: PROVIDER_ID as Promotion['providerId'],
    title: 'خصم 20%',
    description: 'تخفيض على كل الوجبات',
    discountPct: 20,
    validFrom: new Date(Date.now() - 86400000).toISOString(),
    validTo: new Date(Date.now() + 86400000 * 7).toISOString(),
    conditions: null,
    status: 'active',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const APPT_ID = '55555555-5555-5555-5555-555555555555';
const USER_ID = '66666666-6666-6666-6666-666666666666';

function makeAppointment(overrides?: Partial<Appointment>): Appointment {
  return {
    id: APPT_ID as never,
    providerId: PROVIDER_ID as never,
    userId: USER_ID as never,
    date: '2026-12-01',
    time: '10:00',
    service: 'قص شعر',
    status: 'pending',
    notes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeInsights(overrides?: Partial<ProviderInsights>): ProviderInsights {
  return {
    providerId: PROVIDER_ID as never,
    range: '30d',
    topKeywords: [{ keyword: 'قص', count: 5 }, { keyword: 'صبغ', count: 3 }],
    peakHours: [{ hour: 10, count: 4 }, { hour: 14, count: 6 }],
    sourceBreakdown: { mapSearch: 10, direct: 5, discover: 3 },
    conversionRate: 0.85,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ProviderPromotionsScreen', () => {
  afterEach(() => { jest.clearAllMocks(); });

  it('renders promotions list', async () => {
    renderWithProviders(<ProviderPromotionsScreen />);
    await waitFor(() => {
      expect(screen.getAllByText('خصم 20%').length).toBeGreaterThan(0);
    });
  });

  it('shows empty state when no promotions', async () => {
    mockListActive.mockResolvedValueOnce({ status: 200, body: [] });
    renderWithProviders(<ProviderPromotionsScreen />);
    await waitFor(() => {
      expect(screen.getByText(/لا توجد عروض/i)).toBeTruthy();
    });
  });
});

describe('ProviderAppointmentsScreen', () => {
  afterEach(() => { jest.clearAllMocks(); });

  it('renders appointments', async () => {
    renderWithProviders(<ProviderAppointmentsScreen providerId={PROVIDER_ID} />);
    await waitFor(() => {
      expect(screen.getByText('قص شعر')).toBeTruthy();
    });
  });

  it('shows confirm button for pending appointment', async () => {
    renderWithProviders(<ProviderAppointmentsScreen providerId={PROVIDER_ID} />);
    await waitFor(() => {
      expect(screen.getByText(/تأكيد الموعد/i)).toBeTruthy();
    });
  });
});

describe('MyAppointmentsScreen', () => {
  afterEach(() => { jest.clearAllMocks(); });

  it('renders user appointments', async () => {
    renderWithProviders(<MyAppointmentsScreen />);
    await waitFor(() => {
      expect(screen.getByText('قص شعر')).toBeTruthy();
    });
  });
});

describe('InsightsDashboardScreen', () => {
  afterEach(() => { jest.clearAllMocks(); });

  it('renders insights sections', async () => {
    renderWithProviders(<InsightsDashboardScreen providerId={PROVIDER_ID} />);
    await waitFor(() => {
      expect(screen.getByText(/أهم الكلمات/i)).toBeTruthy();
      expect(screen.getByText(/أوقات الذروة/i)).toBeTruthy();
      expect(screen.getByText(/مصادر العملاء/i)).toBeTruthy();
    });
  });

  it('shows conversion rate', async () => {
    renderWithProviders(<InsightsDashboardScreen providerId={PROVIDER_ID} />);
    await waitFor(() => {
      expect(screen.getByText('85%')).toBeTruthy();
    });
  });

  it('shows no data when conversion rate is null', async () => {
    mockInsightsGet.mockResolvedValueOnce({ status: 200, body: makeInsights({ conversionRate: null }) });
    renderWithProviders(<InsightsDashboardScreen providerId={PROVIDER_ID} />);
    await waitFor(() => {
      expect(screen.getAllByText(/لا توجد بيانات/i).length).toBeGreaterThan(0);
    });
  });
});
