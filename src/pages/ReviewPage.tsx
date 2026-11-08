import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Copy,
  Eye,
  Heart,
  Layers,
  RefreshCw,
  Sparkles,
  Star,
  Undo2,
  X,
} from 'lucide-react';
import type { GroupType, Photo, PhotoGroup } from '@/types';
import { useAppStore } from '@/store/appStore';
import { useThumbUrl, useKeydown } from '@/hooks/useApp';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProjectGate } from '@/components/ProjectGate';
import { PhotoLightbox } from '@/components/PhotoLightbox';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  IconButton,
  SegmentedControl,
  ScorePill,
  Spinner,
} from '@/components/ui';
import { FLAG_META } from '@/lib/constants';
import { formatCount, formatDate, isEditableTarget } from '@/lib/utils';

const TYPE_LABEL: Record<GroupType, string> = {
  exact: 'Exact duplicates',
  similar: 'Similar frames',
  burst: 'Bursts',
};

const TYPE_HINT: Record<GroupType, string> = {
  exact: 'Byte-for-byte copies. Keep one and set the rest aside.',
  similar: 'Frames that look alike. Choose the sharpest, most open expression.',
  burst: 'A short run of frames. Usually one tells the story best.',
};

function MiniPhoto({ photo, className }: { photo: Photo; className?: string }) {
  const url = useThumbUrl(photo.id);
  return (
    <span className={clsx('relative block overflow-hidden rounded-md bg-raised', className)}>
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-faint">
          <Layers className="h-3 w-3" />
        </span>
      )}
    </span>
  );
}

export function ReviewPage() {
  return (
    <ProjectGate feature="photo review">
      <ReviewWorkspace />
    </ProjectGate>
  );
}

