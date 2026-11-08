import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowRight,
  CalendarDays,
  Camera,
  Check,
  ChevronRight,
  Clock,
  Images,
  Layers,
  MapPin,
  Sparkles,
  Users,
} from 'lucide-react';
import type { EventRecord, EventType, Photo } from '@/types';
import { useAppStore } from '@/store/appStore';
import { useThumbUrl } from '@/hooks/useApp';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProjectGate } from '@/components/ProjectGate';
import { PhotoGrid } from '@/components/PhotoGrid';
import { PhotoLightbox } from '@/components/PhotoLightbox';
import {
  Button,
  Card,
  Chip,
  Drawer,
  EmptyState,
  SegmentedControl,
} from '@/components/ui';
import { EVENT_TYPES } from '@/lib/constants';
import { eventTypeLabel } from '@/lib/categories';
import {
  formatCount,
  formatDate,
  formatDayKey,
  formatDayLabel,
  formatTime,
  timeOfDayLabel,
} from '@/lib/utils';

interface DayGroup {
  key: string;
  time: number;
  eventIds: string[];
  unassigned: Photo[];
}

interface EventRow {
  event: EventRecord;
  photos: Photo[];
}

function MomentImage({ photo, className }: { photo: Photo; className?: string }) {
  const url = useThumbUrl(photo.id);
  return (
    <span className={clsx('relative block overflow-hidden bg-raised', className)}>
      {url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          draggable={false}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-faint">
          <Images className="h-4 w-4" />
        </span>
      )}
    </span>
  );
}

