/**
 * TurnArrow — SVG maneuver arrow renderer.
 *
 * Produces an SVG string (suitable for an <Image source={{ uri: `data:image/svg+xml,...` }}>
 * or an inline WebView/SvgXml) for each maneuver type.
 *
 * Supports:
 * - Straight, slight/normal/sharp left & right turns
 * - U-turn (start/end variants)
 * - Fork left / fork right
 * - Roundabout enter/exit
 * - Ramp, merge, ferry
 * - Lane arrow overlay (multi-lane guidance)
 * - Configurable size, foreground and background colours
 */

import type { ManeuverModifier, ManeuverType } from '@iraq-maps/contracts';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TurnArrowOptions {
  type: ManeuverType;
  modifier?: ManeuverModifier;
  /** Canvas size in px (square). Default 64. */
  size?: number;
  /** Arrow fill colour. */
  color?: string;
  /** Background circle colour. */
  bgColor?: string;
  /** Whether to show a drop-shadow. */
  shadow?: boolean;
}

export interface LaneArrowOptions {
  /** Array of per-lane valid-direction flags. */
  lanes: { active: boolean }[];
  /** Canvas width in px. Default 240. */
  width?: number;
  /** Canvas height in px. Default 48. */
  height?: number;
  /** Active lane colour. */
  activeColor?: string;
  /** Inactive lane colour. */
  inactiveColor?: string;
}

export interface DistanceBadgeOptions {
  /** Distance label, e.g. "500 م" or "1.2 كم". */
  label: string;
  /** Canvas width. Default 120. */
  width?: number;
  /** Canvas height. Default 36. */
  height?: number;
  /** Background colour. */
  bgColor?: string;
  /** Text colour. */
  textColor?: string;
  /** Font size. Default 16. */
  fontSize?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function svgWrap(
  content: string,
  size: number,
  bgColor: string,
  shadow: boolean,
): string {
  const filter = shadow
    ? `<filter id="sh"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.2"/></filter>`
    : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">` +
    `<defs>${filter}</defs>` +
    `<circle cx="32" cy="32" r="30" fill="${esc(bgColor)}" ${shadow ? 'filter="url(#sh)"' : ''}/>` +
    content +
    `</svg>`
  );
}

// ─── Arrow path definitions ───────────────────────────────────────────────────

/**
 * Returns an SVG `<path>` for the given maneuver.
 * All coordinates are in a 64×64 coordinate space.
 */
