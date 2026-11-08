export type UUID = string;

export type PhotoStatus = 'pending' | 'analyzing' | 'ready' | 'error';
export type FaceStatus = 'pending' | 'processing' | 'done' | 'skipped' | 'error';

export type PhotoFlag =
  | 'blurry'
  | 'overexposed'
  | 'underexposed'
  | 'closed-eyes'
  | 'poor-composition'
  | 'low-resolution'
  | 'duplicate'
  | 'repetitive';

export type AlbumCategory =
  | 'ceremony'
  | 'portraits'
  | 'couple'
  | 'family'
  | 'friends'
  | 'groups'
  | 'candids'
  | 'details'
  | 'reception'
  | 'other';

export type EventType =
  | 'getting-ready'
  | 'ceremony'
  | 'portraits'
  | 'reception'
  | 'party'
  | 'details'
  | 'other';

export type PersonRole = 'bride' | 'groom' | 'family' | 'friend' | 'officiant' | 'other';

export type GroupType = 'exact' | 'similar' | 'burst';

export interface ProjectSettings {
  similarityThreshold: number;
  burstWindowMs: number;
  timelineGapMin: number;
  faceClusterThreshold: number;
  faceDetectorThreshold: number;
  analysisConcurrency: number;
  faceDetector: 'tiny' | 'ssd';
}

export interface Project {
  id: UUID;
  name: string;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
  eventDate?: string;
  venue?: string;
  coupleNames?: string;
  photographerName?: string;
  photographerContact?: string;
  handoffNotes?: string;
  consentFace: boolean;
  consentAiSearch: boolean;
  storeOriginals: boolean;
  settings: ProjectSettings;
}

export interface PhotoAnalysis {
  /** Variance of the Laplacian on a 512px grayscale render. */
  laplacianVar: number;
  /** Sum of squared gradient magnitudes (Tenengrad). */
  tenengrad: number;
  edgeDensity: number;
  meanLuma: number;
  medianLuma: number;
  p05Luma: number;
  p95Luma: number;
  contrast: number;
  saturation: number;
  highlightClip: number;
  shadowClip: number;
  /** Normalised (0..1) edge-energy centroid, used for composition heuristics. */
  saliencyX: number;
  saliencyY: number;
  balance: number;
}

export interface PhotoScores {
  overall: number;
  sharpness: number;
  exposure: number;
  composition: number;
  faces: number;
}

export interface FaceSummary {
  faceCount: number;
  smilingCount: number;
  eyesClosedCount: number;
  lookingCount: number;
  maxFaceArea: number;
  avgFaceScore: number;
  avgSmile: number;
  avgFaceSharpness: number;
  avgFaceX: number;
  avgFaceY: number;
}

export interface Photo {
  id: UUID;
  projectId: UUID;
  name: string;
  path: string;
  mime: string;
  size: number;
  width: number;
  height: number;
  capturedAt: number | null;
  camera?: string;
  lens?: string;
  iso?: number;
  fNumber?: number;
  exposureTime?: string;
  focalLength?: number;
  gps?: [number, number];
  contentHash: string;
  dhash: string;
  status: PhotoStatus;
  faceStatus: FaceStatus;
  error?: string;
  analysis?: PhotoAnalysis;
  scores?: PhotoScores;
  flags: PhotoFlag[];
  tags: string[];
  faces: FaceSummary;
  personIds: UUID[];
  groupIds: UUID[];
  eventId?: UUID;
  selected: boolean;
  favorite: boolean;
  rejected: boolean;
  rating: number;
  notes: string;
  category?: AlbumCategory;
  /** Set when the user explicitly chooses a category, which automatic organisation preserves. */
  categoryManual?: boolean;
  aiIndexed: boolean;
  originalStored: boolean;
  previewStored: boolean;
  addedAt: number;
  updatedAt: number;
}

export interface Face {
  id: UUID;
  projectId: UUID;
  photoId: UUID;
  personId: UUID | null;
  /** Normalised face box (0..1). */
  box: { x: number; y: number; width: number; height: number };
  detectionScore: number;
  smile: number;
  eyesOpen: number;
  lookingAtCamera: boolean;
  yaw: number;
  pitch: number;
  faceSharpness: number;
  faceScore: number;
  descriptor: Float32Array;
  cropAssetId?: string;
  ignored: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Person {
  id: UUID;
  projectId: UUID;
  name: string;
  role: PersonRole;
  coverFaceId?: UUID;
  faceCount: number;
  centroid: Float32Array | null;
  color?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PhotoGroup {
  id: UUID;
  projectId: UUID;
  type: GroupType;
  photoIds: UUID[];
  bestPhotoId?: UUID;
  createdAt: number;
}

export interface EventRecord {
  id: UUID;
  projectId: UUID;
  name: string;
  type: EventType;
  start: number;
  end: number;
  createdAt: number;
  updatedAt: number;
}

export interface EmbeddingRecord {
  photoId: UUID;
  projectId: UUID;
  vector: Float32Array;
  model: string;
  createdAt: number;
}

export interface AssetRecord {
  id: string;
  projectId: UUID;
  photoId: UUID;
  kind: 'original' | 'preview' | 'thumb' | 'face';
  blob: Blob;
  size: number;
  createdAt: number;
}

export interface AppToast {
  id: string;
  title: string;
  description?: string;
  tone?: 'default' | 'success' | 'danger';
  action?: { label: string; run: () => void };
  duration?: number;
}

export interface PhotoFilters {
  search: string;
  peopleIds: UUID[];
  peopleMode: 'all' | 'any';
  categories: AlbumCategory[];
  smart: string[];
  flags: PhotoFlag[];
  tags: string[];
  eventId: UUID | null;
  groupType: GroupType | null;
  minRating: number;
  orientation: 'all' | 'landscape' | 'portrait' | 'square';
  onlySelected: boolean;
  onlyFavorites: boolean;
  onlyRejected: boolean;
  hideRejected: boolean;
  onlyUnreviewed: boolean;
  minScore: number;
  sort: 'quality' | 'date' | 'name' | 'faces';
}

export interface ImportStats {
  imported: number;
  duplicates: number;
  skipped: number;
  failed: number;
  originalBytes: number;
  totalBytes: number;
  errors: Array<{ name: string; message: string }>;
}

export interface ProcessingState {
  running: boolean;
  paused: boolean;
  stage: 'idle' | 'analysing' | 'faces' | 'organising' | 'ai-indexing';
  total: number;
  completed: number;
  currentName: string;
  startedAt: number | null;
  etaMs: number | null;
  errors: number;
}

export interface AiIndexState {
  status: 'idle' | 'loading' | 'indexing' | 'ready' | 'error';
  total: number;
  completed: number;
  message: string;
  modelReady: boolean;
}

export interface CompareState {
  photoIds: UUID[];
}

export interface AppSettings {
  theme: 'light' | 'dark';
  sidebarCollapsed: boolean;
  gridDensity: 'comfortable' | 'compact';
  onboardingDismissed: boolean;
}

export interface PersonMergeSuggestion {
  sourceId: UUID;
  targetId: UUID;
  distance: number;
}

export interface AlbumDraft {
  target: number;
  title: string;
  subtitle: string;
  notes: string;
  categories: AlbumCategory[];
  diversifyEvents: boolean;
  includeFavorites: boolean;
  lastCuration: {
    ids: UUID[];
    reasons: Record<string, string>;
    createdAt: number;
  } | null;
}

export interface StorageState {
  usage: number;
  quota: number;
  persisted: boolean;
  supported: boolean;
}