function MomentCard({ row, onOpen }: { row: EventRow; onOpen: () => void }) {
  const { event, photos } = row;
  const chosen = photos.filter((photo) => photo.selected).length;
  const withFaces = photos.filter((photo) => photo.faces.faceCount > 0).length;
  const best = photos.reduce((value, photo) => Math.max(value, photo.scores?.overall ?? 0), 0);
  const mosaic = photos.slice(0, 4);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex w-full flex-col overflow-hidden rounded-xl2 border border-line bg-surface text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lift"
    >
      <div className="relative grid h-32 grid-cols-4 gap-px bg-line sm:h-36">
        {mosaic.map((photo) => (
          <MomentImage key={photo.id} photo={photo} className="h-full" />
        ))}
        {Array.from({ length: Math.max(0, 4 - mosaic.length) }).map((_, index) => (
          <span key={`empty-${index}`} className="flex h-full items-center justify-center bg-raised/60 text-faint">
            <Images className="h-3.5 w-3.5" />
          </span>
        ))}
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
        <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/45 px-2 py-0.5 text-[9.5px] font-medium text-white/90 backdrop-blur-sm">
          {formatTime(event.start)}–{formatTime(event.end)}
        </span>
        {chosen ? (
          <span className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[9.5px] font-semibold text-accent-ink">
            <Check className="h-2.5 w-2.5" /> {chosen}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-medium capitalize text-ink">
              {event.name || eventTypeLabel(event.type)}
            </p>
            <p className="mt-0.5 text-[10px] text-faint">
              {formatCount(photos.length)} photographs
              {withFaces ? ` · ${formatCount(withFaces)} with faces` : ''}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-line bg-raised px-2 py-0.5 text-[9px] font-medium capitalize text-soft">
            {eventTypeLabel(event.type)}
          </span>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <span className="text-[10px] text-faint">
            {best ? `Top ${Math.round(best)}` : 'Not scored yet'}
          </span>
          <span className="flex items-center gap-1 text-[10.5px] font-medium text-accent">
            Open moment <ChevronRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </button>
  );
}

export function TimelinePage() {
  return (
    <ProjectGate feature="the timeline">
      <TimelineWorkspace />
    </ProjectGate>
  );
}

function TimelineWorkspace() {
  const project = useAppStore((state) => state.project)!;
  const photos = useAppStore((state) => state.photos);
  const events = useAppStore((state) => state.events);
  const setFilters = useAppStore((state) => state.setFilters);
  const selectAll = useAppStore((state) => state.selectAll);
  const navigate = useNavigate();

  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [loose, setLoose] = useState<{ photos: Photo[]; index: number } | null>(null);
  const [typeFilter, setTypeFilter] = useState<'all' | EventType>('all');
  const [density, setDensity] = useState<'moments' | 'frames'>('moments');

  const photosByEvent = useMemo(() => {
    const map = new Map<string, Photo[]>();
    for (const photo of photos) {
      if (!photo.eventId) continue;
      const list = map.get(photo.eventId);
      if (list) list.push(photo);
      else map.set(photo.eventId, [photo]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.capturedAt ?? a.addedAt) - (b.capturedAt ?? b.addedAt));
    }
    return map;
  }, [photos]);

  const eventRows = useMemo<EventRow[]>(
    () =>
      events
        .map((event) => ({ event, photos: photosByEvent.get(event.id) ?? [] }))
        .filter((row) => row.photos.length > 0)
        .sort((a, b) => a.event.start - b.event.start),
    [events, photosByEvent],
  );

  const typeCounts = useMemo(() => {
    const counts = new Map<EventType, number>();
    for (const row of eventRows) counts.set(row.event.type, (counts.get(row.event.type) ?? 0) + 1);
    return counts;
  }, [eventRows]);

  const days = useMemo<DayGroup[]>(() => {
    const map = new Map<string, DayGroup>();
    const ensure = (time: number): DayGroup => {
      const key = formatDayKey(time);
      let day = map.get(key);
      if (!day) {
        day = { key, time, eventIds: [], unassigned: [] };
        map.set(key, day);
      }
      return day;
    };

    for (const row of eventRows) {
      if (typeFilter !== 'all' && row.event.type !== typeFilter) continue;
      ensure(row.event.start).eventIds.push(row.event.id);
    }

    for (const photo of photos) {
      if (photo.eventId) continue;
      if (typeFilter !== 'all') continue;
      ensure(photo.capturedAt ?? photo.addedAt).unassigned.push(photo);
    }

    const result = Array.from(map.values()).sort((a, b) => a.time - b.time);
    for (const day of result) {
      day.unassigned.sort((a, b) => (a.capturedAt ?? a.addedAt) - (b.capturedAt ?? b.addedAt));
    }
    return result;
  }, [eventRows, photos, typeFilter]);

  const activeRow = activeEventId ? eventRows.find((row) => row.event.id === activeEventId) ?? null : null;

  const totalChosen = photos.filter((photo) => photo.selected).length;
  const withCapture = photos.filter((photo) => photo.capturedAt).length;
  const dateRange = useMemo(() => {
    const timed = photos
      .map((photo) => photo.capturedAt)
      .filter((time): time is number => typeof time === 'number')
      .sort((a, b) => a - b);
    if (!timed.length) return null;
    return { start: timed[0], end: timed[timed.length - 1] };
  }, [photos]);

  if (!photos.length) {
    return (
      <div className="animate-fade-up">
        <PageHeader
          eyebrow="Timeline"
          title="The day, in the order it happened"
          description="Ivory groups photographs into moments using capture time, then lays them out day by day. Nothing is moved or renamed."
        />
        <EmptyState
          icon={<CalendarDays className="h-5 w-5" />}
          title="No timeline yet"
          description="Import photographs with their capture dates intact. Although previews render immediately, moments appear after local analysis."
          action={<Button variant="primary" onClick={() => navigate('/import')}>Import photographs</Button>}
        />
      </div>
    );
  }

  const openInLibrary = (event: EventRecord) => {
    setFilters({ eventId: event.id, hideRejected: true });
    navigate('/library');
  };

  const selectEvent = async (row: EventRow) => {
    await selectAll(row.photos.map((photo) => photo.id));
  };

  return (
    <div className="animate-fade-up pb-16">
      <PageHeader
        eyebrow="Timeline"
        title="The day, in the order it happened"
        description={
          project.coupleNames
            ? `${project.coupleNames}${dateRange ? ` · ${formatDate(dateRange.start)}` : ''}. Every frame stays in its original order.`
            : 'Photographs are grouped into moments by capture time. Every recommendation can be overridden.'
        }
        actions={
          <>
            <Button variant="secondary" icon={<Sparkles className="h-4 w-4" />} onClick={() => navigate('/review')}>
              Review sets
            </Button>
            <Button variant="primary" icon={<Check className="h-4 w-4" />} onClick={() => navigate('/album')}>
              Build album
            </Button>
          </>
        }
      >
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Chip tone="neutral">
            <CalendarDays className="h-3 w-3" /> {formatCount(days.length)} {days.length === 1 ? 'day' : 'days'}
          </Chip>
          <Chip tone="neutral">
            <Clock className="h-3 w-3" /> {formatCount(eventRows.length)} moments
          </Chip>
          <Chip tone="accent">
            <Check className="h-3 w-3" /> {formatCount(totalChosen)} in the album
          </Chip>
          {withCapture < photos.length ? (
            <Chip tone="danger">
              {formatCount(photos.length - withCapture)} without capture dates
            </Chip>
          ) : null}
        </div>
      </PageHeader>

      <Card className="mb-6 flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setTypeFilter('all')}
            className={clsx(
              'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
              typeFilter === 'all'
                ? 'border-accent/35 bg-accent-soft text-accent'
                : 'border-line bg-surface text-soft hover:border-accent/30 hover:text-ink',
            )}
          >
            All moments
          </button>
          {EVENT_TYPES.filter((type) => (typeCounts.get(type.id) ?? 0) > 0).map((type) => (
            <button
              key={type.id}
              type="button"
              onClick={() => setTypeFilter(typeFilter === type.id ? 'all' : type.id)}
              className={clsx(
                'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                typeFilter === type.id
                  ? 'border-accent/35 bg-accent-soft text-accent'
                  : 'border-line bg-surface text-soft hover:border-accent/30 hover:text-ink',
              )}
            >
              {type.label}
              <span className="ml-1.5 text-[9.5px] tabular-nums opacity-60">{typeCounts.get(type.id)}</span>
            </button>
          ))}
        </div>
        <SegmentedControl
          value={density}
          onChange={setDensity}
          options={[
            { value: 'moments', label: 'Moments', icon: <Layers className="h-3 w-3" /> },
            { value: 'frames', label: 'Frames', icon: <Images className="h-3 w-3" /> },
          ]}
        />
      </Card>

      {!days.length ? (
        <EmptyState
          compact
          icon={<Clock className="h-5 w-5" />}
          title="No moments of this kind"
          description="Try another category, or import photographs with capture dates. You can also re-run analysis to regroup the day."
          action={
            <Button variant="secondary" size="sm" onClick={() => setTypeFilter('all')}>
              Show every moment
            </Button>
          }
        />
      ) : density === 'frames' ? (
        <div className="space-y-8">
          {days.map((day) => {
            const dayPhotos = [
              ...day.eventIds.flatMap((id) => photosByEvent.get(id) ?? []),
              ...day.unassigned,
            ].sort((a, b) => (a.capturedAt ?? a.addedAt) - (b.capturedAt ?? b.addedAt));
            return (
              <section key={day.key}>
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
                      {timeOfDayLabel(day.time)}
                    </p>
                    <h2 className="display text-[22px] text-ink">{formatDayLabel(day.time)}</h2>
                  </div>
                  <span className="text-[10.5px] text-faint">{formatCount(dayPhotos.length)} photographs</span>
                </div>
                <PhotoGrid
                  photos={dayPhotos}
                  onOpen={(photo) =>
                    setLoose({
                      photos: dayPhotos,
                      index: dayPhotos.findIndex((item) => item.id === photo.id),
                    })
                  }
                />
              </section>
            );
          })}
        </div>
      ) : (
        <div className="space-y-10">
          {days.map((day) => {
            const dayEvents = day.eventIds
              .map((id) => eventRows.find((row) => row.event.id === id))
              .filter((row): row is EventRow => Boolean(row));
            const count = dayEvents.reduce((sum, row) => sum + row.photos.length, 0) + day.unassigned.length;
            return (
              <section key={day.key} className="grid gap-4 lg:grid-cols-[160px_minmax(0,1fr)]">
                <div className="lg:sticky lg:top-[84px] lg:self-start">
                  <div className="flex items-center gap-2 lg:flex-col lg:items-start lg:gap-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
                      {new Date(day.time).toLocaleDateString(undefined, { weekday: 'long' })}
                    </p>
                    <p className="display text-[26px] leading-tight text-ink">
                      {new Date(day.time).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                    </p>
                    <p className="text-[10.5px] text-faint">
                      {new Date(day.time).getFullYear()} · {formatCount(count)} frames
                    </p>
                  </div>
                  <div className="mt-3 hidden h-px w-10 bg-accent/40 lg:block" />
                </div>

                <div className="min-w-0 space-y-4">
                  {dayEvents.length ? (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {dayEvents.map((row) => (
                        <MomentCard key={row.event.id} row={row} onOpen={() => setActiveEventId(row.event.id)} />
                      ))}
                    </div>
                  ) : null}

                  {day.unassigned.length ? (
                    <div className="rounded-xl2 border border-dashed border-line bg-surface/50 p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-raised text-faint">
                            <Camera className="h-3.5 w-3.5" />
                          </span>
                          <div>
                            <p className="text-[12px] font-medium text-ink">Unsorted frames</p>
                            <p className="text-[10px] text-faint">
                              No moment detected · {formatCount(day.unassigned.length)} photographs
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setFilters({ eventId: null, search: '' });
                            navigate('/library');
                          }}
                        >
                          Open in library <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                        {day.unassigned.slice(0, 10).map((photo) => (
                          <button
                            key={photo.id}
                            type="button"
                            onClick={() =>
                              setLoose({
                                photos: day.unassigned,
                                index: day.unassigned.findIndex((item) => item.id === photo.id),
                              })
                            }
                            className="group w-28 shrink-0 overflow-hidden rounded-lg border border-line bg-raised transition-colors hover:border-accent/40"
                          >
                            <MomentImage photo={photo} className="h-20 w-full" />
                            <span className="block truncate px-2 py-1.5 text-left text-[9.5px] text-soft">
                              {photo.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {loose && loose.photos[loose.index] ? (
        <PhotoLightbox
          photos={loose.photos}
          index={loose.index}
          onIndexChange={(index) => setLoose((current) => (current ? { ...current, index } : current))}
          onClose={() => setLoose(null)}
        />
      ) : null}

      <Drawer
        open={Boolean(activeRow)}
        onClose={() => setActiveEventId(null)}
        title={activeRow?.event.name || (activeRow ? eventTypeLabel(activeRow.event.type) : 'Moment')}
        subtitle={
          activeRow
            ? `${formatDayLabel(activeRow.event.start)} · ${formatTime(activeRow.event.start)}–${formatTime(activeRow.event.end)}`
            : undefined
        }
        width="lg"
        footer={
          activeRow ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10.5px] text-faint">
                {formatCount(activeRow.photos.filter((photo) => photo.selected).length)} of{' '}
                {formatCount(activeRow.photos.length)} in the album
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Check className="h-3.5 w-3.5" />}
                  onClick={() => void selectEvent(activeRow)}
                >
                  Select all
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<ArrowRight className="h-3.5 w-3.5" />}
                  onClick={() => openInLibrary(activeRow.event)}
                >
                  Open in library
                </Button>
              </div>
            </div>
          ) : undefined
        }
      >
        {activeRow ? (
          <div className="p-4">
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                {
                  label: 'Photographs',
                  value: formatCount(activeRow.photos.length),
                  icon: <Images className="h-3.5 w-3.5" />,
                },
                {
                  label: 'In album',
                  value: formatCount(activeRow.photos.filter((photo) => photo.selected).length),
                  icon: <Check className="h-3.5 w-3.5" />,
                },
                {
                  label: 'People seen',
                  value: formatCount(
                    new Set(activeRow.photos.flatMap((photo) => photo.personIds)).size,
                  ),
                  icon: <Users className="h-3.5 w-3.5" />,
                },
                {
                  label: 'Avg. quality',
                  value: String(
                    Math.round(
                      activeRow.photos.reduce((sum, photo) => sum + (photo.scores?.overall ?? 0), 0) /
                        Math.max(1, activeRow.photos.length),
                    ) || 0,
                  ),
                  icon: <Sparkles className="h-3.5 w-3.5" />,
                },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl border border-line bg-raised/60 p-3">
                  <span className="flex items-center gap-1.5 text-[9px] uppercase tracking-wide text-faint">
                    {stat.icon}
                    {stat.label}
                  </span>
                  <p className="mt-1 text-[17px] font-semibold tabular-nums text-ink">{stat.value}</p>
                </div>
              ))}
            </div>

            {activeRow.photos.some((photo) => photo.gps) ? (
              <p className="mb-3 flex items-center gap-1.5 text-[10.5px] text-faint">
                <MapPin className="h-3 w-3" /> Capture location recorded in this moment
              </p>
            ) : null}

            <PhotoGrid
              photos={activeRow.photos}
              onOpen={(photo) => setLightbox(activeRow.photos.findIndex((item) => item.id === photo.id))}
            />
          </div>
        ) : null}
      </Drawer>

      {activeRow && lightbox !== null && activeRow.photos[lightbox] ? (
        <PhotoLightbox
          photos={activeRow.photos}
          index={lightbox}
          onIndexChange={setLightbox}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </div>
  );
}
