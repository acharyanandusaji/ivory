/// <reference lib="webworker" />
import type { FaceBox } from '@/lib/faceMetrics';
import { estimateHeadPose, eyesOpenScore, faceQuality, faceCompositionScore } from '@/lib/faceMetrics';
import { clamp } from '@/lib/utils';

const ctx = self as unknown as DedicatedWorkerGlobalScope & Record<string, unknown>;

interface InitMessage {
  type: 'init';
  modelBaseUrl: string;
  detector: 'tiny' | 'ssd';
  threshold: number;
}

interface AnalyzeMessage {
  type: 'analyze';
  jobId: string;
  photoId: string;
  blob: Blob;
  detector: 'tiny' | 'ssd';
  threshold: number;
}

type WorkerMessage = InitMessage | AnalyzeMessage;

interface WorkerFace {
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
}

let faceapi: any = null;
let backend: 'webgl' | 'cpu' | null = null;
let activeDetector: 'tiny' | 'ssd' | null = null;
let initPromise: Promise<void> | null = null;
let initPromiseDetector: 'tiny' | 'ssd' | null = null;
let modelBaseUrl = '';

function post(message: unknown, transfer: Transferable[] = []): void {
  ctx.postMessage(message, transfer);
}

function setupWorkerGlobals(): void {
  const g = ctx as any;
  if (typeof g.window === 'undefined') g.window = g;
  if (typeof g.document === 'undefined') {
    g.document = {
      createElement: (tag: string) => {
        if (tag === 'canvas') return new OffscreenCanvas(2, 2);
        return {};
      },
      getElementById: () => null,
    };
  }
  if (typeof g.HTMLCanvasElement === 'undefined') g.HTMLCanvasElement = OffscreenCanvas;
  if (typeof g.HTMLImageElement === 'undefined') g.HTMLImageElement = class {};
  if (typeof g.HTMLVideoElement === 'undefined') g.HTMLVideoElement = class {};
  if (typeof g.CanvasRenderingContext2D === 'undefined') {
    g.CanvasRenderingContext2D = (ctx as any).OffscreenCanvasRenderingContext2D ?? class {};
  }
}

async function loadFaceApi(): Promise<void> {
  if (faceapi) return;
  setupWorkerGlobals();
  const module = await import('@vladmandic/face-api');
  faceapi = module;
  const tf = (module as any).tf;
  try {
    const success = await tf.setBackend('webgl');
    if (!success) throw new Error('WebGL unavailable');
    await tf.ready();
    backend = 'webgl';
  } catch {
    try {
      await tf.setBackend('cpu');
      await tf.ready();
      backend = 'cpu';
    } catch (error) {
      backend = null;
      throw new Error('No TensorFlow.js backend is available in this browser.');
    }
  }
  post({ type: 'status', message: `Face engine ready (${backend})`, backend });
}

async function ensureModels(detector: 'tiny' | 'ssd'): Promise<void> {
  if (!faceapi) await loadFaceApi();
  if (activeDetector === detector) return;
  if (initPromise && initPromiseDetector === detector) {
    await initPromise;
    return;
  }
  initPromiseDetector = detector;
  initPromise = (async () => {
    post({ type: 'status', message: 'Loading face models…' });
    const base = modelBaseUrl.replace(/\/$/, '');
    const loads: Array<Promise<void>> = [
      faceapi.nets.faceLandmark68Net.loadFromUri(base),
      faceapi.nets.faceExpressionNet.loadFromUri(base),
      faceapi.nets.faceRecognitionNet.loadFromUri(base),
    ];
    if (detector === 'ssd') loads.push(faceapi.nets.ssdMobilenetv1.loadFromUri(base));
    else loads.push(faceapi.nets.tinyFaceDetector.loadFromUri(base));
    await Promise.all(loads);
    activeDetector = detector;
    post({ type: 'status', message: 'Face models loaded', ready: true });
  })();
  try {
    await initPromise;
  } finally {
    initPromise = null;
  }
}

function laplacianVariance(gray: Uint8ClampedArray, width: number, height: number): number {
  if (width < 4 || height < 4) return 0;
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const value = -4 * gray[i] + gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width];
      sum += value;
      sumSq += value * value;
      count += 1;
    }
  }
  const mean = sum / (count || 1);
  return Math.max(0, sumSq / (count || 1) - mean * mean);
}

function faceSharpnessFromCanvas(canvas: OffscreenCanvas): number {
  const small = new OffscreenCanvas(128, 128);
  const context = small.getContext('2d', { willReadFrequently: true, alpha: false });
  if (!context) return 0;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 128, 128);
  context.drawImage(canvas, 0, 0, 128, 128);
  const image = context.getImageData(0, 0, 128, 128);
  const gray = new Uint8ClampedArray(128 * 128);
  for (let i = 0, p = 0; i < image.data.length; i += 4, p += 1) {
    gray[p] = 0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2];
  }
  const variance = laplacianVariance(gray, 128, 128);
  return clamp(((Math.log1p(variance) - Math.log1p(4)) / (Math.log1p(900) - Math.log1p(4))) * 100);
}

