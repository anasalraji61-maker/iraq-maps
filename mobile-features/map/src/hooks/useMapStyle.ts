/** Active MapLibre base-layer mode. */
export type MapMode = 'street' | 'satellite' | 'dark';

/** Returns the MapCanvas `baseLayer` value for the given mode. */
export function useMapStyle(mode: MapMode): 'vector' | 'satellite' {
  // 'dark' uses the vector tiles with a dark overlay applied in MapScreen
  return mode === 'satellite' ? 'satellite' : 'vector';
}

/** True when a dark colour overlay should be rendered on top of the map canvas. */
export function isDarkMode(mode: MapMode): boolean {
  return mode === 'dark';
}
