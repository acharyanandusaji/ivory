import type { FaceSummary, Photo, PhotoAnalysis, PhotoFlag, PhotoGroup, PhotoScores } from '@/types';
import { clamp } from './utils';

export interface LibraryNorms {
  lapP10: number;
  lapP25: number;
  lapP50: number;
  lapP75: number;
  lapP90: number;
  exposureP25: number;
  exposureP50: number;
  exposureP75: number;
}

export const EMPTY_FACE_SUMMARY: FaceSummary = {
  faceCount: 0,
  smilingCount: 0,
  eyesClosedCount: 0,
  lookingCount: 0,
  maxFaceArea: 0,
  avgFaceScore: 0,
  avgSmile: 0,
  avgFaceSharpness: 0,
  avgFaceX: 0.5,
  avgFaceY: 0.5,
};

export function computeNorms(photos: Photo[]): LibraryNorms {
  const laps = photos
    .map((photo) => photo.analysis?.laplacianVar)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .map((value) => Math.log1p(Math.max(0, value)))
    .sort((a, b) => a - b);

  const luma = photos
    .map((photo) => photo.analysis?.meanLuma)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .sort((a, b) => a - b);

  const pick = (values: number[], p: number, fallback: number) => {
    if (!values.length) return fallback;
    const index = clamp(Math.round((values.length - 1) * p), 0, values.length - 1);
    return values[index];
  };

  return {
    lapP10: pick(laps, 0.1, Math.log1p(18)),
    lapP25: pick(laps, 0.25, Math.log1p(45)),
    lapP50: pick(laps, 0.5, Math.log1p(140)),
    lapP75: pick(laps, 0.75, Math.log1p(420)),
    lapP90: pick(laps, 0.9, Math.log1p(900)),
    exposureP25: pick(luma, 0.25, 0.32),
    exposureP50: pick(luma, 0.5, 0.5),
    exposureP75: pick(luma, 0.75, 0.65),
  };
}

/** Absolute sharpness curve, calibrated on a 512px long-edge grayscale render. */
export function absoluteSharpness(laplacianVar: number): number {
  const value = Math.log1p(Math.max(0, laplacianVar));
  const min = Math.log1p(6);
  const max = Math.log1p(1400);
  return clamp(((value - min) / (max - min)) * 100);
}

export function percentileSharpness(laplacianVar: number, norms: LibraryNorms): number {
  const value = Math.log1p(Math.max(0, laplacianVar));
  if (value <= norms.lapP10) return clamp(((value - Math.log1p(6)) / (norms.lapP10 - Math.log1p(6))) * 22);
  const anchors: Array<[number, number]> = [
    [norms.lapP10, 22],
    [norms.lapP25, 38],
    [norms.lapP50, 62],
    [norms.lapP75, 80],
    [norms.lapP90, 92],
  ];
  if (value >= norms.lapP90) return clamp(92 + ((value - norms.lapP90) / Math.max(0.2, norms.lapP90 - norms.lapP75)) * 8);
  for (let i = 1; i < anchors.length; i += 1) {
    const [x0, y0] = anchors[i - 1];
    const [x1, y1] = anchors[i];
    if (value <= x1) {
      const t = (value - x0) / Math.max(0.0001, x1 - x0);
      return y0 + (y1 - y0) * t;
    }
  }
  return 92;
}

export function exposureScore(analysis: PhotoAnalysis): number {
  const meanPenalty = Math.abs(analysis.meanLuma - 0.52) * 120;
  const highlightPenalty = analysis.highlightClip * 260;
  const shadowPenalty = analysis.shadowClip * 170;
  const contrastBonus = analysis.contrast * 6;
  const flatPenalty = analysis.contrast < 0.08 ? 14 : 0;
  return clamp(100 - meanPenalty - highlightPenalty - shadowPenalty + contrastBonus - flatPenalty);
}

