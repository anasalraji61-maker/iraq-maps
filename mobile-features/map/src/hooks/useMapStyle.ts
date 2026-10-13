/** Active MapLibre base-layer mode. */
export type MapMode = 'street' | 'satellite';

/** Returns the MapCanvas `baseLayer` value for the given mode. */
export function useMapStyle(mode: MapMode): 'vector' | 'satellite' {
  return mode === 'satellite' ? 'satellite' : 'vector';
}
