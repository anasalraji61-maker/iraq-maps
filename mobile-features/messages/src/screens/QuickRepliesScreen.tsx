/**
 * QuickRepliesScreen — manage quick-reply templates for business messaging.
 *
 * Features:
 * - Create / edit / delete templates
 * - Template categories: greeting, prices, hours, directions, thanks
 * - Variables: {business_name}, {customer_name}, {date}
 * - Preview before save
 * - Reorder by drag (visual only in MVP) / frequency sort
 * - Delete unused templates
 */
import { Banner, EmptyState, Screen, Text } from '@iraq-maps/ui';
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  Text as RNText,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { t } from '../strings';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TemplateCategory = 'greeting' | 'prices' | 'hours' | 'directions' | 'thanks' | 'other';

export interface QuickReplyTemplate {
  id: string;
  category: TemplateCategory;
  label: string;
  text: string;
  usageCount: number;
  createdAt: string;
}

type SortMode = 'frequency' | 'recent' | 'alpha';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<TemplateCategory, string> = {
  greeting: '👋',
  prices: '💰',
  hours: '🕐',
  directions: '📍',
  thanks: '🙏',
  other: '💬',
};

const CATEGORY_KEYS: TemplateCategory[] = ['greeting', 'prices', 'hours', 'directions', 'thanks', 'other'];

const VARIABLES = ['{business_name}', '{customer_name}', '{date}'];

const DEFAULT_TEMPLATES: QuickReplyTemplate[] = [
  {
    id: 'default-1',
    category: 'greeting',
    label: t('quickReplies.defaults.greetingLabel'),
    text: t('quickReplies.defaults.greetingText'),
    usageCount: 12,
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 'default-2',
    category: 'hours',
    label: t('quickReplies.defaults.hoursLabel'),
    text: t('quickReplies.defaults.hoursText'),
    usageCount: 8,
    createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
  },
  {
    id: 'default-3',
    category: 'thanks',
    label: t('quickReplies.defaults.thanksLabel'),
    text: t('quickReplies.defaults.thanksText'),
    usageCount: 5,
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
  },
  {
    id: 'default-4',
    category: 'directions',
    label: t('quickReplies.defaults.directionsLabel'),
    text: t('quickReplies.defaults.directionsText'),
    usageCount: 3,
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveVariables(text: string, preview = false): string {
  if (!preview) return text;
  return text
    .replace(/\{business_name\}/g, t('quickReplies.preview.businessName'))
    .replace(/\{customer_name\}/g, t('quickReplies.preview.customerName'))
    .replace(/\{date\}/g, new Date().toLocaleDateString('ar'));
}

function sortTemplates(items: QuickReplyTemplate[], mode: SortMode): QuickReplyTemplate[] {
  const copy = [...items];
  if (mode === 'frequency') return copy.sort((a, b) => b.usageCount - a.usageCount);
  if (mode === 'recent') return copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (mode === 'alpha') return copy.sort((a, b) => a.label.localeCompare(b.label, 'ar'));
  return copy;
}

// ─── Category Chip ────────────────────────────────────────────────────────────

function CategoryChip({
  category,
  active,
  count,
  onPress,
}: {
  category: TemplateCategory | 'all';
  active: boolean;
  count: number;
  onPress: () => void;
}): ReactElement {
  const icon = category === 'all' ? '📋' : CATEGORY_ICONS[category];
  const label = category === 'all'
    ? t('quickReplies.filterAll')
    : t(`quickReplies.category.${category}` as Parameters<typeof t>[0]);
  return (
    <Pressable
      onPress={onPress}
      style={[catStyles.chip, active && catStyles.activeChip]}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <RNText style={catStyles.icon}>{icon}</RNText>
      <RNText style={[catStyles.label, active && catStyles.activeLabel]}>
        {label}
        {count > 0 ? ` (${count})` : ''}
      </RNText>
    </Pressable>
  );
}

const catStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
    marginEnd: 8,
  },
  activeChip: { backgroundColor: '#1976D2' },
  icon: { fontSize: 14 },
  label: { fontSize: 12, color: '#555', fontWeight: '500' },
  activeLabel: { color: '#FFF' },
});

