import type {
  EventRecord,
  Face,
  Person,
  Photo,
  PhotoGroup,
  ProcessingState,
  Project,
} from '@/types';
import type { FaceBox } from './faceMetrics';
import { summarizeFaces } from './faceMetrics';
import {
  faceAssetId,
  getOriginalBlob,
  getPreviewBlob,
  registerSessionAsset,
  registerSessionBlob,
  storeAsset,
} from './assets';
import {
  deleteAsset,
  deleteFacesForPhoto,
  deletePerson,
  getFaces,
  getPeople,
  putFaces,
  putPeople,
  putPhotos,
  replaceEvents,
  replaceGroups,
} from './db';
import { PERSON_COLORS } from './constants';
import {
  findNearestPerson,
  normaliseVector,
  updateCentroid,
} from './clustering';
import { buildEventSpecs, deriveAlbumCategory } from './categories';
import { applyGroupFlags, computeNorms, scorePhoto } from './quality';
import { computeGroups } from './grouping';
import { clamp } from './utils';
// Explicit worker imports let Vite emit real JavaScript worker chunks. Passing
// `new URL(...worker.ts, import.meta.url)` through a helper makes Vite treat the
// source as a plain asset and preserve the `.ts` extension in production.
import analysisWorkerUrl from '../workers/analysis.worker?worker&url';
import faceWorkerUrl from '../workers/face.worker?worker&url';

export interface ProcessorCallbacks {
  onPhotos: (photos: Photo[]) => void | Promise<void>;
  onFaces: (faces: Face[], removedIds?: string[]) => void | Promise<void>;
  onPeople: (people: Person[], removedIds?: string[]) => void | Promise<void>;
  onGroups: (groups: PhotoGroup[]) => void | Promise<void>;
  onEvents: (events: EventRecord[]) => void | Promise<void>;
  onProgress: (patch: Partial<ProcessingState>) => void;
  onWarning?: (title: string, description?: string) => void;
}

export interface ProcessingSummary {
  analysed: number;
  facePhotos: number;
  faces: number;
  groups: number;
  events: number;
  errors: number;
  cancelled: boolean;
  durationMs: number;
}

class CancelledError extends Error {
  constructor() {
    super('Processing cancelled');
    this.name = 'CancelledError';
  }
}

const ANALYSIS_SLEEP = 15;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface AnalysisResult {
  type: 'result';
  jobId: string;
  photoId: string;
  width: number;
  height: number;
  dhash: string;
  analysis: Photo['analysis'];
  preview: Blob;
  thumb: Blob;
}

interface WorkerError {
  type: 'error';
  jobId: string;
  message: string;
}

type AnalysisMessage = AnalysisResult | WorkerError;

interface FaceResult {
  type: 'result';
  jobId: string;
  photoId: string;
  faces: Array<{
    box: FaceBox;
    detectionScore: number;
    smile: number;
    eyesOpen: number;
    lookingAtCamera: boolean;
    yaw: number;
    pitch: number;
    faceSharpness: number;
    faceScore: number;
    descriptor: number[];
  }>;
  crops: Blob[];
  backend: string | null;
}

type FaceMessage = FaceResult | WorkerError;

interface PoolJob<T> {
  resolve: (message: T) => void;
  reject: (error: Error) => void;
}

interface QueueEntry<T> {
  payload: unknown;
  resolve: (message: T) => void;
  reject: (error: Error) => void;
}

class WorkerPool<T> {
  private slots: Array<{ worker: Worker; job: PoolJob<T> | null }> = [];
  private queue: Array<QueueEntry<T>> = [];
  private destroyed = false;

  constructor(
    url: string | URL,
    size: number,
    options: {
      onStatus?: (message: Record<string, unknown>) => void;
      onSlotCreated?: (worker: Worker) => void;
    } = {},
  ) {
    for (let index = 0; index < size; index += 1) {
      const worker = new Worker(url, { type: 'module' });
      const slot: { worker: Worker; job: PoolJob<T> | null } = { worker, job: null };
      worker.onmessage = (event: MessageEvent) => {
        const message = event.data;
        if (!message) return;
        if (message.type === 'status') {
          options.onStatus?.(message);
          return;
        }
        const job = slot.job;
        slot.job = null;
        if (message.type === 'error') {
          job?.reject(new Error(message.message ?? 'Worker failed.'));
        } else {
          job?.resolve(message as T);
        }
        this.pump();
      };
      worker.onerror = (event) => {
        const job = slot.job;
        slot.job = null;
        job?.reject(new Error(event.message || 'A processing worker crashed.'));
        this.pump();
      };
      this.slots.push(slot);
      options.onSlotCreated?.(worker);
    }
  }

