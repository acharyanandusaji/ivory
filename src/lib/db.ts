import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  AssetRecord,
  EmbeddingRecord,
  EventRecord,
  Face,
  Person,
  Photo,
  PhotoGroup,
  Project,
} from '@/types';
import { DEFAULT_PROJECT_SETTINGS } from './constants';

interface IvoryDB extends DBSchema {
  projects: {
    key: string;
    value: Project;
    indexes: { 'by-updated': number };
  };
  photos: {
    key: string;
    value: Photo;
    indexes: {
      'by-project': string;
      'by-project-status': string;
      'by-project-captured': number;
      'by-photo-event': string;
    };
  };
  assets: {
    key: string;
    value: AssetRecord;
    indexes: {
      'by-project': string;
      'by-photo': string;
      'by-project-kind': string;
    };
  };
  faces: {
    key: string;
    value: Face;
    indexes: {
      'by-project': string;
      'by-photo': string;
      'by-person': string;
    };
  };
  people: {
    key: string;
    value: Person;
    indexes: { 'by-project': string };
  };
  groups: {
    key: string;
    value: PhotoGroup;
    indexes: { 'by-project': string; 'by-type': string };
  };
  events: {
    key: string;
    value: EventRecord;
    indexes: { 'by-project': string; 'by-start': number };
  };
  embeddings: {
    key: string;
    value: EmbeddingRecord;
    indexes: { 'by-project': string };
  };
}

