import { useRef, useEffect, type ReactElement } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { t } from '../strings';

const DOT_SIZE = 8;
const BUBBLE_BG = '#F5F5F5';
const BORDER_COLOR = '#E0E0E0';

interface DotProps {
  anim: Animated.Value;
}

function Dot({ anim }: DotProps): ReactElement {
  return (
    <Animated.View
      style={[
        styles.dot,
        {
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0.3, 1],
                outputRange: [0, -4],
              }),
            },
          ],
        },
      ]}
    />
  );
}

export function AssistantTyping(): ReactElement {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const createPulse = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 280, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 280, useNativeDriver: true }),
          Animated.delay(Math.max(0, 560 - delay)),
        ]),
      );

    const a1 = createPulse(dot1, 0);
    const a2 = createPulse(dot2, 180);
    const a3 = createPulse(dot3, 360);

    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.row} accessibilityLabel={t('chat.thinking')} accessibilityLiveRegion="polite">
      <View style={styles.avatarPlaceholder} />
      <View style={styles.bubble}>
        <Dot anim={dot1} />
        <Dot anim={dot2} />
        <Dot anim={dot3} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 6,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BUBBLE_BG,
    borderRadius: 18,
    borderBottomStartRadius: 4,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 5,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: '#757575',
  },
});
