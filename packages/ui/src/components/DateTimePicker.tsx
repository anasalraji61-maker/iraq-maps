/* eslint-disable no-restricted-syntax, i18next/no-literal-string */
/**
 * DateTimePicker — Iraq-specific date/time selection.
 *
 * Features:
 * - Gregorian calendar (default) with Hijri toggle.
 * - Arabic month names for both calendars.
 * - Baghdad timezone (Asia/Baghdad, UTC+3, no DST).
 * - 12-hour time picker with Arabic AM/PM labels (ص / م).
 * - Date range mode (from/to selection).
 * - RTL layout throughout.
 */
import { useMemo, useState } from 'react';
import {
  I18nManager,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { fonts, tokens } from '../tokens';

// ── Calendar data ─────────────────────────────────────────────────────────────

export const GREGORIAN_MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
] as const;

export const HIJRI_MONTHS_AR = [
  'محرم', 'صفر', 'ربيع الأول', 'ربيع الثاني',
  'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان',
  'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة',
] as const;

export const DAYS_AR = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'] as const;

const AM_AR = 'ص';
const PM_AR = 'م';

// ── Hijri conversion (Kuwaiti algorithm) ─────────────────────────────────────

export interface HijriDate { year: number; month: number; day: number }

/** Convert a Gregorian Date to approximate Hijri date (Kuwaiti/tabular algorithm). */
export function toHijri(date: Date): HijriDate {
  const jd = Math.floor((14 + 153 * (date.getMonth() + 1) + 2) / 5)
    + date.getDate()
    + 365 * (date.getFullYear() - 1)
    + Math.floor((date.getFullYear() - 1) / 4)
    - Math.floor((date.getFullYear() - 1) / 100)
    + Math.floor((date.getFullYear() - 1) / 400)
    - 32045;
  const l = jd - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const l2 = l - 10631 * n + 354;
  const j = Math.floor((10985 - l2) / 5316) * Math.floor(50 * l2 / 17719)
    + Math.floor(l2 / 5670) * Math.floor(43 * l2 / 15238);
  const l3 = l2 - Math.floor((30 - j) / 15) * Math.floor(17719 * j / 50)
    - Math.floor(j / 16) * Math.floor(15238 * j / 43) + 29;
  const month = Math.floor(24 * l3 / 709);
  const day = l3 - Math.floor(709 * month / 24);
  const year = 30 * n + j - 30;
  return { year, month, day };
}

