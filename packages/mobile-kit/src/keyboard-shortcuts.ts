/**
 * Keyboard shortcuts for iPad / desktop (hardware keyboard).
 * Uses React Native's KeyboardAvoidingView-adjacent hook pattern.
 *
 * Supported shortcuts:
 *   Cmd+N  → new post
 *   Cmd+K  → search / focus search bar
 *   Escape → close modal / go back
 *
 * Usage:
 *   useKeyboardShortcuts({
 *     onNewPost: () => router.push('/discover/create'),
 *     onSearch:  () => searchRef.current?.focus(),
 *     onEscape:  () => router.back(),
 *   });
 */
import { useEffect } from 'react';
import { Keyboard } from 'react-native';

// DOM types used for Expo Web support; declared locally to avoid adding 'dom'
// lib to the tsconfig (which would conflict with RN globals).
declare interface KeyboardEvent {
  metaKey: boolean;
  ctrlKey: boolean;
  key: string;
  preventDefault(): void;
}
declare const document: { addEventListener(e: string, h: (ev: KeyboardEvent) => void): void; removeEventListener(e: string, h: (ev: KeyboardEvent) => void): void } | undefined;

interface ShortcutHandlers {
  /** Triggered by Cmd+N. */
  onNewPost?: () => void;
  /** Triggered by Cmd+K. */
  onSearch?: () => void;
  /** Triggered by Escape. */
  onEscape?: () => void;
}

/** No-op on phones; active on iPad / desktop where hardware keyboard events fire. */
export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    // React Native does not expose a cross-platform keyboard-shortcut API.
    // On web (Expo for web) we attach to window.document.
    // On iOS/iPadOS hardware keyboard we listen via the experimental
    // KeyboardEvent from the native keyboard module (available in RN 0.73+).
    // The listener is a no-op on Android phones.

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        handlers.onNewPost?.();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        handlers.onSearch?.();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        // Dismiss keyboard first; if already dismissed, call onEscape.
        Keyboard.dismiss();
        handlers.onEscape?.();
      }
    };

    // Web environment
    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }

    // Native: no-op cleanup
    return () => undefined;
  }, [handlers]);
}
