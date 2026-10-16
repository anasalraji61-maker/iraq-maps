/** @public media processing and upload utilities */
export { ImageProcessor } from './ImageProcessor';
export type {
  ResizeOptions,
  CompressOptions,
  CropRegion,
  FilterType,
  ImageDimensions,
  ProcessedImage,
} from './ImageProcessor';

export { VideoProcessor } from './VideoProcessor';
export type {
  VideoMetadata,
  VideoThumbnailResult,
  TrimOptions,
} from './VideoProcessor';

export { MediaUploader, createMediaUploader } from './MediaUploader';
export type {
  UploadProgressCallback,
  UploadResult,
  UploadImageOptions,
  UploadVideoOptions,
  DeleteMediaOptions,
} from './MediaUploader';
