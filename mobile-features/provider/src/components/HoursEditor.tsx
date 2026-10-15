/**
 * M177: Structured opening hours editor.
 *
 * Displays a per-day toggle list (Sat–Fri). For each open day the user enters
 * an open-time and a close-time (HH:MM). The component serialises the result
 * into OSM opening_hours syntax and calls onChangeRaw with the string so the
 * parent can pass it straight to the API.
 *
 * OSM output examples:
 *   Sa-Th 09:00-22:00
 *   Mo-Su 00:00-24:00
 *   We,Fr 10:00-18:00
 */
import { type ReactElement } from 'react';
import {
  I18nManager,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ─── Types ────────────────────────────────────────────────────────────────────

/** 0=Sat … 6=Fri (matches Iraqi week starting Saturday) */
export type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** State for one day slot */
export interface DaySlot {
  open: boolean;
  from: string; // HH:MM
  to: string;   // HH:MM
}

export type WeekSlots = Record<DayIndex, DaySlot>;

/** OSM 2-letter abbreviations in day order */
const OSM_DAYS: readonly string[] = ['Sa', 'Su', 'Mo', 'Tu', 'We', 'Th', 'Fr'];

/** i18n day name keys (index 0=Sat … 6=Fri) */
const DAY_KEYS = ['edit.hours.day0', 'edit.hours.day1', 'edit.hours.day2', 'edit.hours.day3', 'edit.hours.day4', 'edit.hours.day5', 'edit.hours.day6'] as const;

const DAYS = (Array.from({ length: 7 }, (_, i) => i) as DayIndex[]);

// ─── Serialisation ────────────────────────────────────────────────────────────

/**
 * Convert WeekSlots → OSM opening_hours string.
 * Groups consecutive days that share the same hours into a range (Sa-Th).
 * Non-consecutive same-hours days are comma-joined (Mo,We).
 */
export function slotsToOsm(slots: WeekSlots): string {
  const open = DAYS.filter((d) => slots[d].open);
  if (open.length === 0) return '';

  // Group open days by their hours
  const groups: Map<string, DayIndex[]> = new Map();
  for (const d of open) {
    const key = `${slots[d].from}-${slots[d].to}`;
    const g = groups.get(key) ?? [];
    g.push(d);
    groups.set(key, g);
  }

  const parts: string[] = [];
  for (const [hours, days] of groups) {
    const [from, to] = hours.split('-');
    // Build compressed day expression
    const dayStr = compressDays(days);
    parts.push(`${dayStr} ${from}-${to}`);
  }
  return parts.join('; ');
}

/** Compress [0,1,2,3] → "Sa-Tu"; [0,2] → "Sa,Mo" */
function compressDays(days: DayIndex[]): string {
  if (days.length === 0) return '';
  if (days.length === 1) return OSM_DAYS[days[0]!]!;

  // Check if consecutive (in our 0-6 ordering)
  let consecutive = true;
  for (let i = 1; i < days.length; i++) {
    if (days[i]! !== days[i - 1]! + 1) { consecutive = false; break; }
  }
  if (consecutive) {
    return `${OSM_DAYS[days[0]!]}-${OSM_DAYS[days[days.length - 1]!]}`;
  }
  return days.map((d) => OSM_DAYS[d]).join(',');
}

// ─── Default state factory ────────────────────────────────────────────────────

export function defaultSlots(): WeekSlots {
  return Object.fromEntries(
    DAYS.map((d) => [d, { open: d < 6, from: '09:00', to: '22:00' }]),
  ) as WeekSlots;
}

/**
 * Attempt to parse an OSM string back to WeekSlots. Falls back to defaults
 * when parsing fails so the UI always has something to show.
 */
export function osmToSlots(raw: string): WeekSlots {
  const result = defaultSlots();
  // Start with all closed
  for (const d of DAYS) result[d].open = false;

  if (!raw.trim()) return result;

  // Split rules by ";" and process each
  const rules = raw.split(';').map((r) => r.trim()).filter(Boolean);
  for (const rule of rules) {
    // Expect "<days> HH:MM-HH:MM" or "<days> HH:MM-24:00"
    const m = rule.match(/^([A-Za-z,-]+)\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/);
    if (!m) continue;
    const [, daysPart, from, to] = m;
    const dayIndices = parseDaysPart(daysPart!);
    for (const d of dayIndices) {
      result[d] = { open: true, from: from!, to: to! };
    }
  }
  return result;
}

/** Parse "Sa-Th" → [0,1,2,3,4,5]; "Mo,We" → [2,4] */
function parseDaysPart(part: string): DayIndex[] {
  const indices: DayIndex[] = [];
  // Range: Sa-Th
  const rangeM = part.match(/^([A-Za-z]+)-([A-Za-z]+)$/);
  if (rangeM) {
    const start = OSM_DAYS.indexOf(rangeM[1]!);
    const end = OSM_DAYS.indexOf(rangeM[2]!);
    if (start !== -1 && end !== -1) {
      for (let i = start; i <= end; i++) indices.push(i as DayIndex);
    }
    return indices;
  }
  // Comma list: Mo,We,Fr
  for (const tok of part.split(',')) {
    const idx = OSM_DAYS.indexOf(tok.trim());
    if (idx !== -1) indices.push(idx as DayIndex);
  }
  return indices;
}

// ─── HH:MM input validation ───────────────────────────────────────────────────

function isValidTime(val: string): boolean {
  return /^\d{2}:\d{2}$/.test(val);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TimeInput({
  value,
  onChange,
  label,
  testID,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  testID?: string;
}): ReactElement {
  const invalid = value.length > 0 && !isValidTime(value);
  return (
    <View style={timeStyles.wrap}>
      <Text style={timeStyles.label}>{label}</Text>
      <TextInput
        style={[timeStyles.input, invalid && timeStyles.inputError]}
        value={value}
        onChangeText={onChange}
        placeholder="09:00"
        placeholderTextColor="#AAA"
        keyboardType="numbers-and-punctuation"
        maxLength={5}
        accessibilityLabel={label}
        testID={testID}
      />
    </View>
  );
}

const timeStyles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 2 },
  label: { fontSize: 11, color: '#666' },
  input: {
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 14,
    color: '#222',
    width: 64,
    textAlign: 'center',
  },
  inputError: { borderColor: '#E53935' },
});

