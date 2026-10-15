// Minimal type stubs for expo-av until the package is installed.
declare module 'expo-av' {
  import type { ComponentType } from 'react';
  export const ResizeMode: { CONTAIN: 'contain'; COVER: 'cover'; STRETCH: 'stretch' };
  export type ResizeModeValue = 'contain' | 'cover' | 'stretch';
  export interface VideoProps {
    source: { uri: string } | number;
    resizeMode?: ResizeModeValue;
    style?: unknown;
    useNativeControls?: boolean;
    isLooping?: boolean;
  }
  export const Video: ComponentType<VideoProps>;
}
