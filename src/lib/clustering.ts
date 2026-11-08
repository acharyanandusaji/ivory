import type { Person } from '@/types';

export function normaliseVector(vector: Float32Array | number[]): Float32Array {
  let norm = 0;
  for (const value of vector) norm += value * value;
  const length = Math.sqrt(norm) || 1;
  const result = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i += 1) result[i] = vector[i] / length;
  return result;
}

export function cosineDistance(a: Float32Array | number[], b: Float32Array | number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 1;
  return 1 - dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function euclideanDistance(a: Float32Array | number[], b: Float32Array | number[]): number {
  let sum = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export interface ClusterAssignment {
  personId: string;
  distance: number;
}

export function findNearestPerson(
  descriptor: Float32Array,
  people: Person[],
  threshold: number,
): ClusterAssignment | null {
  let best: ClusterAssignment | null = null;
  for (const person of people) {
    if (!person.centroid) continue;
    // face-api descriptors are L2-normalised and conventionally compared with
    // Euclidean distance (the library's own match threshold is 0.6). Ranking is
    // identical to cosine distance, but the threshold scale is not.
    const distance = euclideanDistance(descriptor, person.centroid);
    if (!best || distance < best.distance) {
      best = { personId: person.id, distance };
    }
  }
  return best && best.distance <= threshold ? best : null;
}

export function updateCentroid(
  centroid: Float32Array | null,
  count: number,
  descriptor: Float32Array,
): Float32Array {
  const normalised = normaliseVector(descriptor);
  if (!centroid || count <= 0) return normalised;
  const next = new Float32Array(normalised.length);
  for (let i = 0; i < next.length; i += 1) {
    next[i] = (centroid[i] * count + normalised[i]) / (count + 1);
  }
  return normaliseVector(next);
}

export function mergeCentroids(a: Person, b: Person): Float32Array | null {
  if (!a.centroid && !b.centroid) return null;
  if (!a.centroid) return b.centroid;
  if (!b.centroid) return a.centroid;
  const total = Math.max(1, a.faceCount) + Math.max(1, b.faceCount);
  const wa = Math.max(1, a.faceCount) / total;
  const wb = Math.max(1, b.faceCount) / total;
  const merged = new Float32Array(a.centroid.length);
  for (let i = 0; i < merged.length; i += 1) {
    merged[i] = a.centroid[i] * wa + b.centroid[i] * wb;
  }
  return normaliseVector(merged);
}

export interface DescriptorCluster {
  indices: number[];
  centroid: Float32Array;
}

/** Greedy incremental clustering used for rebuilding unnamed people. */
export function clusterDescriptors(
  descriptors: Array<Float32Array | null | undefined>,
  threshold: number,
): DescriptorCluster[] {
  const clusters: DescriptorCluster[] = [];
  descriptors.forEach((descriptor, index) => {
    if (!descriptor || descriptor.length === 0) return;
    const normalised = normaliseVector(descriptor);
    let bestIndex = -1;
    let bestDistance = Infinity;
    clusters.forEach((cluster, clusterIndex) => {
      const distance = euclideanDistance(normalised, cluster.centroid);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = clusterIndex;
      }
    });
    if (bestIndex >= 0 && bestDistance <= threshold) {
      const cluster = clusters[bestIndex];
      cluster.indices.push(index);
      const next = updateCentroid(cluster.centroid, cluster.indices.length - 1, normalised);
      cluster.centroid = next;
    } else {
      clusters.push({ indices: [index], centroid: normalised });
    }
  });
  return clusters;
}

export function suggestMergeTargets(
  people: Person[],
  threshold = 0.32,
): Array<{ sourceId: string; targetId: string; distance: number }> {
  const suggestions: Array<{ sourceId: string; targetId: string; distance: number }> = [];
  for (let i = 0; i < people.length; i += 1) {
    for (let j = i + 1; j < people.length; j += 1) {
      const a = people[i];
      const b = people[j];
      if (!a.centroid || !b.centroid) continue;
      if (a.name !== b.name && !a.name.startsWith('Person ') && !b.name.startsWith('Person ')) continue;
      if (Math.abs(a.faceCount - b.faceCount) > Math.max(a.faceCount, b.faceCount) * 0.8) continue;
      const distance = euclideanDistance(a.centroid, b.centroid);
      if (distance <= threshold) {
        suggestions.push({
          sourceId: a.faceCount >= b.faceCount ? b.id : a.id,
          targetId: a.faceCount >= b.faceCount ? a.id : b.id,
          distance,
        });
      }
    }
  }
  return suggestions.sort((x, y) => x.distance - y.distance);
}
