/**
 * ReplyPreview – quoted message strip shown above the compose input
 * when the user swipes to reply, plus the inline bar inside a bubble.
 */
import { type ReactElement } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { t } from '../strings';

export interface ReplyPreviewData {
  messageId: string;
  senderName: string;
  /** Short text representation (truncated at call site) */
  snippet: string;
  /** Optional: 'image' | 'voice' | 'location' | 'document' | 'place_share' */
  contentType?: string;
}

// ─── Inline bar (inside bubble) ────────────────────────────────────────────

interface InlinePropTypes {
  data: ReplyPreviewData;
  isOwn: boolean;
}

const TYPE_ICONS: Record<string, string> = {
  image: '🖼',
  voice: '🎤',
  location: '📍',
  document: '📄',
  place_share: '🏢',
};

export function ReplyBar({ data, isOwn }: InlinePropTypes): ReactElement {
  const icon = data.contentType ? (TYPE_ICONS[data.contentType] ?? '') : '';
  const accentBg = isOwn ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.05)';
  const accentBorder = isOwn ? 'rgba(255,255,255,0.6)' : '#42A5F5';
  const senderColor = isOwn ? 'rgba(255,255,255,0.8)' : '#1565C0';
  const snippetColor = isOwn ? 'rgba(255,255,255,0.65)' : '#616161';

  return (
    <View
      style={[
        styles.inlineBar,
        { backgroundColor: accentBg, borderStartColor: accentBorder },
      ]}
    >
      <View style={styles.inlineContent}>
        <Text style={[styles.inlineSender, { color: senderColor }]} numberOfLines={1}>
          {data.senderName}
        </Text>
        <Text style={[styles.inlineSnippet, { color: snippetColor }]} numberOfLines={1}>
          {icon ? `${icon} ` : ''}{data.snippet}
        </Text>
      </View>
    </View>
  );
}

// ─── Compose-bar preview (shown above input when replying) ──────────────────

interface ComposePropTypes {
  data: ReplyPreviewData;
  onCancel: () => void;
}

export function ReplyPreview({ data, onCancel }: ComposePropTypes): ReactElement {
  const icon = data.contentType ? (TYPE_ICONS[data.contentType] ?? '') : '';

  return (
    <View style={styles.composeBar}>
      {/* Left accent */}
      <View style={styles.composeAccent} />

      <View style={styles.composeContent}>
        <Text style={styles.composeSender} numberOfLines={1}>
          {t('conversation.replyingTo')} {data.senderName}
        </Text>
        <Text style={styles.composeSnippet} numberOfLines={1}>
          {icon ? `${icon} ` : ''}{data.snippet}
        </Text>
      </View>

      {/* Cancel button */}
      <TouchableOpacity
        style={styles.cancelBtn}
        onPress={onCancel}
        hitSlop={{ top: 10, bottom: 10, start: 10, end: 10 }}
        accessibilityRole="button"
        accessibilityLabel={t('compose.cancel')}
      >
        <Text style={styles.cancelIcon}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Inline bubble bar
  inlineBar: {
    flexDirection: 'row',
    borderStartWidth: 3,
    borderRadius: 6,
    marginBottom: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  inlineContent: { flex: 1, gap: 1 },
  inlineSender: { fontSize: 11, fontWeight: '700' },
  inlineSnippet: { fontSize: 11 },

  // Compose preview bar
  composeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 10,
  },
  composeAccent: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 2,
    backgroundColor: '#1976D2',
  },
  composeContent: { flex: 1, gap: 2 },
  composeSender: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1565C0',
  },
  composeSnippet: {
    fontSize: 12,
    color: '#616161',
  },
  cancelBtn: {
    padding: 4,
  },
  cancelIcon: {
    fontSize: 16,
    color: '#9E9E9E',
    fontWeight: '600',
  },
});
