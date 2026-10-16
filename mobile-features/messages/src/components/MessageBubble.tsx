/**
 * MessageBubble – renders all message types with status icons,
 * reply preview, long-press context menu, link detection.
 */
import * as Clipboard from 'expo-clipboard';
import { useCallback, type ReactElement } from 'react';
import {
  Alert,
  Animated,
  I18nManager,
  Image,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { t } from '../strings';

// ─── Types ─────────────────────────────────────────────────────────────────

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read';

export type MessageType =
  | 'text'
  | 'image'
  | 'location'
  | 'document'
  | 'voice'
  | 'place_share';

export interface LocationPayload {
  latitude: number;
  longitude: number;
  label?: string;
}

export interface DocumentPayload {
  filename: string;
  sizeBytes: number;
  mimeType: string;
  url?: string;
}

export interface VoicePayload {
  durationSecs: number;
  url?: string;
}

export interface PlaceSharePayload {
  placeId: string;
  name: string;
  address?: string;
  rating?: number;
  thumbnailUrl?: string;
}

export interface ReplyRef {
  messageId: string;
  senderName: string;
  snippet: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName?: string;
  type: MessageType;
  text?: string;
  imageUrl?: string;
  location?: LocationPayload;
  document?: DocumentPayload;
  voice?: VoicePayload;
  placeShare?: PlaceSharePayload;
  replyTo?: ReplyRef;
  status: MessageStatus;
  createdAt: string;
  deletedForMe?: boolean;
  deletedForEveryone?: boolean;
  isForwarded?: boolean;
}

export interface MessageBubbleCallbacks {
  onReply?: (msg: ChatMessage) => void;
  onForward?: (msg: ChatMessage) => void;
  onDelete?: (msg: ChatMessage, forEveryone: boolean) => void;
  onImagePress?: (url: string) => void;
  onLocationPress?: (loc: LocationPayload) => void;
  onPlacePress?: (placeId: string) => void;
}

interface Props {
  message: ChatMessage;
  isOwn: boolean;
  showReadReceipts: boolean;
  callbacks: MessageBubbleCallbacks;
}

// ─── URL helpers ────────────────────────────────────────────────────────────

const URL_RE = /https?:\/\/[^\s<>"']+/g;

function extractUrls(text: string): string[] {
  return text.match(URL_RE) ?? [];
}

// ─── Status icons ───────────────────────────────────────────────────────────

const STATUS_ICONS: Record<MessageStatus, string> = {
  sending: '○',
  sent: '✓',
  delivered: '✓✓',
  read: '✓✓',
};

function StatusIcon({
  status,
  showReadReceipts,
}: {
  status: MessageStatus;
  showReadReceipts: boolean;
}): ReactElement | null {
  if (!showReadReceipts && status !== 'sending' && status !== 'sent') return null;
  const icon = STATUS_ICONS[status];
  const isRead = status === 'read';
  return (
    <Text
      style={[styles.statusIcon, isRead && styles.statusIconRead]}
      accessibilityLabel={t(`detail.status.${status === 'sending' ? 'queued' : status}`)}
    >
      {icon}
    </Text>
  );
}

// ─── Sub-renderers ──────────────────────────────────────────────────────────

function TextContent({
  text,
  isOwn,
}: {
  text: string;
  isOwn: boolean;
}): ReactElement {
  const urls = extractUrls(text);
  // Split text around URLs to render them as links
  const parts: Array<{ value: string; isUrl: boolean }> = [];
  let remaining = text;
  for (const url of urls) {
    const idx = remaining.indexOf(url);
    if (idx > 0) parts.push({ value: remaining.slice(0, idx), isUrl: false });
    parts.push({ value: url, isUrl: true });
    remaining = remaining.slice(idx + url.length);
  }
  if (remaining) parts.push({ value: remaining, isUrl: false });

  return (
    <Text style={[styles.msgText, isOwn && styles.msgTextOwn]}>
      {parts.map((p, i) =>
        p.isUrl ? (
          <Text
            key={i}
            style={styles.urlLink}
            onPress={() => { void Linking.openURL(p.value); }}
            accessibilityRole="link"
          >
            {p.value}
          </Text>
        ) : (
          <Text key={i}>{p.value}</Text>
        ),
      )}
    </Text>
  );
}

function ImageContent({
  url,
  onPress,
}: {
  url: string;
  onPress: (url: string) => void;
}): ReactElement {
  return (
    <TouchableOpacity
      onPress={() => onPress(url)}
      accessibilityRole="imagebutton"
      accessibilityLabel={t('attachment.addPhoto')}
      activeOpacity={0.85}
    >
      <Image
        source={{ uri: url }}
        style={styles.imageThumbnail}
        resizeMode="cover"
      />
    </TouchableOpacity>
  );
}

function LocationContent({
  loc,
  onPress,
}: {
  loc: LocationPayload;
  onPress: (loc: LocationPayload) => void;
}): ReactElement {
  const lat = loc.latitude.toFixed(6);
  const lng = loc.longitude.toFixed(6);

  return (
    <TouchableOpacity
      style={styles.locationContainer}
      onPress={() => onPress(loc)}
      accessibilityRole="button"
      activeOpacity={0.85}
    >
      <View style={styles.locationMapPlaceholder}>
        {/* Static map placeholder - real integration uses MapLibre snapshot */}
        <Text style={styles.locationMapIcon}>📍</Text>
        <Text style={styles.locationCoords}>
          {lat}, {lng}
        </Text>
      </View>
      {loc.label ? (
        <Text style={styles.locationLabel} numberOfLines={1}>
          {loc.label}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

function DocumentContent({
  doc,
}: {
  doc: DocumentPayload;
}): ReactElement {
  const sizeLabel = doc.sizeBytes > 1_000_000
    ? `${(doc.sizeBytes / 1_000_000).toFixed(1)} MB`
    : `${Math.round(doc.sizeBytes / 1024)} KB`;

  const open = () => {
    if (doc.url) { void Linking.openURL(doc.url); }
  };

  return (
    <TouchableOpacity
      style={styles.documentContainer}
      onPress={open}
      disabled={!doc.url}
      accessibilityRole="button"
    >
      <Text style={styles.documentIcon}>📄</Text>
      <View style={styles.documentMeta}>
        <Text style={styles.documentName} numberOfLines={1}>
          {doc.filename}
        </Text>
        <Text style={styles.documentSize}>{sizeLabel}</Text>
      </View>
    </TouchableOpacity>
  );
}

function VoiceNoteStub({
  voice,
  isOwn,
}: {
  voice: VoicePayload;
  isOwn: boolean;
}): ReactElement {
  const mins = Math.floor(voice.durationSecs / 60);
  const secs = voice.durationSecs % 60;
  const label = `${mins}:${secs.toString().padStart(2, '0')}`;

  return (
    <View style={styles.voiceContainer}>
      <Text style={[styles.voiceIcon, isOwn && styles.voiceIconOwn]}>▶</Text>
      {/* Stub waveform bars */}
      <View style={styles.waveformRow}>
        {Array.from({ length: 20 }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.waveBar,
              isOwn && styles.waveBarOwn,
              { height: 4 + ((i * 7 + 3) % 14) },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.voiceDuration, isOwn && styles.voiceDurationOwn]}>
        {label}
      </Text>
    </View>
  );
}

function PlaceShareContent({
  place,
  onPress,
}: {
  place: PlaceSharePayload;
  onPress: (placeId: string) => void;
}): ReactElement {
  return (
    <TouchableOpacity
      style={styles.placeShareContainer}
      onPress={() => onPress(place.placeId)}
      accessibilityRole="button"
    >
      {place.thumbnailUrl ? (
        <Image
          source={{ uri: place.thumbnailUrl }}
          style={styles.placeShareThumb}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.placeShareThumb, styles.placeShareThumbFallback]}>
          <Text style={styles.placeShareFallbackIcon}>🏢</Text>
        </View>
      )}
      <View style={styles.placeShareInfo}>
        <Text style={styles.placeShareName} numberOfLines={1}>
          {place.name}
        </Text>
        {place.address ? (
          <Text style={styles.placeShareAddr} numberOfLines={1}>
            {place.address}
          </Text>
        ) : null}
        {place.rating !== undefined ? (
          <Text style={styles.placeShareRating}>
            {'★'.repeat(Math.round(place.rating))} {place.rating.toFixed(1)}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function ReplyBar({ replyTo }: { replyTo: ReplyRef }): ReactElement {
  return (
    <View style={styles.replyBar}>
      <View style={styles.replyBarAccent} />
      <View style={styles.replyBarContent}>
        <Text style={styles.replyBarSender} numberOfLines={1}>
          {replyTo.senderName}
        </Text>
        <Text style={styles.replyBarSnippet} numberOfLines={1}>
          {replyTo.snippet}
        </Text>
      </View>
    </View>
  );
}

function ForwardedTag(): ReactElement {
  return (
    <Text style={styles.forwardedTag}>↪ {t('conversation.forwarded')}</Text>
  );
}

// ─── Context menu ───────────────────────────────────────────────────────────

function showContextMenu(
  msg: ChatMessage,
  isOwn: boolean,
  callbacks: MessageBubbleCallbacks,
) {
  const options: Array<{ label: string; handler: () => void }> = [];

  if (msg.text) {
    options.push({
      label: t('conversation.copy'),
      handler: () => { void Clipboard.setStringAsync(msg.text!); },
    });
  }

  options.push({
    label: t('conversation.reply'),
    handler: () => callbacks.onReply?.(msg),
  });

  options.push({
    label: t('conversation.forward'),
    handler: () => callbacks.onForward?.(msg),
  });

  options.push({
    label: t('conversation.deleteForMe'),
    handler: () => callbacks.onDelete?.(msg, false),
  });

  if (isOwn) {
    options.push({
      label: t('conversation.deleteForEveryone'),
      handler: () => callbacks.onDelete?.(msg, true),
    });
  }

  Alert.alert(
    t('conversation.messageOptions'),
    undefined,
    [
      ...options.map((o) => ({ text: o.label, onPress: o.handler })),
      { text: t('compose.cancel'), style: 'cancel' as const },
    ],
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function MessageBubble({
  message,
  isOwn,
  showReadReceipts,
  callbacks,
}: Props): ReactElement {
  const handleLongPress = useCallback(() => {
    showContextMenu(message, isOwn, callbacks);
  }, [message, isOwn, callbacks]);

  if (message.deletedForEveryone) {
    return (
      <View style={[styles.row, isOwn ? styles.rowOwn : styles.rowOther]}>
        <View style={[styles.bubble, styles.bubbleDeleted]}>
          <Text style={styles.deletedText}>{t('conversation.deletedForEveryone')}</Text>
        </View>
      </View>
    );
  }

  if (message.deletedForMe) {
    return <View />;
  }

  return (
    <TouchableWithoutFeedback onLongPress={handleLongPress}>
      <View style={[styles.row, isOwn ? styles.rowOwn : styles.rowOther]}>
        <View
          style={[
            styles.bubble,
            isOwn ? styles.bubbleOwn : styles.bubbleOther,
          ]}
        >
          {message.isForwarded ? <ForwardedTag /> : null}
          {message.replyTo ? <ReplyBar replyTo={message.replyTo} /> : null}

          {message.type === 'text' && message.text !== undefined ? (
            <TextContent text={message.text} isOwn={isOwn} />
          ) : null}

          {message.type === 'image' && message.imageUrl ? (
            <ImageContent
              url={message.imageUrl}
              onPress={callbacks.onImagePress ?? (() => undefined)}
            />
          ) : null}

          {message.type === 'location' && message.location ? (
            <LocationContent
              loc={message.location}
              onPress={callbacks.onLocationPress ?? (() => undefined)}
            />
          ) : null}

          {message.type === 'document' && message.document ? (
            <DocumentContent doc={message.document} />
          ) : null}

          {message.type === 'voice' && message.voice ? (
            <VoiceNoteStub voice={message.voice} isOwn={isOwn} />
          ) : null}

          {message.type === 'place_share' && message.placeShare ? (
            <PlaceShareContent
              place={message.placeShare}
              onPress={callbacks.onPlacePress ?? (() => undefined)}
            />
          ) : null}

          {/* Footer: time + status */}
          <View style={styles.bubbleFooter}>
            <Text style={[styles.timeText, isOwn && styles.timeTextOwn]}>
              {formatTime(message.createdAt)}
            </Text>
            {isOwn ? (
              <StatusIcon
                status={message.status}
                showReadReceipts={showReadReceipts}
              />
            ) : null}
          </View>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('ar-IQ', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginVertical: 2,
    paddingHorizontal: 12,
  },
  rowOwn: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },

  bubble: {
    maxWidth: '78%',
    borderRadius: 14,
    padding: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  bubbleOwn: {
    backgroundColor: '#1976D2',
    borderBottomEndRadius: 2,
  },
  bubbleOther: {
    backgroundColor: '#FFFFFF',
    borderBottomStartRadius: 2,
  },
  bubbleDeleted: {
    backgroundColor: '#F0F0F0',
    borderColor: '#E0E0E0',
    borderWidth: 1,
  },
  deletedText: {
    fontSize: 13,
    color: '#9E9E9E',
    fontStyle: 'italic',
  },

  msgText: {
    fontSize: 15,
    lineHeight: 21,
    color: '#212121',
  },
  msgTextOwn: { color: '#FFFFFF' },

  urlLink: {
    color: '#90CAF9',
    textDecorationLine: 'underline',
  },

  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 4,
  },
  timeText: { fontSize: 10, color: '#9E9E9E' },
  timeTextOwn: { color: 'rgba(255,255,255,0.7)' },
  statusIcon: { fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  statusIconRead: { color: '#90CAF9' },

  // Image
  imageThumbnail: {
    width: 220,
    height: 160,
    borderRadius: 10,
    backgroundColor: '#E0E0E0',
  },

  // Location
  locationContainer: {
    borderRadius: 10,
    overflow: 'hidden',
    minWidth: 200,
  },
  locationMapPlaceholder: {
    height: 110,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationMapIcon: { fontSize: 32 },
  locationCoords: { fontSize: 10, color: '#616161', marginTop: 4 },
  locationLabel: {
    fontSize: 12,
    color: '#424242',
    padding: 6,
    backgroundColor: '#F5F5F5',
  },

  // Document
  documentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 180,
    paddingVertical: 4,
  },
  documentIcon: { fontSize: 28 },
  documentMeta: { flex: 1 },
  documentName: { fontSize: 13, color: '#212121', fontWeight: '600' },
  documentSize: { fontSize: 11, color: '#757575', marginTop: 2 },

  // Voice
  voiceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 180,
    paddingVertical: 4,
  },
  voiceIcon: { fontSize: 16, color: '#212121' },
  voiceIconOwn: { color: '#FFFFFF' },
  waveformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flex: 1,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: '#BDBDBD',
  },
  waveBarOwn: { backgroundColor: 'rgba(255,255,255,0.6)' },
  voiceDuration: { fontSize: 11, color: '#757575' },
  voiceDurationOwn: { color: 'rgba(255,255,255,0.7)' },

  // Place share
  placeShareContainer: {
    borderRadius: 10,
    overflow: 'hidden',
    minWidth: 220,
    backgroundColor: '#F9F9F9',
  },
  placeShareThumb: {
    width: '100%',
    height: 100,
    backgroundColor: '#E0E0E0',
  },
  placeShareThumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeShareFallbackIcon: { fontSize: 36 },
  placeShareInfo: { padding: 8 },
  placeShareName: { fontSize: 13, fontWeight: '700', color: '#212121' },
  placeShareAddr: { fontSize: 11, color: '#757575', marginTop: 2 },
  placeShareRating: { fontSize: 11, color: '#F9A825', marginTop: 2 },

  // Reply bar
  replyBar: {
    flexDirection: 'row',
    marginBottom: 6,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  replyBarAccent: { width: 3, backgroundColor: '#42A5F5' },
  replyBarContent: { flex: 1, padding: 6 },
  replyBarSender: { fontSize: 11, fontWeight: '700', color: '#1565C0' },
  replyBarSnippet: { fontSize: 11, color: '#616161', marginTop: 1 },

  // Forwarded
  forwardedTag: {
    fontSize: 11,
    color: '#9E9E9E',
    marginBottom: 4,
    fontStyle: 'italic',
  },
});
