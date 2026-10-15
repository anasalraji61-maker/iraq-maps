/**
 * Shared UI primitives and style tokens used across discover screens.
 * Keep this file free of screen-specific state or navigation logic.
 */
import { useState, useCallback, useEffect, useRef, type ReactElement, Fragment } from 'react';
import React from 'react';
import { Alert, ActivityIndicator, Animated, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { type t as TFunc } from '../strings';

// ─── Hashtag utilities ────────────────────────────────────────────────────────

/** Extract all unique lowercase hashtags from post body text. */
export function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  return [...new Set(matches.map((h) => h.toLowerCase()))];
}

type TextPart = { kind: 'text'; value: string } | { kind: 'hashtag'; value: string };

/** Split text into plain text parts and hashtag parts. */
export function parseTextWithHashtags(text: string): TextPart[] {
  const parts: TextPart[] = [];
  const regex = /#[\p{L}\p{N}_]+/gu;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push({ kind: 'text', value: text.slice(last, match.index) });
    parts.push({ kind: 'hashtag', value: match[0] });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) });
  return parts;
}

/** Render text with tappable #hashtag links. */
export function HashtagText({
  text,
  style,
  onHashtagPress,
}: {
  text: string;
  style?: object;
  onHashtagPress: (tag: string) => void;
}): ReactElement {
  const parts = parseTextWithHashtags(text);
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        part.kind === 'hashtag' ? (
          <Text
            key={i}
            style={{ color: COLORS.primary, fontWeight: '600' }}
            onPress={() => onHashtagPress(part.value)}
            accessibilityRole="link"
          >
            {part.value}
          </Text>
        ) : (
          <Fragment key={i}>{part.value}</Fragment>
        ),
      )}
    </Text>
  );
}

export const COLORS = {
  primary: '#1976D2',
  primaryDark: '#1565C0',
  primaryLight: '#BBDEFB',
  primaryXLight: '#E3F2FD',
  error: '#C62828',
  errorBg: '#FFEBEE',
  surface: '#FFF',
  background: '#F5F5F5',
  textPrimary: '#222',
  textSecondary: '#555',
  textMuted: '#999',
  border: '#DDD',
  divider: '#E0E0E0',
  muted: '#B0BEC5',
  inputBg: '#F0F0F0',
  success: '#388E3C',
  successBg: '#E8F5E9',
} as const;

const DEFAULT_BADGE = { bg: COLORS.primaryXLight, text: COLORS.primary } as const;

export const TYPE_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  photo: { bg: COLORS.primaryXLight, text: COLORS.primary },
  tip:   { bg: COLORS.successBg, text: COLORS.success },
  event: { bg: '#FFF3E0', text: '#F57C00' },
  offer: { bg: '#FFEBEE', text: '#D32F2F' },
};

