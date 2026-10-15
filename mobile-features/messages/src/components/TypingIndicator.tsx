/**
 * Animated "..." typing indicator with three bouncing dots.
 */
import { useEffect, useRef, type ReactElement } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { t } from '../strings';

const DOT_SIZE = 8;
const DELAY_MS = 200;
const DURATION_MS = 400;

function Dot({ delay }: { delay: number }): ReactElement {
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(translateY, { toValue: -6, duration: DURATION_MS, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: DURATION_MS, useNativeDriver: true }),
        Animated.delay(DELAY_MS * 2),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [delay, translateY]);

  return <Animated.View style={[styles.dot, { transform: [{ translateY }] }]} />;
}

export function TypingIndicator(): ReactElement {
  return (
    <View style={styles.container} accessibilityLabel={t('typing.indicator')}>
      <Dot delay={0} />
      <Dot delay={DELAY_MS} />
      <Dot delay={DELAY_MS * 2} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F0F0F0',
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: '#9E9E9E',
  },
});
