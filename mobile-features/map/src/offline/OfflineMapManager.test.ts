/**
 * Unit tests for OfflineMapManager helpers.
 * The FileSystem calls are mocked so these run without a real device.
 */

// ---------------------------------------------------------------------------
// Mock expo-file-system
// ---------------------------------------------------------------------------
const mockFiles: Record<string, string> = {};
const mockSizes: Record<string, number> = {};

jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///docs/',
  getInfoAsync: jest.fn(async (path: string) => {
    if (path in mockFiles) {
      return { exists: true, size: mockSizes[path] ?? 0 };
    }
    return { exists: false };
  }),
  makeDirectoryAsync: jest.fn(async () => {}),
  writeAsStringAsync: jest.fn(async (path: string, data: string) => {
    mockFiles[path] = data;
  }),
  readAsStringAsync: jest.fn(async (path: string) => {
    if (path in mockFiles) return mockFiles[path];
    throw new Error('not found');
  }),
  downloadAsync: jest.fn(async (_url: string, dest: string) => {
    mockFiles[dest] = 'tile-data';
    mockSizes[dest] = 512;
    return { status: 200 };
  }),
  deleteAsync: jest.fn(async () => {}),
}));

import {
  listOfflineRegions,
  getOfflineRegion,
  deleteOfflineRegion,
  isOfflineAvailable,
  formatBytes,
  abortOfflineDownload,
} from './OfflineMapManager';

beforeEach(() => {
  Object.keys(mockFiles).forEach((k) => delete mockFiles[k]);
  Object.keys(mockSizes).forEach((k) => delete mockSizes[k]);
  jest.clearAllMocks();
});

describe('listOfflineRegions', () => {
  it('returns empty array when no manifest exists', async () => {
    const result = await listOfflineRegions();
    expect(result).toEqual([]);
  });

  it('returns regions from manifest', async () => {
    const manifest = {
      r1: {
        id: 'r1',
        name: 'Baghdad',
        bbox: [44.3, 33.2, 44.5, 33.4] as [number, number, number, number],
        minZoom: 10,
        maxZoom: 14,
        totalTiles: 100,
        cachedTiles: 100,
        storedBytes: 51200,
        status: 'complete' as const,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T01:00:00.000Z',
      },
    };
    mockFiles['file:///docs/offline-maps/manifest.json'] = JSON.stringify(manifest);
    const result = await listOfflineRegions();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Baghdad');
  });
});

describe('getOfflineRegion', () => {
  it('returns null for unknown id', async () => {
    const result = await getOfflineRegion('no-such-id');
    expect(result).toBeNull();
  });

  it('returns region when it exists', async () => {
    const manifest = {
      r2: {
        id: 'r2',
        name: 'Mosul',
        bbox: [43.0, 36.3, 43.2, 36.4] as [number, number, number, number],
        minZoom: 10,
        maxZoom: 13,
        totalTiles: 50,
        cachedTiles: 50,
        storedBytes: 25600,
        status: 'complete' as const,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T01:00:00.000Z',
      },
    };
    mockFiles['file:///docs/offline-maps/manifest.json'] = JSON.stringify(manifest);
    const result = await getOfflineRegion('r2');
    expect(result?.name).toBe('Mosul');
  });
});

describe('isOfflineAvailable', () => {
  it('returns false when no complete regions cover the point', async () => {
    const result = await isOfflineAvailable([44.4, 33.3]);
    expect(result).toBe(false);
  });

  it('returns true when a complete region covers the point', async () => {
    const manifest = {
      r3: {
        id: 'r3',
        name: 'Test',
        bbox: [44.3, 33.2, 44.5, 33.4] as [number, number, number, number],
        minZoom: 10,
        maxZoom: 14,
        totalTiles: 100,
        cachedTiles: 100,
        storedBytes: 51200,
        status: 'complete' as const,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T01:00:00.000Z',
      },
    };
    mockFiles['file:///docs/offline-maps/manifest.json'] = JSON.stringify(manifest);
    const inside = await isOfflineAvailable([44.4, 33.3]);
    expect(inside).toBe(true);
    const outside = await isOfflineAvailable([45.0, 34.0]);
    expect(outside).toBe(false);
  });

  it('returns false when region status is not complete', async () => {
    const manifest = {
      r4: {
        id: 'r4',
        name: 'Incomplete',
        bbox: [44.3, 33.2, 44.5, 33.4] as [number, number, number, number],
        minZoom: 10,
        maxZoom: 14,
        totalTiles: 100,
        cachedTiles: 50,
        storedBytes: 25600,
        status: 'downloading' as const,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:30:00.000Z',
      },
    };
    mockFiles['file:///docs/offline-maps/manifest.json'] = JSON.stringify(manifest);
    const result = await isOfflineAvailable([44.4, 33.3]);
    expect(result).toBe(false);
  });
});

describe('formatBytes', () => {
  it('formats bytes', () => expect(formatBytes(512)).toBe('512 B'));
  it('formats kilobytes', () => expect(formatBytes(2048)).toBe('2.0 KB'));
  it('formats megabytes', () => expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB'));
});

describe('abortOfflineDownload', () => {
  it('does not throw for unknown id', () => {
    expect(() => abortOfflineDownload('nonexistent')).not.toThrow();
  });
});

describe('deleteOfflineRegion', () => {
  it('removes region from manifest', async () => {
    const manifest = {
      r5: {
        id: 'r5',
        name: 'Del',
        bbox: [44.3, 33.2, 44.5, 33.4] as [number, number, number, number],
        minZoom: 10,
        maxZoom: 12,
        totalTiles: 10,
        cachedTiles: 10,
        storedBytes: 5120,
        status: 'complete' as const,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T01:00:00.000Z',
      },
    };
    mockFiles['file:///docs/offline-maps/manifest.json'] = JSON.stringify(manifest);
    await deleteOfflineRegion('r5');
    const regions = await listOfflineRegions();
    expect(regions.find((r) => r.id === 'r5')).toBeUndefined();
  });
});