// ─── Template Card ────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onEdit,
  onDelete,
  onUse,
}: {
  template: QuickReplyTemplate;
  onEdit: (t: QuickReplyTemplate) => void;
  onDelete: (id: string) => void;
  onUse: (t: QuickReplyTemplate) => void;
}): ReactElement {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={tcStyles.card} testID={`template-card-${template.id}`}>
      <Pressable onPress={() => setExpanded((v) => !v)} style={tcStyles.header}>
        <View style={tcStyles.headerLeft}>
          <RNText style={tcStyles.icon}>{CATEGORY_ICONS[template.category]}</RNText>
          <View style={{ flex: 1 }}>
            <RNText style={tcStyles.label} numberOfLines={1}>{template.label}</RNText>
            {!expanded ? (
              <RNText style={tcStyles.preview} numberOfLines={1}>{template.text}</RNText>
            ) : null}
          </View>
        </View>
        <View style={tcStyles.headerRight}>
          {template.usageCount > 0 ? (
            <View style={tcStyles.usageBadge}>
              <RNText style={tcStyles.usageText}>{template.usageCount}×</RNText>
            </View>
          ) : null}
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <RNText style={tcStyles.chevron}>{expanded ? '▲' : '▼'}</RNText>
        </View>
      </Pressable>

      {expanded ? (
        <View style={tcStyles.body}>
          <RNText style={tcStyles.fullText}>{template.text}</RNText>
          <View style={tcStyles.actions}>
            <Pressable onPress={() => onEdit(template)} style={tcStyles.actionBtn} accessibilityRole="button">
              <RNText style={tcStyles.actionEdit}>{t('quickReplies.edit')}</RNText>
            </Pressable>
            <Pressable onPress={() => onUse(template)} style={[tcStyles.actionBtn, tcStyles.useBtn]} accessibilityRole="button">
              <RNText style={tcStyles.actionUse}>{t('quickReplies.use')}</RNText>
            </Pressable>
            <Pressable onPress={() => onDelete(template.id)} style={tcStyles.actionBtn} accessibilityRole="button">
              <RNText style={tcStyles.actionDelete}>{t('quickReplies.delete')}</RNText>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const tcStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
  },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  icon: { fontSize: 20, width: 28, textAlign: 'center' },
  label: { fontSize: 14, fontWeight: '600', color: '#212121' },
  preview: { fontSize: 12, color: '#9E9E9E', marginTop: 1 },
  usageBadge: {
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  usageText: { fontSize: 11, color: '#1565C0', fontWeight: '600' },
  chevron: { fontSize: 11, color: '#BDBDBD' },
  body: {
    borderTopWidth: 1,
    borderTopColor: '#F5F5F5',
    padding: 12,
    gap: 10,
  },
  fullText: { fontSize: 13, color: '#424242', lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  actionEdit: { fontSize: 13, color: '#1976D2', fontWeight: '500' },
  actionUse: { fontSize: 13, color: '#FFF', fontWeight: '500' },
  actionDelete: { fontSize: 13, color: '#C62828', fontWeight: '500' },
  useBtn: { backgroundColor: '#1976D2' },
});

// ─── Edit / Create Modal ──────────────────────────────────────────────────────

function EditModal({
  visible,
  initial,
  onSave,
  onClose,
}: {
  visible: boolean;
  initial: Partial<QuickReplyTemplate> | null;
  onSave: (data: { label: string; text: string; category: TemplateCategory }) => void;
  onClose: () => void;
}): ReactElement {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [text, setText] = useState(initial?.text ?? '');
  const [category, setCategory] = useState<TemplateCategory>(initial?.category ?? 'greeting');
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (visible) {
      setLabel(initial?.label ?? '');
      setText(initial?.text ?? '');
      setCategory(initial?.category ?? 'greeting');
      setPreview(false);
    }
  }, [visible, initial]);

  const canSave = label.trim().length > 0 && text.trim().length > 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={emStyles.container}>
          {/* Header */}
          <View style={emStyles.header}>
            <Pressable onPress={onClose} accessibilityRole="button">
              <RNText style={emStyles.cancel}>{t('compose.cancel')}</RNText>
            </Pressable>
            <RNText style={emStyles.title}>
              {initial?.id ? t('quickReplies.editTitle') : t('quickReplies.createTitle')}
            </RNText>
            <Pressable
              onPress={() => canSave && onSave({ label: label.trim(), text: text.trim(), category })}
              disabled={!canSave}
              accessibilityRole="button"
            >
              <RNText style={[emStyles.save, !canSave && emStyles.saveDisabled]}>
                {t('quickReplies.save')}
              </RNText>
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={emStyles.body} keyboardShouldPersistTaps="handled">
            {/* Category picker */}
            <RNText style={emStyles.sectionLabel}>{t('quickReplies.categoryLabel')}</RNText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
                {CATEGORY_KEYS.map((cat) => (
                  <Pressable
                    key={cat}
                    onPress={() => setCategory(cat)}
                    style={[emStyles.catBtn, category === cat && emStyles.catBtnActive]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: category === cat }}
                  >
                    <RNText style={emStyles.catIcon}>{CATEGORY_ICONS[cat]}</RNText>
                    <RNText style={[emStyles.catLabel, category === cat && emStyles.catLabelActive]}>
                      {t(`quickReplies.category.${cat}` as Parameters<typeof t>[0])}
                    </RNText>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* Label */}
            <RNText style={emStyles.sectionLabel}>{t('quickReplies.labelField')}</RNText>
            <TextInput
              style={emStyles.input}
              value={label}
              onChangeText={setLabel}
              placeholder={t('quickReplies.labelPlaceholder')}
              maxLength={60}
              accessibilityLabel={t('quickReplies.labelField')}
            />

            {/* Template text */}
            <RNText style={emStyles.sectionLabel}>{t('quickReplies.textField')}</RNText>
            <TextInput
              style={[emStyles.input, emStyles.textarea]}
              value={text}
              onChangeText={setText}
              placeholder={t('quickReplies.textPlaceholder')}
              multiline
              numberOfLines={5}
              maxLength={500}
              textAlignVertical="top"
              accessibilityLabel={t('quickReplies.textField')}
            />
            <RNText style={emStyles.charCount}>{text.length}/500</RNText>

            {/* Variable chips */}
            <RNText style={emStyles.sectionLabel}>{t('quickReplies.variablesLabel')}</RNText>
            <View style={emStyles.varRow}>
              {VARIABLES.map((v) => (
                <Pressable
                  key={v}
                  onPress={() => setText((prev) => prev + v)}
                  style={emStyles.varChip}
                  accessibilityRole="button"
                  accessibilityLabel={t('quickReplies.insertVariable', { variable: v })}
                >
                  <RNText style={emStyles.varChipText}>{v}</RNText>
                </Pressable>
              ))}
            </View>

            {/* Preview toggle */}
            <Pressable
              onPress={() => setPreview((v) => !v)}
              style={emStyles.previewBtn}
              accessibilityRole="switch"
              accessibilityState={{ checked: preview }}
            >
              <RNText style={emStyles.previewBtnText}>
                {preview ? t('quickReplies.hidePreview') : t('quickReplies.showPreview')}
              </RNText>
            </Pressable>

            {preview && text.length > 0 ? (
              <View style={emStyles.previewBox}>
                <RNText style={emStyles.previewLabel}>{t('quickReplies.previewLabel')}</RNText>
                <RNText style={emStyles.previewText}>{resolveVariables(text, true)}</RNText>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const emStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  title: { fontSize: 16, fontWeight: '700', color: '#212121' },
  cancel: { fontSize: 15, color: '#757575' },
  save: { fontSize: 15, color: '#1976D2', fontWeight: '600' },
  saveDisabled: { color: '#BDBDBD' },
  body: { padding: 16, gap: 4 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#757575',
    marginTop: 12,
    marginBottom: 6,
  },
  catBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
  },
  catBtnActive: { backgroundColor: '#1976D2' },
  catIcon: { fontSize: 16 },
  catLabel: { fontSize: 12, color: '#555', fontWeight: '500' },
  catLabelActive: { color: '#FFF' },
  input: {
    backgroundColor: '#FFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    padding: 12,
    fontSize: 14,
    color: '#212121',
  },
  textarea: { minHeight: 100 },
  charCount: { fontSize: 11, color: '#BDBDBD', textAlign: 'auto' as const, marginTop: 2 },
  varRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  varChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#7B1FA2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#F3E5F5',
  },
  varChipText: { fontSize: 12, color: '#7B1FA2', fontFamily: 'monospace' },
  previewBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#E3F2FD',
  },
  previewBtnText: { fontSize: 13, color: '#1565C0', fontWeight: '500' },
  previewBox: {
    marginTop: 10,
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A5D6A7',
    padding: 12,
  },
  previewLabel: { fontSize: 11, color: '#2E7D32', fontWeight: '600', marginBottom: 4 },
  previewText: { fontSize: 14, color: '#212121', lineHeight: 22 },
});

