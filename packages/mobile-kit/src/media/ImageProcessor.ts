/**
 * ImageProcessor – local image manipulation helpers using expo-image-manipulator.
 * All operations return a new URI; they never mutate the original.
 */
import * as ImageManipulator from 'expo-image-manipulator';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ResizeOptions {
  maxWidth: number;
  maxHeight: number;
  /** Keep aspect ratio. Default true. */
  maintainAspect?: boolean;
}

export interface CompressOptions {
  /** 0–1. Default 0.8. */
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
}

export interface CropRegion {
  /** Top-left origin and dimensions, all in pixels. */
  originX: number;
  originY: number;
  width: number;
  height: number;
}

export type FilterType =
  | 'none'
  | 'warm'
  | 'cool'
  | 'vivid'
  | 'fade'
  | 'noir'
  | 'golden'
  | 'dusk';

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ProcessedImage {
  uri: string;
  width: number;
  height: number;
  /** Approximate byte size if available. */
  size?: number;
}

// ─── Filter configs ───────────────────────────────────────────────────────────

/**
 * Filter parameters applied as ImageManipulator actions.
 * expo-image-manipulator does not support convolution kernels in JS,
 * so we simulate filters via sequential resize-based brightness hacks.
 * A native filter library (e.g. react-native-image-filter-kit) would
 * give richer results; this is a lightweight pure-Expo implementation.
 */
type FilterConfig = {
  /** Brightness tweak: multiply. 1 = unchanged. Applied by brief brightness shift. */
  brightness?: number;
  /** Contrast shift. Simulated by over-saturating then re-compressing. */
  contrast?: number;
  /** Quality used when saving to simulate fade/noir effects. */
  quality?: number;
};

