/**
 * SharePlaceSheet – bottom sheet for sharing a place.
 *
 * Features:
 *  - Place name + category header
 *  - Share to WhatsApp, Telegram, SMS, Copy Link
 *  - Branded share card preview with QR stub
 *  - "Include my review" checkbox
 *  - Share location (coordinates)
 *  - Share current map view (stub)
 *
 * Accessibility: RTL-aware, all interactive elements labelled.
 */

import { shareManager, ShareCard, type ShareCardData, type ShareCardLabels } from '@iraq-maps/mobile-kit';
import * as Clipboard from 'expo-clipboard';
import { type ReactElement, useState } from 'react';
import {
  Alert,
  I18nManager,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ─── Design tokens ────────────────────────────────────────────────────────────

const SHEET_BG = '#FFFFFF';
const HANDLE_COLOR = '#D1D5DB';
const BORDER = '#F3F4F6';
const ACTION_BG = '#F9FAFB';
const ACTION_ACTIVE = '#EEF2FF';
const ACTION_TEXT = '#111827';
const SUBTITLE = '#6B7280';
const CHECK_BORDER = '#D1D5DB';
const CHECK_FILLED = '#1A56DB';
const CHECK_FILL = '#EEF2FF';
const OVERLAY = 'rgba(0,0,0,0.45)';
const SECTION_LABEL = '#9CA3AF';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SharePlaceSheetProps {
  /** Whether the sheet is visible. */
  visible: boolean;
  /** Called when the sheet should close. */
  onClose: () => void;
  place: {
    id: string;
    nameAr: string;
    categoryAr?: string;
    /** Category icon emoji. */
    icon?: string;
    lat?: number;
    lng?: number;
    /** Formatted address for the share message. */
    addressAr?: string;
  };
  /** User's review of this place, if any (used when "include review" is checked). */
  userReview?: string;
  /** Current map view bounding box — used to build the map screenshot share (stub). */
  mapBounds?: { north: number; south: number; east: number; west: number };
  style?: ViewStyle;
  testID?: string;
}

// ─── Share action types ───────────────────────────────────────────────────────

interface ShareAction {
  id: string;
  label: string;
  icon: string;
  accessibilityLabel: string;
  onPress: () => void | Promise<void>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function openWhatsApp(text: string): void {
  const encoded = encodeURIComponent(text);
  const url = `whatsapp://send?text=${encoded}`;
  Linking.openURL(url).catch(() => {
    // WhatsApp not installed — fall back to native share sheet.
    void Share.share({ message: text });
  });
}

function openTelegram(text: string): void {
  const encoded = encodeURIComponent(text);
  const url = `tg://msg?text=${encoded}`;
  Linking.openURL(url).catch(() => {
    void Share.share({ message: text });
  });
}

function openSms(text: string): void {
  const separator = Platform.OS === 'ios' ? '&' : '?';
  const encoded = encodeURIComponent(text);
  const url = `sms:${separator}body=${encoded}`;
  Linking.openURL(url).catch(() => {
    void Share.share({ message: text });
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CheckRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}): ReactElement {
  return (
    <Pressable
      style={styles.checkRow}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        {checked && <Text style={styles.checkMark} allowFontScaling={false}>✓</Text>}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </Pressable>
  );
}

function SectionLabel({ text }: { text: string }): ReactElement {
  return <Text style={styles.sectionLabel}>{text}</Text>;
}

function ActionRow({ actions }: { actions: ShareAction[] }): ReactElement {
  return (
    <View style={styles.actionRow}>
      {actions.map((action) => (
        <Pressable
          key={action.id}
          style={({ pressed }) => [styles.actionItem, pressed && styles.actionItemPressed]}
          onPress={() => void action.onPress()}
          accessibilityRole="button"
          accessibilityLabel={action.accessibilityLabel}
        >
          <View style={styles.actionIconContainer}>
            <Text style={styles.actionIcon} allowFontScaling={false}>{action.icon}</Text>
          </View>
          <Text style={styles.actionLabel} numberOfLines={1}>{action.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SharePlaceSheet({
  visible,
  onClose,
  place,
  userReview,
  style,
  testID,
}: SharePlaceSheetProps): ReactElement {
  const [includeReview, setIncludeReview] = useState(false);
  const [includeLocation, setIncludeLocation] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [cardVisible, setCardVisible] = useState(false);

  // Build share payload every render so it reflects checkbox state.
  const payload = shareManager.sharePlace({
    id: place.id,
    nameAr: place.nameAr,
    categoryAr: place.categoryAr,
    lat: includeLocation ? place.lat : undefined,
    lng: includeLocation ? place.lng : undefined,
  });

  // Optionally append the user's review text.
  const fullMessage = includeReview && userReview
    ? `${payload.message}\n\n"${userReview}"`
    : payload.message;

  const cardData: ShareCardData = shareManager.sharePlaceCard({
    id: place.id,
    nameAr: place.nameAr,
    categoryAr: place.categoryAr,
    lat: includeLocation ? place.lat : undefined,
    lng: includeLocation ? place.lng : undefined,
  });

  if (place.icon) {
    cardData.icon = place.icon;
  }

  const cardLabels: ShareCardLabels = {
    brandName: t('sharing.brandName'),
    footerTagline: t('sharing.footerTagline'),
    exportA11y: t('sharing.exportA11y'),
    exportBtn: t('sharing.exportBtn'),
    typeLabels: {
      place: t('sharing.typePlace'),
      post: t('sharing.typePost'),
      route: t('sharing.typeRoute'),
      event: t('sharing.typeEvent'),
      profile: t('sharing.typeProfile'),
    },
  };

  const handleCopyLink = async () => {
    try {
      await Clipboard.setStringAsync(payload.url);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch {
      Alert.alert(t('sharing.sheetTitle'), t('sharing.linkCopyFailed'));
    }
  };

  const handleExportPng = (pngUri: string) => {
    // Stub: in production, save to camera roll with expo-media-library.
    void Promise.resolve(pngUri);
    Alert.alert(t('sharing.sheetTitle'), t('sharing.exportSuccess'));
  };

  const primaryActions: ShareAction[] = [
    {
      id: 'whatsapp',
      label: t('sharing.whatsapp'),
      icon: '💬',
      accessibilityLabel: t('sharing.whatsapp'),
      onPress: () => openWhatsApp(fullMessage),
    },
    {
      id: 'telegram',
      label: t('sharing.telegram'),
      icon: '✈️',
      accessibilityLabel: t('sharing.telegram'),
      onPress: () => openTelegram(fullMessage),
    },
    {
      id: 'sms',
      label: t('sharing.sms'),
      icon: '📱',
      accessibilityLabel: t('sharing.sms'),
      onPress: () => openSms(fullMessage),
    },
    {
      id: 'copy',
      label: copyFeedback ? t('sharing.copied') : t('sharing.copyLink'),
      icon: copyFeedback ? '✅' : '🔗',
      accessibilityLabel: t('sharing.copyLink'),
      onPress: handleCopyLink,
    },
  ];

  const moreActions: ShareAction[] = [
    {
      id: 'more',
      label: t('sharing.moreOptions'),
      icon: '⋯',
      accessibilityLabel: t('sharing.moreOptions'),
      onPress: () => void Share.share({ message: fullMessage, url: payload.url, title: payload.title }),
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      {/* Backdrop */}
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityLabel={t('sharing.cancel')}
        accessibilityRole="button"
      />

      <View
        testID={testID ?? 'share-place-sheet'}
        style={[styles.sheet, style]}
        accessible={false}
      >
        {/* Handle */}
        <View style={styles.handleContainer} accessibilityRole="none">
          <View style={styles.handle} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Place header */}
          <View style={styles.placeHeader} accessibilityRole="header">
            <View style={styles.placeIconContainer}>
              <Text style={styles.placeIcon} allowFontScaling={false}>
                {place.icon ?? '📍'}
              </Text>
            </View>
            <View style={styles.placeInfo}>
              <Text style={styles.placeName} numberOfLines={2}>
                {place.nameAr}
              </Text>
              {place.categoryAr != null && (
                <Text style={styles.placeCategory} numberOfLines={1}>
                  {place.categoryAr}
                </Text>
              )}
            </View>
            <Pressable
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('sharing.cancel')}
            >
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <Text style={styles.closeIcon} allowFontScaling={false}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.divider} />

          {/* Primary share actions */}
          <SectionLabel text={t('sharing.sheetSubtitle')} />
          <ActionRow actions={primaryActions} />

          <View style={styles.dividerLight} />

          {/* Share card preview toggle */}
          <SectionLabel text={t('sharing.previewTitle')} />
          <Pressable
            style={({ pressed }) => [styles.cardToggle, pressed && styles.cardTogglePressed]}
            onPress={() => setCardVisible((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={t('sharing.shareCard')}
            accessibilityState={{ expanded: cardVisible }}
          >
            {/* eslint-disable-next-line i18next/no-literal-string */}
            <Text style={styles.cardToggleIcon} allowFontScaling={false}>🖼️</Text>
            <Text style={styles.cardToggleLabel}>{t('sharing.shareCard')}</Text>
            {/* eslint-disable i18next/no-literal-string */}
            <Text style={styles.cardToggleChevron} allowFontScaling={false}>
              {cardVisible ? '▲' : '▼'}
            </Text>
            {/* eslint-enable i18next/no-literal-string */}
          </Pressable>

          {cardVisible && (
            <View style={styles.cardPreviewContainer}>
              <ShareCard
                data={cardData}
                labels={cardLabels}
                onExport={handleExportPng}
                style={styles.shareCard}
                testID="share-card-preview"
              />
            </View>
          )}

          <View style={styles.dividerLight} />

          {/* Options checkboxes */}
          {userReview != null && userReview.length > 0 && (
            <CheckRow
              label={t('sharing.includeReview')}
              checked={includeReview}
              onToggle={() => setIncludeReview((v) => !v)}
            />
          )}
          {place.lat != null && place.lng != null && (
            <CheckRow
              label={t('sharing.shareLocation')}
              checked={includeLocation}
              onToggle={() => setIncludeLocation((v) => !v)}
            />
          )}

          <View style={styles.dividerLight} />

          {/* More options */}
          <ActionRow actions={moreActions} />

          {/* Cancel */}
          <Pressable
            style={({ pressed }) => [styles.cancelButton, pressed && styles.cancelButtonPressed]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('sharing.cancel')}
          >
            <Text style={styles.cancelText}>{t('sharing.cancel')}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: OVERLAY,
  },
  sheet: {
    backgroundColor: SHEET_BG,
    borderTopStartRadius: 20,
    borderTopEndRadius: 20,
    maxHeight: '90%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 10,
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: HANDLE_COLOR,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  placeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  placeIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: ACTION_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeIcon: {
    fontSize: 22,
  },
  placeInfo: {
    flex: 1,
    gap: 3,
  },
  placeName: {
    fontSize: 17,
    fontWeight: '700',
    color: ACTION_TEXT,
    writingDirection: 'rtl',
  },
  placeCategory: {
    fontSize: 13,
    color: SUBTITLE,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ACTION_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    fontSize: 14,
    color: SUBTITLE,
  },
  divider: {
    height: 1,
    backgroundColor: BORDER,
    marginHorizontal: 0,
  },
  dividerLight: {
    height: 8,
    backgroundColor: '#F9FAFB',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: SECTION_LABEL,
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    textTransform: 'uppercase',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
  },
  actionItem: {
    alignItems: 'center',
    minWidth: 72,
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: ACTION_BG,
    gap: 6,
  },
  actionItemPressed: {
    backgroundColor: ACTION_ACTIVE,
  },
  actionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  actionIcon: {
    fontSize: 20,
  },
  actionLabel: {
    fontSize: 11,
    color: ACTION_TEXT,
    fontWeight: '500',
    textAlign: 'center',
  },
  cardToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: ACTION_BG,
    gap: 10,
  },
  cardTogglePressed: {
    backgroundColor: ACTION_ACTIVE,
  },
  cardToggleIcon: {
    fontSize: 18,
  },
  cardToggleLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: ACTION_TEXT,
  },
  cardToggleChevron: {
    fontSize: 11,
    color: SUBTITLE,
  },
  cardPreviewContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  shareCard: {
    // Constrain width for preview.
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: CHECK_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxChecked: {
    backgroundColor: CHECK_FILL,
    borderColor: CHECK_FILLED,
  },
  checkMark: {
    fontSize: 12,
    color: CHECK_FILLED,
    fontWeight: '700',
    lineHeight: 14,
  },
  checkLabel: {
    fontSize: 14,
    color: ACTION_TEXT,
    flex: 1,
  },
  cancelButton: {
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: ACTION_BG,
    alignItems: 'center',
  },
  cancelButtonPressed: {
    backgroundColor: '#E5E7EB',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: ACTION_TEXT,
  },
});
