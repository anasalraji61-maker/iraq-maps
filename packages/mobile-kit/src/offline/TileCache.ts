/**
 * TileCache – PMTile/XYZ tile caching system for offline map use.
 *
 * Features:
 *  - LRU eviction with configurable size limit (default 500 MB).
 *  - Persistent index: z/x/y → file path stored in a JSON manifest.
 *  - Batch download of all tiles in a bbox at zoom levels 10–16.
 *  - Progress callbacks during batch download.
 *  - Tile-integrity verification via stored byte-length checksum.
 *  - TTL-based expiry (default 30 days).
 *  - Pre-download size estimation without downloading.
 *  - WiFi-only gate (caller-supplied predicate).
 */

import * as FileSystem from 'expo-file-system/legacy';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TileCacheOptions {
  /** Maximum total bytes kept on disk (default 500 MB). */
  maxBytes?: number;
  /** TTL in milliseconds before a tile is considered stale (default 30 days). */
  ttlMs?: number;
  /** Base directory inside the app's document directory (default 'tile-cache/'). */
  baseDir?: string;
}

export interface TileKey {
  z: number;
  x: number;
  y: number;
}

export interface TileEntry {
  /** Absolute path to the cached tile file. */
  path: string;
  /** Bytes stored on disk. */
  bytes: number;
  /** Unix timestamp (ms) when the tile was cached. */
  cachedAt: number;
  /** Expected byte length for integrity check. */
  expectedBytes: number;
}

/** Index mapping "z/x/y" → TileEntry, ordered oldest-first for LRU eviction. */
type TileIndex = Map<string, TileEntry>;

export interface BatchDownloadOptions {
  bbox: [number, number, number, number];
  minZoom?: number;
  maxZoom?: number;
  tileUrlTemplate: string;
  /** Called every PROGRESS_INTERVAL tiles with current counts. */
  onProgress?: (p: BatchProgress) => void;
  /** Called on final completion or abort. */
  onComplete?: (result: BatchResult) => void;
  /** When true, abort download if not on WiFi. */
  wifiOnly?: boolean;
  /** Predicate to check WiFi status; defaults to always true. */
  isWifi?: () => boolean;
}

export interface BatchProgress {
  downloaded: number;
  skipped: number;
  failed: number;
  total: number;
  bytesDownloaded: number;
  /** Estimated remaining seconds. */
  estimatedSecondsRemaining: number;
}

export interface BatchResult {
  downloaded: number;
  failed: number;
  skipped: number;
  bytesDownloaded: number;
  aborted: boolean;
}

export interface EstimateResult {
  tiles: number;
  /** Conservative estimate in bytes (assumes avg 12 KB/tile). */
  estimatedBytes: number;
  /** Human-readable size string. */
  estimatedSizeLabel: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_BYTES = 500 * 1024 * 1024; // 500 MB
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DEFAULT_BASE_DIR = 'tile-cache/';
const AVG_TILE_BYTES = 12 * 1024; // 12 KB conservative estimate
const PROGRESS_INTERVAL = 20; // report every N tiles

// ---------------------------------------------------------------------------
// Internal state (module-level singleton index)
// ---------------------------------------------------------------------------

let _index: TileIndex | null = null;
let _totalBytes = 0;
let _baseDir = '';
let _maxBytes = DEFAULT_MAX_BYTES;
let _ttlMs = DEFAULT_TTL_MS;
let _indexPath = '';
let _abortFlag = false;

// ---------------------------------------------------------------------------
// Tile math
// ---------------------------------------------------------------------------

function lon2tile(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

function lat2tile(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
      Math.pow(2, zoom),
  );
}

function* enumerateTiles(
  bbox: [number, number, number, number],
  minZoom: number,
  maxZoom: number,
): Generator<TileKey> {
  const [west, south, east, north] = bbox;
  for (let z = minZoom; z <= maxZoom; z++) {
    const xMin = lon2tile(west, z);
    const xMax = lon2tile(east, z);
    const yMin = lat2tile(north, z);
    const yMax = lat2tile(south, z);
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        yield { z, x, y };
      }
    }
  }
}

