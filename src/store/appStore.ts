import { create } from 'zustand';
import type {
  AiIndexState,
  AlbumCategory,
  AlbumDraft,
  AppSettings,
  AppToast,
  EventRecord,
  Face,
  ImportStats,
  Person,
  PersonRole,
  Photo,
  PhotoFilters,
  PhotoGroup,
  ProcessingState,
  Project,
  StorageState,
} from '@/types';
import {
  ALBUM_CATEGORIES,
  PERSON_COLORS,
} from '@/lib/constants';
import {
  clearAssetUrlCache,
  clearSessionBlobs,
  pruneSessionBlobs,
  registerSessionBlob,
  storeAsset,
} from '@/lib/assets';
import {
  clearFacesAndPeople,
  clearOriginalAssets,
  deleteEmbeddings,
  deletePerson as deletePersonRecord,
  deleteProjectData,
  getEmbeddings,
  getEvents,
  getFaces,
  getGroups,
  getPeople,
  getPhotos,
  getProject,
  listProjects,
  makeProject,
  putEmbedding,
  putFaces,
  putPeople,
  putPhotos,
  saveProject,
  wipeDatabase,
} from '@/lib/db';
import {
  clusterDescriptors,
  normaliseVector,
} from '@/lib/clustering';
import { deriveAlbumCategory } from '@/lib/categories';
import { summarizeFaces } from '@/lib/faceMetrics';
import { EMPTY_FACE_SUMMARY } from '@/lib/quality';
import { curateSelection } from '@/lib/selection';
import { formatCount, formatDate, unique } from '@/lib/utils';
import {
  ingestSources,
  hashBlob,
  type CollectedSources,
  type ImportProgressSnapshot,
  type IngestResult,
} from '@/lib/import';
import {
  LibraryProcessor,
  type ProcessorCallbacks,
  type ProcessingSummary,
} from '@/lib/processor';
import { ClipController, type ClipStatus } from '@/lib/visualSearch';

const SETTINGS_KEY = 'ivory.settings';
const LAST_PROJECT_KEY = 'ivory.lastProject';
const ALBUM_PREFIX = 'ivory.album.';

let activeProcessor: LibraryProcessor | null = null;
let importController: AbortController | null = null;
let clipController: ClipController | null = null;
let aiIndexController: AbortController | null = null;
let persistenceToastShown = false;

export interface UndoRecord {
  label: string;
  run: () => Promise<void> | void;
}

export interface RelinkProgress {
  done: number;
  total: number;
  matched: number;
  unmatched: number;
  failed: number;
  currentName: string;
}

export interface RelinkResult {
  matched: number;
  unmatched: number;
  failed: number;
  cancelled: boolean;
}

export interface AppStore {
  booted: boolean;
  bootError: string | null;
  loadingProject: boolean;
  projects: Project[];
  project: Project | null;
  photos: Photo[];
  people: Person[];
  faces: Face[];
  groups: PhotoGroup[];
  events: EventRecord[];
  embeddings: Map<string, Float32Array>;
  processing: ProcessingState;
  ai: AiIndexState;
  settings: AppSettings;
  filters: PhotoFilters;
  compareIds: string[];
  album: AlbumDraft;
  importActive: boolean;
  importProgress: ImportProgressSnapshot;
  toasts: AppToast[];
  storage: StorageState;
  undo: UndoRecord | null;

  bootstrap: () => Promise<void>;
  openProject: (id: string) => Promise<void>;
  closeProject: () => void;
  createProject: (input: {
    name: string;
    coupleNames?: string;
    eventDate?: string;
    venue?: string;
    consentFace?: boolean;
    consentAiSearch?: boolean;
    storeOriginals?: boolean;
  }) => Promise<Project | null>;
  updateProject: (patch: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  refreshProjectData: () => Promise<void>;
  refreshStorage: () => Promise<void>;
  requestPersistence: () => Promise<void>;

  importSources: (sources: CollectedSources) => Promise<IngestResult | null>;
  cancelImport: () => void;

  startProcessing: () => Promise<ProcessingSummary | null>;
  reorganise: () => Promise<ProcessingSummary | null>;
  pauseProcessing: () => void;
  resumeProcessing: () => void;
  cancelProcessing: () => void;

  updatePhoto: (id: string, patch: Partial<Photo>) => Promise<void>;
  applyPhotoPatch: (
    ids: string[],
    patch: Partial<Photo>,
    options?: { label?: string; toastTitle?: string; undo?: boolean },
  ) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  toggleSelected: (id: string) => Promise<void>;
  toggleRejected: (id: string) => Promise<void>;
  setRating: (id: string, rating: number) => Promise<void>;
  setNotes: (id: string, notes: string) => Promise<void>;
  setCategory: (id: string, category: AlbumCategory | undefined) => Promise<void>;
  selectAll: (ids: string[]) => Promise<void>;
  clearSelection: () => Promise<void>;
  undoLast: () => Promise<void>;

  renamePerson: (id: string, name: string) => Promise<void>;
  setPersonRole: (id: string, role: PersonRole) => Promise<void>;
  mergePeople: (sourceId: string, targetId: string) => Promise<void>;
  removePerson: (id: string) => Promise<void>;
  rebuildPeople: () => Promise<void>;
  refreshPeopleStats: () => Promise<void>;

  addCompare: (ids: string[]) => void;
  removeCompare: (id: string) => void;
  clearCompare: () => void;

  setAlbum: (patch: Partial<AlbumDraft>) => void;
  curateAlbum: () => { ids: string[]; reasons: Record<string, string>; skippedSimilar: number } | null;
  applyAlbumCuration: () => Promise<void>;
  addToAlbum: (ids: string[]) => Promise<void>;
  removeFromAlbum: (ids: string[]) => Promise<void>;

  indexVisualSearch: () => Promise<void>;
  cancelVisualIndexing: () => void;
  queryVisual: (text: string) => Promise<Float32Array | null>;
  disposeVisualSearch: () => void;
  deleteFaceData: () => Promise<void>;
  deleteStoredOriginals: () => Promise<void>;
  deleteVisualIndex: () => Promise<void>;
  relinkOriginals: (
    files: File[],
    options?: { signal?: AbortSignal; onProgress?: (progress: RelinkProgress) => void },
  ) => Promise<RelinkResult>;

  setFilters: (patch: Partial<PhotoFilters>) => void;
  resetFilters: () => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  pushToast: (toast: Omit<AppToast, 'id'>) => string;
  dismissToast: (id: string) => void;
  resetAllData: () => Promise<void>;
}

function readSettings(): AppSettings {
  const defaults: AppSettings = {
    theme:
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light',
    sidebarCollapsed: false,
    gridDensity: 'comfortable',
    onboardingDismissed: false,
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return defaults;
  }
}

function persistSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage may be unavailable in private windows; settings stay in memory.
  }
}

