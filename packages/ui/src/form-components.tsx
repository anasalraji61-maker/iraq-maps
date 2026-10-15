/**
 * Form Components — RTL-safe, AA contrast, 48dp touch targets.
 * All user-facing strings come from callers (already translated).
 */
import { type ReactElement, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
} from 'react-native';
import { tokens } from './tokens';

const { color, space, radius, font } = tokens;

// Symbols used in JSX — stored as constants so the i18next/no-literal-string jsx-only rule
// does not flag them (they are not user-visible translated strings).
const SYM_DOWN = '▼'; // ▼
const SYM_UP = '▲';   // ▲
const SYM_CHECK = '✓'; // ✓
const SYM_PREV = '<';
const SYM_NEXT = '>';
const SYM_CLOSE = '×'; // ×
const SYM_STAR_FULL = '★';  // ★
const SYM_STAR_EMPTY = '☆'; // ☆
const SYM_STAR_HALF = '⭐';  // ⭐

// ---------------------------------------------------------------------------
// PhoneInput
// ---------------------------------------------------------------------------

export interface CountryCode {
  code: string;
  flag: string;
  label: string;
}

const DEFAULT_COUNTRY_CODES: CountryCode[] = [
  { code: '+964', flag: '🇮🇶', label: 'IQ' },
  { code: '+1',   flag: '🇺🇸', label: 'US' },
  { code: '+44',  flag: '🇬🇧', label: 'GB' },
  { code: '+971', flag: '🇦🇪', label: 'AE' },
  { code: '+966', flag: '🇸🇦', label: 'SA' },
  { code: '+90',  flag: '🇹🇷', label: 'TR' },
  { code: '+98',  flag: '🇮🇷', label: 'IR' },
  { code: '+963', flag: '🇸🇾', label: 'SY' },
  { code: '+962', flag: '🇯🇴', label: 'JO' },
];

export interface PhoneInputProps {
  value: string;
  onChangeText(text: string): void;
  label?: string;
  error?: string;
  countryCodes?: CountryCode[];
  testID?: string;
}

