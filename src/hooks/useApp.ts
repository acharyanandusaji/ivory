import { useCallback, useEffect, useRef, useState } from 'react';
import type { Photo } from '@/types';
import { acquireAssetUrl, releaseAssetUrl, thumbAssetId, previewAssetId, faceAssetId } from '@/lib/assets';

/** Acquires a cached object URL for an IndexedDB asset and releases it on unmount. */
export function useAssetUrl(assetId: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!assetId) {
      setUrl(null);
      return;
    }
    let active = true;
    let acquired = false;
    void acquireAssetUrl(assetId).then((next) => {
      if (!active) return;
      setUrl(next);
      acquired = Boolean(next);
    });
    return () => {
      active = false;
      if (acquired) releaseAssetUrl(assetId);
    };
  }, [assetId]);

  return url;
}

export function useThumbUrl(photoId: string | null | undefined): string | null {
  return useAssetUrl(photoId ? thumbAssetId(photoId) : null);
}

export function usePreviewUrl(photoId: string | null | undefined): string | null {
  return useAssetUrl(photoId ? previewAssetId(photoId) : null);
}

export function useFaceUrl(photoId: string | null | undefined, faceId: string | null | undefined): string | null {
  return useAssetUrl(photoId && faceId ? faceAssetId(photoId, faceId) : null);
}

/** Creates and revokes an object URL for an arbitrary blob. */
export function useBlobUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = () => setMatches(mql.matches);
    handler();
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Incrementally reveals list items as the user scrolls to the sentinel. */
export function useIncrementalReveal(total: number, initial = 120, step = 120) {
  const [visible, setVisible] = useState(initial);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisible(initial);
  }, [total, initial]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || visible >= total) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible((current) => Math.min(total, current + step));
        }
      },
      { rootMargin: '900px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible, total, step]);

  return { visible: Math.min(visible, total), sentinelRef, setVisible };
}

export function useKeydown(handler: (event: KeyboardEvent) => void, deps: React.DependencyList = []) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const listener = (event: KeyboardEvent) => ref.current(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function useScrollTop(dependency?: unknown) {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [dependency]);
}

/** Stable callback that reads the latest value, useful for event handlers. */
export function useEventCallback<T extends (...args: never[]) => unknown>(fn: T): T {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback(((...args: Parameters<T>) => ref.current(...args)) as T, []);
}

export function photoIsReady(photo: Photo): boolean {
  return photo.status === 'ready';
}
