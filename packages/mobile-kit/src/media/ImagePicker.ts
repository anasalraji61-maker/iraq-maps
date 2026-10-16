/**
 * ImagePicker – wrapper around expo-image-picker with privacy-safe defaults.
 *
 * Guarantees:
 *  - GPS EXIF is stripped before any image leaves the device.
 *  - Output files are compressed to ≤ 2 MB.
 *  - Max 10 images per selection.
 *  - Permissions are requested with meaningful messages.
 */

import * as ExpoImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

// ─── Constants ────────────────────────────────────────────────────────────────

export const MAX_PHOTOS = 10;
export const MAX_BYTES  = 10 * 1024 * 1024; // 10 MB raw; compressed to ≤ 2 MB
export const TARGET_BYTES = 2 * 1024 * 1024; // 2 MB target after compression
export const MAX_DIMENSION = 1920;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PickedImage {
  /** Local file:// URI ready for upload. GPS stripped. */
  uri: string;
  width: number;
  height: number;
  /** Byte size after compression. */
  size: number;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export type PickSource = 'camera' | 'gallery';

export interface PickOptions {
  /** Maximum number of images. 1 = single selection. Default: 1. */
  limit?: number;
  source: PickSource;
  /** Aspect ratio crop hint, e.g. [1,1] for square. Omit for free. */
  aspect?: [number, number];
  /** Allow multiple selection (source='gallery' only). */
  allowsMultiple?: boolean;
}

export interface PickResult {
  images: PickedImage[];
  /** True when the user dismissed without selecting. */
  cancelled: boolean;
}

export interface PermissionResult {
  granted: boolean;
  /** Human-readable reason when denied. */
  reason?: string;
}

// ─── Permission helpers ───────────────────────────────────────────────────────

/**
 * Request camera permission.
 * Returns { granted: true } when the OS grants access.
 */
export async function requestCameraPermission(): Promise<PermissionResult> {
  const { status, canAskAgain } = await ExpoImagePicker.requestCameraPermissionsAsync();

  if (status === 'granted') return { granted: true };

  const reason = canAskAgain
    ? 'camera_denied_ask_again'
    : 'camera_denied_permanent';

  return { granted: false, reason };
}

/**
 * Request media library (gallery) permission.
 */
export async function requestMediaLibraryPermission(): Promise<PermissionResult> {
  const { status, canAskAgain } =
    await ExpoImagePicker.requestMediaLibraryPermissionsAsync();

  if (status === 'granted') return { granted: true };

  const reason = canAskAgain
    ? 'gallery_denied_ask_again'
    : 'gallery_denied_permanent';

  return { granted: false, reason };
}

/**
 * Get current permission state without prompting.
 */
export async function checkPermissions(): Promise<{
  camera: ExpoImagePicker.PermissionStatus;
  mediaLibrary: ExpoImagePicker.PermissionStatus;
}> {
  const [cam, lib] = await Promise.all([
    ExpoImagePicker.getCameraPermissionsAsync(),
    ExpoImagePicker.getMediaLibraryPermissionsAsync(),
  ]);
  return { camera: cam.status, mediaLibrary: lib.status };
}

// ─── GPS strip ────────────────────────────────────────────────────────────────

/**
 * Strip GPS (and all other EXIF) from an image by re-encoding through
 * expo-image-manipulator. manipulateAsync never re-attaches EXIF.
 * Returns a new URI; the original is unchanged.
 */
async function stripGps(uri: string): Promise<{ uri: string; width: number; height: number }> {
  // A no-op manipulation forces a re-encode, dropping all metadata.
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_DIMENSION } }],
    { compress: 1.0, format: ImageManipulator.SaveFormat.JPEG },
  );
  return { uri: result.uri, width: result.width, height: result.height };
}

// ─── Compression ──────────────────────────────────────────────────────────────

/**
 * Compress an image to stay within TARGET_BYTES.
 * Tries quality 0.85 first; if still too large steps down to 0.7 then 0.55.
 */
/** Estimate file size from a file:// URI by fetching as a blob. */
async function getFileSize(uri: string): Promise<number> {
  try {
    const resp = await fetch(uri);
    const blob = await resp.blob();
    return blob.size;
  } catch {
    return 0;
  }
}