// ─── Main component ───────────────────────────────────────────────────────────

export interface HoursEditorProps {
  slots: WeekSlots;
  onChange: (slots: WeekSlots) => void;
}

export function HoursEditor({ slots, onChange }: HoursEditorProps): ReactElement {
  function setDay(d: DayIndex, patch: Partial<DaySlot>): void {
    onChange({ ...slots, [d]: { ...slots[d], ...patch } });
  }

  return (
    <View style={styles.container} accessibilityLabel={t('edit.hours.label')}>
      <Text style={styles.sectionLabel}>{t('edit.hours.label')}</Text>
      {DAYS.map((d) => {
        const slot = slots[d]!;
        return (
          <View key={d} style={styles.row} testID={`hours-row-${d}`}>
            {/* Day toggle */}
            <Pressable
              style={[styles.dayToggle, slot.open && styles.dayToggleActive]}
              onPress={() => setDay(d, { open: !slot.open })}
              accessibilityRole="switch"
              accessibilityState={{ checked: slot.open }}
              accessibilityLabel={t(DAY_KEYS[d])}
              testID={`hours-toggle-${d}`}
            >
              <Text style={[styles.dayLabel, slot.open && styles.dayLabelActive]}>
                {t(DAY_KEYS[d])}
              </Text>
            </Pressable>

            {/* Time inputs (only when open) */}
            {slot.open ? (
              <View style={styles.timeRow}>
                <TimeInput
                  value={slot.from}
                  onChange={(v) => setDay(d, { from: v })}
                  label={t('edit.hours.from')}
                  testID={`hours-from-${d}`}
                />
                <Text style={styles.timeSep}>{t('edit.hours.to')}</Text>
                <TimeInput
                  value={slot.to}
                  onChange={(v) => setDay(d, { to: v })}
                  label={t('edit.hours.toLabel')}
                  testID={`hours-to-${d}`}
                />
              </View>
            ) : (
              <Text style={styles.closedLabel}>{t('edit.hours.closed')}</Text>
            )}
          </View>
        );
      })}
      <Text style={styles.preview} testID="hours-preview">
        {slotsToOsm(slots) || t('edit.hours.none')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6, marginVertical: 8 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#444', textAlign: 'auto', marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEE',
  },
  dayToggle: {
    width: 88,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
  },
  dayToggleActive: { backgroundColor: '#1976D2' },
  dayLabel: { fontSize: 13, color: '#555', fontWeight: '500' },
  dayLabelActive: { color: '#FFF' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  timeSep: { fontSize: 13, color: '#888' },
  closedLabel: { fontSize: 13, color: '#AAA', flex: 1, textAlign: 'auto' },
  preview: {
    marginTop: 8,
    fontSize: 12,
    color: '#666',
    backgroundColor: '#F5F5F5',
    padding: 8,
    borderRadius: 6,
    textAlign: 'auto',
  },
});