function makeFaceCrop(
  source: OffscreenCanvas,
  box: FaceBox,
  sourceWidth: number,
  sourceHeight: number,
): OffscreenCanvas {
  const crop = new OffscreenCanvas(112, 112);
  const context = crop.getContext('2d', { alpha: false });
  if (!context) return crop;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 112, 112);
  const padding = 0.35;
  const cx = (box.x + box.width / 2) * sourceWidth;
  const cy = (box.y + box.height / 2) * sourceHeight;
  const size = Math.max(box.width * sourceWidth, box.height * sourceHeight) * (1 + padding * 2);
  const sx = cx - size / 2;
  const sy = cy - size / 2;
  context.drawImage(source, sx, sy, size, size, 0, 0, 112, 112);
  return crop;
}

async function analyzeFaceJob(message: AnalyzeMessage): Promise<void> {
  const { jobId, photoId } = message;
  let bitmap: ImageBitmap | null = null;
  try {
    await ensureModels(message.detector);
    const tf = faceapi.tf;
    bitmap = await createImageBitmap(message.blob, { imageOrientation: 'from-image' });
    const scale = Math.min(1, 1440 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(32, Math.round(bitmap.width * scale));
    const height = Math.max(32, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
    if (!context) throw new Error('Could not create a face analysis canvas.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);

    const tensor = tf.browser.fromPixels(canvas);
    const options =
      message.detector === 'ssd'
        ? new faceapi.SsdMobilenetv1Options({ minConfidence: message.threshold })
        : new faceapi.TinyFaceDetectorOptions({
            inputSize: 608,
            scoreThreshold: message.threshold,
          });

    let results: any[] = [];
    try {
      results = await faceapi
        .detectAllFaces(tensor, options)
        .withFaceLandmarks()
        .withFaceExpressions()
        .withFaceDescriptors();
    } finally {
      tensor.dispose();
    }

    const faces: WorkerFace[] = [];
    const crops: Blob[] = [];
    for (const result of results) {
      const detection = result.detection;
      const boxPixels = detection.box;
      const box: FaceBox = {
        x: clamp(boxPixels.x / width, 0, 1),
        y: clamp(boxPixels.y / height, 0, 1),
        width: clamp(boxPixels.width / width, 0.001, 1),
        height: clamp(boxPixels.height / height, 0.001, 1),
      };
      const points = result.landmarks?.positions ?? [];
      const eyesOpen = points.length ? eyesOpenScore(points) : 0.7;
      const pose = points.length
        ? estimateHeadPose(points, {
            x: boxPixels.x,
            y: boxPixels.y,
            width: boxPixels.width,
            height: boxPixels.height,
          })
        : { yaw: 0, pitch: 0, lookingAtCamera: true };
      const expressions = result.expressions ?? {};
      const smile = clamp(expressions.happy ?? 0);
      const crop = makeFaceCrop(canvas, box, width, height);
      const faceSharpness = faceSharpnessFromCanvas(crop);
      const faceScore = faceQuality({
        detectionScore: detection.score ?? 0.5,
        smile,
        eyesOpen,
        lookingAtCamera: pose.lookingAtCamera,
        faceSharpness,
        box,
      }) * 0.82 + faceCompositionScore(box) * 0.18;
      faces.push({
        box,
        detectionScore: detection.score ?? 0.5,
        smile,
        eyesOpen,
        lookingAtCamera: pose.lookingAtCamera,
        yaw: pose.yaw,
        pitch: pose.pitch,
        faceSharpness,
        faceScore,
        descriptor: Array.from(result.descriptor as Float32Array),
      });
      const blob = await crop.convertToBlob({ type: 'image/webp', quality: 0.8 });
      crops.push(blob);
    }

    post(
      {
        type: 'result',
        jobId,
        photoId,
        faces,
        crops,
        width,
        height,
        backend,
      },
      [],
    );
  } catch (error) {
    post({
      type: 'error',
      jobId,
      photoId,
      message: error instanceof Error ? error.message : 'Face analysis failed.',
    });
  } finally {
    bitmap?.close();
  }
}

ctx.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;
  if (!message) return;
  if (message.type === 'init') {
    modelBaseUrl = message.modelBaseUrl;
    ensureModels(message.detector).catch((error) => {
      post({
        type: 'error',
        jobId: 'init',
        message: error instanceof Error ? error.message : 'Could not load face models.',
      });
    });
  } else if (message.type === 'analyze') {
    void analyzeFaceJob(message);
  }
};

export {};
