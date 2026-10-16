/**
 * SafetyScreen – Safety Center for Iraq Smart Maps.
 *
 * Tabs:
 *  1. Alerts      – nearby safety incidents on a mini-map + list
 *  2. Contacts    – trusted contacts list + add/remove
 *  3. Share       – live location sharing controls
 *  4. Emergency   – Iraq emergency numbers + SOS button + safety tips
 *
 * All text uses t(). Layouts use start/end (RTL-safe). Location data is
 * treated as sensitive: never logged, stored only in the DB via the API.
 * Trusted contacts feature requires explicit consent before any share starts.
 */
/* eslint-disable i18next/no-literal-string, no-restricted-syntax */
import type {
  LngLat,
  SafetyIncident,
  SafetyIncidentSeverity,
  SafetyIncidentType,
  SafetyLocationShare,
  TrustedContact,
} from '@iraq-maps/contracts';
import { IRAQ_EMERGENCY_NUMBERS } from '@iraq-maps/contracts';
import { useApi } from '@iraq-maps/mobile-kit';
import { tokens } from '@iraq-maps/ui';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { t } from '../strings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = 'alerts' | 'contacts' | 'share' | 'emergency';

interface SafetyScreenProps {
  initialLocation?: LngLat | null;
  onClose?: () => void;
  onReportIncident?: () => void;
}

// ---------------------------------------------------------------------------
// Severity colours
// ---------------------------------------------------------------------------

const SEVERITY_COLOR: Record<SafetyIncidentSeverity, string> = {
  low: '#10B981',
  medium: '#F59E0B',
  high: '#F97316',
  critical: '#EF4444',
};

const SEVERITY_LABEL_KEY: Record<SafetyIncidentSeverity, Parameters<typeof t>[0]> = {
  low:      'safety.severityLow',
  medium:   'safety.severityMedium',
  high:     'safety.severityHigh',
  critical: 'safety.severityCritical',
};

const TYPE_EMOJI: Partial<Record<SafetyIncidentType, string>> = {
  unsafe_area:       '⚠️',
  checkpoint:        '🚧',
  flooding:          '🌊',
  fire:              '🔥',
  explosion:         '💥',
  armed_conflict:    '🔫',
  civil_unrest:      '🪧',
  kidnapping_risk:   '🚨',
  theft:             '🔓',
  road_danger:       '🛑',
  medical_emergency: '🏥',
  natural_disaster:  '🌪️',
  curfew:            '🌙',
  other:             '❓',
};

const TYPE_LABEL_KEY: Record<SafetyIncidentType, Parameters<typeof t>[0]> = {
  unsafe_area:       'safety.typeUnsafeArea',
  checkpoint:        'safety.typeCheckpoint',
  flooding:          'safety.typeFlooding',
  fire:              'safety.typeFire',
  explosion:         'safety.typeExplosion',
  armed_conflict:    'safety.typeArmedConflict',
  civil_unrest:      'safety.typeCivilUnrest',
  kidnapping_risk:   'safety.typeKidnappingRisk',
  theft:             'safety.typeTheft',
  road_danger:       'safety.typeRoadDanger',
  medical_emergency: 'safety.typeMedicalEmergency',
  natural_disaster:  'safety.typeNaturalDisaster',
  curfew:            'safety.typeCurfew',
  other:             'safety.typeOther',
};

// ---------------------------------------------------------------------------
// Duration options for location share
// ---------------------------------------------------------------------------

const SHARE_DURATIONS: Array<{ minutes: number; labelKey: Parameters<typeof t>[0] }> = [
  { minutes: 15,  labelKey: 'safety.shareDuration15' },
  { minutes: 30,  labelKey: 'safety.shareDuration30' },
  { minutes: 60,  labelKey: 'safety.shareDuration60' },
  { minutes: 120, labelKey: 'safety.shareDuration120' },
];

// ---------------------------------------------------------------------------
// Root screen
// ---------------------------------------------------------------------------