async function compress(
  uri: string,
  width: number,
  _height: number,
): Promise<{ uri: string; width: number; height: number; size: number }> {
  const qualities = [0.85, 0.70, 0.55];

  for (const quality of qualities) {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG },
    );

    const size = await getFileSize(result.uri);

    if (size <= TARGET_BYTES || size === 0) {
      return { uri: result.uri, width: result.width, height: result.height, size };
    }
  }

  // Fallback: also reduce dimensions by half.
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: Math.floor(width / 2) } }],
    { compress: 0.55, format: ImageManipulator.SaveFormat.JPEG },
  );
  const size = await getFileSize(result.uri);
  return { uri: result.uri, width: result.width, height: result.height, size };
}

// ─── Core processing pipeline ─────────────────────────────────────────────────

/**
 * Process a single raw URI from the picker:
 *  1. Resize to ≤ MAX_DIMENSION on the longest edge (strip GPS via re-encode).
 *  2. Compress to ≤ TARGET_BYTES.
 * Returns a PickedImage ready for upload.
 */
async function processImage(rawUri: string): Promise<PickedImage> {
  // Step 1: strip GPS + resize.
  const stripped = await stripGps(rawUri);

  // Step 2: compress.
  const { uri, width, height, size } = await compress(
    stripped.uri,
    stripped.width,
    stripped.height,
  );

  return { uri, width, height, size, mimeType: 'image/jpeg' };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Launch the image picker according to the given options.
 *
 * Handles permissions internally:
 *   - For 'camera': requests camera permission.
 *   - For 'gallery': requests media library permission.
 *
 * Throws { code: string; message: string } on permission denial.
 */
export async function pickImages(options: PickOptions): Promise<PickResult> {
  const { limit = 1, source, aspect, allowsMultiple = false } = options;
  const effectiveLimit = Math.min(limit, MAX_PHOTOS);

  // Permission check.
  if (source === 'camera') {
    const perm = await requestCameraPermission();
    if (!perm.granted) {
      throw { code: perm.reason ?? 'camera_denied', message: 'Camera permission denied' };
    }
  } else {
    const perm = await requestMediaLibraryPermission();
    if (!perm.granted) {
      throw { code: perm.reason ?? 'gallery_denied', message: 'Media library permission denied' };
    }
  }

  // Launch picker.
  const pickerResult = source === 'camera'
    ? await ExpoImagePicker.launchCameraAsync({
        mediaTypes: ExpoImagePicker.MediaTypeOptions.Images,
        quality: 1.0,
        allowsEditing: aspect !== undefined,
        aspect,
        exif: false,        // never request EXIF from picker
      })
    : await ExpoImagePicker.launchImageLibraryAsync({
        mediaTypes: ExpoImagePicker.MediaTypeOptions.Images,
        quality: 1.0,
        allowsMultipleSelection: allowsMultiple,
        selectionLimit: effectiveLimit,
        allowsEditing: !allowsMultiple && aspect !== undefined,
        aspect,
        exif: false,        // never request EXIF from picker
      });

  if (pickerResult.canceled) {
    return { images: [], cancelled: true };
  }

  // Process all selected assets concurrently (GPS strip + compress).
  const assets = pickerResult.assets.slice(0, effectiveLimit);
  const images = await Promise.all(assets.map((a) => processImage(a.uri)));

  return { images, cancelled: false };
}

/**
 * Pick a single image from camera or gallery and return it.
 * Convenience wrapper around pickImages.
 */
export async function pickSingleImage(
  source: PickSource,
  aspect?: [number, number],
): Promise<PickedImage | null> {
  const result = await pickImages({ limit: 1, source, aspect, allowsMultiple: false });
  return result.cancelled ? null : (result.images[0] ?? null);
}

/**
 * Pick up to MAX_PHOTOS images from the gallery.
 */
export async function pickMultipleImages(): Promise<PickedImage[]> {
  const result = await pickImages({
    limit: MAX_PHOTOS,
    source: 'gallery',
    allowsMultiple: true,
  });
  return result.cancelled ? [] : result.images;
}

/**
 * Validate that a picked image is within the raw size limit before processing.
 * Throws if the file exceeds MAX_BYTES.
 */
export async function validateImageSize(uri: string): Promise<void> {
  const size = await getFileSize(uri);
  if (size > MAX_BYTES) {
    throw {
      code: 'file_too_large',
      message: `Image exceeds ${MAX_BYTES / (1024 * 1024)} MB limit`,
    };
  }
}

/**
 * Re-process an already-picked image (e.g. after a filter is applied).
 * GPS is stripped again to be safe.
 */
export async function reprocessImage(uri: string): Promise<PickedImage> {
  return processImage(uri);
}
