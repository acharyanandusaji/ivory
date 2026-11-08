import { describe, expect, it } from 'vitest';
import type { PhotoGroup } from '@/types';
import {
  applyGroupFlags,
  bestPhoto,
  computeNorms,
  deriveFlags,
  deriveTags,
  exposureScore,
  qualityLabel,
  scorePhoto,
} from '@/lib/quality';
import { makeAnalysis, makeFaceSummary, makePhoto, makeScores, PROJECT_ID } from '@/test/fixtures';

describe('quality scoring', () => {
  it('falls back to sensible norms for an empty library', () => {
    const norms = computeNorms([]);
    expect(norms.lapP50).toBeCloseTo(Math.log1p(140), 5);
    expect(norms.exposureP50).toBe(0.5);
  });

  it('scores a well-exposed frame highly', () => {
    const score = exposureScore(makeAnalysis({ meanLuma: 0.52, highlightClip: 0, shadowClip: 0, contrast: 0.2 }));
    expect(score).toBeGreaterThan(98);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('penalises clipped highlights and crushed shadows', () => {
    const clipped = exposureScore(
      makeAnalysis({ meanLuma: 0.52, highlightClip: 0.2, shadowClip: 0, contrast: 0.2 }),
    );
    const crushed = exposureScore(
      makeAnalysis({ meanLuma: 0.52, highlightClip: 0, shadowClip: 0.4, contrast: 0.2 }),
    );
    expect(clipped).toBeLessThan(70);
    expect(crushed).toBeLessThan(70);
  });

  it('derives low-resolution and blur flags', () => {
    const small = makePhoto({ width: 1000, height: 800, flags: [] });
    const flags = deriveFlags(small, computeNorms([small]), 80, 90, 70);
    expect(flags).toContain('low-resolution');

    const soft = makePhoto({ analysis: makeAnalysis({ laplacianVar: 4 }), flags: [] });
    expect(deriveFlags(soft, computeNorms([soft]), 5, 90, 70)).toContain('blurry');
  });

  it('flags over- and under-exposure', () => {
    const bright = makePhoto({ analysis: makeAnalysis({ highlightClip: 0.1 }), flags: [] });
    expect(deriveFlags(bright, computeNorms([bright]), 80, 20, 70)).toContain('overexposed');

    const dark = makePhoto({ analysis: makeAnalysis({ meanLuma: 0.1 }), flags: [] });
    expect(deriveFlags(dark, computeNorms([dark]), 80, 30, 70)).toContain('underexposed');
  });

  it('produces complete scores and tags while preserving duplicate flags', () => {
    const photo = makePhoto({
      flags: ['duplicate'],
      faces: makeFaceSummary({ faceCount: 1, lookingCount: 1, smilingCount: 1 }),
    });
    const scored = scorePhoto(photo, computeNorms([photo]));
    expect(scored.scores).toBeDefined();
    for (const key of ['overall', 'sharpness', 'exposure', 'composition', 'faces'] as const) {
      expect(scored.scores![key]).toBeGreaterThanOrEqual(0);
      expect(scored.scores![key]).toBeLessThanOrEqual(100);
    }
    expect(scored.flags).toContain('duplicate');
    expect(scored.tags).toContain('portrait');
    expect(scored.tags).toContain('smiling');
  });

  it('derives human-readable tags from faces and orientation', () => {
    const photo = makePhoto({
      faces: makeFaceSummary({
        faceCount: 3,
        smilingCount: 2,
        eyesClosedCount: 0,
        lookingCount: 3,
        maxFaceArea: 0.02,
      }),
    });
    const tags = deriveTags(photo, makeScores({ overall: 80 }));
    expect(tags).toEqual(
      expect.arrayContaining(['group', 'posed', 'smiling', 'looking-at-camera', 'top-rated', 'landscape']),
    );
  });

  it('clears and reapplies duplicate and repetitive flags', () => {
    const a = makePhoto({ id: 'a', flags: ['blurry', 'duplicate'] });
    const b = makePhoto({ id: 'b', flags: ['repetitive'] });
    const groups: PhotoGroup[] = [
      { id: 'g1', projectId: PROJECT_ID, type: 'exact', photoIds: ['a', 'b'], createdAt: 1 },
      { id: 'g2', projectId: PROJECT_ID, type: 'burst', photoIds: ['b'], createdAt: 1 },
    ];
    const updated = applyGroupFlags([a, b], groups);
    expect(updated[0].flags).toEqual(expect.arrayContaining(['blurry', 'duplicate']));
    expect(updated[1].flags).toEqual(expect.arrayContaining(['duplicate', 'repetitive']));
  });

  it('picks the best frame and labels quality bands', () => {
    const low = makePhoto({ id: 'low', scores: makeScores({ overall: 40 }) });
    const high = makePhoto({ id: 'high', scores: makeScores({ overall: 90 }) });
    expect(bestPhoto([low, high])?.id).toBe('high');
    expect(bestPhoto([])).toBeUndefined();
    expect(qualityLabel(90)).toBe('Exceptional');
    expect(qualityLabel(74)).toBe('Excellent');
    expect(qualityLabel(60)).toBe('Good');
    expect(qualityLabel(50)).toBe('Fair');
    expect(qualityLabel(20)).toBe('Weak');
  });
});
