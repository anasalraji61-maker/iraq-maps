/**
 * ProviderSettingsScreen — provider account settings.
 *
 * Sections:
 *   • Account settings
 *   • Notification preferences
 *   • Staff access management (link)
 *   • Connected integrations (WhatsApp/Telegram — stub)
 *   • Data export
 *   • Close business (deactivate listing)
 *
 * All text via t(). RTL-safe (start/end, never left/right).
 */

import {
  type ReactElement,
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  Alert,
  I18nManager,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ─── Palette ──────────────────────────────────────────────────────────────────

const C = {
  primary:      '#1976D2',
  primaryLight: '#E3F2FD',
  success:      '#10B981',
  successBg:    '#ECFDF5',
  warning:      '#F59E0B',
  warningBg:    '#FFFBEB',
  danger:       '#EF4444',
  dangerBg:     '#FEF2F2',
  purple:       '#7C3AED',
  purpleBg:     '#F5F3FF',
  bg:           '#F5F7FA',
  card:         '#FFFFFF',
  text:         '#1A202C',
  textMuted:    '#718096',
  border:       '#E2E8F0',
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface NotificationPrefs {
  newMessage:        boolean;
  newReview:         boolean;
  appointmentUpdate: boolean;
  verificationUpdate:boolean;
  marketingTips:     boolean;
  weeklyReport:      boolean;
  nearbyAlerts:      boolean;
}

interface Integration {
  id: string;
  name: string;
  icon: string;
  connected: boolean;
  connectedSince?: string;
  stubNote?: string;
}

interface AccountInfo {
  businessName: string;
  ownerPhone:   string;
  email?:       string;
  language:     'ar' | 'ckb' | 'en';
  timezone:     string;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

function defaultNotifPrefs(): NotificationPrefs {
  return {
    newMessage: true,
    newReview: true,
    appointmentUpdate: true,
    verificationUpdate: true,
    marketingTips: false,
    weeklyReport: true,
    nearbyAlerts: false,
  };
}

function mockIntegrations(): Integration[] {
  return [
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      icon: '💬',
      connected: false,
      stubNote: t('providerSettings.integrationStub'),
    },
    {
      id: 'telegram',
      name: 'Telegram',
      icon: '✈️',
      connected: false,
      stubNote: t('providerSettings.integrationStub'),
    },
    {
      id: 'google_business',
      name: 'Google Business',
      icon: '🔵',
      connected: false,
      stubNote: t('providerSettings.integrationStub'),
    },
  ];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }): ReactElement {
  return <Text style={ss.sectionHeader}>{title}</Text>;
}

function SettingRow({
  icon,
  label,
  sub,
  onPress,
  rightElement,
  danger,
}: {
  icon: string;
  label: string;
  sub?: string;
  onPress?: () => void;
  rightElement?: ReactElement;
  danger?: boolean;
}): ReactElement {
  return (
    <TouchableOpacity
      style={ss.settingRow}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
    >
      <View style={[ss.settingIconWrap, { backgroundColor: danger ? C.dangerBg : C.primaryLight }]}>
        <Text style={ss.settingIcon}>{icon}</Text>
      </View>
      <View style={ss.settingBody}>
        <Text style={[ss.settingLabel, danger && { color: C.danger }]}>{label}</Text>
        {sub ? <Text style={ss.settingSub}>{sub}</Text> : null}
      </View>
      {rightElement ?? (onPress ? <Text style={ss.settingChevron}>›</Text> : null)}
    </TouchableOpacity>
  );
}

function Divider(): ReactElement {
  return <View style={ss.divider} />;
}

// ─── Notification prefs section ───────────────────────────────────────────────

function NotificationsSection({
  prefs,
  onChange,
}: {
  prefs: NotificationPrefs;
  onChange: (key: keyof NotificationPrefs, value: boolean) => void;
}): ReactElement {
  const items: Array<{ key: keyof NotificationPrefs; icon: string; labelKey: string; subKey: string }> = [
    { key: 'newMessage',        icon: '💬', labelKey: 'notifications.newInquiry',         subKey: 'notifications.newInquiryDesc' },
    { key: 'newReview',         icon: '⭐', labelKey: 'providerSettings.notifNewReview',   subKey: 'providerSettings.notifNewReviewSub' },
    { key: 'appointmentUpdate', icon: '📅', labelKey: 'providerSettings.notifAppt',        subKey: 'providerSettings.notifApptSub' },
    { key: 'verificationUpdate',icon: '✅', labelKey: 'notifications.verificationUpdate',  subKey: 'notifications.verificationUpdateDesc' },
    { key: 'marketingTips',     icon: '💡', labelKey: 'notifications.marketingTips',       subKey: 'notifications.marketingTipsDesc' },
    { key: 'weeklyReport',      icon: '📊', labelKey: 'providerSettings.notifWeekly',      subKey: 'providerSettings.notifWeeklySub' },
    { key: 'nearbyAlerts',      icon: '📍', labelKey: 'providerSettings.notifNearby',      subKey: 'providerSettings.notifNearbySub' },
  ];

  return (
    <View style={ss.card}>
      {items.map((item, idx) => (
        <View key={item.key}>
          <View style={ss.settingRow}>
            <View style={[ss.settingIconWrap, { backgroundColor: C.primaryLight }]}>
              <Text style={ss.settingIcon}>{item.icon}</Text>
            </View>
            <View style={ss.settingBody}>
              <Text style={ss.settingLabel}>{t(item.labelKey as Parameters<typeof t>[0])}</Text>
              <Text style={ss.settingSub}>{t(item.subKey as Parameters<typeof t>[0])}</Text>
            </View>
            <Switch
              value={prefs[item.key]}
              onValueChange={v => onChange(item.key, v)}
              trackColor={{ false: C.border, true: C.primary + '80' }}
              thumbColor={prefs[item.key] ? C.primary : '#FFF'}
            />
          </View>
          {idx < items.length - 1 && <Divider />}
        </View>
      ))}
    </View>
  );
}

// ─── Integrations section ─────────────────────────────────────────────────────

function IntegrationsSection({ integrations }: { integrations: Integration[] }): ReactElement {
  return (
    <View style={ss.card}>
      {integrations.map((integ, idx) => (
        <View key={integ.id}>
          <View style={ss.settingRow}>
            <View style={[ss.settingIconWrap, { backgroundColor: integ.connected ? C.successBg : C.bg }]}>
              <Text style={ss.settingIcon}>{integ.icon}</Text>
            </View>
            <View style={ss.settingBody}>
              <Text style={ss.settingLabel}>{integ.name}</Text>
              {integ.stubNote && (
                <Text style={[ss.settingSub, { color: C.warning }]}>{integ.stubNote}</Text>
              )}
              {integ.connected && integ.connectedSince && (
                <Text style={[ss.settingSub, { color: C.success }]}>
                  {t('providerSettings.connectedSince', { date: integ.connectedSince })}
                </Text>
              )}
            </View>
            <View style={[ss.integStatus, { backgroundColor: integ.connected ? C.successBg : C.bg }]}>
              <Text style={[ss.integStatusText, { color: integ.connected ? C.success : C.textMuted }]}>
                {integ.connected ? t('providerSettings.connected') : t('providerSettings.notConnected')}
              </Text>
            </View>
          </View>
          {idx < integrations.length - 1 && <Divider />}
        </View>
      ))}
    </View>
  );
}

// ─── Deactivate modal ─────────────────────────────────────────────────────────

function DeactivateModal({
  visible,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  onConfirm: () => void;
  onClose: () => void;
}): ReactElement {
  const [step, setStep] = useState<1 | 2>(1);

  const handleClose = () => {
    setStep(1);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
    >
      <View style={ss.modalOverlay}>
        <View style={ss.deactivateModal}>
          {step === 1 ? (
            <>
              <Text style={ss.deactivateIcon}>⚠️</Text>
              <Text style={ss.deactivateTitle}>{t('providerSettings.deactivateTitle')}</Text>
              <Text style={ss.deactivateBody}>{t('providerSettings.deactivateBody')}</Text>
              <View style={ss.deactivateConsequences}>
                {[
                  t('providerSettings.deactivateConseq1'),
                  t('providerSettings.deactivateConseq2'),
                  t('providerSettings.deactivateConseq3'),
                ].map((c, i) => (
                  <View key={i} style={ss.conseqRow}>
                    <Text style={ss.conseqDot}>•</Text>
                    <Text style={ss.conseqText}>{c}</Text>
                  </View>
                ))}
              </View>
              <View style={ss.deactivateActions}>
                <TouchableOpacity style={ss.cancelBtn} onPress={handleClose}>
                  <Text style={ss.cancelBtnText}>{t('providerSettings.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={ss.continueBtn} onPress={() => setStep(2)}>
                  <Text style={ss.continueBtnText}>{t('providerSettings.deactivateContinue')}</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={ss.deactivateIcon}>🔴</Text>
              <Text style={ss.deactivateTitle}>{t('providerSettings.deactivateConfirmTitle')}</Text>
              <Text style={ss.deactivateBody}>{t('providerSettings.deactivateConfirmBody')}</Text>
              <View style={ss.deactivateActions}>
                <TouchableOpacity style={ss.cancelBtn} onPress={handleClose}>
                  <Text style={ss.cancelBtnText}>{t('providerSettings.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[ss.continueBtn, { backgroundColor: C.danger }]}
                  onPress={() => { handleClose(); onConfirm(); }}
                >
                  <Text style={ss.continueBtnText}>{t('providerSettings.deactivateConfirmBtn')}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export interface ProviderSettingsScreenProps {
  onNavigate?: (screen: string, params?: Record<string, unknown>) => void;
}

export function ProviderSettingsScreen({
  onNavigate,
}: ProviderSettingsScreenProps): ReactElement {
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(defaultNotifPrefs());
  const [integrations, setIntegrations] = useState<Integration[]>(mockIntegrations());
  const [deactivateVisible, setDeactivateVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleNotifChange = useCallback((key: keyof NotificationPrefs, value: boolean) => {
    setNotifPrefs(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleExportData = useCallback(() => {
    Alert.alert(t('providerSettings.exportTitle'), t('providerSettings.exportBody'), [
      { text: t('providerSettings.cancel'), style: 'cancel' },
      {
        text: t('providerSettings.exportConfirm'),
        onPress: () => Alert.alert(t('providerSettings.exportSuccess')),
      },
    ]);
  }, []);

  const handleDeactivate = useCallback(() => {
    Alert.alert(t('providerSettings.deactivatedSuccess'));
  }, []);

  const handleSaveNotifications = useCallback(async () => {
    setSaving(true);
    try {
      await new Promise<void>(r => setTimeout(r, 600));
      Alert.alert(t('providerSettings.notifSaved'));
    } finally {
      setSaving(false);
    }
  }, []);

  const accountInfo: AccountInfo = {
    businessName: 'نشاطي التجاري',
    ownerPhone:   '07xx xxx xxxx',
    language:     'ar',
    timezone:     'Asia/Baghdad (UTC+3)',
  };

  return (
    <SafeAreaView style={ss.safeArea}>
      <View style={ss.titleBar}>
        <Text style={ss.screenTitle}>{t('providerSettings.title')}</Text>
      </View>

      <ScrollView
        contentContainerStyle={ss.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Account */}
        <SectionHeader title={t('providerSettings.sectionAccount')} />
        <View style={ss.card}>
          <SettingRow
            icon="🏢"
            label={t('providerSettings.businessName')}
            sub={accountInfo.businessName}
            onPress={() => onNavigate?.('EditProfile')}
          />
          <Divider />
          <SettingRow
            icon="📱"
            label={t('providerSettings.phone')}
            sub={accountInfo.ownerPhone}
            onPress={() => onNavigate?.('PhoneVerification')}
          />
          <Divider />
          <SettingRow
            icon="🌐"
            label={t('providerSettings.language')}
            sub={accountInfo.language === 'ar' ? 'العربية' : accountInfo.language}
            onPress={() => Alert.alert(t('providerSettings.languageComingSoon'))}
          />
          <Divider />
          <SettingRow
            icon="🕐"
            label={t('providerSettings.timezone')}
            sub={accountInfo.timezone}
          />
          <Divider />
          <SettingRow
            icon="🔐"
            label={t('providerSettings.security')}
            sub={t('providerSettings.securitySub')}
            onPress={() => Alert.alert(t('providerSettings.securityComingSoon'))}
          />
        </View>

        {/* Notifications */}
        <SectionHeader title={t('providerSettings.sectionNotifications')} />
        <NotificationsSection prefs={notifPrefs} onChange={handleNotifChange} />
        <TouchableOpacity
          style={[ss.saveNotifBtn, saving && { opacity: 0.6 }]}
          onPress={() => void handleSaveNotifications()}
          disabled={saving}
          activeOpacity={0.8}
        >
          <Text style={ss.saveNotifBtnText}>
            {saving ? '…' : t('providerSettings.saveNotifications')}
          </Text>
        </TouchableOpacity>

        {/* Staff */}
        <SectionHeader title={t('providerSettings.sectionStaff')} />
        <View style={ss.card}>
          <SettingRow
            icon="👥"
            label={t('providerSettings.manageStaff')}
            sub={t('providerSettings.manageStaffSub')}
            onPress={() => onNavigate?.('Staff')}
          />
        </View>

        {/* Integrations */}
        <SectionHeader title={t('providerSettings.sectionIntegrations')} />
        <IntegrationsSection integrations={integrations} />

        {/* Consent */}
        <SectionHeader title={t('providerSettings.sectionConsent')} />
        <View style={ss.card}>
          <SettingRow
            icon="✅"
            label={t('providerSettings.manageConsents')}
            sub={t('providerSettings.manageConsentsSub')}
            onPress={() => onNavigate?.('Consents')}
          />
        </View>

        {/* Data export */}
        <SectionHeader title={t('providerSettings.sectionData')} />
        <View style={ss.card}>
          <SettingRow
            icon="📥"
            label={t('providerSettings.exportData')}
            sub={t('providerSettings.exportDataSub')}
            onPress={handleExportData}
          />
          <Divider />
          <SettingRow
            icon="🗑"
            label={t('providerSettings.deleteData')}
            sub={t('providerSettings.deleteDataSub')}
            onPress={() => Alert.alert(t('providerSettings.deleteDataComingSoon'))}
            danger
          />
        </View>

        {/* Deactivate */}
        <SectionHeader title={t('providerSettings.sectionDanger')} />
        <View style={ss.card}>
          <SettingRow
            icon="🔴"
            label={t('providerSettings.closeBusiness')}
            sub={t('providerSettings.closeBusinessSub')}
            onPress={() => setDeactivateVisible(true)}
            danger
          />
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      <DeactivateModal
        visible={deactivateVisible}
        onConfirm={handleDeactivate}
        onClose={() => setDeactivateVisible(false)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  safeArea:           { flex: 1, backgroundColor: C.bg },
  scroll:             { paddingHorizontal: 16 },
  titleBar:           { paddingHorizontal: 16, paddingVertical: 14, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  screenTitle:        { fontSize: 20, fontWeight: '700', color: C.text },

  sectionHeader:      { fontSize: 13, fontWeight: '700', color: C.textMuted, paddingTop: 20, paddingBottom: 8, paddingHorizontal: 4, textTransform: 'uppercase', letterSpacing: 0.5 },

  card:               { backgroundColor: C.card, borderRadius: 12, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, elevation: 2 },
  divider:            { height: 1, backgroundColor: C.border, marginStart: 56 },

  // Setting row
  settingRow:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  settingIconWrap:    { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginEnd: 12 },
  settingIcon:        { fontSize: 16 },
  settingBody:        { flex: 1 },
  settingLabel:       { fontSize: 15, color: C.text, fontWeight: '500' },
  settingSub:         { fontSize: 12, color: C.textMuted, marginTop: 2 },
  settingChevron:     { fontSize: 20, color: C.textMuted },

  // Save notifications btn
  saveNotifBtn:       { backgroundColor: C.primary, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 10 },
  saveNotifBtnText:   { fontSize: 15, color: '#FFF', fontWeight: '700' },

  // Integrations
  integStatus:        { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  integStatusText:    { fontSize: 12, fontWeight: '600' },

  // Deactivate modal
  modalOverlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  deactivateModal:    { backgroundColor: C.card, borderRadius: 16, padding: 24, width: '100%', maxWidth: 380 },
  deactivateIcon:     { fontSize: 36, textAlign: 'center', marginBottom: 12 },
  deactivateTitle:    { fontSize: 18, fontWeight: '700', color: C.text, textAlign: 'center', marginBottom: 10 },
  deactivateBody:     { fontSize: 14, color: C.textMuted, textAlign: 'center', marginBottom: 16, lineHeight: 20 },
  deactivateConsequences: { backgroundColor: C.dangerBg, borderRadius: 10, padding: 12, marginBottom: 20, gap: 8 },
  conseqRow:          { flexDirection: 'row', gap: 6 },
  conseqDot:          { fontSize: 14, color: C.danger },
  conseqText:         { fontSize: 13, color: C.danger, flex: 1 },
  deactivateActions:  { flexDirection: 'row', gap: 10 },
  cancelBtn:          { flex: 1, backgroundColor: C.bg, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  cancelBtnText:      { fontSize: 14, color: C.textMuted, fontWeight: '600' },
  continueBtn:        { flex: 1, backgroundColor: C.warning, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  continueBtnText:    { fontSize: 14, color: '#FFF', fontWeight: '700' },
});
