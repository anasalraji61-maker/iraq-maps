/**
 * Type stubs for Expo packages that are available at runtime in the Expo
 * app but are not direct dependencies of this library package.
 */

declare module 'expo-image-manipulator' {
  export const SaveFormat: { JPEG: 'jpeg'; PNG: 'png'; WEBP: 'webp' };
  export type SaveFormat = 'jpeg' | 'png' | 'webp';
  export type Action =
    | { resize: { width?: number; height?: number } }
    | { crop: { originX: number; originY: number; width: number; height: number } }
    | { rotate: number }
    | { flip: 'vertical' | 'horizontal' };
  export type ImageResult = { uri: string; width: number; height: number };
  export function manipulateAsync(
    uri: string,
    actions: Action[],
    options?: { compress?: number; format?: SaveFormat; base64?: boolean },
  ): Promise<ImageResult>;
}

declare module 'expo-video-thumbnails' {
  export type VideoThumbnailsOptions = { time?: number; quality?: number };
  export type VideoThumbnailsResult = { uri: string; width: number; height: number };
  export function getThumbnailAsync(
    sourceFilename: string,
    options?: VideoThumbnailsOptions,
  ): Promise<VideoThumbnailsResult>;
}
