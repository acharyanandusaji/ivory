import { createSHA256 } from 'hash-wasm';
import exifr from 'exifr';
import type { ImportStats, Photo } from '@/types';
import { EMPTY_FACE_SUMMARY } from './quality';
import { extensionOf, formatExposureTime, sanitizeFilename } from './utils';

export type ImportPhase = 'idle' | 'collecting' | 'reading' | 'extracting' | 'done' | 'cancelled' | 'error';

export interface ImportProgressSnapshot {
  phase: ImportPhase;
  totalFiles: number;
  processed: number;
  imported: number;
  duplicates: number;
  skipped: number;
  failed: number;
  bytesTotal: number;
  bytesProcessed: number;
  currentName: string;
  message?: string;
}

export interface IngestResult {
  stats: ImportStats;
  cancelled: boolean;
}

export interface CollectedSources {
  files: SourceFile[];
  zips: File[];
  skipped: number;
  errors: string[];
}

export interface SourceFile {
  blob: Blob;
  name: string;
  path: string;
  lastModified: number;
}

export interface PhotoExif {
  capturedAt: number | null;
  camera?: string;
  lens?: string;
  iso?: number;
  fNumber?: number;
  exposureTime?: string;
  focalLength?: number;
  gps?: [number, number];
  width?: number;
  height?: number;
}

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp']);
const ZIP_EXTENSIONS = new Set(['zip']);

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  bmp: 'image/bmp',
};

interface EntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (success: (file: File) => void, error?: (error: DOMException) => void) => void;
  createReader?: () => DirectoryReaderLike;
}

interface DirectoryReaderLike {
  readEntries: (
    success: (entries: EntryLike[]) => void,
    error?: (error: DOMException) => void,
  ) => void;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '');
}

function mimeFor(extension: string): string {
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

function supportedName(name: string): boolean {
  return IMAGE_EXTENSIONS.has(extensionOf(name));
}

function isZipName(name: string): boolean {
  return ZIP_EXTENSIONS.has(extensionOf(name));
}

export function isImageFile(file: File): boolean {
  return supportedName(file.name) || file.type.startsWith('image/');
}

export function isZipFile(file: File): boolean {
  return isZipName(file.name) || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
}

function fileToSource(file: File, path?: string): SourceFile {
  const resolved =
    path ??
    ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name);
  return {
    blob: file,
    name: file.name,
    path: normalizePath(resolved),
    lastModified: file.lastModified || Date.now(),
  };
}

async function readDirectory(reader: DirectoryReaderLike): Promise<EntryLike[]> {
  const all: EntryLike[] = [];
  while (true) {
    const batch = await new Promise<EntryLike[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (!batch.length) break;
    all.push(...batch);
    if (all.length > 200_000) break;
  }
  return all;
}

async function walkEntry(
  entry: EntryLike,
  prefix: string,
  out: CollectedSources,
  depth = 0,
): Promise<void> {
  if (depth > 24) {
    out.errors.push(`Skipped a deeply nested folder (${entry.name}).`);
    return;
  }
  if (entry.isFile && entry.file) {
    try {
      const file = await new Promise<File>((resolve, reject) => {
        entry.file?.(resolve, reject);
      });
      if (isZipFile(file)) {
        out.zips.push(file);
      } else if (isImageFile(file)) {
        out.files.push(fileToSource(file, `${prefix}${file.name}`));
      } else {
        out.skipped += 1;
      }
    } catch {
      out.errors.push(`Could not read ${entry.name}.`);
    }
    return;
  }
  if (entry.isDirectory && entry.createReader) {
    try {
      const reader = entry.createReader();
      const entries = await readDirectory(reader);
      for (const child of entries) {
        await walkEntry(child, `${prefix}${entry.name}/`, out, depth + 1);
      }
    } catch {
      out.errors.push(`Could not open the folder ${entry.name}.`);
    }
  }
}

/** Collect images and ZIP archives from a drag-and-drop event, including folders. */
export async function collectFromDataTransfer(dataTransfer: DataTransfer): Promise<CollectedSources> {
  const out: CollectedSources = { files: [], zips: [], skipped: 0, errors: [] };
  const items = dataTransfer.items ? Array.from(dataTransfer.items) : [];
  const entries: EntryLike[] = [];
  for (const item of items) {
    if (item.kind !== 'file') continue;
    const entry = (item as DataTransferItem & { webkitGetAsEntry?: () => EntryLike | null }).webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }

  if (entries.length) {
    for (const entry of entries) await walkEntry(entry, '', out);
    return out;
  }

  for (const file of Array.from(dataTransfer.files ?? [])) {
    if (isZipFile(file)) out.zips.push(file);
    else if (isImageFile(file)) out.files.push(fileToSource(file));
    else out.skipped += 1;
  }
  return out;
}

/** Collect images and ZIP archives from a normal `<input type="file">` selection. */
export function collectFromFileList(files: FileList | File[]): CollectedSources {
  const out: CollectedSources = { files: [], zips: [], skipped: 0, errors: [] };
  for (const file of Array.from(files)) {
    if (isZipFile(file)) out.zips.push(file);
    else if (isImageFile(file)) {
      const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
      out.files.push(fileToSource(file, relative || file.name));
    } else {
      out.skipped += 1;
    }
  }
  return out;
}

export interface PickFilesOptions {
  multiple?: boolean;
  directory?: boolean;
  accept?: string;
}

/** Opens a native file picker. Resolves to an empty array when cancelled. */
export function pickFiles(options: PickFilesOptions = {}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = options.multiple ?? true;
    if (options.accept) input.accept = options.accept;
    if (options.directory) input.setAttribute('webkitdirectory', '');
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    let settled = false;
    const finish = (files: File[]) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => finish(Array.from(input.files ?? [])));
    input.addEventListener('cancel', () => finish([]));
    document.body.appendChild(input);
    input.click();
  });
}

