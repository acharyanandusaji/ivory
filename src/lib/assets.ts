import type { AssetRecord, Photo } from '@/types';
import { getAsset, putAsset } from './db';

const sessionBlobs = new Map<string, Blob>();
/** Recent generated assets kept in memory when IndexedDB is full. */
const sessionAssets = new Map<string, Blob>();
const MAX_SESSION_ASSETS = 1800;

export function registerSessionBlob(photoId: string, blob: Blob): void {
  sessionBlobs.set(photoId, blob);
}

export function registerSessionAsset(assetId: string, blob: Blob): void {
  if (sessionAssets.has(assetId)) sessionAssets.delete(assetId);
  sessionAssets.set(assetId, blob);
  if (sessionAssets.size > MAX_SESSION_ASSETS) {
    const oldest = sessionAssets.keys().next().value;
    if (oldest) sessionAssets.delete(oldest);
  }
}

export function getSessionAsset(assetId: string): Blob | undefined {
  return sessionAssets.get(assetId);
}

export function getSessionBlob(photoId: string): Blob | undefined {
  return sessionBlobs.get(photoId);
}

export function pruneSessionBlobs(photoIds: Set<string>): void {
  for (const id of sessionBlobs.keys()) {
    if (!photoIds.has(id)) sessionBlobs.delete(id);
  }
}

export function originalAssetId(photoId: string): string {
  return `${photoId}:original`;
}

export function previewAssetId(photoId: string): string {
  return `${photoId}:preview`;
}

export function thumbAssetId(photoId: string): string {
  return `${photoId}:thumb`;
}

export function faceAssetId(photoId: string, faceId: string): string {
  return `${photoId}:face:${faceId}`;
}

export async function storeAsset(
  projectId: string,
  photoId: string,
  kind: AssetRecord['kind'],
  blob: Blob,
  customId?: string,
): Promise<string> {
  const id =
    customId ??
    (kind === 'original'
      ? originalAssetId(photoId)
      : kind === 'preview'
        ? previewAssetId(photoId)
        : kind === 'thumb'
          ? thumbAssetId(photoId)
          : `${photoId}:${kind}:${crypto.randomUUID()}`);
  await putAsset({
    id,
    projectId,
    photoId,
    kind,
    blob,
    size: blob.size,
    createdAt: Date.now(),
  });
  return id;
}

export async function getOriginalBlob(photoId: string): Promise<Blob | undefined> {
  const session = sessionBlobs.get(photoId);
  if (session) return session;
  const cached = sessionAssets.get(originalAssetId(photoId));
  if (cached) return cached;
  const asset = await getAsset(originalAssetId(photoId));
  return asset?.blob;
}

export async function getPreviewBlob(photoId: string): Promise<Blob | undefined> {
  const session = sessionAssets.get(previewAssetId(photoId));
  if (session) return session;
  const asset = await getAsset(previewAssetId(photoId));
  if (asset) return asset.blob;
  return getOriginalBlob(photoId);
}

export async function getThumbBlob(photoId: string): Promise<Blob | undefined> {
  const session = sessionAssets.get(thumbAssetId(photoId));
  if (session) return session;
  const asset = await getAsset(thumbAssetId(photoId));
  if (asset) return asset.blob;
  return getPreviewBlob(photoId);
}

export async function getAssetBlob(assetId: string): Promise<Blob | undefined> {
  const session = sessionAssets.get(assetId);
  if (session) return session;
  if (assetId.endsWith(':original')) {
    const photoId = assetId.slice(0, -':original'.length);
    return getOriginalBlob(photoId);
  }
  const asset = await getAsset(assetId);
  return asset?.blob;
}

export function photoOriginalsAvailable(photo: Photo): boolean {
  return photo.originalStored || sessionBlobs.has(photo.id);
}

export function countAvailableOriginals(photos: Photo[]): number {
  return photos.filter(photoOriginalsAvailable).length;
}

export function clearSessionBlobs(): void {
  sessionBlobs.clear();
  sessionAssets.clear();
}

interface CacheEntry {
  url?: string;
  refs: number;
  lastUsed: number;
  promise?: Promise<string | null>;
}

const MAX_URLS = 360;
const cache = new Map<string, CacheEntry>();

function evictIfNeeded(): void {
  if (cache.size <= MAX_URLS) return;
  const candidates = [...cache.entries()]
    .filter(([, entry]) => entry.refs === 0 && entry.url)
    .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  for (const [key, entry] of candidates) {
    if (cache.size <= MAX_URLS) break;
    if (entry.url) URL.revokeObjectURL(entry.url);
    cache.delete(key);
  }
}

export async function acquireAssetUrl(assetId: string): Promise<string | null> {
  let entry = cache.get(assetId);
  if (!entry) {
    entry = { refs: 0, lastUsed: Date.now() };
    cache.set(assetId, entry);
  }
  entry.refs += 1;
  entry.lastUsed = Date.now();
  if (entry.url) return entry.url;
  if (!entry.promise) {
    entry.promise = getAssetBlob(assetId)
      .then((blob) => {
        if (!blob) return null;
        const existing = cache.get(assetId);
        if (!existing) return null;
        const url = URL.createObjectURL(blob);
        existing.url = url;
        return url;
      })
      .catch(() => null)
      .finally(() => {
        const existing = cache.get(assetId);
        if (existing) existing.promise = undefined;
      });
  }
  return entry.promise;
}

export function releaseAssetUrl(assetId: string): void {
  const entry = cache.get(assetId);
  if (!entry) return;
  entry.refs = Math.max(0, entry.refs - 1);
  entry.lastUsed = Date.now();
  if (entry.refs === 0) setTimeout(evictIfNeeded, 1000);
}

export function clearAssetUrlCache(): void {
  for (const entry of cache.values()) {
    if (entry.url) URL.revokeObjectURL(entry.url);
  }
  cache.clear();
}

export async function assetUrlForPhoto(photoId: string, kind: 'thumb' | 'preview'): Promise<string | null> {
  const id = kind === 'thumb' ? thumbAssetId(photoId) : previewAssetId(photoId);
  return acquireAssetUrl(id);
}
