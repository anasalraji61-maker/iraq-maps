/* eslint-disable no-restricted-syntax */
/**
 * useShare — share sheet hook.
 *
 * Wraps React Native's Share API with:
 * - A simple `share(content)` function that opens the OS share sheet.
 * - Typed content builders for common Iraq Maps share scenarios
 *   (share place, share route, share price).
 * - isSharing state to disable buttons while the sheet is open.
 * - Result tracking (shared / dismissed / error).
 * - Clipboard fallback for web/unsupported environments.
 *
 * All share messages are in Arabic.
 */
import { useCallback, useRef, useState } from 'react';
import { Clipboard, Platform, Share } from 'react-native';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ShareResult = 'shared' | 'dismissed' | 'error';

export interface ShareContent {
  /** The main text to share. */
  message: string;
  /** Optional title (used on Android action sheet). */
  title?: string;
  /** Optional URL (appended to message on Android, shown separately on iOS). */
  url?: string;
}

export interface ShareState {
  /** True while the share sheet is open. */
  isSharing: boolean;
  /** Result of the last share attempt. */
  lastResult: ShareResult | null;
  /** Error from the last failed share, if any. */
  error: Error | null;
}

export interface UseShareResult extends ShareState {
  /** Open the OS share sheet with arbitrary content. */
  share(content: ShareContent): Promise<ShareResult>;
  /** Share a place (name + address + optional deep-link). */
  sharePlace(opts: { name: string; address?: string; url?: string }): Promise<ShareResult>;
  /** Share a route (from → to). */
  shareRoute(opts: { from: string; to: string; url?: string }): Promise<ShareResult>;
  /** Share a business price. */
  sharePrice(opts: { place: string; price: string; note?: string }): Promise<ShareResult>;
  /** Copy text to clipboard (fallback when sharing not available). */
  copyToClipboard(text: string): void;
}

// ── Message builders ──────────────────────────────────────────────────────────

const APP_NAME = 'خرائط العراق الذكية';

function buildPlaceMessage(name: string, address?: string, url?: string): string {
  const parts = [`📍 ${name}`];
  if (address) parts.push(address);
  if (url) parts.push(url);
  parts.push(`\nشاركه عبر ${APP_NAME}`);
  return parts.join('\n');
}

function buildRouteMessage(from: string, to: string, url?: string): string {
  const parts = [`🗺️ مسار من ${from} إلى ${to}`];
  if (url) parts.push(url);
  parts.push(`\nشاركه عبر ${APP_NAME}`);
  return parts.join('\n');
}

function buildPriceMessage(place: string, price: string, note?: string): string {
  const parts = [`💰 سعر ${place}: ${price}`];
  if (note) parts.push(note);
  parts.push(`\nعبر ${APP_NAME}`);
  return parts.join('\n');
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useShare(): UseShareResult {
  const [isSharing, setIsSharing] = useState(false);
  const [lastResult, setLastResult] = useState<ShareResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const inFlight = useRef(false);

  const share = useCallback(async (content: ShareContent): Promise<ShareResult> => {
    if (inFlight.current) return 'dismissed';
    inFlight.current = true;
    setIsSharing(true);
    setError(null);

    try {
      // On iOS, title is ignored; URL is a separate field.
      // On Android, message + URL are concatenated.
      const iosContent: Parameters<typeof Share.share>[0] = {
        message: content.message,
        url: content.url,
        title: content.title,
      };
      const androidContent: Parameters<typeof Share.share>[0] = {
        message: content.url
          ? `${content.message}\n${content.url}`
          : content.message,
        title: content.title,
      };

      const shareContent = Platform.OS === 'ios' ? iosContent : androidContent;
      const result = await Share.share(shareContent, {
        dialogTitle: content.title ?? APP_NAME,
        subject: content.title ?? APP_NAME,
      });

      const outcome: ShareResult =
        result.action === Share.sharedAction ? 'shared' : 'dismissed';
      setLastResult(outcome);
      return outcome;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      setLastResult('error');
      return 'error';
    } finally {
      setIsSharing(false);
      inFlight.current = false;
    }
  }, []);

  const sharePlace = useCallback(
    ({ name, address, url }: { name: string; address?: string; url?: string }) =>
      share({
        title: `${name} — ${APP_NAME}`,
        message: buildPlaceMessage(name, address, url),
        url,
      }),
    [share],
  );

  const shareRoute = useCallback(
    ({ from, to, url }: { from: string; to: string; url?: string }) =>
      share({
        title: `مسار — ${APP_NAME}`,
        message: buildRouteMessage(from, to, url),
        url,
      }),
    [share],
  );

  const sharePrice = useCallback(
    ({ place, price, note }: { place: string; price: string; note?: string }) =>
      share({
        title: `سعر ${place}`,
        message: buildPriceMessage(place, price, note),
      }),
    [share],
  );

  const copyToClipboard = useCallback((text: string) => {
    Clipboard.setString(text);
  }, []);

  return {
    isSharing,
    lastResult,
    error,
    share,
    sharePlace,
    shareRoute,
    sharePrice,
    copyToClipboard,
  };
}
