/**
 * OfflineMapManager – manages PMTiles tile region downloads for offline use.
 *
 * Tiles are stored as individual .pbf blobs under a per-region directory in the
 * app's document directory.  A region manifest JSON file tracks metadata (bbox,
 * zoom levels, byte size, progress).
 *
 * This is a pure in-process manager; it does **not** hook into MapLibre's tile
 * cache (that would require a native module).  Instead MapScreen checks
 * `isOfflineAvailable(bbox)` and, when offline, falls back to a PMTiles file
 * path that this manager has assembled.
 */

import * as FileSystem from 'expo-file-system/legacy';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OfflineRegionStatus = 'pending' | 'downloading' | 'complete' | 'failed';

export interface OfflineRegionManifest {
  id: string;
  name: string;
  /** [west, south, east, north] */
  bbox: [number, number, number, number];
  minZoom: number;
  maxZoom: number;
  /** Estimated total tile count. */
  totalTiles: number;
  /** Number of tiles successfully cached. */
  cachedTiles: number;
  /** Total bytes stored on disk. */
  storedBytes: number;
  status: OfflineRegionStatus;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

export interface DownloadProgress {
  regionId: string;
  totalTiles: number;
  cachedTiles: number;
  storedBytes: number;
  status: OfflineRegionStatus;
}

export type ProgressCallback = (progress: DownloadProgress) => void;
export type CompletionCallback = (regionId: string, error?: Error) => void;

// ---------------------------------------------------------------------------
// Tile math helpers
// ---------------------------------------------------------------------------

/** Convert degrees to tile X at a given zoom level. */
function lon2tile(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

/** Convert degrees to tile Y at a given zoom level. */
function lat2tile(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
      Math.pow(2, zoom),
  );
}

/** Enumerate all (z, x, y) tiles that cover `bbox` between minZoom and maxZoom. */
function* enumerateTiles(
  bbox: [number, number, number, number],
  minZoom: number,
  maxZoom: number,
): Generator<{ z: number; x: number; y: number }> {
  const [west, south, east, north] = bbox;
  for (let z = minZoom; z <= maxZoom; z++) {
    const xMin = lon2tile(west, z);
    const xMax = lon2tile(east, z);
    const yMin = lat2tile(north, z); // note: y increases southward
    const yMax = lat2tile(south, z);
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        yield { z, x, y };
      }
    }
  }
}

/** Count total tiles without materialising them all. */
function countTiles(
  bbox: [number, number, number, number],
  minZoom: number,
  maxZoom: number,
): number {
  let count = 0;
  for (const _ of enumerateTiles(bbox, minZoom, maxZoom)) count++;
  return count;
}

// ---------------------------------------------------------------------------
// Storage paths
// ---------------------------------------------------------------------------

const BASE_DIR = `${FileSystem.documentDirectory}offline-maps/`;
const MANIFEST_FILE = `${BASE_DIR}manifest.json`;

async function ensureDir(path: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
}

// ---------------------------------------------------------------------------
// Manifest persistence
// ---------------------------------------------------------------------------

async function readManifest(): Promise<Record<string, OfflineRegionManifest>> {
  try {
    const info = await FileSystem.getInfoAsync(MANIFEST_FILE);
    if (!info.exists) return {};
    const raw = await FileSystem.readAsStringAsync(MANIFEST_FILE);
    return JSON.parse(raw) as Record<string, OfflineRegionManifest>;
  } catch {
    return {};
  }
}

async function writeManifest(
  manifest: Record<string, OfflineRegionManifest>,
): Promise<void> {
  await ensureDir(BASE_DIR);
  await FileSystem.writeAsStringAsync(MANIFEST_FILE, JSON.stringify(manifest));
}

// ---------------------------------------------------------------------------
// Active download state (in-memory)
// ---------------------------------------------------------------------------

interface ActiveDownload {
  abortFlag: { cancelled: boolean };
}

const activeDownloads = new Map<string, ActiveDownload>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns all persisted regions. */
export async function listOfflineRegions(): Promise<OfflineRegionManifest[]> {
  const manifest = await readManifest();
  return Object.values(manifest).sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt),
  );
}

/** Returns the manifest for one region, or null. */
export async function getOfflineRegion(
  id: string,
): Promise<OfflineRegionManifest | null> {
  const manifest = await readManifest();
  return manifest[id] ?? null;
}

/**
 * Create a new offline region and start downloading its tiles.
 *
 * The tile URL template comes from the caller (i.e. the same TILES_SOURCE the
 * MapCanvas uses, minus any token query-param that must not be persisted).
 */
