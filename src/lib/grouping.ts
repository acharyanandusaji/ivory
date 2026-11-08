import type { Photo, PhotoGroup, GroupType } from '@/types';

export function hexToBigInt(hex: string): bigint {
  if (!hex) return 0n;
  try {
    return BigInt(`0x${hex}`);
  } catch {
    return 0n;
  }
}

export function popcount64(value: bigint): number {
  let v = value & 0xffffffffffffffffn;
  let count = 0;
  while (v) {
    v &= v - 1n;
    count += 1;
  }
  return count;
}

export function hammingDistance(a: string, b: string): number {
  return popcount64(hexToBigInt(a) ^ hexToBigInt(b));
}

class UnionFind {
  private parent: number[];
  private rank: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index);
    this.rank = new Array(size).fill(0);
  }

  find(value: number): number {
    let root = value;
    while (this.parent[root] !== root) root = this.parent[root];
    let current = value;
    while (this.parent[current] !== current) {
      const next = this.parent[current];
      this.parent[current] = root;
      current = next;
    }
    return root;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    if (this.rank[ra] < this.rank[rb]) this.parent[ra] = rb;
    else if (this.rank[ra] > this.rank[rb]) this.parent[rb] = ra;
    else {
      this.parent[rb] = ra;
      this.rank[ra] += 1;
    }
  }
}

function aspectRatio(photo: Photo): number {
  return photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 1;
}

function similarEnough(a: Photo, b: Photo, threshold: number): boolean {
  if (!a.dhash || !b.dhash) return false;
  if (a.id === b.id) return false;
  const ratioA = aspectRatio(a);
  const ratioB = aspectRatio(b);
  if (Math.abs(ratioA - ratioB) / Math.max(ratioA, ratioB) > 0.16) return false;
  if (a.analysis && b.analysis) {
    if (Math.abs(a.analysis.meanLuma - b.analysis.meanLuma) > 0.2) return false;
  }
  return hammingDistance(a.dhash, b.dhash) <= threshold;
}

// Nine 8-bit windows guarantee candidate discovery for Hamming distance <= 8
// (pigeonhole), while covering every one of the 64 dHash bits at least once.
const BAND_SHIFTS = [56, 48, 40, 32, 24, 16, 8, 0, 28];
const BAND_BITS = 8;
const BAND_MASK = (1n << BigInt(BAND_BITS)) - 1n;

function bandKeys(hash: string): string[] {
  const value = hexToBigInt(hash);
  const keys: string[] = [];
  for (const shift of BAND_SHIFTS) {
    keys.push(((value >> BigInt(shift)) & BAND_MASK).toString(36));
  }
  return keys;
}

function makeGroup(type: GroupType, photos: Photo[], projectId: string): PhotoGroup {
  const best = photos.reduce<Photo | undefined>((current, photo) => {
    if (!current) return photo;
    return (photo.scores?.overall ?? 0) > (current.scores?.overall ?? 0) ? photo : current;
  }, undefined);
  return {
    id: crypto.randomUUID(),
    projectId,
    type,
    photoIds: photos.map((photo) => photo.id),
    bestPhotoId: best?.id,
    createdAt: Date.now(),
  };
}

export interface GroupingResult {
  groups: PhotoGroup[];
  exactGroups: PhotoGroup[];
  similarGroups: PhotoGroup[];
  burstGroups: PhotoGroup[];
}

export interface GroupingOptions {
  similarityThreshold?: number;
  burstWindowMs?: number;
  projectId?: string;
}

/**
 * Finds exact duplicates (SHA-256), visually similar frames (dHash + LSH banding)
 * and bursts (capture time + visual proximity). Recommendations only — never deletes.
 */
