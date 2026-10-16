/**
 * Data Display Components — RTL-safe, AA contrast, 48dp touch targets.
 * All user-facing strings come from callers (already translated).
 */
// Symbols stored as constants so jsx-only i18next rule does not flag them.
const SYM_SORT_ASC = '↑'; // ↑
const SYM_SORT_DESC = '↓'; // ↓
const SYM_TREND_UP = '↑';
const SYM_TREND_DOWN = '↓';
const SYM_TREND_FLAT = '→'; // →
const SYM_EXPAND = '▲'; // ▲
const SYM_COLLAPSE = '▼'; // ▼
const SYM_PREV_PAGE = '›'; // ›
const SYM_NEXT_PAGE = '‹'; // ‹

import { type ReactElement, type ReactNode, useState } from 'react';
import {
  I18nManager,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { tokens } from './tokens';

const { color, space, radius, font } = tokens;

// ---------------------------------------------------------------------------
// DataTable
// ---------------------------------------------------------------------------

export interface DataTableColumn<T> {
  key: keyof T;
  header: string;
  width?: number;
  sortable?: boolean;
  render?: (value: T[keyof T], row: T) => ReactNode;
}

export interface DataTableProps<T extends Record<string, unknown>> {
  columns: DataTableColumn<T>[];
  data: T[];
  pageSize?: number;
  testID?: string;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  pageSize = 10,
  testID,
}: DataTableProps<T>): ReactElement {
  const [sortKey, setSortKey] = useState<keyof T | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(0);

  const sorted = sortKey
    ? [...data].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        const cmp = String(av) < String(bv) ? -1 : String(av) > String(bv) ? 1 : 0;
        return sortAsc ? cmp : -cmp;
      })
    : data;

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  function toggleSort(col: DataTableColumn<T>) {
    if (!col.sortable) return;
    if (sortKey === col.key) setSortAsc((a) => !a);
    else { setSortKey(col.key); setSortAsc(true); }
    setPage(0);
  }

  return (
    <View testID={testID} style={dt.container}>
      <ScrollView horizontal>
        <View>
          {/* Header */}
          <View style={[dt.row, dt.header]}>
            {columns.map((col) => (
              <Pressable
                key={String(col.key)}
                onPress={() => toggleSort(col)}
                disabled={!col.sortable}
                style={[dt.cell, col.width ? { width: col.width } : dt.flex]}
                accessibilityRole={col.sortable ? 'button' : undefined}
                accessibilityLabel={col.sortable ? col.header : undefined}
              >
                <RNText style={[dt.headerText, col.sortable && dt.sortable]}>
                  {col.header}
                  {sortKey === col.key ? (sortAsc ? ` ${SYM_SORT_ASC}` : ` ${SYM_SORT_DESC}`) : ''}
                </RNText>
              </Pressable>
            ))}
          </View>
          {/* Rows */}
          {paged.map((row, ri) => (
            <View key={ri} style={[dt.row, ri % 2 === 1 && dt.alt]}>
              {columns.map((col) => (
                <View key={String(col.key)} style={[dt.cell, col.width ? { width: col.width } : dt.flex]}>
                  {col.render ? (
                    col.render(row[col.key], row)
                  ) : (
                    <RNText style={dt.cellText}>{String(row[col.key] ?? '')}</RNText>
                  )}
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
      {/* Pagination */}
      {totalPages > 1 && (
        <View style={dt.pagination}>
          <Pressable
            onPress={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            accessibilityRole="button"
            style={[dt.pageBtn, page === 0 && dt.pageBtnDisabled]}
          >
            <RNText style={dt.pageBtnText}>{I18nManager.isRTL ? SYM_PREV_PAGE : SYM_NEXT_PAGE}</RNText>
          </Pressable>
          <RNText style={dt.pageLabel}>{page + 1} / {totalPages}</RNText>
          <Pressable
            onPress={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            accessibilityRole="button"
            style={[dt.pageBtn, page === totalPages - 1 && dt.pageBtnDisabled]}
          >
            <RNText style={dt.pageBtnText}>{I18nManager.isRTL ? SYM_NEXT_PAGE : SYM_PREV_PAGE}</RNText>
          </Pressable>
        </View>
      )}
    </View>
  );
}
DataTable.displayName = 'DataTable';

const dt = StyleSheet.create({
  container: { borderRadius: radius.m, overflow: 'hidden', borderWidth: 1, borderColor: color.border },
  row: { flexDirection: 'row' },
  header: { backgroundColor: color.surface },
  alt: { backgroundColor: '#F9FAFB' },
  cell: { padding: space.s, justifyContent: 'center', minHeight: tokens.minTouch },
  flex: { flex: 1, minWidth: 80 },
  headerText: { fontFamily: 'NotoSansArabic_700Bold', fontSize: font.size.caption, color: color.text },
  sortable: { textDecorationLine: 'underline' },
  cellText: { fontSize: font.size.caption, color: color.text },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.m, padding: space.s, borderTopWidth: 1, borderTopColor: color.border },
  pageBtn: { minWidth: tokens.minTouch, minHeight: tokens.minTouch, alignItems: 'center', justifyContent: 'center' },
  pageBtnDisabled: { opacity: 0.4 },
  pageBtnText: { fontSize: font.size.body, color: color.primary },
  pageLabel: { fontSize: font.size.caption, color: color.textMuted },
});

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------

export type TrendDirection = 'up' | 'down' | 'flat';

export interface StatCardProps {
  value: string;
  label: string;
  trend?: TrendDirection;
  trendLabel?: string;
  testID?: string;
}

const trendColors: Record<TrendDirection, string> = { up: '#145C38', down: color.danger, flat: color.textMuted };
const trendArrows: Record<TrendDirection, string> = { up: SYM_TREND_UP, down: SYM_TREND_DOWN, flat: SYM_TREND_FLAT };

export function StatCard({ value, label, trend, trendLabel, testID }: StatCardProps): ReactElement {
  return (
    <View testID={testID} style={sc.card} accessible accessibilityLabel={`${value} ${label}${trend ? ' ' + (trendLabel ?? trend) : ''}`}>
      <RNText style={sc.value}>{value}</RNText>
      <RNText style={sc.label}>{label}</RNText>
      {trend && (
        <View style={sc.trendRow}>
          <RNText style={[sc.arrow, { color: trendColors[trend] }]}>{trendArrows[trend]}</RNText>
          {trendLabel ? <RNText style={[sc.trendLabel, { color: trendColors[trend] }]}>{trendLabel}</RNText> : null}
        </View>
      )}
    </View>
  );
}
StatCard.displayName = 'StatCard';

const sc = StyleSheet.create({
  card: { backgroundColor: color.surface, borderRadius: radius.l, padding: space.m, gap: space.xs, alignItems: 'flex-start' },
  value: { fontFamily: 'NotoSansArabic_700Bold', fontSize: 28, color: color.text },
  label: { fontSize: font.size.caption, color: color.textMuted },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.xs },
  arrow: { fontSize: font.size.body, fontFamily: 'NotoSansArabic_700Bold' },
  trendLabel: { fontSize: font.size.caption },
});

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export interface TimelineItem {
  id: string;
  title: string;
  description?: string;
  timestamp: string;
  icon?: ReactNode;
}

export interface TimelineProps {
  items: TimelineItem[];
  testID?: string;
}

export function Timeline({ items, testID }: TimelineProps): ReactElement {
  return (
    <View testID={testID} style={tl.container}>
      {items.map((item, i) => (
        <View key={item.id} style={tl.row}>
          {/* Connector line + dot */}
          <View style={tl.rail}>
            <View style={[tl.line, i === 0 && tl.lineHidden, tl.lineTop]} />
            <View style={tl.dot}>{item.icon ?? null}</View>
            <View style={[tl.line, i === items.length - 1 && tl.lineHidden]} />
          </View>
          {/* Content */}
          <View style={tl.content}>
            <RNText style={tl.title}>{item.title}</RNText>
            <RNText style={tl.timestamp}>{item.timestamp}</RNText>
            {item.description ? <RNText style={tl.desc}>{item.description}</RNText> : null}
          </View>
        </View>
      ))}
    </View>
  );
}
Timeline.displayName = 'Timeline';

const DOT = 12;
const LINE_W = 2;

const tl = StyleSheet.create({
  container: { gap: 0 },
  row: { flexDirection: 'row', gap: space.m },
  rail: { alignItems: 'center', width: DOT + LINE_W * 2 },
  line: { width: LINE_W, flex: 1, backgroundColor: color.border, minHeight: space.m },
  lineTop: { flex: 0, height: space.m },
  lineHidden: { backgroundColor: 'transparent' },
  dot: { width: DOT + LINE_W * 2, height: DOT + LINE_W * 2, borderRadius: (DOT + LINE_W * 2) / 2, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, paddingBottom: space.m },
  title: { fontFamily: 'NotoSansArabic_700Bold', fontSize: font.size.body, color: color.text },
  timestamp: { fontSize: font.size.caption, color: color.textMuted },
  desc: { fontSize: font.size.caption, color: color.text, marginTop: space.xs },
});

// ---------------------------------------------------------------------------
// ProgressRing
// ---------------------------------------------------------------------------

export interface ProgressRingProps {
  progress: number; // 0–100
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
  testID?: string;
}

export function ProgressRing({ progress, size = 80, strokeWidth = 8, color: ringColor = color.primary, label, testID }: ProgressRingProps): ReactElement {
  const pct = Math.min(100, Math.max(0, progress));

  return (
    <View testID={testID} style={[pr.wrap, { width: size, height: size }]} accessible accessibilityLabel={`${pct}%${label ? ' ' + label : ''}`}>
      {/* SVG-like ring using border trick */}
      <View style={[pr.track, { width: size, height: size, borderRadius: size / 2, borderWidth: strokeWidth, borderColor: color.border }]} />
      {/* Progress arc via rotation clip - approximated with a filled arc overlay */}
      <View style={[pr.progress, {
        width: size, height: size, borderRadius: size / 2,
        borderWidth: strokeWidth, borderColor: ringColor,
        borderTopColor: pct < 25 ? 'transparent' : ringColor,
        borderEndColor: pct < 50 ? 'transparent' : ringColor,
        borderBottomColor: pct < 75 ? 'transparent' : ringColor,
        borderStartColor: ringColor,
        transform: [{ rotate: `${-90 + (pct / 100) * 360}deg` }],
      }]} />
      <View style={pr.center}>
        <RNText style={[pr.pct, { fontSize: size * 0.2 }]}>{pct}%</RNText>
        {label ? <RNText style={pr.label}>{label}</RNText> : null}
      </View>
    </View>
  );
}
ProgressRing.displayName = 'ProgressRing';

const pr = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  track: { position: 'absolute' },
  progress: { position: 'absolute' },
  center: { alignItems: 'center', justifyContent: 'center' },
  pct: { fontFamily: 'NotoSansArabic_700Bold', color: color.text },
  label: { fontSize: font.size.caption, color: color.textMuted },
});

// ---------------------------------------------------------------------------
// StatusBadge (extended Badge with colors)
// ---------------------------------------------------------------------------

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';
export type BadgeSize = 'sm' | 'md';

export interface StatusBadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  testID?: string;
}

const badgeVariantColors: Record<BadgeVariant, { bg: string; fg: string; border: string }> = {
  default: { bg: color.surface, fg: color.textMuted, border: color.border },
  success: { bg: '#E2F3EA', fg: '#145C38', border: '#145C38' },
  warning: { bg: '#FEF7E0', fg: '#7A5900', border: '#7A5900' },
  danger: { bg: '#FBE7E5', fg: color.danger, border: color.danger },
  info: { bg: '#E3F0FA', fg: '#0B4A75', border: '#0B4A75' },
};

export function StatusBadge({ label, variant = 'default', size = 'md', testID }: StatusBadgeProps): ReactElement {
  const { bg, fg, border } = badgeVariantColors[variant];
  return (
    <View testID={testID} style={[sb.badge, { backgroundColor: bg, borderColor: border }, size === 'sm' && sb.sm]}>
      <RNText style={[sb.text, { color: fg }, size === 'sm' && sb.textSm]}>{label}</RNText>
    </View>
  );
}
StatusBadge.displayName = 'StatusBadge';

const sb = StyleSheet.create({
  badge: { alignSelf: 'flex-start', paddingHorizontal: space.s, paddingVertical: 2, borderRadius: radius.s, borderWidth: 1 },
  sm: { paddingHorizontal: space.xs, paddingVertical: 1 },
  text: { fontSize: font.size.caption, fontFamily: 'NotoSansArabic_700Bold' },
  textSm: { fontSize: 11 },
});

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

export interface TooltipProps {
  children: ReactNode;
  text: string;
  testID?: string;
}

export function Tooltip({ children, text, testID }: TooltipProps): ReactElement {
  const [visible, setVisible] = useState(false);
  return (
    <View testID={testID} style={tt.wrap}>
      <Pressable
        onLongPress={() => setVisible(true)}
        onPressOut={() => setVisible(false)}
        accessibilityHint={text}
        delayLongPress={400}
      >
        {children}
      </Pressable>
      {visible && (
        <View style={tt.bubble} pointerEvents="none">
          <RNText style={tt.text}>{text}</RNText>
        </View>
      )}
    </View>
  );
}
Tooltip.displayName = 'Tooltip';

const tt = StyleSheet.create({
  wrap: { position: 'relative' },
  bubble: { position: 'absolute', bottom: '100%', start: 0, backgroundColor: '#1B1F24', borderRadius: radius.m, padding: space.s, zIndex: 999, maxWidth: 200 },
  text: { color: '#FFFFFF', fontSize: font.size.caption },
});

// ---------------------------------------------------------------------------
// Accordion
// ---------------------------------------------------------------------------

export interface AccordionItem {
  id: string;
  title: string;
  content: ReactNode;
}

export interface AccordionProps {
  items: AccordionItem[];
  allowMultiple?: boolean;
  testID?: string;
}

export function Accordion({ items, allowMultiple = false, testID }: AccordionProps): ReactElement {
  const [open, setOpen] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); }
      else {
        if (!allowMultiple) next.clear();
        next.add(id);
      }
      return next;
    });
  }

  return (
    <View testID={testID} style={ac.container}>
      {items.map((item, i) => {
        const expanded = open.has(item.id);
        return (
          <View key={item.id} style={[ac.item, i > 0 && ac.borderTop]}>
            <Pressable
              onPress={() => toggle(item.id)}
              style={ac.trigger}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={item.title}
            >
              <RNText style={ac.triggerText}>{item.title}</RNText>
              <RNText style={ac.chevron}>{expanded ? SYM_EXPAND : SYM_COLLAPSE}</RNText>
            </Pressable>
            {expanded && <View style={ac.panel}>{typeof item.content === 'string' ? <RNText style={ac.panelText}>{item.content}</RNText> : item.content}</View>}
          </View>
        );
      })}
    </View>
  );
}
Accordion.displayName = 'Accordion';

const ac = StyleSheet.create({
  container: { borderRadius: radius.m, borderWidth: 1, borderColor: color.border, overflow: 'hidden' },
  item: {},
  borderTop: { borderTopWidth: 1, borderTopColor: color.border },
  trigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.m, minHeight: tokens.minTouch, backgroundColor: color.surface },
  triggerText: { flex: 1, fontFamily: 'NotoSansArabic_700Bold', fontSize: font.size.body, color: color.text },
  chevron: { fontSize: 10, color: color.textMuted, marginStart: space.s },
  panel: { padding: space.m, backgroundColor: color.bg },
  panelText: { fontFamily: 'NotoSansArabic_400Regular', fontSize: font.size.body, color: color.text },
});
