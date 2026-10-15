import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { readWidgetSnapshot, writeWidgetSnapshot } from './widget-data';

const mockGet = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;
const mockSet = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;

describe('WidgetDataService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue(undefined);
  });

  it('returns null when no snapshot stored', async () => {
    expect(await readWidgetSnapshot()).toBeNull();
  });

  it('writes a snapshot with updatedAt timestamp', async () => {
    const payload = {
      unreadNotificationCount: 5,
      nearbyPlacesCount: 12,
      displayName: 'Anas',
    };
    await writeWidgetSnapshot(payload);

    expect(mockSet).toHaveBeenCalledTimes(1);
    const [key, written] = mockSet.mock.calls[0] as [string, string];
    expect(key).toBe('@iraq-maps/widget-snapshot');
    const parsed = JSON.parse(written) as Record<string, unknown>;
    expect(parsed.unreadNotificationCount).toBe(5);
    expect(parsed.nearbyPlacesCount).toBe(12);
    expect(parsed.displayName).toBe('Anas');
    expect(typeof parsed.updatedAt).toBe('string');
  });

  it('reads back a stored snapshot', async () => {
    const stored = {
      unreadNotificationCount: 3,
      nearbyPlacesCount: 7,
      displayName: 'Test',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    mockGet.mockResolvedValue(JSON.stringify(stored));
    const result = await readWidgetSnapshot();
    expect(result?.unreadNotificationCount).toBe(3);
    expect(result?.displayName).toBe('Test');
  });
});
