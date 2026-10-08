import { testIDs } from '@iraq-maps/contracts';

/** Parts of MapCanvas below testIDs.map.view, for tests. Kept apart from MapCanvas so the Jest mock can import it
 * without loading the module it replaces. */
export const mapPartIDs = {
  camera: `${testIDs.map.view}.camera`,
  markers: `${testIDs.map.view}.markers`,
  userLocation: `${testIDs.map.view}.userLocation`,
} as const;
