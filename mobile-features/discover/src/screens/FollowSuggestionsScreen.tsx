/**
 * FollowSuggestionsScreen — "People you may know" with reasons,
 * bulk follow selected, and dismiss suggestion.
 *
 * Route: discover/suggestions
 */
import { type ReactElement, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { t } from '../strings';
import { COLORS } from './shared';

// ─── Types ───────────────────────────────────────────────────────────────────

type SuggestionReason = 'mutual_follow' | 'location' | 'popular' | 'interest';

interface Suggestion {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  mutualCount: number;
  reason: SuggestionReason;
}

interface Props {
  onNavigateProfile?: (userId: string) => void;
  onBack?: () => void;
}

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function mockSuggestions(): Suggestion[] {
  const reasons: SuggestionReason[] = ['mutual_follow', 'popular', 'location', 'interest', 'mutual_follow'];
  return Array.from({ length: 12 }, (_, i) => ({
    userId: `suggest-${i}`,
    displayName: t('suggestions.mock.displayName', { n: String(i + 1) }),
    avatarUrl: null,
    isVerified: i % 4 === 0,
    mutualCount: i % 3 === 0 ? i + 1 : 0,
    reason: reasons[i % reasons.length]!,
  }));
}

function reasonLabel(reason: SuggestionReason, mutualCount: number): string {
  switch (reason) {
    case 'mutual_follow':
      return mutualCount > 0
        ? t('suggestions.reasonMutual', { count: mutualCount })
        : t('suggestions.reasonMutualGeneric');
    case 'location':
      return t('suggestions.reasonLocation');
    case 'popular':
      return t('suggestions.reasonPopular');
    case 'interest':
      return t('suggestions.reasonInterest');
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SuggestionCard({
  suggestion,
  selected,
  onSelect,
  onDismiss,
  onPress,
}: {
  suggestion: Suggestion;
  selected: boolean;
  onSelect: (id: string) => void;
  onDismiss: (id: string) => void;
  onPress: (id: string) => void;
}): ReactElement {
  return (
    <Pressable
      style={[styles.card, selected && styles.cardSelected]}
      onPress={() => onPress(suggestion.userId)}
      accessibilityRole="button"
      testID={`suggestion.card.${suggestion.userId}`}
    >
      {/* Dismiss button */}
      <Pressable
        style={styles.dismissBtn}
        onPress={() => onDismiss(suggestion.userId)}
        accessibilityRole="button"
        accessibilityLabel={t('suggestions.dismissA11y', { name: suggestion.displayName })}
        testID={`suggestion.dismiss.${suggestion.userId}`}
      >
        <Text style={styles.dismissIcon}>{t('suggestions.dismissIcon')}</Text>
      </Pressable>

      {/* Selection checkbox */}
      <Pressable
        style={[styles.checkbox, selected && styles.checkboxSelected]}
        onPress={() => onSelect(suggestion.userId)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={t('suggestions.selectA11y', { name: suggestion.displayName })}
      >
        {selected && <Text style={styles.checkmark}>{t('suggestions.checkmark')}</Text>}
      </Pressable>

      {/* Avatar */}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{suggestion.displayName.slice(0, 1)}</Text>
      </View>

      {/* Name + verified */}
      <View style={styles.nameRow}>
        <Text style={styles.displayName} numberOfLines={1}>{suggestion.displayName}</Text>
        {suggestion.isVerified && (
          <View style={styles.verifiedBadge}>
            <Text style={styles.verifiedIcon}>{t('suggestions.verifiedIcon')}</Text>
          </View>
        )}
      </View>

      {/* Reason chip */}
      <View style={styles.reasonChip}>
        <Text style={styles.reasonText} numberOfLines={1}>
          {reasonLabel(suggestion.reason, suggestion.mutualCount)}
        </Text>
      </View>
    </Pressable>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function FollowSuggestionsScreen({ onNavigateProfile, onBack }: Props): ReactElement {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await new Promise((r) => setTimeout(r, 250));
      setSuggestions(mockSuggestions());
    } catch {
      setError(t('suggestions.loadError'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleDismiss = useCallback((targetId: string) => {
    // Production: call API dismissSuggestion
    setSuggestions((prev) => prev.filter((s) => s.userId !== targetId));
    setSelected((prev) => { const next = new Set(prev); next.delete(targetId); return next; });
  }, []);

  const handleSelect = useCallback((targetId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(targetId)) next.delete(targetId);
      else next.add(targetId);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selected.size === suggestions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(suggestions.map((s) => s.userId)));
    }
  }, [selected.size, suggestions]);

  const handleBulkFollow = useCallback(async () => {
    if (selected.size === 0) return;
    setBulkLoading(true);
    try {
      // Production: call API followUser for each selected
      await new Promise((r) => setTimeout(r, 400));
      const followedIds = [...selected];
      setSuggestions((prev) => prev.filter((s) => !followedIds.includes(s.userId)));
      setSelected(new Set());
      Alert.alert(t('suggestions.bulkFollowSuccess', { count: followedIds.length }));
    } catch {
      Alert.alert(t('suggestions.bulkFollowError'));
    } finally {
      setBulkLoading(false);
    }
  }, [selected]);

  const allSelected = useMemo(
    () => suggestions.length > 0 && selected.size === suggestions.length,
    [suggestions.length, selected.size],
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable onPress={load} style={styles.retryBtn}>
          <Text style={styles.retryText}>{t('suggestions.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="follow-suggestions-screen">
      {/* Header */}
      <View style={styles.header}>
        {onBack && (
          <Pressable onPress={onBack} style={styles.backBtn} accessibilityRole="button" accessibilityLabel={t('suggestions.back')}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
        )}
        <Text style={styles.headerTitle}>{t('suggestions.title')}</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Subtitle */}
      <View style={styles.subHeader}>
        <Text style={styles.subHeaderText}>{t('suggestions.subtitle')}</Text>
      </View>

      {suggestions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>👤</Text>
          <Text style={styles.emptyText}>{t('suggestions.empty')}</Text>
        </View>
      ) : (
        <>
          {/* Bulk actions toolbar */}
          <View style={styles.toolbar}>
            <Pressable onPress={handleSelectAll} accessibilityRole="button" style={styles.selectAllBtn}>
              <View style={[styles.checkbox, allSelected && styles.checkboxSelected]}>
                {allSelected && <Text style={styles.checkmark}>{t('suggestions.checkmark')}</Text>}
              </View>
              <Text style={styles.selectAllText}>
                {allSelected ? t('suggestions.deselectAll') : t('suggestions.selectAll')}
              </Text>
            </Pressable>
            {selected.size > 0 && (
              <Pressable
                style={styles.bulkFollowBtn}
                onPress={handleBulkFollow}
                disabled={bulkLoading}
                accessibilityRole="button"
                testID="suggestions.bulkFollow"
              >
                {bulkLoading ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.bulkFollowText}>
                    {t('suggestions.followCount', { count: selected.size })}
                  </Text>
                )}
              </Pressable>
            )}
          </View>

          {/* Suggestions grid — 2 columns */}
          <FlatList
            data={suggestions}
            keyExtractor={(s) => s.userId}
            numColumns={2}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <SuggestionCard
                suggestion={item}
                selected={selected.has(item.userId)}
                onSelect={handleSelect}
                onDismiss={handleDismiss}
                onPress={(uid) => onNavigateProfile?.(uid)}
              />
            )}
          />
        </>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F5F5' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 8, paddingBottom: 32 },
  gridRow: { gap: 8, paddingHorizontal: 8, marginBottom: 8 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  backBtn: { width: 36, padding: 4 },
  backIcon: { fontSize: 24, color: COLORS.primary },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: COLORS.textPrimary, textAlign: 'center' },

  subHeader: { paddingHorizontal: 16, paddingVertical: 10 },
  subHeaderText: { fontSize: 13, color: COLORS.textSecondary },

  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    gap: 12,
  },
  selectAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectAllText: { fontSize: 14, color: COLORS.textSecondary },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
  },
  checkboxSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkmark: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  bulkFollowBtn: {
    marginStart: 'auto',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  bulkFollowText: { color: '#FFF', fontWeight: '600', fontSize: 14 },

  card: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    gap: 8,
    position: 'relative',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  cardSelected: { borderColor: COLORS.primary },

  dismissBtn: {
    position: 'absolute',
    top: 6,
    insetInlineEnd: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissIcon: { fontSize: 10, color: COLORS.textMuted },

  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  avatarText: { color: '#FFF', fontSize: 20, fontWeight: '700' },

  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  displayName: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary, textAlign: 'center', maxWidth: 100 },
  verifiedBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedIcon: { color: '#FFF', fontSize: 8, fontWeight: '700' },

  reasonChip: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  reasonText: { fontSize: 11, color: COLORS.textSecondary, textAlign: 'center' },

  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: 15, color: COLORS.textMuted, textAlign: 'center', paddingHorizontal: 32 },

  errorText: { fontSize: 15, color: COLORS.textMuted, textAlign: 'center', marginHorizontal: 24 },
  retryBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: COLORS.primary, borderRadius: 8 },
  retryText: { color: '#FFF', fontWeight: '600' },
});
