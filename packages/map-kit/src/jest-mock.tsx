// Jest stand-in for @maplibre/maplibre-react-native, the parts MapCanvas uses:
//   jest.mock('@maplibre/maplibre-react-native', () => jest.requireActual('@iraq-maps/map-kit/jest-mock'));
// Each component is a host View that keeps its props (assert them with toHaveProp, simulate a map tap with
// fireEvent.press on testIDs.map.view). Like the device: Map mounts its children after the first render and then reports
// onDidFinishLoadingStyle; Camera records the stops set through its ref in its `setStop` prop (a jest.fn); a GeoJSONSource
// renders one pressable host element per feature whose press calls the source's onPress and then bubbles to the Map's
// onPress unless the handler called event.stopPropagation(). Only type imports from the real module: loading it would
// re-enter the factory.
import { jest } from '@jest/globals';
import type { CameraProps, CameraRef, GeoJSONSourceProps, MapProps } from '@maplibre/maplibre-react-native';
import { createContext, useContext, useEffect, useImperativeHandle, useState } from 'react';
import { Pressable, View, type NativeSyntheticEvent } from 'react-native';
import { mapPartIDs } from './test-ids';

type SourcePress = Parameters<NonNullable<GeoJSONSourceProps['onPress']>>[0];

const MapPress = createContext<MapProps['onPress']>(undefined);
const featureTestID = (sourceTestID?: string, featureId?: string | number) => `${sourceTestID}.${featureId}`;

/** testID of the host element of a MapCanvas marker: `await user.press(screen.getByTestId(markerTestID(id)))`.
 * Its `aria-selected` reflects MapMarker.selected. */
export const markerTestID = (id: string): string => featureTestID(mapPartIDs.markers, id);
/** testIDs of the camera (props setStop, maxBounds, initialViewState), the markers source (prop data) and the user
 * location puck. */
export { mapPartIDs };
/** @public loaded through jest.mock */
export { View as Layer, View as NativeUserLocation } from 'react-native';

/** @public loaded through jest.mock */
export function Map({ children, onDidFinishLoadingStyle, ref: _ref, ...props }: MapProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (mounted) onDidFinishLoadingStyle?.({ nativeEvent: null } as NativeSyntheticEvent<null>);
    else setMounted(true);
  }, [mounted]);
  return (
    <MapPress.Provider value={props.onPress}>
      <View {...props}>{mounted && children}</View>
    </MapPress.Provider>
  );
}

/** @public loaded through jest.mock */
export function Camera({ ref, ...props }: CameraProps) {
  const [setStop] = useState(() => jest.fn<CameraRef['setStop']>());
  useImperativeHandle(ref, () => ({ setStop }) as Partial<CameraRef> as CameraRef);
  return <View {...{ ...props, setStop }} />;
}

/** @public loaded through jest.mock */
export function GeoJSONSource({ data, onPress, children, ref: _ref, ...props }: GeoJSONSourceProps) {
  const mapPress = useContext(MapPress);
  const features = typeof data === 'object' && data.type === 'FeatureCollection' ? data.features : [];
  const press = (feature: GeoJSON.Feature) => {
    let stopped = false;
    const event = { nativeEvent: { features: [feature] }, stopPropagation: () => (stopped = true) } as unknown as SourcePress;
    onPress?.(event);
    if (!stopped) mapPress?.(event);
  };
  return (
    <View {...{ ...props, data }}>
      {features.map((f) => (
        <Pressable key={String(f.id)} testID={featureTestID(props.testID, f.id)} aria-selected={f.properties?.selected === true} onPress={() => press(f)} />
      ))}
      {children}
    </View>
  );
}
