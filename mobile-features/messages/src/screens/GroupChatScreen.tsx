/**
 * GroupChatScreen – enhanced group conversation UI.
 *
 * Features:
 * - Member list header: avatars (max 5) + "+N more"
 * - Group name + edit button (admin only)
 * - Pinned messages bar (collapsible)
 * - Member status: online/offline dots
 * - "Add to group" modal
 * - Leave group / Delete group
 * - Search within group messages
 * - Mention @username
 * - Mute conversation
 * - System event messages (joined / left)
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  I18nManager,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { GroupMessageType } from '@iraq-maps/contracts';
import { useSession } from '@iraq-maps/mobile-kit';
import {
  MessageBubble,
  type ChatMessage,
  type MessageStatus,
} from '../components/MessageBubble';
import { useGroupsClient } from '../client';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_VISIBLE_AVATARS = 5;
const SEARCH_DEBOUNCE = 300;

// ─── Types ───────────────────────────────────────────────────────────────────

interface GroupMember {
  userId: string;
  displayName: string;
  role: 'admin' | 'member';
  joinedAt: string;
  isOnline?: boolean;
}

interface GroupInfo {
  id: string;
  name: string;
  avatarUrl?: string;
  memberCount: number;
  createdBy: string;
  muted: boolean;
  mutedUntil?: string;
  userRole: 'admin' | 'member';
}

interface PinnedMsg {
  id: string;
  messageId: string;
  pinnedBy: string;
  text: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toChatMessage(gm: GroupMessageType): ChatMessage {
  return {
    id: gm.id,
    senderId: gm.senderId,
    type: 'text',
    text: gm.text,
    status: 'delivered' as MessageStatus,
    createdAt: gm.createdAt,
  };
}

// ─── MemberAvatar ─────────────────────────────────────────────────────────────

function MemberAvatar({
  member,
  size = 32,
  showOnline = false,
}: {
  member: GroupMember;
  size?: number;
  showOnline?: boolean;
}): ReactElement {
  const initials = member.displayName.charAt(0).toUpperCase();
  const colors = ['#1976D2', '#388E3C', '#F57C00', '#7B1FA2', '#C62828'];
  const colorIdx = member.userId.charCodeAt(0) % colors.length;

  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          avatarStyles.circle,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: colors[colorIdx] },
        ]}
        accessibilityLabel={member.displayName}
      >
        <Text style={[avatarStyles.initials, { fontSize: size * 0.4 }]}>{initials}</Text>
      </View>
      {showOnline && (
        <View
          style={[
            avatarStyles.onlineDot,
            { backgroundColor: member.isOnline ? '#4CAF50' : '#9E9E9E' },
          ]}
        />
      )}
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { color: '#fff', fontWeight: '700' },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    end: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
});

// ─── MembersHeader ────────────────────────────────────────────────────────────

function MembersHeader({
  members,
  info,
  isAdmin,
  onEditName,
  onAddMember,
  onMuteToggle,
  onLeaveGroup,
  onDeleteGroup,
  onMembersListPress,
}: {
  members: GroupMember[];
  info: GroupInfo;
  isAdmin: boolean;
  onEditName: () => void;
  onAddMember: () => void;
  onMuteToggle: () => void;
  onLeaveGroup: () => void;
  onDeleteGroup: () => void;
  onMembersListPress: () => void;
}): ReactElement {
  const visible = members.slice(0, MAX_VISIBLE_AVATARS);
  const overflow = members.length - MAX_VISIBLE_AVATARS;

  return (
    <View style={headerStyles.container}>
      {/* Avatar row */}
      <TouchableOpacity
        style={headerStyles.avatarRow}
        onPress={onMembersListPress}
        accessibilityRole="button"
        accessibilityLabel={t('groups.memberCount', { n: info.memberCount })}
      >
        {visible.map((m, i) => (
          <View
            key={m.userId}
            style={[
              headerStyles.avatarSlot,
              { marginStart: i > 0 ? -8 : 0, zIndex: MAX_VISIBLE_AVATARS - i },
            ]}
          >
            <MemberAvatar member={m} size={34} showOnline />
          </View>
        ))}
        {overflow > 0 && (
          <View style={[headerStyles.avatarSlot, headerStyles.overflowBadge]}>
            <Text style={headerStyles.overflowText}>+{overflow}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Group name + edit */}
      <View style={headerStyles.nameRow}>
        <Text style={headerStyles.groupName} numberOfLines={1}>
          {info.name}
        </Text>
        {isAdmin && (
          <TouchableOpacity
            onPress={onEditName}
            style={headerStyles.editBtn}
            accessibilityRole="button"
            accessibilityLabel={t('groups.editName')}
          >
            <Text style={headerStyles.editIcon}>{t('groups.editNameIcon')}</Text>
          </TouchableOpacity>
        )}
        {info.muted && (
          <View style={headerStyles.mutedBadge}>
            <Text style={headerStyles.mutedText}>🔕</Text>
          </View>
        )}
      </View>

      {/* Action row */}
      <View style={headerStyles.actionRow}>
        {isAdmin && (
          <TouchableOpacity
            style={headerStyles.actionBtn}
            onPress={onAddMember}
            accessibilityRole="button"
          >
            <Text style={headerStyles.actionBtnText}>{t('groups.addMember')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[headerStyles.actionBtn, headerStyles.actionBtnSecondary]}
          onPress={onMuteToggle}
          accessibilityRole="button"
        >
          <Text style={headerStyles.actionBtnText}>
            {info.muted ? t('groups.unmute') : t('groups.mute')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[headerStyles.actionBtn, headerStyles.actionBtnDanger]}
          onPress={isAdmin ? onDeleteGroup : onLeaveGroup}
          accessibilityRole="button"
        >
          <Text style={[headerStyles.actionBtnText, { color: '#C62828' }]}>
            {isAdmin ? t('groups.deleteGroup') : t('groups.leaveGroup')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const headerStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  avatarSlot: { position: 'relative' },
  overflowBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#BDBDBD',
    alignItems: 'center',
    justifyContent: 'center',
    marginStart: -8,
  },
  overflowText: { fontSize: 11, color: '#fff', fontWeight: '700' },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  groupName: { fontSize: 16, fontWeight: '700', color: '#212121', flex: 1 },
  editBtn: { padding: 4 },
  editIcon: { fontSize: 16, color: '#1976D2' },
  mutedBadge: { paddingHorizontal: 4 },
  mutedText: { fontSize: 14 },
  actionRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#E3F2FD',
  },
  actionBtnSecondary: { backgroundColor: '#F5F5F5' },
  actionBtnDanger: { backgroundColor: '#FFEBEE' },
  actionBtnText: { fontSize: 13, color: '#1976D2', fontWeight: '600' },
});

