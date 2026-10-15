/**
 * WsStatusIndicator: a small dot showing WebSocket connection state.
 * Green = connected, yellow = connecting, red = disconnected.
 * Placed in the app shell status bar area.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { WsStatus } from './use-websocket.js';

export interface WsStatusIndicatorProps {
  status: WsStatus;
  testID?: string;
}

const COLOR_MAP: Record<WsStatus, string> = {
  connected: '#22c55e',    // green-500
  connecting: '#eab308',   // yellow-500
  disconnected: '#ef4444', // red-500
};

export function WsStatusIndicator({ status, testID }: WsStatusIndicatorProps) {
  return (
    <View
      testID={testID ?? 'ws-status-indicator'}
      style={[styles.dot, { backgroundColor: COLOR_MAP[status] }]}
      accessibilityLabel={`WebSocket ${status}`}
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