function tileKey(k: TileKey): string {
  return `${k.z}/${k.x}/${k.y}`;
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

async function ensureDir(path: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
}

async function readPersistedIndex(): Promise<Record<string, TileEntry>> {
  try {
    const info = await FileSystem.getInfoAsync(_indexPath);
    if (!info.exists) return {};
    const raw = await FileSystem.readAsStringAsync(_indexPath);
    return JSON.parse(raw) as Record<string, TileEntry>;
  } catch {
    return {};
  }
}

async function persistIndex(index: TileIndex): Promise<void> {
  const obj: Record<string, TileEntry> = {};
  for (const [k, v] of index) obj[k] = v;
  await FileSystem.writeAsStringAsync(_indexPath, JSON.stringify(obj));
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/**
 * Initialise the cache. Must be called once before any other function.
 * Safe to call multiple times (idempotent; reinitialises options if provided).
 */
export async function initTileCache(opts: TileCacheOptions = {}): Promise<void> {
  _maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  _ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const dir = opts.baseDir ?? DEFAULT_BASE_DIR;
  _baseDir = `${FileSystem.documentDirectory ?? ''}${dir}`;
  _indexPath = `${_baseDir}index.json`;

  await ensureDir(_baseDir);

  const persisted = await readPersistedIndex();
  _index = new Map(Object.entries(persisted));
  _totalBytes = 0;
  for (const entry of _index.values()) {
    _totalBytes += entry.bytes;
  }
}

function getIndex(): TileIndex {
  if (!_index) {
    _index = new Map();
  }
  return _index;
}

// ---------------------------------------------------------------------------
// LRU eviction
// ---------------------------------------------------------------------------

/**
 * Evict oldest tiles until total bytes fit within the configured limit.
 * Deletes files and removes index entries.
 */
async function evictIfNeeded(): Promise<void> {
  const index = getIndex();
  if (_totalBytes <= _maxBytes) return;

  // Sort entries oldest-first by cachedAt
  const sorted = [...index.entries()].sort(
    ([, a], [, b]) => a.cachedAt - b.cachedAt,
  );

  for (const [key, entry] of sorted) {
    if (_totalBytes <= _maxBytes) break;
    try {
      const info = await FileSystem.getInfoAsync(entry.path);
      if (info.exists) await FileSystem.deleteAsync(entry.path, { idempotent: true });
    } catch {
      // best effort
    }
    _totalBytes -= entry.bytes;
    index.delete(key);
  }

  await persistIndex(index);
}

// ---------------------------------------------------------------------------
// Single tile operations
// ---------------------------------------------------------------------------

/** Returns the cached file path for a tile, or null if not cached / expired. */
export async function getCachedTile(tile: TileKey): Promise<string | null> {
  const index = getIndex();
  const key = tileKey(tile);
  const entry = index.get(key);
  if (!entry) return null;

  // Check TTL
  if (Date.now() - entry.cachedAt > _ttlMs) {
    await evictTile(tile);
    return null;
  }

  // Verify file still exists
  try {
    const info = await FileSystem.getInfoAsync(entry.path);
    if (!info.exists) {
      index.delete(key);
      _totalBytes -= entry.bytes;
      return null;
    }
  } catch {
    return null;
  }

  return entry.path;
}

/** Store a tile at the given URL into the cache. Returns the file path. */
export async function cacheTile(
  tile: TileKey,
  url: string,
): Promise<string | null> {
  const index = getIndex();
  const key = tileKey(tile);

  // Already cached?
  const existing = await getCachedTile(tile);
  if (existing) return existing;

  const dir = `${_baseDir}${tile.z}/${tile.x}/`;
  await ensureDir(dir);
  const path = `${dir}${tile.y}.pbf`;

  try {
    const result = await FileSystem.downloadAsync(url, path);
    if (result.status !== 200) return null;

    const info = await FileSystem.getInfoAsync(path);
    const bytes = info.exists ? (info.size ?? 0) : 0;

    const entry: TileEntry = {
      path,
      bytes,
      cachedAt: Date.now(),
      expectedBytes: bytes,
    };

    index.set(key, entry);
    _totalBytes += bytes;

    await evictIfNeeded();
    await persistIndex(index);
    return path;
  } catch {
    return null;
  }
}

/** Remove a single tile from cache. */
export async function evictTile(tile: TileKey): Promise<void> {
  const index = getIndex();
  const key = tileKey(tile);
  const entry = index.get(key);
  if (!entry) return;

  try {
    const info = await FileSystem.getInfoAsync(entry.path);
    if (info.exists) await FileSystem.deleteAsync(entry.path, { idempotent: true });
  } catch {
    // best effort
  }

  _totalBytes -= entry.bytes;
  index.delete(key);
  await persistIndex(index);
}

// ---------------------------------------------------------------------------
// Integrity verification
// ---------------------------------------------------------------------------

/**
 * Verify a cached tile's file size matches the stored expected bytes.
 * Returns true if the tile is valid (or not cached, which is not a corruption).
 */
export async function verifyTile(tile: TileKey): Promise<boolean> {
  const index = getIndex();
  const key = tileKey(tile);
  const entry = index.get(key);
  if (!entry) return true; // not cached = not corrupt

  try {
    const info = await FileSystem.getInfoAsync(entry.path);
    if (!info.exists) {
      index.delete(key);
      _totalBytes -= entry.bytes;
      return false;
    }
    const actualBytes = info.size ?? 0;
    return actualBytes === entry.expectedBytes && actualBytes > 0;
  } catch {
    return false;
  }
}

/**
 * Scan all cached tiles and remove any with mismatched sizes.
 * Returns the count of corrupted tiles removed.
 */
export async function verifyAll(): Promise<number> {
  const index = getIndex();
  let removed = 0;

  for (const [key, entry] of [...index.entries()]) {
    try {
      const info = await FileSystem.getInfoAsync(entry.path);
      const ok = info.exists && (info.size ?? 0) === entry.expectedBytes && (info.size ?? 0) > 0;
      if (!ok) {
        if (info.exists) {
          await FileSystem.deleteAsync(entry.path, { idempotent: true });
        }
        _totalBytes -= entry.bytes;
        index.delete(key);
        removed++;
      }
    } catch {
      index.delete(key);
      removed++;
    }
  }

  if (removed > 0) await persistIndex(index);
  return removed;
}

// ---------------------------------------------------------------------------
// TTL expiry
// ---------------------------------------------------------------------------

/** Remove all tiles whose cachedAt is older than the configured TTL. */
export async function expireOldTiles(): Promise<number> {
  const index = getIndex();
  const cutoff = Date.now() - _ttlMs;
  let removed = 0;

  for (const [key, entry] of [...index.entries()]) {
    if (entry.cachedAt < cutoff) {
      try {
        const info = await FileSystem.getInfoAsync(entry.path);
        if (info.exists) await FileSystem.deleteAsync(entry.path, { idempotent: true });
      } catch {
        // best effort
      }
      _totalBytes -= entry.bytes;
      index.delete(key);
      removed++;
    }
  }

  if (removed > 0) await persistIndex(index);
  return removed;
}

// ---------------------------------------------------------------------------
// Size estimation
// ---------------------------------------------------------------------------

/**
 * Estimate the download size for a bbox and zoom range without downloading.
 * Uses a conservative average of AVG_TILE_BYTES per tile, minus already-cached tiles.
 */
export async function estimateDownloadSize(
  bbox: [number, number, number, number],
  minZoom = 10,
  maxZoom = 16,
): Promise<EstimateResult> {
  const index = getIndex();
  let tiles = 0;
  let cachedCount = 0;

  for (const tile of enumerateTiles(bbox, minZoom, maxZoom)) {
    tiles++;
    if (index.has(tileKey(tile))) cachedCount++;
  }

  const uncached = tiles - cachedCount;
  const estimatedBytes = uncached * AVG_TILE_BYTES;

  return {
    tiles,
    estimatedBytes,
    estimatedSizeLabel: formatBytes(estimatedBytes),
  };
}

// ---------------------------------------------------------------------------
// Batch download
// ---------------------------------------------------------------------------

/** Abort any in-progress batch download. */
export function abortBatchDownload(): void {
  _abortFlag = true;
}

/**
 * Download all tiles covering `bbox` between minZoom and maxZoom.
 * Skips already-cached (non-expired) tiles.
 * Fires `onProgress` every PROGRESS_INTERVAL tiles.
 */
export async function batchDownload(opts: BatchDownloadOptions): Promise<BatchResult> {
  const {
    bbox,
    minZoom = 10,
    maxZoom = 16,
    tileUrlTemplate,
    onProgress,
    onComplete,
    wifiOnly = false,
    isWifi = () => true,
  } = opts;

  _abortFlag = false;

  if (wifiOnly && !isWifi()) {
    const result: BatchResult = { downloaded: 0, failed: 0, skipped: 0, bytesDownloaded: 0, aborted: true };
    onComplete?.(result);
    return result;
  }

  // Pre-count total
  let total = 0;
  for (const _ of enumerateTiles(bbox, minZoom, maxZoom)) total++;

  let downloaded = 0;
  let failed = 0;
  let skipped = 0;
  let bytesDownloaded = 0;
  let processed = 0;
  const startTime = Date.now();

  for (const tile of enumerateTiles(bbox, minZoom, maxZoom)) {
    if (_abortFlag) {
      const result: BatchResult = { downloaded, failed, skipped, bytesDownloaded, aborted: true };
      onComplete?.(result);
      return result;
    }

    if (wifiOnly && !isWifi()) {
      const result: BatchResult = { downloaded, failed, skipped, bytesDownloaded, aborted: true };
      onComplete?.(result);
      return result;
    }

    const key = tileKey(tile);
    const index = getIndex();
    const cached = index.get(key);
    if (cached && Date.now() - cached.cachedAt <= _ttlMs) {
      skipped++;
      processed++;
    } else {
      const url = tileUrlTemplate
        .replace('{z}', String(tile.z))
        .replace('{x}', String(tile.x))
        .replace('{y}', String(tile.y));
      const path = await cacheTile(tile, url);
      if (path) {
        const entry = index.get(key);
        bytesDownloaded += entry?.bytes ?? 0;
        downloaded++;
      } else {
        failed++;
      }
      processed++;
    }

    if (processed % PROGRESS_INTERVAL === 0 || processed === total) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = downloaded / Math.max(elapsed, 1);
      const remaining = total - processed;
      const estimatedSecondsRemaining = rate > 0 ? Math.round(remaining / rate) : 0;

      onProgress?.({
        downloaded,
        skipped,
        failed,
        total,
        bytesDownloaded,
        estimatedSecondsRemaining,
      });
    }
  }

  const result: BatchResult = { downloaded, failed, skipped, bytesDownloaded, aborted: false };
  onComplete?.(result);
  return result;
}

// ---------------------------------------------------------------------------
// Stats / utility
// ---------------------------------------------------------------------------

/** Returns total bytes currently stored in the cache. */
export function getCacheTotalBytes(): number {
  return _totalBytes;
}

/** Returns number of tiles in the index. */
export function getCachedTileCount(): number {
  return getIndex().size;
}

/** Clear the entire cache (all files and index). */
export async function clearTileCache(): Promise<void> {
  const index = getIndex();
  for (const entry of index.values()) {
    try {
      const info = await FileSystem.getInfoAsync(entry.path);
      if (info.exists) await FileSystem.deleteAsync(entry.path, { idempotent: true });
    } catch {
      // best effort
    }
  }
  index.clear();
  _totalBytes = 0;
  await persistIndex(index);
}

/** Human-readable size string. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
