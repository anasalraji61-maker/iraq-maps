import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, fireEvent, act } from '@testing-library/react-native';
import React from 'react';
import { TourOverlay, shouldShowTour, TOUR_DONE_KEY } from './tour-overlay';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockGet = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;
const mockSet = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;

const steps = [
  { id: 'like', title: 'Like something?', body: 'Tap the heart' },
  { id: 'search', title: 'Search easily', body: 'Find places' },
];

describe('TourOverlay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSet.mockResolvedValue(undefined);
  });

  it('renders nothing when not visible', async () => {
    const { queryByText } = await render(
      <TourOverlay
        visible={false}
        steps={steps}
        nextLabel="Next"
        doneLabel="Done"
        skipLabel="Skip"
        onDone={() => undefined}
      />,
    );
    expect(queryByText('Like something?')).toBeNull();
  });

  it('renders the first step when visible', async () => {
    const { getByText } = await render(
      <TourOverlay
        visible={true}
        steps={steps}
        nextLabel="Next"
        doneLabel="Done"
        skipLabel="Skip"
        onDone={() => undefined}
      />,
    );
    expect(getByText('Like something?')).toBeTruthy();
    expect(getByText('Tap the heart')).toBeTruthy();
  });

  it('calls onDone and writes storage when skip is pressed', async () => {
    const onDone = jest.fn();
    const { getByText } = await render(
      <TourOverlay
        visible={true}
        steps={steps}
        nextLabel="Next"
        doneLabel="Done"
        skipLabel="Skip"
        onDone={onDone}
      />,
    );
    fireEvent.press(getByText('Skip'));
    await Promise.resolve();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith(TOUR_DONE_KEY, '1');
  });

  it('advances to the next step on Next press', async () => {
    const onDone = jest.fn();
    const { getByText } = await render(
      <TourOverlay
        visible={true}
        steps={steps}
        nextLabel="Next"
        doneLabel="Done"
        skipLabel="Skip"
        onDone={onDone}
      />,
    );
    await act(async () => { fireEvent.press(getByText('Next')); });
    expect(getByText('Search easily')).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('calls onDone on the last step Done press', async () => {
    const onDone = jest.fn();
    const { getByText } = await render(
      <TourOverlay
        visible={true}
        steps={[{ id: 'only', title: 'Only step' }]}
        nextLabel="Next"
        doneLabel="Done"
        skipLabel="Skip"
        onDone={onDone}
      />,
    );
    fireEvent.press(getByText('Done'));
    await Promise.resolve();
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('shouldShowTour', () => {
  beforeEach(() => {
    mockGet.mockResolvedValue(null);
  });

  it('returns true when no key stored', async () => {
    expect(await shouldShowTour()).toBe(true);
  });

  it('returns false when key is already stored', async () => {
    mockGet.mockResolvedValue('1');
    expect(await shouldShowTour()).toBe(false);
  });
});
