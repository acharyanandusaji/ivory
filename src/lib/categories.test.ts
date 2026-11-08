import { describe, expect, it } from 'vitest';
import type { PersonRole } from '@/types';
import {
  buildEventSpecs,
  deriveAlbumCategory,
  deriveSmartCategories,
  eventTypeLabel,
  photoMatchesSmartFilter,
  SMART_FILTERS,
} from '@/lib/categories';
import { makeEvent, makeFaceSummary, makePerson, makePhoto, makeScores } from '@/test/fixtures';

function roles(entries: Array<[string, PersonRole]>): Map<string, PersonRole> {
  return new Map(entries);
}

describe('category derivation', () => {
  it('marks two faces as a couple and no faces as details', () => {
    const couple = makePhoto({ faces: makeFaceSummary({ faceCount: 2 }) });
    expect(deriveSmartCategories(couple, roles([])).has('couple')).toBe(true);

    const detail = makePhoto({ faces: makeFaceSummary({ faceCount: 0 }) });
    expect(deriveSmartCategories(detail, roles([])).has('details')).toBe(true);
  });

  it('uses named roles for portraits and family', () => {
    const photo = makePhoto({
      personIds: ['bride', 'groom', 'mum'],
      faces: makeFaceSummary({ faceCount: 3 }),
    });
    const categories = deriveSmartCategories(
      photo,
      roles([
        ['bride', 'bride'],
        ['groom', 'groom'],
        ['mum', 'family'],
      ]),
    );
    expect(categories.has('portraits')).toBe(true);
    expect(categories.has('couple')).toBe(true);
    expect(categories.has('family')).toBe(true);
    expect(categories.has('groups')).toBe(true);
  });

  it('uses event type for ceremony, reception and details', () => {
    const photo = makePhoto({ faces: makeFaceSummary({ faceCount: 1 }) });
    expect(deriveSmartCategories(photo, roles([]), makeEvent({ type: 'ceremony' })).has('ceremony')).toBe(true);
    expect(deriveSmartCategories(photo, roles([]), makeEvent({ type: 'reception' })).has('reception')).toBe(true);
    expect(deriveSmartCategories(photo, roles([]), makeEvent({ type: 'party' })).has('reception')).toBe(true);
    expect(deriveSmartCategories(photo, roles([]), makeEvent({ type: 'details' })).has('details')).toBe(true);
  });

  it('preserves a manual category on selected photographs', () => {
    const photo = makePhoto({ selected: true, category: 'friends', faces: makeFaceSummary({ faceCount: 0 }) });
    expect(deriveAlbumCategory(photo, roles([]))).toBe('friends');
  });

  it('prefers ceremony, then couple, then group categories', () => {
    const ceremony = makePhoto({
      personIds: ['bride', 'groom'],
      faces: makeFaceSummary({ faceCount: 2 }),
    });
    expect(deriveAlbumCategory(ceremony, roles([['bride', 'bride'], ['groom', 'groom']]), makeEvent({ type: 'ceremony' }))).toBe(
      'ceremony',
    );

    const couple = makePhoto({
      personIds: ['bride', 'groom'],
      faces: makeFaceSummary({ faceCount: 2 }),
    });
    expect(deriveAlbumCategory(couple, roles([['bride', 'bride'], ['groom', 'groom']]))).toBe('couple');

    const group = makePhoto({ faces: makeFaceSummary({ faceCount: 5 }) });
    expect(deriveAlbumCategory(group, roles([]))).toBe('groups');
  });
});

describe('smart filters', () => {
  const context = {
    roles: roles([['bride', 'bride'], ['groom', 'groom']]),
    events: new Map([['ceremony', makeEvent({ id: 'ceremony', type: 'ceremony' })]]),
  };

  it('filters by role and face count', () => {
    const bride = makePhoto({ personIds: ['bride'], faces: makeFaceSummary({ faceCount: 2 }) });
    expect(photoMatchesSmartFilter(bride, 'bride', context)).toBe(true);
    expect(photoMatchesSmartFilter(bride, 'groom', context)).toBe(false);
    expect(photoMatchesSmartFilter(bride, 'couple', context)).toBe(true);

    const group = makePhoto({ faces: makeFaceSummary({ faceCount: 4 }) });
    expect(photoMatchesSmartFilter(group, 'groups', context)).toBe(true);
  });

  it('filters by quality signals', () => {
    const soft = makePhoto({ flags: ['blurry'] });
    expect(photoMatchesSmartFilter(soft, 'blurry', context)).toBe(true);

    const top = makePhoto({ scores: makeScores({ overall: 82 }) });
    expect(photoMatchesSmartFilter(top, 'top', context)).toBe(true);

    const smiling = makePhoto({ faces: makeFaceSummary({ faceCount: 2, smilingCount: 1 }) });
    expect(photoMatchesSmartFilter(smiling, 'smiling', context)).toBe(true);
  });

  it('uses events for ceremony and reception filters', () => {
    const ceremony = makePhoto({ eventId: 'ceremony' });
    expect(photoMatchesSmartFilter(ceremony, 'ceremony', context)).toBe(true);
    expect(photoMatchesSmartFilter(ceremony, 'reception', context)).toBe(false);
  });

  it('treats unknown filters as pass-through', () => {
    expect(photoMatchesSmartFilter(makePhoto(), 'not-a-filter', context)).toBe(true);
  });

  it('exposes stable filter ids', () => {
    expect(new Set(SMART_FILTERS.map((filter) => filter.id)).size).toBe(SMART_FILTERS.length);
    expect(SMART_FILTERS.some((filter) => filter.id === 'couple')).toBe(true);
  });
});

describe('event grouping', () => {
  it('splits moments on capture-time gaps', () => {
    const start = new Date(2026, 6, 12, 10, 0, 0).getTime();
    const photos = [
      makePhoto({ id: 'a', capturedAt: start }),
      makePhoto({ id: 'b', capturedAt: start + 10 * 60_000 }),
      makePhoto({ id: 'c', capturedAt: start + 120 * 60_000 }),
      makePhoto({ id: 'd', capturedAt: null }),
    ];
    const specs = buildEventSpecs(photos, 45, 'project');
    expect(specs).toHaveLength(2);
    expect(specs[0].photoIds).toEqual(['a', 'b']);
    expect(specs[1].photoIds).toEqual(['c']);
  });

  it('labels event types', () => {
    expect(eventTypeLabel('getting-ready')).toBe('Getting ready');
    expect(eventTypeLabel('other')).toBe('Moment');
  });
});

describe('people fixtures', () => {
  it('creates people with defaults', () => {
    const person = makePerson();
    expect(person.name.startsWith('Person ')).toBe(true);
    expect(person.role).toBe('other');
  });
});
