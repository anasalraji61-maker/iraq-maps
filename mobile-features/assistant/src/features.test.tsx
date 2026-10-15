/**
 * Tests for TripPlannerScreen, RecommendationsScreen, SmartSearchScreen
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { TripPlannerScreen } from './screens/TripPlannerScreen';
import { RecommendationsScreen } from './screens/RecommendationsScreen';
import { SmartSearchScreen, SmartSearchBar } from './screens/SmartSearchScreen';

const mockPlanTrip = jest.fn<() => Promise<unknown>>();
const mockGetRecommendations = jest.fn<() => Promise<unknown>>();
const mockNaturalLanguageSearch = jest.fn<() => Promise<unknown>>();
const mockRouterBack = jest.fn();
const mockRouterPush = jest.fn();

jest.mock('./client', () => ({
  useAssistantClient: () => ({
    planTrip: mockPlanTrip,
    getRecommendations: mockGetRecommendations,
    naturalLanguageSearch: mockNaturalLanguageSearch,
  }),
}));

jest.mock('@iraq-maps/mobile-kit', () => ({
  useApiBaseUrl: () => 'http://localhost:3000',
}));

// strings.ts calls translate(`assistant:${key}`) — mock returns key as-is
jest.mock('@iraq-maps/i18n', () => ({
  registerNamespace: jest.fn(),
  t: (key: string) => key,
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockRouterBack, push: mockRouterPush }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));

// Helper: the rendered text for a given i18n key
const tx = (key: string) => `assistant:${key}`;

// ─── TripPlannerScreen ──────────────────────────────────────────────────────

const MOCK_PLAN = {
  planId: '11111111-1111-4111-8111-111111111111',
  destination: 'بغداد',
  summary: 'جولة رائعة في بغداد',
  days: [
    {
      day: 1,
      date: '2026-11-01',
      theme: 'التاريخ والثقافة',
      activities: [
        { time: '09:00', title: 'متحف بغداد', description: 'زيارة المتحف الوطني', estimatedCost: '5,000 IQD', duration: 'ساعتان' },
      ],
      totalEstimatedCost: '50,000 IQD',
    },
  ],
  totalEstimatedCost: '150,000 IQD',
  tips: ['احضر الماء', 'ابدأ مبكراً'],
};

describe('TripPlannerScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlanTrip.mockResolvedValue({ status: 200 as const, body: MOCK_PLAN, headers: new Headers() });
  });

  it('renders step 0 with destination input', async () => {
    const { getByPlaceholderText } = await render(<TripPlannerScreen />);
    expect(getByPlaceholderText(tx('tripPlanner.destinationPlaceholder'))).toBeTruthy();
  });

  it('renders header title', async () => {
    const { getByText } = await render(<TripPlannerScreen />);
    expect(getByText(tx('tripPlanner.title'))).toBeTruthy();
  });

  it('back button calls router.back', async () => {
    const { getByText } = await render(<TripPlannerScreen />);
    // The back arrow is rendered as ← text
    const backBtn = getByText('←');
    fireEvent.press(backBtn);
    expect(mockRouterBack).toHaveBeenCalledTimes(1);
  });

  it('next button is present when destination filled', async () => {
    const { getByPlaceholderText, getByText } = await render(<TripPlannerScreen />);
    const input = getByPlaceholderText(tx('tripPlanner.destinationPlaceholder'));
    fireEvent.changeText(input, 'بغداد');
    // Next button should be visible
    expect(getByText(tx('tripPlanner.next'))).toBeTruthy();
  });
});

// ─── RecommendationsScreen ──────────────────────────────────────────────────

const MOCK_RECOMMENDATIONS = {
  category: 'restaurants' as const,
  places: [
    { name: 'مطعم بغداد', category: 'مطعم عراقي', aiReason: 'يقدم أشهى المسكوف', address: 'شارع الرشيد' },
    { name: 'مطعم الكرادة', category: 'مطعم', aiReason: 'أفضل تجربة' },
  ],
  contextNote: 'أفضل المطاعم',
};

describe('RecommendationsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRecommendations.mockResolvedValue({ status: 200 as const, body: MOCK_RECOMMENDATIONS, headers: new Headers() });
  });

  it('renders header title', async () => {
    const { getByText } = await render(<RecommendationsScreen />);
    expect(getByText(tx('recommendations.title'))).toBeTruthy();
  });

  it('shows place cards after loading', async () => {
    const { findByText } = await render(<RecommendationsScreen />);
    expect(await findByText('مطعم بغداد')).toBeTruthy();
  });

  it('shows AI reason for each place', async () => {
    const { findByText } = await render(<RecommendationsScreen />);
    expect(await findByText('يقدم أشهى المسكوف')).toBeTruthy();
  });

  it('shows error on failure', async () => {
    mockGetRecommendations.mockRejectedValue(new Error('network'));
    const { findByText } = await render(<RecommendationsScreen />);
    expect(await findByText(tx('recommendations.error'))).toBeTruthy();
  });

  it('navigates to chat on Tell Me More press', async () => {
    const { findAllByText } = await render(<RecommendationsScreen />);
    // Button text is "assistant:recommendations.tellMeMore 💬" — match by partial text
    const buttons = await findAllByText(/recommendations\.tellMeMore/);
    await act(async () => { fireEvent.press(buttons[0]!); });
    expect(mockRouterPush).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/assistant' }),
    );
  });
});

// ─── SmartSearchScreen ──────────────────────────────────────────────────────

const MOCK_SEARCH_RESULTS = {
  query: 'فندق رخيص',
  parsedFilters: { category: 'hotel', priceRange: 'رخيص' },
  results: [
    { name: 'فندق الرشيد', matchReason: 'سعر مناسب وموقع مركزي', score: 0.92, placeId: 'p1' },
    { name: 'فندق بابل', matchReason: 'قريب من المركز', score: 0.75, placeId: 'p2' },
  ],
  totalFound: 2,
};

describe('SmartSearchScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNaturalLanguageSearch.mockResolvedValue({ status: 200 as const, body: MOCK_SEARCH_RESULTS, headers: new Headers() });
  });

  it('renders search input and example queries', async () => {
    const { getByPlaceholderText, getByText } = await render(<SmartSearchScreen />);
    expect(getByPlaceholderText(tx('search.placeholder'))).toBeTruthy();
    expect(getByText(tx('search.example1'))).toBeTruthy();
  });

  it('shows results after pressing search button', async () => {
    const { getByPlaceholderText, findByText } = await render(<SmartSearchScreen />);
    const input = getByPlaceholderText(tx('search.placeholder'));
    await act(async () => { fireEvent.changeText(input, 'فندق رخيص'); });
    // Click search icon button (rendered as 🔍)
    const searchBtn = (await findByText('🔍'));
    await act(async () => { fireEvent.press(searchBtn); });
    expect(await findByText('فندق الرشيد')).toBeTruthy();
  });

  it('clicking example query triggers search', async () => {
    const { getByText } = await render(<SmartSearchScreen />);
    const example = getByText(tx('search.example1'));
    await act(async () => { fireEvent.press(example); });
    await waitFor(() => expect(mockNaturalLanguageSearch).toHaveBeenCalled());
  });

  it('shows error state on failure', async () => {
    mockNaturalLanguageSearch.mockRejectedValue(new Error('fail'));
    const { findByText } = await render(<SmartSearchScreen />);
    // Trigger search via example query press
    const example = await findByText(tx('search.example1'));
    await act(async () => { fireEvent.press(example); });
    expect(await findByText(tx('search.error'))).toBeTruthy();
  });
});

describe('SmartSearchBar', () => {
  it('renders mic and search icons', async () => {
    const { getByText } = await render(<SmartSearchBar />);
    // 🔍 is a literal icon; mic is via t() so rendered as the i18n key in tests
    expect(getByText('🔍')).toBeTruthy();
    expect(getByText(tx('search.micIcon'))).toBeTruthy();
  });

  it('calls onSearchPress when pressed', async () => {
    const onPress = jest.fn();
    const { getByText } = await render(<SmartSearchBar onSearchPress={onPress} />);
    fireEvent.press(getByText('🔍'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('navigates to search screen when no callback provided', async () => {
    const { getByText } = await render(<SmartSearchBar />);
    fireEvent.press(getByText('🔍'));
    expect(mockRouterPush).toHaveBeenCalledWith('/assistant/search');
  });
});
