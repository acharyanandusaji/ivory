import { describe, expect, it } from 'vitest';
import {
  clusterDescriptors,
  cosineDistance,
  findNearestPerson,
  mergeCentroids,
  normaliseVector,
  suggestMergeTargets,
  updateCentroid,
} from '@/lib/clustering';
import { makePerson } from '@/test/fixtures';

describe('vector helpers', () => {
  it('normalises vectors to unit length', () => {
    const vector = normaliseVector([3, 4]);
    expect(vector[0]).toBeCloseTo(0.6, 6);
    expect(vector[1]).toBeCloseTo(0.8, 6);
    expect(Math.hypot(vector[0], vector[1])).toBeCloseTo(1, 6);
  });

  it('measures cosine and euclidean distance', () => {
    expect(cosineDistance([1, 0], [1, 0])).toBeCloseTo(0, 6);
    expect(cosineDistance([1, 0], [0, 1])).toBeCloseTo(1, 6);
    expect(cosineDistance([0, 0], [0, 1])).toBe(1);
  });
});

describe('face clustering', () => {
  it('finds the nearest person within the threshold', () => {
    const a = makePerson({ id: 'a', centroid: normaliseVector([1, 0]) });
    const b = makePerson({ id: 'b', centroid: normaliseVector([0, 1]) });
    expect(findNearestPerson(normaliseVector([0.9, 0.1]), [a, b], 0.4)?.personId).toBe('a');
    expect(findNearestPerson(normaliseVector([0.7, 0.7]), [a, b], 0.05)).toBeNull();
  });

  it('ignores people without a centroid', () => {
    const person = makePerson({ centroid: null });
    expect(findNearestPerson(normaliseVector([1, 0]), [person], 1)).toBeNull();
  });

  it('updates a running centroid', () => {
    const next = updateCentroid(normaliseVector([1, 0]), 1, normaliseVector([0, 1]));
    expect(next[0]).toBeCloseTo(Math.SQRT1_2, 6);
    expect(next[1]).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it('merges two centroids weighted by face count', () => {
    const a = makePerson({ id: 'a', faceCount: 3, centroid: normaliseVector([1, 0]) });
    const b = makePerson({ id: 'b', faceCount: 1, centroid: normaliseVector([0, 1]) });
    const merged = mergeCentroids(a, b)!;
    expect(merged[0]).toBeCloseTo(0.9486833, 5);
    expect(merged[1]).toBeCloseTo(0.31622777, 5);
    expect(mergeCentroids(makePerson({ centroid: null }), makePerson({ centroid: null }))).toBeNull();
  });

  it('clusters identical descriptors together and separates others', () => {
    const clusters = clusterDescriptors(
      [
        normaliseVector([1, 0]),
        normaliseVector([0.99, 0.01]),
        normaliseVector([0, 1]),
        undefined,
        normaliseVector([]),
      ],
      0.2,
    );
    expect(clusters).toHaveLength(2);
    expect(clusters[0].indices).toEqual([0, 1]);
    expect(clusters[1].indices).toEqual([2]);
  });

  it('separates same-person and different-person distances on the face-api scale', () => {
    // face-api's own descriptors sit around 0.02-0.06 for the same face and
    // 0.16-0.20 for different faces (cosine); in Euclidean terms that is about
    // 0.2-0.35 versus 0.55-0.65. The default 0.43 threshold must sit between.
    const base = normaliseVector([1, 0]);
    const same = normaliseVector([1, 0.05]);
    const different = normaliseVector([0.85, 0.53]);
    expect(findNearestPerson(same, [makePerson({ id: 'a', centroid: base })], 0.43)?.personId).toBe('a');
    expect(findNearestPerson(different, [makePerson({ id: 'a', centroid: base })], 0.43)).toBeNull();
    const clusters = clusterDescriptors(
      [base, same, different, normaliseVector([0.84, 0.54])],
      0.43,
    );
    expect(clusters).toHaveLength(2);
    expect(clusters[0].indices).toEqual([0, 1]);
    expect(clusters[1].indices).toEqual([2, 3]);
  });

  it('suggests merging auto-named people with a close centroid', () => {
    const named = makePerson({ id: 'named', name: 'Aisha', faceCount: 3, centroid: normaliseVector([1, 0]) });
    const auto = makePerson({ id: 'auto', name: 'Person 7', faceCount: 2, centroid: normaliseVector([0.999, 0.01]) });
    const suggestions = suggestMergeTargets([named, auto], 0.3);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ sourceId: 'auto', targetId: 'named' });
  });

  it('does not suggest merges between two distinct named people', () => {
    const a = makePerson({ id: 'a', name: 'Aisha', faceCount: 3, centroid: normaliseVector([1, 0]) });
    const b = makePerson({ id: 'b', name: 'Noah', faceCount: 3, centroid: normaliseVector([0.999, 0.01]) });
    expect(suggestMergeTargets([a, b], 0.3)).toHaveLength(0);
  });
});