export function PhoneInput({ value, onChangeText, label, error, countryCodes = DEFAULT_COUNTRY_CODES, testID }: PhoneInputProps): ReactElement {
  const [countryIdx, setCountryIdx] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const country = countryCodes[countryIdx]!;

  return (
    <View style={ph.wrapper}>
      {label ? <RNText style={ph.label}>{label}</RNText> : null}
      <View style={[ph.row, error ? ph.rowError : null]}>
        <Pressable
          onPress={() => setPickerOpen((o) => !o)}
          style={ph.flagBtn}
          accessibilityRole="button"
          accessibilityLabel={`${country.label} ${country.code}`}
          testID={testID && `${testID}.flag`}
        >
          <RNText style={ph.flag}>{country.flag}</RNText>
          <RNText style={ph.code}>{country.code}</RNText>
          <RNText style={ph.chevron}>{SYM_DOWN}</RNText>
        </Pressable>
        <View style={ph.divider} />
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          keyboardType="phone-pad"
          style={ph.input}
          accessibilityLabel={label}
          accessibilityHint={error}
          placeholderTextColor={color.textMuted}
        />
      </View>
      {error ? <RNText style={ph.error}>{error}</RNText> : null}
      {pickerOpen && (
        <View style={ph.picker}>
          {countryCodes.map((c, i) => (
            <Pressable
              key={c.code}
              onPress={() => { setCountryIdx(i); setPickerOpen(false); }}
              style={ph.pickerItem}
              accessibilityRole="button"
            >
              <RNText style={ph.pickerFlag}>{c.flag}</RNText>
              <RNText style={ph.pickerLabel}>{c.label}</RNText>
              <RNText style={ph.pickerCode}>{c.code}</RNText>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
PhoneInput.displayName = 'PhoneInput';

const ph = StyleSheet.create({
  wrapper: { gap: space.xs },
  label: { fontSize: font.size.caption, color: color.text },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: color.border, borderRadius: radius.m, backgroundColor: color.bg, minHeight: tokens.minTouch },
  rowError: { borderColor: color.danger, borderWidth: 2 },
  flagBtn: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.s, minHeight: tokens.minTouch },
  flag: { fontSize: 20 },
  code: { fontSize: font.size.caption, color: color.text },
  chevron: { fontSize: 9, color: color.textMuted },
  divider: { width: 1, height: 28, backgroundColor: color.border },
  input: { flex: 1, paddingHorizontal: space.m, fontSize: font.size.body, color: color.text },
  error: { fontSize: font.size.caption, color: color.danger },
  picker: { position: 'absolute', top: '100%', start: 0, zIndex: 100, backgroundColor: color.bg, borderRadius: radius.m, borderWidth: 1, borderColor: color.border, overflow: 'hidden', width: 200 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', gap: space.s, padding: space.s, minHeight: tokens.minTouch },
  pickerFlag: { fontSize: 20 },
  pickerLabel: { flex: 1, fontSize: font.size.caption, color: color.text },
  pickerCode: { fontSize: font.size.caption, color: color.textMuted },
});

// ---------------------------------------------------------------------------
// DatePicker (RTL-aware)
// ---------------------------------------------------------------------------

export interface DatePickerProps {
  value: Date | null;
  onChange(date: Date): void;
  label?: string;
  /** 12 month names in display order. Callers supply them translated. */
  monthNames: string[];
  /** 7 weekday names starting from Sunday. Callers supply them translated. */
  dayNames: string[];
  minDate?: Date;
  maxDate?: Date;
  emptyPlaceholder?: string;
  prevLabel?: string;
  nextLabel?: string;
  testID?: string;
}

export function DatePicker({ value, onChange, label, monthNames, dayNames, minDate, maxDate, emptyPlaceholder = '-- -- ----', prevLabel = SYM_PREV, nextLabel = SYM_NEXT, testID }: DatePickerProps): ReactElement {
  const today = new Date();
  const [viewYear, setViewYear] = useState(value?.getFullYear() ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(value?.getMonth() ?? today.getMonth());
  const [open, setOpen] = useState(false);

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  function prevMonth() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  }

  function selectDay(day: number) {
    const d = new Date(viewYear, viewMonth, day);
    if (minDate && d < minDate) return;
    if (maxDate && d > maxDate) return;
    onChange(d);
    setOpen(false);
  }

  const displayStr = value ? `${value.getDate()} ${monthNames[value.getMonth()] ?? ''} ${value.getFullYear()}` : '';
  const monthLabel = monthNames[viewMonth] ?? '';

  return (
    <View testID={testID} style={dp.wrapper}>
      {label ? <RNText style={dp.label}>{label}</RNText> : null}
      <Pressable onPress={() => setOpen((o) => !o)} style={dp.trigger} accessibilityRole="button">
        <RNText style={displayStr ? dp.value : dp.placeholder}>{displayStr || emptyPlaceholder}</RNText>
        <RNText style={dp.icon}>{'📅'}</RNText>
      </Pressable>
      {open && (
        <View style={dp.calendar}>
          <View style={dp.navRow}>
            <Pressable onPress={prevMonth} style={dp.navBtn} accessibilityRole="button">
              <RNText style={dp.navText}>{prevLabel}</RNText>
            </Pressable>
            <RNText style={dp.monthYear}>{monthLabel} {viewYear}</RNText>
            <Pressable onPress={nextMonth} style={dp.navBtn} accessibilityRole="button">
              <RNText style={dp.navText}>{nextLabel}</RNText>
            </Pressable>
          </View>
          <View style={dp.weekRow}>
            {dayNames.map((d, i) => <RNText key={i} style={dp.dayHeader}>{d}</RNText>)}
          </View>
          <View style={dp.grid}>
            {Array.from({ length: firstDay }, (_, i) => <View key={`e${i}`} style={dp.dayCell} />)}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const d = new Date(viewYear, viewMonth, day);
              const isSelected = value?.getDate() === day && value?.getMonth() === viewMonth && value?.getFullYear() === viewYear;
              const disabled = Boolean((minDate && d < minDate) || (maxDate && d > maxDate));
              return (
                <Pressable key={day} onPress={() => selectDay(day)} disabled={disabled} style={[dp.dayCell, isSelected && dp.selected, disabled && dp.disabled]}>
                  <RNText style={[dp.dayText, isSelected && dp.selectedText]}>{day}</RNText>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}
DatePicker.displayName = 'DatePicker';

const dp = StyleSheet.create({
  wrapper: { gap: space.xs },
  label: { fontSize: font.size.caption, color: color.text },
  trigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: color.border, borderRadius: radius.m, paddingHorizontal: space.m, minHeight: tokens.minTouch, backgroundColor: color.bg },
  value: { fontSize: font.size.body, color: color.text },
  placeholder: { fontSize: font.size.body, color: color.textMuted },
  icon: { fontSize: 18 },
  calendar: { backgroundColor: color.bg, borderWidth: 1, borderColor: color.border, borderRadius: radius.m, padding: space.s, zIndex: 100 },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.s },
  navBtn: { minWidth: tokens.minTouch, minHeight: tokens.minTouch, alignItems: 'center', justifyContent: 'center' },
  navText: { fontSize: font.size.body, color: color.primary, fontFamily: 'NotoSansArabic_700Bold' },
  monthYear: { fontSize: font.size.body, fontFamily: 'NotoSansArabic_700Bold', color: color.text },
  weekRow: { flexDirection: 'row' },
  dayHeader: { flex: 1, textAlign: 'center', fontSize: 11, color: color.textMuted, paddingBottom: space.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: `${100 / 7}%` as `${number}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: font.size.caption, color: color.text },
  selected: { backgroundColor: color.primary, borderRadius: 999 },
  selectedText: { color: color.onPrimary },
  disabled: { opacity: 0.3 },
});

// ---------------------------------------------------------------------------
// TimePicker
// ---------------------------------------------------------------------------

export interface TimePickerProps {
  hour: number;
  minute: number;
  onChange(hour: number, minute: number): void;
  label?: string;
  testID?: string;
}

export function TimePicker({ hour, minute, onChange, label, testID }: TimePickerProps): ReactElement {
  function pad(n: number) { return String(n).padStart(2, '0'); }

  return (
    <View testID={testID} style={tp.wrapper}>
      {label ? <RNText style={tp.label}>{label}</RNText> : null}
      <View style={tp.row}>
        <View style={tp.col}>
          <Pressable onPress={() => onChange((hour + 1) % 24, minute)} style={tp.btn} accessibilityRole="button">
            <RNText style={tp.arrow}>{SYM_UP}</RNText>
          </Pressable>
          <RNText style={tp.digit}>{pad(hour)}</RNText>
          <Pressable onPress={() => onChange((hour - 1 + 24) % 24, minute)} style={tp.btn} accessibilityRole="button">
            <RNText style={tp.arrow}>{SYM_DOWN}</RNText>
          </Pressable>
        </View>
        <RNText style={tp.sep}>:</RNText>
        <View style={tp.col}>
          <Pressable onPress={() => onChange(hour, (minute + 1) % 60)} style={tp.btn} accessibilityRole="button">
            <RNText style={tp.arrow}>{SYM_UP}</RNText>
          </Pressable>
          <RNText style={tp.digit}>{pad(minute)}</RNText>
          <Pressable onPress={() => onChange(hour, (minute - 1 + 60) % 60)} style={tp.btn} accessibilityRole="button">
            <RNText style={tp.arrow}>{SYM_DOWN}</RNText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
TimePicker.displayName = 'TimePicker';

const tp = StyleSheet.create({
  wrapper: { gap: space.xs, alignSelf: 'flex-start' },
  label: { fontSize: font.size.caption, color: color.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s, borderWidth: 1, borderColor: color.border, borderRadius: radius.m, padding: space.s, backgroundColor: color.bg },
  col: { alignItems: 'center', gap: space.xs },
  btn: { minWidth: tokens.minTouch, minHeight: tokens.minTouch, alignItems: 'center', justifyContent: 'center' },
  arrow: { fontSize: 12, color: color.primary },
  digit: { fontFamily: 'NotoSansArabic_700Bold', fontSize: 24, color: color.text, minWidth: 40, textAlign: 'center' },
  sep: { fontFamily: 'NotoSansArabic_700Bold', fontSize: 24, color: color.text },
});

// ---------------------------------------------------------------------------
// MultiSelect
// ---------------------------------------------------------------------------

export interface MultiSelectOption {
  value: string;
  label: string;
}

export interface MultiSelectProps {
  options: MultiSelectOption[];
  selected: string[];
  onChangeSelected(values: string[]): void;
  label?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  searchable?: boolean;
  testID?: string;
}

export function MultiSelect({ options, selected, onChangeSelected, label, placeholder, searchPlaceholder, searchable = true, testID }: MultiSelectProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = searchable && search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  function toggle(value: string) {
    onChangeSelected(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  const selectedLabels = options.filter((o) => selected.includes(o.value)).map((o) => o.label).join(', ');

  return (
    <View testID={testID} style={ms.wrapper}>
      {label ? <RNText style={ms.label}>{label}</RNText> : null}
      <Pressable onPress={() => setOpen((o) => !o)} style={ms.trigger} accessibilityRole="button">
        <RNText style={[ms.value, !selectedLabels && ms.placeholder]} numberOfLines={1}>
          {selectedLabels || placeholder}
        </RNText>
        <RNText style={ms.chevron}>{open ? SYM_UP : SYM_DOWN}</RNText>
      </Pressable>
      {open && (
        <View style={ms.dropdown}>
          {searchable && (
            <TextInput
              style={ms.search}
              value={search}
              onChangeText={setSearch}
              placeholderTextColor={color.textMuted}
              placeholder={searchPlaceholder}
            />
          )}
          <FlatList
            data={filtered}
            keyExtractor={(o) => o.value}
            style={ms.list}
            renderItem={({ item }) => {
              const checked = selected.includes(item.value);
              return (
                <Pressable onPress={() => toggle(item.value)} style={ms.item} accessibilityRole="checkbox" accessibilityState={{ checked }}>
                  <View style={[ms.checkbox, checked && ms.checkboxChecked]}>
                    {checked && <RNText style={ms.checkmark}>{SYM_CHECK}</RNText>}
                  </View>
                  <RNText style={ms.itemLabel}>{item.label}</RNText>
                </Pressable>
              );
            }}
          />
        </View>
      )}
    </View>
  );
}
MultiSelect.displayName = 'MultiSelect';

const ms = StyleSheet.create({
  wrapper: { gap: space.xs },
  label: { fontSize: font.size.caption, color: color.text },
  trigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: color.border, borderRadius: radius.m, paddingHorizontal: space.m, minHeight: tokens.minTouch, backgroundColor: color.bg },
  value: { flex: 1, fontSize: font.size.body, color: color.text },
  placeholder: { color: color.textMuted },
  chevron: { fontSize: 10, color: color.textMuted },
  dropdown: { borderWidth: 1, borderColor: color.border, borderRadius: radius.m, backgroundColor: color.bg, maxHeight: 200, overflow: 'hidden', zIndex: 100 },
  search: { borderBottomWidth: 1, borderBottomColor: color.border, paddingHorizontal: space.m, minHeight: tokens.minTouch, fontSize: font.size.body, color: color.text },
  list: { maxHeight: 160 },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.s, padding: space.s, minHeight: tokens.minTouch },
  checkbox: { width: 20, height: 20, borderWidth: 2, borderColor: color.border, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: color.primary, borderColor: color.primary },
  checkmark: { color: color.onPrimary, fontSize: 12 },
  itemLabel: { flex: 1, fontSize: font.size.body, color: color.text },
});

// ---------------------------------------------------------------------------
// PriceInput
// ---------------------------------------------------------------------------

export type PriceCurrency = 'IQD' | 'USD';

export interface PriceInputProps {
  value: string;
  onChangeText(text: string): void;
  currency?: PriceCurrency;
  onCurrencyChange?(c: PriceCurrency): void;
  label?: string;
  error?: string;
  testID?: string;
}

export function PriceInput({ value, onChangeText, currency = 'IQD', onCurrencyChange, label, error, testID }: PriceInputProps): ReactElement {
  return (
    <View style={pi.wrapper}>
      {label ? <RNText style={pi.label}>{label}</RNText> : null}
      <View style={[pi.row, error ? pi.rowError : null]}>
        {onCurrencyChange ? (
          <Pressable
            onPress={() => onCurrencyChange(currency === 'IQD' ? 'USD' : 'IQD')}
            style={pi.currencyBtn}
            accessibilityRole="button"
            accessibilityLabel={currency}
          >
            <RNText style={pi.currency}>{currency}</RNText>
          </Pressable>
        ) : (
          <View style={pi.currencyBtn}><RNText style={pi.currency}>{currency}</RNText></View>
        )}
        <View style={pi.divider} />
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          style={pi.input}
          accessibilityLabel={label}
          accessibilityHint={error}
          placeholderTextColor={color.textMuted}
        />
      </View>
      {error ? <RNText style={pi.error}>{error}</RNText> : null}
    </View>
  );
}
PriceInput.displayName = 'PriceInput';

const pi = StyleSheet.create({
  wrapper: { gap: space.xs },
  label: { fontSize: font.size.caption, color: color.text },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: color.border, borderRadius: radius.m, minHeight: tokens.minTouch, backgroundColor: color.bg },
  rowError: { borderColor: color.danger, borderWidth: 2 },
  currencyBtn: { paddingHorizontal: space.m, minHeight: tokens.minTouch, alignItems: 'center', justifyContent: 'center' },
  currency: { fontFamily: 'NotoSansArabic_700Bold', fontSize: font.size.caption, color: color.primary },
  divider: { width: 1, height: 28, backgroundColor: color.border },
  input: { flex: 1, paddingHorizontal: space.m, fontSize: font.size.body, color: color.text },
  error: { fontSize: font.size.caption, color: color.danger },
});

// ---------------------------------------------------------------------------
// RatingStars
// ---------------------------------------------------------------------------

export interface RatingStarsProps {
  value: number;       // 0–5, supports 0.5 steps
  onChange?(v: number): void;
  readonly?: boolean;
  size?: number;
  testID?: string;
}

export function RatingStars({ value, onChange, readonly = false, size = 28, testID }: RatingStarsProps): ReactElement {
  function rate(idx: number) {
    if (!onChange || readonly) return;
    onChange(idx);
  }

  return (
    <View testID={testID} style={rs.row}>
      {[1, 2, 3, 4, 5].map((i) => {
        const full = value >= i;
        const halfStar = !full && value >= i - 0.5;
        const sym = full ? SYM_STAR_FULL : halfStar ? SYM_STAR_HALF : SYM_STAR_EMPTY;
        return (
          <Pressable
            key={i}
            onPress={() => rate(i)}
            disabled={readonly}
            style={rs.star}
            accessibilityRole={readonly ? undefined : 'button'}
            accessibilityLabel={String(i)}
          >
            <RNText style={{ fontSize: size, color: full || halfStar ? '#F5A623' : color.border }}>{sym}</RNText>
          </Pressable>
        );
      })}
    </View>
  );
}
RatingStars.displayName = 'RatingStars';

const rs = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.xs },
  star: { minWidth: tokens.minTouch, minHeight: tokens.minTouch, alignItems: 'center', justifyContent: 'center' },
});

// ---------------------------------------------------------------------------
// TagInput
// ---------------------------------------------------------------------------

export interface TagInputProps {
  tags: string[];
  onChangeTags(tags: string[]): void;
  label?: string;
  placeholder?: string;
  /** Accessibility label for each remove button. Receives tag text as argument. */
  removeLabel?(tag: string): string;
  maxTags?: number;
  testID?: string;
}

export function TagInput({ tags, onChangeTags, label, placeholder, removeLabel, maxTags, testID }: TagInputProps): ReactElement {
  const [text, setText] = useState('');

  function commit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (maxTags && tags.length >= maxTags) return;
    if (!tags.includes(trimmed)) onChangeTags([...tags, trimmed]);
    setText('');
  }

  function remove(tag: string) {
    onChangeTags(tags.filter((t) => t !== tag));
  }

  return (
    <View testID={testID} style={ti.wrapper}>
      {label ? <RNText style={ti.label}>{label}</RNText> : null}
      <View style={ti.container}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={ti.tagsScroll}>
          <View style={ti.tags}>
            {tags.map((tag) => (
              <View key={tag} style={ti.tag}>
                <RNText style={ti.tagText}>{tag}</RNText>
                <Pressable
                  onPress={() => remove(tag)}
                  style={ti.removeBtn}
                  accessibilityRole="button"
                  accessibilityLabel={removeLabel ? removeLabel(tag) : tag}
                >
                  <RNText style={ti.removeText}>{SYM_CLOSE}</RNText>
                </Pressable>
              </View>
            ))}
          </View>
        </ScrollView>
        <TextInput
          style={ti.input}
          value={text}
          onChangeText={setText}
          onSubmitEditing={commit}
          onEndEditing={commit}
          placeholder={placeholder}
          placeholderTextColor={color.textMuted}
          returnKeyType="done"
          blurOnSubmit={false}
          editable={!maxTags || tags.length < maxTags}
        />
      </View>
    </View>
  );
}
TagInput.displayName = 'TagInput';

const ti = StyleSheet.create({
  wrapper: { gap: space.xs },
  label: { fontSize: font.size.caption, color: color.text },
  container: { borderWidth: 1, borderColor: color.border, borderRadius: radius.m, minHeight: tokens.minTouch, backgroundColor: color.bg, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', padding: space.xs },
  tagsScroll: { maxHeight: tokens.minTouch * 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, padding: space.xs },
  tag: { flexDirection: 'row', alignItems: 'center', backgroundColor: color.surface, borderRadius: radius.s, paddingHorizontal: space.s, paddingVertical: 2, gap: space.xs },
  tagText: { fontSize: font.size.caption, color: color.text },
  removeBtn: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  removeText: { fontSize: 14, color: color.textMuted, lineHeight: 18 },
  input: { flex: 1, minWidth: 80, paddingHorizontal: space.s, fontSize: font.size.body, color: color.text, minHeight: tokens.minTouch },
});
