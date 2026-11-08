/// <reference lib="webworker" />
import {
  AutoProcessor,
  AutoTokenizer,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  RawImage,
  env,
} from '@huggingface/transformers';
import { CLIP_MODEL_ID } from '@/lib/constants';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

interface LoadMessage {
  type: 'load';
  ortBaseUrl: string;
}

interface IndexMessage {
  type: 'index';
  jobId: string;
  photoId: string;
  blob: Blob;
}

interface QueryMessage {
  type: 'query';
  jobId: string;
  text: string;
}

type WorkerMessage = LoadMessage | IndexMessage | QueryMessage;

let processor: any = null;
let tokenizer: any = null;
let visionModel: any = null;
let textModel: any = null;
let loadPromise: Promise<void> | null = null;
let loaded = false;
let lastProgressAt = 0;

function post(message: unknown, transfer: Transferable[] = []): void {
  ctx.postMessage(message, transfer);
}

function progressCallback(data: any): void {
  if (data?.status === 'progress' && data.progress != null) {
    const now = Date.now();
    if (now - lastProgressAt < 250 && data.progress < 100) return;
    lastProgressAt = now;
    post({
      type: 'download',
      file: data.file ?? data.name ?? 'model',
      progress: Math.max(0, Math.min(100, Math.round(data.progress))),
      loaded: data.loaded,
      total: data.total,
    });
  } else if (data?.status === 'ready') {
    post({ type: 'download', file: '', progress: 100 });
  }
}

async function ensureModels(ortBaseUrl?: string): Promise<void> {
  if (loaded) return;
  if (loadPromise) {
    await loadPromise;
    return;
  }
  loadPromise = (async () => {
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    try {
      if (ortBaseUrl) {
        (env.backends.onnx.wasm as any).wasmPaths = ortBaseUrl.replace(/\/?$/, '/');
      }
      (env.backends.onnx.wasm as any).numThreads = 1;
    } catch {
      // Older transformers.js versions may expose a different wasm config shape.
    }

    post({ type: 'status', message: 'Loading CLIP vision model…', state: 'loading' });
    processor = await AutoProcessor.from_pretrained(CLIP_MODEL_ID, {
      progress_callback: progressCallback,
    });
    tokenizer = await AutoTokenizer.from_pretrained(CLIP_MODEL_ID, {
      progress_callback: progressCallback,
    });
    visionModel = await CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL_ID, {
      dtype: 'q8',
      progress_callback: progressCallback,
    });
    textModel = await CLIPTextModelWithProjection.from_pretrained(CLIP_MODEL_ID, {
      dtype: 'q8',
      progress_callback: progressCallback,
    });
    loaded = true;
    post({ type: 'status', message: 'Visual search model ready', state: 'ready' });
  })();
  try {
    await loadPromise;
  } catch (error) {
    loadPromise = null;
    throw error;
  }
}

function normalise(vector: Float32Array): Float32Array {
  let norm = 0;
  for (const value of vector) norm += value * value;
  const length = Math.sqrt(norm) || 1;
  const result = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i += 1) result[i] = vector[i] / length;
  return result;
}

async function imageEmbedding(blob: Blob): Promise<Float32Array> {
  if (!processor || !visionModel) throw new Error('Vision model is not loaded.');
  const image = await RawImage.fromBlob(blob);
  const inputs = await processor(image);
  try {
    const output = await visionModel(inputs);
    const data = output.image_embeds.data as Float32Array;
    return normalise(new Float32Array(data));
  } finally {
    inputs?.pixel_values?.dispose?.();
  }
}

async function textEmbedding(text: string): Promise<Float32Array> {
  if (!tokenizer || !textModel) throw new Error('Text model is not loaded.');
  const inputs = tokenizer([text], { padding: true, truncation: true });
  try {
    const output = await textModel(inputs);
    const data = output.text_embeds.data as Float32Array;
    return normalise(new Float32Array(data));
  } finally {
    inputs?.input_ids?.dispose?.();
    inputs?.attention_mask?.dispose?.();
  }
}

async function handle(message: WorkerMessage): Promise<void> {
  if (message.type === 'load') {
    await ensureModels(message.ortBaseUrl);
    return;
  }
  if (message.type === 'index') {
    await ensureModels();
    const vector = await imageEmbedding(message.blob);
    post({ type: 'embedding', jobId: message.jobId, photoId: message.photoId, vector }, [vector.buffer]);
    return;
  }
  if (message.type === 'query') {
    await ensureModels();
    const vector = await textEmbedding(message.text);
    post({ type: 'textEmbedding', jobId: message.jobId, text: message.text, vector }, [vector.buffer]);
  }
}

ctx.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;
  if (!message) return;
  void handle(message).catch((error) => {
    post({
      type: 'error',
      jobId: (message as any).jobId ?? 'init',
      message: error instanceof Error ? error.message : 'Visual search failed.',
    });
  });
};

export {};
