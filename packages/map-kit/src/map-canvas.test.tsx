import { describe, expect, it, jest } from '@jest/globals';
import { CityDescriptor, OSM_ATTRIBUTION, testIDs, type BBox, type LngLat } from '@iraq-maps/contracts';
import { cameraBounds } from '@iraq-maps/geo';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { buildStyle, MapAttribution, MapCanvas, resolveSource, type MapCanvasProps, type MapMarker } from './index';
import { mapPartIDs, markerTestID } from './jest-mock';

jest.mock('@maplibre/maplibre-react-native', () => jest.requireActual('./jest-mock'));

const city = CityDescriptor.parse({
  id: 'baghdad',
  names: { ar: 'بغداد', ckb: 'بەغدا', en: 'Baghdad' },
  bbox: [44.25, 33.2, 44.55, 33.45],
  center: [44.3661, 33.3152],
  tilesUrl: 'pmtiles://https://data.example.org/baghdad.pmtiles',
  glyphsUrl: '/v1/cities/baghdad/glyphs/{fontstack}/{range}.pbf',
  attribution: OSM_ATTRIBUTION,
});
const props: MapCanvasProps = { city, apiBaseUrl: 'http://api.test', lang: 'ar' };
const markers: MapMarker[] = [
  { id: 'n1', location: [44.36, 33.31] },
  { id: 'w2', location: [44.4, 33.3], selected: true },
];
const mapView = () => screen.getByTestId(testIDs.map.view);
const camera = () => screen.getByTestId(mapPartIDs.camera);

