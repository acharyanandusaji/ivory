import type { EventRecord, Face, Person, PersonRole, Photo } from '@/types';
import { SMART_FILTERS } from './categories';

export interface ParsedQuery {
  terms: string[];
  personIds: string[];
  personTerms: string[];
  roleFilters: string[];
  tags: string[];
  flags: string[];
  month: number | null;
  year: number | null;
  hasConstraints: boolean;
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];
const MONTH_SHORT = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const FLAG_WORDS: Array<{ words: string[]; flag: string }> = [
  { words: ['blurry', 'blur', 'soft', 'out of focus', 'unsharp', 'fuzzy'], flag: 'blurry' },
  { words: ['overexposed', 'overexposed', 'blown', 'too bright', 'bright'], flag: 'overexposed' },
  { words: ['underexposed', 'dark', 'too dark', 'shadow'], flag: 'underexposed' },
  { words: ['eyes closed', 'blink', 'blinking', 'closed eyes'], flag: 'closed-eyes' },
  { words: ['duplicate', 'duplicates', 'repeats', 'similar'], flag: 'duplicates' },
];

const TAG_WORDS: Array<{ words: string[]; filter: string }> = [
  { words: ['group', 'groups', 'group photo', 'family portrait'], filter: 'groups' },
  { words: ['couple', 'couple portrait', 'bride and groom', 'together'], filter: 'couple' },
  { words: ['portrait', 'portraits', 'headshot'], filter: 'portraits' },
  { words: ['candid', 'candids', 'unposed', 'natural'], filter: 'candids' },
  { words: ['smile', 'smiling', 'smiles', 'happy'], filter: 'smiling' },
  { words: ['looking at camera', 'facing camera', 'posing', 'posed'], filter: 'looking' },
  { words: ['detail', 'details', 'decor', 'decoration', 'flowers', 'florals', 'rings'], filter: 'details' },
  { words: ['ceremony', 'vows', 'aisle', 'altar'], filter: 'ceremony' },
  { words: ['reception', 'dinner', 'dancing', 'party'], filter: 'reception' },
  { words: ['bride'], filter: 'bride' },
  { words: ['groom'], filter: 'groom' },
  { words: ['family'], filter: 'family' },
  { words: ['friends', 'wedding party', 'bridesmaids', 'groomsmen'], filter: 'friends' },
  { words: ['best', 'top rated', 'favourite', 'favorite'], filter: 'top' },
];

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function parseQuery(raw: string, people: Person[]): ParsedQuery {
  const text = normalise(raw);
  const personIds: string[] = [];
  const personTerms: string[] = [];
  const tokens = text ? text.split(' ') : [];

  // Match whole words/phrases. Substring matching would let "Person 1" match
  // "Person 12" and "bride" match "bridesmaids".
  const containsPhrase = (phrase: string): boolean => {
    const parts = phrase.split(' ').filter(Boolean);
    if (!parts.length) return false;
    for (let i = 0; i <= tokens.length - parts.length; i += 1) {
      let match = true;
      for (let j = 0; j < parts.length; j += 1) {
        if (tokens[i + j] !== parts[j]) {
          match = false;
          break;
        }
      }
      if (match) return true;
    }
    return false;
  };
  const removePhrase = (phrase: string): void => {
    const parts = phrase.split(' ').filter(Boolean);
    for (let i = 0; i <= tokens.length - parts.length; i += 1) {
      let match = true;
      for (let j = 0; j < parts.length; j += 1) {
        if (tokens[i + j] !== parts[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        tokens.splice(i, parts.length);
        i -= 1;
      }
    }
  };

  for (const person of people) {
    const name = normalise(person.name);
    if (!name) continue;
    // Auto-generated names ("Person 12") are still visible labels in the UI, so
    // match the complete phrase. Never match the bare word "person" from them.
    const isAutoName = /^person \d+$/.test(name);
    if (containsPhrase(name)) {
      personIds.push(person.id);
      personTerms.push(person.name);
      removePhrase(name);
    }
    if (isAutoName) continue;
    const firstName = name.split(' ')[0];
    if (firstName.length > 2 && tokens.includes(firstName)) {
      if (!personIds.includes(person.id)) {
        personIds.push(person.id);
        personTerms.push(person.name);
      }
    }
  }

  const roleFilters: string[] = [];
  const tags: string[] = [];
  const flags: string[] = [];
  for (const entry of TAG_WORDS) {
    for (const word of entry.words) {
      if (containsPhrase(word)) {
        if (entry.filter === 'bride' || entry.filter === 'groom' || entry.filter === 'family' || entry.filter === 'friends') {
          if (!roleFilters.includes(entry.filter)) roleFilters.push(entry.filter);
        } else if (!tags.includes(entry.filter)) {
          tags.push(entry.filter);
        }
      }
    }
  }
  for (const entry of FLAG_WORDS) {
    for (const word of entry.words) {
      if (containsPhrase(word) && !flags.includes(entry.flag)) flags.push(entry.flag);
    }
  }

  let month: number | null = null;
  let year: number | null = null;
  MONTHS.forEach((monthName, index) => {
    if (containsPhrase(monthName) || tokens.includes(MONTH_SHORT[index])) month = index;
  });
  const yearMatch = tokens.find((token) => /^(19|20)\d{2}$/.test(token));
  if (yearMatch) year = Number(yearMatch);

  const stop = new Set([
    'photos',
    'photo',
    'pictures',
    'picture',
    'images',
    'image',
    'of',
    'with',
    'and',
    'the',
    'from',
    'show',
    'find',
    'all',
    'in',
    'at',
    'where',
    'who',
    'are',
  ]);
  const terms = tokens
    .map((term) => term.trim())
    .filter((term) => term.length > 1 && !stop.has(term));

  return {
    terms,
    personIds,
    personTerms,
    roleFilters,
    tags,
    flags,
    month,
    year,
    hasConstraints:
      personIds.length > 0 ||
      roleFilters.length > 0 ||
      tags.length > 0 ||
      flags.length > 0 ||
      month !== null ||
      year !== null ||
      terms.length > 0,
  };
}

export interface SearchContext {
  people: Person[];
  faces: Face[];
  roles: Map<string, PersonRole>;
  events: Map<string, EventRecord>;
}

export interface SearchHit {
  photo: Photo;
  score: number;
  reasons: string[];
}

function matchesParsed(photo: Photo, parsed: ParsedQuery, context: SearchContext): boolean {
  if (parsed.personIds.length) {
    const all = parsed.personIds.every((id) => photo.personIds.includes(id));
    if (!all) return false;
  }
  for (const role of parsed.roleFilters) {
    const has = photo.personIds.some((id) => context.roles.get(id) === role);
    if (!has) {
      if (role === 'friends' && photo.tags.includes('group')) continue;
      return false;
    }
  }
  for (const tag of parsed.tags) {
    const filter = SMART_FILTERS.find((item) => item.id === tag);
    if (filter && !filter.test(photo, context)) return false;
  }
  for (const flag of parsed.flags) {
    if (flag === 'duplicates') {
      if (!photo.flags.includes('duplicate') && !photo.flags.includes('repetitive')) return false;
    } else if (!photo.flags.includes(flag as never)) {
      return false;
    }
  }
  if (parsed.month !== null && photo.capturedAt) {
    if (new Date(photo.capturedAt).getMonth() !== parsed.month) return false;
  }
  if (parsed.year !== null && photo.capturedAt) {
    if (new Date(photo.capturedAt).getFullYear() !== parsed.year) return false;
  }
  return true;
}

export function smartSearch(photos: Photo[], rawQuery: string, context: SearchContext): SearchHit[] {
  const parsed = parseQuery(rawQuery, context.people);
  if (!parsed.hasConstraints) return photos.map((photo) => ({ photo, score: 0, reasons: [] }));

  const filtered = photos.filter((photo) => matchesParsed(photo, parsed, context));
  const hits = filtered.map((photo) => {
    let score = 0;
    const reasons: string[] = [];
    const name = photo.name.toLowerCase();
    const note = photo.notes.toLowerCase();
    const tagText = photo.tags.join(' ');
    const eventName = photo.eventId ? context.events.get(photo.eventId)?.name.toLowerCase() ?? '' : '';

    for (const term of parsed.terms) {
      if (name.includes(term)) {
        score += 46;
        reasons.push('filename');
      }
      if (note.includes(term)) {
        score += 38;
        reasons.push('note');
      }
      if (tagText.includes(term)) {
        score += 30;
        reasons.push(term);
      }
      if (eventName.includes(term)) {
        score += 24;
        reasons.push('event');
      }
      const personMatch = context.people.some(
        (person) => photo.personIds.includes(person.id) && person.name.toLowerCase().includes(term),
      );
      if (personMatch) {
        score += 40;
        reasons.push('person');
      }
      if ((photo.camera ?? '').toLowerCase().includes(term) || (photo.lens ?? '').toLowerCase().includes(term)) {
        score += 8;
      }
    }
    for (const personId of parsed.personIds) {
      if (photo.personIds.includes(personId)) {
        score += 55;
        reasons.push('person');
      }
    }
    for (const role of parsed.roleFilters) {
      if (photo.personIds.some((id) => context.roles.get(id) === role)) {
        score += 45;
        reasons.push(role);
      }
    }
    for (const tag of parsed.tags) {
      score += 28;
      reasons.push(tag);
    }
    for (const flag of parsed.flags) {
      score += 20;
      reasons.push(flag);
    }
    score += (photo.scores?.overall ?? 0) * 0.35;
    if (photo.favorite) score += 6;
    if (photo.selected) score += 3;
    return { photo, score: Math.round(score), reasons: Array.from(new Set(reasons)).slice(0, 3) };
  });

  return hits.sort((a, b) => b.score - a.score || (b.photo.scores?.overall ?? 0) - (a.photo.scores?.overall ?? 0));
}

export function querySuggestions(people: Person[], events: string[]): string[] {
  const suggestions: string[] = [];
  const bride = people.find((person) => person.role === 'bride');
  const groom = people.find((person) => person.role === 'groom');
  if (bride && groom) suggestions.push(`${bride.name} and ${groom.name} smiling`);
  for (const event of events.slice(0, 2)) suggestions.push(event);
  suggestions.push('bride and groom portraits', 'candid moments', 'best photos', 'details and flowers');
  if (bride) suggestions.push(`${bride.name} with family`);
  if (groom) suggestions.push(`${groom.name} laughing`);
  return Array.from(new Set(suggestions)).slice(0, 6);
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function semanticSearch(
  photos: Photo[],
  textVector: Float32Array,
  embeddings: Map<string, Float32Array>,
  minScore = 0.18,
): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const photo of photos) {
    const vector = embeddings.get(photo.id);
    if (!vector) continue;
    const similarity = cosineSimilarity(textVector, vector);
    if (similarity >= minScore) {
      hits.push({
        photo,
        score: Math.round(similarity * 100),
        reasons: [`${Math.round(similarity * 100)}% visual match`],
      });
    }
  }
  return hits.sort((a, b) => b.score - a.score);
}
