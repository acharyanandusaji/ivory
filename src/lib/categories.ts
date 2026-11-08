import type {
  AlbumCategory,
  EventRecord,
  EventType,
  Face,
  Person,
  PersonRole,
  Photo,
} from '@/types';
import { timeOfDayLabel } from './utils';

export function deriveEventType(photo: Photo, event?: EventRecord): EventType {
  return event?.type ?? 'other';
}

export function deriveSmartCategories(
  photo: Photo,
  roles: Map<string, PersonRole>,
  event?: EventRecord,
): Set<AlbumCategory> {
  const result = new Set<AlbumCategory>();
  const faces = photo.faces.faceCount;
  const photoRoles = new Set(photo.personIds.map((id) => roles.get(id)).filter(Boolean) as PersonRole[]);

  if (photoRoles.has('bride')) result.add('portraits');
  if (photoRoles.has('groom')) result.add('portraits');
  if (photoRoles.has('bride') && photoRoles.has('groom')) result.add('couple');
  if (faces === 2) result.add('couple');
  if (photoRoles.has('family')) result.add('family');
  if (photoRoles.has('friend')) result.add('friends');
  if (faces >= 3) result.add('groups');
  if (faces === 1) result.add('portraits');
  if (photo.tags.includes('candid')) result.add('candids');
  if (faces === 0) result.add('details');

  if (event?.type === 'ceremony') {
    result.add('ceremony');
    result.add('portraits');
  }
  if (event?.type === 'reception' || event?.type === 'party') result.add('reception');
  if (event?.type === 'portraits') result.add('portraits');
  if (event?.type === 'details') result.add('details');

  return result;
}

export function deriveAlbumCategory(
  photo: Photo,
  roles: Map<string, PersonRole>,
  event?: EventRecord,
): AlbumCategory {
  const categories = deriveSmartCategories(photo, roles, event);
  if (photo.selected && photo.category) return photo.category;
  if (categories.has('ceremony')) return 'ceremony';
  if (categories.has('reception')) return 'reception';
  const photoRoles = new Set(photo.personIds.map((id) => roles.get(id)).filter(Boolean) as PersonRole[]);
  if (photo.faces.faceCount === 2 && photoRoles.has('bride') && photoRoles.has('groom')) return 'couple';
  if (categories.has('family')) return 'family';
  if (photo.faces.faceCount >= 3) return 'groups';
  if (categories.has('friends')) return 'friends';
  if (categories.has('candids')) return 'candids';
  if (categories.has('portraits')) return 'portraits';
  if (categories.has('details')) return 'details';
  return 'other';
}

export interface SmartFilterContext {
  roles: Map<string, PersonRole>;
  events: Map<string, EventRecord>;
}

export interface SmartFilter {
  id: string;
  label: string;
  group: 'people' | 'moments' | 'quality';
  test: (photo: Photo, context: SmartFilterContext) => boolean;
}

function rolesFor(photo: Photo, context: SmartFilterContext): Set<PersonRole> {
  return new Set(photo.personIds.map((id) => context.roles.get(id)).filter(Boolean) as PersonRole[]);
}