/** Reads useful EXIF fields without failing the import when metadata is absent. */
export async function readPhotoExif(blob: Blob, fallbackTime?: number): Promise<PhotoExif> {
  let tags: Record<string, unknown> = {};
  try {
    tags =
      ((await exifr.parse(blob, {
        tiff: true,
        exif: true,
        gps: true,
        translateKeys: true,
        translateValues: true,
        reviveValues: true,
        pick: [
          'DateTimeOriginal',
          'CreateDate',
          'DateTimeDigitized',
          'Make',
          'Model',
          'LensModel',
          'Lens',
          'ISO',
          'ISOSpeedRatings',
          'FNumber',
          'ApertureValue',
          'ExposureTime',
          'ShutterSpeedValue',
          'FocalLength',
          'ImageWidth',
          'ImageHeight',
          'ExifImageWidth',
          'ExifImageHeight',
          'latitude',
          'longitude',
          'GPSLatitude',
          'GPSLongitude',
        ],
      })) as Record<string, unknown>) ?? {};
  } catch {
    tags = {};
  }

  const dateValue =
    tags.DateTimeOriginal ?? tags.CreateDate ?? tags.DateTimeDigitized ?? undefined;
  let capturedAt: number | null = null;
  if (dateValue instanceof Date) capturedAt = dateValue.getTime();
  else if (typeof dateValue === 'number') capturedAt = dateValue;
  else if (typeof dateValue === 'string') {
    const parsed = Date.parse(dateValue);
    if (Number.isFinite(parsed)) capturedAt = parsed;
  }
  if (!capturedAt && fallbackTime) capturedAt = fallbackTime;

  const make = typeof tags.Make === 'string' ? tags.Make.trim() : '';
  const model = typeof tags.Model === 'string' ? tags.Model.trim() : '';
  const camera = [make, model].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || undefined;

  let gps: [number, number] | undefined;
  const latitude = typeof tags.latitude === 'number' ? tags.latitude : tags.GPSLatitude;
  const longitude = typeof tags.longitude === 'number' ? tags.longitude : tags.GPSLongitude;
  if (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  ) {
    gps = [latitude, longitude];
  }

  const numeric = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
  };

  const exposureSeconds = numeric(tags.ExposureTime);
  const iso = numeric(tags.ISO) ?? numeric(tags.ISOSpeedRatings);
  const lens =
    typeof tags.LensModel === 'string'
      ? tags.LensModel.trim()
      : typeof tags.Lens === 'string'
        ? tags.Lens.trim()
        : undefined;

  return {
    capturedAt,
    camera,
    lens: lens || undefined,
    iso,
    fNumber: numeric(tags.FNumber),
    exposureTime: formatExposureTime(exposureSeconds),
    focalLength: numeric(tags.FocalLength),
    gps,
    width: numeric(tags.ExifImageWidth) ?? numeric(tags.ImageWidth),
    height: numeric(tags.ExifImageHeight) ?? numeric(tags.ImageHeight),
  };
}

/** Streams a SHA-256 digest so multi-hundred-megabyte files never sit in memory. */
export async function hashBlob(blob: Blob): Promise<string> {
  const hasher = await createSHA256();
  hasher.init();
  if (!blob.stream) {
    hasher.update(new Uint8Array(await blob.arrayBuffer()));
    return hasher.digest('hex');
  }
  const reader = blob.stream().getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength) hasher.update(value);
    }
  } finally {
    reader.releaseLock();
  }
  return hasher.digest('hex');
}