const DB_NAME = 'ivory-studio';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<IvoryDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<IvoryDB>> {
  if (!dbPromise) {
    dbPromise = openDB<IvoryDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const projects = db.createObjectStore('projects', { keyPath: 'id' });
        projects.createIndex('by-updated', 'updatedAt');

        const photos = db.createObjectStore('photos', { keyPath: 'id' });
        photos.createIndex('by-project', 'projectId');
        photos.createIndex('by-project-status', ['projectId', 'status']);
        photos.createIndex('by-project-captured', ['projectId', 'capturedAt']);
        photos.createIndex('by-photo-event', 'eventId');

        const assets = db.createObjectStore('assets', { keyPath: 'id' });
        assets.createIndex('by-project', 'projectId');
        assets.createIndex('by-photo', 'photoId');
        assets.createIndex('by-project-kind', ['projectId', 'kind']);

        const faces = db.createObjectStore('faces', { keyPath: 'id' });
        faces.createIndex('by-project', 'projectId');
        faces.createIndex('by-photo', 'photoId');
        faces.createIndex('by-person', 'personId');

        const people = db.createObjectStore('people', { keyPath: 'id' });
        people.createIndex('by-project', 'projectId');

        const groups = db.createObjectStore('groups', { keyPath: 'id' });
        groups.createIndex('by-project', 'projectId');
        groups.createIndex('by-type', 'type');

        const events = db.createObjectStore('events', { keyPath: 'id' });
        events.createIndex('by-project', 'projectId');
        events.createIndex('by-start', 'start');

        const embeddings = db.createObjectStore('embeddings', { keyPath: 'photoId' });
        embeddings.createIndex('by-project', 'projectId');
      },
      blocked() {
        console.warn('Ivory database upgrade blocked by another tab.');
      },
      blocking() {
        console.warn('Ivory database is being upgraded in another tab.');
      },
      terminated() {
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

export function makeProject(name: string, options: Partial<Project> = {}): Project {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: name.trim() || 'Untitled project',
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    consentFace: false,
    consentAiSearch: false,
    storeOriginals: true,
    settings: { ...DEFAULT_PROJECT_SETTINGS },
    ...options,
  };
}

export async function listProjects(): Promise<Project[]> {
  const db = await getDB();
  const projects = await db.getAllFromIndex('projects', 'by-updated');
  return projects.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
}

export async function getProject(id: string): Promise<Project | undefined> {
  const db = await getDB();
  return db.get('projects', id);
}

export async function saveProject(project: Project): Promise<void> {
  const db = await getDB();
  await db.put('projects', { ...project, updatedAt: Date.now() });
}

export async function deleteProjectData(projectId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(
    ['projects', 'photos', 'assets', 'faces', 'people', 'groups', 'events', 'embeddings'],
    'readwrite',
  );
  await Promise.all([
    deleteIndexValues(tx.objectStore('photos').index('by-project'), projectId),
    deleteIndexValues(tx.objectStore('assets').index('by-project'), projectId),
    deleteIndexValues(tx.objectStore('faces').index('by-project'), projectId),
    deleteIndexValues(tx.objectStore('people').index('by-project'), projectId),
    deleteIndexValues(tx.objectStore('groups').index('by-project'), projectId),
    deleteIndexValues(tx.objectStore('events').index('by-project'), projectId),
    deleteIndexValues(tx.objectStore('embeddings').index('by-project'), projectId),
    tx.objectStore('projects').delete(projectId),
  ]);
  await tx.done;
}

async function deleteIndexValues(index: any, value: IDBValidKey): Promise<void> {
  let cursor = await index.openCursor(IDBKeyRange.only(value));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
}

export async function wipeDatabase(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(
    ['projects', 'photos', 'assets', 'faces', 'people', 'groups', 'events', 'embeddings'],
    'readwrite',
  );
  await Promise.all([
    tx.objectStore('projects').clear(),
    tx.objectStore('photos').clear(),
    tx.objectStore('assets').clear(),
    tx.objectStore('faces').clear(),
    tx.objectStore('people').clear(),
    tx.objectStore('groups').clear(),
    tx.objectStore('events').clear(),
    tx.objectStore('embeddings').clear(),
  ]);
  await tx.done;
}

export async function getPhotos(projectId: string): Promise<Photo[]> {
  const db = await getDB();
  const photos = await db.getAllFromIndex('photos', 'by-project', projectId);
  return photos.sort((a, b) => {
    const at = a.capturedAt ?? a.addedAt;
    const bt = b.capturedAt ?? b.addedAt;
    return at - bt;
  });
}

export async function getPhoto(id: string): Promise<Photo | undefined> {
  const db = await getDB();
  return db.get('photos', id);
}

export async function putPhotos(photos: Photo[]): Promise<void> {
  if (!photos.length) return;
  const db = await getDB();
  const tx = db.transaction('photos', 'readwrite');
  for (const photo of photos) tx.store.put(photo);
  await tx.done;
}

export async function deletePhotos(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await getDB();
  const tx = db.transaction(['photos', 'assets', 'faces', 'embeddings'], 'readwrite');
  for (const id of ids) {
    tx.objectStore('photos').delete(id);
    tx.objectStore('embeddings').delete(id);
    const assetCursor = await tx.objectStore('assets').index('by-photo').openCursor(IDBKeyRange.only(id));
    let cursor = assetCursor;
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    const faceCursor = await tx.objectStore('faces').index('by-photo').openCursor(IDBKeyRange.only(id));
    let faces = faceCursor;
    while (faces) {
      await faces.delete();
      faces = await faces.continue();
    }
  }
  await tx.done;
}

export async function putAsset(asset: AssetRecord): Promise<void> {
  const db = await getDB();
  await db.put('assets', asset);
}

export async function getAsset(id: string): Promise<AssetRecord | undefined> {
  const db = await getDB();
  return db.get('assets', id);
}

export async function deleteAsset(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('assets', id);
}

export async function getProjectAssetSizes(projectId: string): Promise<{
  total: number;
  original: number;
  preview: number;
  thumb: number;
  face: number;
  count: number;
}> {
  const db = await getDB();
  let original = 0;
  let preview = 0;
  let thumb = 0;
  let face = 0;
  let count = 0;
  let cursor = await db.transaction('assets').store.index('by-project').openCursor(IDBKeyRange.only(projectId));
  while (cursor) {
    const asset = cursor.value;
    count += 1;
    if (asset.kind === 'original') original += asset.size;
    else if (asset.kind === 'preview') preview += asset.size;
    else if (asset.kind === 'thumb') thumb += asset.size;
    else face += asset.size;
    cursor = await cursor.continue();
  }
  return { total: original + preview + thumb + face, original, preview, thumb, face, count };
}

export async function getFaces(projectId: string): Promise<Face[]> {
  const db = await getDB();
  return db.getAllFromIndex('faces', 'by-project', projectId);
}

export async function getFacesForPhoto(photoId: string): Promise<Face[]> {
  const db = await getDB();
  return db.getAllFromIndex('faces', 'by-photo', photoId);
}

export async function putFaces(faces: Face[]): Promise<void> {
  if (!faces.length) return;
  const db = await getDB();
  const tx = db.transaction('faces', 'readwrite');
  for (const face of faces) tx.store.put(face);
  await tx.done;
}

export async function deleteFace(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('faces', id);
}

export async function deleteFacesForPhoto(photoId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('faces', 'readwrite');
  let cursor = await tx.store.index('by-photo').openCursor(IDBKeyRange.only(photoId));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function deleteAssetsForPhoto(photoId: string, kinds?: AssetRecord['kind'][]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('assets', 'readwrite');
  let cursor = await tx.store.index('by-photo').openCursor(IDBKeyRange.only(photoId));
  while (cursor) {
    if (!kinds || kinds.includes(cursor.value.kind)) await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function clearFacesAndPeople(projectId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['faces', 'people', 'assets'], 'readwrite');
  await Promise.all([
    deleteIndexValues(tx.objectStore('faces').index('by-project'), projectId),
    deleteIndexValues(tx.objectStore('people').index('by-project'), projectId),
    deleteIndexValues(tx.objectStore('assets').index('by-project-kind'), [projectId, 'face']),
  ]);
  await tx.done;
}

export async function clearOriginalAssets(projectId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('assets', 'readwrite');
  await deleteIndexValues(tx.store.index('by-project-kind'), [projectId, 'original']);
  await tx.done;
}

export async function getPeople(projectId: string): Promise<Person[]> {
  const db = await getDB();
  const people = await db.getAllFromIndex('people', 'by-project', projectId);
  return people.sort((a, b) => b.faceCount - a.faceCount || a.createdAt - b.createdAt);
}

export async function putPeople(people: Person[]): Promise<void> {
  if (!people.length) return;
  const db = await getDB();
  const tx = db.transaction('people', 'readwrite');
  for (const person of people) tx.store.put(person);
  await tx.done;
}

export async function deletePerson(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('people', id);
}

export async function getPeopleByIds(ids: string[]): Promise<Person[]> {
  const db = await getDB();
  const tx = db.transaction('people');
  const people = await Promise.all(ids.map((id) => tx.store.get(id)));
  return people.filter((person): person is Person => Boolean(person));
}

export async function getGroups(projectId: string): Promise<PhotoGroup[]> {
  const db = await getDB();
  return db.getAllFromIndex('groups', 'by-project', projectId);
}

export async function replaceGroups(projectId: string, groups: PhotoGroup[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('groups', 'readwrite');
  let cursor = await tx.store.index('by-project').openCursor(IDBKeyRange.only(projectId));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  for (const group of groups) tx.store.put(group);
  await tx.done;
}

export async function getEvents(projectId: string): Promise<EventRecord[]> {
  const db = await getDB();
  const events = await db.getAllFromIndex('events', 'by-project', projectId);
  return events.sort((a, b) => a.start - b.start);
}

export async function replaceEvents(projectId: string, events: EventRecord[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('events', 'readwrite');
  let cursor = await tx.store.index('by-project').openCursor(IDBKeyRange.only(projectId));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  for (const event of events) tx.store.put(event);
  await tx.done;
}

export async function putEvent(event: EventRecord): Promise<void> {
  const db = await getDB();
  await db.put('events', event);
}

export async function putEmbedding(record: EmbeddingRecord): Promise<void> {
  const db = await getDB();
  await db.put('embeddings', record);
}

export async function getEmbeddings(projectId: string): Promise<EmbeddingRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('embeddings', 'by-project', projectId);
}

export async function deleteEmbeddings(projectId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('embeddings', 'readwrite');
  let cursor = await tx.store.index('by-project').openCursor(IDBKeyRange.only(projectId));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function getContentHashes(projectId: string): Promise<Map<string, string>> {
  const photos = await getPhotos(projectId);
  return new Map(photos.map((photo) => [photo.contentHash, photo.id]));
}

export async function updateProjectTimestamps(projectId: string): Promise<void> {
  const project = await getProject(projectId);
  if (!project) return;
  await saveProject({ ...project, updatedAt: Date.now() });
}
