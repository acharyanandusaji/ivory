import { describe, expect, it } from 'vitest';
import type { PhotoGroup } from '@/types';
import {
  computeGroups,
  groupByType,
  groupsByPhoto,
  hammingDistance,
  hexToBigInt,
  popcount64,
} from '@/lib/grouping';
import { makePhoto, PROJECT_ID } from '@/test/fixtures';

function group(type: PhotoGroup['type'], photoIds: string[], id: string): PhotoGroup {
  return { id, projectId: PROJECT_ID, type, photoIds, createdAt: 1 };
}

describe('hashing helpers', () => {
  it('converts hexadecimal strings to big integers', () => {
    expect(hexToBigInt('ff')).toBe(255n);
    expect(hexToBigInt('')).toBe(0n);
    expect(hexToBigInt('not hex')).toBe(0n);
  });

  it('counts set bits and Hamming distance', () => {
    expect(popcount64(0b1011n)).toBe(3);
    expect(hammingDistance('0000000000000000', '0000000000000000')).toBe(0);
    expect(hammingDistance('ffffffffffffffff', 'fffffffffffffffe')).toBe(1);
    // Bit zero is part of the 64-bit dHash and must be covered.
    expect(hammingDistance('0000000000000000', '0000000000000001')).toBe(1);
  });
});

describe('computeGroups', () => {
  it('groups exact duplicates by content hash and picks the best frame', () => {
    const best = makePhoto({
      id: 'best',
      contentHash: 'duplicate',
      dhash: '1234567890abcdef',
      scores: { overall: 91, sharpness: 80, exposure: 80, composition: 80, faces: 80 },
    });
    const other = makePhoto({
      id: 'other',
      contentHash: 'duplicate',
      dhash: '1234567890abcdef',
      scores: { overall: 62, sharpness: 60, exposure: 60, composition: 60, faces: 60 },
    });
    const result = computeGroups([best, other], { projectId: PROJECT_ID });
    expect(result.exactGroups).toHaveLength(1);
    expect(result.exactGroups[0].photoIds.sort()).toEqual(['best', 'other']);
    expect(result.exactGroups[0].bestPhotoId).toBe('best');
    expect(result.similarGroups).toHaveLength(0);
    expect(result.burstGroups).toHaveLength(0);
  });

  it('finds visually similar frames whose dHash differs only in the lowest bit', () => {
    const first = makePhoto({ id: 'a', contentHash: 'hash-a', dhash: '0000000000000000' });
    const second = makePhoto({ id: 'b', contentHash: 'hash-b', dhash: '0000000000000001' });
    const result = computeGroups([first, second], {
      projectId: PROJECT_ID,
      similarityThreshold: 1,
    });
    expect(result.similarGroups).toHaveLength(1);
    expect(result.similarGroups[0].photoIds.sort()).toEqual(['a', 'b']);
  });

  it('does not merge frames with different aspect ratios', () => {
    const wide = makePhoto({ id: 'wide', contentHash: 'h1', dhash: '0000000000000000' });
    const tall = makePhoto({
      id: 'tall',
      contentHash: 'h2',
      dhash: '0000000000000001',
      width: 3000,
      height: 4000,
    });
    const result = computeGroups([wide, tall], { similarityThreshold: 8 });
    expect(result.similarGroups).toHaveLength(0);
  });

  it('detects bursts within the capture window', () => {
    const start = new Date(2026, 6, 12, 10, 0, 0).getTime();
    const first = makePhoto({
      id: 'b1',
      contentHash: 'h1',
      dhash: '0000000000000000',
      capturedAt: start,
    });
    const second = makePhoto({
      id: 'b2',
      contentHash: 'h2',
      dhash: '0000000000000001',
      capturedAt: start + 2000,
    });
    const result = computeGroups([first, second], {
      projectId: PROJECT_ID,
      similarityThreshold: 0,
      burstWindowMs: 3500,
    });
    expect(result.burstGroups).toHaveLength(1);
    expect(result.burstGroups[0].photoIds).toEqual(['b1', 'b2']);
  });

  it('does not group a burst across different cameras', () => {
    const start = Date.UTC(2026, 6, 12, 10, 0, 0);
    const first = makePhoto({
      id: 'b1',
      contentHash: 'h1',
      dhash: '0000000000000000',
      capturedAt: start,
      camera: 'Camera A',
    });
    const second = makePhoto({
      id: 'b2',
      contentHash: 'h2',
      dhash: '0000000000000001',
      capturedAt: start + 1000,
      camera: 'Camera B',
    });
    const result = computeGroups([first, second], {
      similarityThreshold: 0,
      burstWindowMs: 3500,
    });
    expect(result.burstGroups).toHaveLength(0);
  });

  it('indexes groups by photo and filters by type', () => {
    const groups = [
      group('exact', ['a', 'b'], 'g1'),
      group('burst', ['b', 'c'], 'g2'),
    ];
    expect(groupsByPhoto(groups).get('b')).toHaveLength(2);
    expect(groupByType(groups, 'burst')).toEqual([groups[1]]);
    expect(groupsByPhoto(groups).get('missing')).toBeUndefined();
  });
});
