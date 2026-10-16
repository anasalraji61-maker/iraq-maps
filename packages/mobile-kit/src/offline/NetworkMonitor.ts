/**
 * NetworkMonitor – wraps @react-native-community/netinfo to provide a simple
 * subscription-based network-status API used by OfflineManager and SyncManager.
 */
import NetInfo, { NetInfoStateType } from '@react-native-community/netinfo';

export type ConnectionType = 'wifi' | 'cellular' | 'none' | 'unknown';
export type NetworkStatusCallback = (isOnline: boolean, type: ConnectionType) => void;

const subscribers = new Set<NetworkStatusCallback>();
let currentOnline = true;
let currentType: ConnectionType = 'unknown';
let unsubscribe: (() => void) | null = null;

function mapType(raw: NetInfoStateType | null | string): ConnectionType {
  if (!raw) return 'unknown';
  if (raw === NetInfoStateType.wifi) return 'wifi';
  if (raw === NetInfoStateType.cellular) return 'cellular';
  if (raw === NetInfoStateType.none) return 'none';
  return 'unknown';
}

function ensureListening(): void {
  if (unsubscribe) return;
  unsubscribe = NetInfo.addEventListener((state) => {
    const online = state.isConnected === true && state.isInternetReachable !== false;
    const type = mapType(state.type as NetInfoStateType);
    if (online !== currentOnline || type !== currentType) {
      currentOnline = online;
      currentType = type;
      for (const cb of subscribers) cb(online, type);
    }
  });
  // Seed with current state immediately
  void NetInfo.fetch().then((state) => {
    currentOnline = state.isConnected === true && state.isInternetReachable !== false;
    currentType = mapType(state.type as NetInfoStateType);
  });
}

/** Returns the current network connectivity state synchronously (optimistic default: true). */
export function isOnline(): boolean {
  ensureListening();
  return currentOnline;
}

/** Returns the current connection type (wifi / cellular / none / unknown). */
export function getConnectionType(): ConnectionType {
  ensureListening();
  return currentType;
}

/**
 * Subscribe to connectivity changes.
 * Returns an unsubscribe function.
 */
export function onStatusChange(callback: NetworkStatusCallback): () => void {
  ensureListening();
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

/** Fetch the current state and update the cache. Useful before making an API call. */
export async function refreshStatus(): Promise<{ online: boolean; type: ConnectionType }> {
  const state = await NetInfo.fetch();
  currentOnline = state.isConnected === true && state.isInternetReachable !== false;
  currentType = mapType(state.type as NetInfoStateType);
  return { online: currentOnline, type: currentType };
}
