/**
 * POICategoryFilter – rich multi-select POI category chip strip.
 *
 * Features:
 * - 20+ category chips with emoji icons
 * - Multi-select with All / None shortcuts
 * - Grouped into: Food & Drink, Transportation, Shopping, Services, Culture
 * - Count badge per category (from props)
 * - Save/load filter presets
 * - Top-6 quick-filter bar on the map
 *
 * RTL-safe (start/end), Arabic-first via t().
 */
/* eslint-disable i18next/no-literal-string, no-restricted-syntax */

import type { PlaceCategory } from '@iraq-maps/contracts';
import { tokens } from '@iraq-maps/ui';
import { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { t } from '../strings';

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export interface CategoryMeta {
  id: PlaceCategory | string;
  icon: string;
  group: CategoryGroup;
  priority: number; // lower = more prominent in the quick bar
}

type CategoryGroup = 'food' | 'transport' | 'shopping' | 'services' | 'culture' | 'other';

const GROUP_ORDER: CategoryGroup[] = ['food', 'transport', 'shopping', 'services', 'culture', 'other'];

const GROUP_LABELS: Record<CategoryGroup, string> = {
  food: 'categoryFilter.groupFood',
  transport: 'categoryFilter.groupTransport',
  shopping: 'categoryFilter.groupShopping',
  services: 'categoryFilter.groupServices',
  culture: 'categoryFilter.groupCulture',
  other: 'categoryFilter.groupOther',
};

export const CATEGORY_META: CategoryMeta[] = [
  // Food & Drink
  { id: 'food', icon: '🍽️', group: 'food', priority: 1 },
  { id: 'cafe', icon: '☕', group: 'food', priority: 2 },
  { id: 'bakery', icon: '🥖', group: 'food', priority: 5 },
  { id: 'fastfood', icon: '🌮', group: 'food', priority: 4 },
  { id: 'dessert', icon: '🍦', group: 'food', priority: 6 },
  { id: 'juice', icon: '🥤', group: 'food', priority: 7 },
  // Transport
  { id: 'transport', icon: '🚌', group: 'transport', priority: 3 },
  { id: 'fuel', icon: '⛽', group: 'transport', priority: 2 },
  { id: 'parking', icon: '🅿️', group: 'transport', priority: 5 },
  { id: 'taxi', icon: '🚕', group: 'transport', priority: 4 },
  // Shopping
  { id: 'shopping', icon: '🛍️', group: 'shopping', priority: 4 },
  { id: 'supermarket', icon: '🏪', group: 'shopping', priority: 3 },
  { id: 'pharmacy', icon: '💊', group: 'services', priority: 3 },
  { id: 'electronics', icon: '📱', group: 'shopping', priority: 6 },
  { id: 'clothing', icon: '👗', group: 'shopping', priority: 7 },
  // Services
  { id: 'health', icon: '🏥', group: 'services', priority: 1 },
  { id: 'finance', icon: '🏦', group: 'services', priority: 2 },
  { id: 'education', icon: '🏫', group: 'services', priority: 4 },
  { id: 'government', icon: '🏛️', group: 'services', priority: 5 },
  { id: 'lodging', icon: '🏨', group: 'services', priority: 6 },
  { id: 'office', icon: '🏢', group: 'services', priority: 7 },
  // Culture
  { id: 'tourism', icon: '🗺️', group: 'culture', priority: 1 },
  { id: 'worship', icon: '🕌', group: 'culture', priority: 2 },
  { id: 'entertainment', icon: '🎭', group: 'culture', priority: 3 },
  { id: 'park', icon: '🌳', group: 'culture', priority: 4 },
  { id: 'sport', icon: '⚽', group: 'culture', priority: 5 },
];

// Top-6 by lowest priority number (cross-group)
export const QUICK_CATEGORIES: CategoryMeta[] = [...CATEGORY_META]
  .sort((a, b) => a.priority - b.priority)
  .slice(0, 6);

// ---------------------------------------------------------------------------
// Saved preset
// ---------------------------------------------------------------------------

export interface FilterPreset {
  id: string;
  name: string;
  selected: string[];
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface POICategoryFilterProps {
  /** Currently selected category IDs. */
  selected: string[];
  /** Counts per category ID (optional). */
  counts?: Record<string, number>;
  /** Saved presets to display / manage. */
  presets?: FilterPreset[];
  /** Called whenever selection changes. */
  onChange: (selected: string[]) => void;
  /** Called to save current selection as a named preset. */
  onSavePreset?: (name: string, selected: string[]) => void;
  /** Called to delete a saved preset. */
  onDeletePreset?: (id: string) => void;
  /** If true, renders in compact quick-bar mode (top-6 only). */
  quickBar?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function POICategoryFilter({
  selected,
  counts = {},
  presets = [],
  onChange,
  onSavePreset,
  onDeletePreset,
  quickBar = false,
}: POICategoryFilterProps) {
  const [fullVisible, setFullVisible] = useState(false);
  const [saveVisible, setSaveVisible] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggle = useCallback(
    (id: string) => {
      const next = new Set(selectedSet);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onChange(Array.from(next));
    },
    [selectedSet, onChange],
  );

  const selectAll = () => onChange(CATEGORY_META.map((c) => c.id));
  const selectNone = () => onChange([]);

  const handleSavePreset = () => {
    if (!newPresetName.trim()) return;
    onSavePreset?.(newPresetName.trim(), selected);
    setSaveVisible(false);
    setNewPresetName('');
  };

  if (quickBar) {
    return (
      <View style={pf.quickBar}>
        {QUICK_CATEGORIES.map((cat) => {
          const active = selectedSet.has(cat.id);
          const count = counts[cat.id];
          return (
            <Pressable
              key={cat.id}
              onPress={() => toggle(cat.id)}
              style={[pf.quickChip, active && pf.quickChipActive]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              accessibilityLabel={t(`categories.${cat.id}` as Parameters<typeof t>[0])}
            >
              <RNText style={pf.quickIcon}>{cat.icon}</RNText>
              {count !== undefined && count > 0 && (
                <View style={[pf.countBadge, active && pf.countBadgeActive]}>
                  <RNText style={[pf.countBadgeText, active && pf.countBadgeTextActive]}>
                    {count > 99 ? '99+' : String(count)}
                  </RNText>
                </View>
              )}
            </Pressable>
          );
        })}
        <Pressable onPress={() => setFullVisible(true)} style={pf.moreBtn} accessibilityRole="button">
          <RNText style={pf.moreBtnText}>{t('categoryFilter.more')}</RNText>
        </Pressable>

        {/* Full filter modal */}
        <FullFilterModal
          visible={fullVisible}
          selected={selected}
          counts={counts}
          presets={presets}
          onClose={() => setFullVisible(false)}
          onChange={onChange}
          onSavePreset={onSavePreset}
          onDeletePreset={onDeletePreset}
        />
      </View>
    );
  }

  return (
    <View style={pf.container}>
      {/* Shortcut row */}
      <View style={pf.shortcutRow}>
        <Pressable onPress={selectAll} style={pf.shortcutBtn} accessibilityRole="button">
          <RNText style={pf.shortcutText}>{t('categoryFilter.all')}</RNText>
        </Pressable>
        <Pressable onPress={selectNone} style={pf.shortcutBtn} accessibilityRole="button">
          <RNText style={pf.shortcutText}>{t('categoryFilter.clear')}</RNText>
        </Pressable>
        {onSavePreset && (
          <Pressable onPress={() => setSaveVisible(true)} style={pf.shortcutBtn} accessibilityRole="button">
            <RNText style={pf.shortcutText}>{t('layers.saveAsPreset')}</RNText>
          </Pressable>
        )}
      </View>

      {/* Presets */}
      {presets.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={pf.presetRow}
          style={pf.presetScroll}
        >
          {presets.map((preset) => (
            <View key={preset.id} style={pf.presetChipWrap}>
              <Pressable
                onPress={() => onChange(preset.selected)}
                style={pf.presetChip}
                accessibilityRole="button"
              >
                <RNText style={pf.presetChipText}>{preset.name}</RNText>
              </Pressable>
              {onDeletePreset && (
                <Pressable
                  onPress={() => onDeletePreset(preset.id)}
                  style={pf.presetX}
                  accessibilityLabel={t('layers.deletePresetA11y')}
                >
                  <RNText style={pf.presetXText}>✕</RNText>
                </Pressable>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Groups */}
      <ScrollView style={pf.groupScroll} contentContainerStyle={pf.groupContent}>
        {GROUP_ORDER.map((group) => {
          const cats = CATEGORY_META.filter((c) => c.group === group);
          if (!cats.length) return null;
          return (
            <View key={group} style={pf.group}>
              <RNText style={pf.groupLabel}>
                {t(GROUP_LABELS[group] as Parameters<typeof t>[0])}
              </RNText>
              <View style={pf.chipWrap}>
                {cats.map((cat) => {
                  const active = selectedSet.has(cat.id);
                  const count = counts[cat.id];
                  return (
                    <CategoryChip
                      key={cat.id}
                      cat={cat}
                      active={active}
                      count={count}
                      onPress={() => toggle(cat.id)}
                    />
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Save preset modal */}
      <Modal
        visible={saveVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSaveVisible(false)}
      >
        <Pressable style={pf.modalOverlay} onPress={() => setSaveVisible(false)}>
          <View style={pf.saveSheet}>
            <RNText style={pf.saveTitle}>{t('layers.savePresetTitle')}</RNText>
            <View style={pf.saveInputHint}>
              <RNText style={pf.saveInputHintText}>
                {t('categoryFilter.presetHint', { count: selected.length })}
              </RNText>
            </View>
            <View style={pf.saveBtnRow}>
              <Pressable onPress={() => setSaveVisible(false)} style={pf.saveBtn}>
                <RNText style={pf.saveBtnText}>{t('actions.close')}</RNText>
              </Pressable>
              <Pressable
                onPress={handleSavePreset}
                style={[pf.saveBtn, pf.saveBtnPrimary]}
                accessibilityRole="button"
              >
                <RNText style={[pf.saveBtnText, pf.saveBtnPrimaryText]}>{t('layers.savePreset')}</RNText>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// CategoryChip
// ---------------------------------------------------------------------------

interface CategoryChipProps {
  cat: CategoryMeta;
  active: boolean;
  count?: number;
  onPress: () => void;
}

function CategoryChip({ cat, active, count, onPress }: CategoryChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[pf.chip, active && pf.chipActive]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: active }}
      accessibilityLabel={t(`categories.${cat.id}` as Parameters<typeof t>[0])}
    >
      <RNText style={pf.chipIcon}>{cat.icon}</RNText>
      <RNText style={[pf.chipLabel, active && pf.chipLabelActive]}>
        {t(`categories.${cat.id}` as Parameters<typeof t>[0])}
      </RNText>
      {count !== undefined && count > 0 && (
        <View style={[pf.countBadge, active && pf.countBadgeActive]}>
          <RNText style={[pf.countBadgeText, active && pf.countBadgeTextActive]}>
            {count > 99 ? '99+' : String(count)}
          </RNText>
        </View>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// FullFilterModal (used from quickBar)
// ---------------------------------------------------------------------------

interface FullFilterModalProps {
  visible: boolean;
  selected: string[];
  counts: Record<string, number>;
  presets: FilterPreset[];
  onClose: () => void;
  onChange: (selected: string[]) => void;
  onSavePreset?: (name: string, selected: string[]) => void;
  onDeletePreset?: (id: string) => void;
}

function FullFilterModal({
  visible,
  selected,
  counts,
  presets,
  onClose,
  onChange,
  onSavePreset,
  onDeletePreset,
}: FullFilterModalProps) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={pf.fullModal}>
        <View style={pf.fullHeader}>
          <RNText style={pf.fullTitle}>{t('categoryFilter.label')}</RNText>
          <Pressable onPress={onClose} style={pf.fullClose} accessibilityLabel={t('actions.close')}>
            <RNText style={pf.fullCloseText}>✕</RNText>
          </Pressable>
        </View>
        <POICategoryFilter
          selected={selected}
          counts={counts}
          presets={presets}
          onChange={onChange}
          onSavePreset={onSavePreset}
          onDeletePreset={onDeletePreset}
        />
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const pf = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  shortcutRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
  },
  shortcutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  shortcutText: { fontSize: 13, color: tokens.color.primary, fontWeight: '600' },
  presetScroll: { maxHeight: 48 },
  presetRow: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  presetChipWrap: { flexDirection: 'row', alignItems: 'center' },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  presetChipText: { fontSize: 12, color: tokens.color.text },
  presetX: { marginStart: 4, padding: 4 },
  presetXText: { fontSize: 11, color: tokens.color.textMuted },
  groupScroll: { flex: 1 },
  groupContent: { padding: 16, gap: 16 },
  group: {},
  groupLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: tokens.color.textMuted,
    textTransform: 'uppercase',
    marginBottom: 8,
    writingDirection: 'rtl',
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    gap: 4,
  },
  chipActive: { backgroundColor: tokens.color.primary, borderColor: tokens.color.primary },
  chipIcon: { fontSize: 14 },
  chipLabel: { fontSize: 13, color: tokens.color.text, writingDirection: 'rtl' },
  chipLabelActive: { color: '#fff', fontWeight: '600' },
  countBadge: {
    backgroundColor: tokens.color.border,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
  },
  countBadgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  countBadgeText: { fontSize: 10, color: tokens.color.textMuted, fontWeight: '700' },
  countBadgeTextActive: { color: '#fff' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  saveSheet: {
    backgroundColor: tokens.color.surface,
    borderTopStartRadius: 20,
    borderTopEndRadius: 20,
    padding: 24,
    gap: 12,
  },
  saveTitle: { fontSize: 17, fontWeight: '700', color: tokens.color.text, writingDirection: 'rtl' },
  saveInputHint: {},
  saveInputHintText: { fontSize: 13, color: tokens.color.textMuted },
  saveBtnRow: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  saveBtnPrimary: { backgroundColor: tokens.color.primary, borderColor: tokens.color.primary },
  saveBtnText: { fontSize: 14, color: tokens.color.text },
  saveBtnPrimaryText: { color: '#fff', fontWeight: '600' },
  // Quick bar
  quickBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
    backgroundColor: tokens.color.surface,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
  },
  quickChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.color.bg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: tokens.color.border,
    position: 'relative',
  },
  quickChipActive: { backgroundColor: tokens.color.primary, borderColor: tokens.color.primary },
  quickIcon: { fontSize: 18 },
  moreBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.bg,
  },
  moreBtnText: { fontSize: 12, color: tokens.color.primary, fontWeight: '600' },
  fullModal: { flex: 1, backgroundColor: tokens.color.bg },
  fullHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  fullTitle: { fontSize: 17, fontWeight: '700', color: tokens.color.text, writingDirection: 'rtl' },
  fullClose: { padding: 6 },
  fullCloseText: { fontSize: 18, color: tokens.color.textMuted },
});
