import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Heart,
  Info,
  MapPin,
  Minimize2,
  Sparkles,
  Star,
  Tag,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { AlbumCategory, Photo } from '@/types';
import { ALBUM_CATEGORIES, FLAG_META } from '@/lib/constants';
import { formatBytes, formatDate, formatTime, isEditableTarget, megapixels, ratioLabel } from '@/lib/utils';
import { getOriginalBlob } from '@/lib/assets';
import { downloadBlob } from '@/lib/utils';
import { useAppStore } from '@/store/appStore';
import { usePreviewUrl } from '@/hooks/useApp';
import { Button, Chip, IconButton, ScorePill, Select } from './ui';

export interface PhotoLightboxProps {
  photos: Photo[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

export function PhotoLightbox({ photos, index, onIndexChange, onClose }: PhotoLightboxProps) {
  const photo = photos[index];
  const previewUrl = usePreviewUrl(photo?.id);
  const faces = useAppStore((state) => state.faces);
  const people = useAppStore((state) => state.people);
  const events = useAppStore((state) => state.events);
  const toggleFavorite = useAppStore((state) => state.toggleFavorite);
  const toggleSelected = useAppStore((state) => state.toggleSelected);
  const toggleRejected = useAppStore((state) => state.toggleRejected);
  const setRating = useAppStore((state) => state.setRating);
  const setNotes = useAppStore((state) => state.setNotes);
  const setCategory = useAppStore((state) => state.setCategory);
  const addCompare = useAppStore((state) => state.addCompare);
  const pushToast = useAppStore((state) => state.pushToast);

  const [zoom, setZoom] = useState(1);
  const [showFaces, setShowFaces] = useState(false);
  const [showPanel, setShowPanel] = useState(true);
  const [notes, setLocalNotes] = useState(photo?.notes ?? '');
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalNotes(photo?.notes ?? '');
    setZoom(1);
    // Deliberately keyed by photograph only; notes update locally while typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo?.id]);

  const photoFaces = useMemo(
    () => (photo ? faces.filter((face) => face.photoId === photo.id && !face.ignored) : []),
    [faces, photo],
  );
  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const event = photo?.eventId ? events.find((item) => item.id === photo.eventId) : undefined;

  useEffect(() => {
    if (!photos.length) return;
    const handler = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowLeft') onIndexChange((index - 1 + photos.length) % photos.length);
      else if (event.key === 'ArrowRight') onIndexChange((index + 1) % photos.length);
      else if (event.key === 'i') setShowPanel((value) => !value);
      else if (event.key === 'f' && photo) void toggleFavorite(photo.id);
      else if (event.key === 'x' && photo) void toggleRejected(photo.id);
      else if (event.key === 's' && photo) void toggleSelected(photo.id);
      else if (event.key === '+' || event.key === '=') setZoom((value) => Math.min(4, value + 0.5));
      else if (event.key === '-') setZoom((value) => Math.max(1, value - 0.5));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [index, photos.length, photo, onClose, onIndexChange, toggleFavorite, toggleRejected, toggleSelected]);

  if (!photo) return null;

  const saveNotes = (value: string) => {
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => {
      void setNotes(photo.id, value);
    }, 400);
  };

  const download = async () => {
    const blob = await getOriginalBlob(photo.id);
    if (!blob) {
      pushToast({
        title: 'Original not available',
        description: 'Relink this photograph from Export to download the full-resolution file.',
        tone: 'danger',
      });
      return;
    }
    downloadBlob(blob, photo.name);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#14120f] text-white animate-fade-in">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <IconButton label="Close viewer" onClick={onClose} className="text-white/70 hover:bg-white/10 hover:text-white">
            <X className="h-4.5 w-4.5" />
          </IconButton>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-white/95">{photo.name}</p>
            <p className="text-[10.5px] text-white/45">
              {index + 1} of {photos.length} · {formatDate(photo.capturedAt ?? photo.addedAt, true)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <IconButton
            label="Toggle details"
            onClick={() => setShowPanel((value) => !value)}
            active={showPanel}
            className={clsx(
              'text-white/70 hover:bg-white/10 hover:text-white',
              showPanel && 'bg-white/15 text-white',
            )}
          >
            <Info className="h-4 w-4" />
          </IconButton>
          <IconButton
            label={showFaces ? 'Hide face boxes' : 'Show face boxes'}
            onClick={() => setShowFaces((value) => !value)}
            className={clsx(
              'text-white/70 hover:bg-white/10 hover:text-white',
              showFaces && 'bg-white/15 text-white',
            )}
          >
            <Users className="h-4 w-4" />
          </IconButton>
          <IconButton
            label="Zoom out"
            onClick={() => setZoom((value) => Math.max(1, value - 0.5))}
            className="text-white/70 hover:bg-white/10 hover:text-white"
          >
            <ZoomOut className="h-4 w-4" />
          </IconButton>
          <span className="w-9 text-center text-[10.5px] tabular-nums text-white/50">{Math.round(zoom * 100)}%</span>
          <IconButton
            label="Zoom in"
            onClick={() => setZoom((value) => Math.min(4, value + 0.5))}
            className="text-white/70 hover:bg-white/10 hover:text-white"
          >
            <ZoomIn className="h-4 w-4" />
          </IconButton>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden bg-black/40 p-2 sm:p-6">
          <div className="absolute inset-x-0 top-1/2 z-10 flex -translate-y-1/2 justify-between px-2 sm:px-4">
            <button
              type="button"
              onClick={() => onIndexChange((index - 1 + photos.length) % photos.length)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white/80 backdrop-blur transition-colors hover:bg-black/60 hover:text-white"
              aria-label="Previous photograph"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => onIndexChange((index + 1) % photos.length)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white/80 backdrop-blur transition-colors hover:bg-black/60 hover:text-white"
              aria-label="Next photograph"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className="relative max-h-full max-w-full overflow-auto">
            {previewUrl ? (
              <div className="relative">
                <img
                  src={previewUrl}
                  alt={photo.name}
                  draggable={false}
                  className="mx-auto max-h-[calc(100vh-8.5rem)] w-auto max-w-full select-none object-contain transition-transform duration-200"
                  style={{ transform: `scale(${zoom})` }}
                />
                {showFaces
                  ? photoFaces.map((face) => (
                      <span
                        key={face.id}
                        className="pointer-events-none absolute border-2 border-accent/80 shadow-[0_0_0_2000px_rgba(0,0,0,0.06)]"
                        style={{
                          left: `${face.box.x * 100}%`,
                          top: `${face.box.y * 100}%`,
                          width: `${face.box.width * 100}%`,
                          height: `${face.box.height * 100}%`,
                        }}
                        title={face.personId ? peopleById.get(face.personId)?.name : 'Unassigned face'}
                      >
                        <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-accent px-1.5 py-0.5 text-[9px] font-medium text-accent-ink">
                          {face.personId ? peopleById.get(face.personId)?.name ?? 'Person' : 'Unknown'}
                        </span>
                      </span>
                    ))
                  : null}
              </div>
            ) : (
              <div className="flex h-[60vh] w-[60vw] items-center justify-center rounded-xl border border-white/10 text-[12px] text-white/40">
                Preview not available
              </div>
            )}
          </div>

          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/45 p-1 backdrop-blur-md">
            <button
              type="button"
              onClick={() => void toggleSelected(photo.id)}
              className={clsx(
                'flex h-9 items-center gap-1.5 rounded-full px-3 text-[11.5px] font-medium transition-colors',
                photo.selected ? 'bg-accent text-accent-ink' : 'text-white/80 hover:bg-white/10',
              )}
            >
              <Check className="h-3.5 w-3.5" /> {photo.selected ? 'In album' : 'Select'}
            </button>
            <button
              type="button"
              onClick={() => void toggleFavorite(photo.id)}
              className={clsx(
                'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
                photo.favorite ? 'bg-white text-accent' : 'text-white/80 hover:bg-white/10',
              )}
              aria-label="Favourite"
            >
              <Heart className={clsx('h-4 w-4', photo.favorite && 'fill-current')} />
            </button>
            <button
              type="button"
              onClick={() => void toggleRejected(photo.id)}
              className={clsx(
                'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
                photo.rejected ? 'bg-danger text-white' : 'text-white/80 hover:bg-white/10',
              )}
              aria-label="Not for the album"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void download()}
              className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10"
              aria-label="Download original"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
        </div>

        {showPanel ? (
          <aside className="hidden w-[340px] shrink-0 overflow-y-auto border-l border-white/10 bg-[#1b1916] lg:block">
            <div className="space-y-6 p-5">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="display text-xl text-white/95">{photo.name.replace(/\.[^.]+$/, '')}</p>
                    <p className="mt-1 text-[10.5px] uppercase tracking-[0.16em] text-white/35">
                      {event?.name ?? 'Unfiled moment'}
                    </p>
                  </div>
                  {photo.scores ? <ScorePill score={photo.scores.overall} /> : null}
                </div>
                <div className="mt-4 flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => void setRating(photo.id, photo.rating === star + 1 ? 0 : star + 1)}
                      className="p-0.5"
                      aria-label={`Rate ${star + 1} stars`}
                    >
                      <Star
                        className={clsx(
                          'h-4 w-4 transition-colors',
                          star < photo.rating ? 'fill-accent text-accent' : 'text-white/20 hover:text-white/45',
                        )}
                      />
                    </button>
                  ))}
                  <span className="ml-2 text-[11px] text-white/40">{photo.rating ? `${photo.rating} star` : 'Unrated'}</span>
                </div>
              </div>

              {photo.scores ? (
                <div className="space-y-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Quality</p>
                  {(
                    [
                      ['Sharpness', photo.scores.sharpness],
                      ['Exposure', photo.scores.exposure],
                      ['Composition', photo.scores.composition],
                      ['Faces', photo.scores.faces],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label}>
                      <div className="mb-1 flex items-center justify-between text-[10.5px]">
                        <span className="text-white/55">{label}</span>
                        <span className="tabular-nums text-white/40">{value}</span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-white/10">
                        <div
                          className={clsx(
                            'h-full rounded-full',
                            value >= 72 ? 'bg-success' : value >= 48 ? 'bg-accent' : 'bg-danger',
                          )}
                          style={{ width: `${value}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {photo.flags.length || photo.tags.length ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Signals</p>
                  <div className="flex flex-wrap gap-1.5">
                    {photo.flags.map((flag) => (
                      <Chip key={flag} tone={FLAG_META[flag].tone === 'danger' ? 'danger' : 'neutral'} className="border-transparent bg-white/10 text-white/70">
                        {FLAG_META[flag].label}
                      </Chip>
                    ))}
                    {photo.tags.map((tag) => (
                      <Chip key={tag} className="border-transparent bg-white/[.06] text-white/55">
                        <Tag className="h-2.5 w-2.5" /> {tag}
                      </Chip>
                    ))}
                  </div>
                </div>
              ) : null}

              {photo.personIds.length ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">People</p>
                  <div className="flex flex-wrap gap-1.5">
                    {photo.personIds.map((id) => {
                      const person = peopleById.get(id);
                      if (!person) return null;
                      return (
                        <span key={id} className="inline-flex items-center gap-1.5 rounded-full bg-white/[.07] py-1 pl-1 pr-2.5 text-[11px] text-white/75">
                          <span
                            className="flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-semibold text-white"
                            style={{ backgroundColor: person.color ?? '#B08D57' }}
                          >
                            {person.name.replace(/^Person /, '').slice(0, 2)}
                          </span>
                          {person.name}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Album category</p>
                <Select
                  value={photo.category ?? ''}
                  onChange={(event) => void setCategory(photo.id, (event.target.value || undefined) as AlbumCategory | undefined)}
                  className="border-white/10 bg-white/[.06] text-white/80"
                >
                  <option value="" className="bg-[#1b1916]">Automatic</option>
                  {ALBUM_CATEGORIES.map((category) => (
                    <option key={category.id} value={category.id} className="bg-[#1b1916]">
                      {category.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Notes</p>
                <textarea
                  value={notes}
                  onChange={(event) => {
                    setLocalNotes(event.target.value);
                    saveNotes(event.target.value);
                  }}
                  placeholder="A private note for this photograph…"
                  className="min-h-20 w-full resize-y rounded-xl border border-white/10 bg-white/[.05] px-3 py-2.5 text-[12.5px] leading-relaxed text-white/80 placeholder:text-white/25 focus:border-accent focus:outline-none"
                />
              </div>

              <div className="space-y-1.5 border-t border-white/10 pt-4 text-[11px] text-white/45">
                {photo.camera ? (
                  <p className="flex items-center gap-2">
                    <Sparkles className="h-3 w-3 shrink-0" /> {photo.camera}{photo.lens ? ` · ${photo.lens}` : ''}
                  </p>
                ) : null}
                <p>
                  {photo.width} × {photo.height} · {megapixels(photo.width, photo.height)} · {ratioLabel(photo.width, photo.height)}
                </p>
                <p>{formatBytes(photo.size)} · {photo.mime}</p>
                {photo.iso || photo.fNumber || photo.exposureTime || photo.focalLength ? (
                  <p>
                    {[
                      photo.iso ? `ISO ${photo.iso}` : '',
                      photo.fNumber ? `ƒ/${photo.fNumber}` : '',
                      photo.exposureTime,
                      photo.focalLength ? `${Math.round(photo.focalLength)}mm` : '',
                    ].filter(Boolean).join(' · ')}
                  </p>
                ) : null}
                {photo.gps ? (
                  <p className="flex items-center gap-1.5">
                    <MapPin className="h-3 w-3" /> {photo.gps[0].toFixed(4)}, {photo.gps[1].toFixed(4)}
                  </p>
                ) : null}
                <p className="truncate">{photo.path}</p>
                <p>Imported {formatDate(photo.addedAt, true)} · {formatTime(photo.capturedAt)}</p>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
                <Button
                  variant="secondary"
                  size="sm"
                  className="border-white/10 bg-white/[.06] text-white/75 hover:bg-white/10"
                  onClick={() => {
                    addCompare([photo.id]);
                    pushToast({ title: 'Added to compare', description: 'Open Compare to view photographs side by side.', tone: 'default' });
                  }}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <ArrowRight className="h-3.5 w-3.5" />
                  Compare
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="border-white/10 bg-white/[.06] text-white/75 hover:bg-white/10"
                  onClick={() => setZoom(1)}
                  icon={<Minimize2 className="h-3.5 w-3.5" />}
                >
                  Reset zoom
                </Button>
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