export function compositionScore(analysis: PhotoAnalysis, faces: FaceSummary): number {
  const focusX = faces.faceCount > 0 ? faces.avgFaceX : analysis.saliencyX;
  const focusY = faces.faceCount > 0 ? faces.avgFaceY : analysis.saliencyY;
  const thirds = [1 / 3, 2 / 3];
  let best = 1;
  for (const x of thirds) {
    for (const y of thirds) {
      const distance = Math.hypot(focusX - x, focusY - y);
      best = Math.min(best, distance);
    }
  }
  const placement = 100 - Math.min(1, best / 0.42) * 55;
  const centerDistance = Math.hypot(focusX - 0.5, focusY - 0.5);
  const centerPenalty = centerDistance < 0.035 ? 6 : 0;
  const balanceScore = clamp(100 - Math.abs(analysis.balance) * 45);
  const edgePenalty =
    focusX < 0.06 || focusX > 0.94 || focusY < 0.05 || focusY > 0.95 ? 20 : 0;
  return clamp(placement * 0.55 + balanceScore * 0.25 + 70 * 0.2 - centerPenalty - edgePenalty);
}

export function faceScore(faces: FaceSummary): number {
  if (!faces.faceCount) return 55;
  const smile = clamp(faces.avgSmile * 115);
  const eyesOpen = clamp(100 - (faces.eyesClosedCount / faces.faceCount) * 130);
  const looking = clamp(42 + (faces.lookingCount / faces.faceCount) * 58);
  const size = clamp(faces.maxFaceArea * 900);
  const sharp = clamp(faces.avgFaceSharpness || 55);
  const quality = clamp(faces.avgFaceScore || 55);
  return clamp(
    smile * 0.26 + eyesOpen * 0.25 + looking * 0.18 + size * 0.12 + sharp * 0.1 + quality * 0.09,
  );
}

export function deriveFlags(
  photo: Photo,
  norms: LibraryNorms,
  sharpness: number,
  exposure: number,
  composition: number,
): PhotoFlag[] {
  const flags = new Set<PhotoFlag>();
  const analysis = photo.analysis;
  const faces = photo.faces;
  if (!analysis) return [];

  const isLowAbsolute = analysis.laplacianVar < 18;
  const isLowRelative = sharpness < 22 && analysis.laplacianVar < Math.expm1(norms.lapP25) * 0.55;
  const faceSharp = faces.faceCount > 0 && faces.avgFaceSharpness >= 54;
  if (!faceSharp && (isLowAbsolute || isLowRelative)) flags.add('blurry');

  if (
    analysis.highlightClip > 0.055 ||
    (analysis.meanLuma > 0.72 && analysis.highlightClip > 0.012) ||
    exposure < 38
  ) {
    flags.add('overexposed');
  }
  if (analysis.meanLuma < 0.235 || analysis.shadowClip > 0.33 || (exposure < 34 && analysis.meanLuma < 0.4)) {
    flags.add('underexposed');
  }
  if (faces.faceCount > 0) {
    const ratio = faces.eyesClosedCount / faces.faceCount;
    if (ratio >= 0.5 || (faces.faceCount <= 2 && faces.eyesClosedCount > 0)) flags.add('closed-eyes');
  }
  if (composition < 34) flags.add('poor-composition');
  if (photo.width * photo.height > 0 && photo.width * photo.height < 1_800_000) flags.add('low-resolution');
  return Array.from(flags);
}

