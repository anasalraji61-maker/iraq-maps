import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

/** Returns true when the device has an active internet connection, false when offline.
 *  Defaults to true (optimistic) until the first NetInfo event arrives, so the UI
 *  does not flash a false-positive offline banner on mount.
 */
export function useNetworkStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Fetch current state immediately
    void NetInfo.fetch().then((state) => {
      setIsOnline(state.isConnected === true && state.isInternetReachable !== false);
    });

    const unsub = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected === true && state.isInternetReachable !== false);
    });
    return unsub;
  }, []);

  return isOnline;
}