export function computeGroups(photos: Photo[], options: GroupingOptions = {}): GroupingResult {
  const projectId = options.projectId ?? photos[0]?.projectId ?? '';
  const threshold = options.similarityThreshold ?? 8;
  const burstWindow = options.burstWindowMs ?? 3500;
  const usable = photos.filter((photo) => photo.dhash && photo.contentHash);

  // Exact duplicates
  const byHash = new Map<string, Photo[]>();
  for (const photo of usable) {
    const list = byHash.get(photo.contentHash);
    if (list) list.push(photo);
    else byHash.set(photo.contentHash, [photo]);
  }
  const exactGroups: PhotoGroup[] = [];
  for (const list of byHash.values()) {
    if (list.length > 1) exactGroups.push(makeGroup('exact', list, projectId));
  }

  // Visually similar — LSH banding guarantees candidate discovery for hamming <= 8
  const buckets = new Map<string, number[]>();
  usable.forEach((photo, index) => {
    for (const key of bandKeys(photo.dhash)) {
      const list = buckets.get(key);
      if (list) list.push(index);
      else buckets.set(key, [index]);
    }
  });

  const uf = new UnionFind(usable.length);
  const seen = new Set<string>();
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = usable[list[i]];
        const b = usable[list[j]];
        const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (a.contentHash === b.contentHash) continue;
        if (similarEnough(a, b, threshold)) uf.union(list[i], list[j]);
      }
    }
  }

  const components = new Map<number, number[]>();
  usable.forEach((_, index) => {
    const root = uf.find(index);
    const list = components.get(root);
    if (list) list.push(index);
    else components.set(root, [index]);
  });
  const similarGroups: PhotoGroup[] = [];
  for (const indices of components.values()) {
    if (indices.length < 2) continue;
    const list = indices.map((index) => usable[index]);
    const hashes = new Set(list.map((photo) => photo.contentHash));
    if (hashes.size < 2) continue;
    similarGroups.push(makeGroup('similar', list, projectId));
  }

  // Bursts — consecutive frames within a short capture window
  const timeSorted = usable
    .filter((photo) => photo.capturedAt && photo.width > 0)
    .sort((a, b) => (a.capturedAt ?? 0) - (b.capturedAt ?? 0));
  const burstGroups: PhotoGroup[] = [];
  let run: Photo[] = [];
  const flush = () => {
    if (run.length > 1) {
      // A run made entirely of byte-identical copies is an exact-duplicate
      // finding, not a burst of distinct frames.
      const hashes = new Set(run.map((photo) => photo.contentHash));
      if (hashes.size > 1) burstGroups.push(makeGroup('burst', run, projectId));
    }
    run = [];
  };
  for (const photo of timeSorted) {
    if (!run.length) {
      run = [photo];
      continue;
    }
    const previous = run[run.length - 1];
    const gap = (photo.capturedAt ?? 0) - (previous.capturedAt ?? 0);
    const sameCamera =
      !photo.camera || !previous.camera || photo.camera === previous.camera;
    const aspectDelta = Math.abs(aspectRatio(photo) - aspectRatio(previous));
    const visuallyClose = previous.dhash && photo.dhash ? hammingDistance(previous.dhash, photo.dhash) <= 22 : false;
    const captureGap = gap >= 0 && gap <= burstWindow;
    if (captureGap && sameCamera && aspectDelta < 0.18 && visuallyClose) {
      run.push(photo);
    } else {
      flush();
      run = [photo];
    }
  }
  flush();

  // Avoid reporting exact-duplicate-only similar clusters twice
  const exactKeys = new Set(
    exactGroups.map((group) => [...group.photoIds].sort().join('|')),
  );
  const filteredSimilar = similarGroups.filter((group) => !exactKeys.has([...group.photoIds].sort().join('|')));

  return {
    groups: [...exactGroups, ...filteredSimilar, ...burstGroups],
    exactGroups,
    similarGroups: filteredSimilar,
    burstGroups,
  };
}

export function groupsByPhoto(groups: PhotoGroup[]): Map<string, PhotoGroup[]> {
  const map = new Map<string, PhotoGroup[]>();
  for (const group of groups) {
    for (const id of group.photoIds) {
      const list = map.get(id);
      if (list) list.push(group);
      else map.set(id, [group]);
    }
  }
  return map;
}

export function groupByType(groups: PhotoGroup[], type: GroupType): PhotoGroup[] {
  return groups.filter((group) => group.type === type);
}