// ─── Sort Picker ──────────────────────────────────────────────────────────────

function SortPicker({
  current,
  onChange,
}: {
  current: SortMode;
  onChange: (m: SortMode) => void;
}): ReactElement {
  const MODES: SortMode[] = ['frequency', 'recent', 'alpha'];
  return (
    <View style={spStyles.row}>
      <RNText style={spStyles.label}>{t('quickReplies.sortBy')}</RNText>
      {MODES.map((m) => (
        <Pressable
          key={m}
          onPress={() => onChange(m)}
          style={[spStyles.btn, current === m && spStyles.btnActive]}
          accessibilityRole="radio"
          accessibilityState={{ checked: current === m }}
        >
          <RNText style={[spStyles.btnText, current === m && spStyles.btnTextActive]}>
            {t(`quickReplies.sort.${m}` as Parameters<typeof t>[0])}
          </RNText>
        </Pressable>
      ))}
    </View>
  );
}

const spStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  label: { fontSize: 12, color: '#757575', marginEnd: 4 },
  btn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: '#F0F0F0',
  },
  btnActive: { backgroundColor: '#E3F2FD' },
  btnText: { fontSize: 12, color: '#555' },
  btnTextActive: { fontSize: 12, color: '#1565C0', fontWeight: '600' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function QuickRepliesScreen(): ReactElement {
  const [templates, setTemplates] = useState<QuickReplyTemplate[]>(DEFAULT_TEMPLATES);
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | 'all'>('all');
  const [sortMode, setSortMode] = useState<SortMode>('frequency');
  const [editTarget, setEditTarget] = useState<Partial<QuickReplyTemplate> | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [error, _setError] = useState<string | undefined>();

  const categoryCounts = useCallback(
    (cat: TemplateCategory | 'all') =>
      cat === 'all'
        ? templates.length
        : templates.filter((t2) => t2.category === cat).length,
    [templates],
  );

  const displayed = useMemo(() => {
    const filtered = activeCategory === 'all'
      ? templates
      : templates.filter((t2) => t2.category === activeCategory);
    return sortTemplates(filtered, sortMode);
  }, [templates, activeCategory, sortMode]);

  const handleSave = (data: { label: string; text: string; category: TemplateCategory }) => {
    if (editTarget?.id) {
      // Edit
      setTemplates((prev) =>
        prev.map((tmpl) =>
          tmpl.id === editTarget.id ? { ...tmpl, ...data } : tmpl,
        ),
      );
    } else {
      // Create
      const newTemplate: QuickReplyTemplate = {
        id: `qr-${Date.now()}`,
        ...data,
        usageCount: 0,
        createdAt: new Date().toISOString(),
      };
      setTemplates((prev) => [newTemplate, ...prev]);
    }
    setShowEditModal(false);
    setEditTarget(null);
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      t('quickReplies.deleteConfirmTitle'),
      t('quickReplies.deleteConfirmBody'),
      [
        { text: t('compose.cancel'), style: 'cancel' },
        {
          text: t('quickReplies.delete'),
          style: 'destructive',
          onPress: () => setTemplates((prev) => prev.filter((t2) => t2.id !== id)),
        },
      ],
    );
  };

  const handleUse = (template: QuickReplyTemplate) => {
    // Increment usage count; in real app this would also insert into compose bar
    setTemplates((prev) =>
      prev.map((t2) => (t2.id === template.id ? { ...t2, usageCount: t2.usageCount + 1 } : t2)),
    );
  };

  return (
    <Screen>
      {/* Header */}
      <View style={mainStyles.headerRow}>
        <Text variant="title">{t('quickReplies.title')}</Text>
        <Pressable
          style={mainStyles.addBtn}
          onPress={() => { setEditTarget(null); setShowEditModal(true); }}
          accessibilityRole="button"
          accessibilityLabel={t('quickReplies.create')}
          testID="create-template-btn"
        >
          <RNText style={mainStyles.addBtnText}>+ {t('quickReplies.create')}</RNText>
        </Pressable>
      </View>

      {error ? <Banner kind="error" message={error} /> : null}

      {/* Category filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
        <View style={{ flexDirection: 'row', paddingVertical: 4 }}>
          <CategoryChip
            category="all"
            active={activeCategory === 'all'}
            count={categoryCounts('all')}
            onPress={() => setActiveCategory('all')}
          />
          {CATEGORY_KEYS.map((cat) => (
            <CategoryChip
              key={cat}
              category={cat}
              active={activeCategory === cat}
              count={categoryCounts(cat)}
              onPress={() => setActiveCategory(cat)}
            />
          ))}
        </View>
      </ScrollView>

      {/* Sort */}
      <SortPicker current={sortMode} onChange={setSortMode} />

      {/* List */}
      <ScrollView showsVerticalScrollIndicator={false}>
        {displayed.length === 0 ? (
          <EmptyState
            title={t('quickReplies.empty')}
            body={t('quickReplies.emptyBody')}
            action={{ label: t('quickReplies.create'), onPress: () => { setEditTarget(null); setShowEditModal(true); } }}
          />
        ) : null}
        {displayed.map((tmpl: QuickReplyTemplate) => (
          <TemplateCard
            key={tmpl.id}
            template={tmpl}
            onEdit={(t2) => { setEditTarget(t2); setShowEditModal(true); }}
            onDelete={handleDelete}
            onUse={handleUse}
          />
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Edit / Create modal */}
      <EditModal
        visible={showEditModal}
        initial={editTarget}
        onSave={handleSave}
        onClose={() => { setShowEditModal(false); setEditTarget(null); }}
      />
    </Screen>
  );
}

const mainStyles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  addBtn: {
    backgroundColor: '#1976D2',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addBtnText: { fontSize: 13, color: '#FFF', fontWeight: '600' },
});
