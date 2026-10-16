import { type ReactElement } from 'react';
import { ScrollView, StyleSheet, Text, Pressable, View } from 'react-native';

export interface QuickReply {
  key: string;
  label: string;
  icon?: string;
}

export interface QuickRepliesProps {
  replies: QuickReply[];
  onSelect: (label: string) => void;
  horizontal?: boolean;
}

const PRIMARY = '#1565C0';
const PRIMARY_LIGHT = '#E3F2FD';

export function QuickReplies({ replies, onSelect, horizontal = true }: QuickRepliesProps): ReactElement {
  if (!replies.length) return <View />;

  if (horizontal) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalContent}
        style={styles.horizontalScroll}
        keyboardShouldPersistTaps="handled"
        accessibilityRole="menu"
      >
        {replies.map((r) => (
          <Pressable
            key={r.key}
            style={styles.chip}
            onPress={() => onSelect(r.label)}
            accessibilityRole="menuitem"
            accessibilityLabel={r.label}
          >
            {r.icon ? <Text style={styles.chipIcon}>{r.icon}</Text> : null}
            <Text style={styles.chipText}>{r.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    );
  }

  return (
    <View style={styles.grid} accessibilityRole="menu">
      {replies.map((r) => (
        <Pressable
          key={r.key}
          style={styles.gridChip}
          onPress={() => onSelect(r.label)}
          accessibilityRole="menuitem"
          accessibilityLabel={r.label}
        >
          {r.icon ? <Text style={styles.chipIcon}>{r.icon}</Text> : null}
          <Text style={styles.chipText}>{r.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  horizontalScroll: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DDD',
    backgroundColor: '#FFF',
  },
  horizontalContent: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
    flexDirection: 'row',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PRIMARY_LIGHT,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#BBDEFB',
    gap: 4,
  },
  chipIcon: {
    fontSize: 14,
  },
  chipText: {
    color: PRIMARY,
    fontSize: 13,
    fontWeight: '500',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: '#FFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DDD',
  },
  gridChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PRIMARY_LIGHT,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#BBDEFB',
    gap: 4,
  },
});
