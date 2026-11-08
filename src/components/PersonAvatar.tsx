import clsx from 'clsx';
import type { Face, Person } from '@/types';
import { useFaceUrl } from '@/hooks/useApp';

export function PersonAvatar({
  person,
  faces,
  size = 48,
  className,
}: {
  person: Person;
  faces: Face[];
  size?: number;
  className?: string;
}) {
  const cover = person.coverFaceId ? faces.find((face) => face.id === person.coverFaceId) : null;
  const url = useFaceUrl(cover?.photoId, cover?.id);

  return (
    <span
      className={clsx('relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full', className)}
      style={{ width: size, height: size, backgroundColor: person.color ?? '#B08D57' }}
    >
      {url ? (
        <img src={url} alt={person.name} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span
          className="font-semibold text-white"
          style={{ fontSize: Math.max(9, Math.round(size * 0.3)) }}
        >
          {person.name.replace(/^Person /, '').slice(0, 2).toUpperCase()}
        </span>
      )}
      {person.role !== 'other' ? (
        <span className="absolute inset-x-0 bottom-0 truncate bg-black/45 px-1 text-center text-[7px] font-medium uppercase tracking-wide text-white/90 backdrop-blur-sm">
          {person.role}
        </span>
      ) : null}
    </span>
  );
}
