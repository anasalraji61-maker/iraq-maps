/**
 * ProfileSetupScreen – profile completion after first sign-in.
 *
 * Sections:
 *  1. Avatar: gallery pick or camera capture, with initials fallback
 *  2. Display name (required to save)
 *  3. Bio in Arabic (max 150 chars with live counter)
 *  4. City selection (Baghdad / Erbil / Basra / Mosul / other)
 *  5. Interests multi-select (8 tags)
 *  6. Privacy defaults explanation with inline toggles
 *  7. Actions: Save | Complete later
 *
 * RTL-safe throughout (start/end, I18nManager).
 */

import { href, useApi, useHaptics, useSession } from '@iraq-maps/mobile-kit';
import { Button, Screen, Text, TextField, tokens } from '@iraq-maps/ui';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState, type ReactElement } from 'react';
import {
  I18nManager,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
  Text as RNText,
} from 'react-native';
import { expectStatus, useRequest } from './request';
import { ScreenTitle } from './ScreenTitle';
import { t } from './strings';

// ── Constants ────────────────────────────────────────────────────────────────

const BIO_MAX = 150;

type InterestTag = {
  key: string;
  labelKey: Parameters<typeof t>[0];
  icon: string;
};

const INTEREST_TAGS: InterestTag[] = [
  { key: 'places', labelKey: 'profileSetup.interests.places', icon: '🏛️' },
  { key: 'food', labelKey: 'profileSetup.interests.food', icon: '🍽️' },
  { key: 'travel', labelKey: 'profileSetup.interests.travel', icon: '✈️' },
  { key: 'shopping', labelKey: 'profileSetup.interests.shopping', icon: '🛍️' },
  { key: 'culture', labelKey: 'profileSetup.interests.culture', icon: '🎭' },
  { key: 'sports', labelKey: 'profileSetup.interests.sports', icon: '⚽' },
  { key: 'nature', labelKey: 'profileSetup.interests.nature', icon: '🌿' },
  { key: 'business', labelKey: 'profileSetup.interests.business', icon: '💼' },
];

type CityKey = 'baghdad' | 'erbil' | 'basra' | 'mosul' | 'other';
const CITIES: CityKey[] = ['baghdad', 'erbil', 'basra', 'mosul', 'other'];

// ── AvatarPicker ─────────────────────────────────────────────────────────────

function AvatarPicker({
  uri,
  name,
  onPick,
}: {
  uri: string | null;
  name: string;
  onPick: (uri: string) => void;
}): ReactElement {
  const haptics = useHaptics();
  const initials = name.trim()
    ? name
        .trim()
        .split(/\s+/)
        .map((p) => p.charAt(0).toUpperCase())
        .slice(0, 2)
        .join('')
    : '?';

  const pickGallery = async () => {
    haptics.tap();
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) onPick(result.assets[0].uri);
  };

  const pickCamera = async () => {
    haptics.tap();
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) onPick(result.assets[0].uri);
  };

  return (
    <View style={styles.avatarSection}>
      <Pressable
        onPress={() => void pickGallery()}
        accessibilityRole="button"
        accessibilityLabel={t('profileSetup.changePhoto')}
        style={styles.avatarWrapper}
      >
        {uri ? (
          <Image source={{ uri }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <RNText style={styles.avatarInitials}>{initials}</RNText>
          </View>
        )}
        <View style={styles.editBadge}>
          <RNText style={styles.editBadgeText}>📷</RNText>
        </View>
      </Pressable>
      <View style={[styles.photoButtons, I18nManager.isRTL && styles.rowReversed]}>
        <Pressable
          onPress={() => void pickGallery()}
          style={styles.photoButton}
          accessibilityRole="button"
        >
          <RNText style={styles.photoButtonText}>{t('profileSetup.gallery')}</RNText>
        </Pressable>
        <Pressable
          onPress={() => void pickCamera()}
          style={styles.photoButton}
          accessibilityRole="button"
        >
          <RNText style={styles.photoButtonText}>{t('profileSetup.camera')}</RNText>
        </Pressable>
      </View>
    </View>
  );
}

// ── TagChip ──────────────────────────────────────────────────────────────────

