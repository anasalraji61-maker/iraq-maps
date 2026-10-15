/**
 * StoryViewerScreen – full-screen story viewer with progress bar timer,
 * tap to next/previous, swipe down to dismiss.
 */
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Dimensions,
  GestureResponderEvent,
  Image,
  PanResponder,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useStoriesClient } from '../storiesClient';
import { t } from '../strings';
import type { StoryType } from '@iraq-maps/contracts';

const { width: SCREEN_W } = Dimensions.get('window');

interface StoryViewerProps {
  stories: StoryType[];
  authorName: string;
  onDismiss: () => void;
}

export function StoryViewer({ stories, authorName, onDismiss }: StoryViewerProps): ReactElement {
  const client = useStoriesClient();
  const [index, setIndex] = useState(0);
  const progressAnims = useRef(stories.map(() => new Animated.Value(0))).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const story = stories[index];

  const advance = useCallback(() => {
    if (index < stories.length - 1) {
      setIndex((i) => i + 1);
    } else {
      onDismiss();
    }
  }, [index, stories.length, onDismiss]);

  const goBack = useCallback(() => {
    if (index > 0) {
      progressAnims[index]!.setValue(0);
      setIndex((i) => i - 1);
    }
  }, [index, progressAnims]);

  // Mark as viewed
  useEffect(() => {
    if (!story) return;
    client.markViewed({ params: { storyId: story.id }, body: {} }).catch(() => {/* ignore */});
  }, [story?.id, client]);

  // Progress bar animation
  useEffect(() => {
    if (!story) return;
    progressAnims[index]!.setValue(0);
    const dur = story.duration * 1000;
    animRef.current = Animated.timing(progressAnims[index]!, {
      toValue: 1,
      duration: dur,
      useNativeDriver: false,
    });
    animRef.current.start(({ finished }) => {
      if (finished) advance();
    });
    return () => { animRef.current?.stop(); };
  }, [index, story, advance]);

  // Swipe-down to dismiss
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 10 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 60) onDismiss();
      },
    }),
  ).current;

  const handleTap = (e: GestureResponderEvent) => {
    const x = e.nativeEvent.locationX;
    if (x < SCREEN_W * 0.35) {
      goBack();
    } else {
      advance();
    }
  };

  if (!story) return <View style={styles.container} />;

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      {/* Media */}
      <Image
        source={{ uri: story.mediaUrl }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />

      {/* Dark overlay top */}
      <View style={styles.topGradient} />

      {/* Progress bars */}
      <SafeAreaView style={styles.safeTop}>
        <View style={styles.progressRow}>
          {stories.map((_, i) => (
            <View key={i} style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width:
                      i < index
                        ? '100%'
                        : i === index
                        ? progressAnims[i]!.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
                        : '0%',
                  },
                ]}
                accessibilityLabel={t('stories.progressA11y')}
              />
            </View>
          ))}
        </View>

        {/* Header row */}
        <View style={styles.headerRow}>
          <Text style={styles.authorName}>{authorName}</Text>
          <Text style={styles.counter}>
            {t('stories.counter', { current: String(index + 1), total: String(stories.length) })}
          </Text>
          <TouchableOpacity
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={t('lightbox.close')}
            style={styles.closeBtn}
          >
            {/* eslint-disable-next-line i18next/no-literal-string */}
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Tap zones */}
      <Pressable style={StyleSheet.absoluteFill} onPress={handleTap} />
    </View>
  );
}

/** Route wrapper: reads storyId param, fetches feed, finds the author's stories */
export function StoryViewerScreen(): ReactElement {
  const router = useRouter();
  const params = useLocalSearchParams<{ authorId?: string }>();
  const client = useStoriesClient();
  const [stories, setStories] = useState<StoryType[]>([]);
  const [authorName, setAuthorName] = useState('');

  useEffect(() => {
    (async () => {
      const res = await client.getFeed();
      if (res.status === 200) {
        const author = res.body.authors.find((a) => a.userId === params.authorId);
        if (author) {
          setStories(author.stories);
          setAuthorName(author.displayName);
        }
      }
    })();
  }, [params.authorId, client]);

  if (stories.length === 0) return <View style={styles.container} />;

  return (
    <StoryViewer
      stories={stories}
      authorName={authorName}
      onDismiss={() => router.back()}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  topGradient: {
    ...StyleSheet.absoluteFill,
    top: 0,
    height: 140,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  safeTop: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
  },
  progressRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingTop: 8,
    gap: 3,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FFF',
    borderRadius: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  authorName: {
    flex: 1,
    color: '#FFF',
    fontWeight: '700',
    fontSize: 15,
  },
  counter: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    marginEnd: 12,
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
});
