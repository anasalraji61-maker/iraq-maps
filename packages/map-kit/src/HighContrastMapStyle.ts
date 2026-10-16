/**
 * HighContrastMapStyle – MapLibre style overrides for high-contrast mode.
 *
 * Applies:
 *  - High-contrast colour palette (near-black/white with strong accent).
 *  - Larger text labels at all zoom levels.
 *  - Thicker, bolder road lines.
 *  - High-contrast POI icon colours.
 *
 * Usage:
 *   const style = applyHighContrast(baseStyle);
 *   mapRef.current?.setStyle(style);
 *
 * Or use the individual patch helpers to modify specific layers.
 */

import type {
  BackgroundLayerSpecification,
  CircleLayerSpecification,
  FillLayerSpecification,
  LayerSpecification,
  LineLayerSpecification,
  StyleSpecification,
  SymbolLayerSpecification,
} from '@maplibre/maplibre-gl-style-spec';

// ---------------------------------------------------------------------------
// High-contrast palette
// ---------------------------------------------------------------------------

export const HC_COLORS = {
  /** Background / water / fill base */
  background: '#0f0f0f',
  water: '#001f3f',
  waterLabel: '#ffffff',

  /** Roads */
  motorway: '#ffdd00',
  motorwayCasing: '#000000',
  trunk: '#ffaa00',
  trunkCasing: '#000000',
  primary: '#ffffff',
  primaryCasing: '#000000',
  secondary: '#e0e0e0',
  secondaryCasing: '#333333',
  tertiary: '#b0b0b0',
  tertiaryCasing: '#444444',
  residential: '#888888',
  residentialCasing: '#555555',
  path: '#666666',
  pathCasing: '#333333',

  /** Land & areas */
  landcover: '#1a1a1a',
  building: '#2a2a2a',
  buildingOutline: '#555555',
  park: '#0a2e0a',
  parkOutline: '#1a5c1a',

  /** Labels */
  labelMain: '#ffffff',
  labelMuted: '#cccccc',
  labelHalo: '#000000',
  labelHaloWidth: 2,

  /** POI */
  poiBackground: '#ffffff',
  poiIcon: '#000000',
  poiBorder: '#333333',

  /** Boundaries */
  boundary: '#ff6600',
  boundaryMuted: '#cc4400',

  /** Accessibility specific */
  wheelchairRoute: '#00d4ff',
  accessibleEntrance: '#00ff88',
} as const;

// ---------------------------------------------------------------------------
// Text size multipliers
// ---------------------------------------------------------------------------

const LABEL_SCALE = 1.4; // 40% larger than base

function scaleTextSize(base: number): number {
  return Math.round(base * LABEL_SCALE);
}

// ---------------------------------------------------------------------------
// Layer patchers
// ---------------------------------------------------------------------------

function patchBackground(layer: BackgroundLayerSpecification): BackgroundLayerSpecification {
  return {
    ...layer,
    paint: { ...layer.paint, 'background-color': HC_COLORS.background },
  };
}

function patchFill(layer: FillLayerSpecification): FillLayerSpecification {
  const id = layer.id;
  const paint = { ...layer.paint };

  if (id.includes('water')) {
    paint['fill-color'] = HC_COLORS.water;
    paint['fill-opacity'] = 1;
  } else if (id.includes('park') || id.includes('green') || id.includes('grass')) {
    paint['fill-color'] = HC_COLORS.park;
    paint['fill-opacity'] = 1;
  } else if (id.includes('building')) {
    paint['fill-color'] = HC_COLORS.building;
    paint['fill-opacity'] = 1;
  } else if (id.includes('land') || id.includes('area')) {
    paint['fill-color'] = HC_COLORS.landcover;
    paint['fill-opacity'] = 1;
  }

  return { ...layer, paint };
}

