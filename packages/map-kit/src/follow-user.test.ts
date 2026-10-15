import { describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import type { CameraLike, UseFollowUserProps } from './follow-user';
import { useFollowUser } from './follow-user';

function makeCamera(): CameraLike & { setCamera: ReturnType<typeof jest.fn> } {
  return { setCamera: jest.fn() };
}

describe('useFollowUser', () => {
  it('calls setCamera when active and location is set', async () => {
    const camera = makeCamera();
    const cameraRef = { current: camera };
    await act(async () => {
      renderHook((props: UseFollowUserProps) => useFollowUser(props), {
        initialProps: { cameraRef, active: true, location: [44.3, 33.3] as [number, number] },
      });
    });
    expect(camera.setCamera).toHaveBeenCalledTimes(1);
    expect(camera.setCamera).toHaveBeenCalledWith({
      centerCoordinate: [44.3, 33.3],
      animationDuration: 300,
    });
  });

  it('does not call setCamera when inactive', async () => {
    const camera = makeCamera();
    const cameraRef = { current: camera };
    await act(async () => {
      renderHook(() => useFollowUser({ cameraRef, active: false, location: [44.3, 33.3] as [number, number] }));
    });
    expect(camera.setCamera).not.toHaveBeenCalled();
  });

  it('does not call setCamera when location is absent', async () => {
    const camera = makeCamera();
    const cameraRef = { current: camera };
    await act(async () => {
      renderHook(() => useFollowUser({ cameraRef, active: true }));
    });
    expect(camera.setCamera).not.toHaveBeenCalled();
  });

  it('passes heading when provided', async () => {
    const camera = makeCamera();
    const cameraRef = { current: camera };
    await act(async () => {
      renderHook(() =>
        useFollowUser({ cameraRef, active: true, location: [44.3, 33.3] as [number, number], heading: 45 }),
      );
    });
    expect(camera.setCamera).toHaveBeenCalledWith({
      centerCoordinate: [44.3, 33.3],
      animationDuration: 300,
      heading: 45,
    });
  });

  it('does not call setCamera when cameraRef.current is null', async () => {
    const cameraRef = { current: null };
    await act(async () => {
      renderHook(() =>
        useFollowUser({ cameraRef, active: true, location: [44.3, 33.3] as [number, number] }),
      );
    });
    // No throw — cameraRef.current?.setCamera is optional-chained
  });
});