  exec(payload: unknown): Promise<T> {
    if (this.destroyed) return Promise.reject(new Error('Worker pool is closed.'));
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ payload, resolve, reject });
      this.pump();
    });
  }

  private pump(): void {
    if (this.destroyed) return;
    for (const slot of this.slots) {
      if (slot.job || !this.queue.length) continue;
      const entry = this.queue.shift()!;
      slot.job = { resolve: entry.resolve, reject: entry.reject };
      slot.worker.postMessage(entry.payload);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const entry of this.queue) entry.reject(new Error('Processing stopped.'));
    this.queue = [];
    for (const slot of this.slots) {
      slot.job?.reject(new Error('Processing stopped.'));
      slot.job = null;
      slot.worker.terminate();
    }
    this.slots = [];
  }
}

function intersectionOverUnion(a: FaceBox, b: FaceBox): number {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  const interWidth = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
  const interHeight = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
  const intersection = interWidth * interHeight;
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

function personName(index: number): string {
  return `Person ${index}`;
}

export class LibraryProcessor {
  private project: Project;
  private photoMap = new Map<string, Photo>();
  private peopleMap = new Map<string, Person>();
  private faceMap = new Map<string, Face>();
  private eventMap = new Map<string, EventRecord>();
  private callbacks: ProcessorCallbacks;

  private paused = false;
  private cancelled = false;
  private wake: (() => void) | null = null;
  private startedAt = 0;

  private photoBatch = new Map<string, Photo>();
  private faceBatch = new Map<string, Face>();
  private removedFaceIds: string[] = [];
  private peopleBatch = new Map<string, Person>();
  private lastPhotoFlush = 0;
  private lastFaceFlush = 0;
  private lastReport = 0;

  private errors = 0;
  private facePhotosDone = 0;
  private facesCreated = 0;
  private analysed = 0;
  private groupsCreated = 0;
  private faceApplyChain: Promise<void> = Promise.resolve();

  private quotaBlocked = false;
  private quotaWarned = false;
  private faceFatal = false;
  private faceConsecutiveErrors = 0;
  private faceSuccesses = 0;

  constructor(
    project: Project,
    photos: Photo[],
    people: Person[],
    faces: Face[],
    events: EventRecord[],
    callbacks: ProcessorCallbacks,
  ) {
    this.project = project;
    for (const photo of photos) this.photoMap.set(photo.id, photo);
    for (const person of people) this.peopleMap.set(person.id, person);
    for (const face of faces) this.faceMap.set(face.id, face);
    for (const event of events) this.eventMap.set(event.id, event);
    this.callbacks = callbacks;
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.callbacks.onProgress({ paused: true });
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.callbacks.onProgress({ paused: false });
    const wake = this.wake;
    this.wake = null;
    wake?.();
  }

  cancel(): void {
    this.cancelled = true;
    const wake = this.wake;
    this.wake = null;
    wake?.();
  }

  private async gate(): Promise<void> {
    if (this.cancelled) throw new CancelledError();
    while (this.paused) {
      if (this.cancelled) throw new CancelledError();
      await new Promise<void>((resolve) => {
        this.wake = resolve;
        setTimeout(resolve, 200);
      });
      this.wake = null;
    }
    if (this.cancelled) throw new CancelledError();
  }

  private report(patch: Partial<ProcessingState>, force = false): void {
    const now = Date.now();
    if (!force && now - this.lastReport < 220 && !('stage' in patch)) return;
    this.lastReport = now;
    this.callbacks.onProgress(patch);
  }

  private eta(completed: number, total: number): number | null {
    if (!completed || completed >= total) return null;
    const elapsed = Date.now() - this.startedAt;
    if (elapsed < 1200) return null;
    return Math.round((elapsed / completed) * (total - completed));
  }

  private touchPhoto(photo: Photo): Photo {
    const next = { ...photo, updatedAt: Date.now() };
    this.photoMap.set(next.id, next);
    this.photoBatch.set(next.id, next);
    return next;
  }

  private touchFace(face: Face): void {
    this.faceMap.set(face.id, face);
    this.faceBatch.set(face.id, face);
  }

  private touchPerson(person: Person): void {
    const next = { ...person, updatedAt: Date.now() };
    this.peopleMap.set(next.id, next);
    this.peopleBatch.set(next.id, next);
  }

  private async flushPhotos(force = false): Promise<void> {
    if (!this.photoBatch.size) return;
    if (!force && this.photoBatch.size < 10 && Date.now() - this.lastPhotoFlush < 900) return;
    const batch = Array.from(this.photoBatch.values());
    this.photoBatch.clear();
    this.lastPhotoFlush = Date.now();
    await putPhotos(batch);
    await this.callbacks.onPhotos(batch);
  }

  private async flushFaces(force = false): Promise<void> {
    if (!this.faceBatch.size && !this.removedFaceIds.length) return;
    if (!force && this.faceBatch.size < 8 && Date.now() - this.lastFaceFlush < 900) return;
    const added = Array.from(this.faceBatch.values());
    const removed = this.removedFaceIds;
    this.faceBatch.clear();
    this.removedFaceIds = [];
    this.lastFaceFlush = Date.now();
    if (added.length) await putFaces(added);
    if (added.length || removed.length) await this.callbacks.onFaces(added, removed);
  }

  private async flushPeople(force = false): Promise<void> {
    if (!this.peopleBatch.size) return;
    if (!force && this.peopleBatch.size < 10) return;
    const batch = Array.from(this.peopleBatch.values());
    this.peopleBatch.clear();
    await putPeople(batch);
    await this.callbacks.onPeople(batch);
  }

  private warnQuota(): void {
    this.quotaBlocked = true;
    if (this.quotaWarned) return;
    this.quotaWarned = true;
    this.callbacks.onWarning?.(
      'Device storage is full',
      'Ivory will keep working with in-memory previews, but some originals could not be saved for offline use. Free some space or switch off original storage in Settings.',
    );
  }

  private async storePhotoAssets(photoId: string, blob: Blob, preview: Blob, thumb: Blob): Promise<boolean> {
    let previewStored = true;
    try {
      await storeAsset(this.project.id, photoId, 'thumb', thumb);
    } catch {
      registerSessionAsset(`${photoId}:thumb`, thumb);
      previewStored = false;
      this.warnQuota();
    }
    try {
      await storeAsset(this.project.id, photoId, 'preview', preview);
    } catch {
      registerSessionAsset(`${photoId}:preview`, preview);
      previewStored = false;
      this.warnQuota();
    }
    if (this.project.storeOriginals && !this.quotaBlocked) {
      try {
        await storeAsset(this.project.id, photoId, 'original', blob);
      } catch {
        this.warnQuota();
      }
    }
    return previewStored;
  }

  private async runItems<T>(
    items: T[],
    concurrency: number,
    handler: (item: T, index: number) => Promise<void>,
  ): Promise<void> {
    let index = 0;
    const count = Math.max(1, Math.min(concurrency, items.length));
    const loops = Array.from({ length: count }, async () => {
      while (true) {
        await this.gate();
        const current = index;
        index += 1;
        if (current >= items.length) return;
        await handler(items[current], current);
      }
    });
    const results = await Promise.allSettled(loops);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  }

  async start(): Promise<ProcessingSummary> {
    this.startedAt = Date.now();
    this.callbacks.onProgress({
      running: true,
      paused: false,
      stage: 'analysing',
      total: 0,
      completed: 0,
      currentName: '',
      startedAt: this.startedAt,
      etaMs: null,
      errors: 0,
    });

    let cancelled = false;
    let organisingDone = false;

    try {
      await this.runAnalysis();
      if (!this.cancelled && this.project.consentFace) {
        await this.runFaces();
      }
      if (this.cancelled) cancelled = true;
      await this.runOrganise();
      organisingDone = true;
    } catch (error) {
      if (error instanceof CancelledError) {
        cancelled = true;
        try {
          await this.runOrganise();
          organisingDone = true;
        } catch {
          // Partial organisation is better than none, but do not mask cancellation.
        }
      } else {
        this.errors += 1;
        this.callbacks.onWarning?.(
          'Processing stopped unexpectedly',
          error instanceof Error ? error.message : 'An unknown error occurred while organising this library.',
        );
      }
    } finally {
      await this.flushPhotos(true).catch(() => {});
      await this.flushFaces(true).catch(() => {});
      await this.flushPeople(true).catch(() => {});
      const durationMs = Date.now() - this.startedAt;
      this.callbacks.onProgress({
        running: false,
        paused: false,
        stage: 'idle',
        currentName: '',
        etaMs: null,
        errors: this.errors,
      });
      if (!organisingDone && !cancelled) {
        this.callbacks.onProgress({ stage: 'idle' });
      }
    }

    return {
      analysed: this.analysed,
      facePhotos: this.facePhotosDone,
      faces: this.facesCreated,
      groups: this.groupsCreated,
      events: this.eventMap.size,
      errors: this.errors,
      cancelled,
      durationMs: Date.now() - this.startedAt,
    };
  }

  private async runAnalysis(): Promise<void> {
    const queue = Array.from(this.photoMap.values()).filter(
      (photo) =>
        photo.status !== 'ready' ||
        !photo.analysis ||
        !photo.dhash ||
        !photo.previewStored,
    );
    this.callbacks.onProgress({
      stage: 'analysing',
      total: queue.length,
      completed: 0,
      etaMs: null,
      currentName: '',
    });
    if (!queue.length) return;

    const concurrency = clamp(
      Math.min(
        this.project.settings.analysisConcurrency || 3,
        Math.max(1, (navigator.hardwareConcurrency || 4) - 1),
      ),
      1,
      6,
    );
    const pool = new WorkerPool<AnalysisMessage>(analysisWorkerUrl, concurrency);

    try {
      await this.runItems(queue, concurrency, async (photo, index) => {
        const blob = await getOriginalBlob(photo.id);
        if (!blob) {
          const failed = this.touchPhoto({
            ...photo,
            status: 'error',
            error: 'Original file is not available on this device. Relink it from Export to continue.',
          });
          this.errors += 1;
          await this.flushPhotos();
          this.report(
            {
              completed: index + 1,
              currentName: failed.name,
              errors: this.errors,
              etaMs: this.eta(index + 1, queue.length),
            },
            true,
          );
          return;
        }

        registerSessionBlob(photo.id, blob);
        this.report({ currentName: photo.name }, true);
        try {
          const result = (await pool.exec({
            type: 'analyze',
            jobId: photo.id,
            photoId: photo.id,
            blob,
          })) as AnalysisResult;
          const previewStored = await this.storePhotoAssets(photo.id, blob, result.preview, result.thumb);
          const next: Photo = {
            ...photo,
            width: result.width || photo.width,
            height: result.height || photo.height,
            dhash: result.dhash,
            analysis: result.analysis,
            status: 'ready',
            error: undefined,
            previewStored,
            originalStored: this.project.storeOriginals && !this.quotaBlocked,
            updatedAt: Date.now(),
          };
          this.analysed += 1;
          this.touchPhoto(next);
        } catch (error) {
          if (error instanceof CancelledError) throw error;
          const failed = this.touchPhoto({
            ...photo,
            status: 'error',
            error: error instanceof Error ? error.message : 'Could not analyse this photograph.',
          });
          void failed;
          this.errors += 1;
        }
        await this.flushPhotos();
        this.report(
          {
            completed: index + 1,
            currentName: photo.name,
            errors: this.errors,
            etaMs: this.eta(index + 1, queue.length),
          },
          true,
        );
        await sleep(ANALYSIS_SLEEP);
      });
    } finally {
      pool.destroy();
      await this.flushPhotos(true);
    }
  }

  private async runFaces(): Promise<void> {
    const queue = Array.from(this.photoMap.values()).filter(
      (photo) =>
        photo.status === 'ready' &&
        (photo.faceStatus === 'pending' || photo.faceStatus === 'error' || photo.faceStatus === 'processing'),
    );
    this.callbacks.onProgress({
      stage: 'faces',
      total: queue.length,
      completed: 0,
      etaMs: null,
      currentName: '',
    });
    if (!queue.length) return;

    const modelBaseUrl = new URL('models/', document.baseURI).href;
    const size =
      (navigator.hardwareConcurrency || 4) >= 8 ? 2 : 1;
    const concurrency = Math.min(size, 2);
    const pool = new WorkerPool<FaceMessage>(faceWorkerUrl, concurrency, {
      onStatus: (message) => {
        if (typeof message.message === 'string') {
          this.report({ currentName: message.message }, true);
        }
      },
      onSlotCreated: (worker) => {
        worker.postMessage({
          type: 'init',
          modelBaseUrl,
          detector: this.project.settings.faceDetector,
          threshold: this.project.settings.faceDetectorThreshold,
        });
      },
    });

    try {
      await this.runItems(queue, concurrency, async (photo, index) => {
        if (this.faceFatal) return;
        const blob = (await getOriginalBlob(photo.id)) ?? (await getPreviewBlob(photo.id));
        if (!blob) {
          this.touchPhoto({
            ...photo,
            faceStatus: 'error',
            error: 'Original or preview is unavailable for face analysis.',
          });
          this.errors += 1;
          return;
        }
        this.report({ currentName: photo.name }, true);
        try {
          const result = (await pool.exec({
            type: 'analyze',
            jobId: photo.id,
            photoId: photo.id,
            blob,
            detector: this.project.settings.faceDetector,
            threshold: this.project.settings.faceDetectorThreshold,
          })) as FaceResult;
          const applyJob = this.faceApplyChain.then(() => this.applyFaceResult(photo, result));
          this.faceApplyChain = applyJob.catch(() => {});
          await applyJob;
          this.faceSuccesses += 1;
          this.faceConsecutiveErrors = 0;
          this.facePhotosDone += 1;
        } catch (error) {
          if (error instanceof CancelledError) throw error;
          this.errors += 1;
          this.faceConsecutiveErrors += 1;
          this.touchPhoto({
            ...photo,
            faceStatus: 'error',
            error: error instanceof Error ? error.message : 'Face analysis failed.',
          });
          if (this.faceConsecutiveErrors >= 3 && this.faceSuccesses === 0) {
            this.faceFatal = true;
            this.callbacks.onWarning?.(
              'Face analysis is unavailable',
              'Your browser could not run the local face models. Photos and quality ranking are unaffected; you can retry later in Settings.',
            );
          }
        }
        await this.flushPhotos();
        await this.flushFaces();
        await this.flushPeople();
        this.report(
          {
            completed: index + 1,
            currentName: photo.name,
            errors: this.errors,
            etaMs: this.eta(index + 1, queue.length),
          },
          true,
        );
      });
    } finally {
      pool.destroy();
      await this.flushFaces(true);
      await this.flushPeople(true);
      await this.refreshPeopleStats();
    }
  }

  private async applyFaceResult(photo: Photo, result: FaceResult): Promise<void> {
    const previousFaces = Array.from(this.faceMap.values()).filter((face) => face.photoId === photo.id);
    for (const oldFace of previousFaces) {
      this.faceMap.delete(oldFace.id);
      this.removedFaceIds.push(oldFace.id);
      if (oldFace.cropAssetId) await deleteAsset(oldFace.cropAssetId).catch(() => {});
    }
    // Remove the old rows from IndexedDB before new faces are written. Otherwise a later
    // refreshPeopleStats() would resurrect stale descriptors and inflate person counts.
    await deleteFacesForPhoto(photo.id).catch(() => {});

    const newFaces: Face[] = [];
    const now = Date.now();
    for (let index = 0; index < result.faces.length; index += 1) {
      const item = result.faces[index];
      const faceId = crypto.randomUUID();
      const inherited = previousFaces
        .map((old) => ({ old, overlap: intersectionOverUnion(old.box, item.box) }))
        .sort((a, b) => b.overlap - a.overlap)[0];
      const personId = inherited && inherited.overlap >= 0.45 ? inherited.old.personId : null;
      const ignored = item.box.width < 0.012 || item.box.height < 0.012;
      const crop = result.crops[index];
      const cropAssetId = faceAssetId(photo.id, faceId);
      if (crop) {
        try {
          await storeAsset(this.project.id, photo.id, 'face', crop, cropAssetId);
        } catch {
          registerSessionAsset(cropAssetId, crop);
          this.warnQuota();
        }
      }
      const face: Face = {
        id: faceId,
        projectId: this.project.id,
        photoId: photo.id,
        personId,
        box: item.box,
        detectionScore: item.detectionScore,
        smile: item.smile,
        eyesOpen: item.eyesOpen,
        lookingAtCamera: item.lookingAtCamera,
        yaw: item.yaw,
        pitch: item.pitch,
        faceSharpness: item.faceSharpness,
        faceScore: item.faceScore,
        descriptor: normaliseVector(Float32Array.from(item.descriptor)),
        cropAssetId: crop ? cropAssetId : undefined,
        ignored,
        createdAt: now,
        updatedAt: now,
      };
      newFaces.push(face);
      this.touchFace(face);
      this.facesCreated += 1;

      if (!ignored && !face.personId) {
        const match = findNearestPerson(
          face.descriptor,
          Array.from(this.peopleMap.values()),
          this.project.settings.faceClusterThreshold,
        );
        if (match) {
          const person = this.peopleMap.get(match.personId);
          if (person) {
            person.centroid = updateCentroid(person.centroid, person.faceCount, face.descriptor);
            person.faceCount += 1;
            if (!person.coverFaceId || face.faceScore >= 60) person.coverFaceId = face.id;
            face.personId = person.id;
            this.touchPerson(person);
            this.faceMap.set(face.id, face);
            this.faceBatch.set(face.id, face);
          }
        } else {
          const person: Person = {
            id: crypto.randomUUID(),
            projectId: this.project.id,
            name: personName(this.peopleMap.size + 1),
            role: 'other',
            coverFaceId: face.id,
            faceCount: 1,
            centroid: normaliseVector(face.descriptor),
            color: PERSON_COLORS[this.peopleMap.size % PERSON_COLORS.length],
            createdAt: now,
            updatedAt: now,
          };
          face.personId = person.id;
          this.faceMap.set(face.id, face);
          this.faceBatch.set(face.id, face);
          this.peopleMap.set(person.id, person);
          this.peopleBatch.set(person.id, person);
        }
      } else if (!ignored && face.personId) {
        const person = this.peopleMap.get(face.personId);
        if (person) {
          person.faceCount += 1;
          this.touchPerson(person);
        }
      }
    }

    const summary = summarizeFaces(
      newFaces
        .filter((face) => !face.ignored)
        .map((face) => ({
          box: face.box,
          smile: face.smile,
          eyesOpen: face.eyesOpen,
          lookingAtCamera: face.lookingAtCamera,
          faceSharpness: face.faceSharpness,
          faceScore: face.faceScore,
        })),
    );
    const personIds = Array.from(
      new Set(newFaces.map((face) => face.personId).filter((id): id is string => Boolean(id))),
    );
    this.touchPhoto({
      ...photo,
      faces: summary,
      personIds,
      faceStatus: 'done',
      error: undefined,
    });
  }

  private async refreshPeopleStats(): Promise<void> {
    const allFaces = await getFaces(this.project.id);
    const people = await getPeople(this.project.id);
    const byPerson = new Map<string, Face[]>();
    for (const face of allFaces) {
      if (!face.personId || face.ignored) continue;
      const list = byPerson.get(face.personId);
      if (list) list.push(face);
      else byPerson.set(face.personId, [face]);
    }

    this.faceMap.clear();
    for (const face of allFaces) this.faceMap.set(face.id, face);

    const removed: string[] = [];
    const nextPeople: Person[] = [];
    for (const person of people) {
      const list = byPerson.get(person.id) ?? [];
      if (!list.length) {
        if (person.name.startsWith('Person ')) {
          removed.push(person.id);
          this.peopleMap.delete(person.id);
          await deletePerson(person.id).catch(() => {});
          continue;
        }
        nextPeople.push({ ...person, faceCount: 0, centroid: null });
        continue;
      }
      const centroid = new Float32Array(list[0].descriptor.length);
      for (const face of list) {
        for (let i = 0; i < centroid.length; i += 1) centroid[i] += face.descriptor[i];
      }
      const cover = list.reduce((best, face) => (face.faceScore > best.faceScore ? face : best), list[0]);
      nextPeople.push({
        ...person,
        faceCount: list.length,
        centroid: normaliseVector(centroid),
        coverFaceId: cover.id,
      });
    }

    for (const person of nextPeople) {
      this.peopleMap.set(person.id, person);
      this.peopleBatch.set(person.id, person);
    }
    if (nextPeople.length) await putPeople(nextPeople);
    if (nextPeople.length || removed.length) {
      await this.callbacks.onPeople(nextPeople, removed);
    }
  }

  private async runOrganise(): Promise<void> {
    const photos = Array.from(this.photoMap.values());
    this.callbacks.onProgress({
      stage: 'organising',
      total: photos.length,
      completed: 0,
      currentName: 'Organising library',
      etaMs: null,
    });

    const norms = computeNorms(photos);
    let scored = photos.map((photo) => scorePhoto(photo, norms));

    const grouping = computeGroups(scored, {
      projectId: this.project.id,
      similarityThreshold: this.project.settings.similarityThreshold,
      burstWindowMs: this.project.settings.burstWindowMs,
    });
    this.groupsCreated = grouping.groups.length;
    scored = applyGroupFlags(scored, grouping.groups);

    const groupIdsByPhoto = new Map<string, string[]>();
    for (const group of grouping.groups) {
      for (const photoId of group.photoIds) {
        const list = groupIdsByPhoto.get(photoId) ?? [];
        list.push(group.id);
        groupIdsByPhoto.set(photoId, list);
      }
    }

    const specs = buildEventSpecs(scored, this.project.settings.timelineGapMin, this.project.id);
    const existingEvents = Array.from(this.eventMap.values());
    const usedEvents = new Set<string>();
    const nextEvents: EventRecord[] = [];
    const eventIdByPhoto = new Map<string, string>();
    const now = Date.now();

    for (const spec of specs) {
      const match = existingEvents.find(
        (event) =>
          !usedEvents.has(event.id) &&
          Math.abs(event.start - spec.start) <= 10 * 60_000,
      );
      let event: EventRecord;
      if (match) {
        usedEvents.add(match.id);
        event = {
          ...match,
          start: Math.min(match.start, spec.start),
          end: Math.max(match.end, spec.end),
          updatedAt: now,
        };
      } else {
        event = {
          id: crypto.randomUUID(),
          projectId: this.project.id,
          name: spec.name,
          type: spec.type,
          start: spec.start,
          end: spec.end,
          createdAt: now,
          updatedAt: now,
        };
      }
      nextEvents.push(event);
      for (const photoId of spec.photoIds) eventIdByPhoto.set(photoId, event.id);
    }

    const roles = new Map(Array.from(this.peopleMap.values()).map((person) => [person.id, person.role]));
    const eventById = new Map(nextEvents.map((event) => [event.id, event]));

    const finalPhotos = scored.map((photo) => {
      const eventId = eventIdByPhoto.get(photo.id);
      const category = photo.categoryManual
        ? photo.category
        : deriveAlbumCategory(photo, roles, eventId ? eventById.get(eventId) : undefined);
      return {
        ...photo,
        eventId,
        category,
        groupIds: groupIdsByPhoto.get(photo.id) ?? [],
        updatedAt: now,
      };
    });

    for (const photo of finalPhotos) {
      this.photoMap.set(photo.id, photo);
      this.photoBatch.set(photo.id, photo);
    }

    await putPhotos(finalPhotos);
    await replaceGroups(this.project.id, grouping.groups);
    await replaceEvents(this.project.id, nextEvents);
    this.eventMap.clear();
    for (const event of nextEvents) this.eventMap.set(event.id, event);

    await this.callbacks.onPhotos(finalPhotos);
    await this.callbacks.onGroups(grouping.groups);
    await this.callbacks.onEvents(nextEvents);
    await this.flushFaces(true);
    await this.flushPeople(true);

    this.report(
      {
        completed: photos.length,
        currentName: '',
        etaMs: null,
      },
      true,
    );
  }
}

export function processingErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Processing could not continue.';
}
