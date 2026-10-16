/**
 * Shared skeleton loading primitive for provider screens.
 */
import { useEffect, useRef, type ReactElement } from 'react';
import { Animated } from 'react-native';

export function SkeletonBlock({ width, height }: { width: number | string; height: number | string }): ReactElement {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 600, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[{ width: width as number, height: height as number, backgroundColor: '#E0E0E0', borderRadius: 6 }, { opacity }]}
      accessibilityElementsHidden
    />
  );
}
