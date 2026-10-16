/**
 * Central re-export for all assistant tool modules.
 * Import from here rather than from individual files.
 */

export * from './place-tools.js';
export * from './navigation-tools.js';
export * from './recommendation-tools.js';
export * from './business-tools.js';

import { PLACE_TOOL_DEFS } from './place-tools.js';
import { NAVIGATION_TOOL_DEFS } from './navigation-tools.js';
import { RECOMMENDATION_TOOL_DEFS } from './recommendation-tools.js';
import { BUSINESS_TOOL_DEFS } from './business-tools.js';

/** All tool definitions in one flat array, safe to pass to LLM. */
export const ALL_TOOL_DEFS = [
  ...PLACE_TOOL_DEFS,
  ...NAVIGATION_TOOL_DEFS,
  ...RECOMMENDATION_TOOL_DEFS,
  ...BUSINESS_TOOL_DEFS,
] as const;

import type { PlacesSearchFn } from '../assistant.service.js';
import { dispatchPlaceTool, type PlaceToolName } from './place-tools.js';
import { dispatchNavigationTool, type NavigationToolName } from './navigation-tools.js';
import { dispatchRecommendationTool, type RecommendationToolName } from './recommendation-tools.js';
import { dispatchBusinessTool, type BusinessToolName } from './business-tools.js';

export type AnyToolName = PlaceToolName | NavigationToolName | RecommendationToolName | BusinessToolName;

const PLACE_TOOL_NAMES = new Set(PLACE_TOOL_DEFS.map(d => d.name));
const NAV_TOOL_NAMES = new Set(NAVIGATION_TOOL_DEFS.map(d => d.name));
const REC_TOOL_NAMES = new Set(RECOMMENDATION_TOOL_DEFS.map(d => d.name));
const BIZ_TOOL_NAMES = new Set(BUSINESS_TOOL_DEFS.map(d => d.name));

/**
 * Unified dispatcher: routes a tool call to the correct module handler.
 * Returns { text, placeIds?, placeNames? }.
 */
export async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  placesSearch: PlacesSearchFn,
): Promise<{ text: string; placeIds?: string[]; placeNames?: Record<string, string> }> {
  if (PLACE_TOOL_NAMES.has(name as PlaceToolName)) {
    return dispatchPlaceTool(name as PlaceToolName, input, placesSearch);
  }
  if (NAV_TOOL_NAMES.has(name as NavigationToolName)) {
    return dispatchNavigationTool(name as NavigationToolName, input, placesSearch);
  }
  if (REC_TOOL_NAMES.has(name as RecommendationToolName)) {
    return dispatchRecommendationTool(name as RecommendationToolName, input, placesSearch);
  }
  if (BIZ_TOOL_NAMES.has(name as BusinessToolName)) {
    return dispatchBusinessTool(name as BusinessToolName, input, placesSearch);
  }
  return { text: `أداة غير معروفة: ${name}` };
}
