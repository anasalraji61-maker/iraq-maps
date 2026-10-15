/**
 * StoriesBar – horizontal scroll of avatar circles with gradient ring.
 * Shows own story first (with + add affordance), then followed users.
 */
import { useSession } from '@iraq-maps/mobile-kit';
import { useRouter } from 'expo-router';
import { type ReactElement, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useStoriesClient } from '../storiesClient';
import { t } from '../strings';
import type { StoryAuthorType } from '@iraq-maps/contracts';

// Gradient ring colours (two-stop linear approximation using borders)
const RING_VIEWED = '#C0C0C0';
const RING_UNVIEWED_END = '#E91E8C';

interface Props {
  onSelectAuthor?: (author: StoryAuthorType) => void;
}

export function StoriesBar({ onSelectAuthor }: Props): ReactElement {
  const router = useRouter();
  const { userId } = useSession();
  const client = useStoriesClient();
  const [authors, setAuthors] = useState<StoryAuthorType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await client.getFeed();
        if (!cancelled && res.status === 200) {
          setAuthors(res.body.authors);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [client]);

  if (loading) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" />
      </View>
    );
  }

  // Separate own author from others
  const myAuthor = authors.find((a) => a.userId === userId);
  const others = authors.filter((a) => a.userId !== userId);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      accessibilityLabel={t('stories.title')}
    >
      {/* Own story bubble */}
      <Pressable
        style={styles.bubble}
        onPress={() => {
          if (myAuthor && myAuthor.stories.length > 0 && onSelectAuthor) {
            onSelectAuthor(myAuthor);
          } else {
            router.push('/discover/stories/create' as Parameters<typeof router.push>[0]);
          }
        }}
        accessibilityRole="button"
        accessibilityLabel={t('stories.yourStory')}
      >
        <View style={[styles.ring, styles.ownRing]}>
          <View style={styles.avatarCircle}>
            {myAuthor && myAuthor.stories.length > 0 ? (
              <Text style={styles.avatarInitial}>
                {myAuthor.displayName.charAt(0).toUpperCase()}
              </Text>
            ) : (
              <Text style={styles.addIcon}>+</Text>
            )}
          </View>
        </View>
        <Text style={styles.label} numberOfLines={1}>
          {t('stories.yourStory')}
        </Text>
      </Pressable>

      {/* Others */}
      {others.map((author) => (
        <Pressable
          key={author.userId}
          style={styles.bubble}
          onPress={() => onSelectAuthor?.(author)}
          accessibilityRole="button"
          accessibilityLabel={author.displayName}
        >
          <View
            style={[
              styles.ring,
              author.hasUnviewed ? styles.unviewedRing : styles.viewedRing,
            ]}
          >
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitial}>
                {author.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          </View>
          <Text style={styles.label} numberOfLines={1}>
            {author.displayName}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const BUBBLE_SIZE = 64;
const RING_WIDTH = 3;

const styles = StyleSheet.create({
  loadingRow: {
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 12,
  },
  bubble: {
    alignItems: 'center',
    width: BUBBLE_SIZE + RING_WIDTH * 2 + 4,
    gap: 4,
  },
  ring: {
    width: BUBBLE_SIZE + RING_WIDTH * 2 + 4,
    height: BUBBLE_SIZE + RING_WIDTH * 2 + 4,
    borderRadius: (BUBBLE_SIZE + RING_WIDTH * 2 + 4) / 2,
    borderWidth: RING_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownRing: {
    borderColor: '#2196F3',
    borderStyle: 'dashed',
  },
  unviewedRing: {
    borderColor: RING_UNVIEWED_END,
  },
  viewedRing: {
    borderColor: RING_VIEWED,
  },
  avatarCircle: {
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 24,
    fontWeight: '700',
    color: '#555',
  },
  addIcon: {
    fontSize: 28,
    fontWeight: '700',
    color: '#2196F3',
  },
  label: {
    fontSize: 11,
    color: '#666',
    maxWidth: BUBBLE_SIZE + RING_WIDTH * 2 + 4,
    textAlign: 'center',
  },
});
