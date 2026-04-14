'use client';

import { useEffect, useRef, useState } from 'react';

export interface GeoPosition {
  lat: number;
  lon: number;
  accuracy: number; // meters
  timestamp: number;
}

interface UseGeolocationOptions {
  /** Begin watching position when true; stop when false. */
  enabled: boolean;
  /** High accuracy (uses GPS hardware on mobile, drains battery faster). Default true. */
  highAccuracy?: boolean;
  /** ms between updates we'll accept (anything sooner is throttled). Default 5000. */
  throttleMs?: number;
}

/**
 * Watches the user's location while enabled. Honors throttling so we
 * don't re-render on every micro-update from the OS.
 */
export function useGeolocation(opts: UseGeolocationOptions) {
  const { enabled, highAccuracy = true, throttleMs = 5000 } = opts;
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supported = typeof window !== 'undefined' && 'geolocation' in navigator;
  const lastUpdateRef = useRef<number>(0);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!supported) return;

    if (!enabled) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (p) => {
        const now = Date.now();
        if (now - lastUpdateRef.current < throttleMs) return;
        lastUpdateRef.current = now;
        setError(null);
        setPosition({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          accuracy: p.coords.accuracy,
          timestamp: p.timestamp,
        });
      },
      (err) => {
        setError(err.message || 'Geolocation error');
      },
      {
        enableHighAccuracy: highAccuracy,
        maximumAge: 10_000,
        timeout: 15_000,
      },
    );
    watchIdRef.current = id;

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [enabled, highAccuracy, throttleMs, supported]);

  return { position, error, supported };
}

/** Distance between two GPS points in yards (Haversine). */
export function distanceYards(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000; // earth radius in meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const meters = 2 * R * Math.asin(Math.sqrt(h));
  return Math.round(meters * 1.09361); // m → yards
}
