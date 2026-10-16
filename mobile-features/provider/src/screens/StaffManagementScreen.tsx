/**
 * StaffManagementScreen — manage team members for a provider.
 * Owner-only: invite by phone, assign roles, set per-role permissions,
 * remove staff, and browse the activity log.
 */
import { useApi } from '@iraq-maps/mobile-kit';
import { EmptyState, Screen } from '@iraq-maps/ui';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  Alert,
  I18nManager,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../strings';

I18nManager.forceRTL(true);

const PRIMARY = '#1976D2';
const DANGER = '#EF4444';
const SUCCESS = '#16A34A';
const WARN = '#D97706';
const SURFACE = '#FFFFFF';
const BG = '#F5F5F5';
const BORDER = '#E0E0E0';

// ─── Types ────────────────────────────────────────────────────────────────────

export type StaffRole = 'owner' | 'manager' | 'staff';

export interface StaffPermissions {
  replyMessages: boolean;
  managePosts: boolean;
  viewAnalytics: boolean;
  manageAppointments: boolean;
}

export interface StaffMember {
  id: string;
  phone: string;
  name: string;
  role: StaffRole;
  permissions: StaffPermissions;
  joinedAt: string; // ISO
}

export interface ActivityEntry {
  id: string;
  staffId: string;
  staffName: string;
  action: string;
  at: string; // ISO
}

// ─── Default permissions per role ────────────────────────────────────────────

function defaultPermissions(role: StaffRole): StaffPermissions {
  switch (role) {
    case 'owner': return { replyMessages: true, managePosts: true, viewAnalytics: true, manageAppointments: true };
    case 'manager': return { replyMessages: true, managePosts: true, viewAnalytics: true, manageAppointments: true };
    case 'staff': return { replyMessages: true, managePosts: false, viewAnalytics: false, manageAppointments: false };
  }
}

// ─── Mock data ────────────────────────────────────────────────────────────────

function makeId(): string { return Math.random().toString(36).slice(2, 10); }

const MOCK_STAFF: StaffMember[] = [
  { id: makeId(), phone: '07901234567', name: 'أحمد علي', role: 'owner', permissions: defaultPermissions('owner'), joinedAt: '2025-01-01T00:00:00Z' },
  { id: makeId(), phone: '07901234568', name: 'سارة محمد', role: 'manager', permissions: defaultPermissions('manager'), joinedAt: '2025-03-15T00:00:00Z' },
  { id: makeId(), phone: '07901234569', name: 'خالد حسين', role: 'staff', permissions: defaultPermissions('staff'), joinedAt: '2025-06-01T00:00:00Z' },
];

const MOCK_ACTIVITY: ActivityEntry[] = [
  { id: makeId(), staffId: MOCK_STAFF[1]!.id, staffName: 'سارة محمد', action: 'ردّت على استفسار #1042', at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
  { id: makeId(), staffId: MOCK_STAFF[1]!.id, staffName: 'سارة محمد', action: 'نشرت منشوراً جديداً', at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString() },
  { id: makeId(), staffId: MOCK_STAFF[2]!.id, staffName: 'خالد حسين', action: 'ردّ على استفسار #1041', at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
];

// ─── Role badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: StaffRole }): ReactElement {
  const colors: Record<StaffRole, [string, string]> = {
    owner: ['#7C3AED', '#EDE9FE'],
    manager: [PRIMARY, '#DBEAFE'],
    staff: ['#374151', '#F3F4F6'],
  };
  const [fg, bg] = colors[role];
  return (
    <View style={[styles.roleBadge, { backgroundColor: bg }]}>
      <Text style={[styles.roleBadgeText, { color: fg }]}>{t(`staff.role${role.charAt(0).toUpperCase() + role.slice(1)}` as Parameters<typeof t>[0])}</Text>
    </View>
  );
}

// ─── Permission row ───────────────────────────────────────────────────────────

function PermissionRow({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled: boolean }): ReactElement {
  return (
    <View style={styles.permRow}>
      <Text style={[styles.permLabel, disabled && styles.permLabelDisabled]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: BORDER, true: PRIMARY }}
        thumbColor={SURFACE}
      />
    </View>
  );
}

// ─── Staff card ───────────────────────────────────────────────────────────────

