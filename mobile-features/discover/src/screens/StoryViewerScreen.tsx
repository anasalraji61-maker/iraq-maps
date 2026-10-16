/**
 * StoryViewerScreen – enhanced full-screen story viewer.
 * Features: tap-to-advance, 5s auto-progress, swipe between users,
 * like burst animation, reply to story, view viewers, report, mute, share.
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
import type { StoryType } from '@iraq-maps/contracts';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ─── Types ────────────────────────────────────────────────────────────────────

interface StoryAuthor {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  stories: StoryType[];
}

interface HeartParticle {
  id: number;
  x: Animated.Value;
  y: Animated.Value;
  opacity: Animated.Value;
  scale: Animated.Value;
  startX: number;
  startY: number;
}

// ─── Heart burst ──────────────────────────────────────────────────────────────

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
          {/* eslint-disable-next-line i18next/no-literal-string */}
          {'❤️'}
        </Animated.Text>
      ))}
    </View>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ uri, name, size = 36 }: { uri?: string; name: string; size?: number }): ReactElement {
  const initial = name.charAt(0).toUpperCase();
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#555', alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ color: '#FFF', fontWeight: '700', fontSize: size * 0.4 }}>{initial}</Text>
    </View>
  );
}

// ─── Single story view ────────────────────────────────────────────────────────

interface StoryViewProps {
  author: StoryAuthor;
  allAuthors: StoryAuthor[];
  authorIndex: number;
  onNextAuthor: () => void;
  onPrevAuthor: () => void;
  onDismiss: () => void;
  currentUserId?: string;
}

