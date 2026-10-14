/**
 * Thin wrapper so TypeScript doesn't need @react-native-community/netinfo's typings
 * (the real module is a peer dep installed by the app shell).
 */

interface NetInfoState {
  isConnected: boolean | null;
}

type NetInfoChangeHandler = (state: NetInfoState) => void;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const NetInfo = require('@react-native-community/netinfo') as {
  fetch(): Promise<NetInfoState>;
  addEventListener(handler: NetInfoChangeHandler): () => void;
};

export const fetchNetInfo = (): Promise<NetInfoState> => NetInfo.fetch();
export const addNetInfoListener = (handler: NetInfoChangeHandler): (() => void) =>
  NetInfo.addEventListener(handler);