export const SMART_FILTERS: SmartFilter[] = [
  {
    id: 'bride',
    label: 'Bride',
    group: 'people',
    test: (photo, context) => rolesFor(photo, context).has('bride'),
  },
  {
    id: 'groom',
    label: 'Groom',
    group: 'people',
    test: (photo, context) => rolesFor(photo, context).has('groom'),
  },
  {
    id: 'couple',
    label: 'Couple',
    group: 'people',
    test: (photo, context) => {
      const roles = rolesFor(photo, context);
      return (roles.has('bride') && roles.has('groom')) || photo.faces.faceCount === 2;
    },
  },
  {
    id: 'family',
    label: 'Family',
    group: 'people',
    test: (photo, context) => rolesFor(photo, context).has('family'),
  },
  {
    id: 'friends',
    label: 'Friends',
    group: 'people',
    test: (photo, context) => rolesFor(photo, context).has('friend'),
  },
  {
    id: 'groups',
    label: 'Group photos',
    group: 'moments',
    test: (photo) => photo.faces.faceCount >= 3,
  },
  {
    id: 'portraits',
    label: 'Portraits',
    group: 'moments',
    test: (photo) => photo.faces.faceCount > 0 && photo.faces.faceCount <= 2,
  },
  {
    id: 'candids',
    label: 'Candids',
    group: 'moments',
    test: (photo) => photo.tags.includes('candid'),
  },
  {
    id: 'ceremony',
    label: 'Ceremony',
    group: 'moments',
    test: (photo, context) =>
      photo.eventId ? context.events.get(photo.eventId)?.type === 'ceremony' : false,
  },
  {
    id: 'reception',
    label: 'Reception',
    group: 'moments',
    test: (photo, context) => {
      const type = photo.eventId ? context.events.get(photo.eventId)?.type : undefined;
      return type === 'reception' || type === 'party';
    },
  },
  {
    id: 'details',
    label: 'Details & décor',
    group: 'moments',
    test: (photo) => photo.faces.faceCount === 0,
  },
  {
    id: 'smiling',
    label: 'Smiling',
    group: 'quality',
    test: (photo) => photo.faces.smilingCount > 0,
  },
  {
    id: 'eyes-closed',
    label: 'Eyes closed',
    group: 'quality',
    test: (photo) => photo.faces.eyesClosedCount > 0,
  },
  {
    id: 'looking',
    label: 'Looking at camera',
    group: 'quality',
    test: (photo) => photo.faces.faceCount > 0 && photo.faces.lookingCount === photo.faces.faceCount,
  },
  {
    id: 'blurry',
    label: 'Soft focus',
    group: 'quality',
    test: (photo) => photo.flags.includes('blurry'),
  },
  {
    id: 'duplicates',
    label: 'Duplicates & repeats',
    group: 'quality',
    test: (photo) => photo.flags.includes('duplicate') || photo.flags.includes('repetitive'),
  },
  {
    id: 'top',
    label: 'Top rated',
    group: 'quality',
    test: (photo) => (photo.scores?.overall ?? 0) >= 75,
  },
];

export function photoMatchesSmartFilter(
  photo: Photo,
  filterId: string,
  context: SmartFilterContext,
): boolean {
  const filter = SMART_FILTERS.find((item) => item.id === filterId);
  return filter ? filter.test(photo, context) : true;
}

export function buildRoleMap(people: Person[]): Map<string, PersonRole> {
  return new Map(people.map((person) => [person.id, person.role]));
}

export function buildPeopleMap(people: Person[]): Map<string, Person> {
  return new Map(people.map((person) => [person.id, person]));
}

export function rolesFromFaces(faces: Face[], people: Person[]): Map<string, PersonRole> {
  const map = buildRoleMap(people);
  return map;
}

export function eventsForPhotos(photos: Photo[], events: EventRecord[]): Map<string, EventRecord> {
  return new Map(events.map((event) => [event.id, event]));
}

/** Automatic event grouping from capture time gaps. */
export function buildEventSpecs(
  photos: Photo[],
  gapMinutes: number,
  projectId: string,
): Array<{ start: number; end: number; photoIds: string[]; name: string; type: EventType }> {
  const timed = photos
    .filter((photo) => photo.capturedAt)
    .sort((a, b) => (a.capturedAt ?? 0) - (b.capturedAt ?? 0));
  const gap = gapMinutes * 60_000;
  const specs: Array<{ start: number; end: number; photoIds: string[]; name: string; type: EventType }> = [];
  let current: typeof specs[number] | null = null;
  for (const photo of timed) {
    const time = photo.capturedAt as number;
    if (!current || time - current.end > gap) {
      if (current) specs.push(current);
      current = {
        start: time,
        end: time,
        photoIds: [photo.id],
        name: timeOfDayLabel(time),
        type: 'other' as EventType,
      };
    } else {
      current.end = time;
      current.photoIds.push(photo.id);
    }
  }
  if (current) specs.push(current);
  void projectId;
  return specs;
}

export function eventTypeLabel(type: EventType): string {
  const labels: Record<EventType, string> = {
    'getting-ready': 'Getting ready',
    ceremony: 'Ceremony',
    portraits: 'Portraits',
    reception: 'Reception',
    party: 'Party',
    details: 'Details',
    other: 'Moment',
  };
  return labels[type] ?? 'Moment';
}

export function discoveredRoles(people: Person[]): { hasBride: boolean; hasGroom: boolean } {
  return {
    hasBride: people.some((person) => person.role === 'bride'),
    hasGroom: people.some((person) => person.role === 'groom'),
  };
}
