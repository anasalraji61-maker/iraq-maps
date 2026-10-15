/**
 * Animated shimmer placeholder for the place detail card while data loads.
 * Uses Animated.loop with no extra dependencies.
 */
import { type ReactElement, useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

function ShimmerBar({ width, height = 16, marginBottom = 8 }: { width: number | `${number}%`; height?: number; marginBottom?: number }): ReactElement {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.bar,
        { width: width as number, height, marginBottom, opacity },
      ]}
    />
  );
}

export function PlaceSkeleton(): ReactElement {
  return (
    <View style={styles.container}>
      {/* title */}
      <ShimmerBar width="70%" height={24} marginBottom={8} />
      {/* category */}
      <ShimmerBar width="40%" height={14} marginBottom={12} />
      {/* badge */}
      <ShimmerBar width={60} height={22} marginBottom={16} />
      {/* list items */}
      <ShimmerBar width="100%" height={48} marginBottom={8} />
      <ShimmerBar width="100%" height={48} marginBottom={8} />
      {/* insights */}
      <ShimmerBar width="55%" height={14} marginBottom={6} />
      <ShimmerBar width="100%" height={48} marginBottom={8} />
      {/* button */}
      <ShimmerBar width="100%" height={44} marginBottom={8} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  bar: {
    backgroundColor: '#c8c8c8',
    borderRadius: 6,
  },
});
