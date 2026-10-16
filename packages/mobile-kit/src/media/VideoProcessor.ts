/**
 * VideoProcessor – video metadata and thumbnail extraction helpers.
 * Trim is stubbed (requires a native FFmpeg bridge not in the MVP).
 */
import * as VideoThumbnails from 'expo-video-thumbnails';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VideoMetadata {
  /** Duration in milliseconds. */
  durationMs: number;
  /** Native width in pixels. */
  width: number;
  /** Native height in pixels. */
  height: number;
  /** Derived from URI extension. */
  mimeType: string;
  /** Estimated byte size (not always available). */
  size?: number;
}

export interface VideoThumbnailResult {
  uri: string;
  width: number;
  height: number;
}

export interface TrimOptions {
  startMs: number;
  endMs: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mimeFromUri(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    m4v: 'video/mp4',
  };
  return map[ext ?? ''] ?? 'video/mp4';
}

// ─── VideoProcessor ───────────────────────────────────────────────────────────

export const VideoProcessor = {
  /**
   * Generate a thumbnail image from a video URI at the given time offset.
   *
   * @param uri - Local video URI.
   * @param timeMs - Time offset in milliseconds. Defaults to 0.
   * @param quality - Thumbnail quality 0–1. Defaults to 0.8.
   */
  async generateThumbnail(
    uri: string,
    timeMs: number = 0,
    quality: number = 0.8,
  ): Promise<VideoThumbnailResult> {
    const result = await VideoThumbnails.getThumbnailAsync(uri, {
      time: timeMs,
      quality,
    });

    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
    };
  },

  /**
   * Generate a set of thumbnails evenly distributed across the video duration.
   * Useful for a scrubber preview strip.
   *
   * @param uri - Local video URI.
   * @param count - Number of thumbnails to generate.
   * @param durationMs - Known duration in ms (avoids an extra metadata call).
   */
  async generateStrip(
    uri: string,
    count: number,
    durationMs: number,
  ): Promise<VideoThumbnailResult[]> {
    const interval = durationMs / Math.max(count, 1);
    const timestamps = Array.from({ length: count }, (_, i) => Math.round(i * interval));
    const results = await Promise.all(
      timestamps.map((t) => VideoProcessor.generateThumbnail(uri, t, 0.6)),
    );
    return results;
  },

  /**
   * Extract basic metadata from a video URI.
   * Uses expo-video-thumbnails as a probe: if thumbnail generation succeeds
   * we get dimensions; duration requires AV info not directly exposed here,
   * so we return 0 and let the caller supply it from expo-av / ImagePicker.
   *
   * In a future milestone this can be replaced with a native metadata reader.
   */
  async getMetadata(uri: string, knownDurationMs?: number): Promise<VideoMetadata> {
    let width = 0;
    let height = 0;

    try {
      const thumb = await VideoThumbnails.getThumbnailAsync(uri, { time: 0, quality: 0.5 });
      width = thumb.width;
      height = thumb.height;
    } catch {
      // Dimensions unavailable — return 0 placeholders.
    }

    return {
      durationMs: knownDurationMs ?? 0,
      width,
      height,
      mimeType: mimeFromUri(uri),
    };
  },

  /**
   * Trim a video clip.
   *
   * STUB — trimming requires a native FFmpeg bridge (e.g. ffmpeg-kit-react-native)
   * which is not included in the MVP. Returns the original URI unchanged and
   * records a warning so callers know no trim occurred.
   */
  async trimVideo(
    uri: string,
    _options: TrimOptions,
  ): Promise<{ uri: string; trimmed: boolean; warning: string }> {
    const warning =
      'VideoProcessor.trimVideo: native FFmpeg bridge not available in MVP. ' +
      'Returning original URI untrimmed. Install ffmpeg-kit-react-native to enable.';

    if (__DEV__) {
      console.warn(warning);
    }

    return { uri, trimmed: false, warning };
  },

  /**
   * Validate that a video's duration does not exceed maxDurationMs.
   */
  isDurationValid(durationMs: number, maxDurationMs: number): boolean {
    return durationMs <= maxDurationMs;
  },

  /**
   * Returns display-friendly duration string, e.g. "0:12" or "1:02".
   */
  formatDuration(ms: number): string {
    const totalSec = Math.round(ms / 1000);
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  },
};
