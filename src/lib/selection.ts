import type { Photo, PhotoGroup } from '@/types';
import { hammingDistance } from './grouping';
import { clamp } from './utils';

export interface CurateOptions {
  target: number;
  similarityThreshold?: number;
  includeRejected?: boolean;
  favoriteBoost?: number;
  ensurePersonIds?: string[];
  avoidGroups?: PhotoGroup[];
  diversifyEvents?: boolean;
}

export interface CurationResult {
  ids: string[];
  reasons: Map<string, string>;
  skippedSimilar: number;
}

export function effectiveScore(photo: Photo, favoriteBoost = 6): number {
  if (!photo.scores) return 0;
  let score = photo.scores.overall;
  if (photo.favorite) score += favoriteBoost;
  if (photo.selected) score += 1.5;
  if (photo.rejected) score -= 200;
  for (const flag of photo.flags) {
    if (flag === 'blurry') score -= 24;
    else if (flag === 'overexposed' || flag === 'underexposed') score -= 9;
    else if (flag === 'closed-eyes') score -= 6;
    else if (flag === 'poor-composition') score -= 4;
    else if (flag === 'low-resolution') score -= 3;
    else if (flag === 'duplicate') score -= 2;
    else if (flag === 'repetitive') score -= 2;
  }
  return clamp(score, 0, 120);
}

export function tooSimilar(
  candidate: Photo,
  selected: Photo[],
  threshold = 8,
): Photo | null {
  if (!candidate.dhash) return null;
  for (const photo of selected) {
    if (!photo.dhash) continue;
    if (hammingDistance(candidate.dhash, photo.dhash) <= threshold) return photo;
  }
  return null;
}

function groupMembership(groups: PhotoGroup[] | undefined): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const group of groups ?? []) {
    for (const id of group.photoIds) {
      const set = map.get(id) ?? new Set<string>();
      set.add(group.id);
      map.set(id, set);
    }
  }
  return map;
}

