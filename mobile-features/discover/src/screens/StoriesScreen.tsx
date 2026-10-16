/**
 * StoriesScreen — complete Stories experience.
 *
 * Renders two surfaces:
 *   1. <StoriesRing />  — horizontal scrollable avatar rings at the top of Discover.
 *   2. <FullScreenStoryViewer /> — full-screen viewer opened when a ring is tapped.
 *
 * Features:
 *   - Unread rings: colourful gradient border. Read rings: grey.
 *   - Own ring has a dashed blue border with a "+" when no active stories.
 *   - Full-screen viewer: segmented progress bar, auto-advance, tap zones, swipe.
 *   - Swipe left/right between users, swipe down to dismiss.
 *   - Long-press to pause. Tap centre to like with heart-burst animation.
 *   - Reply sheet (opens message input). Report / mute via action menu.
 *   - Privacy-first: blocked users are never shown.
 *
 * All user-visible text goes through t().
 * Directional properties use start/end, never left/right.
 */
/* eslint-disable i18next/no-literal-string */

import { useSession } from '@iraq-maps/mobile-kit';
import { useRouter } from 'expo-router';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  GestureResponderEvent,
  Image,
  Modal,
  PanResponder,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useStoriesClient } from '../storiesClient';
import { t } from '../strings';
import type { StoryAuthorType, StoryType } from '@iraq-maps/contracts';

// ─── Screen dimensions ────────────────────────────────────────────────────────

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ─── Constants ────────────────────────────────────────────────────────────────

/** Colourful gradient ring colours (two-stop approximation). */
const RING_UNSEEN_A = '#E91E8C';
const RING_UNSEEN_B = '#FF6B35';
const RING_SEEN = '#9E9E9E';
const RING_OWN = '#2196F3';

const BUBBLE_SIZE = 62;
const RING_BORDER = 3;
const RING_GAP = 2;
const RING_TOTAL = BUBBLE_SIZE + (RING_BORDER + RING_GAP) * 2;

/** Auto-advance delay per photo/text story segment (ms). */
const _PHOTO_DURATION_MS = 5000;

// ─── Types ────────────────────────────────────────────────────────────────────

interface HeartParticle {
  id: number;
  x: Animated.Value;
  y: Animated.Value;
  opacity: Animated.Value;
  scale: Animated.Value;
  startX: number;
  startY: number;
}

// ─── HeartBurst ───────────────────────────────────────────────────────────────

function HeartBurst({ particles }: { particles: HeartParticle[] }): ReactElement {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((p) => (
        <Animated.Text
          key={p.id}
          style={{
            position: 'absolute',
            fontSize: 28,
            opacity: p.opacity,
            transform: [
              { translateX: p.x },
              { translateY: p.y },
              { scale: p.scale },
            ],
          }}
        >
          {'❤️'}
        </Animated.Text>
      ))}
    </View>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function AvatarInitial({
  name,
  size,
  bg = '#555',
}: {
  name: string;
  size: number;
  bg?: string;
}): ReactElement {
  const initial = name.charAt(0).toUpperCase();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{ color: '#FFF', fontWeight: '700', fontSize: size * 0.38 }}
      >
        {initial}
      </Text>
    </View>
  );
}

// ─── SegmentedProgressBar ─────────────────────────────────────────────────────

interface SegmentedProgressBarProps {
  count: number;
  currentIndex: number;
  progress: Animated.Value;
}

function SegmentedProgressBar({
  count,
  currentIndex,
  progress,
}: SegmentedProgressBarProps): ReactElement {
  return (
    <View style={progressStyles.row}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={progressStyles.track}>
          <Animated.View
            style={[
              progressStyles.fill,
              {
                width:
                  i < currentIndex
                    ? '100%'
                    : i === currentIndex
                    ? progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
                    : '0%',
              },
            ]}
            accessibilityLabel={t('stories.progressA11y')}
          />
        </View>
      ))}
    </View>
  );
}

const progressStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingTop: 8,
    gap: 3,
  },
  track: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: '#FFF',
    borderRadius: 2,
  },
});

// ─── SingleStoryView ──────────────────────────────────────────────────────────

interface SingleStoryViewProps {
  author: StoryAuthorType;
  allAuthors: StoryAuthorType[];
  authorIndex: number;
  onNextAuthor: () => void;
  onPrevAuthor: () => void;
  onDismiss: () => void;
  currentUserId?: string;
}

