/**
 * SavedAddressesScreen — manage saved delivery/navigation addresses.
 *
 * Features:
 *   - List saved addresses with icons (Home / Work / Other)
 *   - Set default delivery address
 *   - Add new address (navigates to AddressPickerScreen)
 *   - Edit address label or coordinates
 *   - Delete address
 *   - Inline map preview of selected address
 *   - Share address as a deep link
 *
 * Strings: account namespace, keys under `savedAddresses`.
 * Route: account/saved-addresses
 */
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  Alert,
  FlatList,
  I18nManager,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, EmptyState } from '@iraq-maps/ui';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  primary: '#1976D2',
  primaryLight: '#E3F2FD',
  surface: '#FFFFFF',
  bg: '#F5F5F5',
  text: '#1A1A1A',
  textSecondary: '#666666',
  textHint: '#9E9E9E',
  border: '#E0E0E0',
  separator: '#EEEEEE',
  danger: '#C62828',
  dangerLight: '#FDECEA',
  gold: '#F9A825',
  success: '#2E7D32',
  successLight: '#E8F5E9',
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

type AddressType = 'home' | 'work' | 'other';

interface SavedAddress {
  id: string;
  type: AddressType;
  name: string;
  fullAddress: string;
  shortAddress: string;
  lat: number;
  lng: number;
  isDefault: boolean;
  createdAt: string;
  notes?: string;
}

