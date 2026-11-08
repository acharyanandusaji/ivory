/// <reference lib="webworker" />
import { AsyncUnzipInflate, Unzip } from 'fflate';

interface ExtractMessage {
  type: 'extract';
  file: File;
}

interface AckMessage {
  type: 'ack';
}

type WorkerMessage = ExtractMessage | AckMessage;

const ctx = self as unknown as DedicatedWorkerGlobalScope;

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp']);
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  bmp: 'image/bmp',
};

const MAX_ENTRIES = 30_000;
const MAX_TOTAL_BYTES = 30 * 1024 * 1024 * 1024;
const MAX_OUTSTANDING = 5;

let entryQueue: Array<{ name: string; blob: Blob; size: number }> = [];
let outstanding = 0;
let capacityWaiters: Array<() => void> = [];

function notifyCapacity(): void {
  const waiters = capacityWaiters;
  capacityWaiters = [];
  for (const waiter of waiters) waiter();
}

function pump(): void {
  while (outstanding < MAX_OUTSTANDING && entryQueue.length) {
    const entry = entryQueue.shift()!;
    outstanding += 1;
    ctx.postMessage({ type: 'entry', name: entry.name, blob: entry.blob, size: entry.size });
  }
  if (outstanding < MAX_OUTSTANDING) notifyCapacity();
}

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index + 1).toLowerCase() : '';
}

function isWanted(name: string): boolean {
  const normalised = name.replace(/\\/g, '/');
  if (normalised.startsWith('__MACOSX/') || normalised.includes('/__MACOSX/')) return false;
  const base = normalised.split('/').pop() ?? '';
  if (!base || base.startsWith('.')) return false;
  return IMAGE_EXTENSIONS.has(extensionOf(base));
}

async function extract(file: File): Promise<void> {
  const unzipper = new Unzip();
  unzipper.register(AsyncUnzipInflate);

  let pendingEntries = 0;
  let entryCount = 0;
  let skipped = 0;
  let totalBytes = 0;
  let aborted: string | null = null;

  unzipper.onfile = (entry) => {
    const name = entry.name.replace(/\\/g, '/');
    if (name.endsWith('/')) return;
    entryCount += 1;
    if (entryCount > MAX_ENTRIES) {
      aborted = `This archive contains more than ${MAX_ENTRIES.toLocaleString()} files.`;
      return;
    }
    const wanted = isWanted(name);
    if (!wanted) skipped += 1;
    if (!wanted) {
      entry.ondata = () => {};
      entry.start();
      return;
    }

    pendingEntries += 1;
    const chunks: Uint8Array[] = [];
    entry.ondata = (error, chunk, final) => {
      if (aborted) return;
      if (error) {
        pendingEntries = Math.max(0, pendingEntries - 1);
        ctx.postMessage({ type: 'error', message: `Could not extract ${name}: ${error.message}` });
        return;
      }
      if (chunk?.length) chunks.push(chunk);
      if (final) {
        pendingEntries = Math.max(0, pendingEntries - 1);
        const extension = extensionOf(name);
        const blob = new Blob(chunks, { type: MIME_BY_EXTENSION[extension] ?? 'application/octet-stream' });
        totalBytes += blob.size;
        if (totalBytes > MAX_TOTAL_BYTES) {
          aborted = 'This archive is larger than the 30 GB import safety limit.';
          return;
        }
        const base = name.split('/').filter(Boolean).pop() ?? name;
        entryQueue.push({ name, blob, size: blob.size });
        if (!base) skipped += 1;
        pump();
      }
    };
    entry.start();
  };

  const reader = file.stream().getReader();
  let read = 0;
  let lastReported = 0;
  try {
    while (true) {
      if (aborted) break;
      if (outstanding >= MAX_OUTSTANDING) {
        await new Promise<void>((resolve) => capacityWaiters.push(resolve));
      }
      const { done, value } = await reader.read();
      if (done) {
        unzipper.push(new Uint8Array(0), true);
        break;
      }
      if (value) {
        read += value.byteLength;
        unzipper.push(value, false);
        if (read - lastReported > 1_500_000) {
          lastReported = read;
          ctx.postMessage({ type: 'progress', read, total: file.size, extracted: entryCount - skipped });
        }
      }
      pump();
    }

    // Wait for async inflate callbacks and the main thread to consume entries.
    const started = Date.now();
    while (pendingEntries > 0 || entryQueue.length > 0 || outstanding > 0) {
      if (aborted) break;
      if (Date.now() - started > 10 * 60_000) {
        aborted = 'ZIP extraction timed out while waiting for the archive to finish.';
        break;
      }
      pump();
      await new Promise((resolve) => setTimeout(resolve, 25));
      if (outstanding === 0) pump();
    }

    if (aborted) {
      ctx.postMessage({ type: 'error', message: aborted });
    } else {
      ctx.postMessage({
        type: 'done',
        extracted: entryCount - skipped,
        skipped,
        totalBytes,
      });
    }
  } catch (error) {
    ctx.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Could not read this ZIP archive.',
    });
  } finally {
    reader.releaseLock();
  }
}

ctx.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;
  if (!message) return;
  if (message.type === 'ack') {
    outstanding = Math.max(0, outstanding - 1);
    pump();
  } else if (message.type === 'extract') {
    void extract(message.file);
  }
};

export {};
