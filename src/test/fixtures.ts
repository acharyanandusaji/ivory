import type {
  EventRecord,
  FaceSummary,
  Person,
  Photo,
  PhotoAnalysis,
  PhotoScores,
  Project,
} from '@/types';
import { DEFAULT_PROJECT_SETTINGS } from '@/lib/constants';
import { EMPTY_FACE_SUMMARY } from '@/lib/quality';

export const PROJECT_ID = 'project-test';

let sequence = 0;

export function makeAnalysis(overrides: Partial<PhotoAnalysis> = {}): PhotoAnalysis {
  return {
    laplacianVar: 140,
    tenengrad: 90,
    edgeDensity: 0.12,
    meanLuma: 0.52,
    medianLuma: 0.52,
    p05Luma: 0.08,
    p95Luma: 0.9,
    contrast: 0.22,
    saturation: 0.2,
    highlightClip: 0.005,
    shadowClip: 0.01,
    saliencyX: 1 / 3,
    saliencyY: 1 / 3,
    balance: 0.08,
    ...overrides,
  };
}

export function makeScores(overrides: Partial<PhotoScores> = {}): PhotoScores {
  return {
    overall: 70,
    sharpness: 70,
    exposure: 70,
    composition: 70,
    faces: 70,
    ...overrides,
  };
}

export function makeFaceSummary(overrides: Partial<FaceSummary> = {}): FaceSummary {
  return { ...EMPTY_FACE_SUMMARY, ...overrides };
}

export function makePhoto(overrides: Partial<Photo> = {}): Photo {
  sequence += 1;
  const id = overrides.id ?? `photo-${sequence}`;
  return {
    id,
    projectId: PROJECT_ID,
    name: `${id}.jpg`,
    path: `2026/${id}.jpg`,
    mime: 'image/jpeg',
    size: 1_000_000,
    width: 4000,
    height: 3000,
    capturedAt: Date.UTC(2026, 6, 12, 10, 0, 0),
    camera: 'Test Camera',
    contentHash: `hash-${id}`,
    dhash: 'ffffffffffffffff',
    status: 'ready',
    faceStatus: 'done',
    analysis: makeAnalysis(),
    scores: makeScores(),
    flags: [],
    tags: [],
    faces: makeFaceSummary(),
    personIds: [],
    groupIds: [],
    selected: false,
    favorite: false,
    rejected: false,
    rating: 0,
    notes: '',
    aiIndexed: false,
    originalStored: true,
    previewStored: true,
    addedAt: Date.UTC(2026, 6, 12, 12, 0, 0),
    updatedAt: Date.UTC(2026, 6, 12, 12, 0, 0),
    ...overrides,
  };
}

export function makePerson(overrides: Partial<Person> = {}): Person {
  sequence += 1;
  const id = overrides.id ?? `person-${sequence}`;
  return {
    id,
    projectId: PROJECT_ID,
    name: `Person ${sequence}`,
    role: 'other',
    faceCount: 1,
    centroid: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

export function makeEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  sequence += 1;
  const id = overrides.id ?? `event-${sequence}`;
  return {
    id,
    projectId: PROJECT_ID,
    name: `Moment ${sequence}`,
    type: 'other',
    start: Date.UTC(2026, 6, 12, 10, 0, 0),
    end: Date.UTC(2026, 6, 12, 11, 0, 0),
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

export function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT_ID,
    name: 'Test wedding',
    createdAt: 1,
    updatedAt: 1,
    lastOpenedAt: 1,
    consentFace: false,
    consentAiSearch: false,
    storeOriginals: true,
    settings: { ...DEFAULT_PROJECT_SETTINGS },
    ...overrides,
  };
}
