import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  Check,
  Columns3,
  Grid3X3,
  Heart,
  ImageOff,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Star,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type { Photo } from '@/types';
import { useAppStore } from '@/store/appStore';
import { usePreviewUrl, useThumbUrl } from '@/hooks/useApp';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProjectGate } from '@/components/ProjectGate';
import { PhotoLightbox } from '@/components/PhotoLightbox';
import {
  Button,
  Card,
  Chip,
  Drawer,
  EmptyState,
  IconButton,
  ScorePill,
  TextInput,
} from '@/components/ui';
import { FLAG_META } from '@/lib/constants';
import {
  formatBytes,
  formatDate,
  formatTime,
  megapixels,
  ratioLabel,
} from '@/lib/utils';

export function ComparePage() {
  return (
    <ProjectGate feature="Compare">
      <CompareWorkspace />
    </ProjectGate>
  );
}

function bestIndex(values: Array<number | undefined>, mode: 'max' | 'min' = 'max'): number {
  let best = -1;
  let bestValue = mode === 'max' ? -Infinity : Infinity;
  values.forEach((value, index) => {
    if (value === undefined || !Number.isFinite(value)) return;
    if (mode === 'max' ? value > bestValue : value < bestValue) {
      bestValue = value;
      best = index;
    }
  });
  return best;
}

