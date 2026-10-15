/**
 * Feature: Geofencing alerts.
 * Watches the user's position and fires onEnter when they move inside a polygon zone.
 * Uses a simple point-in-polygon (ray casting) check — no native geofencing API needed.
 */
import type { LngLat } from '@iraq-maps/contracts';
import { useEffect, useRef } from 'react';

export interface GeofenceZone {
  id: string;
  /** Display name shown in the alert. */
  name: string;
  /** Polygon ring as [lng, lat] pairs (closed or open — the check auto-closes). */
  polygon: LngLat[];
}

/** Returns true when `point` is inside `ring` (ray-casting algorithm). */
function pointInPolygon(point: LngLat, ring: LngLat[]): boolean {
  const [px, py] = point;
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    const intersects =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export interface UseGeofenceOptions {
  zones: GeofenceZone[];
  userPosition: LngLat | null;
  onEnter: (zone: GeofenceZone) => void;
}

/**
 * Fires `onEnter` the first time the user enters each zone.
 * Resets when the user leaves the zone (so re-entry fires again).
 */
export function useGeofence({ zones, userPosition, onEnter }: UseGeofenceOptions): void {
  /** Set of zone ids the user is currently inside. */
  const insideRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userPosition) return;

    for (const zone of zones) {
      const wasInside = insideRef.current.has(zone.id);
      const isInside = pointInPolygon(userPosition, zone.polygon);

      if (isInside && !wasInside) {
        insideRef.current.add(zone.id);
        onEnter(zone);
      } else if (!isInside && wasInside) {
        insideRef.current.delete(zone.id);
      }
    }
  }, [userPosition, zones, onEnter]);
}