export function makePhotoFromSource(options: {
  projectId: string;
  source: SourceFile;
  contentHash: string;
  exif: PhotoExif;
  consentFace: boolean;
}): Photo {
  const { projectId, source, contentHash, exif, consentFace } = options;
  const extension = extensionOf(source.name);
  const mime = source.blob.type && source.blob.type !== 'application/octet-stream'
    ? source.blob.type
    : mimeFor(extension);
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    projectId,
    name: source.name,
    path: source.path,
    mime,
    size: source.blob.size,
    width: exif.width ?? 0,
    height: exif.height ?? 0,
    capturedAt: exif.capturedAt,
    camera: exif.camera,
    lens: exif.lens,
    iso: exif.iso,
    fNumber: exif.fNumber,
    exposureTime: exif.exposureTime,
    focalLength: exif.focalLength,
    gps: exif.gps,
    contentHash,
    dhash: '',
    status: 'pending',
    faceStatus: consentFace ? 'pending' : 'skipped',
    flags: [],
    tags: [],
    faces: { ...EMPTY_FACE_SUMMARY },
    personIds: [],
    groupIds: [],
    selected: false,
    favorite: false,
    rejected: false,
    rating: 0,
    notes: '',
    aiIndexed: false,
    originalStored: false,
    previewStored: false,
    addedAt: now,
    updatedAt: now,
  };
}

interface ZipEntryMessage {
  type: 'entry';
  name: string;
  blob: Blob;
  size: number;
}

interface ZipProgressMessage {
  type: 'progress';
  read: number;
  total: number;
  extracted: number;
}

interface ZipErrorMessage {
  type: 'error';
  message: string;
}

interface ZipDoneMessage {
  type: 'done';
  extracted: number;
  skipped: number;
  totalBytes: number;
}

type ZipWorkerMessage = ZipEntryMessage | ZipProgressMessage | ZipErrorMessage | ZipDoneMessage;

export interface ZipExtractOptions {
  onEntry: (source: SourceFile) => Promise<void>;
  onProgress?: (update: { read: number; total: number; extracted: number }) => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
}

/** Streams entries out of a ZIP, acknowledging each one after the caller persists it. */
export function extractZip(file: File, options: ZipExtractOptions): Promise<{ extracted: number; skipped: number; totalBytes: number }> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL('../workers/zip.worker.ts', import.meta.url), { type: 'module' });
    let settled = false;
    let extracted = 0;
    let skipped = 0;
    let totalBytes = 0;
    let lastError: string | null = null;
    let chain: Promise<void> = Promise.resolve();

    const finish = (result: { extracted: number; skipped: number; totalBytes: number }) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      options.signal?.removeEventListener('abort', onAbort);
      resolve(result);
    };

    const onAbort = () => {
      lastError = 'Import cancelled.';
      finish({ extracted, skipped, totalBytes });
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });

    worker.onmessage = (event: MessageEvent<ZipWorkerMessage>) => {
      const message = event.data;
      if (!message) return;
      if (message.type === 'entry') {
        const base = message.name.split('/').filter(Boolean).pop() ?? message.name;
        const source: SourceFile = {
          blob: message.blob,
          name: base,
          path: normalizePath(message.name),
          lastModified: Date.now(),
        };
        // Serialise handling so a slow persistent write still applies backpressure to the
        // streaming unzip worker instead of piling every photo into memory.
        chain = chain.then(async () => {
          if (settled || options.signal?.aborted) {
            worker.postMessage({ type: 'ack' });
            return;
          }
          try {
            await options.onEntry(source);
            extracted += 1;
            totalBytes += message.size;
          } catch (error) {
            skipped += 1;
            options.onError?.(error instanceof Error ? error.message : `Could not import ${base}.`);
          } finally {
            worker.postMessage({ type: 'ack' });
          }
        });
        return;
      }
      if (message.type === 'progress') {
        options.onProgress?.(message);
        return;
      }
      if (message.type === 'error') {
        lastError = message.message;
        options.onError?.(message.message);
        return;
      }
      if (message.type === 'done') {
        void chain.then(() => {
          if (lastError && !extracted) {
            finish({ extracted, skipped, totalBytes });
          } else {
            finish({ extracted: message.extracted, skipped: message.skipped, totalBytes: message.totalBytes });
          }
        });
      }
    };

    worker.onerror = (event) => {
      lastError = event.message || 'The ZIP worker failed.';
      options.onError?.(lastError);
      finish({ extracted, skipped, totalBytes });
    };

    worker.postMessage({ type: 'extract', file });
  });
}

export interface IngestOptions {
  projectId: string;
  /** Hashes already present in the project; updated as new photos are ingested. */
  existingHashes: Map<string, string>;
  consentFace: boolean;
  onPhoto: (photo: Photo, file: Blob) => Promise<void>;
  onProgress: (snapshot: ImportProgressSnapshot) => void;
  signal?: AbortSignal;
  totalBytes?: number;
  initialSkipped?: number;
}

