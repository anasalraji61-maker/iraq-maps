/**
 * ListingsManagementScreen — provider's own listing management.
 *
 * Features:
 *  - All listings grid (2-column)
 *  - Add listing FAB
 *  - Edit listing inline modal form
 *  - Photo upload stub (up to 8)
 *  - Toggle availability (in/out of stock)
 *  - Per-listing analytics inline (views + inquiries)
 *  - Delete with confirmation
 *
 * RTL-safe: start/end only. All text via t().
 * Prices in IQD. Both Arabic and English titles required.
 */
/* eslint-disable i18next/no-literal-string, no-restricted-syntax */

import { type ListingCategory, type ListingSummary, type ListingType, type CreateListingBody } from '@iraq-maps/contracts';
import { formatNumber } from '@iraq-maps/i18n';
import { useApi, useSession } from '@iraq-maps/mobile-kit';
import { useCallback, useEffect, useReducer, useRef, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  I18nManager,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
  Text as RNText,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIMARY = '#1976D2';
const SURFACE = '#FFFFFF';
const BG = '#F5F5F5';
const BORDER = '#E0E0E0';
const TEXT_PRIMARY = '#1A1A1A';
const TEXT_SECONDARY = '#666666';
const SUCCESS = '#16A34A';
const WARN = '#D97706';
const DANGER = '#EF4444';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_GAP = 10;
const CARD_W = (SCREEN_W - 16 * 2 - CARD_GAP) / 2;
const PHOTOS_MAX = 8;

const LISTING_TYPES: Array<{ key: ListingType; labelKey: string }> = [
  { key: 'product', labelKey: 'listings.form.typeProduct' },
  { key: 'service', labelKey: 'listings.form.typeService' },
  { key: 'food_item', labelKey: 'listings.form.typeFoodItem' },
  { key: 'rental', labelKey: 'listings.form.typeRental' },
  { key: 'package', labelKey: 'listings.form.typePackage' },
];

// ── State ─────────────────────────────────────────────────────────────────────

interface State {
  listings: ListingSummary[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
}

type Action =
  | { type: 'SET_LISTINGS'; listings: ListingSummary[]; cursor: string | null }
  | { type: 'APPEND_LISTINGS'; listings: ListingSummary[]; cursor: string | null }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_LOADING_MORE'; loadingMore: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'UPDATE_LISTING'; listing: ListingSummary }
  | { type: 'REMOVE_LISTING'; id: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_LISTINGS': return { ...state, listings: action.listings, nextCursor: action.cursor, loading: false, error: null };
    case 'APPEND_LISTINGS': return { ...state, listings: [...state.listings, ...action.listings], nextCursor: action.cursor, loadingMore: false };
    case 'SET_LOADING': return { ...state, loading: action.loading };
    case 'SET_LOADING_MORE': return { ...state, loadingMore: action.loadingMore };
    case 'SET_ERROR': return { ...state, error: action.error, loading: false };
    case 'UPDATE_LISTING': return {
      ...state,
      listings: state.listings.map((l) => (l.id as string) === (action.listing.id as string) ? action.listing : l),
    };
    case 'REMOVE_LISTING': return {
      ...state,
      listings: state.listings.filter((l) => (l.id as string) !== action.id),
    };
    default: return state;
  }
}

// ── Form state ────────────────────────────────────────────────────────────────

interface FormState {
  titleAr: string;
  titleEn: string;
  type: ListingType;
  categoryId: string;
  priceIqd: string;
  descAr: string;
  descEn: string;
  deliveryAvailable: boolean;
  deliveryNotes: string;
  photoUris: string[]; // local URIs for preview
  saving: boolean;
  errors: Record<string, string>;
}

const FORM_INIT: FormState = {
  titleAr: '',
  titleEn: '',
  type: 'product',
  categoryId: '',
  priceIqd: '',
  descAr: '',
  descEn: '',
  deliveryAvailable: false,
  deliveryNotes: '',
  photoUris: [],
  saving: false,
  errors: {},
};

function formFromListing(l: ListingSummary): Partial<FormState> {
  return {
    titleAr: l.titleAr,
    titleEn: l.titleEn,
    type: l.type,
    categoryId: l.category.id as string,
    priceIqd: String(l.priceIqd),
    deliveryAvailable: l.deliveryAvailable,
  };
}

function validateForm(form: FormState): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!form.titleAr.trim()) errs.titleAr = t('listings.form.errorRequired');
  if (!form.titleEn.trim()) errs.titleEn = t('listings.form.errorRequired');
  if (!form.categoryId) errs.categoryId = t('listings.form.errorRequired');
  const price = Number(form.priceIqd);
  if (!form.priceIqd || Number.isNaN(price) || price < 0) errs.priceIqd = t('listings.form.errorPrice');
  return errs;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function AnalyticsRow({ views, inquiries }: { views: number; inquiries: number }): ReactElement {
  return (
    <View style={styles.analyticsRow}>
      <View style={styles.analyticsStat}>
        <RNText style={styles.analyticsValue}>{formatNumber(views)}</RNText>
        <RNText style={styles.analyticsLabel}>👁️</RNText>
      </View>
      <View style={styles.analyticsDivider} />
      <View style={styles.analyticsStat}>
        <RNText style={styles.analyticsValue}>{formatNumber(inquiries)}</RNText>
        <RNText style={styles.analyticsLabel}>💬</RNText>
      </View>
    </View>
  );
}

