import { testIDs, type PlaceCategory } from '@iraq-maps/contracts';
import { useApi, useApiBaseUrl, uploadAsset } from '@iraq-maps/mobile-kit';
import { Banner, Button, ListItem, Screen, Text, TextField } from '@iraq-maps/ui';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState, type ReactElement } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View, Text as RNText } from 'react-native';
import { expectStatus, useRequest } from '../request';
import { t } from '../strings';
import { SkeletonBlock } from '../skeleton';
import { HoursEditor, type WeekSlots, slotsToOsm, osmToSlots, defaultSlots } from '../components/HoursEditor';


const CATEGORIES: PlaceCategory[] = [
  'food', 'cafe', 'lodging', 'shopping', 'tourism', 'health',
  'finance', 'fuel', 'office', 'worship', 'education', 'government', 'transport', 'entertainment',
];

const LOGO_SIZE = 80;

function EditProfileSkeleton(): ReactElement {
  return (
    <Screen>
      <SkeletonBlock width={160} height={22} />
      <View style={styles.logoContainer}>
        <View
          style={{ width: LOGO_SIZE, height: LOGO_SIZE, borderRadius: LOGO_SIZE / 2, backgroundColor: '#E0E0E0' }}
          accessibilityElementsHidden
        />
      </View>
      <View style={{ gap: 10, marginTop: 8 }}>
        <SkeletonBlock width={80} height={12} />
        <SkeletonBlock width={280} height={40} />
        <SkeletonBlock width={120} height={16} />
        <SkeletonBlock width={280} height={40} />
        <SkeletonBlock width={80} height={12} />
        <SkeletonBlock width={280} height={40} />
      </View>
    </Screen>
  );
}

/** Lets a verified provider update their name, category, hours, logo and photos. */
export function ProviderEditProfileScreen(): ReactElement {
  const api = useApi();
  const apiBaseUrl = useApiBaseUrl();
  const { busy, error, setError, run } = useRequest();

  // loaded from /providers/me
  const [name, setName] = useState('');
  const [category, setCategory] = useState<PlaceCategory | null>(null);
  const [hoursSlots, setHoursSlots] = useState<WeekSlots>(defaultSlots());
  const [avgResponseHours, setAvgResponseHours] = useState<string>('');
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [logoAssetId, setLogoAssetId] = useState<string | null>(null);
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.providers.me().then((res) => {
      if (res.status === 200) {
        setName(res.body.name);
        setCategory(res.body.category);
        setHoursSlots(osmToSlots(res.body.hoursRaw ?? ''));
        if (res.body.avgResponseHours != null) setAvgResponseHours(String(res.body.avgResponseHours));
      }
    }).catch(() => {
      setError(t('errors.invalid_request'));
    }).finally(() => setLoading(false));
  }, [api]);

  const pickLogo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || result.assets.length === 0) return;
    const uri = result.assets[0]!.uri;
    setLogoUri(uri);
    setUploading(true);
    try {
      const assetId = await uploadAsset(api, apiBaseUrl, { uri, purpose: 'provider_logo' });
      setLogoAssetId(assetId as string);
    } catch {
      setLogoUri(null);
    } finally {
      setUploading(false);
    }
  };

  const pickPhoto = async () => {
    if (photoUris.length >= 5) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
    });
    if (result.canceled || result.assets.length === 0) return;
    setPhotoUris((prev) => [...prev, result.assets[0]!.uri]);
  };

  const save = () =>
    run(async () => {
      if (!name.trim()) { setError(t('edit.name')); return; }

      const photoAssetIds = await Promise.all(
        photoUris.map((uri) => uploadAsset(api, apiBaseUrl, { uri, purpose: 'provider_photo' })),
      );

      expectStatus(
        await api.providers.update({
          body: {
            name: name.trim(),
            ...(category ? { category } : {}),
            hoursRaw: slotsToOsm(hoursSlots) || null,
            avgResponseHours: avgResponseHours.trim() ? parseInt(avgResponseHours.trim(), 10) || null : null,
            ...(photoAssetIds.length > 0 ? { photoAssetIds } : {}),
            ...(logoAssetId ? { logoAssetId } : {}),
          },
        }),
        200,
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });

  if (loading) return <EditProfileSkeleton />;

  return (
    <Screen scroll>
      <Text variant="title">{t('edit.title')}</Text>
      {error ? <Banner kind="error" message={error} /> : null}
      {saved ? <Banner kind="success" message={t('edit.saved')} /> : null}

      {/* Logo */}
      <View style={styles.logoContainer}>
        <Pressable
          onPress={() => { void pickLogo(); }}
          accessibilityLabel={t('edit.changeLogo')}
          accessibilityRole="button"
          style={styles.logoWrapper}
        >
          {logoUri ? (
            <Image source={{ uri: logoUri }} style={styles.logoImage} />
          ) : (
            <View style={styles.logoPlaceholder}>
              <RNText style={styles.logoIcon}>🏪</RNText>
            </View>
          )}
          {uploading ? (
            <View style={styles.uploadOverlay}>
              <ActivityIndicator color="#FFF" size="small" />
            </View>
          ) : (
            <View style={styles.cameraOverlay}>
              <RNText style={styles.cameraIcon}>📷</RNText>
            </View>
          )}
        </Pressable>
      </View>

      {/* Name */}
      <TextField
        label={t('edit.name')}
        value={name}
        onChangeText={setName}
        testID={testIDs.provider.nameInput}
      />

      {/* Category */}
      <Text variant="subtitle">{t('edit.category')}</Text>
      {CATEGORIES.map((cat) => (
        <ListItem
          key={cat}
          title={t(`category.${cat}`)}
          onPress={() => setCategory(cat)}
          subtitle={category === cat ? t('common.selected') : undefined}
          testID={category === cat ? testIDs.provider.category : undefined}
        />
      ))}

      {/* Hours — structured day-by-day editor */}
      <HoursEditor slots={hoursSlots} onChange={setHoursSlots} />

      {/* Response time */}
      <TextField
        label={t('edit.avgResponseHours')}
        value={avgResponseHours}
        onChangeText={setAvgResponseHours}
        keyboardType="number-pad"
        testID="provider.avgResponseHoursInput"
        placeholder={t('edit.avgResponseHoursPlaceholder')}
      />

      {/* Photos */}
      <Text variant="subtitle">{t('edit.photos')}</Text>
      {photoUris.length > 0 && (
        <View style={styles.photoRow}>
          {photoUris.map((uri, i) => (
            <Image key={i} source={{ uri }} style={styles.photoThumb} />
          ))}
        </View>
      )}
      <Button
        testID={testIDs.provider.photosAdd}
        variant="secondary"
        label={t('edit.addPhoto')}
        onPress={() => { void pickPhoto(); }}
        disabled={busy || photoUris.length >= 5}
      />

      <Button
        testID={testIDs.provider.save}
        label={t('edit.save')}
        onPress={save}
        loading={busy}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  logoContainer: { alignItems: 'center', marginVertical: 12 },
  logoWrapper: { width: LOGO_SIZE, height: LOGO_SIZE, borderRadius: LOGO_SIZE / 2 },
  logoImage: { width: LOGO_SIZE, height: LOGO_SIZE, borderRadius: LOGO_SIZE / 2 },
  logoPlaceholder: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_SIZE / 2,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoIcon: { fontSize: 32 },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    end: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraIcon: { fontSize: 14 },
  uploadOverlay: {
    position: 'absolute',
    inset: 0,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  photoThumb: { width: 64, height: 64, borderRadius: 8 },
});
