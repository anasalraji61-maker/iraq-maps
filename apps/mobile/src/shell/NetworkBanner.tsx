import { t } from '@iraq-maps/i18n';
import NetInfo from '@react-native-community/netinfo';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

/**
 * Persistent amber banner when offline; brief green flash on reconnect.
 * Uses @react-native-community/netinfo for reliable connectivity detection.
 */
export function NetworkBanner() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [showRestored, setShowRestored] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;
  const prevOnline = useRef<boolean | null>(null);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const isOnline = state.isConnected === true && state.isInternetReachable !== false;
      setOnline(isOnline);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (online === null) return;
    if (prevOnline.current === false && online === true) {
      // Just came back online — show green flash then hide
      setShowRestored(true);
      opacity.setValue(1);
      const timer = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
          setShowRestored(false);
        });
      }, 1800);
      prevOnline.current = online;
      return () => clearTimeout(timer);
    }
    prevOnline.current = online;
  }, [online, opacity]);

  if (online === null) return null;
  if (online && !showRestored) return null;

  return (
    <Animated.View style={[styles.banner, online ? styles.restored : styles.offline, { opacity: showRestored ? opacity : 1 }]}>
      <View accessible accessibilityLiveRegion="polite" accessibilityRole="alert">
        <Text style={styles.text}>
          {online ? t('shell:network.restored') : t('shell:network.offline')}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  offline: {
    backgroundColor: '#F59E0B',
  },
  restored: {
    backgroundColor: '#22C55E',
  },
  text: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
