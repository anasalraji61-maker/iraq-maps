/**
 * ManeuverArrow — turn arrows for all ManeuverType × ManeuverModifier combinations.
 * Uses Unicode arrow characters rendered in a styled View (no SVG dependency).
 */
import type { ManeuverModifier, ManeuverType } from '@iraq-maps/contracts';
import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export interface ManeuverArrowProps {
  type: ManeuverType;
  modifier?: ManeuverModifier;
  /** Icon size in dp. Default 48. */
  size?: number;
  /** Arrow glyph colour. Default white. */
  color?: string;
  /** Background circle colour. Default primary blue. */
  bgColor?: string;
  /** Accessibility label (already translated). */
  accessibilityLabel?: string;
}

/** Maps maneuver type + modifier to a Unicode glyph string. */
function maneuverGlyph(type: ManeuverType, modifier?: ManeuverModifier): string {
  switch (type) {
    case 'depart': return '↑';
    case 'arrive': return '📍';
    case 'uturn': return '↩';
    case 'roundabout_enter':
    case 'roundabout_exit': return '↻';
    case 'ferry_enter':
    case 'ferry_exit': return '⛴';
    case 'ramp':
    case 'exit': return '↗';
    case 'fork': return '⑂';
    case 'merge': return '↑';
    case 'continue': return '↑';
    case 'turn':
    default:
      switch (modifier) {
        case 'slight_right': return '↗';
        case 'right': return '→';
        case 'sharp_right': return '↘';
        case 'slight_left': return '↖';
        case 'left': return '←';
        case 'sharp_left': return '↙';
        default: return '↑';
      }
  }
}

export function ManeuverArrow({
  type,
  modifier,
  size = 48,
  color = '#ffffff',
  bgColor = '#2563EB',
  accessibilityLabel,
}: ManeuverArrowProps): ReactElement {
  const glyph = maneuverGlyph(type, modifier);
  const fontSize = size * 0.46;

  return (
    <View
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor }]}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
    >
      <Text style={[styles.glyph, { fontSize, lineHeight: size, color }]} aria-hidden>
        {glyph}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    textAlign: 'center',
    includeFontPadding: false,
  },
});