export async function downloadOfflineRegion(opts: {
  id: string;
  name: string;
  bbox: [number, number, number, number];
  minZoom?: number;
  maxZoom?: number;
  tileUrlTemplate: string;
  onProgress?: ProgressCallback;
  onComplete?: CompletionCallback;
}): Promise<void> {
  const {
    id,
    name,
    bbox,
    minZoom = 10,
    maxZoom = 15,
    tileUrlTemplate,
    onProgress,
    onComplete,
  } = opts;

  const totalTiles = countTiles(bbox, minZoom, maxZoom);
  const regionDir = `${BASE_DIR}${id}/`;
  await ensureDir(regionDir);

  const now = new Date().toISOString();
  const entry: OfflineRegionManifest = {
    id,
    name,
    bbox,
    minZoom,
    maxZoom,
    totalTiles,
    cachedTiles: 0,
    storedBytes: 0,
    status: 'downloading',
    createdAt: now,
    updatedAt: now,
  };

  const manifest = await readManifest();
  manifest[id] = entry;
  await writeManifest(manifest);

  const abort: ActiveDownload = { abortFlag: { cancelled: false } };
  activeDownloads.set(id, abort);

  (async () => {
    try {
      let cachedTiles = 0;
      let storedBytes = 0;
      let batchCount = 0;
      const BATCH_SIZE = 20;

      for (const tile of enumerateTiles(bbox, minZoom, maxZoom)) {
        if (abort.abortFlag.cancelled) {
          const m = await readManifest();
          if (m[id]) {
            m[id].status = 'failed';
            m[id].updatedAt = new Date().toISOString();
            await writeManifest(m);
          }
          onComplete?.(id, new Error('cancelled'));
          return;
        }

        const { z, x, y } = tile;
        const url = tileUrlTemplate
          .replace('{z}', String(z))
          .replace('{x}', String(x))
          .replace('{y}', String(y));
        const dest = `${regionDir}${z}_${x}_${y}.pbf`;

        try {
          const existing = await FileSystem.getInfoAsync(dest);
          if (existing.exists) {
            cachedTiles++;
            storedBytes += existing.size ?? 0;
          } else {
            const result = await FileSystem.downloadAsync(url, dest);
            if (result.status === 200) {
              cachedTiles++;
              const info = await FileSystem.getInfoAsync(dest);
              storedBytes += info.exists ? (info.size ?? 0) : 0;
            }
          }
        } catch {
          // Skip individual tile failures; they'll be missing offline.
        }

        batchCount++;
        if (batchCount >= BATCH_SIZE) {
          batchCount = 0;
          const progress: DownloadProgress = {
            regionId: id,
            totalTiles,
            cachedTiles,
            storedBytes,
            status: 'downloading',
          };
          onProgress?.(progress);

          const m = await readManifest();
          if (m[id]) {
            m[id].cachedTiles = cachedTiles;
            m[id].storedBytes = storedBytes;
            m[id].updatedAt = new Date().toISOString();
            await writeManifest(m);
          }
        }
      }

      const m = await readManifest();
      if (m[id]) {
        m[id].cachedTiles = cachedTiles;
        m[id].storedBytes = storedBytes;
        m[id].status = 'complete';
        m[id].updatedAt = new Date().toISOString();
        await writeManifest(m);
      }

      onProgress?.({
        regionId: id,
        totalTiles,
        cachedTiles,
        storedBytes,
        status: 'complete',
      });
      onComplete?.(id);
    } catch (err) {
      const m = await readManifest();
      if (m[id]) {
        m[id].status = 'failed';
        m[id].updatedAt = new Date().toISOString();
        await writeManifest(m);
      }
      onComplete?.(id, err instanceof Error ? err : new Error(String(err)));
    } finally {
      activeDownloads.delete(id);
    }
  })();
}

/** Abort an in-progress download. */
export function abortOfflineDownload(id: string): void {
  const dl = activeDownloads.get(id);
  if (dl) dl.abortFlag.cancelled = true;
}

/** Delete a region's cached tiles and manifest entry. */
export async function deleteOfflineRegion(id: string): Promise<void> {
  abortOfflineDownload(id);
  const regionDir = `${BASE_DIR}${id}/`;
  try {
    const info = await FileSystem.getInfoAsync(regionDir);
    if (info.exists) await FileSystem.deleteAsync(regionDir, { idempotent: true });
  } catch {
    // best effort
  }
  const manifest = await readManifest();
  delete manifest[id];
  await writeManifest(manifest);
}

/**
 * Returns true when a complete offline region covers the given point.
 * Used by MapScreen to show the "Offline" badge when tiles are cached.
 */
export async function isOfflineAvailable(
  point: [number, number],
): Promise<boolean> {
  const regions = await listOfflineRegions();
  return regions.some((r) => {
    if (r.status !== 'complete') return false;
    const [lng, lat] = point;
    const [west, south, east, north] = r.bbox;
    return lng >= west && lng <= east && lat >= south && lat <= north;
  });
}

/** Human-readable file-size string. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
