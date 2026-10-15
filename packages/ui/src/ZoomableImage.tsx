/**
 * ZoomableImage — pinch-to-zoom image component.
 * Uses React Native's Animated + PanResponder (no extra dependencies).
 * Supports:
 *   - Pinch to zoom (min 1×, max 4×)
 *   - Double-tap to toggle between 1× and 2.5×
 *   - Drag to pan when zoomed in
 *   - Returns to 1× when released while under-zoomed
 */
import { useRef, type ReactElement } from 'react';
import { Animated, Image, PanResponder, StyleSheet, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';

interface ZoomableImageProps {
  source: ImageSourcePropType;
  style?: StyleProp<ViewStyle>;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  accessibilityLabel?: string;
}

export function ZoomableImage({ source, style, resizeMode = 'contain', accessibilityLabel }: ZoomableImageProps): ReactElement {
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  // Raw values tracked outside Animated (read synchronously in gesture handlers)
  const currentScale = useRef(1);
  const currentX = useRef(0);
  const currentY = useRef(0);

  // Pinch tracking
  const initialDistance = useRef<number | null>(null);
  const initialScale = useRef(1);

  // Double-tap tracking
  const lastTap = useRef<number>(0);

  function distance(t1: { pageX: number; pageY: number }, t2: { pageX: number; pageY: number }): number {
    const dx = t1.pageX - t2.pageX;
    const dy = t1.pageY - t2.pageY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  function resetToOrigin(): void {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
    ]).start();
    currentScale.current = 1;
    currentX.current = 0;
    currentY.current = 0;
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (e) => {
        const now = Date.now();
        const touches = e.nativeEvent.touches;

        // Double-tap to zoom toggle
        if (touches.length === 1 && now - lastTap.current < 300) {
          lastTap.current = 0;
          if (currentScale.current > 1) {
            resetToOrigin();
          } else {
            const target = 2.5;
            Animated.spring(scale, { toValue: target, useNativeDriver: true }).start();
            currentScale.current = target;
          }
          return;
        }
        if (touches.length === 1) lastTap.current = now;

        if (touches.length === 2) {
          initialDistance.current = distance(touches[0]!, touches[1]!);
          initialScale.current = currentScale.current;
        }
      },

      onPanResponderMove: (e, gestureState) => {
        const touches = e.nativeEvent.touches;

        if (touches.length === 2 && initialDistance.current !== null) {
          // Pinch zoom
          const newDist = distance(touches[0]!, touches[1]!);
          const newScale = clamp(initialScale.current * (newDist / initialDistance.current), 1, 4);
          currentScale.current = newScale;
          scale.setValue(newScale);
        } else if (touches.length === 1 && currentScale.current > 1) {
          // Pan while zoomed
          const newX = clamp(currentX.current + gestureState.dx, -300, 300);
          const newY = clamp(currentY.current + gestureState.dy, -300, 300);
          translateX.setValue(newX);
          translateY.setValue(newY);
        }
      },

      onPanResponderRelease: (_, gestureState) => {
        initialDistance.current = null;

        if (currentScale.current > 1) {
          // Commit pan offset
          currentX.current = clamp(currentX.current + gestureState.dx, -300, 300);
          currentY.current = clamp(currentY.current + gestureState.dy, -300, 300);
          translateX.setValue(currentX.current);
          translateY.setValue(currentY.current);
        } else {
          resetToOrigin();
        }
      },
    }),
  ).current;

  return (
    <Animated.View
      style={[style, styles.container, { transform: [{ scale }, { translateX }, { translateY }] }]}
      {...panResponder.panHandlers}
      accessibilityLabel={accessibilityLabel}
    >
      <Image source={source} style={StyleSheet.absoluteFill} resizeMode={resizeMode} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
});
