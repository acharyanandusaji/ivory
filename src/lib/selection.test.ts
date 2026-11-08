import { describe, expect, it } from 'vitest';
import type { PhotoGroup } from '@/types';
import {
  curateSelection,
  effectiveScore,
  nextBestSuggestions,
  selectionCoverage,
  tooSimilar,
} from '@/lib/selection';
import { makeFaceSummary, makePhoto, makeScores, PROJECT_ID } from '@/test/fixtures';

describe('effective score', () => {
  it('rewards favourites and penalises flags', () => {
    const base = makePhoto({ scores: makeScores({ overall: 50 }) });
    expect(effectiveScore(base)).toBe(50);
    expect(effectiveScore({ ...base, favorite: true })).toBe(56);
    expect(effectiveScore({ ...base, favorite: true, flags: ['blurry'] })).toBe(32);
  });

  it('demotes rejected frames to zero rather than negative', () => {
    const rejected = makePhoto({ rejected: true, scores: makeScores({ overall: 90 }) });
    expect(effectiveScore(rejected)).toBe(0);
  });

  it('returns zero when a photo has no scores', () => {
    expect(effectiveScore(makePhoto({ scores: undefined }))).toBe(0);
  });
});

describe('similarity', () => {
  it('reports the first selected frame within the threshold', () => {
    const candidate = makePhoto({ id: 'candidate', dhash: '0000000000000001' });
    const near = makePhoto({ id: 'near', dhash: '0000000000000000' });
    const far = makePhoto({ id: 'far', dhash: 'ffffffffffffffff' });
    expect(tooSimilar(candidate, [far], 8)).toBeNull();
    expect(tooSimilar(candidate, [near, far], 8)?.id).toBe('near');
  });

  it('treats frames without a dHash as distinct', () => {
    expect(tooSimilar(makePhoto({ dhash: '' }), [makePhoto()], 8)).toBeNull();
  });
});

describe('curateSelection', () => {
  function distinctPhotos() {
    return [
      makePhoto({ id: 'p1', dhash: '0000000000000000', scores: makeScores({ overall: 90 }) }),
      makePhoto({ id: 'p2', dhash: 'ffffffffffffffff', scores: makeScores({ overall: 80 }) }),
      makePhoto({ id: 'p3', dhash: 'aaaaaaaaaaaaaaaa', scores: makeScores({ overall: 70 }) }),
    ];
  }

  it('picks the requested number of highest-quality frames', () => {
    const result = curateSelection(distinctPhotos(), { target: 2 });
    expect(result.ids).toEqual(['p1', 'p2']);
  });

  it('returns nothing for a non-positive target', () => {
    expect(curateSelection(distinctPhotos(), { target: 0 }).ids).toEqual([]);
  });

  it('skips rejected photographs unless explicitly included', () => {
    const photos = distinctPhotos();
    photos[0] = { ...photos[0], rejected: true };
    expect(curateSelection(photos, { target: 2 }).ids).toEqual(['p2', 'p3']);
    expect(curateSelection(photos, { target: 3, includeRejected: true }).ids).toEqual(['p2', 'p3', 'p1']);
  });

  it('does not select near-duplicate frames in the strict pass', () => {
    const photos = [
      makePhoto({ id: 'best', dhash: '0000000000000000', scores: makeScores({ overall: 90 }) }),
      makePhoto({ id: 'near', dhash: '0000000000000001', scores: makeScores({ overall: 85 }) }),
      makePhoto({ id: 'different', dhash: 'ffffffffffffffff', scores: makeScores({ overall: 60 }) }),
    ];
    const result = curateSelection(photos, { target: 2 });
    expect(result.ids).toEqual(['best', 'different']);
    expect(result.skippedSimilar).toBeGreaterThan(0);
  });

  it('uses at most one frame from each avoid group in the strict pass', () => {
    const group: PhotoGroup = {
      id: 'burst-1',
      projectId: PROJECT_ID,
      type: 'burst',
      photoIds: ['p1', 'p2'],
      createdAt: 1,
    };
    const photos = [
      makePhoto({ id: 'p1', dhash: '0000000000000000', scores: makeScores({ overall: 90 }) }),
      makePhoto({ id: 'p2', dhash: 'ffffffffffffffff', scores: makeScores({ overall: 85 }) }),
      makePhoto({ id: 'p3', dhash: 'aaaaaaaaaaaaaaaa', scores: makeScores({ overall: 70 }) }),
    ];
    const result = curateSelection(photos, { target: 2, avoidGroups: [group] });
    expect(result.ids).toEqual(['p1', 'p3']);
    expect(result.reasons.get('p1')).toBe('Best of burst');
  });

  it('explains favourite selections', () => {
    const photos = distinctPhotos();
    photos[0] = { ...photos[0], favorite: true };
    const result = curateSelection(photos, { target: 1 });
    expect(result.reasons.get('p1')).toBe('Favourite');
  });

  it('swaps in coverage for a required person', () => {
    const photos = [
      makePhoto({ id: 'top', dhash: '0000000000000000', scores: makeScores({ overall: 90 }) }),
      makePhoto({
        id: 'person',
        dhash: 'ffffffffffffffff',
        scores: makeScores({ overall: 60 }),
        personIds: ['aisha'],
      }),
    ];
    const result = curateSelection(photos, { target: 1, ensurePersonIds: ['aisha'] });
    expect(result.ids).toEqual(['person']);
    expect(result.reasons.get('person')).toBe('Represents a key person');
  });

  it('only selects analysed photographs', () => {
    const photos = [
      makePhoto({ id: 'analysed', analysis: undefined, scores: makeScores({ overall: 90 }) }),
      makePhoto({ id: 'ready', scores: makeScores({ overall: 60 }) }),
    ];
    expect(curateSelection(photos, { target: 2 }).ids).toEqual(['ready']);
  });
});

describe('suggestions and coverage', () => {
  it('suggests unselected, unrejected frames', () => {
    const selected = makePhoto({ id: 'selected', dhash: '0000000000000000' });
    const rejected = makePhoto({ id: 'rejected', dhash: 'ffffffffffffffff', rejected: true });
    const candidate = makePhoto({ id: 'candidate', dhash: 'aaaaaaaaaaaaaaaa' });
    const suggestions = nextBestSuggestions([selected, rejected, candidate], [selected], 5);
    expect(suggestions.map((photo) => photo.id)).toEqual(['candidate']);
  });

  it('summarises people, events, categories and flags', () => {
    const photos = [
      makePhoto({
        id: 'a',
        personIds: ['p1', 'p2'],
        eventId: 'e1',
        category: 'couple',
        scores: makeScores({ overall: 80 }),
        flags: ['blurry'],
      }),
      makePhoto({
        id: 'b',
        personIds: ['p1'],
        eventId: 'e1',
        category: 'ceremony',
        scores: makeScores({ overall: 60 }),
        flags: [],
      }),
    ];
    expect(selectionCoverage(photos)).toEqual({
      people: 2,
      events: 1,
      categories: 2,
      averageScore: 70,
      flagged: 1,
    });
  });

  it('handles empty selections', () => {
    expect(selectionCoverage([])).toEqual({
      people: 0,
      events: 0,
      categories: 0,
      averageScore: 0,
      flagged: 0,
    });
  });

  it('understands face summaries used for coverage counts', () => {
    const photo = makePhoto({ faces: makeFaceSummary({ faceCount: 2, smilingCount: 2 }) });
    expect(photo.faces.faceCount).toBe(2);
  });
});