/** Days in a Gregorian month. */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** First weekday (0=Sun) of a Gregorian month. */
function firstWeekday(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

// ── Baghdad timezone helpers ──────────────────────────────────────────────────

/** Return 'now' adjusted to Baghdad time (UTC+3, no DST). */
export function baghdadNow(): Date {
  const now = new Date();
  // Baghdad is UTC+3 always
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  return new Date(utcMs + 3 * 3600_000);
}

// ── Types ────────────────────────────────────────────────────────────────────

export type CalendarMode = 'gregorian' | 'hijri';
export type PickerMode = 'date' | 'time' | 'datetime';
export type RangeState = 'start' | 'end';

export interface DateTimePickerProps {
  /** Controlled value. Provide null for unset. */
  value?: Date | null;
  onChange?: (date: Date) => void;
  /** Range mode: returns [start, end]. */
  range?: boolean;
  rangeStart?: Date | null;
  rangeEnd?: Date | null;
  onRangeChange?: (start: Date | null, end: Date | null) => void;
  /** Which pickers to show. Default: 'datetime'. */
  mode?: PickerMode;
  /** Calendar system. Default: 'gregorian'. */
  calendarMode?: CalendarMode;
  /** Minimum selectable date. */
  minDate?: Date;
  /** Maximum selectable date. */
  maxDate?: Date;
  /** Show the calendar inline (no modal). Default: false. */
  inline?: boolean;
  /** Label shown on the trigger button. */
  placeholder?: string;
  disabled?: boolean;
  testID?: string;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const { color, space, radius, font } = tokens;

const s = StyleSheet.create({
  trigger: {
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.m,
    paddingHorizontal: space.m,
    paddingVertical: space.s,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: color.bg,
    minHeight: 48,
  },
  triggerText: {
    fontFamily: fonts.regular,
    fontSize: font.size.body,
    color: color.text,
  },
  triggerPlaceholder: {
    color: color.textMuted,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: color.bg,
    borderTopLeftRadius: radius.l,
    borderTopRightRadius: radius.l,
    paddingBottom: 34,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.m,
    paddingVertical: space.m,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  headerTitle: {
    fontFamily: fonts.bold,
    fontSize: font.size.subtitle,
    color: color.text,
  },
  toggleRow: {
    flexDirection: 'row',
    marginHorizontal: space.m,
    marginVertical: space.s,
    borderRadius: radius.m,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: color.primary,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: space.s,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: color.primary,
  },
  toggleBtnText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: color.primary,
  },
  toggleBtnTextActive: {
    color: color.onPrimary,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.m,
    paddingVertical: space.s,
  },
  navBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  navBtnText: {
    fontSize: 18,
    color: color.primary,
    fontFamily: fonts.bold,
  },
  monthYear: {
    fontFamily: fonts.bold,
    fontSize: font.size.body,
    color: color.text,
  },
  daysRow: {
    flexDirection: 'row',
    paddingHorizontal: space.s,
  },
  dayHeader: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.xs,
  },
  dayHeaderText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: color.textMuted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: space.s,
  },
  cell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellSelected: {
    backgroundColor: color.primary,
  },
  cellRangeMiddle: {
    backgroundColor: color.primary + '33',
    borderRadius: 0,
  },
  cellToday: {
    borderWidth: 1,
    borderColor: color.primary,
  },
  cellText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: color.text,
  },
  cellTextSelected: {
    color: color.onPrimary,
    fontFamily: fonts.bold,
  },
  cellTextDisabled: {
    color: color.border,
  },
  timePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.m,
    gap: space.s,
  },
  timeScroll: {
    height: 150,
    width: 60,
  },
  timeCell: {
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeCellSelected: {
    backgroundColor: color.primary + '22',
    borderRadius: radius.m,
  },
  timeCellText: {
    fontFamily: fonts.regular,
    fontSize: font.size.subtitle,
    color: color.text,
  },
  timeCellTextSelected: {
    fontFamily: fonts.bold,
    color: color.primary,
  },
  timeSep: {
    fontFamily: fonts.bold,
    fontSize: font.size.subtitle,
    color: color.text,
  },
  ampmCol: {
    gap: space.xs,
  },
  ampmBtn: {
    paddingHorizontal: space.m,
    paddingVertical: space.s,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
  },
  ampmBtnActive: {
    backgroundColor: color.primary,
    borderColor: color.primary,
  },
  ampmText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: color.text,
  },
  ampmTextActive: {
    color: color.onPrimary,
    fontFamily: fonts.bold,
  },
  doneBtn: {
    marginHorizontal: space.m,
    marginTop: space.m,
    backgroundColor: color.primary,
    borderRadius: radius.m,
    paddingVertical: space.s + 2,
    alignItems: 'center',
  },
  doneBtnText: {
    fontFamily: fonts.bold,
    fontSize: font.size.body,
    color: color.onPrimary,
  },
});

// ── Sub-components ───────────────────────────────────────────────────────────

function CalendarGrid({
  year, month, selected, rangeStart, rangeEnd,
  minDate, maxDate, onSelect,
}: {
  year: number; month: number;
  selected?: Date | null; rangeStart?: Date | null; rangeEnd?: Date | null;
  minDate?: Date; maxDate?: Date;
  onSelect(day: number): void;
}) {
  const today = baghdadNow();
  const totalDays = daysInMonth(year, month);
  const startOffset = firstWeekday(year, month);

  function isSelected(d: number) {
    if (!selected) return false;
    return selected.getFullYear() === year && selected.getMonth() === month && selected.getDate() === d;
  }

  function isRangeStart(d: number) {
    if (!rangeStart) return false;
    return rangeStart.getFullYear() === year && rangeStart.getMonth() === month && rangeStart.getDate() === d;
  }

  function isRangeEnd(d: number) {
    if (!rangeEnd) return false;
    return rangeEnd.getFullYear() === year && rangeEnd.getMonth() === month && rangeEnd.getDate() === d;
  }

  function isInRange(d: number) {
    if (!rangeStart || !rangeEnd) return false;
    const dt = new Date(year, month, d);
    return dt > rangeStart && dt < rangeEnd;
  }

  function isToday(d: number) {
    return today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
  }

  function isDisabled(d: number) {
    const dt = new Date(year, month, d);
    if (minDate && dt < minDate) return true;
    if (maxDate && dt > maxDate) return true;
    return false;
  }

  const cells: React.ReactElement[] = [];
  // empty cells for offset
  for (let i = 0; i < startOffset; i++) {
    cells.push(<View key={`e${i}`} style={s.cell} />);
  }
  for (let d = 1; d <= totalDays; d++) {
    const sel = isSelected(d) || isRangeStart(d) || isRangeEnd(d);
    const mid = isInRange(d);
    const dis = isDisabled(d);
    cells.push(
      <TouchableOpacity
        key={d}
        style={[s.cell, mid && s.cellRangeMiddle]}
        onPress={() => !dis && onSelect(d)}
        disabled={dis}
        accessibilityLabel={`${d}`}
      >
        <View style={[s.cellInner, sel && s.cellSelected, isToday(d) && !sel && s.cellToday]}>
          <Text style={[s.cellText, sel && s.cellTextSelected, dis && s.cellTextDisabled]}>
            {d}
          </Text>
        </View>
      </TouchableOpacity>,
    );
  }

  return (
    <>
      <View style={s.daysRow}>
        {DAYS_AR.map((d) => (
          <View key={d} style={s.dayHeader}>
            <Text style={s.dayHeaderText}>{d}</Text>
          </View>
        ))}
      </View>
      <View style={s.grid}>{cells}</View>
    </>
  );
}