export function getTypeBadgeColors(type: string): { bg: string; text: string } {
  return TYPE_BADGE_COLORS[type] ?? DEFAULT_BADGE;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

export function SkeletonBlock({ width, height }: { width: number; height: number }): ReactElement {
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
  return <Animated.View style={[{ width, height, backgroundColor: '#E0E0E0', borderRadius: 6 }, { opacity }]} accessibilityElementsHidden />;
}

export function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 < 100 ? 0 : 1)}k`;
  return String(n);
}

export function formatRelativeTime(isoDate: string, tFn?: typeof TFunc): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (!tFn) {
    if (minutes < 1) return '< 1m';
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  }
  if (minutes < 1) return tFn('timeNow');
  if (minutes < 60) return tFn('timeMinutes', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return tFn('timeHours', { n: hours });
  return tFn('timeDays', { n: Math.floor(hours / 24) });
}

export const sharedStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  headerTitle: {
    color: COLORS.surface,
    fontSize: 18,
    fontWeight: '600',
  },
  errorRow: {
    backgroundColor: COLORS.errorBg,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 13,
    textAlign: 'auto',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 15,
    color: COLORS.textMuted,
  },
  listContent: {
    padding: 12,
    paddingBottom: 8,
  },
  inputRowWrapper: {
    backgroundColor: COLORS.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 8,
    gap: 8,
  },
  inputWrap: {
    flex: 1,
    position: 'relative',
  },
  charCounter: {
    position: 'absolute',
    bottom: 4,
    end: 10,
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  charCounterWarn: {
    color: COLORS.error,
    fontWeight: '600',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: COLORS.inputBg,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    textAlign: 'auto',
    color: COLORS.textPrimary,
  },
  sendBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 64,
  },
  sendBtnDisabled: {
    backgroundColor: COLORS.muted,
  },
  sendBtnText: {
    color: COLORS.surface,
    fontSize: 14,
    fontWeight: '600',
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: COLORS.surface,
    fontSize: 14,
    fontWeight: '700',
  },
  commentCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  commentMeta: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  commentAuthor: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '600',
    textAlign: 'auto',
  },
  commentDate: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'auto',
  },
  commentBody: {
    fontSize: 14,
    color: COLORS.textPrimary,
    lineHeight: 20,
    textAlign: 'auto',
    marginBottom: 8,
  },
  commentActions: {
    flexDirection: 'row',
    gap: 8,
  },
  commentActionBtn: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: COLORS.inputBg,
  },
  commentActionBtnActive: {
    backgroundColor: COLORS.primaryLight,
  },
  commentActionText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  commentActionTextActive: {
    color: COLORS.primaryDark,
  },
});

/** Simple spinner shown while a screen is loading */
export function LoadingIndicator(): ReactElement {
  return <ActivityIndicator style={{ paddingVertical: 20 }} size="large" color={COLORS.primary} />;
}

/** Centered error/empty message */
export function CenteredMessage({ text }: { text: string }): ReactElement {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 15, color: COLORS.error, textAlign: 'center', padding: 16 }}>{text}</Text>
    </View>
  );
}

const COMMENT_MAX_LENGTH = 500;

/** Shared TextInput + Send button row for comment screens */
export function CommentInputRow({
  value,
  onChangeText,
  onSend,
  sending,
  inputRef,
  t,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  sending: boolean;
  inputRef?: React.RefObject<TextInput | null>;
  t: typeof TFunc;
}): ReactElement {
  const remaining = COMMENT_MAX_LENGTH - value.length;
  const isNearLimit = remaining <= 50;
  return (
    <View style={sharedStyles.inputRowWrapper}>
      <View style={sharedStyles.inputRow}>
        <View style={sharedStyles.inputWrap}>
          <TextInput
            ref={inputRef}
            style={sharedStyles.input}
            value={value}
            onChangeText={(text) => onChangeText(text.slice(0, COMMENT_MAX_LENGTH))}
            placeholder={t('comments.placeholder')}
            placeholderTextColor="#999"
            multiline
            maxLength={COMMENT_MAX_LENGTH}
          />
          {value.length > 0 ? (
            <Text
              style={[sharedStyles.charCounter, isNearLimit && sharedStyles.charCounterWarn]}
              accessibilityLabel={t('comments.charCount', { count: value.length, max: COMMENT_MAX_LENGTH })}
            >
              {remaining}
            </Text>
          ) : null}
        </View>
        <Pressable
          style={[sharedStyles.sendBtn, (!value.trim() || sending) && sharedStyles.sendBtnDisabled]}
          onPress={onSend}
          disabled={!value.trim() || sending}
          accessibilityRole="button"
          accessibilityLabel={t('comments.send')}
        >
          {sending ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Text style={sharedStyles.sendBtnText}>{t('comments.send')}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

interface CommentCardItem {
  id: string;
  authorId: string;
  createdAt: string;
  body: string;
  /** @M175 */
  likeCount?: number;
  /** @M175 */
  isLikedByMe?: boolean;
}

/**
 * Shared comment card used in both CommentsScreen and PostDetailScreen.
 * onReply is optional — omit it to hide the reply button.
 */
export function CommentCard({
  item,
  onReply,
  onDelete,
  onLike,
  onPin,
  pinnedCommentId,
  currentUserId,
  smallAvatar,
  t,
}: {
  item: CommentCardItem;
  onReply?: (authorId: string) => void;
  onDelete?: (commentId: string) => void;
  /** Called when the like button is tapped; returns updated likeCount. @M175 */
  onLike?: (commentId: string, currentlyLiked: boolean) => void;
  /** Called to pin or unpin a comment; post author only. */
  onPin?: (commentId: string) => void;
  pinnedCommentId?: string;
  currentUserId?: string;
  smallAvatar?: boolean;
  t: typeof TFunc;
}): ReactElement {
  const [liked, setLiked] = useState(item.isLikedByMe ?? false);
  const [likeCount, setLikeCount] = useState(item.likeCount ?? 0);

  const handleLike = useCallback(() => {
    const next = !liked;
    setLiked(next);
    setLikeCount((prev) => (next ? prev + 1 : Math.max(0, prev - 1)));
    onLike?.(item.id, liked);
  }, [liked, item.id, onLike]);

  const handleReply = useCallback(() => {
    onReply?.(item.authorId.slice(0, 8));
  }, [item.authorId, onReply]);

  const avatarSize = smallAvatar
    ? { width: 28, height: 28, borderRadius: 14 }
    : sharedStyles.avatarCircle;

  return (
    <View style={sharedStyles.commentCard}>
      <View style={sharedStyles.commentHeader}>
        <View style={[sharedStyles.avatarCircle, avatarSize]}>
          <Text style={sharedStyles.avatarText}>{item.authorId.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={sharedStyles.commentMeta}>
          <Text style={sharedStyles.commentAuthor}>{item.authorId.slice(0, 8)}</Text>
          <Text style={sharedStyles.commentDate}>{formatRelativeTime(item.createdAt, t)}</Text>
        </View>
      </View>
      <Text style={sharedStyles.commentBody}>{item.body}</Text>
      <View style={sharedStyles.commentActions}>
        <Pressable
          style={[sharedStyles.commentActionBtn, liked && sharedStyles.commentActionBtnActive]}
          onPress={handleLike}
          accessibilityRole="button"
          accessibilityLabel={t('comments.likeA11y')}
        >
          <Text style={[sharedStyles.commentActionText, liked && sharedStyles.commentActionTextActive]}>
            {t('comments.likeComment')}{likeCount > 0 ? ` ${likeCount}` : ''}
          </Text>
        </Pressable>
        {onReply ? (
          <Pressable
            style={sharedStyles.commentActionBtn}
            onPress={handleReply}
            accessibilityRole="button"
            accessibilityLabel={t('comments.replyA11y')}
          >
            <Text style={sharedStyles.commentActionText}>{t('comments.replyComment')}</Text>
          </Pressable>
        ) : null}
        {onDelete && currentUserId === item.authorId ? (
          <Pressable
            style={sharedStyles.commentActionBtn}
            onPress={() => {
              Alert.alert(
                t('comments.deleteCommentConfirmTitle'),
                t('comments.deleteCommentConfirmMsg'),
                [
                  { text: t('comments.deleteCommentCancel'), style: 'cancel' as const },
                  { text: t('comments.deleteComment'), style: 'destructive' as const, onPress: () => onDelete(item.id) },
                ],
              );
            }}
            accessibilityRole="button"
            accessibilityLabel={t('comments.deleteComment')}
          >
            <Text style={[sharedStyles.commentActionText, { color: '#C62828' }]}>{t('comments.deleteComment')}</Text>
          </Pressable>
        ) : null}
        {onPin ? (
          <Pressable
            style={sharedStyles.commentActionBtn}
            onPress={() => onPin(item.id)}
            accessibilityRole="button"
            accessibilityLabel={pinnedCommentId === item.id ? t('commentPin.unpin') : t('commentPin.pin')}
          >
            <Text style={[sharedStyles.commentActionText, pinnedCommentId === item.id ? { color: COLORS.primary } : {}]}>
              {pinnedCommentId === item.id ? t('commentPin.unpin') : t('commentPin.pin')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Animated "..." dots shown while the local user is composing a comment. */
export function TypingIndicator({ t }: { t: typeof TFunc }): ReactElement {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulse = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(600 - delay),
        ]),
      );
    const a1 = pulse(dot1, 0);
    const a2 = pulse(dot2, 200);
    const a3 = pulse(dot3, 400);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [dot1, dot2, dot3]);

  return (
    <View style={typingStyles.row} accessibilityLabel={t('comments.typing')} accessibilityLiveRegion="polite">
      {[dot1, dot2, dot3].map((dot, i) => (
        <Animated.View
          key={i}
          style={[typingStyles.dot, { opacity: dot }]}
        />
      ))}
    </View>
  );
}

const typingStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
});