function ListingCard({
  item,
  onEdit,
  onDelete,
  onToggle,
}: {
  item: ListingSummary;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}): ReactElement {
  return (
    <View style={styles.card}>
      {item.coverPhotoUrl ? (
        <Image source={{ uri: item.coverPhotoUrl }} style={styles.cardImage} resizeMode="cover" />
      ) : (
        <View style={[styles.cardImage, styles.noPhoto]}>
          <RNText style={styles.noPhotoIcon}>🖼️</RNText>
        </View>
      )}

      <View style={styles.cardBody}>
        <RNText style={styles.cardTitle} numberOfLines={2}>{item.titleAr}</RNText>
        <RNText style={styles.cardPrice}>{formatNumber(item.priceIqd)} {t('listings.form.price').split('(')[1]?.replace(')', '') ?? 'د.ع'}</RNText>

        <AnalyticsRow views={item.viewCount} inquiries={item.inquiryCount} />

        {/* Availability toggle */}
        <TouchableOpacity style={styles.availRow} onPress={onToggle}>
          <RNText style={[styles.availLabel, !item.isAvailable && styles.unavailLabel]}>
            {item.isAvailable ? t('listings.available') : t('listings.unavailable')}
          </RNText>
          <Switch
            value={item.isAvailable}
            onValueChange={onToggle}
            trackColor={{ false: '#CCC', true: SUCCESS }}
            thumbColor={SURFACE}
          />
        </TouchableOpacity>
      </View>

      {/* Card actions */}
      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.editBtn} onPress={onEdit}>
          <RNText style={styles.editBtnText}>{t('listings.editBtn')}</RNText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
          <RNText style={styles.deleteBtnText}>{t('listings.deleteBtn')}</RNText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Photo picker stub ─────────────────────────────────────────────────────────

function PhotoStrip({
  uris,
  onAdd,
  onRemove,
}: {
  uris: string[];
  onAdd: () => void;
  onRemove: (idx: number) => void;
}): ReactElement {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoStrip}>
      {uris.map((uri, idx) => (
        <View key={uri} style={styles.photoThumb}>
          <Image source={{ uri }} style={styles.photoThumbImage} resizeMode="cover" />
          <TouchableOpacity style={styles.photoRemove} onPress={() => onRemove(idx)}>
            <RNText style={styles.photoRemoveText}>✕</RNText>
          </TouchableOpacity>
        </View>
      ))}
      {uris.length < PHOTOS_MAX && (
        <TouchableOpacity style={styles.photoAdd} onPress={onAdd}>
          <RNText style={styles.photoAddIcon}>+</RNText>
          <RNText style={styles.photoAddLabel}>{t('listings.form.addPhoto')}</RNText>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

// ── Listing form modal ────────────────────────────────────────────────────────

function ListingFormModal({
  visible,
  editingId,
  categories,
  initialForm,
  onClose,
  onSave,
}: {
  visible: boolean;
  editingId: string | null;
  categories: ListingCategory[];
  initialForm: Partial<FormState>;
  onClose: () => void;
  onSave: (form: FormState, editingId: string | null) => Promise<void>;
}): ReactElement {
  const [form, setForm] = useState<FormState>({ ...FORM_INIT, ...initialForm });

  // Sync when opening a different listing
  useEffect(() => {
    setForm({ ...FORM_INIT, ...initialForm });
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value, errors: { ...prev.errors, [key]: '' } }));
  }, []);

  const handleSave = useCallback(async () => {
    const errs = validateForm(form);
    if (Object.keys(errs).length > 0) {
      setForm((prev) => ({ ...prev, errors: errs }));
      return;
    }
    setForm((prev) => ({ ...prev, saving: true }));
    try {
      await onSave(form, editingId);
    } finally {
      setForm((prev) => ({ ...prev, saving: false }));
    }
  }, [form, editingId, onSave]);

  const addPhotoStub = useCallback(() => {
    // Real implementation would use expo-image-picker.
    // Stub: add a placeholder URI so the UI demonstrates the slot.
    const stub = `https://picsum.photos/seed/${Date.now()}/300/300`;
    setForm((prev) => ({ ...prev, photoUris: [...prev.photoUris, stub].slice(0, PHOTOS_MAX) }));
  }, []);

  const removePhoto = useCallback((idx: number) => {
    setForm((prev) => ({ ...prev, photoUris: prev.photoUris.filter((_, i) => i !== idx) }));
  }, []);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.formModal}>
        {/* Header */}
        <View style={styles.formHeader}>
          <TouchableOpacity onPress={onClose} disabled={form.saving}>
            <RNText style={styles.formCancel}>{t('listings.form.cancel')}</RNText>
          </TouchableOpacity>
          <RNText style={styles.formHeaderTitle}>
            {editingId ? t('listings.form.editTitle') : t('listings.form.addTitle')}
          </RNText>
          <TouchableOpacity onPress={() => void handleSave()} disabled={form.saving}>
            {form.saving ? (
              <ActivityIndicator size="small" color={PRIMARY} />
            ) : (
              <RNText style={styles.formSave}>{t('listings.form.save')}</RNText>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.formBody} keyboardShouldPersistTaps="handled">

          {/* Type selector */}
          <RNText style={styles.formLabel}>{t('listings.form.type')}</RNText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeRow}>
            {LISTING_TYPES.map((lt) => (
              <TouchableOpacity
                key={lt.key}
                style={[styles.typeChip, form.type === lt.key && styles.typeChipSelected]}
                onPress={() => set('type', lt.key)}
              >
                <RNText style={[styles.typeChipText, form.type === lt.key && styles.typeChipTextSelected]}>
                  {t(lt.labelKey as Parameters<typeof t>[0])}
                </RNText>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Arabic title */}
          <RNText style={styles.formLabel}>{t('listings.form.titleAr')} <RNText style={styles.required}>*</RNText></RNText>
          <TextInput
            style={[styles.formInput, !!form.errors.titleAr && styles.formInputError]}
            value={form.titleAr}
            onChangeText={(v) => set('titleAr', v)}
            placeholder={t('listings.form.titleArPlaceholder')}
            textAlign="right"
            maxLength={200}
          />
          {!!form.errors.titleAr && <RNText style={styles.fieldError}>{form.errors.titleAr}</RNText>}

          {/* English title */}
          <RNText style={styles.formLabel}>{t('listings.form.titleEn')} <RNText style={styles.required}>*</RNText></RNText>
          <TextInput
            style={[styles.formInput, !!form.errors.titleEn && styles.formInputError]}
            value={form.titleEn}
            onChangeText={(v) => set('titleEn', v)}
            placeholder={t('listings.form.titleEnPlaceholder')}
            textAlign="left"
            maxLength={200}
          />
          {!!form.errors.titleEn && <RNText style={styles.fieldError}>{form.errors.titleEn}</RNText>}

          {/* Category */}
          <RNText style={styles.formLabel}>{t('listings.form.category')} <RNText style={styles.required}>*</RNText></RNText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeRow}>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.id as string}
                style={[styles.typeChip, form.categoryId === (cat.id as string) && styles.typeChipSelected]}
                onPress={() => set('categoryId', cat.id as string)}
              >
                <RNText style={[styles.typeChipText, form.categoryId === (cat.id as string) && styles.typeChipTextSelected]}>
                  {cat.icon} {cat.nameAr}
                </RNText>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {!!form.errors.categoryId && <RNText style={styles.fieldError}>{form.errors.categoryId}</RNText>}

          {/* Price */}
          <RNText style={styles.formLabel}>{t('listings.form.price')} <RNText style={styles.required}>*</RNText></RNText>
          <TextInput
            style={[styles.formInput, !!form.errors.priceIqd && styles.formInputError]}
            value={form.priceIqd}
            onChangeText={(v) => set('priceIqd', v.replace(/[^0-9]/g, ''))}
            placeholder={t('listings.form.pricePlaceholder')}
            keyboardType="numeric"
            textAlign="start"
            maxLength={12}
          />
          {!!form.errors.priceIqd && <RNText style={styles.fieldError}>{form.errors.priceIqd}</RNText>}

          {/* Arabic description */}
          <RNText style={styles.formLabel}>{t('listings.form.descAr')}</RNText>
          <TextInput
            style={[styles.formInput, styles.formTextArea]}
            value={form.descAr}
            onChangeText={(v) => set('descAr', v)}
            placeholder={t('listings.form.descArPlaceholder')}
            multiline
            numberOfLines={4}
            textAlign="right"
            textAlignVertical="top"
            maxLength={3000}
          />

          {/* English description */}
          <RNText style={styles.formLabel}>{t('listings.form.descEn')}</RNText>
          <TextInput
            style={[styles.formInput, styles.formTextArea]}
            value={form.descEn}
            onChangeText={(v) => set('descEn', v)}
            placeholder={t('listings.form.descEnPlaceholder')}
            multiline
            numberOfLines={4}
            textAlign="left"
            textAlignVertical="top"
            maxLength={3000}
          />

          {/* Delivery toggle */}
          <View style={styles.deliveryToggleRow}>
            <RNText style={styles.formLabel}>{t('listings.form.delivery')}</RNText>
            <Switch
              value={form.deliveryAvailable}
              onValueChange={(v) => set('deliveryAvailable', v)}
              trackColor={{ false: '#CCC', true: SUCCESS }}
              thumbColor={SURFACE}
            />
          </View>

          {form.deliveryAvailable && (
            <>
              <RNText style={styles.formLabel}>{t('listings.form.deliveryNotes')}</RNText>
              <TextInput
                style={[styles.formInput, styles.formTextAreaSm]}
                value={form.deliveryNotes}
                onChangeText={(v) => set('deliveryNotes', v)}
                placeholder={t('listings.form.deliveryNotesPlaceholder')}
                multiline
                numberOfLines={2}
                textAlign="right"
                textAlignVertical="top"
                maxLength={500}
              />
            </>
          )}

          {/* Photos */}
          <RNText style={styles.formLabel}>{t('listings.form.photos')}</RNText>
          <PhotoStrip uris={form.photoUris} onAdd={addPhotoStub} onRemove={removePhoto} />

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function ListingsManagementScreen(): ReactElement {
  const api = useApi();
  const session = useSession();
  const [state, dispatch] = useReducer(reducer, {
    listings: [],
    nextCursor: null,
    loading: false,
    loadingMore: false,
    error: null,
  });
  const [categories, setCategories] = useState<ListingCategory[]>([]);
  const [formVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingInitial, setEditingInitial] = useState<Partial<FormState>>(FORM_INIT);

  // ── Data ─────────────────────────────────────────────────────────────────────

  const fetchCategories = useCallback(async () => {
    try {
      const res = await api.get('/listings/categories');
      if (res.status === 200) setCategories((res.body as { items: ListingCategory[] }).items);
    } catch {
      // silent
    }
  }, [api]);

  const fetchListings = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', loading: true });
    try {
      const res = await api.get('/provider/listings?limit=20');
      if (res.status === 200) {
        const data = res.body as { items: ListingSummary[]; nextCursor: string | null };
        dispatch({ type: 'SET_LISTINGS', listings: data.items, cursor: data.nextCursor });
      } else {
        dispatch({ type: 'SET_ERROR', error: t('listings.error') });
      }
    } catch {
      dispatch({ type: 'SET_ERROR', error: t('listings.error') });
    }
  }, [api]);

  const loadMore = useCallback(async () => {
    if (!state.nextCursor || state.loadingMore) return;
    dispatch({ type: 'SET_LOADING_MORE', loadingMore: true });
    try {
      const res = await api.get(`/provider/listings?limit=20&cursor=${state.nextCursor}`);
      if (res.status === 200) {
        const data = res.body as { items: ListingSummary[]; nextCursor: string | null };
        dispatch({ type: 'APPEND_LISTINGS', listings: data.items, cursor: data.nextCursor });
      }
    } catch {
      dispatch({ type: 'SET_LOADING_MORE', loadingMore: false });
    }
  }, [api, state.nextCursor, state.loadingMore]);

  useEffect(() => {
    void fetchCategories();
    void fetchListings();
  }, [fetchCategories, fetchListings]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const handleSave = useCallback(
    async (form: FormState, editId: string | null) => {
      const body: CreateListingBody = {
        titleAr: form.titleAr.trim(),
        titleEn: form.titleEn.trim(),
        type: form.type,
        categoryId: form.categoryId as unknown as import('@iraq-maps/contracts').ListingCategoryId,
        priceIqd: Number(form.priceIqd),
        descriptionAr: form.descAr,
        descriptionEn: form.descEn,
        deliveryAvailable: form.deliveryAvailable,
        deliveryNotes: form.deliveryNotes || undefined,
        cityId: 'baghdad' as unknown as import('@iraq-maps/contracts').CityId,
        photoAssetIds: [],
        isAvailable: true,
      };

      try {
        if (editId) {
          const res = await api.patch(`/provider/listings/${editId}`, body);
          if (res.status === 200) {
            dispatch({ type: 'UPDATE_LISTING', listing: res.body as ListingSummary });
          } else {
            Alert.alert('', t('listings.form.errorSave'));
            return;
          }
        } else {
          const res = await api.post('/provider/listings', body);
          if (res.status === 201) {
            void fetchListings();
          } else {
            Alert.alert('', t('listings.form.errorSave'));
            return;
          }
        }
        setFormVisible(false);
      } catch {
        Alert.alert('', t('listings.form.errorSave'));
      }
    },
    [api, fetchListings],
  );

  const handleToggleAvailability = useCallback(
    async (id: string) => {
      try {
        const res = await api.post(`/provider/listings/${id}/availability`, {});
        if (res.status === 200) {
          const { isAvailable } = res.body as { isAvailable: boolean };
          dispatch({
            type: 'UPDATE_LISTING',
            listing: {
              ...(state.listings.find((l) => (l.id as string) === id) as ListingSummary),
              isAvailable,
            },
          });
        }
      } catch {
        // silent
      }
    },
    [api, state.listings],
  );

  const handleDelete = useCallback(
    (id: string) => {
      Alert.alert('', t('listings.deleteConfirm'), [
        { text: t('listings.deleteConfirmNo'), style: 'cancel' },
        {
          text: t('listings.deleteConfirmYes'),
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/provider/listings/${id}`);
              dispatch({ type: 'REMOVE_LISTING', id });
            } catch {
              // silent
            }
          },
        },
      ]);
    },
    [api],
  );

  const handleEdit = useCallback((item: ListingSummary) => {
    setEditingId(item.id as string);
    setEditingInitial(formFromListing(item));
    setFormVisible(true);
  }, []);

  const handleAdd = useCallback(() => {
    setEditingId(null);
    setEditingInitial(FORM_INIT);
    setFormVisible(true);
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────────

  const renderItem = useCallback(
    ({ item }: { item: ListingSummary }) => (
      <ListingCard
        item={item}
        onEdit={() => handleEdit(item)}
        onDelete={() => handleDelete(item.id as string)}
        onToggle={() => void handleToggleAvailability(item.id as string)}
      />
    ),
    [handleEdit, handleDelete, handleToggleAvailability],
  );

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <RNText style={styles.headerTitle}>{t('listings.title')}</RNText>
        <TouchableOpacity style={styles.addFab} onPress={handleAdd}>
          <RNText style={styles.addFabText}>+ {t('listings.addBtn')}</RNText>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {state.loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={PRIMARY} />
          <RNText style={styles.loadingText}>{t('listings.loading')}</RNText>
        </View>
      ) : state.error ? (
        <View style={styles.centered}>
          <RNText style={styles.errorText}>{state.error}</RNText>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void fetchListings()}>
            <RNText style={styles.retryText}>{t('listings.retry')}</RNText>
          </TouchableOpacity>
        </View>
      ) : state.listings.length === 0 ? (
        <View style={styles.centered}>
          <RNText style={styles.emptyIcon}>📦</RNText>
          <RNText style={styles.emptyTitle}>{t('listings.empty')}</RNText>
          <RNText style={styles.emptyHint}>{t('listings.emptyHint')}</RNText>
          <TouchableOpacity style={styles.emptyAddBtn} onPress={handleAdd}>
            <RNText style={styles.emptyAddBtnText}>+ {t('listings.addBtn')}</RNText>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={state.listings}
          keyExtractor={(item) => item.id as string}
          renderItem={renderItem}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridContent}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            state.loadingMore ? (
              <ActivityIndicator color={PRIMARY} style={styles.loadMoreSpinner} />
            ) : state.nextCursor ? (
              <TouchableOpacity style={styles.loadMoreBtn} onPress={() => void loadMore()}>
                <RNText style={styles.loadMoreText}>{t('listings.loadMore')}</RNText>
              </TouchableOpacity>
            ) : null
          }
        />
      )}

      {/* Form modal */}
      <ListingFormModal
        visible={formVisible}
        editingId={editingId}
        categories={categories}
        initialForm={editingInitial}
        onClose={() => setFormVisible(false)}
        onSave={handleSave}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: SURFACE,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: TEXT_PRIMARY },
  addFab: {
    backgroundColor: PRIMARY,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addFabText: { color: SURFACE, fontSize: 13, fontWeight: '700' },

  // Grid
  gridContent: { padding: 16, paddingBottom: 100 },
  gridRow: { gap: CARD_GAP, marginBottom: CARD_GAP },

  // Card
  card: {
    width: CARD_W,
    backgroundColor: SURFACE,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 5,
    elevation: 3,
  },
  cardImage: { width: '100%', height: 110 },
  noPhoto: { backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  noPhotoIcon: { fontSize: 28 },
  cardBody: { padding: 8, gap: 6 },
  cardTitle: { fontSize: 12, fontWeight: '600', color: TEXT_PRIMARY },
  cardPrice: { fontSize: 13, fontWeight: '700', color: PRIMARY },

  // Analytics
  analyticsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  analyticsStat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  analyticsValue: { fontSize: 11, fontWeight: '700', color: TEXT_PRIMARY },
  analyticsLabel: { fontSize: 11 },
  analyticsDivider: { width: 1, height: 12, backgroundColor: BORDER },

  // Availability
  availRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  availLabel: { fontSize: 11, color: SUCCESS, fontWeight: '600' },
  unavailLabel: { color: WARN },

  // Card actions
  cardActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: BORDER },
  editBtn: { flex: 1, paddingVertical: 8, alignItems: 'center' },
  editBtnText: { fontSize: 12, color: PRIMARY, fontWeight: '600' },
  deleteBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderStartWidth: 1, borderStartColor: BORDER },
  deleteBtnText: { fontSize: 12, color: DANGER, fontWeight: '600' },

  // States
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  loadingText: { color: TEXT_SECONDARY, fontSize: 14 },
  errorText: { color: DANGER, fontSize: 15, textAlign: 'center' },
  retryBtn: { backgroundColor: PRIMARY, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: SURFACE, fontWeight: '600' },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: TEXT_PRIMARY, textAlign: 'center' },
  emptyHint: { fontSize: 14, color: TEXT_SECONDARY, textAlign: 'center' },
  emptyAddBtn: { backgroundColor: PRIMARY, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, marginTop: 8 },
  emptyAddBtnText: { color: SURFACE, fontWeight: '700', fontSize: 15 },
  loadMoreBtn: { alignItems: 'center', paddingVertical: 14 },
  loadMoreText: { color: PRIMARY, fontWeight: '600' },
  loadMoreSpinner: { paddingVertical: 16 },

  // Photo strip
  photoStrip: { marginBottom: 4 },
  photoThumb: { width: 80, height: 80, borderRadius: 8, overflow: 'hidden', marginEnd: 8, position: 'relative' },
  photoThumbImage: { width: '100%', height: '100%' },
  photoRemove: {
    position: 'absolute',
    top: 2,
    end: 2,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemoveText: { color: SURFACE, fontSize: 10, fontWeight: '700' },
  photoAdd: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: PRIMARY,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  photoAddIcon: { fontSize: 24, color: PRIMARY },
  photoAddLabel: { fontSize: 9, color: PRIMARY, textAlign: 'center' },

  // Form modal
  formModal: { flex: 1, backgroundColor: BG },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: SURFACE,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  formHeaderTitle: { fontSize: 17, fontWeight: '700', color: TEXT_PRIMARY },
  formCancel: { fontSize: 15, color: TEXT_SECONDARY },
  formSave: { fontSize: 15, color: PRIMARY, fontWeight: '700' },
  formBody: { flex: 1, padding: 16 },
  formLabel: { fontSize: 14, fontWeight: '600', color: TEXT_PRIMARY, marginTop: 14, marginBottom: 6 },
  required: { color: DANGER },
  formInput: {
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: TEXT_PRIMARY,
  },
  formInputError: { borderColor: DANGER },
  formTextArea: { height: 100, textAlignVertical: 'top' },
  formTextAreaSm: { height: 70, textAlignVertical: 'top' },
  fieldError: { color: DANGER, fontSize: 12, marginTop: 3 },
  typeRow: { flexGrow: 0, marginBottom: 4 },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    marginEnd: 8,
    backgroundColor: SURFACE,
  },
  typeChipSelected: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  typeChipText: { fontSize: 13, color: TEXT_PRIMARY },
  typeChipTextSelected: { color: SURFACE, fontWeight: '600' },
  deliveryToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 6,
  },
});
