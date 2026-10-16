/**
 * ShareCard – visual share card component.
 *
 * Renders a branded card preview that users see before sharing.
 * The card shows a header, content area, QR code (stub), and footer.
 * It can be exported as a PNG via the onExport callback.
 *
 * All UI strings are passed in via the `labels` prop so this component
 * can be used from any i18n namespace without hardcoding Arabic text here.
 *
 * The QR code is a stub: in production wire in `react-native-qrcode-svg`.
 * The PNG export is also a stub; production uses react-native-view-shot.
 */

import { type ReactElement } from 'react';
import {
  I18nManager,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import type { ShareCardData } from './ShareManager';

I18nManager.forceRTL(true);

// ─── Design tokens ────────────────────────────────────────────────────────────

const CARD_BG = '#FFFFFF';
const CARD_BORDER = '#E8E8EE';
const BRAND_COLOR = '#1A56DB';
const BRAND_DARK = '#1240AA';
const TEXT_PRIMARY = '#111827';
const TEXT_SECONDARY = '#6B7280';
const TEXT_LIGHT = '#9CA3AF';
const FOOTER_BG = '#F3F4F6';
const BADGE_BG = '#EEF2FF';
const BADGE_TEXT = '#3730A3';

// ─── Labels ───────────────────────────────────────────────────────────────────

export interface ShareCardLabels {
  /** Brand name shown in the card header (e.g. "خرائط العراق"). */
  brandName: string;
  /** "Shared via …" tagline shown in the footer. */
  footerTagline: string;
  /** Accessibility label for the export button. */
  exportA11y: string;
  /** Export button text (e.g. "تصدير كـ PNG"). */
  exportBtn: string;
  /** Label map for each card type (place, post, route, event, profile). */
  typeLabels: Record<ShareCardData['type'], string>;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CardHeader({ icon, type, labels }: { icon?: string; type: ShareCardData['type']; labels: ShareCardLabels }): ReactElement {
  return (
    <View style={styles.header} accessibilityRole="header">
      <View style={styles.logoContainer}>
        <View style={styles.logoBadge}>
          <Text style={styles.logoText} allowFontScaling={false}>IM</Text>
        </View>
        <Text style={styles.brandName} allowFontScaling={false}>{labels.brandName}</Text>
      </View>
      <View style={styles.typeBadge} accessibilityRole="none">
        {icon != null && <Text style={styles.typeBadgeIcon} allowFontScaling={false}>{icon}</Text>}
        <Text style={styles.typeBadgeText} allowFontScaling={false}>
          {labels.typeLabels[type]}
        </Text>
      </View>
    </View>
  );
}

interface ContentAreaProps {
  title: string;
  subtitle?: string;
  body?: string;
}

function ContentArea({ title, subtitle, body }: ContentAreaProps): ReactElement {
  return (
    <View style={styles.content}>
      <Text
        style={styles.contentTitle}
        numberOfLines={2}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {subtitle != null && (
        <Text style={styles.contentSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      )}
      {body != null && (
        <Text style={styles.contentBody} numberOfLines={3}>
          {body}
        </Text>
      )}
    </View>
  );
}

function QrCodeStub({ url }: { url: string }): ReactElement {
  return (
    <View
      style={styles.qrContainer}
      accessibilityLabel={url}
      accessibilityRole="image"
    >
      <View style={styles.qrPlaceholder}>
        <Text style={styles.qrPlaceholderText} allowFontScaling={false}>QR</Text>
      </View>
    </View>
  );
}

function CardFooter({ url, tagline }: { url: string; tagline: string }): ReactElement {
  const displayUrl = url.replace(/^https?:\/\//, '').slice(0, 40);
  return (
    <View style={styles.footer}>
      <Text style={styles.footerTagline} allowFontScaling={false}>{tagline}</Text>
      <Text style={styles.footerUrl} numberOfLines={1} allowFontScaling={false}>
        {displayUrl}
      </Text>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface ShareCardProps {
  data: ShareCardData;
  /** Localised UI labels. All visible strings come from here; no Arabic is hardcoded. */
  labels: ShareCardLabels;
  /** Called when the user taps the export button. Receives a stub URI in this build. */
  onExport?: (pngUri: string) => void;
  style?: ViewStyle;
  testID?: string;
}

/**
 * ShareCard renders a full branded share card.
 *
 * Wrap in a View captured by react-native-view-shot to export as PNG.
 */
export function ShareCard({ data, labels, onExport, style, testID }: ShareCardProps): ReactElement {
  const handleExport = () => {
    const stubUri = `data:image/png;base64,STUB_${data.type}_${Date.now()}`;
    onExport?.(stubUri);
  };

  return (
    <View
      testID={testID ?? 'share-card'}
      style={[styles.card, style]}
      accessible
      accessibilityLabel={data.title}
    >
      <CardHeader icon={data.icon} type={data.type} labels={labels} />

      <View style={styles.divider} />

      <View style={styles.mainRow}>
        <ContentArea
          title={data.title}
          subtitle={data.subtitle}
          body={data.body}
        />
        <QrCodeStub url={data.url} />
      </View>

      <View style={styles.divider} />

      <CardFooter url={data.url} tagline={labels.footerTagline} />

      {onExport != null && (
        <Pressable
          style={({ pressed }) => [styles.exportButton, pressed && styles.exportButtonPressed]}
          onPress={handleExport}
          accessibilityRole="button"
          accessibilityLabel={labels.exportA11y}
        >
          <Text style={styles.exportButtonText} allowFontScaling={false}>
            {labels.exportBtn}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: BRAND_COLOR,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoBadge: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: BRAND_DARK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  brandName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: BADGE_BG,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  typeBadgeIcon: {
    fontSize: 12,
  },
  typeBadgeText: {
    color: BADGE_TEXT,
    fontSize: 11,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: CARD_BORDER,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  content: {
    flex: 1,
    gap: 4,
  },
  contentTitle: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
  contentSubtitle: {
    color: BRAND_COLOR,
    fontSize: 13,
    fontWeight: '500',
  },
  contentBody: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 4,
    writingDirection: 'rtl',
  },
  qrContainer: {
    alignItems: 'center',
  },
  qrPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: FOOTER_BG,
  },
  qrPlaceholderText: {
    color: TEXT_LIGHT,
    fontSize: 12,
    fontWeight: '600',
  },
  footer: {
    backgroundColor: FOOTER_BG,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 2,
  },
  footerTagline: {
    color: TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: '600',
  },
  footerUrl: {
    color: TEXT_LIGHT,
    fontSize: 10,
  },
  exportButton: {
    margin: 16,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: BRAND_COLOR,
    alignItems: 'center',
  },
  exportButtonPressed: {
    opacity: 0.75,
  },
  exportButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
