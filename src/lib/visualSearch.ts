import type { Photo } from '@/types';
import { getPreviewBlob } from './assets';

export interface ClipStatus {
  state: 'idle' | 'loading' | 'ready' | 'error';
  message: string;
  downloadProgress?: number;
  downloadFile?: string;
}

interface PendingJob {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

interface WorkerMessage {
  type: string;
  jobId?: string;
  message?: string;
  state?: ClipStatus['state'];
  progress?: number;
  file?: string;
  vector?: Float32Array;
  text?: string;
  photoId?: string;
}

export interface IndexCallbacks {
  onEmbedding: (photoId: string, vector: Float32Array) => void | Promise<void>;
  onProgress: (completed: number, total: number, photo: Photo) => void;
  onStatus?: (status: ClipStatus) => void;
  signal?: AbortSignal;
}

/**
 * Lazy singleton around the CLIP worker. The ~170 MB quantised model is only
 * downloaded after the user explicitly consents and starts visual indexing.
 */
export class ClipController {
  private worker: Worker | null = null;
  private jobs = new Map<string, PendingJob>();
  private loadPromise: Promise<void> | null = null;
  private loadResolve: (() => void) | null = null;
  private loadReject: ((error: Error) => void) | null = null;
  private status: ClipStatus = { state: 'idle', message: 'Visual search is not loaded.' };
  private onStatus?: (status: ClipStatus) => void;
  private counter = 0;

  constructor(private ortBaseUrl: string) {}

  setStatusListener(listener: (status: ClipStatus) => void): void {
    this.onStatus = listener;
  }

  getStatus(): ClipStatus {
    return this.status;
  }

  private emit(status: Partial<ClipStatus> & { state: ClipStatus['state']; message: string }): void {
    this.status = { ...this.status, ...status };
    this.onStatus?.(this.status);
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('../workers/clip.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (!message) return;
      if (message.type === 'status') {
        if (message.state === 'ready') {
          this.emit({ state: 'ready', message: message.message ?? 'Visual search model ready.' });
          this.loadResolve?.();
          this.loadResolve = null;
          this.loadReject = null;
        } else if (message.state === 'error') {
          this.emit({ state: 'error', message: message.message ?? 'Visual search failed to load.' });
        } else {
          this.emit({ state: 'loading', message: message.message ?? 'Loading visual search…' });
        }
        return;
      }
      if (message.type === 'download') {
        this.emit({
          state: 'loading',
          message: message.file
            ? `Downloading ${message.file} (${message.progress ?? 0}%)`
            : 'Downloading visual search model…',
          downloadProgress: message.progress,
          downloadFile: message.file,
        });
        return;
      }
      if (message.type === 'embedding' && message.jobId) {
        const job = this.jobs.get(message.jobId);
        if (job) {
          this.jobs.delete(message.jobId);
          job.resolve(message.vector);
        }
        return;
      }
      if (message.type === 'textEmbedding' && message.jobId) {
        const job = this.jobs.get(message.jobId);
        if (job) {
          this.jobs.delete(message.jobId);
          job.resolve(message.vector);
        }
        return;
      }
      if (message.type === 'error') {
        const error = new Error(message.message ?? 'Visual search failed.');
        if (message.jobId && this.jobs.has(message.jobId)) {
          this.jobs.get(message.jobId)!.reject(error);
          this.jobs.delete(message.jobId);
        } else if (message.jobId === 'init' || this.loadReject) {
          this.emit({ state: 'error', message: error.message });
          this.loadReject?.(error);
          this.loadReject = null;
          this.loadResolve = null;
        }
      }
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || 'The visual search worker crashed.');
      this.emit({ state: 'error', message: error.message });
      for (const job of this.jobs.values()) job.reject(error);
      this.jobs.clear();
      this.loadReject?.(error);
      this.loadReject = null;
      this.loadResolve = null;
    };
    this.worker = worker;
    return worker;
  }

  load(): Promise<void> {
    if (this.status.state === 'ready') return Promise.resolve();
    if (this.loadPromise) return this.loadPromise;
    const worker = this.ensureWorker();
    this.emit({ state: 'loading', message: 'Loading visual search model…' });
    this.loadPromise = new Promise<void>((resolve, reject) => {
      this.loadResolve = resolve;
      this.loadReject = reject;
      worker.postMessage({ type: 'load', ortBaseUrl: this.ortBaseUrl });
    }).catch((error) => {
      this.loadPromise = null;
      throw error;
    });
    return this.loadPromise;
  }

  private request(payload: Record<string, unknown>, expectedType: string): Promise<Float32Array> {
    const worker = this.ensureWorker();
    const jobId = `${expectedType}-${++this.counter}`;
    return new Promise<Float32Array>((resolve, reject) => {
      this.jobs.set(jobId, {
        resolve: (value) => resolve(value as Float32Array),
        reject,
      });
      worker.postMessage({ ...payload, jobId });
    });
  }

  async embedPhoto(photoId: string, blob: Blob): Promise<Float32Array> {
    await this.load();
    return this.request({ type: 'index', photoId, blob }, 'embedding');
  }

  async query(text: string): Promise<Float32Array> {
    await this.load();
    return this.request({ type: 'query', text }, 'textEmbedding');
  }

  async indexPhotos(photos: Photo[], callbacks: IndexCallbacks): Promise<{ indexed: number; skipped: number; cancelled: boolean }> {
    let indexed = 0;
    let skipped = 0;
    let completed = 0;
    for (const photo of photos) {
      if (callbacks.signal?.aborted) {
        return { indexed, skipped, cancelled: true };
      }
      const blob = await getPreviewBlob(photo.id);
      if (!blob) {
        skipped += 1;
        completed += 1;
        callbacks.onProgress(completed, photos.length, photo);
        continue;
      }
      try {
        const vector = await this.embedPhoto(photo.id, blob);
        await callbacks.onEmbedding(photo.id, vector);
        indexed += 1;
      } catch (error) {
        if (callbacks.signal?.aborted) {
          return { indexed, skipped, cancelled: true };
        }
        skipped += 1;
        callbacks.onStatus?.({
          state: 'error',
          message: error instanceof Error ? error.message : 'Could not index this photo.',
        });
      }
      completed += 1;
      callbacks.onProgress(completed, photos.length, photo);
    }
    return { indexed, skipped, cancelled: false };
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const job of this.jobs.values()) job.reject(new Error('Visual search stopped.'));
    this.jobs.clear();
    this.loadPromise = null;
    this.loadReject?.(new Error('Visual search stopped.'));
    this.loadReject = null;
    this.loadResolve = null;
    this.emit({ state: 'idle', message: 'Visual search is not loaded.' });
  }
}
