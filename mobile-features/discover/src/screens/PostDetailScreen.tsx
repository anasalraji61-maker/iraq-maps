import { type DiscoverPostType } from '@iraq-maps/contracts';
import { useApi, useSession, shareManager, ShareCard, type ShareCardData, type ShareCardLabels } from '@iraq-maps/mobile-kit';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useCallback, useEffect, useRef, type ReactElement } from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  Alert,
  FlatList,
  I18nManager,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { type z } from 'zod';
import { DiscoverComment } from '@iraq-maps/contracts';
import { ZoomableImage } from '@iraq-maps/ui';
import { useDiscoverClient } from '../client';
import { t } from '../strings';
import { formatRelativeTime, getTypeBadgeColors, sharedStyles, COLORS, CommentCard, CommentInputRow, HashtagText, SkeletonBlock, TypingIndicator } from './shared';

I18nManager.forceRTL(true);

// ─── Skeleton ────────────────────────────────────────────────────────────────

function PostDetailSkeleton(): ReactElement {
  return (
    <View testID="skeleton-post-detail" style={{ padding: 16, gap: 16 }}>
      <View style={{ backgroundColor: '#FFF', borderRadius: 12, padding: 14, gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <SkeletonBlock width={36} height={36} />
          <SkeletonBlock width={80} height={13} />
        </View>
        <SkeletonBlock width={280} height={14} />
        <SkeletonBlock width={200} height={14} />
        <SkeletonBlock width={100} height={11} />
      </View>
      {[1, 2, 3].map((k) => (
        <View key={k} style={{ backgroundColor: '#FFF', borderRadius: 10, padding: 12, gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <SkeletonBlock width={28} height={28} />
            <SkeletonBlock width={70} height={12} />
          </View>
          <SkeletonBlock width={220} height={12} />
        </View>
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

type DiscoverCommentType = z.infer<typeof DiscoverComment>;

// ─── Poll types ───────────────────────────────────────────────────────────────

interface PollOption {
  id: string;
  text: string;
  votes: number;
}

interface PollMeta {
  options: PollOption[];
}

function PollCard({ poll, postId: _postId }: { poll: PollMeta; postId: string }): ReactElement {
  const [votedId, setVotedId] = useState<string | null>(null);
  const [options, setOptions] = useState<PollOption[]>(poll.options);
  const [error, setError] = useState<string | undefined>();

  const total = options.reduce((sum, o) => sum + o.votes, 0);

  const handleVote = useCallback((optionId: string) => {
    if (votedId) { setError(t('poll.alreadyVoted')); return; }
    // Local optimistic update — no API call until poll endpoint exists
    setVotedId(optionId);
    setOptions((prev) => prev.map((o) => o.id === optionId ? { ...o, votes: o.votes + 1 } : o));
  }, [votedId]);

  return (
    <View style={pollStyles.container}>
      {options.map((opt) => {
        const pct = total > 0 ? Math.round((opt.votes / total) * 100) : 0;
        const isVoted = votedId === opt.id;
        return (
          <Pressable
            key={opt.id}
            style={[pollStyles.option, isVoted && pollStyles.optionVoted]}
            onPress={() => handleVote(opt.id)}
            accessibilityRole="button"
            accessibilityLabel={opt.text}
            disabled={!!votedId}
          >
            {votedId ? (
              <View style={[pollStyles.bar, { width: `${pct}%` as unknown as number }]} />
            ) : null}
            <Text style={[pollStyles.optionText, isVoted && pollStyles.optionTextVoted]}>{opt.text}</Text>
            {votedId ? (
              <Text style={pollStyles.pct}>{pct}%</Text>
            ) : null}
          </Pressable>
        );
      })}
      {error ? <Text style={pollStyles.error}>{error}</Text> : null}
      <Text style={pollStyles.total}>{t('poll.totalVotes', { n: total })}</Text>
    </View>
  );
}

const pollStyles = StyleSheet.create({
  container: { marginBottom: 10 },
  option: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  optionVoted: { borderWidth: 1.5, borderColor: COLORS.primary },
  bar: {
    position: 'absolute',
    start: 0,
    top: 0,
    bottom: 0,
    backgroundColor: COLORS.primaryXLight,
    borderRadius: 8,
  },
  optionText: { flex: 1, fontSize: 14, color: COLORS.textPrimary, zIndex: 1 },
  optionTextVoted: { color: COLORS.primary, fontWeight: '600' },
  pct: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '500', zIndex: 1 },
  total: { fontSize: 12, color: COLORS.textMuted, textAlign: 'auto' },
  error: { fontSize: 12, color: COLORS.error, marginBottom: 4 },
});

// ─────────────────────────────────────────────────────────────────────────────

function PostBody({ post, mediaUrls, onHashtagPress, isOwn, onMorePress, onReportPress }: { post: DiscoverPostType; mediaUrls: Readonly<Record<string, string>>; onHashtagPress: (tag: string) => void; isOwn: boolean; onMorePress: () => void; onReportPress: () => void }): ReactElement {
  const badgeColors = getTypeBadgeColors(post.type);
  const [linkCopied, setLinkCopied] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [translatedBody, setTranslatedBody] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);

  const handleShare = useCallback(() => {
    const message = t('post.shareText', { body: post.body, postId: post.id });
    void Share.share({ message });
  }, [post.body, post.id]);

  const handleCopyLink = useCallback(() => {
    const link = `iraqsmartmaps://discover/${post.id}`;
    void Clipboard.setStringAsync(link).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }, [post.id]);

  const handleTranslate = useCallback(() => {
    if (translatedBody) {
      setTranslatedBody(null);
      return;
    }
    setTranslating(true);
    // Mock translation — append "(translated)" suffix after short delay
    setTimeout(() => {
      setTranslatedBody(`${post.body} ${t('translate.translated')}`);
      setTranslating(false);
    }, 600);
  }, [post.body, translatedBody]);

  const mediaItems = post.mediaAssetIds
    .map((id) => ({ id, url: mediaUrls[id] }))
    .filter((img): img is { id: string; url: string } => !!img.url);

  const isVideoUrl = (url: string) => /\.(mp4|webm|mov)(\?|$)/i.test(url);
  const images = mediaItems.filter((m) => !isVideoUrl(m.url));
  const videos = mediaItems.filter((m) => isVideoUrl(m.url));

  // Extract poll from metadata if present (metadata is stored in post as untyped extra field)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pollMeta = ((post as any).metadata as { poll?: PollMeta } | undefined)?.poll;

  return (
    <View style={styles.postCard}>
      <View style={styles.postHeader}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{post.authorId.slice(0, 1).toUpperCase()}</Text>
        </View>
        <Text style={styles.authorText}>{post.authorId.slice(0, 8)}</Text>
        <View style={[styles.typeBadge, { backgroundColor: badgeColors.bg }]}>
          <Text style={[styles.typeText, { color: badgeColors.text }]}>{post.type}</Text>
        </View>
      </View>
      {images.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageStrip} contentContainerStyle={styles.imageStripContent}>
          {images.map((img) => (
            <ZoomableImage key={img.id} source={{ uri: img.url }} style={styles.detailImage} resizeMode="cover" />
          ))}
        </ScrollView>
      )}
      {videos.map((vid) => (
        <View key={vid.id} style={styles.videoWrap} accessibilityLabel={t('video.label')}>
          <View style={styles.videoPlayer}>
            <Text style={styles.videoPlayIcon}>{t('video.play')}</Text>
          </View>
        </View>
      ))}
      <Pressable
        onLongPress={() => {
          void Clipboard.setStringAsync(post.body).then(() => {
            setCopyFeedback(t('postDetail.bodyCopied'));
            setTimeout(() => setCopyFeedback(null), 2000);
          });
        }}
        accessibilityHint={t('postDetail.bodyLongPressHint')}
      >
        <HashtagText
          text={translatedBody ?? post.body}
          style={styles.bodyText}
          onHashtagPress={onHashtagPress}
        />
      </Pressable>
      {copyFeedback ? <Text style={styles.copyFeedback}>{copyFeedback}</Text> : null}
      {pollMeta ? <PollCard poll={pollMeta} postId={post.id} /> : null}
      <View style={styles.metaRow}>
        <Text style={styles.postDate}>{formatRelativeTime(post.createdAt)}</Text>
        {post.viewCount > 0 && (
          <Text style={styles.viewCount}>{t('postDetail.views', { n: post.viewCount })}</Text>
        )}
      </View>
      <View style={styles.actionRow}>
        <Pressable
          style={styles.shareBtn}
          onPress={handleTranslate}
          accessibilityRole="button"
          accessibilityLabel={translatedBody ? t('translate.showOriginal') : t('translate.translate')}
        >
          <Text style={styles.shareBtnText}>
            {translating ? t('translate.translating') : (translatedBody ? t('translate.showOriginal') : t('translate.translate'))}
          </Text>
        </Pressable>
        <Pressable style={styles.shareBtn} onPress={handleShare} accessibilityRole="button" accessibilityLabel={t('post.share')}>
          <Text style={styles.shareBtnText}>{t('post.share')}</Text>
        </Pressable>
        <Pressable
          style={styles.shareBtn}
          onPress={handleCopyLink}
          accessibilityRole="button"
          accessibilityLabel={t('postDetail.copyLink')}
          testID={`post.copyLink.${post.id}`}
        >
          <Text style={styles.shareBtnText}>{linkCopied ? t('postDetail.linkCopied') : t('postDetail.copyLink')}</Text>
        </Pressable>
        {isOwn ? (
          <Pressable
            style={styles.shareBtn}
            onPress={onMorePress}
            accessibilityRole="button"
            accessibilityLabel={t('post.more')}
            testID={`post.more.${post.id}`}
          >
            <Text style={styles.shareBtnText}>{t('post.moreIcon')}</Text>
          </Pressable>
        ) : (
          <Pressable
            style={styles.shareBtn}
            onPress={onReportPress}
            accessibilityRole="button"
            accessibilityLabel={t('postDetail.report')}
            testID={`post.report.${post.id}`}
          >
            <Text style={styles.shareBtnText}>{t('postDetail.report')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}


// ─── Author card ─────────────────────────────────────────────────────────────

interface AuthorCardProps {
  authorId: string;
  onFollow?: () => void;
  isFollowing?: boolean;
  onViewProfile: () => void;
}

function AuthorCard({ authorId, isFollowing = false, onFollow, onViewProfile }: AuthorCardProps): ReactElement {
  return (
    <View style={authorStyles.card} accessibilityRole="none" accessibilityLabel={t('postDetail.authorTitle')}>
      <Text style={authorStyles.sectionTitle}>{t('postDetail.authorTitle')}</Text>
      <View style={authorStyles.row}>
        <Pressable onPress={onViewProfile} accessibilityRole="button" accessibilityLabel={authorId}>
          <View style={authorStyles.avatar}>
            <Text style={authorStyles.avatarText} allowFontScaling={false}>
              {authorId.slice(0, 1).toUpperCase()}
            </Text>
          </View>
        </Pressable>
        <Pressable style={authorStyles.nameBlock} onPress={onViewProfile} accessibilityRole="button">
          <Text style={authorStyles.authorId} numberOfLines={1}>{authorId.slice(0, 8)}</Text>
          <Text style={authorStyles.authorSub} numberOfLines={1}>@{authorId.slice(0, 12)}</Text>
        </Pressable>
        {onFollow != null && (
          <Pressable
            style={[authorStyles.followBtn, isFollowing && authorStyles.followBtnActive]}
            onPress={onFollow}
            accessibilityRole="button"
            accessibilityLabel={isFollowing ? t('postDetail.authorFollowingBtn') : t('postDetail.authorFollowBtn')}
          >
            <Text style={[authorStyles.followBtnText, isFollowing && authorStyles.followBtnTextActive]}>
              {isFollowing ? t('postDetail.authorFollowingBtn') : t('postDetail.authorFollowBtn')}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const authorStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  sectionTitle: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  nameBlock: { flex: 1, gap: 2 },
  authorId: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  authorSub: { fontSize: 12, color: COLORS.textMuted },
  followBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.primary },
  followBtnActive: { backgroundColor: COLORS.primary },
  followBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
  followBtnTextActive: { color: '#FFF' },
});

// ─── App download banner ──────────────────────────────────────────────────────

function AppDownloadBanner(): ReactElement {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return <></>;
  return (
    <View style={bannerStyles.banner} accessibilityRole="none" accessibilityLabel={t('postDetail.downloadBannerTitle')}>
      <View style={bannerStyles.content}>
        <View style={bannerStyles.iconContainer}>
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <Text style={bannerStyles.icon} allowFontScaling={false}>🗺️</Text>
        </View>
        <View style={bannerStyles.textBlock}>
          <Text style={bannerStyles.title}>{t('postDetail.downloadBannerTitle')}</Text>
          <Text style={bannerStyles.body} numberOfLines={2}>{t('postDetail.downloadBannerBody')}</Text>
        </View>
      </View>
      <View style={bannerStyles.actions}>
        <Pressable
          style={bannerStyles.downloadBtn}
          onPress={() => {
            // Deep link to app stores — stub
            const url = Platform.OS === 'ios'
              ? 'https://apps.apple.com/app/iraq-smart-maps'
              : 'https://play.google.com/store/apps/details?id=app.iraqsmartmaps';
            void Linking.openURL(url).catch(() => {});
          }}
          accessibilityRole="link"
          accessibilityLabel={t('postDetail.downloadBannerBtn')}
        >
          <Text style={bannerStyles.downloadBtnText}>{t('postDetail.downloadBannerBtn')}</Text>
        </Pressable>
        <Pressable
          style={bannerStyles.dismissBtn}
          onPress={() => setDismissed(true)}
          accessibilityRole="button"
          accessibilityLabel={t('postDetail.dismissA11y')}
        >
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <Text style={bannerStyles.dismissText} allowFontScaling={false}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  banner: {
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  iconContainer: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },
  icon: { fontSize: 22 },
  textBlock: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  body: { fontSize: 12, color: COLORS.textSecondary },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  downloadBtn: {
    flex: 1, backgroundColor: COLORS.primary,
    borderRadius: 8, paddingVertical: 9, alignItems: 'center',
  },
  downloadBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  dismissBtn: { padding: 8 },
  dismissText: { fontSize: 14, color: COLORS.textMuted },
});

// ─── Related posts ────────────────────────────────────────────────────────────

interface RelatedPostsProps {
  currentPostId: string;
  onPostPress: (postId: string) => void;
  apiClient: ReturnType<typeof useDiscoverClient>;
}

function RelatedPosts({ currentPostId, onPostPress, apiClient }: RelatedPostsProps): ReactElement {
  const [posts, setPosts] = useState<DiscoverPostType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void apiClient
      .listFeed({ query: { limit: 5 } })
      .then((res) => {
        if (res.status === 200) {
          setPosts(res.body.items.filter((p) => p.id !== currentPostId).slice(0, 4));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [currentPostId, apiClient]);

  if (loading) {
    return (
      <View style={relatedStyles.container}>
        <Text style={relatedStyles.sectionTitle}>{t('postDetail.relatedTitle')}</Text>
        {[1, 2].map((k) => (
          <View key={k} style={relatedStyles.skeletonCard}>
            <View style={relatedStyles.skeletonAvatar} />
            <View style={{ flex: 1, gap: 6 }}>
              <View style={relatedStyles.skeletonLine} />
              <View style={[relatedStyles.skeletonLine, { width: '60%' }]} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  if (posts.length === 0) {
    return <></>;
  }

  return (
    <View style={relatedStyles.container} accessibilityRole="none" accessibilityLabel={t('postDetail.relatedTitle')}>
      <Text style={relatedStyles.sectionTitle}>{t('postDetail.relatedTitle')}</Text>
      {posts.map((p) => (
        <Pressable
          key={p.id}
          style={({ pressed }) => [relatedStyles.card, pressed && relatedStyles.cardPressed]}
          onPress={() => onPostPress(p.id)}
          accessibilityRole="button"
          accessibilityLabel={p.body.slice(0, 60)}
        >
          <View style={relatedStyles.cardAvatar}>
            <Text style={relatedStyles.cardAvatarText} allowFontScaling={false}>
              {p.authorId.slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={relatedStyles.cardAuthor} numberOfLines={1}>{p.authorId.slice(0, 8)}</Text>
            <Text style={relatedStyles.cardBody} numberOfLines={2}>{p.body}</Text>
            <Text style={relatedStyles.cardMeta}>{formatRelativeTime(p.createdAt)}</Text>
          </View>
          <View style={[relatedStyles.typeBadge, { backgroundColor: getTypeBadgeColors(p.type).bg }]}>
            <Text style={[relatedStyles.typeText, { color: getTypeBadgeColors(p.type).text }]}>{p.type}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const relatedStyles = StyleSheet.create({
  container: { marginBottom: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8, paddingHorizontal: 4 },
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#FFF', borderRadius: 10, padding: 12, marginBottom: 8,
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
  },
  cardPressed: { backgroundColor: '#F3F4F6' },
  cardAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  cardAvatarText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  cardAuthor: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary },
  cardBody: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },
  cardMeta: { fontSize: 11, color: COLORS.textMuted },
  typeBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  typeText: { fontSize: 11, fontWeight: '600' },
  skeletonCard: { flexDirection: 'row', gap: 10, padding: 12, marginBottom: 8, backgroundColor: '#FFF', borderRadius: 10 },
  skeletonAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#E5E7EB' },
  skeletonLine: { height: 12, borderRadius: 6, backgroundColor: '#E5E7EB', width: '80%' },
});

// ─── Share sheet (post) ───────────────────────────────────────────────────────

interface PostShareSheetProps {
  visible: boolean;
  onClose: () => void;
  post: DiscoverPostType;
}

function PostShareSheet({ visible, onClose, post }: PostShareSheetProps): ReactElement {
  const [cardVisible, setCardVisible] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const payload = shareManager.sharePost({
    id: post.id,
    authorName: post.authorId.slice(0, 12),
    bodyPreview: post.body,
  });

  const cardData: ShareCardData = shareManager.sharePostCard({
    id: post.id,
    authorName: post.authorId.slice(0, 12),
    bodyPreview: post.body,
  });

  const cardLabels: ShareCardLabels = {
    brandName: t('postDetail.cardBrandName'),
    footerTagline: t('postDetail.cardFooterTagline'),
    exportA11y: t('postDetail.cardExportA11y'),
    exportBtn: t('postDetail.cardExportBtn'),
    typeLabels: {
      place: t('postDetail.cardTypePlace'),
      post: t('postDetail.cardTypePost'),
      route: t('postDetail.cardTypeRoute'),
      event: t('postDetail.cardTypeEvent'),
      profile: t('postDetail.cardTypeProfile'),
    },
  };

  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(payload.url);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch { /* copy failed — show no feedback */ }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} accessibilityViewIsModal>
      <Pressable style={shareSheetStyles.backdrop} onPress={onClose} />
      <View style={shareSheetStyles.sheet}>
        <View style={shareSheetStyles.handleBar} />
        <Text style={shareSheetStyles.sheetTitle}>{t('postDetail.shareSheetTitle')}</Text>
        <View style={shareSheetStyles.actions}>
          {/* eslint-disable i18next/no-literal-string */}
          {([
            { id: 'wa', icon: '💬', label: t('postDetail.whatsapp'), onPress: () => {
              const url = `whatsapp://send?text=${encodeURIComponent(payload.message)}`;
              void Linking.openURL(url).catch(() => Share.share({ message: payload.message }));
            }},
            { id: 'tg', icon: '✈️', label: t('postDetail.telegram'), onPress: () => {
              const url = `tg://msg?text=${encodeURIComponent(payload.message)}`;
              void Linking.openURL(url).catch(() => Share.share({ message: payload.message }));
            }},
            { id: 'copy', icon: copyFeedback ? '✅' : '🔗', label: copyFeedback ? t('postDetail.copied') : t('postDetail.copyLink'), onPress: handleCopy },
            { id: 'more', icon: '⋯', label: t('postDetail.moreOptions'), onPress: () => Share.share({ message: payload.message, title: payload.title }) },
          ] as Array<{ id: string; icon: string; label: string; onPress: () => void | Promise<void> }>).map((a) => (
            <Pressable
              key={a.id}
              style={({ pressed }) => [shareSheetStyles.actionItem, pressed && shareSheetStyles.actionItemPressed]}
              onPress={() => void a.onPress()}
              accessibilityRole="button"
              accessibilityLabel={a.label}
            >
              <View style={shareSheetStyles.actionIconBg}>
                <Text style={shareSheetStyles.actionIcon} allowFontScaling={false}>{a.icon}</Text>
              </View>
              <Text style={shareSheetStyles.actionLabel}>{a.label}</Text>
            </Pressable>
          ))}
          {/* eslint-enable i18next/no-literal-string */}
        </View>

        <Pressable
          style={shareSheetStyles.cardToggle}
          onPress={() => setCardVisible((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: cardVisible }}
        >
          <Text style={shareSheetStyles.cardToggleLabel}>{t('postDetail.shareCard')}</Text>
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <Text style={shareSheetStyles.cardToggleChevron} allowFontScaling={false}>{cardVisible ? '▲' : '▼'}</Text>
        </Pressable>

        {cardVisible && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            <ShareCard data={cardData} labels={cardLabels} testID="post-share-card" />
          </View>
        )}

        <Pressable style={shareSheetStyles.cancelBtn} onPress={onClose} accessibilityRole="button">
          <Text style={shareSheetStyles.cancelText}>{t('postDetail.cancel')}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const shareSheetStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: '#FFF', borderTopStartRadius: 20, borderTopEndRadius: 20,
    maxHeight: '85%', overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 8,
  },
  handleBar: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginTop: 10 },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  actions: { flexDirection: 'row', paddingHorizontal: 12, gap: 8, paddingBottom: 12 },
  actionItem: { flex: 1, alignItems: 'center', gap: 6, padding: 8, borderRadius: 10, backgroundColor: '#F9FAFB' },
  actionItemPressed: { backgroundColor: '#EEF2FF' },
  actionIconBg: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  actionIcon: { fontSize: 20 },
  actionLabel: { fontSize: 11, color: COLORS.textPrimary, fontWeight: '500', textAlign: 'center' },
  cardToggle: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#F9FAFB' },
  cardToggleLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  cardToggleChevron: { fontSize: 11, color: COLORS.textMuted },
  cancelBtn: { marginHorizontal: 16, marginBottom: 24, marginTop: 4, paddingVertical: 13, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
});

// ─────────────────────────────────────────────────────────────────────────────

export function PostDetailScreen(): ReactElement {
  const { postId, postJson } = useLocalSearchParams<{ postId: string; postJson?: string }>();
  const api = useDiscoverClient();
  const extApi = useApi();
  const router = useRouter();
  const session = useSession();
  const currentUserId = session.state.status === 'signedIn' ? session.state.user.id : undefined;
  const handleHashtagPress = useCallback((tag: string) => {
    router.push({ pathname: '/discover/hashtag/[tag]', params: { tag: tag.slice(1) } });
  }, [router]);

  // Parse post from navigation params (passed by DiscoverFeedScreen to avoid a redundant feed fetch)
  const initialPost = postJson ? (() => { try { return JSON.parse(postJson) as DiscoverPostType; } catch { return undefined; } })() : undefined;

  const [post, setPost] = useState<DiscoverPostType | undefined>(initialPost);
  const [editVisible, setEditVisible] = useState(false);
  const [editBody, setEditBody] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [comments, setComments] = useState<DiscoverCommentType[]>([]);
  const [loading, setLoading] = useState(!initialPost);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<Readonly<Record<string, string>>>({});
  const [shareVisible, setShareVisible] = useState(false);
  const [isFollowingAuthor, setIsFollowingAuthor] = useState(false);
  const fetchingAssetIds = useRef(new Set<string>());
  const listRef = useRef<FlatList>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (!postId) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(undefined);
    try {
      // If we don't have the post (came from a deep link), fetch it first
      const [postRes, commentsRes] = await Promise.all([
        post && !isRefresh ? null : api.getPost({ params: { postId } }),
        api.listComments({ params: { postId }, query: { limit: 20 } }),
      ]);
      if (postRes && postRes.status === 200) setPost(postRes.body);
      if (commentsRes.status === 200) setComments(commentsRes.body.items);
    } catch {
      setError(t('postDetail.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api, post, postId]);

  useEffect(() => { void loadData(false); }, [loadData]);

  // Fetch signed read URLs for all media assets of this post
  useEffect(() => {
    if (!post || post.mediaAssetIds.length === 0) return;
    const assetIds = post.mediaAssetIds.filter((id) => !mediaUrls[id] && !fetchingAssetIds.current.has(id));
    if (assetIds.length === 0) return;
    assetIds.forEach((id) => fetchingAssetIds.current.add(id));
    void Promise.all(
      assetIds.map(async (assetId) => {
        try {
          const res = await extApi.media.readUrl({ params: { assetId }, query: { size: 'medium' } });
          if (res.status === 200) {
            setMediaUrls((prev) => ({ ...prev, [assetId]: res.body.url }));
          }
        } catch {
          // silent — image won't show
        } finally {
          fetchingAssetIds.current.delete(assetId);
        }
      }),
    );
  // post?.id as dep: re-fetch only when the post changes, not on every mediaUrls update
  }, [post?.id]); // extApi ref is stable; deliberate partial deps

  const handleRefresh = useCallback(() => { void loadData(true); }, [loadData]);

  const handleLikeComment = useCallback((commentId: string, currentlyLiked: boolean) => {
    const fn = currentlyLiked
      ? api.unlikeComment({ params: { commentId: commentId as Parameters<typeof api.unlikeComment>[0]['params']['commentId'] } })
      : api.likeComment({ params: { commentId: commentId as Parameters<typeof api.likeComment>[0]['params']['commentId'] }, body: {} });
    void fn.then((res) => {
      if (res.status === 200) {
        setComments((prev) =>
          prev.map((c) =>
            c.id === commentId
              ? { ...c, likeCount: res.body.likeCount, isLikedByMe: !currentlyLiked }
              : c,
          ),
        );
      }
    }).catch(() => { /* silent */ });
  }, [api]);

  const handleSend = useCallback(async () => {
    const text = commentText.trim();
    if (!text || sending || !postId) return;
    setSending(true);
    try {
      const res = await api.createComment({ params: { postId }, body: { body: text } });
      if (res.status === 201) {
        setCommentText('');
        setComments((prev) => [...prev, res.body]);
        setPost((prev) => prev ? { ...prev, commentCount: prev.commentCount + 1 } : prev);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch {
      // silent
    } finally {
      setSending(false);
    }
  }, [api, commentText, postId, sending]);

  const handleMorePress = useCallback(() => {
    if (!post) return;
    Alert.alert(
      t('post.more'),
      undefined,
      [
        {
          text: t('post.edit'),
          onPress: () => { setEditBody(post.body); setEditVisible(true); },
        },
        {
          text: t('post.delete'),
          style: 'destructive' as const,
          onPress: () => Alert.alert(
            t('post.deleteConfirmTitle'),
            t('post.deleteConfirmMsg'),
            [
              { text: t('post.reportCancel'), style: 'cancel' as const },
              {
                text: t('post.deleteConfirmOk'),
                style: 'destructive' as const,
                onPress: () => {
                  void api.deletePost({ params: { postId: post.id } }).then(() => router.back()).catch(() => Alert.alert(t('post.deleteError')));
                },
              },
            ],
          ),
        },
        { text: t('post.reportCancel'), style: 'cancel' as const },
      ],
    );
  }, [post, api, router]);

  const handleDeleteComment = useCallback((commentId: string) => {
    if (!post) return;
    Alert.alert(
      t('postDetail.deleteCommentTitle'),
      t('postDetail.deleteCommentMsg'),
      [
        { text: t('post.reportCancel'), style: 'cancel' as const },
        {
          text: t('post.deleteConfirmOk'),
          style: 'destructive' as const,
          onPress: () => {
            void api.deleteComment({ params: { postId: post.id, commentId: commentId as Parameters<typeof api.deleteComment>[0]['params']['commentId'] } }).then((res) => {
              if (res.status === 204) {
                setComments((prev) => prev.filter((c) => c.id !== commentId));
                setPost((prev) => prev ? { ...prev, commentCount: Math.max(0, prev.commentCount - 1) } : prev);
              }
            }).catch(() => { /* silent */ });
          },
        },
      ],
    );
  }, [post, api]);

  const handleReportPress = useCallback(() => {
    if (!post) return;
    const reasons = ['spam', 'inappropriate', 'misinformation', 'other'] as const;
    Alert.alert(
      t('postDetail.reportTitle'),
      t('postDetail.reportBody'),
      [
        ...reasons.map((reason) => ({
          text: t(`postDetail.reason_${reason}`),
          onPress: () => {
            void extApi.discover.reportPost({ params: { postId: post.id }, body: { reason } }).catch(() => {
              Alert.alert(t('postDetail.reportError'));
            });
          },
        })),
        { text: t('post.reportCancel'), style: 'cancel' as const },
      ],
    );
  }, [post, extApi]);

  const handleSaveEdit = useCallback(async () => {
    if (!post || editBody.trim().length === 0) return;
    setEditSaving(true);
    try {
      const res = await api.updatePost({ params: { postId: post.id }, body: { body: editBody.trim() } });
      if (res.status === 200) {
        setPost((prev) => prev ? { ...prev, body: res.body.body } : prev);
        setEditVisible(false);
      } else {
        Alert.alert(t('post.editError'));
      }
    } catch {
      Alert.alert(t('post.editError'));
    } finally {
      setEditSaving(false);
    }
  }, [api, post, editBody]);

  if (loading) {
    return <PostDetailSkeleton />;
  }

  if (error || !post) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error ?? t('postDetail.loadError')}</Text>
      </View>
    );
  }

  const sectionHeader = (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{t('postDetail.commentsSection')}</Text>
    </View>
  );

  return (
    <>
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={80}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('postDetail.title')}</Text>
      </View>
      <FlatList
        ref={listRef}
        data={comments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} />
        }
        ListHeaderComponent={
          <>
            <PostBody post={post} mediaUrls={mediaUrls} onHashtagPress={handleHashtagPress} isOwn={currentUserId === post.authorId} onMorePress={handleMorePress} onReportPress={handleReportPress} />

            {/* Share button row */}
            <Pressable
              style={extraStyles.sharePostBtn}
              onPress={() => setShareVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={t('postDetail.sharePostBtn')}
            >
              <Text style={extraStyles.sharePostBtnText}>{'📤 ' + t('postDetail.sharePostBtn')}</Text>
            </Pressable>

            {/* Author card */}
            <AuthorCard
              authorId={post.authorId}
              isFollowing={isFollowingAuthor}
              onFollow={() => setIsFollowingAuthor((v) => !v)}
              onViewProfile={() => router.push({ pathname: '/discover/user/[id]', params: { id: post.authorId } })}
            />

            {/* App download banner (visible to non-signed-in users) */}
            {!currentUserId && <AppDownloadBanner />}

            {/* Related posts */}
            <RelatedPosts
              currentPostId={post.id}
              apiClient={api}
              onPostPress={(id) => router.push({ pathname: '/discover/post/[id]', params: { postId: id } })}
            />

            {sectionHeader}
          </>
        }
        renderItem={({ item }) => <CommentCard item={item} onLike={handleLikeComment} onDelete={handleDeleteComment} currentUserId={currentUserId ?? undefined} smallAvatar t={t} />}
        ListFooterComponent={commentText.trim().length > 0 ? <TypingIndicator t={t} /> : null}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('comments.empty')}</Text>
          </View>
        }
      />
      <CommentInputRow
        value={commentText}
        onChangeText={setCommentText}
        onSend={handleSend}
        sending={sending}
        t={t}
      />
    </KeyboardAvoidingView>
    {post && (
      <PostShareSheet
        visible={shareVisible}
        onClose={() => setShareVisible(false)}
        post={post}
      />
    )}
    <Modal
      visible={editVisible} animationType="slide" transparent onRequestClose={() => setEditVisible(false)}>
      <View style={styles.editOverlay}>
        <View style={styles.editSheet}>
          <Text style={styles.editTitle}>{t('post.editTitle')}</Text>
          <TextInput
            style={styles.editInput}
            value={editBody}
            onChangeText={setEditBody}
            multiline
            maxLength={1000}
            placeholder={t('post.editPlaceholder')}
            accessibilityLabel={t('post.editTitle')}
            testID="post.editInput"
          />
          <Text style={styles.editCharCount}>{t('post.editCharCount', { n: 1000 - editBody.length })}</Text>
          <View style={styles.editActions}>
            <Pressable style={[styles.shareBtn, styles.editCancelBtn]} onPress={() => setEditVisible(false)} accessibilityRole="button">
              <Text style={styles.shareBtnText}>{t('post.editCancel')}</Text>
            </Pressable>
            <Pressable
              style={editSaving || editBody.trim().length === 0 ? [styles.shareBtn, styles.editSaveBtn, styles.editSaveBtnDisabled] : [styles.shareBtn, styles.editSaveBtn]}
              onPress={() => void handleSaveEdit()}
              accessibilityRole="button"
              disabled={editSaving || editBody.trim().length === 0}
              testID="post.editSave"
            >
              <Text style={[styles.shareBtnText, { color: '#FFF' }]}>{t('post.editSave')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: sharedStyles.container,
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: sharedStyles.header,
  headerTitle: sharedStyles.headerTitle,
  listContent: sharedStyles.listContent,
  postCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  avatarCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  commentAvatar: { width: 28, height: 28, borderRadius: 14 },
  avatarText: sharedStyles.avatarText,
  authorText: { flex: 1, fontSize: 14, color: COLORS.textSecondary, fontWeight: '500', textAlign: 'auto' },
  typeBadge: { backgroundColor: COLORS.primaryXLight, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  typeText: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },
  bodyText: { fontSize: 16, color: COLORS.textPrimary, lineHeight: 24, textAlign: 'auto', marginBottom: 8 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  postDate: { fontSize: 12, color: COLORS.textMuted, textAlign: 'auto' },
  viewCount: { fontSize: 12, color: COLORS.textMuted, textAlign: 'auto' },
  copyFeedback: { fontSize: 12, color: COLORS.primary ?? '#1976D2', textAlign: 'auto', marginBottom: 4 },
  imageStrip: { marginBottom: 10, marginHorizontal: -14 },
  imageStripContent: { paddingHorizontal: 14, gap: 8 },
  detailImage: { width: 240, height: 180, borderRadius: 10 },
  videoWrap: { marginBottom: 10, borderRadius: 10, overflow: 'hidden', backgroundColor: '#000' },
  videoPlayer: { width: '100%', height: 220, alignItems: 'center', justifyContent: 'center' },
  videoPlayIcon: { fontSize: 48, color: '#FFF' },
  actionRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  shareBtn: { backgroundColor: COLORS.inputBg, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  shareBtnText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '500' },
  sectionHeader: { paddingHorizontal: 4, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border, marginBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#333', textAlign: 'auto' },
  commentCard: sharedStyles.commentCard,
  commentHeader: sharedStyles.commentHeader,
  commentMeta: sharedStyles.commentMeta,
  commentAuthor: sharedStyles.commentAuthor,
  commentDate: sharedStyles.commentDate,
  commentBody: sharedStyles.commentBody,
  commentActions: sharedStyles.commentActions,
  commentActionBtn: sharedStyles.commentActionBtn,
  commentActionBtnActive: sharedStyles.commentActionBtnActive,
  commentActionText: sharedStyles.commentActionText,
  commentActionTextActive: sharedStyles.commentActionTextActive,
  emptyContainer: { alignItems: 'center', paddingTop: 40 },
  emptyText: sharedStyles.emptyText,
  errorText: { fontSize: 15, color: COLORS.error, textAlign: 'center', padding: 16 },
  inputRow: sharedStyles.inputRow,
  input: sharedStyles.input,
  sendBtn: sharedStyles.sendBtn,
  sendBtnDisabled: sharedStyles.sendBtnDisabled,
  sendBtnText: sharedStyles.sendBtnText,
  editOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  editSheet: { backgroundColor: '#FFF', borderTopStartRadius: 16, borderTopEndRadius: 16, padding: 20, gap: 12 },
  editTitle: { fontSize: 18, fontWeight: '600', color: COLORS.textPrimary, textAlign: 'auto' },
  editInput: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 12, fontSize: 16, minHeight: 100, textAlignVertical: 'top', textAlign: 'auto' },
  editCharCount: { fontSize: 12, color: COLORS.textMuted, textAlign: 'auto' },
  editActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  editCancelBtn: {},
  editSaveBtn: { backgroundColor: COLORS.primary },
  editSaveBtnDisabled: { backgroundColor: COLORS.border },
});

const extraStyles = StyleSheet.create({
  sharePostBtn: {
    marginHorizontal: 0,
    marginBottom: 10,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    alignItems: 'center',
  },
  sharePostBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3730A3',
  },
});
