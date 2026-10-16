/**
 * VideoPlayer – expo-av wrapper with fullscreen, progress bar, and playback controls.
 *
 * Designed as a headless controller; the UI layer (VideoPlayerView) renders
 * controls and uses this class for all state mutations.
 */

import { RefObject } from 'react';

// expo-av types declared inline so this file compiles without expo-av installed
// in the mobile-kit package (the consuming app provides it at runtime).
interface AVPlaybackStatus {
  isLoaded: boolean;
  error?: string;
}
interface AVPlaybackStatusSuccess {
  isLoaded: true;
  isPlaying: boolean;
  isBuffering?: boolean;
  isMuted: boolean;
  positionMillis?: number;
  durationMillis?: number;
  rate: number;
  didJustFinish?: boolean;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface AudioModule {
  setAudioModeAsync(options: Record<string, unknown>): Promise<void>;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VideoInstance = any;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlaybackState {
  isLoaded: boolean;
  isPlaying: boolean;
  isBuffering: boolean;
  isMuted: boolean;
  /** Current position in milliseconds. */
  positionMs: number;
  /** Total duration in milliseconds. */
  durationMs: number;
  /** 0–1. */
  progress: number;
  /** Playback rate (1 = normal). */
  rate: number;
  /** Whether the video has reached the end. */
  isFinished: boolean;
  error: string | null;
}

export type PlaybackRate = 0.5 | 0.75 | 1.0 | 1.25 | 1.5 | 2.0;

export interface VideoPlayerOptions {
  /** Auto-play on load. Default false. */
  autoPlay?: boolean;
  /** Loop playback. Default false. */
  loop?: boolean;
  /** Start muted. Default false. */
  startMuted?: boolean;
  /** Initial playback position in ms. Default 0. */
  initialPositionMs?: number;
  /** Pause when scrolled off-screen (requires visibility signal via pause()). Default true. */
  pauseOffScreen?: boolean;
}

export type PlaybackEventHandler = (state: PlaybackState) => void;

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_STATE: PlaybackState = {
  isLoaded: false,
  isPlaying: false,
  isBuffering: false,
  isMuted: false,
  positionMs: 0,
  durationMs: 0,
  progress: 0,
  rate: 1.0,
  isFinished: false,
  error: null,
};

const SEEK_STEP_MS = 10_000; // 10 s for skip forward/back

// ─── VideoPlayer ──────────────────────────────────────────────────────────────

export class VideoPlayer {
  private readonly videoRef: RefObject<VideoInstance>;
  private state: PlaybackState = { ...DEFAULT_STATE };
  private listeners: Set<PlaybackEventHandler> = new Set();
  private options: Required<VideoPlayerOptions>;

  constructor(
    videoRef: RefObject<VideoInstance>,
    options: VideoPlayerOptions = {},
  ) {
    this.videoRef = videoRef;
    this.options = {
      autoPlay: false,
      loop: false,
      startMuted: false,
      initialPositionMs: 0,
      pauseOffScreen: true,
      ...options,
    };
  }

  // ─── Internal state ─────────────────────────────────────────────────────────

  private setState(patch: Partial<PlaybackState>): void {
    this.state = { ...this.state, ...patch };
    for (const handler of this.listeners) {
      handler(this.state);
    }
  }

  /** Subscribe to playback state changes. Returns an unsubscribe function. */
  subscribe(handler: PlaybackEventHandler): () => void {
    this.listeners.add(handler);
    // Emit current state immediately.
    handler(this.state);
    return () => this.listeners.delete(handler);
  }

  /** Get the current playback state snapshot. */
  getState(): PlaybackState {
    return { ...this.state };
  }

  // ─── AVPlaybackStatus handler ────────────────────────────────────────────────

  /**
   * Pass this to the `<Video onPlaybackStatusUpdate>` prop.
   */
  handleStatusUpdate = (status: AVPlaybackStatus): void => {
    if (!status.isLoaded) {
      this.setState({
        isLoaded: false,
        isPlaying: false,
        isBuffering: false,
        error: status.error ?? null,
      });
      return;
    }

    const s = status as AVPlaybackStatusSuccess;
    const durationMs = s.durationMillis ?? 0;
    const positionMs = s.positionMillis ?? 0;
    const progress   = durationMs > 0 ? positionMs / durationMs : 0;

    this.setState({
      isLoaded: true,
      isPlaying: s.isPlaying,
      isBuffering: s.isBuffering ?? false,
      isMuted: s.isMuted,
      positionMs,
      durationMs,
      progress,
      rate: s.rate,
      isFinished: s.didJustFinish ?? false,
      error: null,
    });
  };

  // ─── Playback controls ───────────────────────────────────────────────────────

  private get video(): VideoInstance | null {
    return this.videoRef.current;
  }

  async load(uri: string): Promise<void> {
    if (!this.video) return;
    try {
      await this.video.loadAsync(
        { uri },
        {
          shouldPlay: this.options.autoPlay,
          isMuted: this.options.startMuted,
          positionMillis: this.options.initialPositionMs,
          isLooping: this.options.loop,
          progressUpdateIntervalMillis: 500,
        },
      );
    } catch (err) {
      this.setState({ error: String(err) });
    }
  }

  async play(): Promise<void> {
    try {
      await this.video?.playAsync();
    } catch {
      // ignore
    }
  }

  async pause(): Promise<void> {
    try {
      await this.video?.pauseAsync();
    } catch {
      // ignore
    }
  }

  async togglePlayPause(): Promise<void> {
    if (this.state.isPlaying) {
      await this.pause();
    } else {
      if (this.state.isFinished) {
        await this.seekTo(0);
      }
      await this.play();
    }
  }

  async seekTo(positionMs: number): Promise<void> {
    try {
      await this.video?.setPositionAsync(positionMs);
    } catch {
      // ignore
    }
  }

  async seekToFraction(fraction: number): Promise<void> {
    const target = Math.floor(fraction * this.state.durationMs);
    await this.seekTo(Math.max(0, Math.min(this.state.durationMs, target)));
  }

  async skipForward(): Promise<void> {
    const target = Math.min(
      this.state.positionMs + SEEK_STEP_MS,
      this.state.durationMs,
    );
    await this.seekTo(target);
  }

  async skipBack(): Promise<void> {
    const target = Math.max(this.state.positionMs - SEEK_STEP_MS, 0);
    await this.seekTo(target);
  }

  async setMuted(muted: boolean): Promise<void> {
    try {
      await this.video?.setIsMutedAsync(muted);
    } catch {
      // ignore
    }
  }

  async toggleMute(): Promise<void> {
    await this.setMuted(!this.state.isMuted);
  }

  async setRate(rate: PlaybackRate): Promise<void> {
    try {
      await this.video?.setRateAsync(rate, true);
    } catch {
      // ignore
    }
  }

  async setLoop(loop: boolean): Promise<void> {
    try {
      await this.video?.setIsLoopingAsync(loop);
    } catch {
      // ignore
    }
  }

  // ─── Fullscreen ──────────────────────────────────────────────────────────────

  async presentFullscreen(): Promise<void> {
    try {
      await this.video?.presentFullscreenPlayer();
    } catch {
      // ignore
    }
  }

  async dismissFullscreen(): Promise<void> {
    try {
      await this.video?.dismissFullscreenPlayer();
    } catch {
      // ignore
    }
  }

  // ─── Off-screen auto-pause ────────────────────────────────────────────────────

  /**
   * Call from a scroll/visibility observer when the player goes off-screen.
   * Only pauses when pauseOffScreen option is enabled.
   */
  onBecameHidden(): void {
    if (this.options.pauseOffScreen && this.state.isPlaying) {
      void this.pause();
    }
  }

  onBecameVisible(): void {
    // Don't auto-resume – only the user should restart playback.
  }

  // ─── Audio session ────────────────────────────────────────────────────────────

  /**
   * Configure the audio session for video playback.
   * Call once at app startup or before the first video loads.
   */
  static async configureAudioSession(): Promise<void> {
    // Call Audio.setAudioModeAsync from the consuming app (expo-av is a peer).
    // Example:
    //   import { Audio } from 'expo-av';
    //   await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, shouldDuckAndroid: true });
  }

  // ─── Cleanup ─────────────────────────────────────────────────────────────────

  async unload(): Promise<void> {
    try {
      await this.video?.unloadAsync();
    } catch {
      // ignore
    }
    this.setState({ ...DEFAULT_STATE });
    this.listeners.clear();
  }

  // ─── Utilities ───────────────────────────────────────────────────────────────

  /** Format a millisecond value as MM:SS or HH:MM:SS. */
  static formatTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;

    const pad = (n: number) => String(n).padStart(2, '0');

    if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
    return `${pad(m)}:${pad(s)}`;
  }

  /** Returns the available playback rates. */
  static get rates(): PlaybackRate[] {
    return [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
  }
}
