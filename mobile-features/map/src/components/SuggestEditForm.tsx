import { type ReactElement, useState } from 'react';
import { Alert, I18nManager, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { t, isolate } from '../strings';

const rtlAlign = I18nManager.getConstants().isRTL ? 'right' : 'left' as const;

interface Props {
  placeId: string;
  /** Called with the user's suggestions; implementer fires the API call. */
  onSubmit: (data: { hours?: string; phone?: string; description?: string }) => Promise<void>;
}

/** Inline "Suggest Edit" form for missing place info. */
export function SuggestEditForm({ onSubmit }: Props): ReactElement {
  const [expanded, setExpanded] = useState(false);
  const [hours, setHours] = useState('');
  const [phone, setPhone] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!expanded) {
    return (
      <Pressable
        testID="place.suggestEditBtn"
        style={styles.collapsedBtn}
        onPress={() => setExpanded(true)}
        accessibilityRole="button"
        accessibilityLabel={t('place.suggestEdit')}
      >
        <Text style={styles.collapsedLabel}>{t('place.suggestEdit')}</Text>
      </Pressable>
    );
  }

  const handleSubmit = async () => {
    if (!hours.trim() && !phone.trim() && !description.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        hours: hours.trim() || undefined,
        phone: phone.trim() || undefined,
        description: description.trim() || undefined,
      });
      Alert.alert(t('place.suggestEditSuccess'));
      setExpanded(false);
      setHours('');
      setPhone('');
      setDescription('');
    } catch {
      // best-effort; keep form open
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.form} testID="place.suggestEditForm">
      <Text style={styles.title}>{t('place.suggestEditTitle')}</Text>
      <Text style={styles.fieldLabel}>{t('place.suggestEditHours')}</Text>
      <TextInput
        testID="place.suggestEditHours"
        style={styles.input}
        value={hours}
        onChangeText={setHours}
        placeholder={isolate(t('place.suggestEditHoursPlaceholder'))}
        placeholderTextColor="#9E9E9E"
        textAlign={rtlAlign}
      />
      <Text style={styles.fieldLabel}>{t('place.suggestEditPhone')}</Text>
      <TextInput
        testID="place.suggestEditPhone"
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholder={isolate(t('place.suggestEditPhonePlaceholder'))}
        placeholderTextColor="#9E9E9E"
        textAlign={rtlAlign}
      />
      <Text style={styles.fieldLabel}>{t('place.suggestEditDescription')}</Text>
      <TextInput
        testID="place.suggestEditDesc"
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={3}
        placeholder={t('place.suggestEditDescPlaceholder')}
        placeholderTextColor="#9E9E9E"
        textAlign={rtlAlign}
      />
      <View style={styles.btnRow}>
        <Pressable
          testID="place.suggestEditCancel"
          style={styles.cancelBtn}
          onPress={() => setExpanded(false)}
          accessibilityRole="button"
          accessibilityLabel={t('place.suggestEditCancel')}
        >
          <Text style={styles.cancelLabel}>{t('place.suggestEditCancel')}</Text>
        </Pressable>
        <Pressable
          testID="place.suggestEditSubmit"
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={() => { void handleSubmit(); }}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel={t('place.suggestEditSubmit')}
        >
          <Text style={styles.submitLabel}>{t('place.suggestEditSubmit')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  collapsedBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BDBDBD',
    alignItems: 'center',
  },
  collapsedLabel: { color: '#424242', fontSize: 14 },
  form: { marginTop: 8, gap: 6 },
  title: { fontSize: 14, fontWeight: '700' },
  fieldLabel: { fontSize: 12, color: '#616161', marginTop: 4 },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#212121',
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 8, justifyContent: 'flex-end' },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BDBDBD',
  },
  cancelLabel: { fontSize: 13, color: '#424242' },
  submitBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: '#1976D2',
  },
  submitBtnDisabled: { backgroundColor: '#B0BEC5' },
  submitLabel: { fontSize: 13, color: '#FFF', fontWeight: '600' },
});