describe('MapCanvas', () => {
  it('renders the map with the style for its language and city', async () => {
    await render(<MapCanvas {...props} />);
    expect(mapView()).toHaveProp('mapStyle', buildStyle('ar', resolveSource(city, 'http://api.test')));
    expect(mapView()).toHaveProp('attribution', false);
    expect(mapView()).toHaveProp('logo', false);
  });

  it('rebuilds the style only when the language or the source changes', async () => {
    await render(<MapCanvas {...props} />);
    const first = mapView().props.mapStyle;
    await screen.rerender(<MapCanvas {...props} city={{ ...city }} markers={markers} showUserLocation />);
    expect(mapView().props.mapStyle).toBe(first);
    await screen.rerender(<MapCanvas {...props} lang="en" />);
    expect(mapView().props.mapStyle).toEqual(buildStyle('en', resolveSource(city, 'http://api.test')));
    await screen.rerender(<MapCanvas {...props} lang="en" apiBaseUrl="http://other.test" />);
    expect(mapView().props.mapStyle.glyphs).toBe('http://other.test/v1/cities/baghdad/glyphs/{fontstack}/{range}.pbf');
  });

  it.each<[string, Partial<MapCanvasProps>]>([
    ['bare', {}],
    ['everything set', { lang: 'en', markers, showUserLocation: true, camera: { center: [44.4, 33.3], zoom: 16 }, onPress: () => {}, onMarkerPress: () => {} }],
  ])('always shows the OSM attribution (%s)', async (_, extra) => {
    await render(<MapCanvas {...props} {...extra} />);
    expect(screen.getByTestId(testIDs.map.attribution)).toHaveTextContent(OSM_ATTRIBUTION);
    expect(screen.getByText(OSM_ATTRIBUTION)).toBeVisible();
  });

  it('has no prop that hides the attribution', async () => {
    // @ts-expect-error MapCanvasProps has no attribution switch
    await render(<MapCanvas {...props} attribution={false} />);
    expect(screen.getByText(OSM_ATTRIBUTION)).toBeVisible();
  });

  it('draws markers with their selected state and reports a marker press by id, not as a map press', async () => {
    const onMarkerPress = jest.fn();
    const onPress = jest.fn();
    await render(<MapCanvas {...props} markers={markers} onMarkerPress={onMarkerPress} onPress={onPress} />);
    expect(screen.getByTestId(mapPartIDs.markers)).toHaveProp('data', {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', id: 'n1', geometry: { type: 'Point', coordinates: [44.36, 33.31] }, properties: { selected: false } },
        { type: 'Feature', id: 'w2', geometry: { type: 'Point', coordinates: [44.4, 33.3] }, properties: { selected: true } },
      ],
    });
    expect(screen.getByTestId(markerTestID('n1'))).not.toBeSelected();
    expect(screen.getByTestId(markerTestID('w2'))).toBeSelected();
    await userEvent.setup().press(screen.getByTestId(markerTestID('n1')));
    expect(onMarkerPress).toHaveBeenCalledWith('n1');
    expect(onPress).not.toHaveBeenCalled();
  });

  it('passes map presses through', async () => {
    const onPress = jest.fn();
    await render(<MapCanvas {...props} onPress={onPress} />);
    await fireEvent.press(mapView(), { nativeEvent: { lngLat: [44.4, 33.3], point: [10, 20] } });
    expect(onPress).toHaveBeenCalledWith(expect.objectContaining({ nativeEvent: expect.objectContaining({ lngLat: [44.4, 33.3] }) }));
  });

  it('reports the settled centre and zoom after the region changes', async () => {
    const onCameraChanged = jest.fn();
    await render(<MapCanvas {...props} onCameraChanged={onCameraChanged} />);
    await fireEvent(mapView(), 'regionDidChange', { nativeEvent: { center: [44.41, 33.32], zoom: 13.5, bearing: 0, pitch: 0, animated: false, userInteraction: true } });
    expect(onCameraChanged).toHaveBeenCalledWith([44.41, 33.32], 13.5);
  });

  it('starts on the city and keeps the camera within its padded bbox', async () => {
    await render(<MapCanvas {...props} />);
    expect(camera()).toHaveProp('initialViewState', { bounds: city.bbox });
    expect(camera()).toHaveProp('maxBounds', cameraBounds(city.bbox));
    expect(camera()).not.toHaveProp('center');
    expect(camera().props.setStop).not.toHaveBeenCalled();
  });

  it('moves the map to every new camera value once the style has loaded, even an equal one, and not on other re-renders', async () => {
    const at = { center: [44.4, 33.3] as LngLat, zoom: 16 };
    await render(<MapCanvas {...props} camera={at} />);
    const { setStop } = camera().props;
    expect(setStop).toHaveBeenCalledTimes(1);
    expect(setStop).toHaveBeenLastCalledWith({ ...at, duration: 600, easing: 'ease' });
    await screen.rerender(<MapCanvas {...props} camera={{ ...at }} />);
    expect(setStop).toHaveBeenCalledTimes(2);
    const view = { bounds: [44.3, 33.25, 44.4, 33.35] as BBox, paddingPx: 40 };
    await screen.rerender(<MapCanvas {...props} camera={view} />);
    expect(setStop).toHaveBeenLastCalledWith({ bounds: view.bounds, padding: { top: 40, right: 40, bottom: 40, left: 40 }, duration: 600, easing: 'ease' });
    await screen.rerender(<MapCanvas {...props} camera={view} markers={markers} lang="en" />);
    expect(setStop).toHaveBeenCalledTimes(3);
  });

  it('shows the user location puck only when asked', async () => {
    await render(<MapCanvas {...props} />);
    expect(screen.queryByTestId(mapPartIDs.userLocation)).not.toBeOnTheScreen();
    await screen.rerender(<MapCanvas {...props} showUserLocation />);
    expect(screen.getByTestId(mapPartIDs.userLocation)).toBeOnTheScreen();
  });
});

describe('MapAttribution', () => {
  it('is the OSM attribution as plain readable text in the bottom-end corner', async () => {
    await render(<MapAttribution />);
    const text = screen.getByTestId(testIDs.map.attribution);
    expect(text).toHaveTextContent(OSM_ATTRIBUTION);
    expect(text).toHaveStyle({ color: '#1f2328', fontSize: 12, writingDirection: 'ltr' });
    // Wraps rather than ellipsising the legal text at the largest font scales.
    expect(text).not.toHaveProp('numberOfLines');
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });
});
