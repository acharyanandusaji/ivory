import type { AlbumCategory, EventType, PersonRole, PhotoFlag, ProjectSettings } from '@/types';

export const APP_NAME = 'Ivory';
export const APP_TAGLINE = 'Private, local-first photo curation';

export const SUPPORTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp'];
export const SUPPORTED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'image/bmp',
]);

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  similarityThreshold: 8,
  burstWindowMs: 3500,
  timelineGapMin: 45,
  faceClusterThreshold: 0.43,
  faceDetectorThreshold: 0.38,
  analysisConcurrency: 3,
  faceDetector: 'tiny',
};

export const ALBUM_CATEGORIES: Array<{ id: AlbumCategory; label: string; hint: string }> = [
  { id: 'ceremony', label: 'Ceremony', hint: 'Vows, rituals and the moments around them' },
  { id: 'portraits', label: 'Portraits', hint: 'Individual portraits and close studies' },
  { id: 'couple', label: 'Couple', hint: 'The couple together' },
  { id: 'family', label: 'Family', hint: 'Family groups and generations' },
  { id: 'friends', label: 'Friends', hint: 'Friends and the wedding party' },
  { id: 'groups', label: 'Group photos', hint: 'Three or more people' },
  { id: 'candids', label: 'Candids', hint: 'Unposed, in-between moments' },
  { id: 'details', label: 'Details', hint: 'Decor, rings, florals and venue' },
  { id: 'reception', label: 'Reception', hint: 'Dinner, dancing and celebration' },
  { id: 'other', label: 'Other', hint: 'Everything else' },
];

export const EVENT_TYPES: Array<{ id: EventType; label: string }> = [
  { id: 'getting-ready', label: 'Getting ready' },
  { id: 'ceremony', label: 'Ceremony' },
  { id: 'portraits', label: 'Portraits' },
  { id: 'reception', label: 'Reception' },
  { id: 'party', label: 'Party' },
  { id: 'details', label: 'Details' },
  { id: 'other', label: 'Other' },
];

export const PERSON_ROLES: Array<{ id: PersonRole; label: string }> = [
  { id: 'bride', label: 'Bride' },
  { id: 'groom', label: 'Groom' },
  { id: 'family', label: 'Family' },
  { id: 'friend', label: 'Friend' },
  { id: 'officiant', label: 'Officiant' },
  { id: 'other', label: 'Guest' },
];

export const FLAG_META: Record<PhotoFlag, { label: string; short: string; tone: 'danger' | 'warn' | 'neutral' }> = {
  blurry: { label: 'Soft focus', short: 'Blur', tone: 'danger' },
  overexposed: { label: 'Overexposed', short: 'Bright', tone: 'warn' },
  underexposed: { label: 'Underexposed', short: 'Dark', tone: 'warn' },
  'closed-eyes': { label: 'Eyes closed', short: 'Eyes', tone: 'warn' },
  'poor-composition': { label: 'Composition', short: 'Compose', tone: 'neutral' },
  'low-resolution': { label: 'Low resolution', short: 'Low res', tone: 'neutral' },
  duplicate: { label: 'Duplicate', short: 'Duplicate', tone: 'neutral' },
  repetitive: { label: 'Repetitive', short: 'Repeat', tone: 'neutral' },
};

export const PERSON_COLORS = [
  '#B08D57',
  '#7A8B6F',
  '#A47264',
  '#6B7F96',
  '#9B7E9C',
  '#B69B5E',
  '#5E8A85',
  '#A47B88',
  '#7F8460',
  '#8A7765',
  '#6E7A8A',
  '#96795D',
];

export const CLIP_MODEL_ID = 'Xenova/clip-vit-base-patch32';
export const CLIP_MODEL_LABEL = 'CLIP ViT-B/32 (quantised, ~170 MB)';

export const QUALITY_WEIGHTS = {
  sharpness: 0.36,
  exposure: 0.24,
  composition: 0.16,
  faces: 0.24,
};

/** Face landmarks are the 68-point iBUG layout. */
export const EYE_LEFT = [36, 37, 38, 39, 40, 41] as const;
export const EYE_RIGHT = [42, 43, 44, 45, 46, 47] as const;

export const QUICK_KEYS = {
  favorite: 'f',
  reject: 'x',
  select: 's',
  info: 'i',
};
