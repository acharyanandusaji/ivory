import { useState } from 'react';
import clsx from 'clsx';
import {
  Check,
  Heart,
  ImageOff,
  Layers,
  Star,
  X,
} from 'lucide-react';
import type { Photo } from '@/types';
import { FLAG_META } from '@/lib/constants';
import { useThumbUrl } from '@/hooks/useApp';
import { ScorePill } from './ui';

export interface PhotoTileProps {
  photo: Photo;
  onOpen?: (photo: Photo) => void;
  onToggleSelected?: (photo: Photo) => void;
  onToggleFavorite?: (photo: Photo) => void;
  onToggleRejected?: (photo: Photo) => void;
  selectable?: boolean;
  showMeta?: boolean;
  className?: string;
  aspect?: 'square' | 'natural';
}

export function PhotoTile({
  photo,
  onOpen,
  onToggleSelected,
  onToggleFavorite,
  onToggleRejected,
  selectable = true,
  showMeta = true,
  className,
  aspect = 'square',
}: PhotoTileProps) {
  const url = useThumbUrl(photo.id);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const score = photo.scores?.overall ?? 0;
  const flagged = photo.flags.find((flag) => FLAG_META[flag].tone === 'danger');

  return (
    <figure
      className={clsx(
        'group relative isolate overflow-hidden rounded-xl border border-line bg-raised transition-all duration-200',
        photo.rejected ? 'opacity-55 saturate-50' : 'hover:-translate-y-0.5 hover:border-accent/45 hover:shadow-lift',
        aspect === 'square' ? 'aspect-square' : 'aspect-[4/3]',
        className,
      )}
    >
      <button
        type="button"
        className="absolute inset-0 z-10 cursor-zoom-in"
        onClick={() => onOpen?.(photo)}
        aria-label={`Open ${photo.name}`}
      >
        <span className="sr-only">Open {photo.name}</span>
      </button>

      {url ? (
        <img
          src={url}
          alt={photo.name}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={clsx(
            'h-full w-full object-cover transition-all duration-500',
            loaded ? 'scale-100 opacity-100 blur-0' : 'scale-[1.03] opacity-0 blur-sm',
            photo.rejected && 'grayscale',
          )}
        />
      ) : null}

      {!url || (!loaded && !failed) ? (
        <div className="absolute inset-0 -z-0 animate-pulse-soft bg-gradient-to-br from-raised via-surface to-raised" />
      ) : null}

      {failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-faint">
          <ImageOff className="h-6 w-6" />
          <span className="px-3 text-center text-[10.5px] leading-tight">Preview unavailable</span>
        </div>
      ) : null}

      {photo.status !== 'ready' ? (
        <div className="absolute left-2 top-2 z-20 rounded-full bg-ink/75 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-white backdrop-blur">
          {photo.status === 'error' ? 'Needs attention' : 'Analysing'}
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/55 via-transparent to-black/15 opacity-70 transition-opacity group-hover:opacity-90" />

      <div className={clsx('absolute left-2 top-2 z-20 flex items-center gap-1.5', photo.status !== 'ready' && 'top-8')}>
        {onToggleSelected ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleSelected(photo);
            }}
            aria-label={photo.selected ? `Remove ${photo.name} from album` : `Add ${photo.name} to album`}
            className={clsx(
              'flex h-6 w-6 items-center justify-center rounded-full border transition-all',
              photo.selected
                ? 'border-accent bg-accent text-accent-ink shadow-sm'
                : 'border-white/50 bg-black/25 text-white/90 backdrop-blur-sm hover:bg-black/45',
              !selectable && 'hidden',
            )}
          >
            <Check className={clsx('h-3.5 w-3.5 transition-opacity', photo.selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-70')} />
          </button>
        ) : null}
        {photo.originalStored ? (
          <span className="rounded-full bg-black/30 px-1.5 py-0.5 text-[9px] font-medium text-white/80 backdrop-blur-sm">
            RAW
          </span>
        ) : null}
      </div>

      <div className="absolute right-2 top-2 z-20 flex items-center gap-1.5">
        {photo.flags.length ? (
          <span
            className={clsx(
              'rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide backdrop-blur-sm',
              flagged ? 'bg-danger/85 text-white' : 'bg-black/35 text-white/85',
            )}
            title={photo.flags.map((flag) => FLAG_META[flag].label).join(' · ')}
          >
            {flagged ? FLAG_META[flagged].short : photo.flags.length + ' notes'}
          </span>
        ) : null}
        {score > 0 ? <ScorePill score={score} /> : null}
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-2 p-2.5">
        <div className="min-w-0 translate-y-1 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
          <p className="truncate text-[10.5px] font-medium leading-tight text-white/95 drop-shadow">{photo.name}</p>
          {showMeta ? (
            <p className="mt-0.5 truncate text-[9.5px] text-white/65">
              {photo.faces.faceCount ? `${photo.faces.faceCount} ${photo.faces.faceCount === 1 ? 'face' : 'faces'}` : 'No faces'}
              {photo.groupIds.length ? ` · ${photo.groupIds.length} set${photo.groupIds.length === 1 ? '' : 's'}` : ''}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onToggleFavorite ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onToggleFavorite(photo);
              }}
              aria-label={photo.favorite ? 'Remove favourite' : 'Mark as favourite'}
              className={clsx(
                'flex h-7 w-7 items-center justify-center rounded-full backdrop-blur-sm transition-all',
                photo.favorite
                  ? 'bg-white/90 text-accent'
                  : 'bg-black/25 text-white/80 opacity-0 hover:bg-black/45 group-hover:opacity-100',
              )}
            >
              <Heart className={clsx('h-3.5 w-3.5', photo.favorite && 'fill-current')} />
            </button>
          ) : null}
          {onToggleRejected ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onToggleRejected(photo);
              }}
              aria-label={photo.rejected ? 'Restore photo' : 'Mark as not for the album'}
              className={clsx(
                'flex h-7 w-7 items-center justify-center rounded-full backdrop-blur-sm transition-all',
                photo.rejected
                  ? 'bg-white/90 text-danger'
                  : 'bg-black/25 text-white/80 opacity-0 hover:bg-black/45 group-hover:opacity-100',
              )}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {photo.rating > 0 ? (
        <span className="absolute bottom-2 left-2 z-20 flex items-center gap-0.5 rounded-full bg-black/35 px-1.5 py-0.5 backdrop-blur-sm">
          {Array.from({ length: photo.rating }).map((_, index) => (
            <Star key={index} className="h-2.5 w-2.5 fill-accent text-accent" />
          ))}
        </span>
      ) : null}

      {photo.groupIds.length > 1 ? (
        <span
          className="absolute bottom-2 right-2 z-20 flex items-center gap-1 rounded-full bg-black/40 px-1.5 py-0.5 text-[9px] font-medium text-white/85 backdrop-blur-sm"
          title="Part of similar or burst sets"
        >
          <Layers className="h-2.5 w-2.5" />
          {photo.groupIds.length}
        </span>
      ) : null}
    </figure>
  );
}