function arrowPath(
  type: ManeuverType,
  modifier: ManeuverModifier | undefined,
  color: string,
): string {
  const fill = `fill="${esc(color)}"`;
  const stroke = `stroke="${esc(color)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;

  // ── straight ──────────────────────────────────────────────────────────────
  if (
    type === 'depart' ||
    type === 'continue' ||
    type === 'merge' ||
    (type === 'turn' && modifier === 'straight') ||
    modifier === 'straight'
  ) {
    return (
      `<path ${fill} d="M32 10 L38 24 L34 24 L34 54 L30 54 L30 24 L26 24 Z"/>` // Up arrow
    );
  }

  // ── arrive ────────────────────────────────────────────────────────────────
  if (type === 'arrive') {
    return (
      `<circle cx="32" cy="32" r="10" ${fill} opacity="0.9"/>` +
      `<circle cx="32" cy="32" r="6" fill="#fff"/>` +
      `<circle cx="32" cy="32" r="3" ${fill}/>`
    );
  }

  // ── u-turn ────────────────────────────────────────────────────────────────
  if (type === 'uturn') {
    return (
      `<path ${fill} ${stroke} fill-opacity="0" d="M20 48 L20 24 Q20 14 32 14 Q44 14 44 24 L44 36"/>` +
      `<path ${fill} d="M44 28 L50 38 L44 44 L44 30 Z"/>`  // Arrow head pointing down
    );
  }

  // ── roundabout ────────────────────────────────────────────────────────────
  if (type === 'roundabout_enter' || type === 'roundabout_exit') {
    const rot = type === 'roundabout_enter' ? '' : 'transform="scale(-1,1) translate(-64,0)"';
    return (
      `<g ${rot}>` +
      `<path ${fill} ${stroke} fill-opacity="0" d="M48 32 A16 16 0 1 0 32 48"/>` +
      `<path ${fill} d="M32 42 L38 52 L26 52 Z"/>` +
      `</g>`
    );
  }

  // ── fork ──────────────────────────────────────────────────────────────────
  if (type === 'fork') {
    if (modifier === 'left' || modifier === 'slight_left') {
      return (
        `<path ${fill} d="M32 10 L38 24 L34 24 L34 36 Q34 46 26 52 L22 48 Q28 44 28 36 L28 24 L24 24 Z"/>`
      );
    }
    // Default fork right
    return (
      `<path ${fill} d="M32 10 L40 24 L36 24 L36 36 Q36 46 38 52 L42 48 Q36 44 36 36 L36 24 L28 24 L24 24 L32 10 Z"/>`
    );
  }

  // ── ramp ──────────────────────────────────────────────────────────────────
  if (type === 'ramp' || type === 'exit') {
    return (
      `<path ${fill} d="M28 10 L36 10 L36 36 Q36 46 44 52 L40 56 Q30 48 30 36 L30 24 L26 24 Z"/>`
    );
  }

  // ── ferry ─────────────────────────────────────────────────────────────────
  if (type === 'ferry_enter' || type === 'ferry_exit') {
    return (
      `<path ${fill} d="M14 36 Q20 30 32 30 Q44 30 50 36 L50 42 Q44 48 32 48 Q20 48 14 42 Z"/>` +
      `<path ${fill} d="M32 10 L38 24 L34 24 L34 30 L30 30 L30 24 L26 24 Z"/>`
    );
  }

  // ── turns (left / right / slight / sharp) ─────────────────────────────────
  if (modifier === 'slight_right') {
    return (
      `<path ${fill} d="M24 10 L32 22 L28 22 L28 34 Q28 44 40 48 L38 52 Q24 48 24 34 L24 22 L20 22 Z"/>`
    );
  }
  if (modifier === 'right') {
    return (
      `<path ${fill} d="M20 32 L34 20 L34 26 Q44 26 44 36 L44 54 L40 54 L40 36 Q40 30 34 30 L34 36 Z"/>`
    );
  }
  if (modifier === 'sharp_right') {
    return (
      `<path ${fill} d="M18 40 L30 18 L38 28 Q46 20 46 36 L46 56 L42 56 L42 36 Q42 26 36 32 L28 22 Z"/>`
    );
  }
  if (modifier === 'slight_left') {
    return (
      `<path ${fill} d="M40 10 L32 22 L36 22 L36 34 Q36 44 24 48 L26 52 Q40 48 40 34 L40 22 L44 22 Z"/>`
    );
  }
  if (modifier === 'left') {
    return (
      `<path ${fill} d="M44 32 L30 20 L30 26 Q20 26 20 36 L20 54 L24 54 L24 36 Q24 30 30 30 L30 36 Z"/>`
    );
  }
  if (modifier === 'sharp_left') {
    return (
      `<path ${fill} d="M46 40 L34 18 L26 28 Q18 20 18 36 L18 56 L22 56 L22 36 Q22 26 28 32 L36 22 Z"/>`
    );
  }

  // Fallback: straight arrow
  return `<path ${fill} d="M32 10 L38 24 L34 24 L34 54 L30 54 L30 24 L26 24 Z"/>`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate an inline SVG string for a maneuver arrow.
 * Encode with encodeURIComponent to use as `data:image/svg+xml,...`.
 */
export function generateTurnArrowSvg(opts: TurnArrowOptions): string {
  const {
    type,
    modifier,
    size = 64,
    color = '#FFFFFF',
    bgColor = '#2563EB',
    shadow = false,
  } = opts;

  const pathSvg = arrowPath(type, modifier, color);
  return svgWrap(pathSvg, size, bgColor, shadow);
}

/**
 * Generate a data URI from turn arrow SVG — usable in React Native Image source.
 */
export function generateTurnArrowUri(opts: TurnArrowOptions): string {
  const svg = generateTurnArrowSvg(opts);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Generate an SVG lane-guidance bar.
 * Each lane is drawn as an arrow; active lanes are highlighted.
 */
export function generateLaneArrowSvg(opts: LaneArrowOptions): string {
  const {
    lanes,
    width = 240,
    height = 48,
    activeColor = '#2563EB',
    inactiveColor = '#9CA3AF',
  } = opts;

  const laneWidth = width / lanes.length;
  const cx = laneWidth / 2;

  const lanesSvg = lanes
    .map((lane, i) => {
      const x = i * laneWidth;
      const color = lane.active ? activeColor : inactiveColor;
      const opacity = lane.active ? '1' : '0.45';
      // Simple up arrow centred in each lane slot
      return (
        `<g transform="translate(${x + cx - 8},${height / 2 - 14})" opacity="${opacity}">` +
        `<path fill="${esc(color)}" d="M8 0 L14 12 L10 12 L10 28 L6 28 L6 12 L2 12 Z"/>` +
        `</g>`
      );
    })
    .join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    lanesSvg +
    `</svg>`
  );
}

/**
 * Generate a lane arrow data URI.
 */
export function generateLaneArrowUri(opts: LaneArrowOptions): string {
  const svg = generateLaneArrowSvg(opts);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Generate a distance-to-maneuver badge SVG.
 */
export function generateDistanceBadgeSvg(opts: DistanceBadgeOptions): string {
  const {
    label,
    width = 120,
    height = 36,
    bgColor = '#1E293B',
    textColor = '#F1F5F9',
    fontSize = 16,
  } = opts;

  const rx = height / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect x="0" y="0" width="${width}" height="${height}" rx="${rx}" fill="${esc(bgColor)}"/>` +
    `<text x="${width / 2}" y="${height / 2 + fontSize * 0.35}" ` +
    `text-anchor="middle" font-family="sans-serif" font-size="${fontSize}" ` +
    `font-weight="700" fill="${esc(textColor)}" direction="rtl">` +
    `${esc(label)}` +
    `</text>` +
    `</svg>`
  );
}

/**
 * Generate a distance badge data URI.
 */
export function generateDistanceBadgeUri(opts: DistanceBadgeOptions): string {
  const svg = generateDistanceBadgeSvg(opts);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
