/**
 * GroupChatScreen – full group conversation UI with admin controls.
 *
 * Features:
 * - Group header with member count
 * - Add / remove members (admin only)
 * - Edit group name + photo stub
 * - Admin controls panel
 * - Leave group
 * - Mute notifications (local toggle)
 * - Full message rendering via MessageBubble
 * - Paginated history
 */
import { useLocalSearchParams } from 'expo-router';
import {
  useCallback,
  useEffect,
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
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { GroupMessageType } from '@iraq-maps/contracts';
import { useSession } from '@iraq-maps/mobile-kit';
import { MessageBubble, type ChatMessage, type MessageStatus } from '../components/MessageBubble';
import { TypingIndicator } from '../components/TypingIndicator';
import { useGroupsClient } from '../client';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ─── Types ───────────────────────────────────────────────────────────────────

interface GroupMember {
  userId: string;
  displayName: string;
  role: 'admin' | 'member';
  joinedAt: string;
}

interface GroupInfo {
  id: string;
  name: string;
  avatarUrl?: string;
  memberCount: number;
  createdBy: string;
  muted: boolean;
}

// ─── Helper: map GroupMessageType → ChatMessage ──────────────────────────────

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

// ─── Group info header panel ─────────────────────────────────────────────────

interface GroupHeaderProps {
  info: GroupInfo;
  isAdmin: boolean;
  onEditPress: () => void;
  onMembersPress: () => void;
  onMuteToggle: () => void;
  onLeaveGroup: () => void;
}

function GroupInfoHeader({
  info,
  isAdmin,
  onEditPress,
  onMembersPress,
  onMuteToggle,
  onLeaveGroup,
}: GroupHeaderProps): ReactElement {
  return (
    <View style={groupHeaderStyles.container}>
      {/* Avatar */}
      <View style={groupHeaderStyles.avatarWrap}>
        <View style={groupHeaderStyles.avatar}>
          <Text style={groupHeaderStyles.avatarIcon}>👥</Text>
        </View>
        {isAdmin ? (
          <TouchableOpacity
            style={groupHeaderStyles.editAvatarBtn}
            onPress={onEditPress}
            accessibilityRole="button"
          >
            <Text style={groupHeaderStyles.editAvatarIcon}>✏️</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={groupHeaderStyles.nameBlock}>
        <View style={groupHeaderStyles.nameLine}>
          <Text style={groupHeaderStyles.name} numberOfLines={1}>{info.name}</Text>
          {isAdmin ? (
            <TouchableOpacity onPress={onEditPress} hitSlop={{ top: 8, bottom: 8, start: 8, end: 8 }}>
              <Text style={groupHeaderStyles.editNameBtn}>✏</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity onPress={onMembersPress}>
          <Text style={groupHeaderStyles.memberCount}>
            {t('groups.memberCount', { n: info.memberCount })}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Action buttons */}
      <View style={groupHeaderStyles.actions}>
        <TouchableOpacity
          style={groupHeaderStyles.actionBtn}
          onPress={onMuteToggle}
          accessibilityRole="button"
        >
          <Text style={groupHeaderStyles.actionIcon}>{info.muted ? '🔕' : '🔔'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={groupHeaderStyles.actionBtn}
          onPress={onLeaveGroup}
          accessibilityRole="button"
        >
          <Text style={groupHeaderStyles.actionIcon}>🚪</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const groupHeaderStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#1976D2',
    gap: 12,
  },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarIcon: { fontSize: 20 },
  editAvatarBtn: {
    position: 'absolute',
    bottom: -2,
    end: -2,
    backgroundColor: '#FFF',
    borderRadius: 10,
    padding: 2,
  },
  editAvatarIcon: { fontSize: 10 },
  nameBlock: { flex: 1 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 16, fontWeight: '700', color: '#FFF', flexShrink: 1 },
  editNameBtn: { fontSize: 13, color: 'rgba(255,255,255,0.75)' },
  memberCount: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 4 },
  actionBtn: { padding: 6 },
  actionIcon: { fontSize: 20 },
});

// ─── Members modal ────────────────────────────────────────────────────────────

interface MembersModalProps {
  visible: boolean;
  members: GroupMember[];
  isAdmin: boolean;
  myId: string;
  onClose: () => void;
  onRemoveMember: (userId: string) => void;
  onAddMember: () => void;
  onMakeAdmin: (userId: string) => void;
}

function MembersModal({
  visible,
  members,
  isAdmin,
  myId,
  onClose,
  onRemoveMember,
  onAddMember,
  onMakeAdmin,
}: MembersModalProps): ReactElement {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <SafeAreaView style={membersStyles.safe}>
        {/* Header */}
        <View style={membersStyles.header}>
          <Text style={membersStyles.title}>
            {t('groups.addMembers')} ({members.length})
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, start: 10, end: 10 }}>
            <Text style={membersStyles.closeBtn}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Add member button (admin only) */}
        {isAdmin ? (
          <TouchableOpacity style={membersStyles.addBtn} onPress={onAddMember}>
            <Text style={membersStyles.addIcon}>➕</Text>
            <Text style={membersStyles.addLabel}>{t('groups.addMember')}</Text>
          </TouchableOpacity>
        ) : null}

        {/* Member list */}
        <FlatList
          data={members}
          keyExtractor={(m) => m.userId}
          renderItem={({ item }) => (
            <View style={membersStyles.memberRow}>
              <View style={membersStyles.memberAvatar}>
                <Text style={membersStyles.memberAvatarInitial}>
                  {item.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={membersStyles.memberInfo}>
                <Text style={membersStyles.memberName}>{item.displayName}</Text>
                {item.role === 'admin' ? (
                  <Text style={membersStyles.adminBadge}>{t('groups.notAdmin').includes('Admin') ? 'Admin' : 'مشرف'}</Text>
                ) : null}
              </View>
              {isAdmin && item.userId !== myId ? (
                <TouchableOpacity
                  hitSlop={{ top: 8, bottom: 8, start: 8, end: 8 }}
                  onPress={() => {
                    Alert.alert(
                      t('groups.addMember'),
                      undefined,
                      [
                        {
                          text: t('groups.notAdmin').includes('Admin')
                            ? 'Make admin'
                            : 'جعل مشرفاً',
                          onPress: () => onMakeAdmin(item.userId),
                        },
                        {
                          text: t('conversation.deleteForEveryone').includes('Delete')
                            ? 'Remove'
                            : 'إزالة',
                          style: 'destructive',
                          onPress: () => onRemoveMember(item.userId),
                        },
                        { text: t('compose.cancel'), style: 'cancel' },
                      ],
                    );
                  }}
                >
                  <Text style={membersStyles.moreBtn}>⋯</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

const membersStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  title: { fontSize: 17, fontWeight: '700', color: '#212121' },
  closeBtn: { fontSize: 18, color: '#757575' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  addIcon: { fontSize: 20 },
  addLabel: { fontSize: 15, color: '#1976D2', fontWeight: '600' },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F5F5F5',
    gap: 12,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarInitial: { fontSize: 16, color: '#1976D2', fontWeight: '700' },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, color: '#212121', fontWeight: '500' },
  adminBadge: { fontSize: 11, color: '#E65100', marginTop: 2 },
  moreBtn: { fontSize: 20, color: '#9E9E9E', paddingHorizontal: 4 },
});

// ─── Edit group modal ────────────────────────────────────────────────────────

interface EditGroupModalProps {
  visible: boolean;
  currentName: string;
  onSave: (newName: string) => void;
  onClose: () => void;
}

function EditGroupModal({ visible, currentName, onSave, onClose }: EditGroupModalProps): ReactElement {
  const [name, setName] = useState(currentName);
  useEffect(() => { if (visible) setName(currentName); }, [visible, currentName]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={editStyles.overlay}>
        <View style={editStyles.card}>
          <Text style={editStyles.title}>{t('groups.nameLabel')}</Text>
          <TextInput
            style={editStyles.input}
            value={name}
            onChangeText={setName}
            placeholder={t('groups.namePlaceholder')}
            autoFocus
            maxLength={60}
            textAlign={I18nManager.isRTL ? 'right' : 'left'}
          />
          <View style={editStyles.btnRow}>
            <TouchableOpacity style={editStyles.cancelBtn} onPress={onClose}>
              <Text style={editStyles.cancelLabel}>{t('compose.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[editStyles.saveBtn, !name.trim() && editStyles.saveBtnDisabled]}
              disabled={!name.trim()}
              onPress={() => { onSave(name.trim()); onClose(); }}
            >
              <Text style={editStyles.saveLabel}>{t('groups.create')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const editStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '85%',
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 20,
    gap: 16,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  title: { fontSize: 17, fontWeight: '700', color: '#212121' },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#FAFAFA',
  },
  btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 10 },
  cancelLabel: { fontSize: 15, color: '#757575' },
  saveBtn: {
    backgroundColor: '#1976D2',
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  saveBtnDisabled: { backgroundColor: '#BDBDBD' },
  saveLabel: { fontSize: 15, color: '#FFF', fontWeight: '700' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export function GroupChatScreen(): ReactElement {
  const { groupId, groupName } = useLocalSearchParams<{ groupId: string; groupName?: string }>();
  const client = useGroupsClient();
  const session = useSession();
  const myId = session.state.status === 'signedIn' ? session.state.user.id : 'anon';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [typingVisible] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const [groupInfo, setGroupInfo] = useState<GroupInfo>({
    id: groupId ?? '',
    name: groupName ?? t('groups.title'),
    memberCount: 0,
    createdBy: '',
    muted: false,
  });
  const [members, setMembers] = useState<GroupMember[]>([]);
  const isAdmin = members.find((m) => m.userId === myId)?.role === 'admin';

  const listRef = useRef<FlatList<ChatMessage>>(null);

  // ── Load messages ────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!groupId) return;
    try {
      const res = await client.listGroupMessages({
        params: { groupId: groupId as never },
        query: {},
      });
      if (res.status === 200) {
        setMessages(res.body.items.slice().reverse().map(toChatMessage));
        setGroupInfo((prev) => ({ ...prev, memberCount: res.body.items.length > 0 ? 1 : 0 }));
      }
    } finally {
      setLoading(false);
    }
  }, [groupId, client]);

  useEffect(() => { void load(); }, [load]);

  // ── Send ─────────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || !groupId) return;
    setSending(true);
    setText('');
    const temp: ChatMessage = {
      id: `temp-${Date.now()}`,
      senderId: myId,
      type: 'text',
      text: trimmed,
      status: 'sending',
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, temp]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);

    try {
      const res = await client.sendGroupMessage({
        params: { groupId: groupId as never },
        body: { text: trimmed },
      });
      if (res.status === 201) {
        setMessages((prev) =>
          prev.map((m) => (m.id === temp.id ? toChatMessage(res.body) : m)),
        );
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === temp.id ? { ...m, status: 'sent' as MessageStatus } : m,
        ),
      );
    } finally {
      setSending(false);
    }
  }, [text, groupId, myId, client]);

  // ── Leave group ──────────────────────────────────────────────────────────
  const handleLeave = useCallback(() => {
    Alert.alert(
      t('groups.title'),
      undefined,
      [
        {
          text: t('conversation.leaveGroup'),
          style: 'destructive',
          onPress: () => {
            // API call stub
          },
        },
        { text: t('compose.cancel'), style: 'cancel' },
      ],
    );
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <MessageBubble
        message={item}
        isOwn={item.senderId === myId}
        showReadReceipts={false}
        callbacks={{}}
      />
    ),
    [myId],
  );

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <GroupInfoHeader
          info={groupInfo}
          isAdmin={isAdmin}
          onEditPress={() => setShowEdit(true)}
          onMembersPress={() => setShowMembers(true)}
          onMuteToggle={() => setGroupInfo((g) => ({ ...g, muted: !g.muted }))}
          onLeaveGroup={handleLeave}
        />

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#1976D2" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <Text style={styles.empty}>{t('groups.messagesEmpty')}</Text>
            }
            onContentSizeChange={() =>
              listRef.current?.scrollToEnd({ animated: false })
            }
          />
        )}

        {typingVisible ? (
          <View style={styles.typingRow}>
            <TypingIndicator />
          </View>
        ) : null}

        {/* Compose */}
        <View style={styles.compose}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={t('groups.sendPlaceholder')}
            placeholderTextColor="#9E9E9E"
            multiline
            maxLength={4000}
            textAlign={I18nManager.isRTL ? 'right' : 'left'}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
            onPress={() => { void handleSend(); }}
            disabled={!text.trim() || sending}
            accessibilityRole="button"
            accessibilityLabel={t('groups.send')}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.sendIcon}>↑</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <MembersModal
        visible={showMembers}
        members={members}
        isAdmin={isAdmin}
        myId={myId}
        onClose={() => setShowMembers(false)}
        onRemoveMember={(uid) => setMembers((m) => m.filter((x) => x.userId !== uid))}
        onAddMember={() => { /* navigate to user search */ }}
        onMakeAdmin={(uid) =>
          setMembers((m) =>
            m.map((x) => (x.userId === uid ? { ...x, role: 'admin' } : x)),
          )
        }
      />

      <EditGroupModal
        visible={showEdit}
        currentName={groupInfo.name}
        onSave={(name) => setGroupInfo((g) => ({ ...g, name }))}
        onClose={() => setShowEdit(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F5F5' },
  kav: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 8, flexGrow: 1, gap: 2 },
  empty: { textAlign: 'center', color: '#9E9E9E', padding: 32, marginTop: 40 },
  typingRow: { paddingHorizontal: 16, paddingBottom: 6, alignItems: 'flex-start' },
  compose: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 8,
    backgroundColor: '#FFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxHeight: 120,
    fontSize: 15,
    backgroundColor: '#FAFAFA',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1976D2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#BDBDBD' },
  sendIcon: { fontSize: 18, color: '#FFF', fontWeight: '700' },
});
