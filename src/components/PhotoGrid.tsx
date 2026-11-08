import { useMemo } from 'react';
import clsx from 'clsx';
import type { Photo } from '@/types';
import { useAppStore } from '@/store/appStore';
import { useIncrementalReveal } from '@/hooks/useApp';
import { PhotoTile } from './PhotoTile';
import { Spinner } from './ui';

export interface PhotoGridProps {
  photos: Photo[];
  onOpen?: (photo: Photo) => void;
  selectable?: boolean;
  showMeta?: boolean;
  className?: string;
  empty?: React.ReactNode;
  density?: 'comfortable' | 'compact';
  tileAspect?: 'square' | 'natural';
}

export function PhotoGrid({
  photos,
  onOpen,
  selectable = true,
  showMeta = true,
  className,
  empty,
  density,
  tileAspect = 'square',
}: PhotoGridProps) {
  const settingsDensity = useAppStore((state) => state.settings.gridDensity);
  const toggleSelected = useAppStore((state) => state.toggleSelected);
  const toggleFavorite = useAppStore((state) => state.toggleFavorite);
  const toggleRejected = useAppStore((state) => state.toggleRejected);

  const resolvedDensity = density ?? settingsDensity;
  const { visible, sentinelRef } = useIncrementalReveal(photos.length, 120, 160);
  const shown = useMemo(() => photos.slice(0, visible), [photos, visible]);

  if (!photos.length) return <>{empty ?? null}</>;

  return (
    <div>
      <div
        className={clsx('photo-grid', className)}
        data-density={resolvedDensity}
      >
        {shown.map((photo) => (
          <PhotoTile
            key={photo.id}
            photo={photo}
            onOpen={onOpen}
            onToggleSelected={selectable ? (item) => void toggleSelected(item.id) : undefined}
            onToggleFavorite={(item) => void toggleFavorite(item.id)}
            onToggleRejected={(item) => void toggleRejected(item.id)}
            selectable={selectable}
            showMeta={showMeta}
            aspect={tileAspect}
          />
        ))}
      </div>
      {visible < photos.length ? (
        <div ref={sentinelRef} className="flex items-center justify-center gap-2 py-10 text-[12px] text-faint">
          <Spinner className="h-4 w-4" />
          Loading more photographs…
        </div>
      ) : null}
    </div>
  );
}