export function applyTheme(theme: AppSettings['theme']): void {
  if (typeof document === 'undefined') return;
  const dark = theme === 'dark';
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.classList.toggle('light', !dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#12110f' : '#faf9f6');
  try {
    localStorage.setItem('ivory.theme', theme);
  } catch {
    // Ignore storage failures.
  }
}

function defaultFilters(): PhotoFilters {
  return {
    search: '',
    peopleIds: [],
    peopleMode: 'all',
    categories: [],
    smart: [],
    flags: [],
    tags: [],
    eventId: null,
    groupType: null,
    minRating: 0,
    orientation: 'all',
    onlySelected: false,
    onlyFavorites: false,
    onlyRejected: false,
    hideRejected: true,
    onlyUnreviewed: false,
    minScore: 0,
    sort: 'quality',
  };
}

function emptyProcessing(): ProcessingState {
  return {
    running: false,
    paused: false,
    stage: 'idle',
    total: 0,
    completed: 0,
    currentName: '',
    startedAt: null,
    etaMs: null,
    errors: 0,
  };
}

function emptyAi(): AiIndexState {
  return {
    status: 'idle',
    total: 0,
    completed: 0,
    message: 'Visual search is optional and runs entirely on this device.',
    modelReady: false,
  };
}

function emptyImport(): ImportProgressSnapshot {
  return {
    phase: 'idle',
    totalFiles: 0,
    processed: 0,
    imported: 0,
    duplicates: 0,
    skipped: 0,
    failed: 0,
    bytesTotal: 0,
    bytesProcessed: 0,
    currentName: '',
  };
}

function defaultAlbum(project: Project | null): AlbumDraft {
  return {
    target: 120,
    title: project?.coupleNames?.trim() || project?.name || 'Our album',
    subtitle: project?.eventDate ? formatDate(Date.parse(`${project.eventDate}T12:00:00`)) : '',
    notes: '',
    categories: ALBUM_CATEGORIES.map((category) => category.id),
    diversifyEvents: true,
    includeFavorites: true,
    lastCuration: null,
  };
}

function loadAlbum(project: Project): AlbumDraft {
  const fallback = defaultAlbum(project);
  try {
    const raw = localStorage.getItem(`${ALBUM_PREFIX}${project.id}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<AlbumDraft>;
    return {
      ...fallback,
      ...parsed,
      categories: Array.isArray(parsed.categories) && parsed.categories.length ? parsed.categories : fallback.categories,
      lastCuration: parsed.lastCuration ?? null,
    };
  } catch {
    return fallback;
  }
}

function persistAlbum(projectId: string, album: AlbumDraft): void {
  try {
    localStorage.setItem(`${ALBUM_PREFIX}${projectId}`, JSON.stringify(album));
  } catch {
    // Album drafts are a convenience; the project itself is unaffected.
  }
}

function mergeById<T extends { id: string }>(current: T[], updates: T[], removed?: string[]): T[] {
  if (!updates.length && !removed?.length) return current;
  const removedSet = new Set(removed ?? []);
  const map = new Map(current.map((item) => [item.id, item]));
  for (const id of removedSet) map.delete(id);
  for (const update of updates) map.set(update.id, update);
  return Array.from(map.values());
}

function summaryEqual(a: Photo['faces'], b: Photo['faces']): boolean {
  return (
    a.faceCount === b.faceCount &&
    a.smilingCount === b.smilingCount &&
    a.eyesClosedCount === b.eyesClosedCount &&
    a.lookingCount === b.lookingCount &&
    Math.abs(a.maxFaceArea - b.maxFaceArea) < 1e-6 &&
    Math.abs(a.avgFaceScore - b.avgFaceScore) < 1e-4 &&
    Math.abs(a.avgSmile - b.avgSmile) < 1e-4 &&
    Math.abs(a.avgFaceSharpness - b.avgFaceSharpness) < 1e-4 &&
    Math.abs(a.avgFaceX - b.avgFaceX) < 1e-4 &&
    Math.abs(a.avgFaceY - b.avgFaceY) < 1e-4
  );
}

function recomputeDerivedPeople(
  people: Person[],
  faces: Face[],
  photos: Photo[],
): { people: Person[]; removed: string[]; photos: Photo[] } {
  const byPerson = new Map<string, Face[]>();
  const byPhoto = new Map<string, Face[]>();
  for (const face of faces) {
    if (face.ignored) continue;
    const photoList = byPhoto.get(face.photoId);
    if (photoList) photoList.push(face);
    else byPhoto.set(face.photoId, [face]);
    if (!face.personId) continue;
    const list = byPerson.get(face.personId);
    if (list) list.push(face);
    else byPerson.set(face.personId, [face]);
  }

  const removed: string[] = [];
  const nextPeople: Person[] = [];
  for (const person of people) {
    const list = byPerson.get(person.id) ?? [];
    if (!list.length) {
      const autoNamed = /^Person \d+$/.test(person.name.trim()) || !person.name.trim();
      if (autoNamed && person.role === 'other') {
        removed.push(person.id);
        continue;
      }
      nextPeople.push({ ...person, faceCount: 0, centroid: null });
      continue;
    }
    const length = list[0].descriptor.length;
    const centroid = new Float32Array(length);
    for (const face of list) {
      for (let i = 0; i < length; i += 1) centroid[i] += face.descriptor[i];
    }
    const cover = list.reduce((best, face) => (face.faceScore > best.faceScore ? face : best), list[0]);
    nextPeople.push({
      ...person,
      faceCount: list.length,
      centroid: normaliseVector(centroid),
      coverFaceId: cover.id,
      updatedAt: Date.now(),
    });
  }

  const photoUpdates: Photo[] = [];
  for (const photo of photos) {
    const list = byPhoto.get(photo.id) ?? [];
    const summary = summarizeFaces(
      list.map((face) => ({
        box: face.box,
        smile: face.smile,
        eyesOpen: face.eyesOpen,
        lookingAtCamera: face.lookingAtCamera,
        faceSharpness: face.faceSharpness,
        faceScore: face.faceScore,
      })),
    );
    const personIds = unique(
      list.map((face) => face.personId).filter((id): id is string => Boolean(id)),
    );
    const sameIds = photo.personIds.length === personIds.length && photo.personIds.every((id) => personIds.includes(id));
    if (!sameIds || !summaryEqual(photo.faces ?? EMPTY_FACE_SUMMARY, summary)) {
      photoUpdates.push({ ...photo, faces: summary, personIds, updatedAt: Date.now() });
    }
  }

  return { people: nextPeople, removed, photos: photoUpdates };
}

function recomputeCategories(
  photos: Photo[],
  people: Person[],
  events: EventRecord[],
): Photo[] {
  const roles = new Map(people.map((person) => [person.id, person.role]));
  const eventsById = new Map(events.map((event) => [event.id, event]));
  const updates: Photo[] = [];
  for (const photo of photos) {
    if (photo.categoryManual) continue;
    const category = deriveAlbumCategory(
      photo,
      roles,
      photo.eventId ? eventsById.get(photo.eventId) : undefined,
    );
    if (category !== photo.category) updates.push({ ...photo, category, updatedAt: Date.now() });
  }
  return updates;
}

function clipStatusToAi(status: ClipStatus): Partial<AiIndexState> {
  if (status.state === 'ready') {
    return { modelReady: true, message: status.message };
  }
  if (status.state === 'loading') {
    return { modelReady: false, message: status.message };
  }
  if (status.state === 'error') {
    return { status: 'error', modelReady: false, message: status.message };
  }
  return { modelReady: false, message: status.message };
}

export const useAppStore = create<AppStore>()((set, get) => {
  const applyPatch = async (
    ids: string[],
    patch: Partial<Photo>,
    options: { label?: string; toastTitle?: string; undo?: boolean } = {},
  ) => {
    if (!ids.length) return;
    const wanted = new Set(ids);
    const current = get().photos;
    const affected = current.filter((photo) => wanted.has(photo.id));
    if (!affected.length) return;
    const previous = options.undo === false ? null : affected.map((photo) => ({ ...photo }));
    const updated = affected.map((photo) => ({ ...photo, ...patch, updatedAt: Date.now() }));
    const byId = new Map(updated.map((photo) => [photo.id, photo]));
    const nextPhotos = current.map((photo) => byId.get(photo.id) ?? photo);
    set({ photos: nextPhotos });
    await putPhotos(updated);

    if (previous) {
      const undoRecord: UndoRecord = {
        label: options.label ?? 'Change',
        run: async () => {
          const map = new Map(previous.map((photo) => [photo.id, photo]));
          set({
            photos: get().photos.map((photo) => map.get(photo.id) ?? photo),
            undo: null,
          });
          await putPhotos(previous);
          get().pushToast({ title: 'Change undone', tone: 'default', duration: 2600 });
        },
      };
      set({ undo: undoRecord });
    }

    if (options.toastTitle) {
      get().pushToast({
        title: options.toastTitle,
        tone: 'default',
        duration: previous ? 6500 : 3200,
        action: previous ? { label: 'Undo', run: () => void get().undoLast() } : undefined,
      });
    }
  };

  const toast = (title: string, description?: string, tone: AppToast['tone'] = 'default') => {
    get().pushToast({ title, description, tone });
  };

  const ensureClipController = (): ClipController => {
    if (!clipController) {
      const ortBaseUrl = new URL('ort/', document.baseURI).href;
      clipController = new ClipController(ortBaseUrl);
      clipController.setStatusListener((status) => {
        set((state) => ({
          ai: {
            ...state.ai,
            ...clipStatusToAi(status),
            status:
              status.state === 'error'
                ? 'error'
                : state.ai.status === 'indexing'
                  ? 'indexing'
                  : state.ai.status,
          },
        }));
      });
    }
    return clipController;
  };

  return {
    booted: false,
    bootError: null,
    loadingProject: false,
    projects: [],
    project: null,
    photos: [],
    people: [],
    faces: [],
    groups: [],
    events: [],
    embeddings: new Map(),
    processing: emptyProcessing(),
    ai: emptyAi(),
    settings: readSettings(),
    filters: defaultFilters(),
    compareIds: [],
    album: defaultAlbum(null),
    importActive: false,
    importProgress: emptyImport(),
    toasts: [],
    storage: { usage: 0, quota: 0, persisted: false, supported: false },
    undo: null,

    bootstrap: async () => {
      const settings = readSettings();
      applyTheme(settings.theme);
      set({ settings });
      try {
        const projects = await listProjects();
        set({ projects, booted: true });
        const last = localStorage.getItem(LAST_PROJECT_KEY);
        if (last) {
          await get().openProject(last).catch(() => {
            localStorage.removeItem(LAST_PROJECT_KEY);
          });
        }
      } catch (error) {
        set({
          booted: true,
          bootError: error instanceof Error ? error.message : 'Could not open the local database.',
        });
      }
    },

    openProject: async (id) => {
      set({ loadingProject: true });
      activeProcessor?.cancel();
      activeProcessor = null;
      try {
        const project = await getProject(id);
        if (!project) throw new Error('This project no longer exists.');
        const [photos, people, faces, groups, events, embeddings] = await Promise.all([
          getPhotos(id),
          getPeople(id),
          getFaces(id),
          getGroups(id),
          getEvents(id),
          getEmbeddings(id),
        ]);
        clearAssetUrlCache();
        pruneSessionBlobs(new Set(photos.map((photo) => photo.id)));
        set({
          project,
          photos,
          people,
          faces,
          groups,
          events,
          embeddings: new Map(embeddings.map((record) => [record.photoId, record.vector])),
          album: loadAlbum(project),
          filters: defaultFilters(),
          processing: emptyProcessing(),
          ai: {
            ...emptyAi(),
            message: embeddings.length
              ? `${formatCount(embeddings.length)} photos already have visual embeddings.`
              : emptyAi().message,
          },
          compareIds: [],
          undo: null,
          loadingProject: false,
        });
        localStorage.setItem(LAST_PROJECT_KEY, id);
        await saveProject({ ...project, lastOpenedAt: Date.now() });
        await get().refreshStorage();
      } catch (error) {
        set({ loadingProject: false });
        toast(
          'Could not open project',
          error instanceof Error ? error.message : 'Unknown error.',
          'danger',
        );
      }
    },

    closeProject: () => {
      activeProcessor?.cancel();
      activeProcessor = null;
      importController?.abort();
      aiIndexController?.abort();
      clearSessionBlobs();
      clearAssetUrlCache();
      localStorage.removeItem(LAST_PROJECT_KEY);
      set({
        project: null,
        photos: [],
        people: [],
        faces: [],
        groups: [],
        events: [],
        embeddings: new Map(),
        compareIds: [],
        processing: emptyProcessing(),
        ai: emptyAi(),
        filters: defaultFilters(),
        album: defaultAlbum(null),
        undo: null,
      });
    },

    createProject: async (input) => {
      try {
        const project = makeProject(input.name, {
          coupleNames: input.coupleNames,
          eventDate: input.eventDate,
          venue: input.venue,
          consentFace: input.consentFace ?? false,
          consentAiSearch: input.consentAiSearch ?? false,
          storeOriginals: input.storeOriginals ?? true,
        });
        await saveProject(project);
        set({ projects: await listProjects() });
        await get().openProject(project.id);
        await get().requestPersistence();
        return project;
      } catch (error) {
        toast('Could not create project', error instanceof Error ? error.message : undefined, 'danger');
        return null;
      }
    },

    updateProject: async (patch) => {
      const project = get().project;
      if (!project) return;
      const next: Project = {
        ...project,
        ...patch,
        settings: patch.settings ? { ...project.settings, ...patch.settings } : project.settings,
      };
      await saveProject(next);
      set({ project: next });
      if (patch.consentFace === true && !project.consentFace) {
        const pending = get()
          .photos.filter((photo) => photo.faceStatus === 'skipped')
          .map((photo) => ({ ...photo, faceStatus: 'pending' as const, updatedAt: Date.now() }));
        if (pending.length) {
          set({ photos: mergeById(get().photos, pending) });
          await putPhotos(pending);
        }
      }
      set({ projects: await listProjects() });
    },

    deleteProject: async (id) => {
      await deleteProjectData(id);
      localStorage.removeItem(`${ALBUM_PREFIX}${id}`);
      if (get().project?.id === id) {
        get().closeProject();
      }
      set({ projects: await listProjects() });
      toast('Project deleted', 'All photos, previews and analysis for this project were removed from this device.', 'success');
      await get().refreshStorage();
    },

    refreshProjectData: async () => {
      const project = get().project;
      if (!project) return;
      const [photos, people, faces, groups, events, embeddings] = await Promise.all([
        getPhotos(project.id),
        getPeople(project.id),
        getFaces(project.id),
        getGroups(project.id),
        getEvents(project.id),
        getEmbeddings(project.id),
      ]);
      pruneSessionBlobs(new Set(photos.map((photo) => photo.id)));
      set((state) => ({
        photos,
        people,
        faces,
        groups,
        events,
        embeddings: new Map(embeddings.map((record) => [record.photoId, record.vector])),
        ai: {
          ...state.ai,
          message:
            state.ai.status === 'ready'
              ? state.ai.message
              : embeddings.length
                ? `${formatCount(embeddings.length)} photos have visual embeddings.`
                : state.ai.message,
        },
      }));
    },

    refreshStorage: async () => {
      if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
        set({ storage: { usage: 0, quota: 0, persisted: false, supported: false } });
        return;
      }
      try {
        const estimate = await navigator.storage.estimate();
        const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
        set({
          storage: {
            usage: estimate.usage ?? 0,
            quota: estimate.quota ?? 0,
            persisted,
            supported: true,
          },
        });
      } catch {
        set({ storage: { usage: 0, quota: 0, persisted: false, supported: false } });
      }
    },

    requestPersistence: async () => {
      try {
        if (navigator.storage?.persist) {
          const granted = await navigator.storage.persist();
          if (granted && !persistenceToastShown) {
            persistenceToastShown = true;
            toast('Offline storage protected', 'The browser will keep this project on your device without automatic eviction.', 'success');
          }
        }
      } catch {
        // Not fatal: the browser may still keep data without a persistent grant.
      }
      await get().refreshStorage();
    },

    importSources: async (sources) => {
      const project = get().project;
      if (!project) {
        toast('Create a project first', 'Ivory needs a project before it can import photographs.', 'danger');
        return null;
      }
      if (get().importActive) return null;
      if (get().processing.running) {
        toast('Processing is still running', 'Pause or wait for the current analysis before importing more photographs.', 'default');
        return null;
      }
      if (!sources.files.length && !sources.zips.length) {
        toast('No photographs found', 'Drop JPG, PNG, WebP, AVIF, GIF or BMP files, or a ZIP archive containing them.', 'default');
        return null;
      }

      const controller = new AbortController();
      importController = controller;
      set({
        importActive: true,
        importProgress: {
          ...emptyImport(),
          phase: 'reading',
          totalFiles: sources.files.length,
          bytesTotal:
            sources.files.reduce((sum, item) => sum + item.blob.size, 0) +
            sources.zips.reduce((sum, zip) => sum + zip.size, 0),
        },
      });

      const existingHashes = new Map(get().photos.map((photo) => [photo.contentHash, photo.id]));
      let pendingPhotos: Photo[] = [];
      let lastFlush = 0;

      const flush = async (force = false) => {
        if (!pendingPhotos.length) return;
        if (!force && pendingPhotos.length < 8 && Date.now() - lastFlush < 750) return;
        const batch = pendingPhotos;
        pendingPhotos = [];
        lastFlush = Date.now();
        await putPhotos(batch);
        set((state) => ({ photos: mergeById(state.photos, batch) }));
      };

      try {
        await get().requestPersistence();
        const result = await ingestSources(sources, {
          projectId: project.id,
          existingHashes,
          consentFace: project.consentFace,
          signal: controller.signal,
          onPhoto: async (photo, blob) => {
            registerSessionBlob(photo.id, blob);
            pendingPhotos.push(photo);
            await flush();
          },
          onProgress: (snapshot) => {
            set({ importProgress: snapshot });
          },
        });
        await flush(true);
        set({ importActive: false });

        const stats = result.stats;
        if (stats.imported === 0) {
          toast(
            result.cancelled ? 'Import stopped' : 'Nothing new to import',
            stats.duplicates
              ? `${formatCount(stats.duplicates)} duplicates were skipped.`
              : stats.failed
                ? `${stats.failed} files could not be read.`
                : 'No supported photographs were found.',
            result.cancelled ? 'default' : 'danger',
          );
        } else {
          const parts = [
            stats.duplicates ? `${formatCount(stats.duplicates)} duplicates skipped` : '',
            stats.skipped ? `${formatCount(stats.skipped)} unsupported files skipped` : '',
            stats.failed ? `${formatCount(stats.failed)} failed` : '',
          ].filter(Boolean);
          get().pushToast({
            title: `${formatCount(stats.imported)} photographs imported`,
            description: parts.length ? parts.join(' · ') : 'Analysis will begin automatically.',
            tone: 'success',
            duration: 5200,
          });
          void get().startProcessing();
        }
        await get().refreshStorage();
        await get().refreshProjectData();
        return result;
      } catch (error) {
        set({ importActive: false });
        toast(
          'Import failed',
          error instanceof Error ? error.message : 'The photographs could not be imported.',
          'danger',
        );
        return null;
      } finally {
        await flush(true).catch(() => {});
        importController = null;
      }
    },

    cancelImport: () => {
      importController?.abort();
      set((state) => ({
        importProgress: { ...state.importProgress, phase: 'cancelled', message: 'Stopping import…' },
      }));
    },

    startProcessing: async () => {
      const { project, photos, people, faces, events, processing, ai } = get();
      if (!project || processing.running) return null;
      if (!photos.length) {
        toast('No photographs yet', 'Import photographs to begin analysis.', 'default');
        return null;
      }
      if (ai.status === 'indexing') {
        toast('Visual indexing is running', 'Cancel visual indexing before running the quality analysis.', 'default');
        return null;
      }

      set({
        processing: {
          ...emptyProcessing(),
          running: true,
          stage: 'analysing',
          startedAt: Date.now(),
        },
        undo: null,
      });

      const callbacks: ProcessorCallbacks = {
        onPhotos: (updates) => {
          set((state) => ({ photos: mergeById(state.photos, updates) }));
        },
        onFaces: (added, removed) => {
          set((state) => ({ faces: mergeById(state.faces, added, removed) }));
        },
        onPeople: (updates, removed) => {
          set((state) => ({ people: mergeById(state.people, updates, removed) }));
        },
        onGroups: (groups) => set({ groups }),
        onEvents: (nextEvents) => set({ events: nextEvents }),
        onProgress: (patch) => set((state) => ({ processing: { ...state.processing, ...patch } })),
        onWarning: (title, description) => get().pushToast({ title, description, tone: 'danger', duration: 9000 }),
      };

      const processor = new LibraryProcessor(project, photos, people, faces, events, callbacks);
      activeProcessor = processor;
      try {
        const summary = await processor.start();
        const currentProject = get().project;
        if (currentProject?.id === project.id) {
          await get().refreshProjectData();
          await saveProject({ ...currentProject, updatedAt: Date.now() });
          set({ project: { ...currentProject, updatedAt: Date.now() }, projects: await listProjects() });
          const state = get();
          if (summary.cancelled) {
            toast(
              'Processing stopped',
              `${formatCount(summary.analysed)} photographs were analysed. Your photos are safe and nothing was removed.`,
              'default',
            );
          } else if (summary.errors > 0) {
            toast(
              'Library organised with some issues',
              `${formatCount(summary.errors)} photographs could not be fully processed. Open their details to retry or relink.`,
              'danger',
            );
          } else {
            toast(
              'Library ready',
              `${formatCount(summary.analysed)} analysed · ${formatCount(state.groups.length)} similar sets · ${formatCount(state.events.length)} moments.`,
              'success',
            );
          }
        }
        await get().refreshStorage();
        return summary;
      } catch (error) {
        toast(
          'Processing failed',
          error instanceof Error ? error.message : 'The analysis could not finish.',
          'danger',
        );
        return null;
      } finally {
        if (activeProcessor === processor) activeProcessor = null;
        set((state) => ({
          processing: {
            ...state.processing,
            running: false,
            paused: false,
            stage: 'idle',
            currentName: '',
            etaMs: null,
          },
        }));
      }
    },

    reorganise: async () => get().startProcessing(),

    pauseProcessing: () => {
      activeProcessor?.pause();
      set((state) => ({ processing: { ...state.processing, paused: true } }));
    },

    resumeProcessing: () => {
      activeProcessor?.resume();
      set((state) => ({ processing: { ...state.processing, paused: false } }));
    },

    cancelProcessing: () => {
      activeProcessor?.cancel();
    },

    updatePhoto: async (id, patch) => {
      const photo = get().photos.find((item) => item.id === id);
      if (!photo) return;
      const next = { ...photo, ...patch, updatedAt: Date.now() };
      set((state) => ({ photos: state.photos.map((item) => (item.id === id ? next : item)) }));
      await putPhotos([next]);
    },

    applyPhotoPatch: async (ids, patch, options) => {
      await applyPatch(ids, patch, options);
    },

    toggleFavorite: async (id) => {
      const photo = get().photos.find((item) => item.id === id);
      if (!photo) return;
      await applyPatch([id], { favorite: !photo.favorite }, { label: 'Favourite', undo: true });
    },

    toggleSelected: async (id) => {
      const photo = get().photos.find((item) => item.id === id);
      if (!photo) return;
      await applyPatch([id], { selected: !photo.selected }, { label: 'Selection', undo: true });
    },

    toggleRejected: async (id) => {
      const photo = get().photos.find((item) => item.id === id);
      if (!photo) return;
      const rejected = !photo.rejected;
      await applyPatch(
        [id],
        { rejected, selected: rejected ? false : photo.selected },
        {
          label: rejected ? 'Mark photo as no' : 'Restore photo',
          undo: true,
          toastTitle: rejected
            ? 'Marked as not for the album'
            : 'Photo restored to the album pool',
        },
      );
    },

    setRating: async (id, rating) => {
      await applyPatch([id], { rating }, { label: 'Rating', undo: true });
    },

    setNotes: async (id, notes) => {
      await applyPatch([id], { notes }, { label: 'Note', undo: false });
    },

    setCategory: async (id, category) => {
      await applyPatch([id], { category, categoryManual: Boolean(category) }, { label: 'Category', undo: true });
    },

    selectAll: async (ids) => {
      await applyPatch(ids, { selected: true }, { label: 'Select photographs', undo: true });
    },

    clearSelection: async () => {
      const ids = get().photos.filter((photo) => photo.selected).map((photo) => photo.id);
      await applyPatch(ids, { selected: false }, { label: 'Clear selection', undo: true });
    },

    undoLast: async () => {
      const undo = get().undo;
      if (!undo) return;
      set({ undo: null });
      await undo.run();
    },

    renamePerson: async (id, name) => {
      const person = get().people.find((item) => item.id === id);
      if (!person) return;
      const next = { ...person, name: name.trim() || person.name, updatedAt: Date.now() };
      set((state) => ({ people: state.people.map((item) => (item.id === id ? next : item)) }));
      await putPeople([next]);
    },

    setPersonRole: async (id, role) => {
      const person = get().people.find((item) => item.id === id);
      if (!person) return;
      const next = { ...person, role, updatedAt: Date.now() };
      set((state) => ({ people: state.people.map((item) => (item.id === id ? next : item)) }));
      await putPeople([next]);
      const changed = recomputeCategories(get().photos, get().people, get().events);
      if (changed.length) {
        const byId = new Map(changed.map((photo) => [photo.id, photo]));
        set((state) => ({ photos: state.photos.map((photo) => byId.get(photo.id) ?? photo) }));
        await putPhotos(changed);
      }
    },

    mergePeople: async (sourceId, targetId) => {
      if (sourceId === targetId) return;
      const source = get().people.find((person) => person.id === sourceId);
      const target = get().people.find((person) => person.id === targetId);
      if (!source || !target) return;

      const changedFaces = get()
        .faces.filter((face) => face.personId === sourceId)
        .map((face) => ({ ...face, personId: targetId, updatedAt: Date.now() }));
      const nextFaces = mergeById(get().faces, changedFaces);
      const basePeople = get().people.filter((person) => person.id !== sourceId);
      const result = recomputeDerivedPeople(basePeople, nextFaces, get().photos);
      const isAutoName = (name: string | undefined): boolean =>
        !name?.trim() || /^Person \d+$/.test(name.trim());
      const mergedName = isAutoName(target.name) && !isAutoName(source.name) ? source.name : target.name;
      const peopleWithMergedTarget = result.people.map((person) =>
        person.id === targetId ? { ...person, name: mergedName } : person,
      );

      await putFaces(changedFaces);
      await putPeople(peopleWithMergedTarget);
      await deletePersonRecord(sourceId);
      if (result.photos.length) await putPhotos(result.photos);
      set((state) => ({
        faces: nextFaces,
        people: peopleWithMergedTarget,
        photos: mergeById(state.photos, result.photos),
      }));
      const changed = recomputeCategories(get().photos, get().people, get().events);
      if (changed.length) {
        const byId = new Map(changed.map((photo) => [photo.id, photo]));
        set((state) => ({ photos: state.photos.map((photo) => byId.get(photo.id) ?? photo) }));
        await putPhotos(changed);
      }
      toast('People merged', `${formatCount(source.faceCount)} faces now belong to ${mergedName}.`, 'success');
    },

    removePerson: async (id) => {
      const person = get().people.find((item) => item.id === id);
      if (!person) return;
      const changedFaces = get()
        .faces.filter((face) => face.personId === id)
        .map((face) => ({ ...face, personId: null, updatedAt: Date.now() }));
      const nextFaces = mergeById(get().faces, changedFaces);
      const basePeople = get().people.filter((item) => item.id !== id);
      const result = recomputeDerivedPeople(basePeople, nextFaces, get().photos);
      await putFaces(changedFaces);
      await putPeople(result.people);
      await deletePersonRecord(id);
      if (result.photos.length) await putPhotos(result.photos);
      set((state) => ({
        faces: nextFaces,
        people: result.people,
        photos: mergeById(state.photos, result.photos),
      }));
      toast('Person removed', 'Their faces are now unassigned. No photographs were deleted.', 'default');
    },

    rebuildPeople: async () => {
      const project = get().project;
      if (!project) return;
      const { people, faces, photos } = get();
      const autoIds = new Set(
        people
          .filter((person) => (/^Person \d+$/.test(person.name.trim()) || !person.name.trim()) && person.role === 'other')
          .map((person) => person.id),
      );
      const baseFaces = faces.map((face) =>
        face.personId && autoIds.has(face.personId)
          ? { ...face, personId: null, updatedAt: Date.now() }
          : face,
      );
      const candidates = baseFaces.filter((face) => !face.ignored && !face.personId && face.descriptor?.length);
      if (!candidates.length) {
        toast('Nothing to regroup', 'There are no unassigned faces to cluster.', 'default');
        return;
      }
      const clusters = clusterDescriptors(
        candidates.map((face) => face.descriptor),
        project.settings.faceClusterThreshold,
      );
      const nextPeople = people.filter((person) => !autoIds.has(person.id));
      const nextFaces = baseFaces.map((face) => ({ ...face }));
      let created = 0;
      for (const cluster of clusters) {
        const clusterFaces = cluster.indices
          .map((index) => candidates[index])
          .filter(Boolean);
        if (!clusterFaces.length) continue;
        const cover = clusterFaces.reduce((best, face) => (face.faceScore > best.faceScore ? face : best), clusterFaces[0]);
        const person: Person = {
          id: crypto.randomUUID(),
          projectId: project.id,
          name: `Person ${nextPeople.length + 1}`,
          role: 'other',
          coverFaceId: cover.id,
          faceCount: clusterFaces.length,
          centroid: cluster.centroid,
          color: PERSON_COLORS[(nextPeople.length + created) % PERSON_COLORS.length],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        created += 1;
        nextPeople.push(person);
        for (const face of clusterFaces) {
          const target = nextFaces.find((item) => item.id === face.id);
          if (target) {
            target.personId = person.id;
            target.updatedAt = Date.now();
          }
        }
      }
      const result = recomputeDerivedPeople(nextPeople, nextFaces, photos);
      const changedFaces = nextFaces.filter((face) => face.updatedAt > 0 && candidates.some((candidate) => candidate.id === face.id));
      const removed = Array.from(autoIds);
      for (const id of removed) await deletePersonRecord(id);
      await putPeople(result.people);
      await putFaces(changedFaces);
      if (result.photos.length) await putPhotos(result.photos);
      set((state) => ({
        people: result.people,
        faces: nextFaces,
        photos: mergeById(state.photos, result.photos),
      }));
      const changed = recomputeCategories(get().photos, get().people, get().events);
      if (changed.length) {
        const byId = new Map(changed.map((photo) => [photo.id, photo]));
        set((state) => ({ photos: state.photos.map((photo) => byId.get(photo.id) ?? photo) }));
        await putPhotos(changed);
      }
      toast('Unnamed people regrouped', `${formatCount(created)} clusters created. Named people were left untouched.`, 'success');
    },

    refreshPeopleStats: async () => {
      const result = recomputeDerivedPeople(get().people, get().faces, get().photos);
      for (const id of result.removed) await deletePersonRecord(id);
      await putPeople(result.people);
      if (result.photos.length) await putPhotos(result.photos);
      set((state) => ({
        people: result.people,
        photos: mergeById(state.photos, result.photos),
      }));
    },

    addCompare: (ids) => {
      const valid = ids.filter((id) => get().photos.some((photo) => photo.id === id));
      const next = unique([...get().compareIds, ...valid]);
      if (next.length > 4) {
        toast('Compare up to four', 'Remove a photograph before adding another.', 'default');
        set({ compareIds: next.slice(0, 4) });
        return;
      }
      set({ compareIds: next });
    },

    removeCompare: (id) => {
      set((state) => ({ compareIds: state.compareIds.filter((item) => item !== id) }));
    },

    clearCompare: () => set({ compareIds: [] }),

    setAlbum: (patch) => {
      const project = get().project;
      const next = { ...get().album, ...patch };
      set({ album: next });
      if (project) persistAlbum(project.id, next);
    },

    curateAlbum: () => {
      const { photos, groups, people, album } = get();
      if (!photos.length) {
        toast('No photographs to curate', 'Import photographs first.', 'default');
        return null;
      }
      let eligible = photos.filter((photo) => photo.analysis && !photo.rejected);
      if (album.categories.length && album.categories.length < ALBUM_CATEGORIES.length) {
        const allowed = new Set(album.categories);
        eligible = eligible.filter(
          (photo) => !photo.category || allowed.has(photo.category),
        );
      }
      const keyPeople = people
        .filter((person) => person.role === 'bride' || person.role === 'groom')
        .map((person) => person.id);
      const result = curateSelection(eligible, {
        target: Math.max(1, album.target),
        similarityThreshold: get().project?.settings.similarityThreshold ?? 8,
        favoriteBoost: album.includeFavorites ? 6 : 0,
        ensurePersonIds: keyPeople,
        avoidGroups: groups,
        diversifyEvents: album.diversifyEvents,
      });
      const reasons: Record<string, string> = {};
      for (const [id, reason] of result.reasons) reasons[id] = reason;
      const next: AlbumDraft = {
        ...album,
        lastCuration: { ids: result.ids, reasons, createdAt: Date.now() },
      };
      set({ album: next });
      if (get().project) persistAlbum(get().project!.id, next);
      return { ids: result.ids, reasons, skippedSimilar: result.skippedSimilar };
    },

    applyAlbumCuration: async () => {
      let { album } = get();
      if (!album.lastCuration) {
        const result = get().curateAlbum();
        if (!result) return;
        album = get().album;
      }
      const target = new Set(album.lastCuration?.ids ?? []);
      const current = get().photos;
      const changed = current.filter((photo) => photo.selected !== target.has(photo.id));
      if (!changed.length) {
        toast('Album already matches the curation', undefined, 'default');
        return;
      }
      const previous = changed.map((photo) => ({ ...photo }));
      const updated = changed.map((photo) => ({
        ...photo,
        selected: target.has(photo.id),
        updatedAt: Date.now(),
      }));
      const byId = new Map(updated.map((photo) => [photo.id, photo]));
      set((state) => ({
        photos: state.photos.map((photo) => byId.get(photo.id) ?? photo),
        undo: {
          label: 'Apply album selection',
          run: async () => {
            const map = new Map(previous.map((photo) => [photo.id, photo]));
            set({
              photos: get().photos.map((photo) => map.get(photo.id) ?? photo),
              undo: null,
            });
            await putPhotos(previous);
            get().pushToast({ title: 'Album selection undone', duration: 2600 });
          },
        },
      }));
      await putPhotos(updated);
      get().pushToast({
        title: 'Album selection applied',
        description: `${formatCount(target.size)} photographs selected. Nothing was deleted.`,
        tone: 'success',
        duration: 6500,
        action: { label: 'Undo', run: () => void get().undoLast() },
      });
      const nextAlbum = { ...get().album };
      set({ album: nextAlbum });
      if (get().project) persistAlbum(get().project!.id, nextAlbum);
    },

    addToAlbum: async (ids) => {
      await applyPatch(ids, { selected: true, rejected: false }, { label: 'Add to album', undo: true });
    },

    removeFromAlbum: async (ids) => {
      await applyPatch(ids, { selected: false }, { label: 'Remove from album', undo: true });
    },

    indexVisualSearch: async () => {
      const { project, photos, embeddings, ai } = get();
      if (!project) return;
      if (!project.consentAiSearch) {
        toast('Visual search consent is off', 'Enable local visual search in Settings first. The model runs entirely on this device.', 'default');
        return;
      }
      if (ai.status === 'indexing' || ai.status === 'loading') return;
      if (get().processing.running) {
        toast('Quality analysis is running', 'Wait for analysis to finish before visual indexing.', 'default');
        return;
      }
      const queue = photos.filter(
        (photo) => photo.status === 'ready' && !embeddings.has(photo.id),
      );
      if (!queue.length) {
        toast('Visual index is up to date', `${formatCount(embeddings.size)} photographs already have embeddings.`, 'success');
        return;
      }

      const controller = ensureClipController();
      aiIndexController = new AbortController();
      set({
        ai: {
          status: 'loading',
          total: queue.length,
          completed: 0,
          message: 'Preparing the local visual search model…',
          modelReady: false,
        },
      });

      let pendingPhotos: Photo[] = [];
      let pendingEmbeddings = new Map<string, Float32Array>();
      let lastUpdate = 0;

      const flush = async (force = false) => {
        if (pendingPhotos.length || force) {
          const photoBatch = pendingPhotos;
          pendingPhotos = [];
          if (photoBatch.length) await putPhotos(photoBatch);
          if (photoBatch.length) {
            set((state) => ({ photos: mergeById(state.photos, photoBatch) }));
          }
        }
        if (pendingEmbeddings.size) {
          const batch = new Map(pendingEmbeddings);
          pendingEmbeddings = new Map();
          set((state) => {
            const next = new Map(state.embeddings);
            for (const [id, vector] of batch) next.set(id, vector);
            return { embeddings: next };
          });
        }
      };

      try {
        const result = await controller.indexPhotos(queue, {
          signal: aiIndexController.signal,
          onEmbedding: async (photoId, vector) => {
            await putEmbedding({
              photoId,
              projectId: project.id,
              vector,
              model: 'clip-vit-base-patch32',
              createdAt: Date.now(),
            });
            pendingEmbeddings.set(photoId, vector);
            const photo = get().photos.find((item) => item.id === photoId);
            if (photo) pendingPhotos.push({ ...photo, aiIndexed: true, updatedAt: Date.now() });
            if (pendingEmbeddings.size >= 20 || pendingPhotos.length >= 20) await flush();
          },
          onProgress: (completed, total, photo) => {
            const now = Date.now();
            if (now - lastUpdate < 300 && completed < total) return;
            lastUpdate = now;
            set((state) => ({
              ai: {
                ...state.ai,
                status: 'indexing',
                total,
                completed,
                modelReady: true,
                message: `Indexing ${formatCount(completed)} of ${formatCount(total)} — ${photo.name}`,
              },
            }));
          },
          onStatus: (status) => {
            set((state) => ({ ai: { ...state.ai, ...clipStatusToAi(status) } }));
          },
        });
        await flush(true);
        if (result.cancelled) {
          set((state) => ({
            ai: {
              ...state.ai,
              status: state.ai.modelReady ? 'ready' : 'idle',
              message: `Visual indexing stopped after ${formatCount(result.indexed)} photographs.`,
            },
          }));
          toast('Visual indexing stopped', 'You can resume whenever you like. Existing embeddings are kept.', 'default');
        } else {
          set((state) => ({
            ai: {
              ...state.ai,
              status: 'ready',
              completed: queue.length,
              total: queue.length,
              modelReady: true,
              message: `${formatCount(get().embeddings.size)} photographs are searchable by description.`,
            },
          }));
          get().pushToast({
            title: 'Visual index ready',
            description: `${formatCount(result.indexed)} photographs can now be found with natural-language descriptions.`,
            tone: 'success',
            duration: 5200,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Visual indexing failed.';
        set((state) => ({ ai: { ...state.ai, status: 'error', message } }));
        toast('Visual indexing failed', message, 'danger');
      } finally {
        aiIndexController = null;
      }
    },

    cancelVisualIndexing: () => {
      aiIndexController?.abort();
    },

    queryVisual: async (text) => {
      const { project, embeddings } = get();
      if (!project || !project.consentAiSearch || !embeddings.size) return null;
      try {
        const controller = ensureClipController();
        return await controller.query(text);
      } catch (error) {
        toast(
          'Visual search unavailable',
          error instanceof Error ? error.message : 'The model could not answer this search.',
          'danger',
        );
        return null;
      }
    },

    disposeVisualSearch: () => {
      aiIndexController?.abort();
      aiIndexController = null;
      clipController?.dispose();
      clipController = null;
      set({ ai: emptyAi() });
    },

    deleteFaceData: async () => {
      const project = get().project;
      if (!project) return;
      await clearFacesAndPeople(project.id);
      const updated = get()
        .photos.filter((photo) => photo.faces.faceCount > 0 || photo.personIds.length > 0 || photo.faceStatus !== 'skipped')
        .map((photo) => ({
          ...photo,
          faces: EMPTY_FACE_SUMMARY,
          personIds: [],
          faceStatus: project.consentFace ? ('pending' as const) : ('skipped' as const),
          updatedAt: Date.now(),
        }));
      if (updated.length) await putPhotos(updated);
      set((state) => ({ photos: mergeById(state.photos, updated), people: [], faces: [] }));
      toast('Face data deleted', 'All face descriptors, crops and people for this project were removed from this device.', 'success');
      const changed = recomputeCategories(get().photos, [], get().events);
      if (changed.length) {
        const byId = new Map(changed.map((photo) => [photo.id, photo]));
        set((state) => ({ photos: state.photos.map((photo) => byId.get(photo.id) ?? photo) }));
        await putPhotos(changed);
      }
    },

    deleteStoredOriginals: async () => {
      const project = get().project;
      if (!project) return;
      await clearOriginalAssets(project.id);
      const updated = get()
        .photos.filter((photo) => photo.originalStored)
        .map((photo) => ({ ...photo, originalStored: false, updatedAt: Date.now() }));
      if (updated.length) {
        set((state) => ({ photos: mergeById(state.photos, updated) }));
        await putPhotos(updated);
      }
      await get().refreshStorage();
      toast(
        'Stored originals deleted',
        'Preview thumbnails remain for curation. Use Export → Relink originals before exporting full-resolution files.',
        'default',
      );
    },

    deleteVisualIndex: async () => {
      const project = get().project;
      if (!project) return;
      await deleteEmbeddings(project.id);
      const updated = get()
        .photos.filter((photo) => photo.aiIndexed)
        .map((photo) => ({ ...photo, aiIndexed: false, updatedAt: Date.now() }));
      if (updated.length) {
        set((state) => ({ photos: mergeById(state.photos, updated) }));
        await putPhotos(updated);
      }
      clipController?.dispose();
      clipController = null;
      set({ embeddings: new Map(), ai: emptyAi() });
      toast(
        'Visual index deleted',
        'All CLIP embeddings for this library were removed from this device. Photographs and selections are untouched.',
        'success',
      );
    },

    relinkOriginals: async (files, options = {}) => {
      const project = get().project;
      if (!project) return { matched: 0, unmatched: 0, failed: 0, cancelled: false };
      const missing = new Map(
        get()
          .photos.filter((photo) => !photo.originalStored)
          .map((photo) => [photo.contentHash, photo] as const),
      );
      let matched = 0;
      let unmatched = 0;
      let failed = 0;
      let pending: Photo[] = [];

      const flush = async () => {
        if (!pending.length) return;
        const batch = pending;
        pending = [];
        await putPhotos(batch);
        set((state) => ({ photos: mergeById(state.photos, batch) }));
      };

      for (let index = 0; index < files.length; index += 1) {
        if (options.signal?.aborted) break;
        const file = files[index];
        options.onProgress?.({
          done: index,
          total: files.length,
          matched,
          unmatched,
          failed,
          currentName: file.name,
        });
        try {
          const hash = await hashBlob(file);
          const photo = missing.get(hash);
          if (!photo) {
            unmatched += 1;
            continue;
          }
          await storeAsset(project.id, photo.id, 'original', file);
          pending.push({
            ...photo,
            originalStored: true,
            size: file.size,
            updatedAt: Date.now(),
          });
          missing.delete(hash);
          matched += 1;
          if (pending.length >= 8) await flush();
        } catch {
          failed += 1;
        }
      }

      await flush();
      options.onProgress?.({
        done: files.length,
        total: files.length,
        matched,
        unmatched,
        failed,
        currentName: '',
      });
      const cancelled = Boolean(options.signal?.aborted);
      if (matched > 0) {
        toast(
          cancelled ? 'Originals relinked' : 'Originals relinked',
          `${formatCount(matched)} full-resolution ${matched === 1 ? 'file was' : 'files were'} matched by content hash. Originals remain on your device only.`,
          'success',
        );
        await get().refreshStorage();
      } else if (!cancelled) {
        toast(
          'No originals matched',
          'The chosen files did not match any photograph awaiting an original. Files are matched by SHA-256 content hash, not by name.',
          'default',
        );
      }
      return { matched, unmatched, failed, cancelled };
    },

    setFilters: (patch) => set((state) => ({ filters: { ...state.filters, ...patch } })),
    resetFilters: () => set({ filters: defaultFilters() }),

    updateSettings: (patch) => {
      const next = { ...get().settings, ...patch };
      set({ settings: next });
      persistSettings(next);
      if (patch.theme) applyTheme(patch.theme);
    },

    pushToast: (toast) => {
      const id = crypto.randomUUID();
      const duration = toast.duration ?? (toast.action ? 7000 : 4200);
      set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
      if (duration > 0) {
        setTimeout(() => get().dismissToast(id), duration);
      }
      return id;
    },

    dismissToast: (id) => {
      set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
    },

    resetAllData: async () => {
      activeProcessor?.cancel();
      activeProcessor = null;
      importController?.abort();
      aiIndexController?.abort();
      clipController?.dispose();
      clipController = null;
      await wipeDatabase();
      const keys: string[] = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key?.startsWith('ivory.')) keys.push(key);
      }
      for (const key of keys) localStorage.removeItem(key);
      clearSessionBlobs();
      clearAssetUrlCache();
      set({
        project: null,
        projects: [],
        photos: [],
        people: [],
        faces: [],
        groups: [],
        events: [],
        embeddings: new Map(),
        filters: defaultFilters(),
        album: defaultAlbum(null),
        compareIds: [],
        processing: emptyProcessing(),
        ai: emptyAi(),
        importActive: false,
        importProgress: emptyImport(),
        undo: null,
        storage: { usage: 0, quota: 0, persisted: false, supported: false },
        settings: readSettings(),
      });
      toast('Ivory reset', 'Every project, photograph, preview and face descriptor has been deleted from this browser.', 'success');
    },
  };
});
