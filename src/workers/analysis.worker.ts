/// <reference lib="webworker" />
import type { PhotoAnalysis } from '@/types';

interface AnalyzeMessage {
  type: 'analyze';
  jobId: string;
  photoId: string;
  blob: Blob;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function grayscaleFromImageData(data: Uint8ClampedArray, width: number, height: number): {
  gray: Float32Array;
  saturation: number;
} {
  const gray = new Float32Array(width * height);
  let saturationSum = 0;
  let saturationCount = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    gray[p] = 0.299 * r + 0.587 * g + 0.114 * b;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max > 16) {
      saturationSum += (max - min) / max;
      saturationCount += 1;
    }
  }
  return { gray, saturation: saturationCount ? saturationSum / saturationCount : 0 };
}

function computeHistogram(gray: Float32Array): {
  mean: number;
  median: number;
  p05: number;
  p95: number;
  highlightClip: number;
  shadowClip: number;
} {
  const histogram = new Uint32Array(256);
  let total = 0;
  for (let i = 0; i < gray.length; i += 1) {
    const value = Math.max(0, Math.min(255, Math.round(gray[i])));
    histogram[value] += 1;
    total += value;
  }
  const count = gray.length || 1;
  const percentile = (fraction: number) => {
    const target = count * fraction;
    let cumulative = 0;
    for (let i = 0; i < 256; i += 1) {
      cumulative += histogram[i];
      if (cumulative >= target) return i;
    }
    return 255;
  };
  let shadows = 0;
  let highlights = 0;
  for (let i = 0; i < 8; i += 1) shadows += histogram[i];
  for (let i = 248; i < 256; i += 1) highlights += histogram[i];
  return {
    mean: total / count / 255,
    median: percentile(0.5) / 255,
    p05: percentile(0.05) / 255,
    p95: percentile(0.95) / 255,
    highlightClip: highlights / count,
    shadowClip: shadows / count,
  };
}

function computeSharpness(gray: Float32Array, width: number, height: number): {
  laplacianVar: number;
  tenengrad: number;
  edgeDensity: number;
  saliencyX: number;
  saliencyY: number;
  balance: number;
} {
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  let tenengrad = 0;
  let edges = 0;
  let weightedX = 0;
  let weightedY = 0;
  let weightTotal = 0;
  let left = 0;
  let right = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const laplacian = -4 * gray[i] + gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width];
      sum += laplacian;
      sumSq += laplacian * laplacian;
      count += 1;

      const gx =
        -gray[i - width - 1] -
        2 * gray[i - 1] -
        gray[i + width - 1] +
        gray[i - width + 1] +
        2 * gray[i + 1] +
        gray[i + width + 1];
      const gy =
        -gray[i - width - 1] -
        2 * gray[i - width] -
        gray[i - width + 1] +
        gray[i + width - 1] +
        2 * gray[i + width] +
        gray[i + width + 1];
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      tenengrad += magnitude * magnitude;
      if (magnitude > 42) edges += 1;
      const weight = magnitude + 0.01;
      weightedX += x * weight;
      weightedY += y * weight;
      weightTotal += weight;
      if (x < width / 2) left += weight;
      else right += weight;
    }
  }
  const mean = sum / (count || 1);
  const variance = sumSq / (count || 1) - mean * mean;
  return {
    laplacianVar: Math.max(0, variance),
    tenengrad: tenengrad / (count || 1),
    edgeDensity: edges / (count || 1),
    saliencyX: weightTotal ? weightedX / weightTotal / width : 0.5,
    saliencyY: weightTotal ? weightedY / weightTotal / height : 0.5,
    balance: weightTotal ? Math.abs(left - right) / weightTotal : 0,
  };
}

function computeDhash(bitmap: ImageBitmap): string {
  const canvas = new OffscreenCanvas(9, 8);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return '';
  context.drawImage(bitmap, 0, 0, 9, 8);
  const data = context.getImageData(0, 0, 9, 8).data;
  let hash = 0n;
  let bit = 0n;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const i = (y * 9 + x) * 4;
      const j = (y * 9 + x + 1) * 4;
      const leftLuma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const rightLuma = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
      if (leftLuma > rightLuma) hash |= 1n << bit;
      bit += 1n;
    }
  }
  return hash.toString(16).padStart(16, '0');
}

async function renderBlob(
  bitmap: ImageBitmap,
  maxSide: number,
  quality: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new Error('Could not create a rendering context.');
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
  let blob = await canvas.convertToBlob({ type: 'image/webp', quality });
  if (!blob || blob.type !== 'image/webp') {
    blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  }
  return { blob, width, height };
}

function analysisCanvas(bitmap: ImageBitmap): { data: Uint8ClampedArray; width: number; height: number } {
  const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(8, Math.round(bitmap.width * scale));
  const height = Math.max(8, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
  if (!context) throw new Error('Could not create an analysis context.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  return { data: imageData.data, width, height };
}

async function analyze(message: AnalyzeMessage): Promise<void> {
  const { jobId, photoId, blob } = message;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    const originalWidth = bitmap.width;
    const originalHeight = bitmap.height;
    if (!originalWidth || !originalHeight) throw new Error('Image has no dimensions.');

    const dhash = computeDhash(bitmap);
    const { data, width, height } = analysisCanvas(bitmap);
    const { gray, saturation } = grayscaleFromImageData(data, width, height);
    const histogram = computeHistogram(gray);
    const sharpness = computeSharpness(gray, width, height);

    const analysis: PhotoAnalysis = {
      laplacianVar: sharpness.laplacianVar,
      tenengrad: sharpness.tenengrad,
      edgeDensity: sharpness.edgeDensity,
      meanLuma: histogram.mean,
      medianLuma: histogram.median,
      p05Luma: histogram.p05,
      p95Luma: histogram.p95,
      contrast: Math.max(0, histogram.p95 - histogram.p05),
      saturation,
      highlightClip: histogram.highlightClip,
      shadowClip: histogram.shadowClip,
      saliencyX: sharpness.saliencyX,
      saliencyY: sharpness.saliencyY,
      balance: sharpness.balance,
    };

    const preview = await renderBlob(bitmap, 1800, 0.84);
    const thumb = await renderBlob(bitmap, 520, 0.78);

    ctx.postMessage({
      type: 'result',
      jobId,
      photoId,
      width: originalWidth,
      height: originalHeight,
      dhash,
      analysis,
      preview: preview.blob,
      thumb: thumb.blob,
    });
  } catch (error) {
    ctx.postMessage({
      type: 'error',
      jobId,
      photoId,
      message: error instanceof Error ? error.message : 'Could not analyse this image.',
    });
  } finally {
    bitmap?.close();
  }
}

ctx.onmessage = (event: MessageEvent<AnalyzeMessage>) => {
  const message = event.data;
  if (message?.type === 'analyze') {
    void analyze(message);
  }
};

export {};