function TagChip({
  tag,
  selected,
  onToggle,
}: {
  tag: InterestTag;
  selected: boolean;
  onToggle: () => void;
}): ReactElement {
  return (
    <Pressable
      onPress={onToggle}
      style={[styles.tag, selected && styles.tagSelected]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={t(tag.labelKey)}
    >
      <RNText style={styles.tagIcon}>{tag.icon}</RNText>
      <RNText style={[styles.tagLabel, selected && styles.tagLabelSelected]}>
        {t(tag.labelKey)}
      </RNText>
    </Pressable>
  );
}

// ── CityPicker ───────────────────────────────────────────────────────────────

function CityPicker({
  selected,
  onSelect,
}: {
  selected: CityKey | null;
  onSelect: (c: CityKey) => void;
}): ReactElement {
  return (
    <View>
      <Text variant="subtitle" style={styles.sectionHeading}>
        {t('profileSetup.city.title')}
      </Text>
      <View style={styles.cityGrid}>
        {CITIES.map((city) => (
          <Pressable
            key={city}
            style={[styles.cityChip, selected === city && styles.cityChipSelected]}
            onPress={() => onSelect(city)}
            accessibilityRole="radio"
            accessibilityState={{ selected: selected === city }}
          >
            <RNText
              style={[styles.cityChipText, selected === city && styles.cityChipTextSelected]}
            >
              {t(`profileSetup.city.${city}` as Parameters<typeof t>[0])}
            </RNText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ── PrivacyDefaults ──────────────────────────────────────────────────────────

interface PrivacySettings {
  profilePublic: boolean;
  activityVisible: boolean;
  locationSharing: boolean;
}

function PrivacyDefaultsSection({
  settings,
  onChange,
}: {
  settings: PrivacySettings;
  onChange: (key: keyof PrivacySettings, value: boolean) => void;
}): ReactElement {
  const rows: { key: keyof PrivacySettings; titleKey: Parameters<typeof t>[0]; bodyKey: Parameters<typeof t>[0] }[] = [
    { key: 'profilePublic', titleKey: 'profileSetup.privacy.profilePublic', bodyKey: 'profileSetup.privacy.profilePublicDesc' },
    { key: 'activityVisible', titleKey: 'profileSetup.privacy.activityVisible', bodyKey: 'profileSetup.privacy.activityVisibleDesc' },
    { key: 'locationSharing', titleKey: 'profileSetup.privacy.locationSharing', bodyKey: 'profileSetup.privacy.locationSharingDesc' },
  ];

  return (
    <View>
      <Text variant="subtitle" style={styles.sectionHeading}>
        {t('profileSetup.privacy.title')}
      </Text>
      <Text tone="muted" style={styles.sectionSubtext}>
        {t('profileSetup.privacy.body')}
      </Text>
      <View style={styles.privacyList}>
        {rows.map(({ key, titleKey, bodyKey }) => (
          <View key={key} style={[styles.privacyRow, I18nManager.isRTL && styles.rowReversed]}>
            <View style={styles.privacyText}>
              <RNText style={styles.privacyTitle}>{t(titleKey)}</RNText>
              <RNText style={styles.privacyDesc}>{t(bodyKey)}</RNText>
            </View>
            <Switch
              value={settings[key]}
              onValueChange={(v) => onChange(key, v)}
              thumbColor={settings[key] ? tokens.color.primary : tokens.color.border}
              trackColor={{ false: tokens.color.border, true: `${tokens.color.primary}66` }}
              accessibilityLabel={t(titleKey)}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

// ── ProfileSetupScreen ───────────────────────────────────────────────────────

/**
 * Profile completion screen shown after first sign-in.
 * Reaches account tab on save or skip.
 */
export function ProfileSetupScreen(): ReactElement {
  const api = useApi();
  const session = useSession();
  const router = useRouter();
  const { busy, error, run } = useRequest();
  const haptics = useHaptics();

  const currentName =
    session.state.status === 'signedIn' ? (session.state.user.name ?? '') : '';

  const [name, setName] = useState(currentName);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [bio, setBio] = useState('');
  const [city, setCity] = useState<CityKey | null>(null);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [privacy, setPrivacy] = useState<PrivacySettings>({
    profilePublic: true,
    activityVisible: true,
    locationSharing: false,
  });

  const toggleTag = (key: string) => {
    haptics.tap();
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const updatePrivacy = (key: keyof PrivacySettings, value: boolean) => {
    haptics.tap();
    setPrivacy((prev) => ({ ...prev, [key]: value }));
  };

  const save = () =>
    run(async () => {
      session.updateUser(
        expectStatus(await api.me.update({ body: { name: name.trim() || undefined } }), 200),
      );
      haptics.sent();
      router.dismissTo(href('account'));
    });

  const skip = () => {
    haptics.tap();
    router.dismissTo(href('account'));
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenTitle title={t('profileSetup.title')} />
        <Text tone="muted" style={styles.subtitle}>
          {t('profileSetup.body')}
        </Text>

        {/* ── 1. Avatar ── */}
        <AvatarPicker uri={avatarUri} name={name} onPick={setAvatarUri} />

        {/* ── 2. Display name ── */}
        <TextField
          label={t('profileSetup.nameLabel')}
          value={name}
          onChangeText={setName}
          maxLength={80}
          error={error}
          autoFocus
        />

        {/* ── 3. Bio ── */}
        <View style={styles.bioSection}>
          <TextField
            label={t('profileSetup.bioLabel')}
            value={bio}
            onChangeText={(v) => setBio(v.slice(0, BIO_MAX))}
            maxLength={BIO_MAX}
            multiline
          />
          <RNText
            style={[styles.charCount, bio.length >= BIO_MAX && styles.charCountLimit]}
          >
            {bio.length}/{BIO_MAX}
          </RNText>
        </View>

        {/* ── 4. City ── */}
        <CityPicker selected={city} onSelect={setCity} />

        {/* ── 5. Interests ── */}
        <Text variant="subtitle" style={styles.sectionHeading}>
          {t('profileSetup.interests.title')}
        </Text>
        <Text tone="muted" style={styles.sectionSubtext}>
          {t('profileSetup.interests.body')}
        </Text>
        <View style={styles.tags}>
          {INTEREST_TAGS.map((tag) => (
            <TagChip
              key={tag.key}
              tag={tag}
              selected={selectedTags.has(tag.key)}
              onToggle={() => toggleTag(tag.key)}
            />
          ))}
        </View>

        {/* ── 6. Privacy defaults ── */}
        <PrivacyDefaultsSection settings={privacy} onChange={updatePrivacy} />

        {/* ── 7. Actions ── */}
        <View style={styles.actions}>
          <Button
            label={t('profileSetup.save')}
            onPress={save}
            disabled={!name.trim()}
            loading={busy}
          />
          <Button
            variant="secondary"
            label={t('profileSetup.skip')}
            onPress={skip}
            disabled={busy}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, paddingBottom: 48, gap: 16 },
  subtitle: { marginBottom: 4 },
  rowReversed: { flexDirection: 'row-reverse' },

  // Avatar
  avatarSection: { alignItems: 'center', gap: 12, paddingVertical: 8 },
  avatarWrapper: { position: 'relative' },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: tokens.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { fontSize: 36, fontWeight: '700', color: '#fff' },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    end: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBadgeText: { fontSize: 14 },
  photoButtons: { flexDirection: 'row', gap: 12 },
  photoButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: tokens.color.primary,
  },
  photoButtonText: {
    color: tokens.color.primary,
    fontWeight: '600',
    fontSize: 13,
  },

  // Bio
  bioSection: { gap: 4 },
  charCount: {
    fontSize: 12,
    color: tokens.color.textMuted,
    textAlign: 'auto',
  },
  charCountLimit: { color: tokens.color.danger },

  // Section headings
  sectionHeading: { marginTop: 8, marginBottom: 4 },
  sectionSubtext: { marginBottom: 8 },

  // City picker
  cityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cityChip: {
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: tokens.color.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  cityChipSelected: {
    borderColor: tokens.color.primary,
    backgroundColor: `${tokens.color.primary}15`,
  },
  cityChipText: {
    fontSize: 14,
    color: tokens.color.text,
  },
  cityChipTextSelected: {
    color: tokens.color.primary,
    fontWeight: '600',
  },

  // Interests
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  tagSelected: {
    borderColor: tokens.color.primary,
    backgroundColor: `${tokens.color.primary}15`,
  },
  tagIcon: { fontSize: 16 },
  tagLabel: { fontSize: 14, fontWeight: '500', color: tokens.color.text },
  tagLabelSelected: { color: tokens.color.primary, fontWeight: '700' },

  // Privacy
  privacyList: { gap: 12, marginTop: 8 },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: tokens.color.surface,
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  privacyText: { flex: 1, gap: 2 },
  privacyTitle: { fontSize: 14, fontWeight: '600', color: tokens.color.text },
  privacyDesc: { fontSize: 12, color: tokens.color.textMuted },

  // Actions
  actions: { gap: 8, marginTop: 8 },
});
