/**
 * InquiryCard — business-inbox card showing a customer inquiry with
 * status badge, unread count, assigned staff, and customer avatar.
 */
import { Card, Text } from '@iraq-maps/ui';
import { type ReactElement } from 'react';
import { Pressable, StyleSheet, View, Text as RNText } from 'react-native';
import { t } from '../strings';

// ─── Types ────────────────────────────────────────────────────────────────────

export type InquiryStatus = 'new' | 'open' | 'replied' | 'resolved';

export interface CustomerInquiry {
  id: string;
  customerId: string;
  customerName: string;
  customerAvatarUrl?: string;
  firstMessage: string;
  lastMessageAt: string;
  status: InquiryStatus;
  unreadCount: number;
  assignedTo?: { id: string; name: string };
  /** ISO string when last reply was sent by provider */
  lastRepliedAt?: string;
}

interface InquiryCardProps {
  inquiry: CustomerInquiry;
  onPress: (id: string) => void;
  onLongPress?: (id: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<InquiryStatus, string> = {
  new: '#1976D2',
  open: '#F57C00',
  replied: '#388E3C',
  resolved: '#9E9E9E',
};

function fmtRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 2) return t('time.justNow');
  if (diffMin < 60) return t('time.minutesAgo', { n: diffMin });
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return t('time.hoursAgo', { n: diffH });
  return new Date(iso).toLocaleDateString('ar', { day: 'numeric', month: 'short' });
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function CustomerAvatar({
  name,
  avatarUrl,
  size = 44,
}: {
  name: string;
  avatarUrl?: string;
  size?: number;
}): ReactElement {
  // In MVP we render initials; real implementation would use <Image />
  const bg = stringToColor(name);
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
      ]}
      accessibilityLabel={t('inbox.customerAvatar', { name })}
    >
      <RNText style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initials(name)}</RNText>
    </View>
  );
}

/** Deterministic pastel from a name string */
function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 55%, 58%)`;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: InquiryStatus }): ReactElement {
  const color = STATUS_COLORS[status];
  const label = t(`inbox.status.${status}` as Parameters<typeof t>[0]);
  return (
    <View style={[styles.badge, { backgroundColor: color + '22', borderColor: color }]}>
      <RNText style={[styles.badgeText, { color }]}>{label}</RNText>
    </View>
  );
}

// ─── Unread Badge ─────────────────────────────────────────────────────────────

function UnreadBadge({ count }: { count: number }): ReactElement | null {
  if (count <= 0) return null;
  return (
    <View style={styles.unreadBadge} accessibilityLabel={t('inbox.unreadCount', { count })}>
      <RNText style={styles.unreadBadgeText}>{count > 99 ? '99+' : count}</RNText>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function InquiryCard({ inquiry, onPress, onLongPress }: InquiryCardProps): ReactElement {
  const isNew = inquiry.status === 'new';
  const isResolved = inquiry.status === 'resolved';

  return (
    <Pressable
      onPress={() => onPress(inquiry.id)}
      onLongPress={onLongPress ? () => onLongPress(inquiry.id) : undefined}
      accessibilityRole="button"
      accessibilityLabel={t('inbox.inquiryCardLabel', { name: inquiry.customerName })}
      testID={`inquiry-card-${inquiry.id}`}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
    >
      {/* Left: avatar */}
      <CustomerAvatar name={inquiry.customerName} avatarUrl={inquiry.customerAvatarUrl} />

      {/* Middle: content */}
      <View style={styles.content}>
        {/* Row 1: name + time */}
        <View style={styles.row}>
          <RNText
            style={[styles.customerName, isNew && styles.bold]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {inquiry.customerName}
          </RNText>
          <RNText style={styles.time}>{fmtRelative(inquiry.lastMessageAt)}</RNText>
        </View>

        {/* Row 2: message preview */}
        <RNText
          style={[styles.preview, isNew && styles.bold, isResolved && styles.muted]}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {inquiry.firstMessage}
        </RNText>

        {/* Row 3: badges + assigned */}
        <View style={styles.metaRow}>
          <StatusBadge status={inquiry.status} />
          {inquiry.assignedTo ? (
            <View style={styles.assignedChip}>
              <RNText style={styles.assignedText} numberOfLines={1}>
                {t('inbox.assignedTo', { name: inquiry.assignedTo.name })}
              </RNText>
            </View>
          ) : null}
        </View>
      </View>

      {/* Right: unread count */}
      <View style={styles.rightCol}>
        <UnreadBadge count={inquiry.unreadCount} />
      </View>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  pressed: { opacity: 0.85 },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    color: '#FFF',
    fontWeight: '700',
  },
  content: {
    flex: 1,
    gap: 3,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customerName: {
    fontSize: 14,
    color: '#212121',
    flex: 1,
  },
  bold: { fontWeight: '700' },
  muted: { color: '#9E9E9E' },
  time: {
    fontSize: 11,
    color: '#9E9E9E',
    marginStart: 6,
    flexShrink: 0,
  },
  preview: {
    fontSize: 13,
    color: '#555',
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 2,
  },
  badge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  assignedChip: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    maxWidth: 120,
  },
  assignedText: {
    fontSize: 11,
    color: '#757575',
  },
  rightCol: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    paddingTop: 2,
    minWidth: 28,
  },
  unreadBadge: {
    backgroundColor: '#1976D2',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  unreadBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
});
