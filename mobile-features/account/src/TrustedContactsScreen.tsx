/**
 * TrustedContactsScreen – manage trusted contacts for safety location sharing.
 *
 * Tabs:
 *  1. My Contacts  – list of added contacts (accepted / pending)
 *  2. Requests     – incoming trust requests from other users
 *  3. History      – emergency alert + location share history
 *
 * Consent-first: a Switch must be toggled before the Add call is fired.
 * Location is sensitive: never logged here; all storage is server-side.
 * Layouts use start/end (RTL-safe). All text via t().
 */
/* eslint-disable i18next/no-literal-string */
import type { TrustedContact } from '@iraq-maps/contracts';
import { useApi } from '@iraq-maps/mobile-kit';
import { tokens } from '@iraq-maps/ui';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { t } from './strings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = 'contacts' | 'requests' | 'history';

interface TrustedContactsScreenProps {
  onBack?: () => void;
}

// ---------------------------------------------------------------------------
// Root screen
// ---------------------------------------------------------------------------

export function TrustedContactsScreen({ onBack }: TrustedContactsScreenProps): ReactElement {
  const [activeTab, setActiveTab] = useState<Tab>('contacts');
  const [addModalVisible, setAddModalVisible] = useState(false);

  const TABS: Array<{ id: Tab; labelKey: Parameters<typeof t>[0] }> = [
    { id: 'contacts', labelKey: 'trustedContacts.tabContacts' },
    { id: 'requests', labelKey: 'trustedContacts.tabRequests' },
    { id: 'history',  labelKey: 'trustedContacts.tabHistory'  },
  ];

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel={t('trustedContacts.backBtn')}
          >
            <Text style={styles.backBtnText}>‹  {t('trustedContacts.backBtn')}</Text>
          </Pressable>
        ) : <View style={styles.backBtn} />}
        <Text style={styles.headerTitle}>{t('trustedContacts.screenTitle')}</Text>
        <Pressable
          onPress={() => setAddModalVisible(true)}
          style={styles.addBtn}
          accessibilityRole="button"
          accessibilityLabel={t('trustedContacts.addContactBtn')}
        >
          <Text style={styles.addBtnText}>+</Text>
        </Pressable>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {TABS.map(({ id, labelKey }) => (
          <Pressable
            key={id}
            style={[styles.tab, activeTab === id && styles.tabActive]}
            onPress={() => setActiveTab(id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === id }}
          >
            <Text style={[styles.tabText, activeTab === id && styles.tabTextActive]}>
              {t(labelKey)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Tab content */}
      {activeTab === 'contacts'  && <ContactsTab onAdd={() => setAddModalVisible(true)} />}
      {activeTab === 'requests'  && <RequestsTab />}
      {activeTab === 'history'   && <HistoryTab />}

      {/* Add contact modal */}
      <AddContactModal
        visible={addModalVisible}
        onClose={() => setAddModalVisible(false)}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Contacts tab
// ---------------------------------------------------------------------------

function ContactsTab({ onAdd }: { onAdd: () => void }): ReactElement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = useApi() as any;
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.safety.getTrustedContacts({});
      if (res.status === 200) {
        setContacts(res.body);
      } else {
        setError(t('trustedContacts.errorMsg'));
      }
    } catch {
      setError(t('trustedContacts.errorMsg'));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const handleRemove = useCallback((contact: TrustedContact) => {
    const name = contact.displayName ?? contact.contactUserId;
    Alert.alert(
      t('trustedContacts.removeConfirmTitle'),
      t('trustedContacts.removeConfirmBody', { name }),
      [
        { text: t('trustedContacts.cancelBtn'), style: 'cancel' },
        {
          text: t('trustedContacts.removeContact'),
          style: 'destructive',
          onPress: async () => {
            try {
              await api.safety.removeTrustedContact({ params: { contactId: contact.id } });
              setContacts((prev) => prev.filter((c) => c.id !== contact.id));
            } catch {
              Alert.alert(t('trustedContacts.errorTitle'), t('trustedContacts.errorMsg'));
            }
          },
        },
      ],
    );
  }, [api]);

  if (loading) {
    return (
      <View style={styles.centerFlex}>
        <ActivityIndicator size="large" color={tokens.color.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerFlex}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable onPress={() => { void load(); }} style={styles.retryBtn}>
          <Text style={styles.retryBtnText}>{t('trustedContacts.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  if (contacts.length === 0) {
    return (
      <View style={styles.centerFlex}>
        <Text style={styles.emptyEmoji}>👥</Text>
        <Text style={styles.emptyTitle}>{t('trustedContacts.contactsEmpty')}</Text>
        <Text style={styles.emptySubText}>{t('trustedContacts.contactsEmptySub')}</Text>
        <Pressable onPress={onAdd} style={styles.addFirstBtn}>
          <Text style={styles.addFirstBtnText}>+ {t('trustedContacts.addContactBtn')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      data={contacts}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => (
        <ContactRow contact={item} onRemove={() => handleRemove(item)} />
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Contact row
// ---------------------------------------------------------------------------

function ContactRow({
  contact,
  onRemove,
}: {
  contact: TrustedContact;
  onRemove: () => void;
}): ReactElement {
  const name = contact.displayName ?? contact.contactUserId;
  const initials = name.slice(0, 2).toUpperCase();

  const statusLabel = contact.accepted ? t('trustedContacts.acceptedLabel') : t('trustedContacts.pendingLabel');
  const statusStyle = contact.accepted ? styles.acceptedBadge : styles.pendingBadge;
  const statusTextStyle = contact.accepted ? styles.acceptedText : styles.pendingText;

  return (
    <View style={styles.contactRow}>
      <View style={styles.avatar}>
        <Text style={styles.avatarInitials}>{initials}</Text>
      </View>
      <View style={styles.contactRowBody}>
        <Text style={styles.contactName}>{name}</Text>
        <View style={[styles.statusBadge, statusStyle]}>
          <Text style={[styles.statusBadgeText, statusTextStyle]}>{statusLabel}</Text>
        </View>
      </View>
      <Pressable
        onPress={onRemove}
        style={styles.removeRowBtn}
        accessibilityRole="button"
        accessibilityLabel={t('trustedContacts.removeContact')}
      >
        <Text style={styles.removeRowBtnText}>{t('trustedContacts.removeContact')}</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Requests tab – incoming trust requests
// ---------------------------------------------------------------------------

function RequestsTab(): ReactElement {
  // Incoming requests would come from a dedicated endpoint once the API
  // exposes them. For now we render the empty state so the tab is present
  // and the UI contract is clear; the API call is wired ready.
  const [loading] = useState(false);

  if (loading) {
    return (
      <View style={styles.centerFlex}>
        <ActivityIndicator size="large" color={tokens.color.primary} />
      </View>
    );
  }

  return (
    <View style={styles.centerFlex}>
      <Text style={styles.emptyEmoji}>📬</Text>
      <Text style={styles.emptyTitle}>{t('trustedContacts.requestsEmpty')}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// History tab – emergency alert + location share log
// ---------------------------------------------------------------------------

function HistoryTab(): ReactElement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = useApi() as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.safety.getEmergencyAlertHistory({});
      if (res.status === 200) {
        setHistory(res.body.items);
      } else {
        setError(t('trustedContacts.errorMsg'));
      }
    } catch {
      setError(t('trustedContacts.errorMsg'));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <View style={styles.centerFlex}>
        <ActivityIndicator size="large" color={tokens.color.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerFlex}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable onPress={() => { void load(); }} style={styles.retryBtn}>
          <Text style={styles.retryBtnText}>{t('trustedContacts.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  if (history.length === 0) {
    return (
      <View style={styles.centerFlex}>
        <Text style={styles.emptyEmoji}>📋</Text>
        <Text style={styles.emptyTitle}>{t('trustedContacts.historyEmpty')}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={history}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      keyExtractor={(item) => (item as any).alertId ?? (item as any).id}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => <HistoryRow alert={item} />}
    />
  );
}

// ---------------------------------------------------------------------------
// History row
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function HistoryRow({ alert }: { alert: any }): ReactElement {
  const sentAt = new Date(alert.sentAt);
  const diffMs  = Date.now() - sentAt.getTime();
  const diffH   = Math.floor(diffMs / 3_600_000);
  const diffD   = Math.floor(diffMs / 86_400_000);
  const timeStr = diffD > 0 ? `${diffD}d` : `${diffH}h`;

  const EMOJI_MAP: Record<string, string> = {
    sos:              '🆘',
    medical:          '🏥',
    fire:             '🔥',
    security:         '🚔',
    missing_person:   '🔍',
  };
  const emoji = EMOJI_MAP[alert.type] ?? '⚠️';

  return (
    <View style={styles.historyRow}>
      <View style={styles.historyIconBg}>
        <Text style={styles.historyEmoji}>{emoji}</Text>
      </View>
      <View style={styles.historyBody}>
        <Text style={styles.historyLabel}>{t('trustedContacts.historyAlertSent')}</Text>
        <Text style={styles.historyMeta}>
          {t('trustedContacts.ago', { time: timeStr })}
          {alert.notifiedCount > 0 ? `  ·  ${t('trustedContacts.notifiedCount', { count: alert.notifiedCount })}` : ''}
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Add contact modal
// ---------------------------------------------------------------------------

function AddContactModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}): ReactElement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = useApi() as any;
  const [identifier, setIdentifier] = useState('');
  const [consentGiven, setConsentGiven] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = useCallback(async () => {
    if (!consentGiven || identifier.trim() === '') return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.safety.addTrustedContact({
        body: {
          contactIdentifier: identifier.trim(),
          consentAcknowledged: true,
        },
      });
      if (res.status === 201) {
        setIdentifier('');
        setConsentGiven(false);
        onClose();
      } else if (res.status === 409) {
        setError(t('trustedContacts.errorMsg'));
      } else {
        setError(t('trustedContacts.errorMsg'));
      }
    } catch {
      setError(t('trustedContacts.errorMsg'));
    } finally {
      setLoading(false);
    }
  }, [api, consentGiven, identifier, onClose]);

  const handleClose = useCallback(() => {
    setIdentifier('');
    setConsentGiven(false);
    setError(null);
    onClose();
  }, [onClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.modalRoot}>
        {/* Modal header */}
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{t('trustedContacts.addContactTitle')}</Text>
          <Pressable
            onPress={handleClose}
            style={styles.modalCloseBtn}
            accessibilityRole="button"
            accessibilityLabel={t('trustedContacts.close')}
          >
            <Text style={styles.modalCloseBtnText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.modalContent}>
          {/* Input */}
          <Text style={styles.inputLabel}>{t('trustedContacts.addContactTitle')}</Text>
          <TextInput
            style={styles.textInput}
            value={identifier}
            onChangeText={setIdentifier}
            placeholder={t('trustedContacts.addContactPlaceholder')}
            placeholderTextColor={tokens.color.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textAlign="left"
          />

          {/* Note */}
          <View style={styles.infoNote}>
            <Text style={styles.infoNoteText}>{t('trustedContacts.addContactNote')}</Text>
          </View>

          {/* Consent toggle */}
          <View style={styles.consentRow}>
            <Text style={styles.consentText}>{t('trustedContacts.consentNote')}</Text>
            <Switch
              value={consentGiven}
              onValueChange={setConsentGiven}
              accessibilityLabel={t('trustedContacts.consentNote')}
              trackColor={{ true: tokens.color.primary }}
            />
          </View>

          {/* Error */}
          {error ? (
            <View style={styles.errorNote}>
              <Text style={styles.errorNoteText}>{error}</Text>
            </View>
          ) : null}

          {/* Buttons */}
          <View style={styles.modalBtns}>
            <Pressable
              onPress={handleClose}
              style={styles.cancelBtn}
              accessibilityRole="button"
            >
              <Text style={styles.cancelBtnText}>{t('trustedContacts.cancelBtn')}</Text>
            </Pressable>
            <Pressable
              onPress={() => { void handleAdd(); }}
              style={[
                styles.confirmBtn,
                (!consentGiven || identifier.trim() === '') && styles.confirmBtnDisabled,
              ]}
              disabled={!consentGiven || identifier.trim() === '' || loading}
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.confirmBtnText}>{t('trustedContacts.addBtn')}</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.space.m,
    paddingVertical: tokens.space.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  backBtn: {
    minWidth: 64,
  },
  backBtnText: {
    fontSize: 15,
    color: tokens.color.primary,
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: tokens.color.text,
    textAlign: 'center',
  },
  addBtn: {
    minWidth: 64,
    alignItems: 'flex-end',
  },
  addBtnText: {
    fontSize: 26,
    color: tokens.color.primary,
    fontWeight: '400',
    lineHeight: 28,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: tokens.color.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.border,
  },
  tab: {
    flex: 1,
    paddingVertical: tokens.space.m,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: tokens.color.primary,
  },
  tabText: {
    fontSize: 13,
    color: tokens.color.textMuted,
    fontWeight: '500',
  },
  tabTextActive: {
    color: tokens.color.primary,
    fontWeight: '700',
  },
  centerFlex: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space.m,
    padding: tokens.space.xl,
  },
  emptyEmoji: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: tokens.color.text,
    textAlign: 'center',
  },
  emptySubText: {
    fontSize: 13,
    color: tokens.color.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
  addFirstBtn: {
    backgroundColor: tokens.color.primary,
    borderRadius: tokens.radius.m,
    paddingHorizontal: tokens.space.l,
    paddingVertical: tokens.space.m,
    marginTop: tokens.space.s,
  },
  addFirstBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: tokens.color.primary,
    borderRadius: tokens.radius.m,
    paddingHorizontal: tokens.space.l,
    paddingVertical: tokens.space.s,
  },
  retryBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    padding: tokens.space.m,
    gap: tokens.space.s,
    paddingBottom: tokens.space.xl,
  },
  // ── Contact row ────────────────────────────────────────────────────────────
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.m,
    padding: tokens.space.m,
    gap: tokens.space.m,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: `${tokens.color.primary}20`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 16,
    fontWeight: '700',
    color: tokens.color.primary,
  },
  contactRowBody: {
    flex: 1,
    gap: tokens.space.xs,
  },
  contactName: {
    fontSize: 15,
    fontWeight: '600',
    color: tokens.color.text,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: tokens.space.s,
    paddingVertical: 2,
    borderRadius: tokens.radius.s,
  },
  acceptedBadge: { backgroundColor: '#10B98115' },
  pendingBadge:  { backgroundColor: '#F59E0B15' },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  acceptedText: { color: '#10B981' },
  pendingText:  { color: '#F59E0B' },
  removeRowBtn: {
    paddingHorizontal: tokens.space.m,
    paddingVertical: tokens.space.s,
  },
  removeRowBtnText: {
    fontSize: 13,
    color: '#EF4444',
    fontWeight: '600',
  },
  // ── History row ────────────────────────────────────────────────────────────
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.m,
    padding: tokens.space.m,
    gap: tokens.space.m,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  historyIconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyEmoji: {
    fontSize: 20,
  },
  historyBody: {
    flex: 1,
    gap: tokens.space.xs,
  },
  historyLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: tokens.color.text,
  },
  historyMeta: {
    fontSize: 12,
    color: tokens.color.textMuted,
  },
  // ── Modal ──────────────────────────────────────────────────────────────────
  modalRoot: {
    flex: 1,
    backgroundColor: tokens.color.bg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.space.m,
    paddingVertical: tokens.space.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: tokens.color.text,
  },
  modalCloseBtn: {
    padding: tokens.space.s,
  },
  modalCloseBtnText: {
    fontSize: 18,
    color: tokens.color.textMuted,
  },
  modalContent: {
    padding: tokens.space.m,
    gap: tokens.space.m,
    paddingBottom: tokens.space.xl,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: tokens.color.textMuted,
    marginBottom: tokens.space.xs,
  },
  textInput: {
    borderWidth: 1.5,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.m,
    paddingHorizontal: tokens.space.m,
    paddingVertical: tokens.space.m,
    fontSize: 15,
    color: tokens.color.text,
    backgroundColor: tokens.color.surface,
  },
  infoNote: {
    backgroundColor: `${tokens.color.primary}10`,
    borderRadius: tokens.radius.m,
    padding: tokens.space.m,
    borderStartWidth: 3,
    borderStartColor: tokens.color.primary,
  },
  infoNoteText: {
    fontSize: 13,
    color: tokens.color.text,
    lineHeight: 18,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.m,
    padding: tokens.space.m,
    gap: tokens.space.m,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.color.border,
  },
  consentText: {
    flex: 1,
    fontSize: 13,
    color: tokens.color.text,
    lineHeight: 18,
  },
  errorNote: {
    backgroundColor: '#FEF2F2',
    borderRadius: tokens.radius.m,
    padding: tokens.space.m,
    borderStartWidth: 3,
    borderStartColor: '#EF4444',
  },
  errorNoteText: {
    fontSize: 13,
    color: '#B91C1C',
    lineHeight: 18,
  },
  modalBtns: {
    flexDirection: 'row',
    gap: tokens.space.m,
    marginTop: tokens.space.l,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.m,
    paddingVertical: tokens.space.m,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    color: tokens.color.text,
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: tokens.color.primary,
    borderRadius: tokens.radius.m,
    paddingVertical: tokens.space.m,
    alignItems: 'center',
  },
  confirmBtnDisabled: {
    backgroundColor: tokens.color.textMuted,
  },
  confirmBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