function StaffCard({ member, isOwner, onEdit, onRemove }: { member: StaffMember; isOwner: boolean; onEdit: () => void; onRemove: () => void }): ReactElement {
  const joinDate = new Date(member.joinedAt).toLocaleDateString('ar-IQ');
  return (
    <View style={styles.staffCard}>
      <View style={styles.staffCardHeader}>
        <View style={styles.staffAvatar}>
          <Text style={styles.staffAvatarText}>{member.name.charAt(0)}</Text>
        </View>
        <View style={{ flex: 1, marginStart: 10 }}>
          <Text style={styles.staffName}>{member.name}</Text>
          <Text style={styles.staffPhone}>{member.phone}</Text>
          <Text style={styles.staffDate}>{t('staff.memberSince', { date: joinDate })}</Text>
        </View>
        <RoleBadge role={member.role} />
      </View>
      {/* Permissions summary */}
      <View style={styles.permSummary}>
        {member.permissions.replyMessages && <View style={styles.permChip}><Text style={styles.permChipText}>💬 {t('staff.permReplyMessages')}</Text></View>}
        {member.permissions.managePosts && <View style={styles.permChip}><Text style={styles.permChipText}>📝 {t('staff.permManagePosts')}</Text></View>}
        {member.permissions.viewAnalytics && <View style={styles.permChip}><Text style={styles.permChipText}>📊 {t('staff.permViewAnalytics')}</Text></View>}
        {member.permissions.manageAppointments && <View style={styles.permChip}><Text style={styles.permChipText}>📅 {t('staff.permManageAppointments')}</Text></View>}
      </View>
      {/* Actions — only owner can manage others; owner card has no remove button */}
      {isOwner && member.role !== 'owner' && (
        <View style={styles.staffActions}>
          <TouchableOpacity style={styles.staffActionBtn} onPress={onEdit} accessibilityRole="button">
            <Text style={[styles.staffActionText, { color: PRIMARY }]}>✎ {t('staff.permissions')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.staffActionBtn} onPress={onRemove} accessibilityRole="button">
            <Text style={[styles.staffActionText, { color: DANGER }]}>✕ {t('staff.removeStaff')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Edit permissions modal ───────────────────────────────────────────────────

function EditPermissionsModal({ visible, member, onSave, onCancel }: { visible: boolean; member: StaffMember | null; onSave: (id: string, role: StaffRole, perms: StaffPermissions) => void; onCancel: () => void }): ReactElement {
  const [role, setRole] = useState<StaffRole>('staff');
  const [perms, setPerms] = useState<StaffPermissions>(defaultPermissions('staff'));

  useEffect(() => {
    if (visible && member) { setRole(member.role); setPerms({ ...member.permissions }); }
  }, [visible, member]);

  const setRole_ = useCallback((r: StaffRole) => {
    setRole(r);
    setPerms(defaultPermissions(r));
  }, []);

  const setPerm = useCallback(<K extends keyof StaffPermissions>(k: K, v: boolean) => {
    setPerms(p => ({ ...p, [k]: v }));
  }, []);

  const handleSave = useCallback(() => {
    if (!member) return;
    onSave(member.id, role, perms);
  }, [member, role, perms, onSave]);

  const ROLES: StaffRole[] = ['manager', 'staff'];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.overlayBg}>
        <View style={styles.overlayCard}>
          <Text style={styles.overlayTitle}>{member?.name}</Text>
          {/* Role picker */}
          <Text style={styles.fieldLabel}>{t('staff.role')}</Text>
          <View style={styles.rolePicker}>
            {ROLES.map(r => (
              <TouchableOpacity key={r} style={[styles.rolePickerBtn, role === r && styles.rolePickerBtnActive]} onPress={() => setRole_(r)}>
                <Text style={[styles.rolePickerBtnText, role === r && styles.rolePickerBtnTextActive]}>
                  {t(`staff.role${r.charAt(0).toUpperCase() + r.slice(1)}` as Parameters<typeof t>[0])}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {/* Permissions */}
          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>{t('staff.permissions')}</Text>
          <PermissionRow label={t('staff.permReplyMessages')} value={perms.replyMessages} onChange={v => setPerm('replyMessages', v)} disabled={false} />
          <PermissionRow label={t('staff.permManagePosts')} value={perms.managePosts} onChange={v => setPerm('managePosts', v)} disabled={false} />
          <PermissionRow label={t('staff.permViewAnalytics')} value={perms.viewAnalytics} onChange={v => setPerm('viewAnalytics', v)} disabled={false} />
          <PermissionRow label={t('staff.permManageAppointments')} value={perms.manageAppointments} onChange={v => setPerm('manageAppointments', v)} disabled={false} />
          <View style={styles.overlayActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}><Text style={styles.cancelBtnText}>{t('staff.cancel')}</Text></TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}><Text style={styles.saveBtnText}>{t('staff.save')}</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Invite modal ─────────────────────────────────────────────────────────────

function InviteModal({ visible, onInvite, onCancel }: { visible: boolean; onInvite: (phone: string, role: StaffRole) => void; onCancel: () => void }): ReactElement {
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<StaffRole>('staff');
  const [sending, setSending] = useState(false);

  useEffect(() => { if (visible) { setPhone(''); setRole('staff'); } }, [visible]);

  const handleInvite = useCallback(async () => {
    if (!phone.trim()) { Alert.alert(t('staff.phone')); return; }
    setSending(true);
    await new Promise(r => setTimeout(r, 800));
    setSending(false);
    onInvite(phone.trim(), role);
  }, [phone, role, onInvite]);

  const ROLES: StaffRole[] = ['manager', 'staff'];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.overlayBg}>
        <View style={styles.overlayCard}>
          <Text style={styles.overlayTitle}>{t('staff.inviteStaff')}</Text>
          <Text style={styles.fieldLabel}>{t('staff.phone')} *</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder={t('staff.phonePlaceholder')}
            keyboardType="phone-pad"
            textAlign="right"
          />
          <Text style={styles.fieldLabel}>{t('staff.role')}</Text>
          <View style={styles.rolePicker}>
            {ROLES.map(r => (
              <TouchableOpacity key={r} style={[styles.rolePickerBtn, role === r && styles.rolePickerBtnActive]} onPress={() => setRole(r)}>
                <Text style={[styles.rolePickerBtnText, role === r && styles.rolePickerBtnTextActive]}>
                  {t(`staff.role${r.charAt(0).toUpperCase() + r.slice(1)}` as Parameters<typeof t>[0])}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.overlayActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}><Text style={styles.cancelBtnText}>{t('staff.cancel')}</Text></TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleInvite} disabled={sending}>
              {sending ? <ActivityIndicator color={SURFACE} size="small" /> : <Text style={styles.saveBtnText}>{t('staff.inviteStaff')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Activity log ─────────────────────────────────────────────────────────────

function ActivityLog({ entries }: { entries: ActivityEntry[] }): ReactElement {
  if (entries.length === 0) {
    return <Text style={styles.noActivity}>{t('staff.noActivity')}</Text>;
  }
  return (
    <View style={styles.activityList}>
      {entries.map(e => {
        const ago = Math.round((Date.now() - new Date(e.at).getTime()) / 60000);
        const timeStr = ago < 60 ? `${ago}م` : ago < 1440 ? `${Math.round(ago / 60)}س` : `${Math.round(ago / 1440)}ي`;
        return (
          <View key={e.id} style={styles.activityItem}>
            <View style={styles.activityDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.activityAction}>{e.action}</Text>
              <Text style={styles.activityMeta}>{t('staff.activityBy', { name: e.staffName })} · {timeStr}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function StaffManagementScreen(): ReactElement {
  const [staff, setStaff] = useState<StaffMember[]>(MOCK_STAFF);
  const [activity] = useState<ActivityEntry[]>(MOCK_ACTIVITY);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'members' | 'activity'>('members');

  const [inviteModal, setInviteModal] = useState(false);
  const [editModal, setEditModal] = useState<{ visible: boolean; member: StaffMember | null }>({ visible: false, member: null });

  // Current user is owner (mock — in production comes from auth context)
  const isOwner = true;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise(r => setTimeout(r, 600));
    setRefreshing(false);
  }, []);

  const handleInvite = useCallback((phone: string, role: StaffRole) => {
    const newMember: StaffMember = {
      id: makeId(),
      phone,
      name: phone, // backend would resolve name from identity
      role,
      permissions: defaultPermissions(role),
      joinedAt: new Date().toISOString(),
    };
    setStaff(s => [...s, newMember]);
    setInviteModal(false);
    Alert.alert(t('staff.inviteSent'));
  }, []);

  const handleSavePermissions = useCallback((id: string, role: StaffRole, perms: StaffPermissions) => {
    setStaff(s => s.map(m => m.id === id ? { ...m, role, permissions: perms } : m));
    setEditModal({ visible: false, member: null });
  }, []);

  const handleRemove = useCallback((member: StaffMember) => {
    Alert.alert(t('staff.removeStaff'), t('staff.removeConfirm'), [
      { text: t('staff.cancel'), style: 'cancel' },
      {
        text: t('staff.removeStaff'),
        style: 'destructive',
        onPress: () => {
          setStaff(s => s.filter(m => m.id !== member.id));
          Alert.alert(t('staff.removedSuccess'));
        },
      },
    ]);
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.screenTitle}>{t('staff.title')}</Text>
        {isOwner && (
          <TouchableOpacity style={styles.inviteBtn} onPress={() => setInviteModal(true)}>
            <Text style={styles.inviteBtnText}>+ {t('staff.inviteStaff')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {!isOwner && (
        <View style={styles.ownerOnly}>
          <Text style={styles.ownerOnlyText}>{t('staff.ownerOnly')}</Text>
        </View>
      )}

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity style={[styles.tab, tab === 'members' && styles.tabActive]} onPress={() => setTab('members')}>
          <Text style={[styles.tabText, tab === 'members' && styles.tabTextActive]}>👥 {t('staff.title')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'activity' && styles.tabActive]} onPress={() => setTab('activity')}>
          <Text style={[styles.tabText, tab === 'activity' && styles.tabTextActive]}>🕐 {t('staff.activityLog')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {tab === 'members' ? (
          staff.length === 0 ? (
            <EmptyState title={t('staff.noStaff')} body={t('staff.noStaffBody')} />
          ) : (
            staff.map(member => (
              <StaffCard
                key={member.id}
                member={member}
                isOwner={isOwner}
                onEdit={() => setEditModal({ visible: true, member })}
                onRemove={() => handleRemove(member)}
              />
            ))
          )
        ) : (
          <View>
            <Text style={styles.sectionTitle}>{t('staff.activityLog')}</Text>
            <ActivityLog entries={activity} />
          </View>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Modals */}
      <InviteModal visible={inviteModal} onInvite={handleInvite} onCancel={() => setInviteModal(false)} />
      <EditPermissionsModal visible={editModal.visible} member={editModal.member} onSave={handleSavePermissions} onCancel={() => setEditModal({ visible: false, member: null })} />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: SURFACE, borderBottomWidth: 1, borderBottomColor: BORDER },
  screenTitle: { fontSize: 20, fontWeight: '700', color: '#111' },
  inviteBtn: { backgroundColor: PRIMARY, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  inviteBtnText: { color: SURFACE, fontWeight: '700', fontSize: 14 },
  ownerOnly: { margin: 16, padding: 12, backgroundColor: '#FEF3C7', borderRadius: 8 },
  ownerOnlyText: { color: WARN, textAlign: 'center', fontWeight: '600' },
  tabBar: { flexDirection: 'row', backgroundColor: SURFACE, borderBottomWidth: 1, borderBottomColor: BORDER },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: PRIMARY },
  tabText: { fontSize: 14, color: '#666' },
  tabTextActive: { color: PRIMARY, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 12, textAlign: 'right' },
  staffCard: { backgroundColor: SURFACE, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BORDER },
  staffCardHeader: { flexDirection: 'row', alignItems: 'center' },
  staffAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#DBEAFE', justifyContent: 'center', alignItems: 'center' },
  staffAvatarText: { fontSize: 20, fontWeight: '700', color: PRIMARY },
  staffName: { fontSize: 16, fontWeight: '700', color: '#111', textAlign: 'right' },
  staffPhone: { fontSize: 13, color: '#666', textAlign: 'right' },
  staffDate: { fontSize: 12, color: '#999', textAlign: 'right' },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  roleBadgeText: { fontSize: 12, fontWeight: '700' },
  permSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  permChip: { paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#F3F4F6', borderRadius: 6 },
  permChipText: { fontSize: 12, color: '#374151' },
  staffActions: { flexDirection: 'row', gap: 16, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: BORDER, justifyContent: 'flex-end' },
  staffActionBtn: { padding: 4 },
  staffActionText: { fontSize: 13 },
  activityList: { gap: 12 },
  activityItem: { flexDirection: 'row', gap: 10, paddingVertical: 6 },
  activityDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: PRIMARY, marginTop: 6 },
  activityAction: { fontSize: 14, color: '#111', textAlign: 'right' },
  activityMeta: { fontSize: 12, color: '#888', textAlign: 'right', marginTop: 2 },
  noActivity: { textAlign: 'center', color: '#999', marginTop: 24 },
  // Overlay
  overlayBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  overlayCard: { backgroundColor: SURFACE, borderRadius: 16, padding: 20, width: '100%', maxWidth: 360 },
  overlayTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12, textAlign: 'right', color: '#111' },
  fieldLabel: { fontSize: 13, color: '#555', marginBottom: 4, textAlign: 'right' },
  input: { borderWidth: 1, borderColor: BORDER, borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: SURFACE, marginBottom: 12 },
  rolePicker: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  rolePickerBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: BORDER, alignItems: 'center' },
  rolePickerBtnActive: { borderColor: PRIMARY, backgroundColor: '#DBEAFE' },
  rolePickerBtnText: { fontSize: 14, color: '#555' },
  rolePickerBtnTextActive: { color: PRIMARY, fontWeight: '700' },
  permRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: BORDER },
  permLabel: { fontSize: 14, color: '#333' },
  permLabelDisabled: { color: '#AAA' },
  overlayActions: { flexDirection: 'row', gap: 10, marginTop: 16, justifyContent: 'flex-end' },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: BORDER },
  cancelBtnText: { color: '#555', fontSize: 14 },
  saveBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, backgroundColor: PRIMARY, minWidth: 80, alignItems: 'center' },
  saveBtnText: { color: SURFACE, fontWeight: '700', fontSize: 14 },
});
