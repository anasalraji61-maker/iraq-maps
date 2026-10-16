import { href, useApi, useSession } from '@iraq-maps/mobile-kit';
import { Button, Screen, Text, TextField } from '@iraq-maps/ui';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState, type ReactElement } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View, Text as RNText } from 'react-native';
import { expectStatus, useRequest } from './request';
import { ScreenTitle } from './ScreenTitle';
import { t } from './strings';

const PRIMARY = '#1976D2';
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

function AvatarPicker({
  uri,
  name,
  onPick,
}: {
  uri: string | null;
  name: string;
  onPick: (uri: string) => void;
}): ReactElement {
  const initials = name.trim()
    ? name.trim().split(/\s+/).map((p) => p.charAt(0).toUpperCase()).slice(0, 2).join('')
    : '?';

  const pick = async () => {
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
        onPress={() => { void pick(); }}
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
      <View style={styles.photoButtons}>
        <Pressable onPress={() => { void pick(); }} style={styles.photoButton} accessibilityRole="button">
          <Text style={styles.photoButtonText}>{t('profileSetup.gallery')}</Text>
        </Pressable>
        <Pressable onPress={() => { void pickCamera(); }} style={styles.photoButton} accessibilityRole="button">
          <Text style={styles.photoButtonText}>{t('profileSetup.camera')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

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
      <Text style={[styles.tagLabel, selected && styles.tagLabelSelected]}>{t(tag.labelKey)}</Text>
    </Pressable>
  );
}

/**
 * Profile setup screen shown after first sign-in (or reachable from settings).
 * Covers display name, avatar, bio and interest tags.
 */
export function ProfileSetupScreen(): ReactElement {
  const api = useApi();
  const session = useSession();
  const router = useRouter();
  const { busy, error, run } = useRequest();

  const currentName = session.state.status === 'signedIn' ? (session.state.user.name ?? '') : '';
  const [name, setName] = useState(currentName);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [bio, setBio] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  const toggleTag = (key: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const save = () =>
    run(async () => {
      session.updateUser(
        expectStatus(await api.me.update({ body: { name: name.trim() || undefined } }), 200),
      );
      router.dismissTo(href('account'));
    });

  const skip = () => router.dismissTo(href('account'));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ScreenTitle title={t('profileSetup.title')} />
        <Text tone="muted" style={styles.subtitle}>{t('profileSetup.body')}</Text>

        <AvatarPicker uri={avatarUri} name={name} onPick={setAvatarUri} />

        <TextField
          label={t('profileSetup.nameLabel')}
          value={name}
          onChangeText={setName}
          maxLength={80}
          error={error}
          autoFocus
        />

        <View style={styles.bioSection}>
          <TextField
            label={t('profileSetup.bioLabel')}
            value={bio}
            onChangeText={(v) => setBio(v.slice(0, BIO_MAX))}
            maxLength={BIO_MAX}
            multiline
          />
          <Text
            tone="muted"
            variant="caption"
            style={[styles.charCount, bio.length >= BIO_MAX && styles.charCountLimit]}
          >
            {bio.length}/{BIO_MAX}
          </Text>
        </View>

        <Text variant="subtitle" style={styles.tagsHeading}>{t('profileSetup.interests.title')}</Text>
        <Text tone="muted" style={styles.tagsSubtext}>{t('profileSetup.interests.body')}</Text>
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

        <View style={styles.actions}>
          <Button
            label={t('profileSetup.save')}
            onPress={save}
            disabled={!name.trim()}
            loading={busy}
          />
          <Button variant="secondary" label={t('profileSetup.skip')} onPress={skip} disabled={busy} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, paddingBottom: 48, gap: 16 },
  subtitle: { marginBottom: 8 },
  avatarSection: { alignItems: 'center', gap: 12, paddingVertical: 8 },
  avatarWrapper: { position: 'relative' },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: PRIMARY,
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
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
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
    borderColor: PRIMARY,
  },
  photoButtonText: { color: PRIMARY, fontWeight: '600' },
  bioSection: { gap: 4 },
  charCount: { textAlign: 'auto' },
  charCountLimit: { color: '#C62828' },
  tagsHeading: { marginTop: 8 },
  tagsSubtext: { marginBottom: 8 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    backgroundColor: '#FAFAFA',
  },
  tagSelected: { borderColor: PRIMARY, backgroundColor: '#E3F2FD' },
  tagIcon: { fontSize: 16 },
  tagLabel: { fontSize: 14, fontWeight: '500' },
  tagLabelSelected: { color: PRIMARY, fontWeight: '700' },
  actions: { gap: 8, marginTop: 8 },
});
