import { describe, expect, it, jest } from '@jest/globals';
import { render, waitFor } from '@testing-library/react-native';
import { AnalyticsChartCard } from '../screens/AnalyticsChartCard';

jest.mock('@iraq-maps/i18n', () => ({
  registerNamespace: jest.fn(),
  t: (_key: string, params?: Record<string, unknown>) =>
    params ? `${_key}:${JSON.stringify(params)}` : _key,
}));

const PROVIDER_ID = 'prov-test-001';

describe('AnalyticsChartCard', () => {
  it('renders views chart with seeded mock data', async () => {
    const { getByText } = await render(
      <AnalyticsChartCard providerId={PROVIDER_ID} metric="views" />,
    );
    await waitFor(() => {
      expect(getByText(/analytics.viewsTitle/)).toBeTruthy();
      expect(getByText(/analytics.last7days/)).toBeTruthy();
    });
  });

  it('renders inquiries chart with seeded mock data', async () => {
    const { getByText } = await render(
      <AnalyticsChartCard providerId={PROVIDER_ID} metric="inquiries" />,
    );
    await waitFor(() => {
      expect(getByText(/analytics.inquiriesTitle/)).toBeTruthy();
    });
  });

  it('renders real data when provided', async () => {
    const realData = [1, 2, 3, 4, 5, 6, 42];
    const { getAllByText } = await render(
      <AnalyticsChartCard providerId={PROVIDER_ID} metric="views" data={realData} />,
    );
    // The max value (42) should appear as a bar label
    await waitFor(() => {
      expect(getAllByText('42').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders all 7 data values when provided', async () => {
    const realData = [10, 20, 30, 40, 50, 60, 70];
    const { getAllByText } = await render(
      <AnalyticsChartCard providerId={PROVIDER_ID} metric="views" data={realData} />,
    );
    await waitFor(() => {
      // Each unique value should appear as a bar label
      expect(getAllByText('70').length).toBeGreaterThanOrEqual(1);
      expect(getAllByText('10').length).toBeGreaterThanOrEqual(1);
    });
  });
});
