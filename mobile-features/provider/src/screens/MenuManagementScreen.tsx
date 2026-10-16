/**
 * MenuManagementScreen — full menu builder for restaurants / cafés.
 * Supports sections, items (AR/EN name, description, price in IQD, photo),
 * out-of-stock toggle, seasonal/limited-time badges, drag-to-reorder,
 * bulk price update, photo import stub, customer preview, and PDF export stub.
 */
/* eslint-disable i18next/no-literal-string, no-restricted-syntax */
import { EmptyState } from '@iraq-maps/ui';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  Alert,
  I18nManager,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../strings';

I18nManager.forceRTL(true);

const PRIMARY = '#1976D2';
const DANGER = '#EF4444';
const SUCCESS = '#16A34A';
const WARN = '#D97706';
const SURFACE = '#FFFFFF';
const BG = '#F5F5F5';
const BORDER = '#E0E0E0';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MenuItem {
  id: string;
  nameAr: string;
  nameEn: string;
  descAr: string;
  descEn: string;
  price: number; // IQD
  photoUrl?: string;
  outOfStock: boolean;
  seasonal: boolean;
  limitedTime: boolean;
}

export interface MenuSection {
  id: string;
  nameAr: string;
  nameEn: string;
  items: MenuItem[];
}

// ─── Mock initial state ───────────────────────────────────────────────────────

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const INITIAL_SECTIONS: MenuSection[] = [
  {
    id: makeId(),
    nameAr: 'المقبلات',
    nameEn: 'Appetizers',
    items: [
      { id: makeId(), nameAr: 'حمص', nameEn: 'Hummus', descAr: 'حمص طازج مع زيت الزيتون', descEn: 'Fresh hummus with olive oil', price: 5000, outOfStock: false, seasonal: false, limitedTime: false },
      { id: makeId(), nameAr: 'فتوش', nameEn: 'Fattoush', descAr: 'سلطة فتوش بالخضار الطازجة', descEn: 'Fresh vegetable fattoush salad', price: 4000, outOfStock: false, seasonal: false, limitedTime: false },
    ],
  },
  {
    id: makeId(),
    nameAr: 'الأطباق الرئيسية',
    nameEn: 'Main Dishes',
    items: [
      { id: makeId(), nameAr: 'دجاج مشوي', nameEn: 'Grilled Chicken', descAr: 'دجاج مشوي مع الخضار', descEn: 'Grilled chicken with vegetables', price: 18000, outOfStock: false, seasonal: false, limitedTime: false },
      { id: makeId(), nameAr: 'كباب', nameEn: 'Kebab', descAr: 'كباب لحم مع الأرز', descEn: 'Meat kebab with rice', price: 20000, outOfStock: true, seasonal: false, limitedTime: false },
    ],
  },
];

// ─── Item form ────────────────────────────────────────────────────────────────

interface ItemFormState {
  nameAr: string;
  nameEn: string;
  descAr: string;
  descEn: string;
  price: string;
  outOfStock: boolean;
  seasonal: boolean;
  limitedTime: boolean;
}

const emptyItem = (): ItemFormState => ({
  nameAr: '', nameEn: '', descAr: '', descEn: '', price: '', outOfStock: false, seasonal: false, limitedTime: false,
});

function itemToForm(item: MenuItem): ItemFormState {
  return { ...item, price: String(item.price) };
}

function formToItem(id: string, form: ItemFormState): MenuItem {
  return { id, nameAr: form.nameAr.trim(), nameEn: form.nameEn.trim(), descAr: form.descAr.trim(), descEn: form.descEn.trim(), price: Math.max(0, parseInt(form.price, 10) || 0), outOfStock: form.outOfStock, seasonal: form.seasonal, limitedTime: form.limitedTime };
}

// ─── Badge row ────────────────────────────────────────────────────────────────

function ItemBadges({ item }: { item: MenuItem }): ReactElement | null {
  if (!item.outOfStock && !item.seasonal && !item.limitedTime) return null;
  return (
    <View style={styles.badgeRow}>
      {item.outOfStock && <View style={[styles.badge, styles.badgeDanger]}><Text style={styles.badgeText}>نفد المخزون</Text></View>}
      {item.seasonal && <View style={[styles.badge, styles.badgeWarn]}><Text style={styles.badgeText}>{t('menu.seasonal')}</Text></View>}
      {item.limitedTime && <View style={[styles.badge, styles.badgePrimary]}><Text style={styles.badgeText}>{t('menu.limitedTime')}</Text></View>}
    </View>
  );
}

