/**
 * LaneGuidance — lane arrows for multi-lane roads.
 * Uses View + Text glyphs (no SVG dependency).
 * Highlights the lanes the driver should use in the active colour.
 */
import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type LaneDirection =
  | 'straight'
  | 'slight_left'
  | 'left'
  | 'sharp_left'
  | 'slight_right'
  | 'right'
  | 'sharp_right'
  | 'uturn';

export interface Lane {
  /** Possible directions for this lane. */
  directions: LaneDirection[];
  /** Whether this lane should be used for the current maneuver. */
  active: boolean;
}

export interface LaneGuidanceProps {
  lanes: Lane[];
  /** Height of the component in dp. Default 64. */
  height?: number;
  /** Active lane colour (driver's lane). */
  activeColor?: string;
  /** Inactive lane colour. */
  inactiveColor?: string;
  /** Background colour. */
  bgColor?: string;
}

const ARROW_COLOR_ACTIVE = '#2563EB';
const ARROW_COLOR_INACTIVE = '#9CA3AF';
const BG_COLOR = '#1F2937';

function directionGlyph(dir: LaneDirection): string {
  switch (dir) {
    case 'straight': return '↑';
    case 'slight_right': return '↗';
    case 'right': return '→';
    case 'sharp_right': return '↘';
    case 'slight_left': return '↖';
    case 'left': return '←';
    case 'sharp_left': return '↙';
    case 'uturn': return '↩';
  }
}

function LaneCell({
  lane,
  activeColor,
  inactiveColor,
}: {
  lane: Lane;
  activeColor: string;
  inactiveColor: string;
}): ReactElement {
  const color = lane.active ? activeColor : inactiveColor;
  const primary = lane.directions[0] ?? 'straight';
  const secondary = lane.directions[1];

  return (
    <View
      style={[
        laneStyles.cell,
        lane.active && laneStyles.cellActive,
        lane.active ? { borderColor: activeColor } : undefined,
      ]}
    >
      <View style={laneStyles.glyphRow}>
        <Text style={[laneStyles.arrow, { color }]}>{directionGlyph(primary)}</Text>
        {secondary != null ? (
          <Text style={[laneStyles.arrowSecondary, { color: color + '99' }]}>
            {directionGlyph(secondary)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const laneStyles = StyleSheet.create({
  cell: {
    width: 40,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  cellActive: {
    backgroundColor: 'rgba(37,99,235,0.15)',
  },
  glyphRow: { flexDirection: 'row', alignItems: 'center' },
  arrow: { fontSize: 22, lineHeight: 26 },
  arrowSecondary: { fontSize: 14, lineHeight: 20, marginStart: -4 },
});

export function LaneGuidance({
  lanes,
  height = 64,
  activeColor = ARROW_COLOR_ACTIVE,
  inactiveColor = ARROW_COLOR_INACTIVE,
  bgColor = BG_COLOR,
}: LaneGuidanceProps): ReactElement {
  if (lanes.length === 0) return <View />;

  return (
    <View
      style={[containerStyles.wrap, { backgroundColor: bgColor, height }]}
      accessibilityRole="image"
      accessibilityLabel={`Lane guidance: ${lanes.filter((l) => l.active).length} of ${lanes.length} lanes highlighted`}
    >
      {lanes.map((lane, i) => (
        <LaneCell
          key={i}
          lane={lane}
          activeColor={activeColor}
          inactiveColor={inactiveColor}
        />
      ))}
    </View>
  );
}

const containerStyles = StyleSheet.create({
  wrap: {
    borderRadius: 8,
    paddingHorizontal: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
});