function TimePickerPanel({
  hour12, minute, isPM, onHour, onMinute, onAMPM,
}: {
  hour12: number; minute: number; isPM: boolean;
  onHour(h: number): void; onMinute(m: number): void; onAMPM(pm: boolean): void;
}) {
  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = Array.from({ length: 60 }, (_, i) => i);

  return (
    <View style={s.timePicker}>
      <ScrollView style={s.timeScroll} showsVerticalScrollIndicator={false}>
        {hours.map((h) => (
          <TouchableOpacity key={h} style={[s.timeCell, h === hour12 && s.timeCellSelected]} onPress={() => onHour(h)}>
            <Text style={[s.timeCellText, h === hour12 && s.timeCellTextSelected]}>
              {String(h).padStart(2, '0')}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <Text style={s.timeSep}>:</Text>
      <ScrollView style={s.timeScroll} showsVerticalScrollIndicator={false}>
        {minutes.map((m) => (
          <TouchableOpacity key={m} style={[s.timeCell, m === minute && s.timeCellSelected]} onPress={() => onMinute(m)}>
            <Text style={[s.timeCellText, m === minute && s.timeCellTextSelected]}>
              {String(m).padStart(2, '0')}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={s.ampmCol}>
        <TouchableOpacity style={[s.ampmBtn, !isPM && s.ampmBtnActive]} onPress={() => onAMPM(false)}>
          <Text style={[s.ampmText, !isPM && s.ampmTextActive]}>{AM_AR}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.ampmBtn, isPM && s.ampmBtnActive]} onPress={() => onAMPM(true)}>
          <Text style={[s.ampmText, isPM && s.ampmTextActive]}>{PM_AR}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DateTimePicker({
  value,
  onChange,
  range = false,
  rangeStart,
  rangeEnd,
  onRangeChange,
  mode = 'datetime',
  calendarMode: initialCalendarMode = 'gregorian',
  minDate,
  maxDate,
  inline = false,
  placeholder = 'اختر التاريخ والوقت',
  disabled = false,
  testID,
}: DateTimePickerProps) {
  const today = baghdadNow();
  const [open, setOpen] = useState(false);
  const [calMode, setCalMode] = useState<CalendarMode>(initialCalendarMode);
  const [viewYear, setViewYear] = useState(value?.getFullYear() ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(value?.getMonth() ?? today.getMonth());
  const [rangePhase, setRangePhase] = useState<RangeState>('start');

  // Time state
  const base = value ?? today;
  const rawHour = base.getHours();
  const [isPM, setIsPM] = useState(rawHour >= 12);
  const [hour12, setHour12] = useState(rawHour % 12 || 12);
  const [minute, setMinute] = useState(base.getMinutes());

  const formattedValue = useMemo(() => {
    if (!value) return null;
    const months = calMode === 'gregorian' ? GREGORIAN_MONTHS_AR : HIJRI_MONTHS_AR;
    if (calMode === 'hijri') {
      const h = toHijri(value);
      return `${h.day} ${months[h.month - 1]} ${h.year}`;
    }
    const parts: string[] = [];
    if (mode !== 'time') {
      parts.push(`${value.getDate()} ${months[value.getMonth()]} ${value.getFullYear()}`);
    }
    if (mode !== 'date') {
      const h = value.getHours();
      const m = String(value.getMinutes()).padStart(2, '0');
      const h12 = h % 12 || 12;
      const ampm = h >= 12 ? PM_AR : AM_AR;
      parts.push(`${h12}:${m} ${ampm}`);
    }
    return parts.join('  ');
  }, [value, calMode, mode]);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  function handleDaySelect(day: number) {
    const selected = new Date(viewYear, viewMonth, day, isPM ? (hour12 % 12) + 12 : hour12 % 12, minute);
    if (range && onRangeChange) {
      if (rangePhase === 'start') {
        onRangeChange(selected, null);
        setRangePhase('end');
      } else {
        const start = rangeStart ?? selected;
        if (selected < start) {
          onRangeChange(selected, start);
        } else {
          onRangeChange(start, selected);
        }
        setRangePhase('start');
      }
    } else {
      onChange?.(selected);
    }
  }

  function handleDone() {
    if (value && mode !== 'date') {
      const h24 = isPM ? (hour12 % 12) + 12 : hour12 % 12;
      const updated = new Date(value);
      updated.setHours(h24, minute);
      onChange?.(updated);
    }
    setOpen(false);
  }

  const monthLabel = calMode === 'gregorian'
    ? `${GREGORIAN_MONTHS_AR[viewMonth]} ${viewYear}`
    : (() => { const h = toHijri(new Date(viewYear, viewMonth, 15)); return `${HIJRI_MONTHS_AR[h.month - 1]} ${h.year}`; })();

  const content = (
    <View style={s.sheet}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => setOpen(false)} accessibilityLabel="إغلاق">
          <Text style={{ fontSize: 20, color: color.textMuted }}>✕</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>
          {range ? (rangePhase === 'start' ? 'اختر تاريخ البداية' : 'اختر تاريخ النهاية') : 'اختر التاريخ'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Calendar toggle */}
      <View style={s.toggleRow}>
        <TouchableOpacity
          style={[s.toggleBtn, calMode === 'gregorian' && s.toggleBtnActive]}
          onPress={() => setCalMode('gregorian')}
        >
          <Text style={[s.toggleBtnText, calMode === 'gregorian' && s.toggleBtnTextActive]}>ميلادي</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.toggleBtn, calMode === 'hijri' && s.toggleBtnActive]}
          onPress={() => setCalMode('hijri')}
        >
          <Text style={[s.toggleBtnText, calMode === 'hijri' && s.toggleBtnTextActive]}>هجري</Text>
        </TouchableOpacity>
      </View>

      {/* Month navigation */}
      {mode !== 'time' && (
        <>
          <View style={s.navRow}>
            <TouchableOpacity style={s.navBtn} onPress={I18nManager.isRTL ? nextMonth : prevMonth}>
              <Text style={s.navBtnText}>{I18nManager.isRTL ? '›' : '‹'}</Text>
            </TouchableOpacity>
            <Text style={s.monthYear}>{monthLabel}</Text>
            <TouchableOpacity style={s.navBtn} onPress={I18nManager.isRTL ? prevMonth : nextMonth}>
              <Text style={s.navBtnText}>{I18nManager.isRTL ? '‹' : '›'}</Text>
            </TouchableOpacity>
          </View>
          <CalendarGrid
            year={viewYear}
            month={viewMonth}
            selected={!range ? value : null}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            minDate={minDate}
            maxDate={maxDate}
            onSelect={handleDaySelect}
          />
        </>
      )}

      {/* Time picker */}
      {mode !== 'date' && (
        <TimePickerPanel
          hour12={hour12}
          minute={minute}
          isPM={isPM}
          onHour={setHour12}
          onMinute={setMinute}
          onAMPM={setIsPM}
        />
      )}

      <TouchableOpacity style={s.doneBtn} onPress={handleDone}>
        <Text style={s.doneBtnText}>تأكيد</Text>
      </TouchableOpacity>
    </View>
  );

  if (inline) return content;

  return (
    <>
      <Pressable
        style={[s.trigger, disabled && { opacity: 0.5 }]}
        onPress={() => !disabled && setOpen(true)}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={formattedValue ?? placeholder}
      >
        <Text style={[s.triggerText, !formattedValue && s.triggerPlaceholder]}>
          {formattedValue ?? placeholder}
        </Text>
        <Text style={{ color: color.primary }}>📅</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.overlay} onPress={() => setOpen(false)}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            {content}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

DateTimePicker.displayName = 'DateTimePicker';
