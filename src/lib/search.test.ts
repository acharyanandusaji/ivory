import { describe, expect, it } from 'vitest';
import type { EventRecord, Face, PersonRole } from '@/types';
import {
  cosineSimilarity,
  parseQuery,
  querySuggestions,
  semanticSearch,
  smartSearch,
  type SearchContext,
} from '@/lib/search';
import { makeEvent, makeFaceSummary, makePerson, makePhoto, makeScores } from '@/test/fixtures';

function context(roles: Record<string, PersonRole> = {}): SearchContext {
  const aisha = makePerson({ id: 'aisha', name: 'Aisha Khan', role: roles.aisha ?? 'bride' });
  const noah = makePerson({ id: 'noah', name: 'Noah Reed', role: roles.noah ?? 'groom' });
  const event = makeEvent({ id: 'ceremony', name: 'Garden ceremony', type: 'ceremony' });
  return {
    people: [aisha, noah],
    faces: [] as Face[],
    roles: new Map([
      ['aisha', roles.aisha ?? 'bride'],
      ['noah', roles.noah ?? 'groom'],
    ]),
    events: new Map<string, EventRecord>([['ceremony', event]]),
  };
}

describe('parseQuery', () => {
  it('extracts people, tags, flags, month and year', () => {
    const parsed = parseQuery('Aisha smiling July 2026 blurry', context().people);
    expect(parsed.personIds).toEqual(['aisha']);
    expect(parsed.tags).toContain('smiling');
    expect(parsed.flags).toContain('blurry');
    expect(parsed.month).toBe(6);
    expect(parsed.year).toBe(2026);
    expect(parsed.hasConstraints).toBe(true);
  });

  it('recognises roles separately from tags', () => {
    const parsed = parseQuery('bride and groom portraits', context().people);
    expect(parsed.roleFilters).toEqual(expect.arrayContaining(['bride', 'groom']));
    expect(parsed.tags).toContain('portraits');
  });

  it('matches first names without treating auto names as people', () => {
    const people = [
      makePerson({ id: 'auto', name: 'Person 3' }),
      makePerson({ id: 'named', name: 'Priya Raman' }),
    ];
    const parsed = parseQuery('Priya by the altar', people);
    expect(parsed.personIds).toEqual(['named']);
  });

  it('matches the complete label of an auto-named person', () => {
    const people = [
      makePerson({ id: 'auto-1', name: 'Person 1' }),
      makePerson({ id: 'auto-12', name: 'Person 12' }),
      makePerson({ id: 'named', name: 'Priya Raman' }),
    ];
    const parsed = parseQuery('Person 12 smiling', people);
    expect(parsed.personIds).toEqual(['auto-12']);
    expect(parsed.tags).toContain('smiling');
    expect(parseQuery('Person 1', people).personIds).toEqual(['auto-1']);
    expect(parseQuery('photos of the person', people).personIds).toEqual([]);
  });

  it('reports no constraints for empty or stop-word-only queries', () => {
    expect(parseQuery('', context().people).hasConstraints).toBe(false);
    expect(parseQuery('photos of the', context().people).hasConstraints).toBe(false);
  });
});

describe('smartSearch', () => {
  const aishaPortrait = makePhoto({
    id: 'aisha-portrait',
    name: 'aisha-portrait.jpg',
    personIds: ['aisha'],
    flags: ['blurry'],
    tags: ['portrait', 'smiling'],
    scores: makeScores({ overall: 80 }),
    notes: 'Golden hour in the garden',
  });
  const noahPortrait = makePhoto({
    id: 'noah-portrait',
    name: 'noah-portrait.jpg',
    personIds: ['noah'],
    tags: ['portrait'],
    scores: makeScores({ overall: 70 }),
  });
  const photos = [aishaPortrait, noahPortrait];

  it('returns every photograph for an unconstrained query', () => {
    const hits = smartSearch(photos, '', context());
    expect(hits).toHaveLength(2);
    expect(hits.every((hit) => hit.score === 0)).toBe(true);
  });

  it('filters by named person', () => {
    const hits = smartSearch(photos, 'Aisha', context());
    expect(hits.map((hit) => hit.photo.id)).toEqual(['aisha-portrait']);
  });

  it('filters by quality flag', () => {
    const hits = smartSearch(photos, 'blurry', context());
    expect(hits.map((hit) => hit.photo.id)).toEqual(['aisha-portrait']);
  });

  it('filters by role', () => {
    expect(smartSearch(photos, 'bride', context()).map((hit) => hit.photo.id)).toEqual(['aisha-portrait']);
    expect(smartSearch(photos, 'groom', context()).map((hit) => hit.photo.id)).toEqual(['noah-portrait']);
  });

  it('scores filename and note matches', () => {
    const hits = smartSearch(photos, 'golden', context());
    expect(hits[0].photo.id).toBe('aisha-portrait');
    expect(hits[0].reasons).toContain('note');
    expect(hits[0].score).toBeGreaterThan(0);
  });

  it('uses event names in ranking', () => {
    const eventPhoto = makePhoto({ id: 'event', eventId: 'ceremony', name: 'frame.jpg' });
    const hits = smartSearch([aishaPortrait, eventPhoto], 'garden ceremony', context());
    expect(hits[0].photo.id).toBe('event');
  });
});

describe('ambient search helpers', () => {
  it('suggests useful starter queries from people and events', () => {
    const suggestions = querySuggestions(context().people, ['Garden ceremony', 'First dance']);
    expect(suggestions[0]).toBe('Aisha Khan and Noah Reed smiling');
    expect(suggestions).toEqual(expect.arrayContaining(['Garden ceremony', 'First dance']));
    expect(suggestions.length).toBeLessThanOrEqual(6);
  });

  it('computes cosine similarity safely', () => {
    expect(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([1, 0]))).toBeCloseTo(1, 6);
    expect(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([0, 1]))).toBeCloseTo(0, 6);
    expect(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([1, 0, 0]))).toBe(0);
    expect(cosineSimilarity(new Float32Array([0, 0]), new Float32Array([1, 0]))).toBe(0);
  });

  it('ranks semantic visual matches above the minimum score', () => {
    const text = new Float32Array([1, 0]);
    const embeddings = new Map<string, Float32Array>([
      ['a', new Float32Array([1, 0])],
      ['b', new Float32Array([0.8, 0.6])],
      ['c', new Float32Array([0, 1])],
    ]);
    const photos = [
      makePhoto({ id: 'a' }),
      makePhoto({ id: 'b' }),
      makePhoto({ id: 'c' }),
      makePhoto({ id: 'missing' }),
    ];
    const hits = semanticSearch(photos, text, embeddings, 0.5);
    expect(hits.map((hit) => hit.photo.id)).toEqual(['a', 'b']);
    expect(hits[0].score).toBe(100);
    expect(hits[0].reasons[0]).toContain('visual match');
  });
});

describe('search form fixtures', () => {
  it('keeps face summaries independent', () => {
    expect(makeFaceSummary({ faceCount: 2 }).faceCount).toBe(2);
  });
});
