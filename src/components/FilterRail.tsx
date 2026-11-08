import { useMemo } from 'react';
import clsx from 'clsx';
import {
  CalendarDays,
  Check,
  ChevronRight,
  Heart,
  RotateCcw,
  SlidersHorizontal,
  Star,
  Tag,
  Users,
  X,
} from 'lucide-react';
import type { AlbumCategory, PhotoFlag } from '@/types';
import { useAppStore } from '@/store/appStore';
import { useLibraryView } from '@/hooks/useLibrary';
import { ALBUM_CATEGORIES, FLAG_META } from '@/lib/constants';
import { SMART_FILTERS } from '@/lib/categories';
import { formatCount } from '@/lib/utils';
import { Button, Chip, IconButton, SegmentedControl, Slider } from './ui';

function Section({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="border-b border-line px-4 py-4 last:border-b-0">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-faint">
          {icon}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function ChipToggle({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
        active
          ? 'border-accent/35 bg-accent-soft text-accent'
          : 'border-line bg-surface text-soft hover:border-accent/30 hover:text-ink',
      )}
    >
      {active ? <Check className="h-3 w-3" /> : null}
      {children}
    </button>
  );
}

function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export interface FilterRailProps {
  onClose?: () => void;
  className?: string;
}

export function FilterRail({ onClose, className }: FilterRailProps) {
  const filters = useAppStore((state) => state.filters);
  const setFilters = useAppStore((state) => state.setFilters);
  const resetFilters = useAppStore((state) => state.resetFilters);
  const people = useAppStore((state) => state.people);
  const events = useAppStore((state) => state.events);
  const photos = useAppStore((state) => state.photos);
  const { photos: visible } = useLibraryView();

  const sortedPeople = useMemo(
    () => [...people].sort((a, b) => b.faceCount - a.faceCount).slice(0, 12),
    [people],
  );
  const eventCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const photo of photos) {
      if (photo.eventId) counts.set(photo.eventId, (counts.get(photo.eventId) ?? 0) + 1);
    }
    return counts;
  }, [photos]);

  const groups = ['people', 'moments', 'quality'] as const;
  const groupLabels = { people: 'People', moments: 'Moments', quality: 'Quality' } as const;

  return (
    <aside className={clsx('flex flex-col rounded-xl2 border border-line bg-surface shadow-soft', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3.5">
        <div>
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-ink">
            <SlidersHorizontal className="h-3.5 w-3.5 text-accent" /> Filters
          </p>
          <p className="mt-0.5 text-[10px] text-faint">{formatCount(visible.length)} photographs match</p>
        </div>
        <div className="flex items-center gap-1">
          <IconButton label="Reset all filters" size="sm" onClick={resetFilters}>
            <RotateCcw className="h-3.5 w-3.5" />
          </IconButton>
          {onClose ? (
            <IconButton label="Close filters" size="sm" onClick={onClose} className="lg:hidden">
              <X className="h-3.5 w-3.5" />
            </IconButton>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Quick views" icon={<Tag className="h-3 w-3" />}>
          <div className="space-y-3">
            {groups.map((group) => (
              <div key={group}>
                <p className="mb-1.5 text-[10px] font-medium text-faint">{groupLabels[group]}</p>
                <div className="flex flex-wrap gap-1.5">
                  {SMART_FILTERS.filter((filter) => filter.group === group).map((filter) => (
                    <ChipToggle
                      key={filter.id}
                      active={filters.smart.includes(filter.id)}
                      onClick={() => setFilters({ smart: toggleValue(filters.smart, filter.id) })}
                    >
                      {filter.label}
                    </ChipToggle>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="People"
          icon={<Users className="h-3 w-3" />}
          action={
            filters.peopleIds.length > 1 ? (
              <button
                type="button"
                onClick={() => setFilters({ peopleMode: filters.peopleMode === 'all' ? 'any' : 'all' })}
                className="rounded-full border border-line px-2 py-0.5 text-[9.5px] font-medium text-soft hover:text-ink"
              >
                {filters.peopleMode === 'all' ? 'All together' : 'Any of'}
              </button>
            ) : null
          }
        >
          {sortedPeople.length ? (
            <div className="flex flex-wrap gap-1.5">
              {sortedPeople.map((person) => (
                <ChipToggle
                  key={person.id}
                  active={filters.peopleIds.includes(person.id)}
                  onClick={() => setFilters({ peopleIds: toggleValue(filters.peopleIds, person.id) })}
                  title={`${person.name} · ${person.faceCount} faces`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: person.color ?? '#B08D57' }}
                  />
                  {person.name}
                </ChipToggle>
              ))}
            </div>
          ) : (
            <p className="text-[11px] leading-relaxed text-faint">
              People appear after face analysis. You can turn face grouping on in Settings.
            </p>
          )}
          {filters.peopleIds.length ? (
            <button
              type="button"
              onClick={() => setFilters({ peopleIds: [] })}
              className="mt-2 text-[10.5px] font-medium text-accent hover:underline"
            >
              Clear {filters.peopleIds.length} selected people
            </button>
          ) : null}
        </Section>

        <Section title="Moments" icon={<CalendarDays className="h-3 w-3" />}>
          {events.length ? (
            <div className="space-y-1">
              {events.map((event) => {
                const active = filters.eventId === event.id;
                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => setFilters({ eventId: active ? null : event.id })}
                    className={clsx(
                      'flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[11.5px] transition-colors',
                      active ? 'bg-accent-soft text-accent' : 'text-soft hover:bg-raised hover:text-ink',
                    )}
                  >
                    <span className="min-w-0 truncate capitalize">{event.name || event.type.replace('-', ' ')}</span>
                    <span className="shrink-0 text-[9.5px] tabular-nums text-faint">
                      {eventCounts.get(event.id) ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px] text-faint">No moments yet. Analysis groups photographs by capture time.</p>
          )}
        </Section>

        <Section title="Album category" icon={<Tag className="h-3 w-3" />}>
          <div className="flex flex-wrap gap-1.5">
            {ALBUM_CATEGORIES.map((category) => (
              <ChipToggle
                key={category.id}
                title={category.hint}
                active={filters.categories.includes(category.id)}
                onClick={() =>
                  setFilters({ categories: toggleValue(filters.categories, category.id) as AlbumCategory[] })
                }
              >
                {category.label}
              </ChipToggle>
            ))}
          </div>
        </Section>

        <Section title="Signals" icon={<Star className="h-3 w-3" />}>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(FLAG_META) as PhotoFlag[]).map((flag) => (
              <ChipToggle
                key={flag}
                active={filters.flags.includes(flag)}
                onClick={() => setFilters({ flags: toggleValue(filters.flags, flag) })}
              >
                {FLAG_META[flag].label}
              </ChipToggle>
            ))}
          </div>
        </Section>

        <Section title="Thresholds" icon={<ChevronRight className="h-3 w-3" />}>
          <div className="space-y-4">
            <Slider
              label="Minimum quality"
              value={filters.minScore}
              min={0}
              max={95}
              step={5}
              onChange={(value) => setFilters({ minScore: value })}
              formatValue={(value) => (value ? `${value}+` : 'Any')}
            />
            <Slider
              label="Minimum rating"
              value={filters.minRating}
              min={0}
              max={5}
              step={1}
              onChange={(value) => setFilters({ minRating: value })}
              formatValue={(value) => (value ? `${value} stars` : 'Any')}
            />
            <div>
              <p className="mb-1.5 text-[11px] font-medium text-soft">Orientation</p>
              <SegmentedControl
                size="sm"
                value={filters.orientation}
                onChange={(value) => setFilters({ orientation: value })}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'landscape', label: 'Landscape' },
                  { value: 'portrait', label: 'Portrait' },
                  { value: 'square', label: 'Square' },
                ]}
              />
            </div>
          </div>
        </Section>

        <Section title="Status" icon={<Heart className="h-3 w-3" />}>
          <div className="space-y-2">
            {(
              [
                ['onlyFavorites', 'Favourites only', 'Show photographs you marked with a heart'],
                ['onlySelected', 'In the album', 'Show photographs currently selected for the album'],
                ['onlyUnreviewed', 'Not yet reviewed', 'No heart, rating, rejection or album mark'],
                ['onlyRejected', 'Not for the album', 'Show only the photographs you set aside'],
                ['hideRejected', 'Hide set-aside photos', 'Keep rejected photographs out of the grid'],
              ] as const
            ).map(([key, label, hint]) => {
              const disabled = key === 'hideRejected' && filters.onlyRejected;
              return (
                <label
                  key={key}
                  title={hint}
                  className={clsx(
                    'flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-[11.5px] transition-colors',
                    filters[key] ? 'border-accent/30 bg-accent-soft/60 text-ink' : 'border-line text-soft hover:bg-raised',
                    disabled && 'cursor-not-allowed opacity-45',
                  )}
                >
                  <span
                    className={clsx(
                      'flex h-3.5 w-3.5 items-center justify-center rounded border',
                      filters[key] ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface',
                    )}
                  >
                    {filters[key] ? <Check className="h-2.5 w-2.5" /> : null}
                  </span>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={filters[key]}
                    disabled={disabled}
                    onChange={() => setFilters({ [key]: !filters[key] } as never)}
                  />
                  {label}
                </label>
              );
            })}
          </div>
        </Section>
      </div>

      <div className="border-t border-line p-3">
        <Button variant="ghost" size="sm" className="w-full" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={resetFilters}>
          Reset all filters
        </Button>
      </div>
    </aside>
  );
}