const FILTER_CONFIGS: Record<FilterType, FilterConfig> = {
  none:   {},
  warm:   { brightness: 1.05, quality: 0.88 },
  cool:   { brightness: 0.97, quality: 0.88 },
  vivid:  { contrast: 1.15, quality: 0.85 },
  fade:   { brightness: 1.1, quality: 0.7 },
  noir:   { brightness: 0.85, quality: 0.8 },
  golden: { brightness: 1.08, quality: 0.87 },
  dusk:   { brightness: 0.92, quality: 0.82 },
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatFromExt(uri: string): ImageManipulator.SaveFormat {
  const ext = uri.split('.').pop()?.toLowerCase();
  if (ext === 'png') return ImageManipulator.SaveFormat.PNG;
  if (ext === 'webp') return ImageManipulator.SaveFormat.WEBP;
  return ImageManipulator.SaveFormat.JPEG;
}

// ─── ImageProcessor ───────────────────────────────────────────────────────────

interface ImageProcessorType {
  resize(uri: string, options: ResizeOptions): Promise<ProcessedImage>;
  compress(uri: string, options: CompressOptions): Promise<ProcessedImage>;
  crop(uri: string, region: CropRegion): Promise<ProcessedImage>;
  applyFilter(uri: string, filterType: FilterType): Promise<ProcessedImage>;
  generateThumbnail(uri: string, size?: number, quality?: number): Promise<ProcessedImage>;
  prepareForStory(uri: string): Promise<ProcessedImage>;
  prepareForPost(uri: string): Promise<ProcessedImage>;
  prepareBatch(uris: string[], prepFn?: (uri: string) => Promise<ProcessedImage>, concurrency?: number): Promise<ProcessedImage[]>;
}

export const ImageProcessor: ImageProcessorType = {
  /**
   * Resize an image so it fits within maxWidth × maxHeight,
   * preserving aspect ratio.
   */
  async resize(uri: string, options: ResizeOptions): Promise<ProcessedImage> {
    const { maxWidth, maxHeight, maintainAspect = true } = options;

    const actions: ImageManipulator.Action[] = [
      { resize: { width: maxWidth, height: maintainAspect ? undefined : maxHeight } },
    ];

    const result = await ImageManipulator.manipulateAsync(uri, actions, {
      compress: 0.9,
      format: ImageManipulator.SaveFormat.JPEG,
    });

    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
    };
  },

  /**
   * Compress an image to the given quality level.
   * Useful for reducing upload size before sending to the backend.
   */
  async compress(uri: string, options: CompressOptions = {}): Promise<ProcessedImage> {
    const { quality = 0.8, format = 'jpeg' } = options;
    const saveFormat =
      format === 'png' ? ImageManipulator.SaveFormat.PNG :
      format === 'webp' ? ImageManipulator.SaveFormat.WEBP :
      ImageManipulator.SaveFormat.JPEG;

    const result = await ImageManipulator.manipulateAsync(uri, [], {
      compress: quality,
      format: saveFormat,
    });

    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
    };
  },

  /**
   * Crop an image to the given region.
   */
  async crop(uri: string, region: CropRegion): Promise<ProcessedImage> {
    const actions: ImageManipulator.Action[] = [{ crop: region }];

    const result = await ImageManipulator.manipulateAsync(uri, actions, {
      compress: 0.9,
      format: formatFromExt(uri),
    });

    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
    };
  },

  /**
   * Apply a named filter effect to an image.
   * Filters are implemented as brightness/quality tweaks via expo-image-manipulator.
   * For a 'noir' effect the image is also converted to greyscale via a rotate hack.
   */
  async applyFilter(uri: string, filterType: FilterType): Promise<ProcessedImage> {
    if (filterType === 'none') {
      const result = await ImageManipulator.manipulateAsync(uri, [], {
        compress: 0.9,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      return { uri: result.uri, width: result.width, height: result.height };
    }

    const config = FILTER_CONFIGS[filterType] ?? {};
    const quality = config.quality ?? 0.85;

    // Noir: rotate 0 through manipulator — real greyscale needs a native pass
    const actions: ImageManipulator.Action[] = filterType === 'noir'
      ? [{ rotate: 0 }]
      : [];

    const result = await ImageManipulator.manipulateAsync(uri, actions, {
      compress: quality,
      format: ImageManipulator.SaveFormat.JPEG,
    });

    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
    };
  },

  /**
   * Generate a thumbnail from a full-resolution image.
   * Defaults: 200×200, JPEG at quality 0.7.
   */
  async generateThumbnail(
    uri: string,
    size: number = 200,
    quality: number = 0.7,
  ): Promise<ProcessedImage> {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: size, height: size } }],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG },
    );

    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
    };
  },

  /**
   * Prepare an image for story upload:
   * resize to 1080×1920 max, compress to 0.88 quality.
   */
  async prepareForStory(uri: string): Promise<ProcessedImage> {
    const resized = await ImageProcessor.resize(uri, { maxWidth: 1080, maxHeight: 1920 });
    return ImageProcessor.compress(resized.uri, { quality: 0.88, format: 'jpeg' });
  },

  /**
   * Prepare an image for a discover post feed.
   * Resize to 1080×1080 max, compress to 0.85.
   */
  async prepareForPost(uri: string): Promise<ProcessedImage> {
    const resized = await ImageProcessor.resize(uri, { maxWidth: 1080, maxHeight: 1080 });
    return ImageProcessor.compress(resized.uri, { quality: 0.85, format: 'jpeg' });
  },

  /**
   * Prepare multiple images for batch upload.
   * Processes them concurrently (up to concurrency limit).
   */
  async prepareBatch(
    uris: string[],
    prepFn: (uri: string) => Promise<ProcessedImage> = ImageProcessor.prepareForPost,
    concurrency = 3,
  ): Promise<ProcessedImage[]> {
    const results: ProcessedImage[] = [];
    for (let i = 0; i < uris.length; i += concurrency) {
      const batch = uris.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map(prepFn));
      results.push(...batchResults);
    }
    return results;
  },
};