function ReviewWorkspace() {
  const groups = useAppStore((state) => state.groups);
  const photos = useAppStore((state) => state.photos);
  const undo = useAppStore((state) => state.undo);
  const undoLast = useAppStore((state) => state.undoLast);
  const applyPhotoPatch = useAppStore((state) => state.applyPhotoPatch);
  const addCompare = useAppStore((state) => state.addCompare);
  const reorganise = useAppStore((state) => state.reorganise);
  const processing = useAppStore((state) => state.processing);
  const navigate = useNavigate();

  const [tab, setTab] = useState<GroupType>('similar');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const photosById = useMemo(() => new Map(photos.map((photo) => [photo.id, photo])), [photos]);
  const typedGroups = useMemo(() => groups.filter((group) => group.type === tab), [groups, tab]);
  const counts = useMemo(
    () => ({
      exact: groups.filter((group) => group.type === 'exact').length,
      similar: groups.filter((group) => group.type === 'similar').length,
      burst: groups.filter((group) => group.type === 'burst').length,
    }),
    [groups],
  );

  useEffect(() => {
    if (!typedGroups.length) {
      setActiveId(null);
      return;
    }
    if (!activeId || !typedGroups.some((group) => group.id === activeId)) {
      setActiveId(typedGroups[0].id);
    }
  }, [typedGroups, activeId]);

  const active: PhotoGroup | undefined = typedGroups.find((group) => group.id === activeId);
  const groupPhotos = useMemo(() => {
    if (!active) return [];
    return active.photoIds
      .map((id) => photosById.get(id))
      .filter((photo): photo is Photo => Boolean(photo))
      .sort((a, b) => (b.scores?.overall ?? 0) - (a.scores?.overall ?? 0));
  }, [active, photosById]);

  const best = useMemo(() => {
    if (!groupPhotos.length) return null;
    return (
      groupPhotos.find((photo) => photo.id === active?.bestPhotoId) ??
      [...groupPhotos].sort((a, b) => (b.scores?.overall ?? 0) - (a.scores?.overall ?? 0))[0]
    );
  }, [active?.bestPhotoId, groupPhotos]);

  const activeIndex = activeId ? typedGroups.findIndex((group) => group.id === activeId) : -1;

  const goTo = (offset: number) => {
    if (!typedGroups.length) return;
    const next = (Math.max(0, activeIndex) + offset + typedGroups.length) % typedGroups.length;
    setActiveId(typedGroups[next].id);
  };

  useKeydown(
    (event) => {
      if (isEditableTarget(event.target) || !active || lightbox !== null) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault();
        goTo(event.key === 'ArrowDown' ? 1 : 1);
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault();
        goTo(-1);
      } else if (event.key === 'Enter' && best) {
        event.preventDefault();
        void applyPhotoPatch([best.id], { selected: true, rejected: false }, {
          label: 'Select best frame',
          toastTitle: 'Best frame added to the album',
          undo: true,
        });
      }
    },
    [active?.id, activeIndex, best?.id, lightbox],
  );

  const selectBest = async () => {
    if (!best) return;
    await applyPhotoPatch([best.id], { selected: true, rejected: false }, {
      label: 'Select best frame',
      toastTitle: 'Best frame added to the album',
      undo: true,
    });
  };

  const setAsideRest = async () => {
    if (!best) return;
    const rest = groupPhotos.filter((photo) => photo.id !== best.id);
    await applyPhotoPatch(
      [best.id, ...rest.map((photo) => photo.id)],
      { selected: false, rejected: false },
      { undo: false },
    );
    // Two explicit patches keep the undo snapshot meaningful: best selected, rest set aside.
    await applyPhotoPatch([best.id], { selected: true, rejected: false }, { undo: false });
    await applyPhotoPatch(
      rest.map((photo) => photo.id),
      { selected: false, rejected: true },
      {
        label: 'Set aside duplicates',
        toastTitle: `${formatCount(rest.length)} frames set aside — nothing deleted`,
        undo: true,
      },
    );
  };

  const selectWholeSet = async () => {
    await applyPhotoPatch(
      groupPhotos.map((photo) => photo.id),
      { selected: true, rejected: false },
      { label: 'Select set', toastTitle: `${formatCount(groupPhotos.length)} frames added`, undo: true },
    );
  };

  const compare = () => {
    if (!groupPhotos.length) return;
    addCompare(groupPhotos.slice(0, 4).map((photo) => photo.id));
    navigate('/compare');
  };

  if (!photos.length) {
    return (
      <div className="animate-fade-up">
        <PageHeader eyebrow="Review" title="Choose the best frame" description="Ivory groups duplicates, similar frames and bursts, then suggests the strongest frame. You always make the final call." />
        <EmptyState
          icon={<Sparkles className="h-5 w-5" />}
          title="Nothing to review yet"
          description="Import photographs first. Analysis will detect duplicate and burst sets automatically."
          action={<Button variant="primary" onClick={() => navigate('/import')}>Import photographs</Button>}
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-up pb-24">
      <PageHeader
        eyebrow="Review"
        title="Choose the best frame"
        description="Duplicates and bursts are recommendations, never decisions. Keep one frame, set the others aside, or keep them all."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<RefreshCw className="h-4 w-4" />}
              loading={processing.running}
              onClick={() => void reorganise()}
            >
              Re-scan sets
            </Button>
            <Button variant="primary" icon={<Check className="h-4 w-4" />} onClick={() => navigate('/album')}>
              Album
            </Button>
          </>
        }
      >
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <SegmentedControl
            value={tab}
            onChange={(value) => {
              setTab(value);
              setActiveId(null);
            }}
            options={[
              { value: 'similar', label: `Similar ${counts.similar ? `(${counts.similar})` : ''}`, icon: <Layers className="h-3 w-3" /> },
              { value: 'burst', label: `Bursts ${counts.burst ? `(${counts.burst})` : ''}` },
              { value: 'exact', label: `Exact ${counts.exact ? `(${counts.exact})` : ''}`, icon: <Copy className="h-3 w-3" /> },
            ]}
          />
          <Chip tone="accent">
            {formatCount(groups.reduce((sum, group) => sum + group.photoIds.length, 0))} frames in sets
          </Chip>
          {undo ? (
            <Button variant="ghost" size="sm" icon={<Undo2 className="h-3.5 w-3.5" />} onClick={() => void undoLast()}>
              Undo {undo.label}
            </Button>
          ) : null}
        </div>
      </PageHeader>

      {!groups.length ? (
        <EmptyState
          icon={<Sparkles className="h-5 w-5" />}
          title="No duplicate or burst sets yet"
          description="Run the analysis to group similar frames. Ivory compares visual fingerprints and capture times — it never deletes anything."
          action={
            <Button variant="primary" loading={processing.running} onClick={() => void reorganise()}>
              Analyse & group photographs
            </Button>
          }
        />
      ) : !typedGroups.length ? (
        <EmptyState
          compact
          icon={<Layers className="h-5 w-5" />}
          title={`No ${TYPE_LABEL[tab].toLowerCase()}`}
          description="Try another set type. Exact duplicates, similar frames and bursts are grouped separately."
          action={
            <Button variant="secondary" size="sm" onClick={() => setTab(counts.similar ? 'similar' : counts.burst ? 'burst' : 'exact')}>
              Show {counts.similar ? 'similar frames' : counts.burst ? 'bursts' : 'exact duplicates'}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[270px_minmax(0,1fr)]">
          <Card className="flex max-h-[calc(100vh-210px)] flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-3.5 py-3">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint">
                {TYPE_LABEL[tab]}
              </p>
              <span className="text-[10px] tabular-nums text-faint">{typedGroups.length}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {typedGroups.map((group, index) => {
                const list = group.photoIds
                  .map((id) => photosById.get(id))
                  .filter((photo): photo is Photo => Boolean(photo));
                const groupBest = list.find((photo) => photo.id === group.bestPhotoId) ?? list[0];
                const chosen = list.some((photo) => photo.selected);
                const isActive = group.id === activeId;
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setActiveId(group.id)}
                    className={clsx(
                      'mb-1 flex w-full items-center gap-2.5 rounded-lg border px-2 py-2 text-left transition-colors',
                      isActive
                        ? 'border-accent/35 bg-accent-soft/60'
                        : 'border-transparent hover:border-line hover:bg-raised',
                    )}
                  >
                    <span className="flex shrink-0 -space-x-2">
                      {list.slice(0, 3).map((photo) => (
                        <MiniPhoto key={photo.id} photo={photo} className="h-9 w-9 border border-surface shadow-sm" />
                      ))}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 text-[11.5px] font-medium text-ink">
                        Set {index + 1}
                        {chosen ? <Check className="h-3 w-3 text-success" /> : null}
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] text-faint">
                        {list.length} frames · best {groupBest?.scores?.overall ?? '—'}
                      </span>
                    </span>
                    <ChevronRight className={clsx('h-3.5 w-3.5 shrink-0', isActive ? 'text-accent' : 'text-faint')} />
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between border-t border-line px-2 py-2">
              <IconButton label="Previous set" size="sm" onClick={() => goTo(-1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </IconButton>
              <span className="text-[10px] tabular-nums text-faint">
                {activeIndex >= 0 ? `${activeIndex + 1} / ${typedGroups.length}` : '—'}
              </span>
              <IconButton label="Next set" size="sm" onClick={() => goTo(1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          </Card>

          {active ? (
            <div className="min-w-0 space-y-4">
              <Card className="overflow-hidden">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <Chip tone="accent">{TYPE_LABEL[active.type]}</Chip>
                      <span className="text-[10.5px] text-faint">
                        {formatCount(groupPhotos.length)} frames
                        {groupPhotos[0]?.capturedAt ? ` · ${formatDate(groupPhotos[0].capturedAt, true)}` : ''}
                      </span>
                    </div>
                    <p className="mt-1.5 max-w-xl text-[11.5px] leading-relaxed text-soft">{TYPE_HINT[active.type]}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button variant="secondary" size="sm" icon={<Columns3 className="h-3.5 w-3.5" />} onClick={compare}>
                      Compare
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Check className="h-3.5 w-3.5" />}
                      onClick={() => void selectWholeSet()}
                    >
                      Select all
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                  {groupPhotos.map((photo) => {
                    const isBest = best?.id === photo.id;
                    return (
                      <div
                        key={photo.id}
                        className={clsx(
                          'group relative overflow-hidden rounded-xl border bg-surface transition-all',
                          photo.selected ? 'border-accent/50 shadow-soft' : 'border-line',
                          photo.rejected && 'opacity-60',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setLightbox(groupPhotos.findIndex((item) => item.id === photo.id))}
                          className="block aspect-[4/3] w-full overflow-hidden bg-raised"
                          aria-label={`Open ${photo.name}`}
                        >
                          <ReviewImage photo={photo} />
                        </button>
                        <div className="absolute left-2 top-2 flex items-center gap-1.5">
                          {isBest ? (
                            <span className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent-ink shadow-sm">
                              <Sparkles className="h-2.5 w-2.5" /> Best suggestion
                            </span>
                          ) : null}
                          {photo.selected ? (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success text-white shadow-sm">
                              <Check className="h-3 w-3" />
                            </span>
                          ) : null}
                        </div>
                        <div className="absolute right-2 top-2 flex items-center gap-1.5">
                          {photo.scores ? <ScorePill score={photo.scores.overall} /> : null}
                        </div>
                        <div className="p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="min-w-0 flex-1 truncate text-[10.5px] font-medium text-ink">{photo.name}</p>
                            <span className="shrink-0 text-[9.5px] text-faint">
                              {photo.width}×{photo.height}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1">
                            {photo.flags.slice(0, 3).map((flag) => (
                              <span
                                key={flag}
                                title={FLAG_META[flag].label}
                                className={clsx(
                                  'rounded-full px-1.5 py-0.5 text-[8.5px] font-medium',
                                  FLAG_META[flag].tone === 'danger'
                                    ? 'bg-danger-soft text-danger'
                                    : 'bg-raised text-soft',
                                )}
                              >
                                {FLAG_META[flag].short}
                              </span>
                            ))}
                            {photo.faces.faceCount ? (
                              <span className="rounded-full bg-raised px-1.5 py-0.5 text-[8.5px] text-soft">
                                {photo.faces.faceCount} faces
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2 flex items-center gap-1">
                            <Button
                              variant={photo.selected ? 'secondary' : 'primary'}
                              size="sm"
                              className="h-7 flex-1 px-2 text-[10.5px]"
                              icon={<Check className="h-3 w-3" />}
                              onClick={() =>
                                void applyPhotoPatch(
                                  [photo.id],
                                  { selected: !photo.selected, rejected: false },
                                  { label: 'Select frame', undo: true },
                                )
                              }
                            >
                              {photo.selected ? 'In album' : 'Keep this'}
                            </Button>
                            <IconButton
                              label={photo.favorite ? 'Remove favourite' : 'Favourite'}
                              size="sm"
                              active={photo.favorite}
                              onClick={() =>
                                void applyPhotoPatch([photo.id], { favorite: !photo.favorite }, { label: 'Favourite', undo: true })
                              }
                            >
                              <Heart className={clsx('h-3.5 w-3.5', photo.favorite && 'fill-current')} />
                            </IconButton>
                            <IconButton
                              label={photo.rejected ? 'Restore frame' : 'Set frame aside'}
                              size="sm"
                              tone="danger"
                              onClick={() =>
                                void applyPhotoPatch(
                                  [photo.id],
                                  { rejected: !photo.rejected, selected: photo.rejected ? photo.selected : false },
                                  { label: photo.rejected ? 'Restore frame' : 'Set aside frame', undo: true },
                                )
                              }
                            >
                              {photo.rejected ? <RefreshCw className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                            </IconButton>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-col gap-2 border-t border-line bg-raised/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[10.5px] leading-relaxed text-faint">
                    Set aside keeps the file in your library and remains fully reversible. Nothing is ever deleted.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="secondary" size="sm" icon={<Eye className="h-3.5 w-3.5" />} onClick={() => setLightbox(0)}>
                      Inspect
                    </Button>
                    <Button variant="gold" size="sm" icon={<Sparkles className="h-3.5 w-3.5" />} onClick={() => void selectBest()}>
                      Keep best frame
                    </Button>
                    <Button variant="ghost" size="sm" icon={<X className="h-3.5 w-3.5" />} onClick={() => void setAsideRest()}>
                      Keep best, set rest aside
                    </Button>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                    <Star className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium text-ink">Why this frame?</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-soft">
                      {best
                        ? `${best.name} has the strongest blend of focus, exposure and face quality in this set${
                            best.faces.smilingCount ? ', with a smile detected' : ''
                          }. Quality is a suggestion — your eye decides.`
                        : 'Choose a frame to see its quality reasoning.'}
                    </p>
                    {best?.scores ? (
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {[
                          ['Sharpness', best.scores.sharpness],
                          ['Exposure', best.scores.exposure],
                          ['Composition', best.scores.composition],
                          ['Faces', best.scores.faces],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-lg border border-line bg-raised/50 px-2.5 py-2">
                            <p className="text-[9px] uppercase tracking-wide text-faint">{label}</p>
                            <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-ink">{value}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => goTo(1)}>
                    Next <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            </div>
          ) : (
            <Card className="flex items-center justify-center p-16">
              <Spinner />
            </Card>
          )}
        </div>
      )}

      {lightbox !== null && groupPhotos[lightbox] ? (
        <PhotoLightbox
          photos={groupPhotos}
          index={lightbox}
          onIndexChange={setLightbox}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </div>
  );
}

function ReviewImage({ photo }: { photo: Photo }) {
  const url = useThumbUrl(photo.id);
  if (!url) {
    return (
      <span className="flex h-full w-full items-center justify-center text-faint">
        <Layers className="h-5 w-5" />
      </span>
    );
  }
  return (
    <img
      src={url}
      alt={photo.name}
      loading="lazy"
      draggable={false}
      className={clsx('h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.015]', photo.rejected && 'grayscale')}
    />
  );
}