// ─── Item card ────────────────────────────────────────────────────────────────

function MenuItemCard({ item, onEdit, onDelete, onToggleStock }: { item: MenuItem; onEdit: () => void; onDelete: () => void; onToggleStock: () => void }): ReactElement {
  return (
    <View style={[styles.itemCard, item.outOfStock && styles.itemCardOOS]}>
      <View style={styles.itemCardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.itemName}>{item.nameAr}</Text>
          {item.nameEn ? <Text style={styles.itemNameEn}>{item.nameEn}</Text> : null}
          {item.descAr ? <Text style={styles.itemDesc} numberOfLines={2}>{item.descAr}</Text> : null}
          <ItemBadges item={item} />
        </View>
        <View style={styles.itemRight}>
          <Text style={styles.itemPrice}>{t('menu.priceFormat', { price: item.price.toLocaleString('ar-IQ') })}</Text>
          <Switch
            value={!item.outOfStock}
            onValueChange={onToggleStock}
            trackColor={{ false: BORDER, true: SUCCESS }}
            thumbColor={SURFACE}
            accessibilityLabel={t('menu.outOfStock')}
          />
        </View>
      </View>
      <View style={styles.itemActions}>
        <TouchableOpacity style={styles.itemActionBtn} onPress={onEdit} accessibilityRole="button">
          <Text style={[styles.itemActionText, { color: PRIMARY }]}>✎ {t('menu.editItem')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.itemActionBtn} onPress={onDelete} accessibilityRole="button">
          <Text style={[styles.itemActionText, { color: DANGER }]}>✕ {t('menu.deleteItem')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Item form modal ──────────────────────────────────────────────────────────

function ItemFormModal({ visible, initial, onSave, onCancel }: { visible: boolean; initial: ItemFormState | null; onSave: (form: ItemFormState) => void; onCancel: () => void }): ReactElement {
  const [form, setForm] = useState<ItemFormState>(initial ?? emptyItem());

  useEffect(() => { if (visible) setForm(initial ?? emptyItem()); }, [visible, initial]);

  const set = useCallback(<K extends keyof ItemFormState>(k: K, v: ItemFormState[K]) => {
    setForm(f => ({ ...f, [k]: v }));
  }, []);

  const handleSave = useCallback(() => {
    if (!form.nameAr.trim()) { Alert.alert(t('menu.itemNameAr')); return; }
    if (!form.price || isNaN(parseInt(form.price, 10))) { Alert.alert(t('menu.itemPrice')); return; }
    onSave(form);
  }, [form, onSave]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onCancel}><Text style={styles.modalCancel}>{t('menu.cancel')}</Text></TouchableOpacity>
          <Text style={styles.modalTitle}>{initial ? t('menu.editItem') : t('menu.addItem')}</Text>
          <TouchableOpacity onPress={handleSave}><Text style={styles.modalSave}>{t('menu.save')}</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
          <Text style={styles.fieldLabel}>{t('menu.itemNameAr')} *</Text>
          <TextInput style={styles.input} value={form.nameAr} onChangeText={v => set('nameAr', v)} placeholder={t('menu.itemPlaceholderAr')} textAlign="right" />
          <Text style={styles.fieldLabel}>{t('menu.itemNameEn')}</Text>
          <TextInput style={styles.input} value={form.nameEn} onChangeText={v => set('nameEn', v)} placeholder={t('menu.itemPlaceholderEn')} textAlign="left" />
          <Text style={styles.fieldLabel}>{t('menu.itemDescAr')}</Text>
          <TextInput style={[styles.input, styles.textarea]} value={form.descAr} onChangeText={v => set('descAr', v)} multiline numberOfLines={3} textAlign="right" />
          <Text style={styles.fieldLabel}>{t('menu.itemDescEn')}</Text>
          <TextInput style={[styles.input, styles.textarea]} value={form.descEn} onChangeText={v => set('descEn', v)} multiline numberOfLines={3} textAlign="left" />
          <Text style={styles.fieldLabel}>{t('menu.itemPrice')} *</Text>
          <TextInput style={styles.input} value={form.price} onChangeText={v => set('price', v)} keyboardType="numeric" placeholder="25000" />
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t('menu.outOfStock')}</Text>
            <Switch value={form.outOfStock} onValueChange={v => set('outOfStock', v)} trackColor={{ false: BORDER, true: DANGER }} thumbColor={SURFACE} />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t('menu.seasonal')}</Text>
            <Switch value={form.seasonal} onValueChange={v => set('seasonal', v)} trackColor={{ false: BORDER, true: WARN }} thumbColor={SURFACE} />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t('menu.limitedTime')}</Text>
            <Switch value={form.limitedTime} onValueChange={v => set('limitedTime', v)} trackColor={{ false: BORDER, true: PRIMARY }} thumbColor={SURFACE} />
          </View>
          <View style={styles.photoStub}>
            <Text style={styles.photoStubText}>📷 {t('menu.importPhotoComing')}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Section form modal ───────────────────────────────────────────────────────

function SectionFormModal({ visible, initial, onSave, onCancel }: { visible: boolean; initial: { nameAr: string; nameEn: string } | null; onSave: (nameAr: string, nameEn: string) => void; onCancel: () => void }): ReactElement {
  const [nameAr, setNameAr] = useState(initial?.nameAr ?? '');
  const [nameEn, setNameEn] = useState(initial?.nameEn ?? '');

  useEffect(() => { if (visible) { setNameAr(initial?.nameAr ?? ''); setNameEn(initial?.nameEn ?? ''); } }, [visible, initial]);

  const handleSave = useCallback(() => {
    if (!nameAr.trim()) { Alert.alert(t('menu.sectionNameAr')); return; }
    onSave(nameAr.trim(), nameEn.trim());
  }, [nameAr, nameEn, onSave]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.overlayBg}>
        <View style={styles.overlayCard}>
          <Text style={styles.overlayTitle}>{initial ? t('menu.editSection') : t('menu.addSection')}</Text>
          <Text style={styles.fieldLabel}>{t('menu.sectionNameAr')} *</Text>
          <TextInput style={styles.input} value={nameAr} onChangeText={setNameAr} placeholder={t('menu.sectionPlaceholderAr')} textAlign="right" />
          <Text style={styles.fieldLabel}>{t('menu.sectionNameEn')}</Text>
          <TextInput style={styles.input} value={nameEn} onChangeText={setNameEn} placeholder={t('menu.sectionPlaceholderEn')} textAlign="left" />
          <View style={styles.overlayActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}><Text style={styles.cancelBtnText}>{t('menu.cancel')}</Text></TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}><Text style={styles.saveBtnText}>{t('menu.save')}</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Bulk price modal ─────────────────────────────────────────────────────────

function BulkPriceModal({ visible, onApply, onCancel }: { visible: boolean; onApply: (pct: number) => void; onCancel: () => void }): ReactElement {
  const [pct, setPct] = useState('');

  useEffect(() => { if (visible) setPct(''); }, [visible]);

  const handleApply = useCallback(() => {
    const n = parseFloat(pct);
    if (isNaN(n) || n === 0) { Alert.alert(t('menu.bulkPriceFactor')); return; }
    Alert.alert(
      t('menu.bulkPriceUpdate'),
      t('menu.bulkPriceConfirm', { pct: n }),
      [
        { text: t('menu.cancel'), style: 'cancel' },
        { text: t('menu.bulkPriceApply'), onPress: () => onApply(n) },
      ],
    );
  }, [pct, onApply]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.overlayBg}>
        <View style={styles.overlayCard}>
          <Text style={styles.overlayTitle}>{t('menu.bulkPriceUpdate')}</Text>
          <Text style={styles.fieldLabel}>{t('menu.bulkPriceFactor')}</Text>
          <TextInput style={styles.input} value={pct} onChangeText={setPct} keyboardType="numeric" placeholder="10" />
          <View style={styles.overlayActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}><Text style={styles.cancelBtnText}>{t('menu.cancel')}</Text></TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleApply}><Text style={styles.saveBtnText}>{t('menu.bulkPriceApply')}</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Customer preview modal ───────────────────────────────────────────────────

function PreviewModal({ visible, sections, onClose }: { visible: boolean; sections: MenuSection[]; onClose: () => void }): ReactElement {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
        <View style={styles.previewHeader}>
          <Text style={styles.previewTitle}>{t('menu.previewTitle')}</Text>
          <TouchableOpacity onPress={onClose}><Text style={styles.previewClose}>{t('menu.close')}</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {sections.map(sec => (
            <View key={sec.id} style={styles.previewSection}>
              <Text style={styles.previewSectionName}>{sec.nameAr}</Text>
              {sec.items.filter(i => !i.outOfStock).map(item => (
                <View key={item.id} style={styles.previewItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.previewItemName}>{item.nameAr}</Text>
                    {item.descAr ? <Text style={styles.previewItemDesc} numberOfLines={2}>{item.descAr}</Text> : null}
                    <ItemBadges item={item} />
                  </View>
                  <Text style={styles.previewItemPrice}>{item.price.toLocaleString('ar-IQ')} {t('menu.currency')}</Text>
                </View>
              ))}
              {sec.items.filter(i => i.outOfStock).map(item => (
                <View key={item.id} style={[styles.previewItem, { opacity: 0.45 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.previewItemName, { textDecorationLine: 'line-through' }]}>{item.nameAr}</Text>
                  </View>
                  <Text style={styles.previewItemPrice}>{t('menu.outOfStock')}</Text>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

interface EditTarget { sectionId: string; item: MenuItem }
interface SectionEditTarget { section: MenuSection }

export function MenuManagementScreen(): ReactElement {
  const [sections, setSections] = useState<MenuSection[]>(INITIAL_SECTIONS);
  const [saving, setSaving] = useState(false);

  // Modals
  const [sectionModal, setSectionModal] = useState<{ visible: boolean; target: SectionEditTarget | null }>({ visible: false, target: null });
  const [itemModal, setItemModal] = useState<{ visible: boolean; sectionId: string; target: EditTarget | null }>({ visible: false, sectionId: '', target: null });
  const [bulkModal, setBulkModal] = useState(false);
  const [previewModal, setPreviewModal] = useState(false);

  // ── Section CRUD ────────────────────────────────────────────────────────────

  const openAddSection = useCallback(() => setSectionModal({ visible: true, target: null }), []);
  const openEditSection = useCallback((sec: MenuSection) => setSectionModal({ visible: true, target: { section: sec } }), []);

  const handleSaveSection = useCallback((nameAr: string, nameEn: string) => {
    setSections(secs => {
      if (sectionModal.target) {
        return secs.map(s => s.id === sectionModal.target!.section.id ? { ...s, nameAr, nameEn } : s);
      }
      return [...secs, { id: makeId(), nameAr, nameEn, items: [] }];
    });
    setSectionModal({ visible: false, target: null });
  }, [sectionModal.target]);

  const handleDeleteSection = useCallback((sectionId: string) => {
    Alert.alert(t('menu.deleteSection'), t('menu.deleteSectionConfirm'), [
      { text: t('menu.cancel'), style: 'cancel' },
      { text: t('menu.deleteSection'), style: 'destructive', onPress: () => setSections(secs => secs.filter(s => s.id !== sectionId)) },
    ]);
  }, []);

  // ── Item CRUD ───────────────────────────────────────────────────────────────

  const openAddItem = useCallback((sectionId: string) => setItemModal({ visible: true, sectionId, target: null }), []);
  const openEditItem = useCallback((sectionId: string, item: MenuItem) => setItemModal({ visible: true, sectionId, target: { sectionId, item } }), []);

  const handleSaveItem = useCallback((form: ItemFormState) => {
    setSections(secs => secs.map(sec => {
      if (sec.id !== itemModal.sectionId) return sec;
      if (itemModal.target) {
        return { ...sec, items: sec.items.map(it => it.id === itemModal.target!.item.id ? formToItem(it.id, form) : it) };
      }
      return { ...sec, items: [...sec.items, formToItem(makeId(), form)] };
    }));
    setItemModal({ visible: false, sectionId: '', target: null });
  }, [itemModal.sectionId, itemModal.target]);

  const handleDeleteItem = useCallback((sectionId: string, itemId: string) => {
    Alert.alert(t('menu.deleteItem'), t('menu.deleteItemConfirm'), [
      { text: t('menu.cancel'), style: 'cancel' },
      { text: t('menu.deleteItem'), style: 'destructive', onPress: () => setSections(secs => secs.map(s => s.id === sectionId ? { ...s, items: s.items.filter(i => i.id !== itemId) } : s)) },
    ]);
  }, []);

  const handleToggleStock = useCallback((sectionId: string, itemId: string) => {
    setSections(secs => secs.map(s => s.id === sectionId ? { ...s, items: s.items.map(i => i.id === itemId ? { ...i, outOfStock: !i.outOfStock } : i) } : s));
  }, []);

  // ── Bulk price ──────────────────────────────────────────────────────────────

  const handleBulkPrice = useCallback((pct: number) => {
    const factor = 1 + pct / 100;
    setSections(secs => secs.map(s => ({ ...s, items: s.items.map(i => ({ ...i, price: Math.round(i.price * factor) })) })));
    setBulkModal(false);
  }, []);

  // ── Save stub ───────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 800));
    setSaving(false);
    Alert.alert(t('menu.save'), t('menu.save'));
  }, []);

  // ── Export stub ─────────────────────────────────────────────────────────────

  const handleExport = useCallback(() => {
    Alert.alert(t('menu.export'), t('menu.importPhotoComing'));
  }, []);

  // ─── Move section up/down ───────────────────────────────────────────────────

  const moveSection = useCallback((id: string, dir: -1 | 1) => {
    setSections(secs => {
      const idx = secs.findIndex(s => s.id === id);
      if (idx < 0) return secs;
      const next = idx + dir;
      if (next < 0 || next >= secs.length) return secs;
      const a = [...secs];
      [a[idx], a[next]] = [a[next]!, a[idx]!];
      return a;
    });
  }, []);

  const moveItem = useCallback((sectionId: string, itemId: string, dir: -1 | 1) => {
    setSections(secs => secs.map(s => {
      if (s.id !== sectionId) return s;
      const items = [...s.items];
      const idx = items.findIndex(i => i.id === itemId);
      if (idx < 0) return s;
      const next = idx + dir;
      if (next < 0 || next >= items.length) return s;
      [items[idx], items[next]] = [items[next]!, items[idx]!];
      return { ...s, items };
    }));
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────────

  const totalItems = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/* Top toolbar */}
      <View style={styles.toolbar}>
        <Text style={styles.screenTitle}>{t('menu.title')}</Text>
        <View style={styles.toolbarActions}>
          <TouchableOpacity style={styles.toolbarBtn} onPress={() => setBulkModal(true)}>
            <Text style={styles.toolbarBtnText}>💲 {t('menu.bulkPriceUpdate')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolbarBtn} onPress={() => setPreviewModal(true)}>
            <Text style={styles.toolbarBtnText}>👁 {t('menu.preview')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolbarBtn} onPress={handleExport}>
            <Text style={styles.toolbarBtnText}>📄 {t('menu.export')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {sections.length === 0 ? (
          <EmptyState title={t('menu.noSections')} body={t('menu.noSectionsBody')} />
        ) : (
          sections.map((sec, secIdx) => (
            <View key={sec.id} style={styles.sectionCard}>
              {/* Section header */}
              <View style={styles.sectionHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionName}>{sec.nameAr}</Text>
                  {sec.nameEn ? <Text style={styles.sectionNameEn}>{sec.nameEn}</Text> : null}
                </View>
                <View style={styles.sectionActions}>
                  <TouchableOpacity onPress={() => moveSection(sec.id, -1)} disabled={secIdx === 0} style={styles.reorderBtn}>
                    <Text style={[styles.reorderBtnText, secIdx === 0 && styles.reorderBtnDisabled]}>↑</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => moveSection(sec.id, 1)} disabled={secIdx === sections.length - 1} style={styles.reorderBtn}>
                    <Text style={[styles.reorderBtnText, secIdx === sections.length - 1 && styles.reorderBtnDisabled]}>↓</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => openEditSection(sec)} style={styles.sectionActionBtn}>
                    <Text style={[styles.sectionActionText, { color: PRIMARY }]}>✎</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteSection(sec.id)} style={styles.sectionActionBtn}>
                    <Text style={[styles.sectionActionText, { color: DANGER }]}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Items */}
              {sec.items.map((item, itemIdx) => (
                <View key={item.id} style={styles.itemWrapper}>
                  <View style={styles.itemReorderBtns}>
                    <TouchableOpacity onPress={() => moveItem(sec.id, item.id, -1)} disabled={itemIdx === 0} style={styles.reorderBtn}>
                      <Text style={[styles.reorderBtnText, itemIdx === 0 && styles.reorderBtnDisabled]}>↑</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => moveItem(sec.id, item.id, 1)} disabled={itemIdx === sec.items.length - 1} style={styles.reorderBtn}>
                      <Text style={[styles.reorderBtnText, itemIdx === sec.items.length - 1 && styles.reorderBtnDisabled]}>↓</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ flex: 1 }}>
                    <MenuItemCard
                      item={item}
                      onEdit={() => openEditItem(sec.id, item)}
                      onDelete={() => handleDeleteItem(sec.id, item.id)}
                      onToggleStock={() => handleToggleStock(sec.id, item.id)}
                    />
                  </View>
                </View>
              ))}

              {/* Add item */}
              <TouchableOpacity style={styles.addItemBtn} onPress={() => openAddItem(sec.id)}>
                <Text style={styles.addItemBtnText}>+ {t('menu.addItem')}</Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        {/* Add section */}
        <TouchableOpacity style={styles.addSectionBtn} onPress={openAddSection}>
          <Text style={styles.addSectionBtnText}>+ {t('menu.addSection')}</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Save bar */}
      <View style={styles.saveBar}>
        <Text style={styles.saveBarInfo}>{totalItems} صنف في {sections.length} قسم</Text>
        <TouchableOpacity style={styles.saveBarBtn} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={SURFACE} size="small" /> : <Text style={styles.saveBarBtnText}>{t('menu.save')}</Text>}
        </TouchableOpacity>
      </View>

      {/* Modals */}
      <SectionFormModal
        visible={sectionModal.visible}
        initial={sectionModal.target ? { nameAr: sectionModal.target.section.nameAr, nameEn: sectionModal.target.section.nameEn } : null}
        onSave={handleSaveSection}
        onCancel={() => setSectionModal({ visible: false, target: null })}
      />
      <ItemFormModal
        visible={itemModal.visible}
        initial={itemModal.target ? itemToForm(itemModal.target.item) : null}
        onSave={handleSaveItem}
        onCancel={() => setItemModal({ visible: false, sectionId: '', target: null })}
      />
      <BulkPriceModal visible={bulkModal} onApply={handleBulkPrice} onCancel={() => setBulkModal(false)} />
      <PreviewModal visible={previewModal} sections={sections} onClose={() => setPreviewModal(false)} />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  toolbar: { backgroundColor: SURFACE, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: BORDER },
  screenTitle: { fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 8, textAlign: 'auto' },
  toolbarActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toolbarBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: BG, borderRadius: 8, borderWidth: 1, borderColor: BORDER },
  toolbarBtnText: { fontSize: 12, color: '#333' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },
  sectionCard: { backgroundColor: SURFACE, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: BORDER },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  sectionName: { fontSize: 16, fontWeight: '700', color: '#111', textAlign: 'auto' },
  sectionNameEn: { fontSize: 12, color: '#888', textAlign: 'auto' },
  sectionActions: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  sectionActionBtn: { padding: 6 },
  sectionActionText: { fontSize: 16 },
  reorderBtn: { padding: 4 },
  reorderBtnText: { fontSize: 16, color: '#555' },
  reorderBtnDisabled: { color: '#CCC' },
  itemWrapper: { flexDirection: 'row', gap: 4, marginBottom: 8 },
  itemReorderBtns: { justifyContent: 'center', gap: 2 },
  itemCard: { backgroundColor: '#FAFAFA', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: BORDER },
  itemCardOOS: { opacity: 0.6 },
  itemCardHeader: { flexDirection: 'row', gap: 8 },
  itemName: { fontSize: 15, fontWeight: '600', color: '#111', textAlign: 'auto' },
  itemNameEn: { fontSize: 12, color: '#666', textAlign: 'auto' },
  itemDesc: { fontSize: 13, color: '#555', marginTop: 2, textAlign: 'auto' },
  itemRight: { alignItems: 'flex-end', gap: 6, minWidth: 80 },
  itemPrice: { fontSize: 14, fontWeight: '700', color: PRIMARY },
  itemActions: { flexDirection: 'row', gap: 12, marginTop: 8, justifyContent: 'flex-end' },
  itemActionBtn: { padding: 4 },
  itemActionText: { fontSize: 13 },
  badgeRow: { flexDirection: 'row', gap: 4, marginTop: 4, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeDanger: { backgroundColor: '#FEE2E2' },
  badgeWarn: { backgroundColor: '#FEF3C7' },
  badgePrimary: { backgroundColor: '#DBEAFE' },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#333' },
  addItemBtn: { marginTop: 4, paddingVertical: 8, alignItems: 'center', borderTopWidth: 1, borderTopColor: BORDER },
  addItemBtnText: { color: PRIMARY, fontSize: 14, fontWeight: '500' },
  addSectionBtn: { borderRadius: 12, padding: 14, backgroundColor: SURFACE, borderWidth: 1.5, borderColor: PRIMARY, borderStyle: 'dashed', alignItems: 'center' },
  addSectionBtnText: { color: PRIMARY, fontSize: 15, fontWeight: '600' },
  saveBar: { backgroundColor: SURFACE, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: BORDER, gap: 12 },
  saveBarInfo: { flex: 1, fontSize: 13, color: '#666', textAlign: 'auto' },
  saveBarBtn: { backgroundColor: PRIMARY, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, minWidth: 80, alignItems: 'center' },
  saveBarBtnText: { color: SURFACE, fontWeight: '700', fontSize: 14 },
  // Modal
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: SURFACE },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#111' },
  modalCancel: { fontSize: 15, color: DANGER },
  modalSave: { fontSize: 15, color: PRIMARY, fontWeight: '700' },
  modalBody: { padding: 16, gap: 4 },
  fieldLabel: { fontSize: 13, color: '#555', marginBottom: 4, textAlign: 'auto' },
  input: { borderWidth: 1, borderColor: BORDER, borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: SURFACE, marginBottom: 12 },
  textarea: { height: 80, textAlignVertical: 'top' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER },
  toggleLabel: { fontSize: 15, color: '#333' },
  photoStub: { marginTop: 12, padding: 16, borderRadius: 8, backgroundColor: '#F0F7FF', alignItems: 'center' },
  photoStubText: { color: '#1976D2', fontSize: 14 },
  // Overlay
  overlayBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  overlayCard: { backgroundColor: SURFACE, borderRadius: 16, padding: 20, width: '100%', maxWidth: 360 },
  overlayTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12, textAlign: 'auto', color: '#111' },
  overlayActions: { flexDirection: 'row', gap: 10, marginTop: 16, justifyContent: 'flex-end' },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: BORDER },
  cancelBtnText: { color: '#555', fontSize: 14 },
  saveBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, backgroundColor: PRIMARY },
  saveBtnText: { color: SURFACE, fontWeight: '700', fontSize: 14 },
  // Preview
  previewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: SURFACE },
  previewTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
  previewClose: { fontSize: 15, color: PRIMARY },
  previewSection: { marginBottom: 20 },
  previewSectionName: { fontSize: 18, fontWeight: '800', color: '#111', marginBottom: 10, textAlign: 'auto', borderStartWidth: 4, borderStartColor: PRIMARY, paddingStart: 10 },
  previewItem: { flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER },
  previewItemName: { fontSize: 15, fontWeight: '600', color: '#111', textAlign: 'auto' },
  previewItemDesc: { fontSize: 13, color: '#666', textAlign: 'auto', marginTop: 2 },
  previewItemPrice: { fontSize: 15, fontWeight: '700', color: PRIMARY, minWidth: 70 },
});
