// NetworkMonitor
export {
  isOnline,
  getConnectionType,
  onStatusChange,
  refreshStatus,
  type ConnectionType,
  type NetworkStatusCallback,
} from './NetworkMonitor';

// OfflineManager
export {
  cachePlace,
  getCachedPlace,
  deleteCachedPlace,
  cacheRoute,
  getCachedRoute,
  deleteCachedRoute,
  cacheFeed,
  getCachedFeed,
  getFeedCacheAge,
  clearOldCache,
  getCacheSize,
  clearAllCache,
  getCacheStats,
  type CachedPlace,
  type CachedRoute,
  type CachedFeedPost,
} from './OfflineManager';

// OfflineQueue
export {
  enqueue,
  dequeue,
  removeAction,
  processQueue,
  getQueuedCount,
  clearQueue,
  registerQueueHandler,
  type QueuedAction,
  type ActionTag,
  type ActionHandler,
} from './OfflineQueue';

// TileCache
export {
  initTileCache,
  getCachedTile,
  cacheTile,
  evictTile,
  verifyTile,
  verifyAll,
  expireOldTiles,
  estimateDownloadSize,
  batchDownload,
  abortBatchDownload,
  clearTileCache,
  getCacheTotalBytes,
  getCachedTileCount,
  formatBytes as formatTileBytes,
  type TileCacheOptions,
  type TileKey,
  type TileEntry,
  type BatchDownloadOptions,
  type BatchProgress,
  type BatchResult,
  type EstimateResult,
} from './TileCache';

// OfflineSearch
export {
  initOfflineSearch,
  indexPlaces,
  removeFromIndex,
  searchOffline,
  nearbyPlaces,
  autocomplete,
  getIndexStats,
  clearSearchIndex,
  type SearchOptions,
  type OfflineSearchResult,
  type AutocompleteResult,
  type IndexStats,
} from './OfflineSearch';

// SyncManager
export {
  startSync,
  stopSync,
  triggerSync,
  onNetworkRestored,
  syncFeed,
  syncUserData,
  onSyncStatusChange,
  getSyncStatus,
  getLatestNotificationsCount,
  type SyncStatus,
  type FeedFetcher,
  type UserDataFetcher,
  type SyncManagerOptions,
} from './SyncManager';
