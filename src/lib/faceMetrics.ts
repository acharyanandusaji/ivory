import type { FaceSummary } from '@/types';
import { EYE_LEFT, EYE_RIGHT } from './constants';
import { clamp } from './utils';

export interface Point {
  x: number;
  y: number;
}

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function eyeAspectRatio(points: Point[], indices: readonly number[] | number[]): number {
  const [p1, p2, p3, p4, p5, p6] = indices.map((index) => points[index]);
  if (!p1 || !p6) return 0;
  const horizontal = Math.hypot(p1.x - p4.x, p1.y - p4.y);
  if (!horizontal) return 0;
  const verticalA = Math.hypot(p2.x - p6.x, p2.y - p6.y);
  const verticalB = Math.hypot(p3.x - p5.x, p3.y - p5.y);
  return (verticalA + verticalB) / (2 * horizontal);
}

export function eyesOpenScore(points: Point[]): number {
  const left = eyeAspectRatio(points, EYE_LEFT);
  const right = eyeAspectRatio(points, EYE_RIGHT);
  const ear = (left + right) / 2;
  return clamp((ear - 0.115) / 0.18, 0, 1);
}

export interface HeadPose {
  yaw: number;
  pitch: number;
  lookingAtCamera: boolean;
}

export function estimateHeadPose(points: Point[], box: FaceBox): HeadPose {
  const leftEye = points[36];
  const rightEye = points[45];
  const nose = points[30];
  const mouth = points[51];
  if (!leftEye || !rightEye || !nose || !mouth) {
    return { yaw: 0, pitch: 0, lookingAtCamera: true };
  }
  const eyeDistance = Math.max(1, rightEye.x - leftEye.x);
  const yawRatio = (nose.x - leftEye.x) / eyeDistance;
  const yaw = (yawRatio - 0.5) * 2;
  const eyeY = (leftEye.y + rightEye.y) / 2;
  const mouthGap = Math.max(1, mouth.y - eyeY);
  const pitchRatio = (nose.y - eyeY) / mouthGap;
  const pitch = (pitchRatio - 0.55) * 2;

  const faceWidth = Math.max(1, box.width);
  const roll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
  const lookingAtCamera =
    Math.abs(yaw) < 0.26 &&
    Math.abs(pitch) < 0.55 &&
    Math.abs(roll) < 0.5 &&
    box.width > 0.014 &&
    box.height > 0.014 &&
    faceWidth > 0;
  return { yaw, pitch, lookingAtCamera };
}

export function smileFromExpressions(expressions: Record<string, number>): number {
  return clamp(expressions.happy ?? 0);
}

export function faceCompositionScore(box: FaceBox): number {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  let best = 1;
  for (const x of [1 / 3, 2 / 3]) {
    for (const y of [1 / 3, 2 / 3]) {
      best = Math.min(best, Math.hypot(cx - x, cy - y));
    }
  }
  const placement = 100 - Math.min(1, best / 0.4) * 50;
  const size = clamp(Math.sqrt(box.width * box.height) * 520);
  const edgePenalty = cx < 0.05 || cx > 0.95 || cy < 0.04 || cy > 0.96 ? 18 : 0;
  return clamp(placement * 0.72 + size * 0.28 - edgePenalty);
}

export function faceQuality(face: {
  detectionScore: number;
  smile: number;
  eyesOpen: number;
  lookingAtCamera: boolean;
  faceSharpness: number;
  box: FaceBox;
}): number {
  const size = clamp(Math.sqrt(face.box.width * face.box.height) * 560);
  const score =
    face.faceSharpness * 0.32 +
    size * 0.2 +
    face.detectionScore * 100 * 0.13 +
    face.smile * 100 * 0.14 +
    face.eyesOpen * 100 * 0.13 +
    (face.lookingAtCamera ? 100 : 52) * 0.08;
  return clamp(score);
}

export function summarizeFaces(
  faces: Array<{
    box: FaceBox;
    smile: number;
    eyesOpen: number;
    lookingAtCamera: boolean;
    faceSharpness: number;
    faceScore: number;
  }>,
): FaceSummary {
  if (!faces.length) {
    return {
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
  }
  let smile = 0;
  let sharp = 0;
  let quality = 0;
  let x = 0;
  let y = 0;
  let maxArea = 0;
  let smiling = 0;
  let closed = 0;
  let looking = 0;
  for (const face of faces) {
    smile += face.smile;
    sharp += face.faceSharpness;
    quality += face.faceScore;
    x += face.box.x + face.box.width / 2;
    y += face.box.y + face.box.height / 2;
    maxArea = Math.max(maxArea, face.box.width * face.box.height);
    if (face.smile >= 0.5) smiling += 1;
    if (face.eyesOpen < 0.35) closed += 1;
    if (face.lookingAtCamera) looking += 1;
  }
  const count = faces.length;
  return {
    faceCount: count,
    smilingCount: smiling,
    eyesClosedCount: closed,
    lookingCount: looking,
    maxFaceArea: maxArea,
    avgFaceScore: quality / count,
    avgSmile: smile / count,
    avgFaceSharpness: sharp / count,
    avgFaceX: x / count,
    avgFaceY: y / count,
  };
}