interface IngestCounters {
  imported: number;
  duplicates: number;
  skipped: number;
  failed: number;
  processed: number;
  bytesProcessed: number;
  errors: Array<{ name: string; message: string }>;
}

function emptySnapshot(phase: ImportPhase): ImportProgressSnapshot {
  return {
    phase,
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

async function ingestSource(
  source: SourceFile,
  options: IngestOptions,
  counters: IngestCounters,
  progress: ImportProgressSnapshot,
): Promise<void> {
  if (options.signal?.aborted) return;
  if (!supportedName(source.name) && !source.blob.type.startsWith('image/')) {
    counters.skipped += 1;
    return;
  }
  progress.currentName = source.name;
  options.onProgress({ ...progress });

  try {
    const contentHash = await hashBlob(source.blob);
    if (options.signal?.aborted) return;
    const existing = options.existingHashes.get(contentHash);
    if (existing) {
      counters.duplicates += 1;
      counters.processed += 1;
      counters.bytesProcessed += source.blob.size;
      options.onProgress({ ...progress });
      return;
    }

    const exif = await readPhotoExif(source.blob, source.lastModified);
    const photo = makePhotoFromSource({
      projectId: options.projectId,
      source,
      contentHash,
      exif,
      consentFace: options.consentFace,
    });
    options.existingHashes.set(contentHash, photo.id);
    await options.onPhoto(photo, source.blob);
    counters.imported += 1;
    counters.processed += 1;
    counters.bytesProcessed += source.blob.size;
  } catch (error) {
    counters.failed += 1;
    counters.processed += 1;
    counters.bytesProcessed += source.blob.size;
    if (counters.errors.length < 24) {
      counters.errors.push({
        name: source.name,
        message: error instanceof Error ? error.message : 'Unknown import error.',
      });
    }
  } finally {
    options.onProgress({ ...progress });
  }
}

function toStats(counters: IngestCounters, progress: ImportProgressSnapshot): ImportStats {
  return {
    imported: counters.imported,
    duplicates: counters.duplicates,
    skipped: counters.skipped,
    failed: counters.failed,
    originalBytes: progress.bytesProcessed,
    totalBytes: progress.bytesTotal,
    errors: counters.errors,
  };
}

/** Imports loose files and ZIP archives, hashing and reading metadata as it goes. */
export async function ingestSources(
  sources: CollectedSources,
  options: IngestOptions,
): Promise<IngestResult> {
  const counters: IngestCounters = {
    imported: 0,
    duplicates: 0,
    skipped: sources.skipped,
    failed: 0,
    processed: 0,
    bytesProcessed: 0,
    errors: [...sources.errors.map((message) => ({ name: 'Folder', message }))],
  };
  const fileBytes = sources.files.reduce((sum, source) => sum + source.blob.size, 0);
  const zipBytes = sources.zips.reduce((sum, zip) => sum + zip.size, 0);
  const progress: ImportProgressSnapshot = {
    ...emptySnapshot(sources.files.length ? 'reading' : 'extracting'),
    totalFiles: sources.files.length,
    bytesTotal: options.totalBytes ?? fileBytes + zipBytes,
    skipped: counters.skipped,
  };
  options.onProgress({ ...progress });

  for (const source of sources.files) {
    if (options.signal?.aborted) break;
    await ingestSource(source, options, counters, progress);
  }

  if (!options.signal?.aborted) {
    for (const zip of sources.zips) {
      progress.phase = 'extracting';
      progress.currentName = zip.name;
      options.onProgress({ ...progress });
      await extractZip(zip, {
        signal: options.signal,
        onEntry: async (source) => {
          progress.totalFiles += 1;
          await ingestSource(source, options, counters, progress);
        },
        onProgress: (update) => {
          progress.bytesProcessed = Math.max(progress.bytesProcessed, update.read);
          progress.currentName = zip.name;
          options.onProgress({ ...progress });
        },
        onError: (message) => {
          if (counters.errors.length < 24) counters.errors.push({ name: zip.name, message });
        },
      });
    }
  }

  const cancelled = Boolean(options.signal?.aborted);
  progress.phase = cancelled ? 'cancelled' : 'done';
  progress.totalFiles = Math.max(progress.totalFiles, counters.processed);
  progress.processed = counters.processed;
  progress.imported = counters.imported;
  progress.duplicates = counters.duplicates;
  progress.skipped = counters.skipped;
  progress.failed = counters.failed;
  progress.currentName = '';
  options.onProgress({ ...progress });

  return { stats: toStats(counters, progress), cancelled };
}

export function safeExportName(name: string): string {
  return sanitizeFilename(name, 'photo');
}