function patchLine(layer: LineLayerSpecification): LineLayerSpecification {
  const id = layer.id;
  const paint = { ...layer.paint };
  const layout = { ...layer.layout };

  // Road lines — make bolder
  if (id.includes('motorway')) {
    const isCasing = id.includes('casing') || id.includes('outline');
    paint['line-color'] = isCasing ? HC_COLORS.motorwayCasing : HC_COLORS.motorway;
    const widthExpr = paint['line-width'];
    if (typeof widthExpr === 'number') {
      paint['line-width'] = widthExpr * 1.5;
    }
  } else if (id.includes('trunk')) {
    const isCasing = id.includes('casing') || id.includes('outline');
    paint['line-color'] = isCasing ? HC_COLORS.trunkCasing : HC_COLORS.trunk;
  } else if (id.includes('primary')) {
    const isCasing = id.includes('casing') || id.includes('outline');
    paint['line-color'] = isCasing ? HC_COLORS.primaryCasing : HC_COLORS.primary;
  } else if (id.includes('secondary')) {
    const isCasing = id.includes('casing') || id.includes('outline');
    paint['line-color'] = isCasing ? HC_COLORS.secondaryCasing : HC_COLORS.secondary;
  } else if (id.includes('tertiary')) {
    const isCasing = id.includes('casing') || id.includes('outline');
    paint['line-color'] = isCasing ? HC_COLORS.tertiaryCasing : HC_COLORS.tertiary;
  } else if (id.includes('residential') || id.includes('street')) {
    const isCasing = id.includes('casing') || id.includes('outline');
    paint['line-color'] = isCasing ? HC_COLORS.residentialCasing : HC_COLORS.residential;
  } else if (id.includes('path') || id.includes('footway') || id.includes('pedestrian')) {
    paint['line-color'] = HC_COLORS.path;
  } else if (id.includes('water')) {
    paint['line-color'] = HC_COLORS.water;
  } else if (id.includes('boundary') || id.includes('border')) {
    paint['line-color'] = HC_COLORS.boundary;
    paint['line-width'] = typeof paint['line-width'] === 'number'
      ? paint['line-width'] * 1.3
      : 2;
  } else if (id.includes('building')) {
    paint['line-color'] = HC_COLORS.buildingOutline;
  } else if (id.includes('park') || id.includes('green')) {
    paint['line-color'] = HC_COLORS.parkOutline;
  }

  return { ...layer, paint, layout };
}

function patchSymbol(layer: SymbolLayerSpecification): SymbolLayerSpecification {
  const paint = { ...layer.paint };
  const layout = { ...layer.layout };

  // Text colour and halo
  if ('text-color' in paint) {
    paint['text-color'] = HC_COLORS.labelMain;
  }
  if ('text-halo-color' in paint) {
    paint['text-halo-color'] = HC_COLORS.labelHalo;
    paint['text-halo-width'] = HC_COLORS.labelHaloWidth;
  } else if ('text-color' in paint) {
    // Add halo if there was any text
    paint['text-halo-color'] = HC_COLORS.labelHalo;
    paint['text-halo-width'] = HC_COLORS.labelHaloWidth;
  }

  // Scale text sizes
  if (layout['text-size'] !== undefined) {
    const size = layout['text-size'];
    if (typeof size === 'number') {
      layout['text-size'] = scaleTextSize(size);
    } else if (
      Array.isArray(size) &&
      size[0] === 'interpolate' &&
      Array.isArray(size)
    ) {
      // interpolate expression: scale the stop values
      const patched = [...size] as unknown[];
      for (let i = 3; i < patched.length; i += 2) {
        if (typeof patched[i] === 'number') {
          patched[i] = scaleTextSize(patched[i] as number);
        }
      }
      layout['text-size'] = patched as typeof size;
    }
  }

  // Bold font
  if (layout['text-font']) {
    const fonts = layout['text-font'];
    if (Array.isArray(fonts)) {
      layout['text-font'] = (fonts as string[]).map((f) =>
        typeof f === 'string' && !f.toLowerCase().includes('bold')
          ? f.replace('Regular', 'Bold').replace('Medium', 'Bold')
          : f,
      );
    }
  }

  // POI icon contrast
  if ('icon-color' in paint) {
    paint['icon-color'] = HC_COLORS.poiIcon;
  }
  if ('icon-halo-color' in paint) {
    paint['icon-halo-color'] = HC_COLORS.poiBackground;
    paint['icon-halo-width'] = 2;
  }

  return { ...layer, paint, layout };
}