// ─── PinnedBar ────────────────────────────────────────────────────────────────

function PinnedBar({
  pinned,
  onNavigate,
}: {
  pinned: PinnedMsg[];
  onNavigate: (messageId: string) => void;
}): ReactElement | null {
  const [collapsed, setCollapsed] = useState(false);

  if (pinned.length === 0) return null;

  return (
    <View style={pinnedStyles.container}>
      <TouchableOpacity
        style={pinnedStyles.toggleRow}
        onPress={() => setCollapsed((v) => !v)}
        accessibilityRole="button"
      >
        <Text style={pinnedStyles.icon}>📌</Text>
        <Text style={pinnedStyles.label}>{t('groups.pinnedMessages', { count: pinned.length })}</Text>
        <Text style={pinnedStyles.chevron}>{collapsed ? t('groups.collapse') : t('groups.expand')}</Text>
      </TouchableOpacity>

      {!collapsed && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={pinnedStyles.scroll}
          contentContainerStyle={pinnedStyles.scrollContent}
        >
          {pinned.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={pinnedStyles.pill}
              onPress={() => onNavigate(p.messageId)}
              accessibilityRole="button"
            >
              <Text style={pinnedStyles.pillText} numberOfLines={1}>
                {p.text}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const pinnedStyles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF8E1',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#FFE082',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  icon: { fontSize: 14 },
  label: { flex: 1, fontSize: 12, color: '#5D4037', fontWeight: '600' },
  chevron: { fontSize: 10, color: '#795548' },
  scroll: { maxHeight: 44 },
  scrollContent: { paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  pill: {
    backgroundColor: '#FFD54F',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: 200,
  },
  pillText: { fontSize: 12, color: '#4E342E' },
});

// ─── MembersListModal ─────────────────────────────────────────────────────────

function MembersListModal({
  visible,
  members,
  isAdmin,
  currentUserId,
  onRemove,
  onPromote,
  onClose,
}: {
  visible: boolean;
  members: GroupMember[];
  isAdmin: boolean;
  currentUserId: string;
  onRemove: (userId: string) => void;
  onPromote: (userId: string) => void;
  onClose: () => void;
}): ReactElement {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={modalStyles.overlay}>
        <View style={modalStyles.sheet}>
          <View style={modalStyles.handleBar} />
          <Text style={modalStyles.title}>
            {t('groups.members')} ({members.length})
          </Text>

          <FlatList
            data={members}
            keyExtractor={(m) => m.userId}
            renderItem={({ item: m }) => (
              <View style={modalStyles.memberRow}>
                <MemberAvatar member={m} size={38} showOnline />
                <View style={modalStyles.memberInfo}>
                  <Text style={modalStyles.memberName} numberOfLines={1}>
                    {m.displayName}
                  </Text>
                  {m.role === 'admin' && (
                    <Text style={modalStyles.adminBadge}>{t('groups.adminBadge')}</Text>
                  )}
                </View>
                <View style={modalStyles.onlineStatus}>
                  <View
                    style={[
                      modalStyles.onlineDot,
                      { backgroundColor: m.isOnline ? '#4CAF50' : '#9E9E9E' },
                    ]}
                  />
                  <Text style={modalStyles.onlineLabel}>
                    {m.isOnline ? t('conversation.online') : t('groups.offline')}
                  </Text>
                </View>
                {isAdmin && m.userId !== currentUserId && (
                  <View style={modalStyles.memberActions}>
                    {m.role === 'member' && (
                      <TouchableOpacity
                        onPress={() => onPromote(m.userId)}
                        style={modalStyles.memberActionBtn}
                        accessibilityRole="button"
                      >
                        <Text style={modalStyles.memberActionText}>{t('groups.makeAdmin')}</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => onRemove(m.userId)}
                      style={[modalStyles.memberActionBtn, modalStyles.memberActionBtnDanger]}
                      accessibilityRole="button"
                    >
                      <Text style={[modalStyles.memberActionText, { color: '#C62828' }]}>
                        {t('groups.removeMember')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
            style={modalStyles.list}
          />

          <TouchableOpacity onPress={onClose} style={modalStyles.closeBtn} accessibilityRole="button">
            <Text style={modalStyles.closeBtnText}>{t('compose.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── AddMemberModal ───────────────────────────────────────────────────────────

function AddMemberModal({
  visible,
  onAdd,
  onClose,
}: {
  visible: boolean;
  onAdd: (userId: string) => void;
  onClose: () => void;
}): ReactElement {
  const [userId, setUserId] = useState('');

  const handleAdd = () => {
    const trimmed = userId.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setUserId('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={modalStyles.overlay}>
        <View style={[modalStyles.sheet, { paddingBottom: 24 }]}>
          <View style={modalStyles.handleBar} />
          <Text style={modalStyles.title}>{t('groups.addMember')}</Text>

          <TextInput
            style={modalStyles.input}
            value={userId}
            onChangeText={setUserId}
            placeholder={t('groups.addMemberPlaceholder')}
            placeholderTextColor="#9E9E9E"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleAdd}
          />

          <View style={modalStyles.buttonRow}>
            <TouchableOpacity
              onPress={onClose}
              style={[modalStyles.dialogBtn, modalStyles.dialogBtnCancel]}
              accessibilityRole="button"
            >
              <Text style={modalStyles.dialogBtnText}>{t('compose.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleAdd}
              style={[modalStyles.dialogBtn, modalStyles.dialogBtnConfirm]}
              accessibilityRole="button"
            >
              <Text style={[modalStyles.dialogBtnText, { color: '#fff' }]}>
                {t('groups.addMember')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopStartRadius: 20,
    borderTopEndRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 16,
    maxHeight: '75%',
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0E0E0',
    alignSelf: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 12,
    textAlign: 'center',
  },
  list: { flexGrow: 0 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  memberInfo: { flex: 1, gap: 2 },
  memberName: { fontSize: 14, color: '#212121', fontWeight: '600' },
  adminBadge: {
    fontSize: 11,
    color: '#1976D2',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  onlineStatus: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  onlineLabel: { fontSize: 11, color: '#757575' },
  memberActions: { flexDirection: 'row', gap: 6 },
  memberActionBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#E3F2FD',
  },
  memberActionBtnDanger: { backgroundColor: '#FFEBEE' },
  memberActionText: { fontSize: 12, color: '#1976D2', fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#212121',
    marginBottom: 16,
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  },
  buttonRow: { flexDirection: 'row', gap: 10 },
  dialogBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  dialogBtnCancel: { backgroundColor: '#F5F5F5' },
  dialogBtnConfirm: { backgroundColor: '#1976D2' },
  dialogBtnText: { fontSize: 14, fontWeight: '600', color: '#424242' },
  closeBtn: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F0F0F0',
  },
  closeBtnText: { fontSize: 15, color: '#1976D2', fontWeight: '600' },
});

// ─── EditNameModal ────────────────────────────────────────────────────────────

function EditNameModal({
  visible,
  currentName,
  onSave,
  onClose,
}: {
  visible: boolean;
  currentName: string;
  onSave: (name: string) => void;
  onClose: () => void;
}): ReactElement {
  const [name, setName] = useState(currentName);

  useEffect(() => {
    if (visible) setName(currentName);
  }, [visible, currentName]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={modalStyles.overlay}>
        <View style={[modalStyles.sheet, { paddingBottom: 24 }]}>
          <View style={modalStyles.handleBar} />
          <Text style={modalStyles.title}>{t('groups.editName')}</Text>

          <TextInput
            style={modalStyles.input}
            value={name}
            onChangeText={setName}
            maxLength={80}
            returnKeyType="done"
            onSubmitEditing={() => { if (name.trim()) { onSave(name.trim()); onClose(); } }}
          />

          <View style={modalStyles.buttonRow}>
            <TouchableOpacity
              onPress={onClose}
              style={[modalStyles.dialogBtn, modalStyles.dialogBtnCancel]}
              accessibilityRole="button"
            >
              <Text style={modalStyles.dialogBtnText}>{t('compose.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { if (name.trim()) { onSave(name.trim()); onClose(); } }}
              style={[modalStyles.dialogBtn, modalStyles.dialogBtnConfirm]}
              accessibilityRole="button"
            >
              <Text style={[modalStyles.dialogBtnText, { color: '#fff' }]}>
                {t('groups.save')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── SearchBar ────────────────────────────────────────────────────────────────

function SearchBar({
  value,
  onChange,
  onClose,
}: {
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
}): ReactElement {
  return (
    <View style={searchStyles.container}>
      <Text style={searchStyles.icon}>🔍</Text>
      <TextInput
        style={searchStyles.input}
        value={value}
        onChangeText={onChange}
        placeholder={t('groups.searchMessages')}
        placeholderTextColor="#9E9E9E"
        autoFocus
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
      <TouchableOpacity onPress={onClose} style={searchStyles.cancelBtn} accessibilityRole="button">
        <Text style={searchStyles.cancelText}>{t('compose.cancel')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const searchStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F5F5F5',
    gap: 6,
  },
  icon: { fontSize: 14 },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#212121',
    paddingVertical: 6,
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  },
  cancelBtn: { paddingHorizontal: 4 },
  cancelText: { fontSize: 14, color: '#1976D2' },
});

// ─── MentionSuggestions ───────────────────────────────────────────────────────

function MentionSuggestions({
  prefix,
  members,
  onSelect,
}: {
  prefix: string;
  members: GroupMember[];
  onSelect: (member: GroupMember) => void;
}): ReactElement | null {
  const matches = useMemo(
    () =>
      members.filter((m) =>
        m.displayName.toLowerCase().includes(prefix.toLowerCase()),
      ),
    [prefix, members],
  );

  if (matches.length === 0) return null;

  return (
    <View style={mentionStyles.container}>
      {matches.slice(0, 5).map((m) => (
        <TouchableOpacity
          key={m.userId}
          style={mentionStyles.row}
          onPress={() => onSelect(m)}
          accessibilityRole="button"
        >
          <MemberAvatar member={m} size={28} />
          <Text style={mentionStyles.name}>{m.displayName}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const mentionStyles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
    maxHeight: 160,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F5F5F5',
  },
  name: { fontSize: 14, color: '#212121' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function GroupChatScreen(): ReactElement {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const session = useSession();
  const userId = session.state.status === 'signedIn' ? session.state.user.id : undefined;
  const client = useGroupsClient();

  // ── State ─────────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [info, setInfo] = useState<GroupInfo | null>(null);
  const [pinned] = useState<PinnedMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [compose, setCompose] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showMembersList, setShowMembersList] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showEditName, setShowEditName] = useState(false);

  // Search
  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [searchResults, setSearchResults] = useState<string[]>([]);

  // Mention
  const [mentionPrefix, setMentionPrefix] = useState<string | null>(null);

  const listRef = useRef<FlatList>(null);

  const isAdmin = info?.userRole === 'admin';

  // ── Load data ─────────────────────────────────────────────────────────────
  const loadMessages = useCallback(
    async (cursor?: string) => {
      if (!groupId) return;
      try {
        const res = await client.listGroupMessages({ params: { groupId }, query: { cursor } });
        if (res.status === 200) {
          const newMsgs = res.body.items.map(toChatMessage);
          setMessages((prev) => (cursor ? [...prev, ...newMsgs] : newMsgs));
          setNextCursor(res.body.nextCursor);
          setError(null);
        }
      } catch {
        setError(t('groups.loadError'));
      }
    },
    [groupId, client],
  );

  const loadGroup = useCallback(async () => {
    if (!groupId) return;
    try {
      // Fetch the group via listGroups and find matching id
      const res = await client.listGroups({ query: {} });
      if (res.status === 200) {
        const found = res.body.items.find((g) => g.id === groupId);
        if (found) {
          setInfo({
            id: found.id,
            name: found.name,
            avatarUrl: found.avatarUrl,
            memberCount: found.memberCount,
            createdBy: found.createdBy,
            muted: false,
            userRole: 'member',
          });
        }
      }
    } catch {
      // Non-fatal; header shows stale or missing data
    }
  }, [groupId, client]);

  useEffect(() => {
    const init = async () => {
      await Promise.all([loadMessages(), loadGroup()]);
      setLoading(false);
    };
    void init();
  }, [loadMessages, loadGroup]);

  // ── Search ────────────────────────────────────────────────────────────────
  const handleSearchChange = useCallback(
    (q: string) => {
      setSearchQuery(q);
      clearTimeout(searchTimer.current);
      if (!q.trim()) {
        setSearchResults([]);
        return;
      }
      searchTimer.current = setTimeout(() => {
        const lower = q.toLowerCase();
        const matched = messages
          .filter((m) => m.text?.toLowerCase().includes(lower))
          .map((m) => m.id);
        setSearchResults(matched);
      }, SEARCH_DEBOUNCE);
    },
    [messages],
  );

  const navigateToMessage = useCallback((msgId: string) => {
    const idx = messages.findIndex((m) => m.id === msgId);
    if (idx >= 0) {
      listRef.current?.scrollToIndex({ index: idx, animated: true });
    }
  }, [messages]);

  // ── Mention ───────────────────────────────────────────────────────────────
  const handleComposeChange = useCallback(
    (text: string) => {
      setCompose(text);
      // Detect trailing @word
      const match = text.match(/@(\w*)$/);
      setMentionPrefix(match ? match[1]! : null);
    },
    [],
  );

  const insertMention = useCallback(
    (member: GroupMember) => {
      const withoutTrigger = compose.replace(/@\w*$/, '');
      setCompose(`${withoutTrigger}@${member.displayName} `);
      setMentionPrefix(null);
    },
    [compose],
  );

  // ── Send message ──────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = compose.trim();
    if (!text || !groupId) return;

    const optimistic: ChatMessage = {
      id: `opt-${Date.now()}`,
      senderId: userId ?? '',
      type: 'text',
      text,
      status: 'sending',
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [optimistic, ...prev]);
    setCompose('');
    setSending(true);

    try {
      const res = await client.sendGroupMessage({ params: { groupId }, body: { text } });
      if (res.status === 201) {
        const real = toChatMessage(res.body);
        setMessages((prev) =>
          prev.map((m) => (m.id === optimistic.id ? { ...real, status: 'sent' } : m)),
        );
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === optimistic.id ? { ...m, status: 'sending' } : m)),
      );
    } finally {
      setSending(false);
    }
  }, [compose, groupId, userId, client]);

  // ── Load more ─────────────────────────────────────────────────────────────
  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    await loadMessages(nextCursor);
    setLoadingMore(false);
  }, [nextCursor, loadingMore, loadMessages]);

  // ── Add member ────────────────────────────────────────────────────────────
  const handleAddMember = useCallback(
    async (newUserId: string) => {
      if (!groupId) return;
      try {
        await client.addGroupMember({
          params: { groupId },
          body: { userId: newUserId, role: 'member' },
        });
        await loadGroup();
      } catch {
        Alert.alert(t('groups.addMemberError'));
      }
    },
    [groupId, client, loadGroup],
  );

  // ── Remove member ─────────────────────────────────────────────────────────
  const handleRemoveMember = useCallback(
    (targetUserId: string) => {
      Alert.alert(
        t('groups.removeMember'),
        undefined,
        [
          { text: t('compose.cancel'), style: 'cancel' },
          {
            text: t('groups.removeMember'),
            style: 'destructive',
            onPress: async () => {
              // In a real integration call the remove-member endpoint
              setMembers((prev) => prev.filter((m) => m.userId !== targetUserId));
            },
          },
        ],
      );
    },
    [],
  );

  // ── Promote member ────────────────────────────────────────────────────────
  const handlePromoteMember = useCallback(
    (targetUserId: string) => {
      setMembers((prev) =>
        prev.map((m) => (m.userId === targetUserId ? { ...m, role: 'admin' } : m)),
      );
    },
    [],
  );

  // ── Leave / Delete group ──────────────────────────────────────────────────
  const handleLeaveGroup = useCallback(() => {
    Alert.alert(
      t('groups.leaveGroup'),
      t('groups.leaveGroupConfirm'),
      [
        { text: t('compose.cancel'), style: 'cancel' },
        {
          text: t('groups.leaveGroup'),
          style: 'destructive',
          onPress: () => router.back(),
        },
      ],
    );
  }, [router]);

  const handleDeleteGroup = useCallback(() => {
    Alert.alert(
      t('groups.deleteGroup'),
      t('groups.deleteGroupConfirm'),
      [
        { text: t('compose.cancel'), style: 'cancel' },
        {
          text: t('groups.deleteGroup'),
          style: 'destructive',
          onPress: () => router.back(),
        },
      ],
    );
  }, [router]);

  // ── Mute toggle ───────────────────────────────────────────────────────────
  const handleMuteToggle = useCallback(() => {
    setInfo((prev) =>
      prev ? { ...prev, muted: !prev.muted } : prev,
    );
  }, []);

  // ── Edit name ─────────────────────────────────────────────────────────────
  const handleSaveName = useCallback(
    (name: string) => {
      setInfo((prev) => (prev ? { ...prev, name } : prev));
    },
    [],
  );

  // ── Navigate to pinned ────────────────────────────────────────────────────
  const handlePinnedNavigate = useCallback(
    (messageId: string) => navigateToMessage(messageId),
    [navigateToMessage],
  );

  // ── Render item ───────────────────────────────────────────────────────────
  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => {
      const isHighlighted = searchResults.includes(item.id);
      return (
        <View style={isHighlighted ? styles.highlightedBubble : undefined}>
          <MessageBubble
            message={item}
            isOwn={item.senderId === userId}
            showReadReceipts={item.senderId === userId}
            callbacks={{
              onReply: () => undefined,
              onForward: () => undefined,
              onDelete: () => undefined,
            }}
          />
        </View>
      );
    },
    [userId, searchResults],
  );

  // ── Loading / error ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </SafeAreaView>
    );
  }

  if (error && messages.length === 0) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {/* Group header */}
        {info && (
          <MembersHeader
            members={members}
            info={info}
            isAdmin={isAdmin}
            onEditName={() => setShowEditName(true)}
            onAddMember={() => setShowAddMember(true)}
            onMuteToggle={handleMuteToggle}
            onLeaveGroup={handleLeaveGroup}
            onDeleteGroup={handleDeleteGroup}
            onMembersListPress={() => setShowMembersList(true)}
          />
        )}

        {/* Search bar */}
        {searchActive && (
          <SearchBar
            value={searchQuery}
            onChange={handleSearchChange}
            onClose={() => { setSearchActive(false); setSearchQuery(''); setSearchResults([]); }}
          />
        )}

        {/* Pinned messages */}
        <PinnedBar pinned={pinned} onNavigate={handlePinnedNavigate} />

        {/* Messages list */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          inverted
          contentContainerStyle={styles.listContent}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator size="small" color="#1976D2" style={styles.loadMore} /> : null
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>{t('groups.messagesEmpty')}</Text>
            </View>
          }
          getItemLayout={(_data, index) => ({
            length: 70,
            offset: 70 * index,
            index,
          })}
          onScrollToIndexFailed={() => undefined}
        />

        {/* Mention suggestions */}
        {mentionPrefix !== null && (
          <MentionSuggestions
            prefix={mentionPrefix}
            members={members}
            onSelect={insertMention}
          />
        )}

        {/* Compose bar */}
        <View style={styles.composeBar}>
          <TouchableOpacity
            style={styles.searchIconBtn}
            onPress={() => setSearchActive(true)}
            accessibilityRole="button"
            accessibilityLabel={t('search.placeholder')}
          >
            <Text style={styles.searchIconText}>🔍</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.composeInput}
            value={compose}
            onChangeText={handleComposeChange}
            placeholder={t('groups.sendPlaceholder')}
            placeholderTextColor="#9E9E9E"
            multiline
            maxLength={2000}
            returnKeyType="default"
            textAlign={I18nManager.isRTL ? 'right' : 'left'}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!compose.trim() || sending) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!compose.trim() || sending}
            accessibilityRole="button"
            accessibilityLabel={t('groups.send')}
          >
            <Text style={styles.sendBtnText}>{t('groups.send')}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Modals */}
      {info && (
        <>
          <MembersListModal
            visible={showMembersList}
            members={members}
            isAdmin={isAdmin}
            currentUserId={userId ?? ''}
            onRemove={handleRemoveMember}
            onPromote={handlePromoteMember}
            onClose={() => setShowMembersList(false)}
          />
          <AddMemberModal
            visible={showAddMember}
            onAdd={handleAddMember}
            onClose={() => setShowAddMember(false)}
          />
          <EditNameModal
            visible={showEditName}
            currentName={info.name}
            onSave={handleSaveName}
            onClose={() => setShowEditName(false)}
          />
        </>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  emptyText: { fontSize: 14, color: '#9E9E9E', textAlign: 'center' },
  errorText: { fontSize: 14, color: '#C62828', textAlign: 'center' },
  listContent: { paddingVertical: 8 },
  loadMore: { paddingVertical: 12 },
  highlightedBubble: { backgroundColor: '#FFF9C4' },

  composeBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
    gap: 8,
  },
  searchIconBtn: { padding: 4 },
  searchIconText: { fontSize: 18 },
  composeInput: {
    flex: 1,
    maxHeight: 120,
    minHeight: 40,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    color: '#212121',
    backgroundColor: '#F8F8F8',
  },
  sendBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#1976D2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#BDBDBD' },
  sendBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
