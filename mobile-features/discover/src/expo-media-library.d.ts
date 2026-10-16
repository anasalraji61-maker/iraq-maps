declare module 'expo-media-library' {
  export type MediaTypeValue = 'photo' | 'video' | 'audio' | 'unknown';
  export const MediaType: {
    photo: 'photo';
    video: 'video';
    audio: 'audio';
    unknown: 'unknown';
  };
  export const SortBy: {
    default: string;
    id: string;
    creationTime: string;
    modificationTime: string;
    mediaType: string;
    width: string;
    height: string;
    duration: string;
  };
  export interface Asset {
    id: string;
    filename: string;
    uri: string;
    mediaType: MediaTypeValue;
    width: number;
    height: number;
    duration: number;
    creationTime: number;
    modificationTime: number;
    albumId?: string;
  }
  export interface AssetsOptions {
    first?: number;
    after?: string;
    album?: Album | null;
    sortBy?: string | string[];
    mediaType?: MediaTypeValue | MediaTypeValue[];
  }
  export interface PagedInfo<T> {
    assets: T[];
    endCursor: string;
    hasNextPage: boolean;
    totalCount: number;
  }
  export interface Album {
    id: string;
    title: string;
    assetCount: number;
  }
  export interface PermissionResponse {
    status: 'granted' | 'denied' | 'undetermined';
    granted: boolean;
  }
  export function requestPermissionsAsync(): Promise<PermissionResponse>;
  export function getAssetsAsync(options?: AssetsOptions): Promise<PagedInfo<Asset>>;
  export function getAlbumsAsync(): Promise<Album[]>;
  export function saveToLibraryAsync(localUri: string): Promise<Asset>;
}