// ── Mock data (replaced by API in production) ─────────────────────────────────
function useSavedAddresses() {
  const [addresses, setAddresses] = useState<SavedAddress[]>([
    {
      id: '1',
      type: 'home',
      name: t('savedAddresses.home'),
      fullAddress: 'بغداد، الكرادة، شارع السعدون، بناية 14',
      shortAddress: 'الكرادة، شارع السعدون',
      lat: 33.30,
      lng: 44.38,
      isDefault: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: '2',
      type: 'work',
      name: t('savedAddresses.work'),
      fullAddress: 'بغداد، المنصور، شارع 14 تموز، مجمع المنصور التجاري',
      shortAddress: 'المنصور، شارع 14 تموز',
      lat: 33.32,
      lng: 44.34,
      isDefault: false,
      createdAt: new Date(Date.now() - 7 * 86400_000).toISOString(),
    },
  ]);

  const setDefault = useCallback((id: string) => {
    setAddresses((prev) => prev.map((a) => ({ ...a, isDefault: a.id === id })));
  }, []);

  const remove = useCallback((id: string) => {
    setAddresses((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const updateLabel = useCallback((id: string, name: string, type: AddressType) => {
    setAddresses((prev) => prev.map((a) => (a.id === id ? { ...a, name, type } : a)));
  }, []);

  return { addresses, setDefault, remove, updateLabel };
}

// ── Icon component ─────────────────────────────────────────────────────────────
function AddressIcon({ type }: { type: AddressType }): ReactElement {
  const iconMap: Record<AddressType, string> = {
    home: '🏠',
    work: '🏢',
    other: '📍',
  };
  return (
    <View style={iconStyles.wrap}>
      <Text style={iconStyles.emoji}>{iconMap[type]}</Text>
    </View>
  );
}

const iconStyles = StyleSheet.create({
  wrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 22 },
});

// ── DefaultBadge ───────────────────────────────────────────────────────────────
function DefaultBadge(): ReactElement {
  return (
    <View style={badgeStyles.wrap}>
      <Text style={badgeStyles.text}>{t('savedAddresses.default')}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  wrap: {
    backgroundColor: C.successLight,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  text: { fontSize: 11, color: C.success, fontWeight: '700' },
});

// ── AddressCard ────────────────────────────────────────────────────────────────
interface AddressCardProps {
  address: SavedAddress;
  onSetDefault: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onShare: () => void;
  onMapPreview: () => void;
}

function AddressCard({
  address,
  onSetDefault,
  onEdit,
  onDelete,
  onShare,
  onMapPreview,
}: AddressCardProps): ReactElement {
  const [expanded, setExpanded] = useState(false);

  return (
    <Pressable
      style={[cardStyles.card, address.isDefault && cardStyles.cardDefault]}
      onPress={() => setExpanded((v) => !v)}
      accessibilityRole="button"
      accessibilityLabel={address.name}
      testID={`address.card.${address.id}`}
    >
      <View style={cardStyles.row}>
        <AddressIcon type={address.type} />
        <View style={cardStyles.content}>
          <View style={cardStyles.nameRow}>
            <Text style={cardStyles.name}>{address.name}</Text>
            {address.isDefault && <DefaultBadge />}
          </View>
          <Text style={cardStyles.full} numberOfLines={expanded ? undefined : 2}>
            {address.fullAddress}
          </Text>
          {expanded && (
            <Text style={cardStyles.short}>{address.shortAddress}</Text>
          )}
        </View>
        <Text style={cardStyles.chevron}>{expanded ? '⌃' : '⌄'}</Text>
      </View>

      {expanded && (
        <View style={cardStyles.actions}>
          {/* Map preview */}
          <Pressable
            style={cardStyles.actionBtn}
            onPress={onMapPreview}
            testID={`address.map.${address.id}`}
          >
            <Text style={cardStyles.actionIcon}>🗺️</Text>
            <Text style={cardStyles.actionText}>{t('savedAddresses.mapView')}</Text>
          </Pressable>

          {/* Set default */}
          {!address.isDefault && (
            <Pressable
              style={cardStyles.actionBtn}
              onPress={onSetDefault}
              testID={`address.default.${address.id}`}
            >
              <Text style={cardStyles.actionIcon}>⭐</Text>
              <Text style={cardStyles.actionText}>{t('savedAddresses.setDefault')}</Text>
            </Pressable>
          )}

          {/* Share */}
          <Pressable
            style={cardStyles.actionBtn}
            onPress={onShare}
            testID={`address.share.${address.id}`}
          >
            <Text style={cardStyles.actionIcon}>🔗</Text>
            <Text style={cardStyles.actionText}>{t('savedAddresses.share')}</Text>
          </Pressable>

          {/* Edit */}
          <Pressable
            style={cardStyles.actionBtn}
            onPress={onEdit}
            testID={`address.edit.${address.id}`}
          >
            <Text style={cardStyles.actionIcon}>✏️</Text>
            <Text style={cardStyles.actionText}>{t('savedAddresses.edit')}</Text>
          </Pressable>

          {/* Delete */}
          <Pressable
            style={[cardStyles.actionBtn, cardStyles.actionBtnDanger]}
            onPress={onDelete}
            testID={`address.delete.${address.id}`}
          >
            <Text style={cardStyles.actionIcon}>🗑️</Text>
            <Text style={[cardStyles.actionText, cardStyles.actionTextDanger]}>
              {t('savedAddresses.delete')}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Coordinates */}
      {expanded && (
        <Text style={cardStyles.coords}>
          {address.lat.toFixed(6)}, {address.lng.toFixed(6)}
        </Text>
      )}
    </Pressable>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  cardDefault: {
    borderColor: C.primary,
    borderWidth: 1.5,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  content: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  name: { fontSize: 16, fontWeight: '700', color: C.text },
  full: { fontSize: 14, color: C.text, lineHeight: 20, textAlign: 'auto' },
  short: { fontSize: 13, color: C.textSecondary, textAlign: 'auto' },
  chevron: { fontSize: 20, color: C.textHint, marginTop: 2 },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.separator,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.bg,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  actionBtnDanger: { backgroundColor: C.dangerLight },
  actionIcon: { fontSize: 14 },
  actionText: { fontSize: 13, color: C.text, fontWeight: '500' },
  actionTextDanger: { color: C.danger },
  coords: {
    marginTop: 8,
    fontSize: 11,
    color: C.textHint,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlign: 'auto',
  },
});

// ── EditModal ─────────────────────────────────────────────────────────────────
function EditModal({
  address,
  onSave,
  onClose,
}: {
  address: SavedAddress;
  onSave: (name: string, type: AddressType) => void;
  onClose: () => void;
}): ReactElement {
  const [name, setName] = useState(address.name);
  const [type, setType] = useState<AddressType>(address.type);

  const typeOptions: Array<{ value: AddressType; label: string }> = [
    { value: 'home', label: t('savedAddresses.home') },
    { value: 'work', label: t('savedAddresses.work') },
    { value: 'other', label: t('savedAddresses.other') },
  ];

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={editStyles.overlay}>
        <View style={editStyles.card}>
          <Text style={editStyles.title}>{t('savedAddresses.editTitle')}</Text>
          <Text style={editStyles.sectionLabel}>{t('savedAddresses.typeLabel')}</Text>
          <View style={editStyles.typeRow}>
            {typeOptions.map((opt) => (
              <Pressable
                key={opt.value}
                style={[editStyles.typeBtn, type === opt.value && editStyles.typeBtnActive]}
                onPress={() => setType(opt.value)}
              >
                <Text style={[editStyles.typeBtnText, type === opt.value && editStyles.typeBtnTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={editStyles.sectionLabel}>{t('savedAddresses.nameLabel')}</Text>
          <TextInput
            style={editStyles.input}
            value={name}
            onChangeText={setName}
            placeholder={t('savedAddresses.namePlaceholder')}
            textAlign="right"
            returnKeyType="done"
          />
          <View style={editStyles.actions}>
            <Pressable style={editStyles.cancelBtn} onPress={onClose}>
              <Text style={editStyles.cancelText}>{t('savedAddresses.cancel')}</Text>
            </Pressable>
            <Pressable
              style={[editStyles.saveBtn, !name.trim() && editStyles.saveBtnDisabled]}
              onPress={() => name.trim() && onSave(name.trim(), type)}
              disabled={!name.trim()}
            >
              <Text style={editStyles.saveText}>{t('savedAddresses.saveChanges')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const editStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: C.surface, borderRadius: 16, padding: 24, width: '88%', gap: 12 },
  title: { fontSize: 18, fontWeight: '700', color: C.text, textAlign: 'auto' },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: C.textSecondary, textAlign: 'auto' },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeBtn: { flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1.5, borderColor: C.border, alignItems: 'center' },
  typeBtnActive: { borderColor: C.primary, backgroundColor: C.primaryLight },
  typeBtnText: { fontSize: 13, color: C.textSecondary, fontWeight: '500' },
  typeBtnTextActive: { color: C.primary },
  input: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: C.text,
    backgroundColor: C.bg,
  },
  actions: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end', paddingTop: 4 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 10 },
  cancelText: { fontSize: 15, color: C.textSecondary },
  saveBtn: { backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  saveBtnDisabled: { backgroundColor: C.textHint },
  saveText: { fontSize: 15, color: '#FFF', fontWeight: '600' },
});

// ── MapPreviewModal ────────────────────────────────────────────────────────────
function MapPreviewModal({
  address,
  onClose,
}: {
  address: SavedAddress;
  onClose: () => void;
}): ReactElement {
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={previewStyles.backdrop} onPress={onClose} />
      <View style={previewStyles.sheet}>
        <View style={previewStyles.handle} />
        <Text style={previewStyles.title}>{address.name}</Text>
        <Text style={previewStyles.addr}>{address.fullAddress}</Text>
        {/* Map placeholder */}
        <View style={previewStyles.mapBox}>
          <Text style={previewStyles.mapPlaceholder}>
            {/* In production: embed a small read-only MapLibre view centered at lat/lng */}
            🗺️ {address.lat.toFixed(5)}, {address.lng.toFixed(5)}
          </Text>
        </View>
        <Pressable style={previewStyles.closeBtn} onPress={onClose}>
          <Text style={previewStyles.closeBtnText}>{t('savedAddresses.close')}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const previewStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    backgroundColor: C.surface,
    borderTopStartRadius: 20,
    borderTopEndRadius: 20,
    padding: 20,
    paddingBottom: 36,
    gap: 12,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#DDD', alignSelf: 'center', marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '700', color: C.text, textAlign: 'auto' },
  addr: { fontSize: 14, color: C.textSecondary, lineHeight: 20, textAlign: 'auto' },
  mapBox: {
    height: 200,
    borderRadius: 12,
    backgroundColor: '#CFE2F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPlaceholder: { fontSize: 16, color: C.primary },
  closeBtn: { backgroundColor: C.bg, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  closeBtnText: { fontSize: 15, fontWeight: '600', color: C.text },
});

// ── Main Screen ────────────────────────────────────────────────────────────────
export function SavedAddressesScreen(): ReactElement {
  const router = useRouter();
  const { addresses, setDefault, remove, updateLabel } = useSavedAddresses();
  const [editTarget, setEditTarget] = useState<SavedAddress | null>(null);
  const [previewTarget, setPreviewTarget] = useState<SavedAddress | null>(null);

  const handleDelete = useCallback(
    (address: SavedAddress) => {
      Alert.alert(
        t('savedAddresses.deleteTitle'),
        t('savedAddresses.deleteConfirm', { name: address.name }),
        [
          { text: t('savedAddresses.cancel'), style: 'cancel' },
          {
            text: t('savedAddresses.delete'),
            style: 'destructive',
            onPress: () => remove(address.id),
          },
        ],
      );
    },
    [remove],
  );

  const handleShare = useCallback(async (address: SavedAddress) => {
    // Generate a maps deep-link: iraq-maps://place?lat=…&lng=…&name=…
    const link = `iraq-maps://place?lat=${address.lat}&lng=${address.lng}&name=${encodeURIComponent(address.name)}`;
    try {
      await Share.share({
        message: `${address.name}\n${address.fullAddress}\n${link}`,
        title: address.name,
      });
    } catch {
      // User cancelled or share failed; ignore
    }
  }, []);

  return (
    <Screen testID="saved-addresses-screen">
      <View style={styles.header}>
        <Text style={styles.title}>{t('savedAddresses.title')}</Text>
        <Pressable
          style={styles.addBtn}
          onPress={() => router.push('/address/pick')}
          testID="savedAddresses.addBtn"
          accessibilityRole="button"
          accessibilityLabel={t('savedAddresses.addAddress')}
        >
          <Text style={styles.addBtnText}>{t('savedAddresses.addAddress')}</Text>
        </Pressable>
      </View>

      {addresses.length === 0 ? (
        <EmptyState
          title={t('savedAddresses.empty')}
          body={t('savedAddresses.emptyBody')}
        />
      ) : (
        <FlatList
          data={addresses}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <AddressCard
              address={item}
              onSetDefault={() => setDefault(item.id)}
              onEdit={() => setEditTarget(item)}
              onDelete={() => handleDelete(item)}
              onShare={() => void handleShare(item)}
              onMapPreview={() => setPreviewTarget(item)}
            />
          )}
          ListFooterComponent={
            <Pressable
              style={styles.addCardBtn}
              onPress={() => router.push('/address/pick')}
            >
              <Text style={styles.addCardBtnText}>+ {t('savedAddresses.addAddress')}</Text>
            </Pressable>
          }
          scrollEnabled
        />
      )}

      {editTarget && (
        <EditModal
          address={editTarget}
          onSave={(name, type) => {
            updateLabel(editTarget.id, name, type);
            setEditTarget(null);
          }}
          onClose={() => setEditTarget(null)}
        />
      )}

      {previewTarget && (
        <MapPreviewModal
          address={previewTarget}
          onClose={() => setPreviewTarget(null)}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: C.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  title: { fontSize: 20, fontWeight: '700', color: C.text },
  addBtn: {
    backgroundColor: C.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  addBtnText: { fontSize: 13, color: '#FFF', fontWeight: '600' },
  list: { padding: 16, paddingBottom: 32 },
  addCardBtn: {
    borderWidth: 1.5,
    borderColor: C.primary,
    borderRadius: 12,
    borderStyle: 'dashed',
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  addCardBtnText: { fontSize: 15, color: C.primary, fontWeight: '600' },
});
