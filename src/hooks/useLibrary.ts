import { useMemo } from 'react';
import type { EventRecord, Person, Photo, PhotoGroup } from '@/types';
import { useAppStore } from '@/store/appStore';
import { smartSearch } from '@/lib/search';
import { SMART_FILTERS, photoMatchesSmartFilter } from '@/lib/categories';

export interface LibraryView {
  photos: Photo[];
  all: Photo[];
  groups: PhotoGroup[];
  peopleById: Map<string, Person>;
  eventsById: Map<string, EventRecord>;
}

export function useLibraryView(): LibraryView {
  const photos = useAppStore((state) => state.photos);
  const groups = useAppStore((state) => state.groups);
  const people = useAppStore((state) => state.people);
  const events = useAppStore((state) => state.events);
  const filters = useAppStore((state) => state.filters);

  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const eventsById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);

  const filtered = useMemo(() => {
    const groupTypeById = new Map(groups.map((group) => [group.id, group.type]));
    let list = photos;

    if (filters.search.trim()) {
      const hits = smartSearch(list, filters.search, {
        people,
        faces: [],
        roles: new Map(people.map((person) => [person.id, person.role])),
        events: eventsById,
      });
      list = hits.filter((hit) => hit.reasons.length > 0 || !filters.search.trim()).map((hit) => hit.photo);
    }

    if (filters.peopleIds.length) {
      const wanted = filters.peopleIds;
      list = list.filter((photo) =>
        filters.peopleMode === 'all'
          ? wanted.every((id) => photo.personIds.includes(id))
          : wanted.some((id) => photo.personIds.includes(id)),
      );
    }
    if (filters.categories.length) {
      const allowed = new Set(filters.categories);
      list = list.filter((photo) => photo.category && allowed.has(photo.category));
    }
    if (filters.smart.length) {
      const byGroup = new Map<string, string[]>();
      for (const id of filters.smart) {
        const definition = SMART_FILTERS.find((item) => item.id === id);
        if (!definition) continue;
        const group = byGroup.get(definition.group) ?? [];
        group.push(id);
        byGroup.set(definition.group, group);
      }
      if (byGroup.size) {
        const context = {
          roles: new Map(people.map((person) => [person.id, person.role])),
          events: eventsById,
        };
        list = list.filter((photo) =>
          Array.from(byGroup.values()).every((ids) =>
            ids.some((id) => photoMatchesSmartFilter(photo, id, context)),
          ),
        );
      }
    }
    if (filters.flags.length) {
      const wanted = new Set(filters.flags);
      list = list.filter((photo) => photo.flags.some((flag) => wanted.has(flag)));
    }
    if (filters.tags.length) {
      const wanted = filters.tags;
      list = list.filter((photo) => wanted.every((tag) => photo.tags.includes(tag)));
    }
    if (filters.eventId) list = list.filter((photo) => photo.eventId === filters.eventId);
    if (filters.groupType) {
      list = list.filter((photo) =>
        photo.groupIds.some((groupId) => groupTypeById.get(groupId) === filters.groupType),
      );
    }
    if (filters.minRating > 0) list = list.filter((photo) => photo.rating >= filters.minRating);
    if (filters.minScore > 0) list = list.filter((photo) => (photo.scores?.overall ?? 0) >= filters.minScore);
    if (filters.orientation !== 'all') {
      list = list.filter((photo) => {
        const ratio = photo.height ? photo.width / photo.height : 1;
        if (filters.orientation === 'landscape') return ratio > 1.04;
        if (filters.orientation === 'portrait') return ratio < 0.96;
        return ratio >= 0.96 && ratio <= 1.04;
      });
    }
    if (filters.onlySelected) list = list.filter((photo) => photo.selected);
    if (filters.onlyFavorites) list = list.filter((photo) => photo.favorite);
    if (filters.onlyRejected) {
      list = list.filter((photo) => photo.rejected);
    } else if (filters.hideRejected) {
      list = list.filter((photo) => !photo.rejected);
    }
    if (filters.onlyUnreviewed) {
      list = list.filter(
        (photo) => !photo.favorite && !photo.rejected && !photo.selected && photo.rating === 0,
      );
    }

    const sorted = [...list];
    switch (filters.sort) {
      case 'date':
        sorted.sort((a, b) => (b.capturedAt ?? b.addedAt) - (a.capturedAt ?? a.addedAt));
        break;
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        break;
      case 'faces':
        sorted.sort(
          (a, b) => b.faces.faceCount - a.faces.faceCount || (b.scores?.overall ?? 0) - (a.scores?.overall ?? 0),
        );
        break;
      default:
        sorted.sort((a, b) => (b.scores?.overall ?? 0) - (a.scores?.overall ?? 0));
    }
    return sorted;
  }, [photos, groups, people, eventsById, filters]);

  return { photos: filtered, all: photos, groups, peopleById, eventsById };
}

export function activeFilterCount(filters: ReturnType<typeof useAppStore.getState>['filters']): number {
  let count = 0;
  if (filters.search.trim()) count += 1;
  count += filters.peopleIds.length ? 1 : 0;
  count += filters.categories.length ? 1 : 0;
  count += filters.smart.length ? 1 : 0;
  count += filters.flags.length ? 1 : 0;
  count += filters.tags.length ? 1 : 0;
  count += filters.eventId ? 1 : 0;
  count += filters.groupType ? 1 : 0;
  count += filters.minRating > 0 ? 1 : 0;
  count += filters.minScore > 0 ? 1 : 0;
  count += filters.orientation !== 'all' ? 1 : 0;
  count += filters.onlySelected ? 1 : 0;
  count += filters.onlyFavorites ? 1 : 0;
  count += filters.onlyRejected ? 1 : 0;
  count += filters.onlyUnreviewed ? 1 : 0;
  return count;
}