function patchCircle(layer: CircleLayerSpecification): CircleLayerSpecification {
  const paint = { ...layer.paint };
  if (layer.id.includes('accessibility') || layer.id.includes('wheelchair')) {
    // Handled by AccessibilityLayer; leave untouched
    return layer;
  }
  // General POI circles
  paint['circle-stroke-color'] = HC_COLORS.poiBorder;
  paint['circle-stroke-width'] = 1.5;
  return { ...layer, paint };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Apply high-contrast overrides to every layer of `baseStyle`.
 * Returns a new StyleSpecification — the original is not mutated.
 */
export function applyHighContrast(
  baseStyle: StyleSpecification,
): StyleSpecification {
  const patched: LayerSpecification[] = (baseStyle.layers ?? []).map((layer) => {
    switch (layer.type) {
      case 'background':
        return patchBackground(layer as BackgroundLayerSpecification);
      case 'fill':
        return patchFill(layer as FillLayerSpecification);
      case 'line':
        return patchLine(layer as LineLayerSpecification);
      case 'symbol':
        return patchSymbol(layer as SymbolLayerSpecification);
      case 'circle':
        return patchCircle(layer as CircleLayerSpecification);
      default:
        return layer;
    }
  });

  return { ...baseStyle, layers: patched };
}

/**
 * Returns only the layers that were modified by `applyHighContrast`.
 * Useful for diffing against the base style to apply targeted updates.
 */
export function getHighContrastLayerPatches(
  baseStyle: StyleSpecification,
): LayerSpecification[] {
  const full = applyHighContrast(baseStyle);
  const base = baseStyle.layers ?? [];
  const patched = full.layers ?? [];

  return patched.filter((layer, i) => {
    const orig = base[i];
    return JSON.stringify(layer) !== JSON.stringify(orig);
  });
}

/**
 * Returns a minimal MapLibre expression that overrides text size to be
 * LABEL_SCALE × the base expression. Use in layer setLayoutProperty calls
 * when the full style rebuild is too expensive.
 */
export function scaledTextSizeExpression(
  base: number | unknown[],
): number | unknown[] {
  if (typeof base === 'number') return scaleTextSize(base);
  if (!Array.isArray(base)) return base;

  // interpolate expression
  if (base[0] === 'interpolate') {
    const patched = [...base];
    for (let i = 3; i < patched.length; i += 2) {
      if (typeof patched[i] === 'number') {
        patched[i] = scaleTextSize(patched[i] as number);
      }
    }
    return patched;
  }

  return base;
}

// ---------------------------------------------------------------------------
// Preset label overrides (convenience)
// ---------------------------------------------------------------------------

/**
 * Returns layout overrides to apply to a label layer for high-contrast mode.
 * These are safe to pass to `map.setLayoutProperty` on individual layers.
 */
export function highContrastLabelLayout(baseSize: number): Record<string, unknown> {
  return {
    'text-size': scaleTextSize(baseSize),
    'text-font': ['Noto Sans Bold', 'Arial Unicode MS Bold'],
  };
}

/**
 * Returns paint overrides to apply to a label layer for high-contrast mode.
 */
export function highContrastLabelPaint(): Record<string, unknown> {
  return {
    'text-color': HC_COLORS.labelMain,
    'text-halo-color': HC_COLORS.labelHalo,
    'text-halo-width': HC_COLORS.labelHaloWidth,
  };
}