export function SafetyScreen({
  initialLocation,
  onClose,
  onReportIncident,
}: SafetyScreenProps): ReactElement {
  const [activeTab, setActiveTab] = useState<Tab>('alerts');

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('safety.screenTitle')}</Text>
        {onClose ? (
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('safety.close')}
            style={styles.closeBtn}
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(['alerts', 'contacts', 'share', 'emergency'] as Tab[]).map((tab) => {
          const labelKey = `safety.tab${tab.charAt(0).toUpperCase()}${tab.slice(1)}` as Parameters<typeof t>[0];
          return (
            <Pressable
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === tab }}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {t(labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Content */}
      {activeTab === 'alerts'    && <AlertsTab location={initialLocation} onReport={onReportIncident} />}
      {activeTab === 'contacts'  && <ContactsTab />}
      {activeTab === 'share'     && <ShareTab />}
      {activeTab === 'emergency' && <EmergencyTab />}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Alerts tab
// ---------------------------------------------------------------------------

function AlertsTab({
  location,
  onReport,
}: {
  location?: LngLat | null;
  onReport?: () => void;
}): ReactElement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = useApi() as any;
  const [alerts, setAlerts] = useState<SafetyIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const centre = location ?? ([44.361, 33.325] as LngLat); // Baghdad

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.safety.getAlerts({
        query: {
          lat: centre[1],
          lng: centre[0],
          radiusKm: 20,
        },
      });
      if (res.status === 200) {
        setAlerts(res.body.items);
      } else {
        setError(t('safety.errorAlerts'));
      }
    } catch {
      setError(t('safety.errorAlerts'));
    } finally {
      setLoading(false);
    }
  }, [api, centre]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <View style={styles.centerFlex}>
        <ActivityIndicator size="large" color={tokens.color.primary} />
        <Text style={styles.loadingText}>{t('safety.loadingAlerts')}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerFlex}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable onPress={() => { void load(); }} style={styles.retryBtn}>
          <Text style={styles.retryBtnText}>{t('safety.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.flex1}>
      {/* Report button */}
      {onReport ? (
        <View style={styles.reportBtnRow}>
          <Pressable
            style={styles.reportBtn}
            onPress={onReport}
            accessibilityRole="button"
            accessibilityLabel={t('safety.reportBtn')}
          >
            <Text style={styles.reportBtnText}>⚠️  {t('safety.reportBtn')}</Text>
          </Pressable>
        </View>
      ) : null}

      {alerts.length === 0 ? (
        <View style={styles.centerFlex}>
          <Text style={styles.emptyEmoji}>🛡️</Text>
          <Text style={styles.emptyText}>{t('safety.noAlerts')}</Text>
        </View>
      ) : (
        <FlatList
          data={alerts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <Text style={styles.sectionLabel}>{t('safety.alertsTitle')}</Text>
          }
          renderItem={({ item }) => <SafetyAlertCard incident={item} />}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Safety alert card
// ---------------------------------------------------------------------------

function SafetyAlertCard({ incident }: { incident: SafetyIncident }): ReactElement {
  const color = SEVERITY_COLOR[incident.severity] ?? '#6B7280';
  const emoji = TYPE_EMOJI[incident.type] ?? '⚠️';
  const labelKey = TYPE_LABEL_KEY[incident.type] ?? 'safety.typeOther';
  const severityKey = SEVERITY_LABEL_KEY[incident.severity] ?? 'safety.severityMedium';

  const expiresAt = new Date(incident.expiresAt);
  const remainingH = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 3_600_000));

  return (
    <View style={[styles.alertCard, { borderStartColor: color }]}>
      <View style={styles.alertCardTop}>
        <View style={[styles.alertIconBg, { backgroundColor: `${color}20` }]}>
          <Text style={styles.alertEmoji}>{emoji}</Text>
        </View>
        <View style={styles.alertCardBody}>
          <View style={styles.alertCardHeader}>
            <Text style={styles.alertType}>{t(labelKey)}</Text>
            <View style={[styles.severityBadge, { backgroundColor: `${color}20` }]}>
              <Text style={[styles.severityBadgeText, { color }]}>{t(severityKey)}</Text>
            </View>
          </View>
          {incident.description ? (
            <Text style={styles.alertDesc} numberOfLines={3}>{incident.description}</Text>
          ) : null}
          <View style={styles.alertMeta}>
            <Text style={styles.alertMetaText}>
              {t('safety.activeUntil', { time: `${remainingH}h` })}
            </Text>
            {incident.confirmedCount > 0 ? (
              <Text style={styles.alertMetaText}>
                {t('safety.confirmedBy', { n: incident.confirmedCount })}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Contacts tab
// ---------------------------------------------------------------------------

function ContactsTab(): ReactElement {
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
        setError(t('safety.errorMsg'));
      }
    } catch {
      setError(t('safety.errorMsg'));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const handleRemove = useCallback((contact: TrustedContact) => {
    const name = contact.displayName ?? contact.contactUserId;
    Alert.alert(
      t('safety.removeContact'),
      t('safety.removeContactConfirm', { name }),
      [
        { text: t('safety.emergencyCancel'), style: 'cancel' },
        {
          text: t('safety.removeContact'),
          style: 'destructive',
          onPress: async () => {
            try {
              await api.safety.removeTrustedContact({ params: { contactId: contact.id } });
              setContacts((prev) => prev.filter((c) => c.id !== contact.id));
            } catch {
              Alert.alert(t('safety.errorTitle'), t('safety.errorMsg'));
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
          <Text style={styles.retryBtnText}>{t('safety.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.flex1}>
      <FlatList
        data={contacts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.contactsHeader}>
            <Text style={styles.sectionLabel}>{t('safety.contactsTitle')}</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContacts}>
            <Text style={styles.emptyEmoji}>👥</Text>
            <Text style={styles.emptyText}>{t('safety.contactsEmpty')}</Text>
            <Text style={styles.emptySubText}>{t('safety.contactsEmptySub')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <ContactCard contact={item} onRemove={() => handleRemove(item)} />
        )}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Contact card
// ---------------------------------------------------------------------------

function ContactCard({
  contact,
  onRemove,
}: {
  contact: TrustedContact;
  onRemove: () => void;
}): ReactElement {
  const initials = (contact.displayName ?? '?').slice(0, 2).toUpperCase();

  return (
    <View style={styles.contactCard}>
      <View style={styles.contactAvatar}>
        <Text style={styles.contactInitials}>{initials}</Text>
      </View>
      <View style={styles.contactBody}>
        <Text style={styles.contactName}>{contact.displayName ?? contact.contactUserId}</Text>
        <View style={[
          styles.contactStatusBadge,
          contact.accepted ? styles.acceptedBadge : styles.pendingBadge,
        ]}>
          <Text style={[
            styles.contactStatusText,
            contact.accepted ? styles.acceptedText : styles.pendingText,
          ]}>
            {contact.accepted ? t('safety.contactAccepted') : t('safety.contactPending')}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={onRemove}
        style={styles.removeBtn}
        accessibilityRole="button"
        accessibilityLabel={t('safety.removeContact')}
      >
        <Text style={styles.removeBtnText}>{t('safety.removeContact')}</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Share tab
// ---------------------------------------------------------------------------

function ShareTab(): ReactElement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = useApi() as any;
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [activeShares, setActiveShares] = useState<SafetyLocationShare[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [selectedDuration, setSelectedDuration] = useState(30);
  const [consentGiven, setConsentGiven] = useState(false);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [contactsRes, sharesRes] = await Promise.all([
        api.safety.getTrustedContacts({}),
        api.safety.getActiveShares({}),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (contactsRes.status === 200) setContacts((contactsRes.body as any[]).filter((c: any) => c.accepted));
      if (sharesRes.status === 200) setActiveShares(sharesRes.body);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void loadData(); }, [loadData]);

  const toggleContact = useCallback((id: string) => {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }, []);

  const handleStart = useCallback(async () => {
    if (!consentGiven || selectedContactIds.size === 0) return;
    setStarting(true);
    try {
      const res = await api.safety.startLocationShare({
        body: {
          viewerIds: [...selectedContactIds] as import('@iraq-maps/contracts').UserId[],
          durationMinutes: selectedDuration,
          emergencyTriggered: false,
        },
      });
      if (res.status === 201) {
        setActiveShares((prev) => [res.body, ...prev]);
        setSelectedContactIds(new Set());
        setConsentGiven(false);
      } else {
        Alert.alert(t('safety.errorTitle'), t('safety.errorMsg'));
      }
    } catch {
      Alert.alert(t('safety.errorTitle'), t('safety.errorMsg'));
    } finally {
      setStarting(false);
    }
  }, [api, consentGiven, selectedContactIds, selectedDuration]);

  const handleStop = useCallback(async (shareId: string) => {
    setStopping(shareId);
    try {
      await api.safety.stopLocationShare({ params: { shareId: shareId as import('@iraq-maps/contracts').SafetyShareId } });
      setActiveShares((prev) => prev.filter((s) => s.shareId !== shareId));
    } catch {
      Alert.alert(t('safety.errorTitle'), t('safety.errorMsg'));
    } finally {
      setStopping(null);
    }
  }, [api]);

  if (loading) {
    return (
      <View style={styles.centerFlex}>
        <ActivityIndicator size="large" color={tokens.color.primary} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.shareScroll}>
      <Text style={styles.sectionLabel}>{t('safety.shareTitle')}</Text>

      {/* Active shares */}
      {activeShares.length > 0 ? (
        <View style={styles.activeSharesSection}>
          {activeShares.map((share) => {
            const expiresAt = new Date(share.expiresAt);
            const remainingMin = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60_000));
            const isStopping = stopping === share.shareId;
            return (
              <View key={share.shareId} style={styles.activeShareCard}>
                <View style={styles.activeShareDot} />
                <View style={styles.activeShareBody}>
                  <Text style={styles.activeShareTitle}>{t('safety.shareActive')}</Text>
                  <Text style={styles.activeShareExpiry}>
                    {t('safety.shareExpires', { time: `${remainingMin} دقيقة` })}
                  </Text>
                </View>
                <Pressable
                  onPress={() => { void handleStop(share.shareId); }}
                  style={styles.stopShareBtn}
                  disabled={isStopping}
                  accessibilityRole="button"
                  accessibilityLabel={t('safety.shareStop')}
                >
                  {isStopping ? (
                    <ActivityIndicator size="small" color="#EF4444" />
                  ) : (
                    <Text style={styles.stopShareBtnText}>{t('safety.shareStop')}</Text>
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Contact selector */}
      {contacts.length === 0 ? (
        <View style={styles.noContactsNote}>
          <Text style={styles.noContactsText}>{t('safety.shareNoContacts')}</Text>
        </View>
      ) : (
        <>
          <Text style={styles.shareSubLabel}>{t('safety.shareWithLabel')}</Text>
          <View style={styles.contactChips}>
            {contacts.map((c) => {
              const selected = selectedContactIds.has(c.contactUserId);
              const name = c.displayName ?? c.contactUserId.slice(0, 8);
              return (
                <Pressable
                  key={c.id}
                  style={[styles.contactChip, selected && styles.contactChipSelected]}
                  onPress={() => toggleContact(c.contactUserId)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                >
                  <Text style={[styles.contactChipText, selected && styles.contactChipTextSelected]}>
                    {name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Duration selector */}
          <Text style={styles.shareSubLabel}>{t('safety.shareDuration')}</Text>
          <View style={styles.durationRow}>
            {SHARE_DURATIONS.map(({ minutes, labelKey }) => (
              <Pressable
                key={minutes}
                style={[styles.durationBtn, selectedDuration === minutes && styles.durationBtnSelected]}
                onPress={() => setSelectedDuration(minutes)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selectedDuration === minutes }}
              >
                <Text style={[styles.durationBtnText, selectedDuration === minutes && styles.durationBtnTextSelected]}>
                  {t(labelKey)}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Consent toggle */}
          <View style={styles.consentRow}>
            <Text style={styles.consentText}>{t('safety.shareConsentNote')}</Text>
            <Switch
              value={consentGiven}
              onValueChange={setConsentGiven}
              accessibilityLabel={t('safety.shareConsentNote')}
              trackColor={{ true: tokens.color.primary }}
            />
          </View>

          {/* Start button */}
          <Pressable
            style={[
              styles.startShareBtn,
              (!consentGiven || selectedContactIds.size === 0) && styles.startShareBtnDisabled,
            ]}
            onPress={() => { void handleStart(); }}
            disabled={!consentGiven || selectedContactIds.size === 0 || starting}
            accessibilityRole="button"
            accessibilityLabel={t('safety.shareStartBtn')}
          >
            {starting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.startShareBtnText}>{t('safety.shareStartBtn')}</Text>
            )}
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Emergency tab
// ---------------------------------------------------------------------------

function EmergencyTab(): ReactElement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = useApi() as any;
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [sendingAlert, setSendingAlert] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.safety.getTrustedContacts({}).then((res: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (res.status === 200) setContacts(res.body.filter((c: any) => c.accepted));
    }).catch(() => undefined);
  }, [api]);

  const handleSOS = useCallback(() => {
    if (contacts.length === 0) {
      Alert.alert(t('safety.errorTitle'), t('safety.emergencyNoContacts'));
      return;
    }
    Alert.alert(
      t('safety.emergencySosTitle'),
      t('safety.emergencyConfirm'),
      [
        { text: t('safety.emergencyCancel'), style: 'cancel' },
        {
          text: t('safety.emergencyConfirmBtn'),
          style: 'destructive',
          onPress: async () => {
            setSendingAlert(true);
            try {
              const res = await api.safety.sendEmergencyAlert({
                body: {
                  type: 'sos',
                  startLocationShare: true,
                },
              });
              if (res.status === 201) {
                Alert.alert(t('safety.emergencySosSent'), t('safety.emergencySosSentBody'));
              } else {
                Alert.alert(t('safety.errorTitle'), t('safety.errorMsg'));
              }
            } catch {
              Alert.alert(t('safety.errorTitle'), t('safety.errorMsg'));
            } finally {
              setSendingAlert(false);
            }
          },
        },
      ],
    );
  }, [api, contacts.length]);

  return (
    <ScrollView contentContainerStyle={styles.emergencyScroll}>
      {/* SOS button */}
      <View style={styles.sosSection}>
        <Text style={styles.sosSectionTitle}>{t('safety.emergencySosTitle')}</Text>
        <Text style={styles.sosSectionBody}>{t('safety.emergencySosBody')}</Text>
        <Pressable
          style={[styles.sosBtn, sendingAlert && styles.sosBtnDisabled]}
          onPress={handleSOS}
          disabled={sendingAlert}
          accessibilityRole="button"
          accessibilityLabel={t('safety.emergencySosBtn')}
        >
          {sendingAlert ? (
            <ActivityIndicator color="#FFF" size="large" />
          ) : (
            <>
              <Text style={styles.sosBtnEmoji}>🆘</Text>
              <Text style={styles.sosBtnText}>{t('safety.emergencySosBtn')}</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Iraq emergency numbers */}
      <Text style={styles.sectionLabel}>{t('safety.emergencyTitle')}</Text>
      <View style={styles.numbersGrid}>
        {IRAQ_EMERGENCY_NUMBERS.map((num) => (
          <Pressable
            key={num.service}
            style={styles.numberCard}
            onPress={() => { void Linking.openURL(`tel:${num.number}`); }}
            accessibilityRole="button"
            accessibilityLabel={`${num.description} ${num.number}`}
          >
            <Text style={styles.numberService}>{num.description}</Text>
            <Text style={styles.numberDigits}>{num.number}</Text>
            <View style={styles.callBadge}>
              <Text style={styles.callBadgeText}>📞 {t('safety.emergencyCall')}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      {/* Safety tips */}
      <Text style={styles.sectionLabel}>{t('safety.safetyTipsTitle')}</Text>
      <View style={styles.tipsSection}>
        {([
          { titleKey: 'safety.tip1Title', bodyKey: 'safety.tip1Body', emoji: '📱' },
          { titleKey: 'safety.tip2Title', bodyKey: 'safety.tip2Body', emoji: '📰' },
          { titleKey: 'safety.tip3Title', bodyKey: 'safety.tip3Body', emoji: '🔋' },
          { titleKey: 'safety.tip4Title', bodyKey: 'safety.tip4Body', emoji: '📋' },
        ] as Array<{ titleKey: Parameters<typeof t>[0]; bodyKey: Parameters<typeof t>[0]; emoji: string }>).map(({ titleKey, bodyKey, emoji }) => (
          <View key={titleKey} style={styles.tipCard}>
            <Text style={styles.tipEmoji}>{emoji}</Text>
            <View style={styles.tipBody}>
              <Text style={styles.tipTitle}>{t(titleKey)}</Text>
              <Text style={styles.tipText}>{t(bodyKey)}</Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
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
  flex1: {
    flex: 1,
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: tokens.color.text,
  },
  closeBtn: {
    padding: tokens.space.s,
  },
  closeBtnText: {
    fontSize: 18,
    color: tokens.color.textMuted,
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
    fontSize: 12,
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
    padding: tokens.space.l,
  },
  loadingText: {
    fontSize: 14,
    color: tokens.color.textMuted,
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
  emptyEmoji: {
    fontSize: 48,
  },
  emptyText: {
    fontSize: 15,
    color: tokens.color.textMuted,
    textAlign: 'center',
  },
  emptySubText: {
    fontSize: 13,
    color: tokens.color.textMuted,
    textAlign: 'center',
    marginTop: tokens.space.xs,
    maxWidth: 260,
  },
  listContent: {
    padding: tokens.space.m,
    gap: tokens.space.s,
    paddingBottom: tokens.space.xl,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: tokens.color.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: tokens.space.s,
    marginTop: tokens.space.l,
  },
  // ── Report button ──────────────────────────────────────────────────────────
  reportBtnRow: {
    padding: tokens.space.m,
    paddingBottom: 0,
  },
  reportBtn: {
    backgroundColor: '#F97316',
    borderRadius: tokens.radius.m,
    paddingVertical: tokens.space.m,
    alignItems: 'center',
  },
  reportBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  // ── Alert card ─────────────────────────────────────────────────────────────
  alertCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.m,
    padding: tokens.space.m,
    borderStartWidth: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  alertCardTop: {
    flexDirection: 'row',
    gap: tokens.space.m,
    alignItems: 'flex-start',
  },
  alertIconBg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertEmoji: {
    fontSize: 22,
  },
  alertCardBody: {
    flex: 1,
    gap: tokens.space.xs,
  },
  alertCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.space.s,
  },
  alertType: {
    fontSize: 15,
    fontWeight: '700',
    color: tokens.color.text,
    flex: 1,
  },
  severityBadge: {
    paddingHorizontal: tokens.space.s,
    paddingVertical: 2,
    borderRadius: tokens.radius.s,
  },
  severityBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  alertDesc: {
    fontSize: 13,
    color: tokens.color.textMuted,
    lineHeight: 18,
  },
  alertMeta: {
    flexDirection: 'row',
    gap: tokens.space.m,
    marginTop: tokens.space.xs,
  },
  alertMetaText: {
    fontSize: 11,
    color: tokens.color.textMuted,
  },
  // ── Contacts ───────────────────────────────────────────────────────────────
  contactsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  emptyContacts: {
    alignItems: 'center',
    padding: tokens.space.xl,
    gap: tokens.space.m,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.m,
    padding: tokens.space.m,
    gap: tokens.space.m,
    marginBottom: tokens.space.s,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  contactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${tokens.color.primary}20`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactInitials: {
    fontSize: 15,
    fontWeight: '700',
    color: tokens.color.primary,
  },
  contactBody: {
    flex: 1,
    gap: tokens.space.xs,
  },
  contactName: {
    fontSize: 15,
    fontWeight: '600',
    color: tokens.color.text,
  },
  contactStatusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: tokens.space.s,
    paddingVertical: 2,
    borderRadius: tokens.radius.s,
  },
  acceptedBadge: {
    backgroundColor: '#10B98120',
  },
  pendingBadge: {
    backgroundColor: '#F59E0B20',
  },
  contactStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  acceptedText: {
    color: '#10B981',
  },
  pendingText: {
    color: '#F59E0B',
  },
  removeBtn: {
    paddingHorizontal: tokens.space.m,
    paddingVertical: tokens.space.s,
  },
  removeBtnText: {
    fontSize: 13,
    color: '#EF4444',
    fontWeight: '600',
  },
  // ── Share tab ──────────────────────────────────────────────────────────────
  shareScroll: {
    padding: tokens.space.m,
    paddingBottom: tokens.space.xl,
  },
  activeSharesSection: {
    gap: tokens.space.s,
    marginBottom: tokens.space.m,
  },
  activeShareCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B98110',
    borderRadius: tokens.radius.m,
    padding: tokens.space.m,
    borderWidth: 1,
    borderColor: '#10B981',
    gap: tokens.space.m,
  },
  activeShareDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
  },
  activeShareBody: {
    flex: 1,
  },
  activeShareTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#10B981',
  },
  activeShareExpiry: {
    fontSize: 12,
    color: tokens.color.textMuted,
  },
  stopShareBtn: {
    paddingHorizontal: tokens.space.m,
    paddingVertical: tokens.space.s,
  },
  stopShareBtnText: {
    fontSize: 13,
    color: '#EF4444',
    fontWeight: '600',
  },
  noContactsNote: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.m,
    padding: tokens.space.l,
    alignItems: 'center',
    marginTop: tokens.space.m,
  },
  noContactsText: {
    fontSize: 14,
    color: tokens.color.textMuted,
    textAlign: 'center',
  },
  shareSubLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: tokens.color.textMuted,
    marginTop: tokens.space.m,
    marginBottom: tokens.space.s,
  },
  contactChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.space.s,
  },
  contactChip: {
    paddingHorizontal: tokens.space.m,
    paddingVertical: tokens.space.s,
    borderRadius: tokens.radius.l,
    borderWidth: 1.5,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  contactChipSelected: {
    borderColor: tokens.color.primary,
    backgroundColor: `${tokens.color.primary}15`,
  },
  contactChipText: {
    fontSize: 13,
    color: tokens.color.textMuted,
    fontWeight: '500',
  },
  contactChipTextSelected: {
    color: tokens.color.primary,
    fontWeight: '700',
  },
  durationRow: {
    flexDirection: 'row',
    gap: tokens.space.s,
    flexWrap: 'wrap',
  },
  durationBtn: {
    paddingHorizontal: tokens.space.m,
    paddingVertical: tokens.space.s,
    borderRadius: tokens.radius.m,
    borderWidth: 1.5,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  durationBtnSelected: {
    borderColor: tokens.color.primary,
    backgroundColor: `${tokens.color.primary}15`,
  },
  durationBtnText: {
    fontSize: 13,
    color: tokens.color.textMuted,
    fontWeight: '500',
  },
  durationBtnTextSelected: {
    color: tokens.color.primary,
    fontWeight: '700',
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.m,
    padding: tokens.space.m,
    marginTop: tokens.space.m,
    gap: tokens.space.m,
  },
  consentText: {
    flex: 1,
    fontSize: 13,
    color: tokens.color.textMuted,
    lineHeight: 18,
  },
  startShareBtn: {
    backgroundColor: tokens.color.primary,
    borderRadius: tokens.radius.m,
    paddingVertical: tokens.space.m,
    alignItems: 'center',
    marginTop: tokens.space.l,
  },
  startShareBtnDisabled: {
    backgroundColor: tokens.color.textMuted,
  },
  startShareBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  // ── Emergency tab ──────────────────────────────────────────────────────────
  emergencyScroll: {
    padding: tokens.space.m,
    paddingBottom: tokens.space.xl,
  },
  sosSection: {
    backgroundColor: '#FEF2F2',
    borderRadius: tokens.radius.l,
    padding: tokens.space.l,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: tokens.space.m,
    marginBottom: tokens.space.l,
  },
  sosSectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#EF4444',
    textAlign: 'center',
  },
  sosSectionBody: {
    fontSize: 13,
    color: '#B91C1C',
    textAlign: 'center',
    lineHeight: 18,
  },
  sosBtn: {
    backgroundColor: '#EF4444',
    borderRadius: tokens.radius.l,
    paddingHorizontal: tokens.space.xl,
    paddingVertical: tokens.space.l,
    alignItems: 'center',
    gap: tokens.space.s,
    minWidth: 200,
    elevation: 4,
    shadowColor: '#EF4444',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  sosBtnDisabled: {
    backgroundColor: '#F87171',
    elevation: 0,
  },
  sosBtnEmoji: {
    fontSize: 32,
  },
  sosBtnText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
  },
  numbersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.space.s,
  },
  numberCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.m,
    padding: tokens.space.m,
    alignItems: 'center',
    gap: tokens.space.xs,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.color.border,
  },
  numberService: {
    fontSize: 12,
    color: tokens.color.textMuted,
    textAlign: 'center',
    fontWeight: '500',
  },
  numberDigits: {
    fontSize: 28,
    fontWeight: '800',
    color: tokens.color.primary,
  },
  callBadge: {
    backgroundColor: `${tokens.color.primary}15`,
    paddingHorizontal: tokens.space.s,
    paddingVertical: 2,
    borderRadius: tokens.radius.s,
  },
  callBadgeText: {
    fontSize: 11,
    color: tokens.color.primary,
    fontWeight: '600',
  },
  tipsSection: {
    gap: tokens.space.s,
  },
  tipCard: {
    flexDirection: 'row',
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.m,
    padding: tokens.space.m,
    gap: tokens.space.m,
    alignItems: 'flex-start',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  tipEmoji: {
    fontSize: 22,
    marginTop: 2,
  },
  tipBody: {
    flex: 1,
    gap: tokens.space.xs,
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: tokens.color.text,
  },
  tipText: {
    fontSize: 13,
    color: tokens.color.textMuted,
    lineHeight: 18,
  },
});