export function curateSelection(photos: Photo[], options: CurateOptions): CurationResult {
  const {
    target,
    similarityThreshold = 8,
    includeRejected = false,
    favoriteBoost = 6,
    ensurePersonIds = [],
    avoidGroups = [],
    diversifyEvents = true,
  } = options;
  const reasons = new Map<string, string>();
  if (target <= 0) return { ids: [], reasons, skippedSimilar: 0 };

  const eligible = photos.filter(
    (photo) => photo.analysis && (includeRejected || !photo.rejected),
  );
  const ranked = [...eligible].sort((a, b) => effectiveScore(b, favoriteBoost) - effectiveScore(a, favoriteBoost));
  const membership = groupMembership(avoidGroups);
  const groupsById = new Map(avoidGroups.map((group) => [group.id, group]));
  const chosen: Photo[] = [];
  const chosenIds = new Set<string>();
  const usedGroups = new Set<string>();
  const eventCounts = new Map<string, number>();
  const eventCap = Math.max(3, Math.ceil(target * 0.34));
  let skippedSimilar = 0;

  const tryAdd = (photo: Photo, strict: boolean): boolean => {
    if (chosenIds.has(photo.id)) return false;
    if (chosen.length >= target) return false;

    const groups = membership.get(photo.id);
    if (groups) {
      for (const groupId of groups) {
        if (usedGroups.has(groupId)) {
          if (strict) return false;
        }
      }
    }

    if (strict) {
      const similar = tooSimilar(photo, chosen, similarityThreshold);
      if (similar) {
        skippedSimilar += 1;
        return false;
      }
    }

    if (strict && diversifyEvents && photo.eventId) {
      const count = eventCounts.get(photo.eventId) ?? 0;
      if (count >= eventCap) return false;
    }

    chosen.push(photo);
    chosenIds.add(photo.id);
    for (const groupId of groups ?? []) usedGroups.add(groupId);
    if (photo.eventId) eventCounts.set(photo.eventId, (eventCounts.get(photo.eventId) ?? 0) + 1);

    let reason = 'Top quality';
    if (photo.favorite) reason = 'Favourite';
    const groupsForPhoto = Array.from(groups ?? []).map((id) => groupsById.get(id)).filter(Boolean);
    if (groupsForPhoto.some((group) => group?.type === 'burst')) reason = 'Best of burst';
    else if (groupsForPhoto.some((group) => group?.type === 'similar')) reason = 'Best of similar set';
    else if (photo.faces.smilingCount > 0 && photo.faces.eyesClosedCount === 0) reason = 'Eyes open, smiling';
    else if (photo.faces.faceCount >= 3 && photo.faces.lookingCount >= photo.faces.faceCount) {
      reason = 'Everyone looking';
    } else if ((photo.scores?.sharpness ?? 0) >= 82) reason = 'Tack sharp';
    reasons.set(photo.id, reason);
    return true;
  };

  // Pass 1 — strict diversity
  for (const photo of ranked) {
    if (chosen.length >= target) break;
    tryAdd(photo, true);
  }

  // Pass 2 — fill remaining, allowing more frames from the same event but not near-duplicates
  if (chosen.length < target) {
    for (const photo of ranked) {
      if (chosen.length >= target) break;
      if (chosenIds.has(photo.id)) continue;
      const similar = tooSimilar(photo, chosen, Math.max(4, similarityThreshold - 3));
      if (similar) continue;
      tryAdd(photo, false);
    }
  }

  // Pass 3 — coverage for named people, swapping in if needed
  for (const personId of ensurePersonIds) {
    if (chosen.some((photo) => photo.personIds.includes(personId))) continue;
    const candidate = ranked.find(
      (photo) =>
        !chosenIds.has(photo.id) &&
        photo.personIds.includes(personId) &&
        !tooSimilar(photo, chosen, Math.max(4, similarityThreshold - 2)),
    );
    if (!candidate) continue;
    if (chosen.length >= target) {
      // Replace the lowest scoring photo that is not the only coverage of another person
      const removable = [...chosen]
        .sort((a, b) => effectiveScore(a) - effectiveScore(b))
        .find((photo) =>
          photo.personIds.every(
            (id) =>
              id === personId ||
              chosen.some((other) => other.id !== photo.id && other.personIds.includes(id)),
          ),
        );
      if (!removable) continue;
      chosen.splice(chosen.indexOf(removable), 1);
      chosenIds.delete(removable.id);
      reasons.delete(removable.id);
    }
    chosen.push(candidate);
    chosenIds.add(candidate.id);
    reasons.set(candidate.id, 'Represents a key person');
  }

  return {
    ids: chosen.map((photo) => photo.id),
    reasons,
    skippedSimilar,
  };
}

export function selectionCoverage(photos: Photo[]): {
  people: number;
  events: number;
  categories: number;
  averageScore: number;
  flagged: number;
} {
  const people = new Set<string>();
  const events = new Set<string>();
  const categories = new Set<string>();
  let total = 0;
  let flagged = 0;
  for (const photo of photos) {
    for (const id of photo.personIds) people.add(id);
    if (photo.eventId) events.add(photo.eventId);
    if (photo.category) categories.add(photo.category);
    total += photo.scores?.overall ?? 0;
    if (photo.flags.length) flagged += 1;
  }
  return {
    people: people.size,
    events: events.size,
    categories: categories.size,
    averageScore: photos.length ? Math.round(total / photos.length) : 0,
    flagged,
  };
}

export function nextBestSuggestions(
  photos: Photo[],
  selected: Photo[],
  limit = 8,
  similarityThreshold = 8,
): Photo[] {
  const selectedIds = new Set(selected.map((photo) => photo.id));
  const ranked = photos
    .filter((photo) => !selectedIds.has(photo.id) && !photo.rejected && photo.analysis)
    .sort((a, b) => effectiveScore(b) - effectiveScore(a));
  const suggestions: Photo[] = [];
  for (const photo of ranked) {
    if (suggestions.length >= limit) break;
    if (!tooSimilar(photo, [...selected, ...suggestions], similarityThreshold)) suggestions.push(photo);
  }
  if (suggestions.length < limit) {
    for (const photo of ranked) {
      if (suggestions.length >= limit) break;
      if (!suggestions.some((item) => item.id === photo.id)) suggestions.push(photo);
    }
  }
  return suggestions;
}
