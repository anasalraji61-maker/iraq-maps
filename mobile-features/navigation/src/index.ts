/** Turn-by-turn navigation feature: engine, hook and screens. */
export { ArrivalDetector } from './engine/arrival';
export { buildInstruction } from './engine/maneuver';
export { DeviationDetector } from './engine/deviation';
export { useNavigation, type NavigationState, type PositionSubscriber } from './hooks/useNavigation';
export { ActiveNavigationScreen } from './screens/ActiveNavigationScreen';
export { RoutePreviewScreen, type RoutePreviewScreenProps } from './screens/RoutePreviewScreen';
export { NavigationScreen, type NavigationScreenProps } from './screens/NavigationScreen';
export { SearchAlongRouteScreen, type SearchAlongRouteScreenProps, type AlongRoutePlace, type AlongCategory } from './screens/SearchAlongRouteScreen';
export { RoutePreviewContainer } from './screens/RoutePreviewContainer';
export { ActiveNavigationContainer } from './screens/ActiveNavigationContainer';
export { WaypointsEditor, type WaypointEntry } from './screens/WaypointsEditor';
export { NearbyNavChips } from './screens/NearbyNavChips';
export { SavedRoutesSheet } from './screens/SavedRoutesSheet';
export { favoriteRoutes, type FavoriteRoute } from './favoriteRoutes';
export { LiveTrafficScreen, type LiveTrafficScreenProps } from './screens/LiveTrafficScreen';
export { SavedRoutesScreen, type SavedRoutesScreenProps } from './screens/SavedRoutesScreen';
export { RouteHistoryScreen, type RouteHistoryScreenProps, type TripRecord } from './screens/RouteHistoryScreen';
export {
  TripPlannerScreen,
  type TripPlannerScreenProps,
  type TripStop,
  type TripSegmentInfo,
  type TripStats,
} from './screens/TripPlannerScreen';
export {
  TripDetailScreen,
  type TripDetailScreenProps,
  type DetailStop,
  type DetailSegment,
  type DetailTripPlan,
} from './screens/TripDetailScreen';
export { LaneGuidance, ManeuverArrow, SpeedLimit, CurrentSpeed, RouteCompare, TripSummary } from './components';
export type { Lane, LaneDirection, LaneGuidanceProps, ManeuverArrowProps, SpeedLimitProps, CurrentSpeedProps, RouteCompareProps, RouteOption, RouteTag, TripSummaryProps, TripSummaryTrip } from './components';