export function deriveTags(photo: Photo, scores?: PhotoScores): string[] {
  const tags = new Set<string>();
  const faces = photo.faces;
  const analysis = photo.analysis;
  if (!analysis) return [];
  if (faces.faceCount >= 3) tags.add('group');
  if (faces.faceCount === 2) tags.add('couple');
  if (faces.faceCount === 1) tags.add('portrait');
  if (faces.faceCount === 0) tags.add('no-people');
  if (faces.faceCount > 0 && faces.lookingCount / faces.faceCount >= 0.6) tags.add('posed');
  if (faces.faceCount > 0 && faces.lookingCount / faces.faceCount < 0.45) tags.add('candid');
  if (faces.smilingCount > 0) tags.add('smiling');
  if (faces.faceCount > 0 && faces.eyesClosedCount === 0) tags.add('eyes-open');
  if (faces.faceCount > 0 && faces.eyesClosedCount > 0) tags.add('blinking');
  if (faces.faceCount > 0 && faces.lookingCount === faces.faceCount) tags.add('looking-at-camera');
  if (faces.maxFaceArea > 0.075) tags.add('close-up');
  if (faces.faceCount >= 3 && faces.maxFaceArea < 0.018) tags.add('wide');
  if (analysis.meanLuma < 0.3) tags.add('low-light');
  if (analysis.highlightClip > 0.04) tags.add('high-key');
  if (analysis.saturation > 0.42) tags.add('vibrant');
  if (photo.width > photo.height) tags.add('landscape');
  else if (photo.height > photo.width) tags.add('portrait-orientation');
  if (scores && scores.overall >= 75) tags.add('top-rated');
  return Array.from(tags);
}

export function scorePhoto(photo: Photo, norms: LibraryNorms): Photo {
  if (!photo.analysis) return photo;
  const sharpAbs = absoluteSharpness(photo.analysis.laplacianVar);
  const sharpPct = percentileSharpness(photo.analysis.laplacianVar, norms);
  let sharpness = clamp(sharpAbs * 0.55 + sharpPct * 0.45);
  if (photo.faces.faceCount > 0 && photo.faces.avgFaceSharpness > 0) {
    sharpness = Math.max(sharpness * 0.8 + photo.faces.avgFaceSharpness * 0.2, photo.faces.avgFaceSharpness * 0.72);
  }
  const exposure = exposureScore(photo.analysis);
  const composition = compositionScore(photo.analysis, photo.faces);
  const faces = faceScore(photo.faces);
  const overall = clamp(
    sharpness * 0.36 + exposure * 0.24 + composition * 0.16 + faces * 0.24,
  );
  const scores: PhotoScores = {
    overall: Math.round(overall),
    sharpness: Math.round(sharpness),
    exposure: Math.round(exposure),
    composition: Math.round(composition),
    faces: Math.round(faces),
  };
  const flags = deriveFlags(photo, norms, sharpness, exposure, composition);
  for (const existing of photo.flags) {
    if (existing === 'duplicate' || existing === 'repetitive') flags.push(existing);
  }
  return {
    ...photo,
    scores,
    flags: Array.from(new Set(flags)),
    tags: deriveTags(photo, scores),
    updatedAt: Date.now(),
  };
}

export function recomputeScores(photos: Photo[], norms = computeNorms(photos)): Photo[] {
  return photos.map((photo) => scorePhoto(photo, norms));
}

export function applyGroupFlags(photos: Photo[], groups: PhotoGroup[]): Photo[] {
  const byPhoto = new Map<string, { duplicate: boolean; repetitive: boolean }>();
  for (const group of groups) {
    for (const photoId of group.photoIds) {
      const entry = byPhoto.get(photoId) ?? { duplicate: false, repetitive: false };
      if (group.type === 'exact' || group.type === 'similar') entry.duplicate = true;
      if (group.type === 'burst') entry.repetitive = true;
      byPhoto.set(photoId, entry);
    }
  }
  return photos.map((photo) => {
    const entry = byPhoto.get(photo.id);
    const flags: PhotoFlag[] = photo.flags.filter((flag) => flag !== 'duplicate' && flag !== 'repetitive');
    if (entry?.duplicate) flags.push('duplicate');
    if (entry?.repetitive) flags.push('repetitive');
    return { ...photo, flags };
  });
}

export function bestPhoto(photos: Photo[]): Photo | undefined {
  return photos.reduce<Photo | undefined>((best, photo) => {
    if (!best) return photo;
    return (photo.scores?.overall ?? 0) > (best.scores?.overall ?? 0) ? photo : best;
  }, undefined);
}

export function qualityLabel(score: number): string {
  if (score >= 82) return 'Exceptional';
  if (score >= 70) return 'Excellent';
  if (score >= 58) return 'Good';
  if (score >= 44) return 'Fair';
  return 'Weak';
}