function CompareWorkspace() {
  const photos = useAppStore((state) => state.photos);
  const people = useAppStore((state) => state.people);
  const compareIds = useAppStore((state) => state.compareIds);
  const removeCompare = useAppStore((state) => state.removeCompare);
  const clearCompare = useAppStore((state) => state.clearCompare);
  const addCompare = useAppStore((state) => state.addCompare);
  const toggleFavorite = useAppStore((state) => state.toggleFavorite);
  const toggleSelected = useAppStore((state) => state.toggleSelected);
  const toggleRejected = useAppStore((state) => state.toggleRejected);
  const setRating = useAppStore((state) => state.setRating);
  const pushToast = useAppStore((state) => state.pushToast);
  const navigate = useNavigate();

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const photoById = useMemo(() => new Map(photos.map((photo) => [photo.id, photo])), [photos]);
  const compared = useMemo(
    () => compareIds.map((id) => photoById.get(id)).filter((photo): photo is Photo => Boolean(photo)),
    [compareIds, photoById],
  );
  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const changeZoom = (next: number) => {
    const clamped = Math.min(6, Math.max(1, next));
    setZoom(clamped);
    if (clamped === 1) setPan({ x: 0, y: 0 });
  };

  const add = (id: string) => {
    if (compared.some((photo) => photo.id === id)) return;
    if (compared.length >= 4) {
      pushToast({ title: 'Compare up to four', description: 'Remove one photograph first.', tone: 'default' });
      return;
    }
    addCompare([id]);
  };

  const scoreRows = useMemo(() => {
    const overall = compared.map((photo) => photo.scores?.overall);
    const sharpness = compared.map((photo) => photo.scores?.sharpness);
    const exposure = compared.map((photo) => photo.scores?.exposure);
    const composition = compared.map((photo) => photo.scores?.composition);
    const faces = compared.map((photo) => photo.scores?.faces);
    return {
      overall: bestIndex(overall),
      sharpness: bestIndex(sharpness),
      exposure: bestIndex(exposure),
      composition: bestIndex(composition),
      faces: bestIndex(faces),
    };
  }, [compared]);

  if (!photos.length) {
    return (
      <div className="animate-fade-up">
        <PageHeader
          eyebrow="Compare"
          title="Look closer, side by side"
          description="Compare near-identical frames at the same zoom and choose the one that belongs in the album."
        />
        <EmptyState
          icon={<Columns3 className="h-5 w-5" />}
          title="Nothing to compare yet"
          description="Import photographs first, then add two to four similar frames here."
          action={<Button variant="primary" onClick={() => navigate('/import')}>Import photographs</Button>}
        />
      </div>
    );
  }

  if (!compared.length) {
    return (
      <div className="animate-fade-up">
        <PageHeader
          eyebrow="Compare"
          title="Look closer, side by side"
          description="Add two to four photographs. Zoom and pan stay in sync, and quality signals sit beneath the images so you can make the final call."
        />
        <EmptyState
          icon={<Columns3 className="h-5 w-5" />}
          title="Choose photographs to compare"
          description="Pick frames from a burst, a similar set, or anywhere in the library. Ivory never decides for you — it only lines up the evidence."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setPickerOpen(true)}>
                Add photographs
              </Button>
              <Button variant="secondary" onClick={() => navigate('/library')}>Browse library</Button>
            </div>
          }
        />
        <PhotoPickerDrawer
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          photos={photos}
          comparedIds={compared.map((photo) => photo.id)}
          onAdd={add}
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-up pb-10">
      <PageHeader
        eyebrow="Compare"
        title="Look closer, side by side"
        description="One shared view across every frame. Judge focus, expression and light at the same magnification — then keep whichever earns its place."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => setPickerOpen(true)}
              disabled={compared.length >= 4}
            >
              Add photograph
            </Button>
            <Button variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={clearCompare}>
              Clear
            </Button>
          </>
        }
      >
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <Chip tone="accent">{compared.length} of 4 frames</Chip>
          <Chip>Synced zoom {Math.round(zoom * 100)}%</Chip>
          <Chip tone="success">Local comparison</Chip>
        </div>
      </PageHeader>

      <Card className="mb-4 flex flex-wrap items-center gap-2 p-2.5">
        <div className="flex items-center gap-1 rounded-lg border border-line bg-raised p-0.5">
          <IconButton label="Zoom out" size="sm" onClick={() => changeZoom(zoom - 0.5)} disabled={zoom <= 1}>
            <Minus className="h-3.5 w-3.5" />
          </IconButton>
          <button
            type="button"
            onClick={resetView}
            className="h-7 min-w-[62px] rounded-md px-2 text-[11px] font-semibold tabular-nums text-soft transition-colors hover:bg-surface hover:text-ink"
            title="Reset zoom and pan"
          >
            {Math.round(zoom * 100)}%
          </button>
          <IconButton label="Zoom in" size="sm" onClick={() => changeZoom(zoom + 0.5)} disabled={zoom >= 6}>
            <Plus className="h-3.5 w-3.5" />
          </IconButton>
        </div>

        <Button variant="secondary" size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={resetView}>
          Reset view
        </Button>
        <Button
          variant={showGrid ? 'primary' : 'secondary'}
          size="sm"
          icon={<Grid3X3 className="h-3.5 w-3.5" />}
          onClick={() => setShowGrid((value) => !value)}
        >
          Rule of thirds
        </Button>

        <div className="ml-auto flex items-center gap-1.5 text-[10.5px] text-faint">
          <Maximize2 className="h-3 w-3" />
          Drag to pan when zoomed · scroll to zoom
        </div>
      </Card>

      <div
        className={clsx(
          'grid gap-3',
          compared.length === 2 ? 'md:grid-cols-2' : compared.length === 3 ? 'md:grid-cols-3' : 'sm:grid-cols-2 xl:grid-cols-4',
        )}
      >
        {compared.map((photo, index) => (
          <ComparePane
            key={photo.id}
            photo={photo}
            index={index}
            zoom={zoom}
            pan={pan}
            showGrid={showGrid}
            onPan={setPan}
            onZoomChange={changeZoom}
            onReset={resetView}
            onRemove={() => removeCompare(photo.id)}
            onInspect={() => setLightbox(index)}
            onFavorite={() => void toggleFavorite(photo.id)}
            onSelected={() => void toggleSelected(photo.id)}
            onRejected={() => void toggleRejected(photo.id)}
            onRating={(rating) => void setRating(photo.id, photo.rating === rating ? 0 : rating)}
          />
        ))}

        {compared.length < 4 ? (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex min-h-[300px] flex-col items-center justify-center gap-2 rounded-xl2 border border-dashed border-line bg-surface/40 p-6 text-center transition-colors hover:border-accent/50 hover:bg-accent-soft/20"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent">
              <Plus className="h-4.5 w-4.5" />
            </span>
            <span className="text-[12.5px] font-medium text-ink">Add another frame</span>
            <span className="max-w-[180px] text-[10.5px] leading-relaxed text-faint">
              Compare up to four photographs at once.
            </span>
          </button>
        ) : null}
      </div>

      <Card className="mt-5 overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Evidence, not a verdict</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-soft">
            Technical differences are highlighted. The best-scoring frame may still be the wrong choice — expressions and story matter more.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-raised/60">
                <th className="sticky left-0 z-10 w-[150px] bg-raised/95 px-4 py-2.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-faint">
                  Measure
                </th>
                {compared.map((photo) => (
                  <th key={photo.id} className="min-w-[150px] px-4 py-2.5 align-top">
                    <span className="block max-w-[190px] truncate text-[11.5px] font-semibold text-ink">{photo.name}</span>
                    <span className="mt-0.5 block text-[9.5px] text-faint">
                      {photo.capturedAt ? formatDate(photo.capturedAt) : 'No capture date'}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-[11.5px]">
              <Row label="Overall quality" photos={compared} render={(photo) => (photo.scores ? <ScorePill score={photo.scores.overall} /> : '—')} best={scoreRows.overall} />
              <Row label="Sharpness" photos={compared} render={(photo) => photo.scores?.sharpness ?? '—'} best={scoreRows.sharpness} />
              <Row label="Exposure" photos={compared} render={(photo) => photo.scores?.exposure ?? '—'} best={scoreRows.exposure} />
              <Row label="Composition" photos={compared} render={(photo) => photo.scores?.composition ?? '—'} best={scoreRows.composition} />
              <Row label="Face quality" photos={compared} render={(photo) => photo.scores?.faces ?? '—'} best={scoreRows.faces} />
              <Row label="Dimensions" photos={compared} render={(photo) => `${photo.width} × ${photo.height}`} />
              <Row label="Resolution" photos={compared} render={(photo) => megapixels(photo.width, photo.height)} />
              <Row label="Aspect ratio" photos={compared} render={(photo) => ratioLabel(photo.width, photo.height)} />
              <Row label="File size" photos={compared} render={(photo) => formatBytes(photo.size)} />
              <Row label="Captured" photos={compared} render={(photo) => (photo.capturedAt ? `${formatDate(photo.capturedAt)} · ${formatTime(photo.capturedAt)}` : '—')} />
              <Row label="Camera" photos={compared} render={(photo) => photo.camera ?? '—'} />
              <Row label="Lens" photos={compared} render={(photo) => photo.lens ?? '—'} />
              <Row
                label="Exposure settings"
                photos={compared}
                render={(photo) =>
                  [photo.iso ? `ISO ${photo.iso}` : '', photo.fNumber ? `ƒ/${photo.fNumber}` : '', photo.exposureTime ?? '']
                    .filter(Boolean)
                    .join(' · ') || '—'
                }
              />
              <Row label="Faces" photos={compared} render={(photo) => photo.faces.faceCount || 'None'} />
              <Row label="Smiling" photos={compared} render={(photo) => photo.faces.smilingCount || '—'} />
              <Row label="Eyes closed" photos={compared} render={(photo) => photo.faces.eyesClosedCount || '—'} />
              <Row
                label="People"
                photos={compared}
                render={(photo) =>
                  photo.personIds.length
                    ? photo.personIds.map((id) => peopleById.get(id)?.name ?? 'Unknown').join(', ')
                    : '—'
                }
              />
              <Row
                label="Flags"
                photos={compared}
                render={(photo) =>
                  photo.flags.length ? (
                    <span className="flex flex-wrap gap-1">
                      {photo.flags.map((flag) => (
                        <Chip key={flag} tone={FLAG_META[flag].tone === 'danger' ? 'danger' : 'neutral'} className="px-1.5 py-0.5 text-[9px]">
                          {FLAG_META[flag].short}
                        </Chip>
                      ))}
                    </span>
                  ) : (
                    '—'
                  )
                }
              />
              <Row label="Category" photos={compared} render={(photo) => photo.category ?? 'Unfiled'} />
              <Row label="Marks" photos={compared} render={(photo) => [photo.favorite ? 'Favourite' : '', photo.selected ? 'In album' : '', photo.rejected ? 'Not for album' : ''].filter(Boolean).join(' · ') || '—'} />
            </tbody>
          </table>
        </div>
      </Card>

      <PhotoPickerDrawer
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        photos={photos}
        comparedIds={compared.map((photo) => photo.id)}
        onAdd={add}
      />

      {lightbox !== null && compared[lightbox] ? (
        <PhotoLightbox
          photos={compared}
          index={lightbox}
          onIndexChange={setLightbox}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </div>
  );
}

function Row({
  label,
  photos,
  render,
  best,
}: {
  label: string;
  photos: Photo[];
  render: (photo: Photo) => ReactNode;
  best?: number;
}) {
  return (
    <tr className="border-b border-line/70 last:border-0">
      <th className="sticky left-0 z-10 bg-surface px-4 py-2.5 text-left text-[10.5px] font-medium text-faint">{label}</th>
      {photos.map((photo, index) => (
        <td
          key={photo.id}
          className={clsx(
            'px-4 py-2.5 align-top text-soft',
            best === index && 'font-semibold text-success',
          )}
        >
          {render(photo)}
        </td>
      ))}
    </tr>
  );
}

function ComparePane({
  photo,
  index,
  zoom,
  pan,
  showGrid,
  onPan,
  onZoomChange,
  onReset,
  onRemove,
  onInspect,
  onFavorite,
  onSelected,
  onRejected,
  onRating,
}: {
  photo: Photo;
  index: number;
  zoom: number;
  pan: { x: number; y: number };
  showGrid: boolean;
  onPan: (pan: { x: number; y: number }) => void;
  onZoomChange: (zoom: number) => void;
  onReset: () => void;
  onRemove: () => void;
  onInspect: () => void;
  onFavorite: () => void;
  onSelected: () => void;
  onRejected: () => void;
  onRating: (rating: number) => void;
}) {
  const url = usePreviewUrl(photo.id);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <Card className={clsx('overflow-hidden', index === 0 && 'ring-1 ring-accent/20')}>
      <div className="flex items-start justify-between gap-2 border-b border-line px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-[11.5px] font-semibold text-ink">{photo.name}</p>
          <p className="mt-0.5 text-[9.5px] text-faint">
            {photo.width} × {photo.height} · {formatBytes(photo.size)}
            {photo.capturedAt ? ` · ${formatTime(photo.capturedAt)}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {photo.scores ? <ScorePill score={photo.scores.overall} /> : null}
          <IconButton label="Inspect photograph" size="sm" onClick={onInspect}>
            <Maximize2 className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="Remove from compare" size="sm" tone="danger" onClick={onRemove}>
            <X className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>

      <div
        className={clsx(
          'relative flex aspect-[4/3] select-none items-center justify-center overflow-hidden bg-[#161410]',
          zoom > 1 ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default',
        )}
        onDoubleClick={() => (zoom > 1 ? onReset() : onZoomChange(2))}
        onPointerDown={(event) => {
          if (zoom <= 1 || event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          onPan({
            x: drag.current.panX + event.clientX - drag.current.x,
            y: drag.current.panY + event.clientY - drag.current.y,
          });
        }}
        onPointerUp={() => {
          drag.current = null;
          setDragging(false);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
        }}
        onWheel={(event) => {
          event.preventDefault();
          onZoomChange(zoom + (event.deltaY < 0 ? 0.25 : -0.25));
        }}
      >
        {url ? (
          <img
            src={url}
            alt={photo.name}
            draggable={false}
            className="max-h-full max-w-full object-contain transition-transform duration-100"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-white/35">
            <ImageOff className="h-5 w-5" />
            <span className="text-[10.5px]">Preview unavailable</span>
          </div>
        )}

        {showGrid ? (
          <div className="pointer-events-none absolute inset-0">
            <span className="absolute inset-y-0 left-1/3 w-px bg-white/25" />
            <span className="absolute inset-y-0 left-2/3 w-px bg-white/25" />
            <span className="absolute inset-x-0 top-1/3 h-px bg-white/25" />
            <span className="absolute inset-x-0 top-2/3 h-px bg-white/25" />
          </div>
        ) : null}

        <span className="absolute left-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[9.5px] font-semibold text-white/85 backdrop-blur">
          {index + 1}
        </span>
        {photo.rejected ? (
          <span className="absolute right-2 top-2 rounded-full bg-danger px-2 py-0.5 text-[9.5px] font-semibold text-white">
            Not for album
          </span>
        ) : photo.selected ? (
          <span className="absolute right-2 top-2 rounded-full bg-accent px-2 py-0.5 text-[9.5px] font-semibold text-accent-ink">
            In album
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-line px-2 py-1.5">
        <IconButton label="Favourite" size="sm" active={photo.favorite} onClick={onFavorite}>
          <Heart className={clsx('h-3.5 w-3.5', photo.favorite && 'fill-current')} />
        </IconButton>
        <IconButton label="Add to album" size="sm" active={photo.selected} onClick={onSelected}>
          <Check className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton label="Not for the album" size="sm" tone="danger" active={photo.rejected} onClick={onRejected}>
          <X className="h-3.5 w-3.5" />
        </IconButton>
        <span className="mx-1 h-4 w-px bg-line" />
        {Array.from({ length: 5 }).map((_, star) => (
          <button
            key={star}
            type="button"
            onClick={() => onRating(star + 1)}
            className="p-0.5"
            aria-label={`Rate ${star + 1} stars`}
          >
            <Star
              className={clsx(
                'h-3.5 w-3.5 transition-colors',
                star < photo.rating ? 'fill-accent text-accent' : 'text-faint/40 hover:text-faint',
              )}
            />
          </button>
        ))}
        <span className="ml-auto text-[9px] text-faint">
          {photo.faces.faceCount ? (
            <span className="inline-flex items-center gap-1"><Users className="h-2.5 w-2.5" />{photo.faces.faceCount}</span>
          ) : null}
        </span>
      </div>

      <div className="flex flex-wrap gap-1 px-2.5 py-2">
        {photo.flags.length ? (
          photo.flags.slice(0, 4).map((flag) => (
            <Chip key={flag} tone={FLAG_META[flag].tone === 'danger' ? 'danger' : 'neutral'} className="px-1.5 py-0.5 text-[9px]">
              {FLAG_META[flag].short}
            </Chip>
          ))
        ) : (
          <span className="text-[9.5px] text-faint">No quality flags</span>
        )}
      </div>
    </Card>
  );
}

function PhotoPickerDrawer({
  open,
  onClose,
  photos,
  comparedIds,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  photos: Photo[];
  comparedIds: string[];
  onAdd: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const added = useMemo(() => new Set(comparedIds), [comparedIds]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return photos
      .filter((photo) => !photo.rejected)
      .filter((photo) => {
        if (!term) return true;
        return (
          photo.name.toLowerCase().includes(term) ||
          (photo.category ?? '').includes(term) ||
          photo.tags.some((tag) => tag.includes(term))
        );
      })
      .sort((a, b) => (b.scores?.overall ?? 0) - (a.scores?.overall ?? 0))
      .slice(0, 160);
  }, [photos, query]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Add to compare"
      subtitle={`${added.size} of 4 selected`}
      width="lg"
    >
      <div className="sticky top-0 z-10 border-b border-line bg-surface p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <TextInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by filename, category or tag…"
            className="h-9 pl-9 text-[12px]"
            aria-label="Search photographs to compare"
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-4">
        {filtered.map((photo) => (
          <PickerTile
            key={photo.id}
            photo={photo}
            added={added.has(photo.id)}
            disabled={!added.has(photo.id) && added.size >= 4}
            onAdd={() => onAdd(photo.id)}
          />
        ))}
        {!filtered.length ? (
          <p className="col-span-full py-10 text-center text-[11.5px] text-faint">No photographs match that search.</p>
        ) : null}
      </div>
    </Drawer>
  );
}

function PickerTile({
  photo,
  added,
  disabled,
  onAdd,
}: {
  photo: Photo;
  added: boolean;
  disabled: boolean;
  onAdd: () => void;
}) {
  const url = useThumbUrl(photo.id);
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={added || disabled}
      className={clsx(
        'group relative overflow-hidden rounded-lg border bg-raised text-left transition-all',
        added ? 'border-accent ring-1 ring-accent/30' : 'border-line hover:border-accent/50',
        disabled && !added && 'opacity-40',
      )}
    >
      <span className="block aspect-square overflow-hidden">
        {url ? (
          <img src={url} alt={photo.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-faint"><ImageOff className="h-4 w-4" /></span>
        )}
      </span>
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 pt-4">
        <span className="block truncate text-[9px] font-medium text-white/90">{photo.name}</span>
      </span>
      {added ? (
        <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-ink">
          <Check className="h-3 w-3" />
        </span>
      ) : null}
    </button>
  );
}