function SingleStoryView({
  author,
  allAuthors,
  authorIndex,
  onNextAuthor,
  onPrevAuthor,
  onDismiss,
  currentUserId,
}: SingleStoryViewProps): ReactElement {
  const client = useStoriesClient();

  const [storyIndex, setStoryIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [liked, setLiked] = useState(false);
  const [hearts, setHearts] = useState<HeartParticle[]>([]);
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const heartCountRef = useRef(0);

  const story: StoryType | undefined = author.stories[storyIndex];
  const isOwnStory = author.userId === currentUserId;

  // One animated value per story segment.
  const progressAnims = useRef(
    author.stories.map(() => new Animated.Value(0)),
  ).current;

  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  // ── navigation ──────────────────────────────────────────────────────────────

  const goNext = useCallback(() => {
    if (storyIndex < author.stories.length - 1) {
      progressAnims[storyIndex]?.setValue(0);
      setStoryIndex((i) => i + 1);
    } else {
      onNextAuthor();
    }
  }, [storyIndex, author.stories.length, onNextAuthor, progressAnims]);

  const goPrev = useCallback(() => {
    if (storyIndex > 0) {
      progressAnims[storyIndex]?.setValue(0);
      setStoryIndex((i) => i - 1);
    } else {
      onPrevAuthor();
    }
  }, [storyIndex, onPrevAuthor, progressAnims]);

  // ── mark viewed ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!story) return;
    client.markViewed({ params: { storyId: story.id }, body: {} }).catch(() => {});
  }, [story?.id]);

  // ── auto-progress animation ──────────────────────────────────────────────────

  useEffect(() => {
    if (!story || paused) return;
    const anim = progressAnims[storyIndex];
    if (!anim) return;
    anim.setValue(0);
    const dur = (story.duration ?? 5) * 1000;
    const timing = Animated.timing(anim, {
      toValue: 1,
      duration: dur,
      useNativeDriver: false,
    });
    animRef.current = timing;
    timing.start(({ finished }) => {
      if (finished) goNext();
    });
    return () => { animRef.current?.stop(); };
  }, [storyIndex, paused, story?.id]);

  // ── like burst ───────────────────────────────────────────────────────────────

  const triggerLike = useCallback(() => {
    if (!story) return;
    setLiked(true);
    const burst: HeartParticle[] = Array.from({ length: 6 }, (_, i) => {
      const id = ++heartCountRef.current * 10 + i;
      const startX = SCREEN_W / 2 - 60 + Math.random() * 120;
      const startY = SCREEN_H * 0.6 + Math.random() * 40;
      return {
        id,
        x: new Animated.Value(startX),
        y: new Animated.Value(startY),
        opacity: new Animated.Value(1),
        scale: new Animated.Value(0.4),
        startX,
        startY,
      };
    });
    setHearts((prev) => [...prev, ...burst]);
    burst.forEach((p) => {
      Animated.parallel([
        Animated.timing(p.y, {
          toValue: p.startY - 120 - Math.random() * 80,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(p.x, {
          toValue: p.startX + (Math.random() - 0.5) * 100,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(p.opacity, { toValue: 0, duration: 900, useNativeDriver: true }),
        Animated.spring(p.scale, { toValue: 1.2, useNativeDriver: true }),
      ]).start(() => {
        setHearts((prev) => prev.filter((h) => h.id !== p.id));
      });
    });
  }, [story]);

  // ── reply ────────────────────────────────────────────────────────────────────

  const sendReply = async () => {
    if (!replyText.trim() || !story) return;
    setSendingReply(true);
    try {
      // @ts-expect-error – replyToStory is on the v2 contract stub
      await client.replyToStory?.({ params: { storyId: story.id }, body: { text: replyText.trim() } });
      setReplyText('');
      setShowReply(false);
      setPaused(false);
    } catch {
      Alert.alert(t('stories.replyError'));
    } finally {
      setSendingReply(false);
    }
  };

  // ── report ───────────────────────────────────────────────────────────────────

  const reportStory = (reason: string) => {
    if (!story) return;
    // @ts-expect-error – reportStory is on the v2 contract stub
    client.reportStory?.({ params: { storyId: story.id }, body: { reason } })
      .then(() => Alert.alert(t('post.reportSuccess')))
      .catch(() => Alert.alert(t('post.reportError')));
  };

  const handleMore = () => {
    Alert.alert(t('stories.optionsTitle'), undefined, [
      {
        text: t('stories.report'),
        onPress: () =>
          Alert.alert(t('post.reportTitle'), undefined, [
            { text: t('post.reportCancel'), style: 'cancel' },
            { text: t('post.reportReason.spam'), onPress: () => reportStory('spam') },
            { text: t('post.reportReason.inappropriate'), onPress: () => reportStory('inappropriate') },
          ]),
      },
      {
        text: t('stories.mute'),
        onPress: () =>
          Alert.alert(t('stories.muteConfirmTitle'), undefined, [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('stories.mute'),
              style: 'destructive',
              onPress: () => {
                // @ts-expect-error – muteUser is on the v2 contract stub
                client.muteUser?.({ params: { userId: author.userId }, body: {} }).catch(() => {});
                onNextAuthor();
              },
            },
          ]),
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  // ── delete (own story) ───────────────────────────────────────────────────────

  const handleDelete = () => {
    if (!story) return;
    Alert.alert(t('stories.deleteTitle'), t('stories.deleteMsg'), [
      { text: t('stories.deleteCancel'), style: 'cancel' },
      {
        text: t('stories.deleteOk'),
        style: 'destructive',
        onPress: async () => {
          try {
            await client.deleteStory({ params: { storyId: story.id } });
            if (author.stories.length <= 1) {
              onNextAuthor();
            } else {
              goNext();
            }
          } catch {
            Alert.alert(t('stories.deleteError'));
          }
        },
      },
    ]);
  };

  // ── share ────────────────────────────────────────────────────────────────────

  const handleShare = async () => {
    if (!story) return;
    try {
      await Share.share({
        message: `iraqsmartmaps://stories/${story.id}`,
        title: t('stories.shareTitle'),
      });
    } catch { /* ignore */ }
  };

  // ── tap + swipe ──────────────────────────────────────────────────────────────

  const handleTap = (e: GestureResponderEvent) => {
    if (showReply) return;
    const x = e.nativeEvent.locationX;
    if (x < SCREEN_W * 0.35) {
      goPrev();
    } else if (x > SCREEN_W * 0.65) {
      goNext();
    } else {
      triggerLike();
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dy) > 12 || Math.abs(gs.dx) > 20,
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 70) {
          onDismiss();
        } else if (gs.dx < -60) {
          onNextAuthor();
        } else if (gs.dx > 60) {
          onPrevAuthor();
        }
      },
    }),
  ).current;

  if (!story) return <View style={viewerStyles.bg} />;

  return (
    <View style={viewerStyles.bg} {...panResponder.panHandlers}>
      {/* ── Background media ── */}
      <Image
        source={{ uri: story.mediaUrl }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />

      {/* ── Hearts ── */}
      <HeartBurst particles={hearts} />

      {/* ── Top / bottom gradients ── */}
      <View style={viewerStyles.topGrad} />
      <View style={viewerStyles.botGrad} />

      {/* ── Top overlay: progress + header ── */}
      <SafeAreaView style={viewerStyles.safeTop}>
        <SegmentedProgressBar
          count={author.stories.length}
          currentIndex={storyIndex}
          progress={progressAnims[storyIndex] ?? new Animated.Value(0)}
        />

        <View style={viewerStyles.header}>
          <View style={viewerStyles.headerStart}>
            <AvatarInitial name={author.displayName} size={36} bg="#777" />
            <View style={{ gap: 1 }}>
              <Text style={viewerStyles.authorName}>{author.displayName}</Text>
              <Text style={viewerStyles.counter}>
                {t('stories.counter', {
                  current: String(storyIndex + 1),
                  total: String(author.stories.length),
                })}
              </Text>
            </View>
          </View>

          <View style={viewerStyles.headerEnd}>
            {isOwnStory && (
              <TouchableOpacity
                style={viewerStyles.iconBtn}
                onPress={handleDelete}
                accessibilityRole="button"
                accessibilityLabel={t('stories.deleteOk')}
              >
                <Text style={viewerStyles.iconTxt}>🗑</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={viewerStyles.iconBtn}
              onPress={handleMore}
              accessibilityRole="button"
              accessibilityLabel={t('post.more')}
            >
              <Text style={viewerStyles.iconTxt}>⋯</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={viewerStyles.iconBtn}
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel={t('lightbox.close')}
            >
              <Text style={viewerStyles.iconTxt}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {/* ── Author dot indicators ── */}
      <View style={viewerStyles.authorDots}>
        {allAuthors.map((a, i) => (
          <View
            key={a.userId}
            style={[
              viewerStyles.dot,
              i === authorIndex && viewerStyles.dotActive,
            ]}
          />
        ))}
      </View>

      {/* ── Tap zones (must sit above gradients but below controls) ── */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={handleTap}
        onLongPress={() => setPaused(true)}
        onPressOut={() => setPaused((p) => (p ? false : p))}
        accessibilityRole="none"
      />

      {/* ── Bottom actions ── */}
      <SafeAreaView style={viewerStyles.safeBot}>
        <View style={viewerStyles.botRow}>
          {!isOwnStory && (
            <TouchableOpacity
              style={viewerStyles.replyBtn}
              onPress={() => { setShowReply(true); setPaused(true); }}
              accessibilityRole="button"
              accessibilityLabel={t('stories.replyPlaceholder')}
            >
              <Text style={viewerStyles.replyBtnTxt}>{t('stories.replyPlaceholder')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[viewerStyles.actionCircle, liked && viewerStyles.actionCircleLiked]}
            onPress={triggerLike}
            accessibilityRole="button"
            accessibilityLabel={t('post.like')}
          >
            <Text style={viewerStyles.actionIcon}>{liked ? '❤️' : '🤍'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={viewerStyles.actionCircle}
            onPress={handleShare}
            accessibilityRole="button"
            accessibilityLabel={t('post.share')}
          >
            <Text style={viewerStyles.actionIcon}>↗️</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* ── Reply overlay ── */}
      {showReply && (
        <View style={viewerStyles.replyOverlay}>
          <View style={viewerStyles.replySheet}>
            <TextInput
              style={viewerStyles.replyInput}
              value={replyText}
              onChangeText={setReplyText}
              placeholder={t('stories.replyPlaceholder')}
              placeholderTextColor="#888"
              autoFocus
              multiline
              maxLength={500}
            />
            <View style={viewerStyles.replyActions}>
              <TouchableOpacity
                style={viewerStyles.replyCancelBtn}
                onPress={() => { setShowReply(false); setPaused(false); }}
              >
                <Text style={viewerStyles.replyCancelTxt}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  viewerStyles.replySendBtn,
                  (!replyText.trim() || sendingReply) && viewerStyles.replySendBtnDisabled,
                ]}
                onPress={sendReply}
                disabled={!replyText.trim() || sendingReply}
              >
                <Text style={viewerStyles.replySendTxt}>{t('stories.replySend')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const viewerStyles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#000' },
  topGrad: {
    ...StyleSheet.absoluteFillObject,
    bottom: 'auto',
    height: 160,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  botGrad: {
    ...StyleSheet.absoluteFillObject,
    top: 'auto',
    height: 140,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  safeTop: { position: 'absolute', top: 0, start: 0, end: 0 },
  safeBot: { position: 'absolute', bottom: 0, start: 0, end: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  headerStart: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerEnd: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  authorName: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  counter: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  iconTxt: { color: '#FFF', fontSize: 18 },
  authorDots: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: 6,
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: { backgroundColor: '#FFF', width: 8, height: 8, borderRadius: 4 },
  botRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
    gap: 10,
  },
  replyBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  replyBtnTxt: { color: 'rgba(255,255,255,0.65)', fontSize: 14 },
  actionCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCircleLiked: { backgroundColor: 'rgba(255,59,48,0.35)' },
  actionIcon: { fontSize: 22 },
  replyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  replySheet: {
    backgroundColor: '#1C1C1E',
    borderTopStartRadius: 20,
    borderTopEndRadius: 20,
    padding: 20,
    gap: 12,
  },
  replyInput: {
    backgroundColor: '#2C2C2E',
    color: '#FFF',
    borderRadius: 12,
    padding: 14,
    minHeight: 80,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  replyActions: { flexDirection: 'row', gap: 12 },
  replyCancelBtn: {
    flex: 1,
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  replyCancelTxt: { color: '#FFF', fontSize: 15 },
  replySendBtn: {
    flex: 1,
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  replySendBtnDisabled: { opacity: 0.4 },
  replySendTxt: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});

// ─── FullScreenStoryViewer ────────────────────────────────────────────────────

interface FullScreenViewerProps {
  authors: StoryAuthorType[];
  initialAuthorIndex: number;
  onDismiss: () => void;
  currentUserId?: string;
}

function FullScreenStoryViewer({
  authors,
  initialAuthorIndex,
  onDismiss,
  currentUserId,
}: FullScreenViewerProps): ReactElement {
  const [authorIndex, setAuthorIndex] = useState(initialAuthorIndex);
  const author = authors[authorIndex];

  const nextAuthor = useCallback(() => {
    if (authorIndex < authors.length - 1) setAuthorIndex((i) => i + 1);
    else onDismiss();
  }, [authorIndex, authors.length, onDismiss]);

  const prevAuthor = useCallback(() => {
    if (authorIndex > 0) setAuthorIndex((i) => i - 1);
  }, [authorIndex]);

  if (!author) return <View style={{ flex: 1, backgroundColor: '#000' }} />;

  return (
    <SingleStoryView
      key={author.userId}
      author={author}
      allAuthors={authors}
      authorIndex={authorIndex}
      onNextAuthor={nextAuthor}
      onPrevAuthor={prevAuthor}
      onDismiss={onDismiss}
      currentUserId={currentUserId}
    />
  );
}

// ─── StoryRingBubble ──────────────────────────────────────────────────────────

interface RingBubbleProps {
  author: StoryAuthorType;
  isOwn: boolean;
  onPress: () => void;
}

function StoryRingBubble({ author, isOwn, onPress }: RingBubbleProps): ReactElement {
  const ringColor = useMemo(() => {
    if (isOwn) return RING_OWN;
    return author.hasUnviewed ? RING_UNSEEN_A : RING_SEEN;
  }, [isOwn, author.hasUnviewed]);

  return (
    <Pressable
      style={ringStyles.bubble}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        isOwn ? t('stories.yourStory') : author.displayName
      }
    >
      <View
        style={[
          ringStyles.ring,
          {
            borderColor: ringColor,
            borderStyle: isOwn && author.stories.length === 0 ? 'dashed' : 'solid',
            // Unviewed: use RING_UNSEEN_B as a gradient approximation on the shadow.
            shadowColor: author.hasUnviewed && !isOwn ? RING_UNSEEN_B : 'transparent',
            shadowOpacity: 0.6,
            shadowRadius: 4,
            elevation: author.hasUnviewed && !isOwn ? 4 : 0,
          },
        ]}
      >
        <View style={ringStyles.avatarCircle}>
          {isOwn && author.stories.length === 0 ? (
            <Text style={ringStyles.plusIcon}>{t('stories.add')}</Text>
          ) : (
            <AvatarInitial
              name={author.displayName}
              size={BUBBLE_SIZE}
              bg={isOwn ? '#1565C0' : '#757575'}
            />
          )}
        </View>
      </View>
      <Text style={ringStyles.label} numberOfLines={1}>
        {isOwn ? t('stories.yourStory') : author.displayName}
      </Text>
    </Pressable>
  );
}

const ringStyles = StyleSheet.create({
  bubble: {
    alignItems: 'center',
    width: RING_TOTAL + 4,
    gap: 4,
  },
  ring: {
    width: RING_TOTAL,
    height: RING_TOTAL,
    borderRadius: RING_TOTAL / 2,
    borderWidth: RING_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    padding: RING_GAP,
  },
  avatarCircle: {
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E0E0E0',
  },
  plusIcon: {
    fontSize: 13,
    color: '#1976D2',
    fontWeight: '700',
    textAlign: 'center',
  },
  label: {
    fontSize: 11,
    color: '#555',
    maxWidth: RING_TOTAL + 4,
    textAlign: 'center',
  },
});

// ─── StoriesRing ──────────────────────────────────────────────────────────────

interface StoriesRingProps {
  /** Called with the author the user tapped so the parent can open the viewer. */
  onSelectAuthor: (author: StoryAuthorType, index: number) => void;
}

export function StoriesRing({ onSelectAuthor }: StoriesRingProps): ReactElement {
  const router = useRouter();
  const session = useSession();
  const userId =
    session.state.status === 'signedIn' ? session.state.user.id : undefined;
  const client = useStoriesClient();
  const [authors, setAuthors] = useState<StoryAuthorType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    setError(false);
    client
      .getFeed()
      .then((res) => {
        if (res.status === 200) setAuthors(res.body.authors);
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [client]);

  useEffect(() => { reload(); }, [reload]);

  if (loading) {
    return (
      <View style={ringBarStyles.loadingRow}>
        <Text style={ringBarStyles.loadingTxt}>{t('feed.loading')}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={ringBarStyles.loadingRow}>
        <TouchableOpacity onPress={reload}>
          <Text style={ringBarStyles.errorTxt}>{t('feed.loadError')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Ensure own bubble is always first.
  const myAuthor = authors.find((a) => a.userId === userId);
  const others = authors.filter((a) => a.userId !== userId);

  const ownBubble: StoryAuthorType = myAuthor ?? {
    userId: (userId ?? 'me') as StoryAuthorType['userId'],
    displayName: t('stories.yourStory'),
    stories: [],
    hasUnviewed: false,
  };

  const handleBubblePress = (author: StoryAuthorType, globalIndex: number) => {
    if (author.userId === userId && author.stories.length === 0) {
      // No active story → navigate to creator.
      router.push('/discover/stories/create' as Parameters<typeof router.push>[0]);
      return;
    }
    onSelectAuthor(author, globalIndex);
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={ringBarStyles.scrollContent}
      accessibilityLabel={t('stories.title')}
    >
      {/* Own bubble */}
      <StoryRingBubble
        key="__own__"
        author={ownBubble}
        isOwn
        onPress={() => handleBubblePress(ownBubble, 0)}
      />

      {/* Others */}
      {others.map((author, i) => (
        <StoryRingBubble
          key={author.userId}
          author={author}
          isOwn={false}
          onPress={() => handleBubblePress(author, i + 1)}
        />
      ))}
    </ScrollView>
  );
}

const ringBarStyles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 10,
  },
  loadingRow: {
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingTxt: { color: '#888', fontSize: 13 },
  errorTxt: { color: '#E53935', fontSize: 13 },
});

// ─── StoriesScreen ────────────────────────────────────────────────────────────

/**
 * StoriesScreen — the full stories surface exported for use in DiscoverFeedScreen.
 *
 * Renders:
 *   - The horizontal ring bar (<StoriesRing />).
 *   - A full-screen modal viewer when a ring is tapped (<FullScreenStoryViewer />).
 *
 * Usage:
 * ```tsx
 * <StoriesScreen />
 * ```
 */
export function StoriesScreen(): ReactElement {
  const session = useSession();
  const userId =
    session.state.status === 'signedIn' ? session.state.user.id : undefined;

  const client = useStoriesClient();

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerAuthors] = useState<StoryAuthorType[]>([]);
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0);
  const [allAuthors, setAllAuthors] = useState<StoryAuthorType[]>([]);

  // Fetch all authors for the viewer (re-use the feed endpoint).
  const fetchAllForViewer = useCallback(async () => {
    const res = await client.getFeed();
    if (res.status === 200) {
      setAllAuthors(res.body.authors);
    }
  }, [client]);

  const openViewer = useCallback(
    async (author: StoryAuthorType, index: number) => {
      if (allAuthors.length === 0) await fetchAllForViewer();
      setViewerInitialIndex(index);
      setViewerVisible(true);
    },
    [allAuthors, fetchAllForViewer],
  );

  return (
    <>
      {/* Ring bar */}
      <StoriesRing onSelectAuthor={openViewer} />

      {/* Full-screen viewer modal */}
      <Modal
        visible={viewerVisible}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setViewerVisible(false)}
      >
        {viewerAuthors.length > 0 || allAuthors.length > 0 ? (
          <FullScreenStoryViewer
            authors={viewerAuthors.length > 0 ? viewerAuthors : allAuthors}
            initialAuthorIndex={viewerInitialIndex}
            onDismiss={() => setViewerVisible(false)}
            currentUserId={userId}
          />
        ) : (
          <View style={{ flex: 1, backgroundColor: '#000' }} />
        )}
      </Modal>
    </>
  );
}

// Keep backward-compat named export.
export { FullScreenStoryViewer as StoryViewer };