function StoryView({
  author,
  allAuthors,
  authorIndex,
  onNextAuthor,
  onPrevAuthor,
  onDismiss,
  currentUserId,
}: StoryViewProps): ReactElement {
  const client = useStoriesClient();
  const [storyIndex, setStoryIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [liked, setLiked] = useState(false);
  const [hearts, setHearts] = useState<HeartParticle[]>([]);
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState<{ userId: string; displayName: string }[]>([]);

  const story = author.stories[storyIndex];
  const progressAnims = useRef(author.stories.map(() => new Animated.Value(0))).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const heartCountRef = useRef(0);
  const isOwnStory = author.userId === currentUserId;

  const advanceStory = useCallback(() => {
    if (storyIndex < author.stories.length - 1) {
      progressAnims[storyIndex]!.setValue(0);
      setStoryIndex((i) => i + 1);
    } else {
      onNextAuthor();
    }
  }, [storyIndex, author.stories.length, onNextAuthor, progressAnims]);

  const retreatStory = useCallback(() => {
    if (storyIndex > 0) {
      progressAnims[storyIndex]!.setValue(0);
      setStoryIndex((i) => i - 1);
    } else {
      onPrevAuthor();
    }
  }, [storyIndex, onPrevAuthor, progressAnims]);

  // Mark viewed
  useEffect(() => {
    if (!story) return;
    client.markViewed({ params: { storyId: story.id }, body: {} }).catch(() => {/* ignore */});
  }, [story?.id, client]);

  // Progress animation
  useEffect(() => {
    if (!story || paused) return;
    progressAnims[storyIndex]!.setValue(0);
    const dur = (story.duration ?? 5) * 1000;
    animRef.current = Animated.timing(progressAnims[storyIndex]!, {
      toValue: 1,
      duration: dur,
      useNativeDriver: false,
    });
    animRef.current.start(({ finished }) => {
      if (finished) advanceStory();
    });
    return () => { animRef.current?.stop(); };
  }, [storyIndex, story, paused, advanceStory]);

  // Like with heart burst
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
        Animated.timing(p.y, { toValue: p.startY - 120 - Math.random() * 80, duration: 900, useNativeDriver: true }),
        Animated.timing(p.x, { toValue: p.startX + (Math.random() - 0.5) * 100, duration: 900, useNativeDriver: true }),
        Animated.timing(p.opacity, { toValue: 0, duration: 900, useNativeDriver: true }),
        Animated.spring(p.scale, { toValue: 1.2, useNativeDriver: true }),
      ]).start(() => {
        setHearts((prev) => prev.filter((h) => h.id !== p.id));
      });
    });

    // @ts-expect-error optional method stub
    client.reactToStory?.({ params: { storyId: story.id }, body: { reaction: 'heart' } }).catch(() => {/* ignore */});
  }, [story, client]);

  // Reply
  const sendReply = async () => {
    if (!replyText.trim() || !story) return;
    setSendingReply(true);
    try {
      // @ts-expect-error optional method stub
      await client.replyToStory?.({ params: { storyId: story.id }, body: { text: replyText.trim() } });
      setReplyText('');
      setShowReply(false);
    } catch {
      Alert.alert(t('stories.replyError'));
    } finally {
      setSendingReply(false);
    }
  };

  // Viewers
  const loadViewers = useCallback(async () => {
    if (!story || !isOwnStory) return;
    try {
      // @ts-expect-error optional method stub
      const res = await client.getStoryViewers?.({ params: { storyId: story.id } });
      if (res?.status === 200) {
        setViewers(res.body.viewers ?? []);
        setShowViewers(true);
      }
    } catch {/* ignore */}
  }, [story, client, isOwnStory]);

  // Report / mute
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
            { text: t('stories.mute'), style: 'destructive', onPress: () => { muteUser(); onNextAuthor(); } },
          ]),
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const reportStory = async (reason: string) => {
    if (!story) return;
    try {
      // @ts-expect-error optional method stub
      await client.reportStory?.({ params: { storyId: story.id }, body: { reason } });
      Alert.alert(t('post.reportSuccess'));
    } catch {
      Alert.alert(t('post.reportError'));
    }
  };

  const muteUser = () => {
    // @ts-expect-error optional method stub
    client.muteUser?.({ params: { userId: author.userId }, body: {} }).catch(() => {/* ignore */});
  };

  // Share
  const handleShare = async () => {
    if (!story) return;
    try {
      await Share.share({
        message: `iraqsmartmaps://stories/${story.id}`,
        title: t('stories.shareTitle'),
      });
    } catch {/* ignore */}
  };

  // Tap zones + swipe
  const handleTap = (e: GestureResponderEvent) => {
    if (showReply) return;
    const x = e.nativeEvent.locationX;
    if (x < SCREEN_W * 0.35) {
      retreatStory();
    } else if (x > SCREEN_W * 0.65) {
      advanceStory();
    } else {
      triggerLike();
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 12 || Math.abs(gs.dx) > 20,
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

      {/* Heart burst */}
      <HeartBurst particles={hearts} />

      {/* Gradients */}
      <View style={styles.topGradient} />
      <View style={styles.bottomGradient} />

      {/* Progress bars */}
      <SafeAreaView style={styles.safeTop}>
        <View style={styles.progressRow}>
          {author.stories.map((_, i) => (
            <View key={i} style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width:
                      i < storyIndex
                        ? '100%'
                        : i === storyIndex
                        ? progressAnims[i]!.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
                        : '0%',
                  },
                ]}
                accessibilityLabel={t('stories.progressA11y')}
              />
            </View>
          ))}
        </View>

        {/* Author header */}
        <View style={styles.authorRow}>
          <View style={styles.authorLeft}>
            <Avatar uri={author.avatarUrl} name={author.displayName} size={36} />
            <View style={styles.authorMeta}>
              <Text style={styles.authorName}>{author.displayName}</Text>
              <Text style={styles.storyCounter}>
                {t('stories.counter', { current: String(storyIndex + 1), total: String(author.stories.length) })}
              </Text>
            </View>
          </View>

          <View style={styles.authorRight}>
            {isOwnStory && (
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={loadViewers}
                accessibilityRole="button"
                accessibilityLabel={t('stories.viewers')}
              >
                {/* eslint-disable-next-line i18next/no-literal-string */}
                <Text style={styles.iconBtnText}>👁</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.iconBtn} onPress={handleMore} accessibilityRole="button" accessibilityLabel={t('common.more')}>
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <Text style={styles.iconBtnText}>⋯</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={onDismiss} accessibilityRole="button" accessibilityLabel={t('lightbox.close')}>
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <Text style={styles.iconBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {/* Author dots */}
      <View style={styles.authorDotsRow}>
        {allAuthors.map((a, i) => (
          <View key={a.userId} style={[styles.authorDot, i === authorIndex && styles.authorDotActive]} />
        ))}
      </View>

      {/* Tap zones */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={handleTap}
        onLongPress={() => setPaused(true)}
        onPressOut={() => setPaused(false)}
      />

      {/* Bottom actions */}
      <SafeAreaView style={styles.safeBottom}>
        <View style={styles.bottomRow}>
          {!isOwnStory && (
            <TouchableOpacity
              style={styles.replyInput}
              onPress={() => { setShowReply(true); setPaused(true); }}
              accessibilityRole="button"
            >
              <Text style={styles.replyInputPlaceholder}>{t('stories.replyPlaceholder')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.actionBtn, liked && styles.actionBtnLiked]}
            onPress={triggerLike}
            accessibilityRole="button"
            accessibilityLabel={t('post.like')}
          >
            {/* eslint-disable-next-line i18next/no-literal-string */}
            <Text style={styles.actionBtnIcon}>{liked ? '❤️' : '🤍'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleShare}
            accessibilityRole="button"
            accessibilityLabel={t('post.share')}
          >
            {/* eslint-disable-next-line i18next/no-literal-string */}
            <Text style={styles.actionBtnIcon}>↗️</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Reply overlay */}
      {showReply && (
        <View style={styles.replyOverlay}>
          <View style={styles.replySheet}>
            <TextInput
              style={styles.replyTextField}
              value={replyText}
              onChangeText={setReplyText}
              placeholder={t('stories.replyPlaceholder')}
              placeholderTextColor="#888"
              autoFocus
              multiline
              maxLength={500}
            />
            <View style={styles.replyActions}>
              <TouchableOpacity
                style={styles.replyCancelBtn}
                onPress={() => { setShowReply(false); setPaused(false); }}
              >
                <Text style={styles.replyCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.replySendBtn, !replyText.trim() && styles.replySendBtnDisabled]}
                onPress={sendReply}
                disabled={!replyText.trim() || sendingReply}
              >
                <Text style={styles.replySendText}>{t('stories.replySend')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Viewers modal */}
      <Modal visible={showViewers} transparent animationType="slide" onRequestClose={() => setShowViewers(false)}>
        <View style={styles.viewersOverlay}>
          <View style={styles.viewersSheet}>
            <View style={styles.viewersHeader}>
              <Text style={styles.viewersTitle}>{t('stories.viewersTitle')}</Text>
              <TouchableOpacity onPress={() => setShowViewers(false)} accessibilityRole="button">
                {/* eslint-disable-next-line i18next/no-literal-string */}
                <Text style={styles.viewersClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              {viewers.length === 0 ? (
                <Text style={styles.viewersEmpty}>{t('stories.viewersEmpty')}</Text>
              ) : (
                viewers.map((v) => (
                  <View key={v.userId} style={styles.viewerRow}>
                    <Avatar name={v.displayName} size={32} />
                    <Text style={styles.viewerName}>{v.displayName}</Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Multi-author controller ──────────────────────────────────────────────────

interface MultiStoryViewerProps {
  authors: StoryAuthor[];
  initialAuthorIndex: number;
  onDismiss: () => void;
  currentUserId?: string;
}

function MultiStoryViewer({ authors, initialAuthorIndex, onDismiss, currentUserId }: MultiStoryViewerProps): ReactElement {
  const [authorIndex, setAuthorIndex] = useState(initialAuthorIndex);
  const author = authors[authorIndex];

  const nextAuthor = useCallback(() => {
    if (authorIndex < authors.length - 1) setAuthorIndex((i) => i + 1);
    else onDismiss();
  }, [authorIndex, authors.length, onDismiss]);

  const prevAuthor = useCallback(() => {
    if (authorIndex > 0) setAuthorIndex((i) => i - 1);
  }, [authorIndex]);

  if (!author) return <View style={styles.container} />;

  return (
    <StoryView
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

// ─── Route wrapper ────────────────────────────────────────────────────────────

export function StoryViewerScreen(): ReactElement {
  const router = useRouter();
  const params = useLocalSearchParams<{ authorId?: string }>();
  const client = useStoriesClient();
  const [authors, setAuthors] = useState<StoryAuthor[]>([]);
  const [initialIndex, setInitialIndex] = useState(0);

  useEffect(() => {
    (async () => {
      const res = await client.getFeed();
      if (res.status === 200) {
        setAuthors(res.body.authors);
        const idx = res.body.authors.findIndex((a) => a.userId === params.authorId);
        setInitialIndex(Math.max(0, idx));
      }
    })();
  }, [params.authorId, client]);

  if (authors.length === 0) return <View style={styles.container} />;

  return (
    <MultiStoryViewer
      authors={authors}
      initialAuthorIndex={initialIndex}
      onDismiss={() => router.back()}
    />
  );
}

// Keep backward-compat named export
export { MultiStoryViewer as StoryViewer };

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  topGradient: { ...StyleSheet.absoluteFill, top: 0, height: 160, backgroundColor: 'rgba(0,0,0,0.45)' },
  bottomGradient: { ...StyleSheet.absoluteFill, bottom: 0, top: 'auto', height: 140, backgroundColor: 'rgba(0,0,0,0.45)' },

  safeTop: { position: 'absolute', top: 0, start: 0, end: 0 },
  safeBottom: { position: 'absolute', bottom: 0, start: 0, end: 0 },

  progressRow: { flexDirection: 'row', paddingHorizontal: 8, paddingTop: 8, gap: 3 },
  progressTrack: { flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#FFF', borderRadius: 2 },

  authorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 10 },
  authorLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  authorMeta: { gap: 1 },
  authorName: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  storyCounter: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  authorRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { color: '#FFF', fontSize: 18 },

  authorDotsRow: { position: 'absolute', top: 0, start: 0, end: 0, flexDirection: 'row', justifyContent: 'center', paddingTop: 6, gap: 4 },
  authorDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
  authorDotActive: { backgroundColor: '#FFF', width: 8, height: 8, borderRadius: 4 },

  bottomRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8, gap: 10 },
  replyInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  replyInputPlaceholder: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  actionBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  actionBtnLiked: { backgroundColor: 'rgba(255,59,48,0.3)' },
  actionBtnIcon: { fontSize: 22 },

  replyOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  replySheet: { backgroundColor: '#1C1C1E', borderTopStartRadius: 20, borderTopEndRadius: 20, padding: 20, gap: 12 },
  replyTextField: { backgroundColor: '#2C2C2E', color: '#FFF', borderRadius: 12, padding: 14, minHeight: 80, fontSize: 15, textAlignVertical: 'top' },
  replyActions: { flexDirection: 'row', gap: 12 },
  replyCancelBtn: { flex: 1, backgroundColor: '#2C2C2E', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  replyCancelText: { color: '#FFF', fontSize: 15 },
  replySendBtn: { flex: 1, backgroundColor: '#007AFF', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  replySendBtnDisabled: { opacity: 0.4 },
  replySendText: { color: '#FFF', fontSize: 15, fontWeight: '700' },

  viewersOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  viewersSheet: { backgroundColor: '#1C1C1E', borderTopStartRadius: 20, borderTopEndRadius: 20, maxHeight: SCREEN_H * 0.6, padding: 20 },
  viewersHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  viewersTitle: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  viewersClose: { color: '#FFF', fontSize: 18 },
  viewersEmpty: { color: '#888', textAlign: 'center', paddingVertical: 24, fontSize: 15 },
  viewerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#333' },
  viewerName: { color: '#FFF', fontSize: 15 },
});
