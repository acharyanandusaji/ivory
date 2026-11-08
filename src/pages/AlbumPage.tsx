import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Circle,
  Eye,
  Heart,
  ImageOff,
  Layers,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  Users,
  Wand2,
  X,
} from 'lucide-react';
import type { AlbumCategory, Photo } from '@/types';
import { useAppStore } from '@/store/appStore';
import { useThumbUrl } from '@/hooks/useApp';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProjectGate } from '@/components/ProjectGate';
import { PhotoLightbox } from '@/components/PhotoLightbox';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  ProgressBar,
  SectionHeading,
  Slider,
  Switch,
  TextArea,
  TextInput,
} from '@/components/ui';
import { ALBUM_CATEGORIES } from '@/lib/constants';
import { selectionCoverage, nextBestSuggestions } from '@/lib/selection';
import { formatCount, formatDate, percent } from '@/lib/utils';

const CATEGORY_LABEL = new Map(ALBUM_CATEGORIES.map((category) => [category.id, category.label]));

export function AlbumPage() {
  return (
    <ProjectGate feature="the album">
      <AlbumWorkspace />
    </ProjectGate>
  );
}

function AlbumWorkspace() {
  const project = useAppStore((state) => state.project)!;
  const photos = useAppStore((state) => state.photos);
  const people = useAppStore((state) => state.people);
  const events = useAppStore((state) => state.events);
  const album = useAppStore((state) => state.album);
  const setAlbum = useAppStore((state) => state.setAlbum);
  const curateAlbum = useAppStore((state) => state.curateAlbum);
  const applyAlbumCuration = useAppStore((state) => state.applyAlbumCuration);
  const addToAlbum = useAppStore((state) => state.addToAlbum);
  const removeFromAlbum = useAppStore((state) => state.removeFromAlbum);
  const pushToast = useAppStore((state) => state.pushToast);
  const navigate = useNavigate();

  const [showAll, setShowAll] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [suggestionLightbox, setSuggestionLightbox] = useState<number | null>(null);

  const photoById = useMemo(() => new Map(photos.map((photo) => [photo.id, photo])), [photos]);
  const selected = useMemo(() => photos.filter((photo) => photo.selected), [photos]);
  const selectedIds = useMemo(() => new Set(selected.map((photo) => photo.id)), [selected]);
  const eligible = useMemo(() => photos.filter((photo) => !photo.rejected && photo.analysis), [photos]);

  const curated = useMemo(() => {
    if (!album.lastCuration) return [] as Photo[];
    return album.lastCuration.ids
      .map((id) => photoById.get(id))
      .filter((photo): photo is Photo => Boolean(photo));
  }, [album.lastCuration, photoById]);

  const focus = curated.length ? curated : selected;
  const coverage = useMemo(() => selectionCoverage(focus), [focus]);
  const suggestions = useMemo(
    () =>
      nextBestSuggestions(
        photos,
        focus,
        8,
        project.settings.similarityThreshold,
      ),
    [photos, focus, project.settings.similarityThreshold],
  );

  const eventName = useMemo(() => new Map(events.map((event) => [event.id, event.name])), [events]);
  const peopleName = useMemo(() => new Map(people.map((person) => [person.id, person.name])), [people]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<AlbumCategory, number>();
    for (const photo of focus) {
      if (!photo.category) continue;
      counts.set(photo.category, (counts.get(photo.category) ?? 0) + 1);
    }
    return counts;
  }, [focus]);

  const eventCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const photo of focus) {
      if (!photo.eventId) continue;
      counts.set(photo.eventId, (counts.get(photo.eventId) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([id, count]) => ({ id, count, name: eventName.get(id) ?? 'Moment' }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [focus, eventName]);

  const keyPeople = useMemo(
    () =>
      people
        .filter((person) => person.role === 'bride' || person.role === 'groom' || person.role === 'family')
        .slice(0, 8)
        .map((person) => ({
          person,
          represented: focus.some((photo) => photo.personIds.includes(person.id)),
        })),
    [people, focus],
  );

  const appliedCount = useMemo(
    () => curated.filter((photo) => selectedIds.has(photo.id)).length,
    [curated, selectedIds],
  );
  const fullyApplied = curated.length > 0 && appliedCount === curated.length;
  const progressValue = album.target > 0 ? percent(curated.length, album.target) : 0;
  const displayed = showAll ? curated : curated.slice(0, 48);

  const toggleCategory = (id: AlbumCategory) => {
    const included = album.categories.includes(id);
    setAlbum({
      categories: included
        ? album.categories.filter((category) => category !== id)
        : [...album.categories, id],
    });
  };

  const handleSuggest = () => {
    const result = curateAlbum();
    if (!result) return;
    setShowAll(false);
    pushToast({
      title: result.ids.length ? 'A proposal is ready' : 'No photographs matched',
      description: result.ids.length
        ? `${formatCount(result.ids.length)} photographs selected from the eligible pool. Review them before applying.`
        : 'Try broadening the categories, lowering the target, or reviewing photographs that still need analysis.',
      tone: result.ids.length ? 'success' : 'default',
      duration: 6200,
    });
  };

  const apply = async () => {
    if (!album.lastCuration) return;
    await applyAlbumCuration();
  };

  const removeProposal = async (photo: Photo) => {
    if (!album.lastCuration) return;
    const reasons = { ...album.lastCuration.reasons };
    delete reasons[photo.id];
    setAlbum({
      lastCuration: {
        ...album.lastCuration,
        ids: album.lastCuration.ids.filter((id) => id !== photo.id),
        reasons,
        createdAt: Date.now(),
      },
    });
    if (photo.selected) await removeFromAlbum([photo.id]);
    setLightbox(null);
  };

  const addSuggestion = async (photo: Photo) => {
    await addToAlbum([photo.id]);
    if (album.lastCuration && !album.lastCuration.ids.includes(photo.id)) {
      setAlbum({
        lastCuration: {
          ...album.lastCuration,
          ids: [...album.lastCuration.ids, photo.id],
          reasons: { ...album.lastCuration.reasons, [photo.id]: 'Added by you' },
          createdAt: Date.now(),
        },
      });
    }
    pushToast({
      title: 'Added to the album',
      description: `${photo.name} is now part of the selection. Nothing was deleted.`,
      tone: 'success',
      duration: 3200,
    });
  };

  const useCurrentSelection = () => {
    if (!selected.length) return;
    const reasons: Record<string, string> = {};
    for (const photo of selected) reasons[photo.id] = 'Your selection';
    setAlbum({
      lastCuration: {
        ids: selected.map((photo) => photo.id),
        reasons,
        createdAt: Date.now(),
      },
    });
    pushToast({ title: 'Current selection becomes the proposal', tone: 'default', duration: 3600 });
  };

  const clearApplied = async () => {
    if (!selected.length) return;
    await removeFromAlbum(selected.map((photo) => photo.id));
  };

  if (!photos.length) {
    return (
      <div className="animate-fade-up">
        <PageHeader
          eyebrow="Album"
          title="Shape the story"
          description="Set a target, let Ivory propose a balanced selection, then refine it yourself. Nothing is ever removed automatically."
        />
        <EmptyState
          icon={<BookOpen className="h-5 w-5" />}
          title="Build the album from photographs"
          description="Import a wedding or event first. Ivory will use quality, moments and people to suggest a starting point."
          action={<Button variant="primary" onClick={() => navigate('/import')}>Import photographs</Button>}
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-up pb-10">
      <PageHeader
        eyebrow="Album"
        title="Shape the story"
        description="A considered first draft, never an automatic decision. Tell Ivory the shape you want, review every frame, then apply the selection."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Eye className="h-4 w-4" />}
              onClick={() => navigate('/album/preview')}
              disabled={!selected.length}
            >
              Preview album
            </Button>
            <Button
              variant="primary"
              icon={<Sparkles className="h-4 w-4" />}
              onClick={handleSuggest}
              disabled={!eligible.length}
            >
              {album.lastCuration ? 'Suggest again' : 'Suggest selection'}
            </Button>
          </>
        }
      >
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <Chip tone="accent">{formatCount(photos.length)} photographs</Chip>
          <Chip tone={curated.length ? 'success' : 'neutral'}>{formatCount(curated.length)} proposed</Chip>
          <Chip>{formatCount(selected.length)} in album</Chip>
          <Chip>
            <Layers className="h-3 w-3" /> {formatCount(categoryCounts.size)} categories
          </Chip>
        </div>
      </PageHeader>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0 space-y-5">
          <Card className="p-5">
            <SectionHeading
              eyebrow="Step 1 · The brief"
              title="What should this album feel like?"
              description="The target is a guide for the first pass, not a hard rule. You can add or remove any frame later."
              action={<Chip tone="accent">{formatCount(album.target)} target</Chip>}
            />

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Album title">
                <TextInput
                  value={album.title}
                  onChange={(event) => setAlbum({ title: event.target.value })}
                  placeholder="Our wedding album"
                />
              </Field>
              <Field label="Subtitle" hint="Shown on the cover and in PDF exports.">
                <TextInput
                  value={album.subtitle}
                  onChange={(event) => setAlbum({ subtitle: event.target.value })}
                  placeholder="A day in a few frames"
                />
              </Field>
            </div>

            <div className="mt-4 rounded-xl border border-line bg-raised/40 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-[180px] flex-1">
                  <Slider
                    value={album.target}
                    min={12}
                    max={400}
                    step={4}
                    onChange={(value) => setAlbum({ target: value })}
                    label="Target number of photographs"
                    formatValue={(value) => formatCount(value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <TextInput
                    type="number"
                    min={1}
                    max={1200}
                    value={album.target}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isFinite(value)) setAlbum({ target: Math.max(1, Math.min(1200, Math.round(value))) });
                    }}
                    className="h-9 w-[86px] text-center text-[12px]"
                    aria-label="Album target"
                  />
                  <span className="text-[10.5px] text-faint">frames</span>
                </div>
              </div>
              <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
                A typical wedding story sits between 80 and 200 frames. Fewer photographs often makes a stronger album.
              </p>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-[12px] font-medium text-ink">Categories to include</p>
                  <p className="mt-0.5 text-[10.5px] text-faint">
                    {album.categories.length
                      ? `${formatCount(album.categories.length)} of ${ALBUM_CATEGORIES.length} categories included.`
                      : 'No category filter — every category is eligible.'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAlbum({ categories: ALBUM_CATEGORIES.map((category) => category.id) })}
                  >
                    All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setAlbum({ categories: [] })}>
                    Clear
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ALBUM_CATEGORIES.map((category) => {
                  const included = album.categories.includes(category.id);
                  const count = photos.filter(
                    (photo) => !photo.rejected && photo.category === category.id,
                  ).length;
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => toggleCategory(category.id)}
                      title={category.hint}
                      className={clsx(
                        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                        included
                          ? 'border-accent/30 bg-accent-soft text-accent'
                          : 'border-line bg-surface text-faint hover:border-accent/30 hover:text-soft',
                      )}
                    >
                      <span
                        className={clsx(
                          'flex h-3.5 w-3.5 items-center justify-center rounded-full border',
                          included ? 'border-accent bg-accent text-accent-ink' : 'border-line',
                        )}
                      >
                        {included ? <Check className="h-2.5 w-2.5" /> : null}
                      </span>
                      {category.label}
                      <span className="tabular-nums opacity-60">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
              <Switch
                checked={album.diversifyEvents}
                onChange={(value) => setAlbum({ diversifyEvents: value })}
                label="Spread the story across moments"
                description="Avoid letting one part of the day dominate the first pass."
              />
              <Switch
                checked={album.includeFavorites}
                onChange={(value) => setAlbum({ includeFavorites: value })}
                label="Give favourites a gentle boost"
                description="Your hearts count as a light preference, never an override."
              />
            </div>

            <Field label="Notes for the album" className="mt-4" hint="These remain local and can be included in the album PDF.">
              <TextArea
                value={album.notes}
                onChange={(event) => setAlbum({ notes: event.target.value })}
                placeholder="A line about the day, credits, or delivery notes…"
                className="min-h-20 text-[12.5px]"
              />
            </Field>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Step 2 · The proposal</p>
                <h2 className="display mt-1 text-xl text-ink">
                  {curated.length ? `${formatCount(curated.length)} frames to consider` : 'No proposal yet'}
                </h2>
                <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-soft">
                  {curated.length
                    ? 'Each frame carries a short reason. Remove anything that feels wrong, or add a suggestion below.'
                    : 'Run a suggestion to create a first pass based on quality, people, moments and variety.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {album.lastCuration ? (
                  <>
                    <Chip tone={fullyApplied ? 'success' : 'neutral'}>
                      {fullyApplied ? 'Applied' : `${formatCount(appliedCount)} of ${formatCount(curated.length)} applied`}
                    </Chip>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<RotateCcw className="h-3.5 w-3.5" />}
                      onClick={() => setAlbum({ lastCuration: null })}
                    >
                      Reset
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      icon={<Check className="h-3.5 w-3.5" />}
                      onClick={() => void apply()}
                      disabled={!curated.length}
                    >
                      Apply selection
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Wand2 className="h-3.5 w-3.5" />}
                    onClick={handleSuggest}
                    disabled={!eligible.length}
                  >
                    Create proposal
                  </Button>
                )}
              </div>
            </div>

            {curated.length ? (
              <>
                <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-4 lg:grid-cols-6">
                  {displayed.map((photo) => {
                    const index = curated.findIndex((item) => item.id === photo.id);
                    return (
                      <CuratedTile
                        key={photo.id}
                        photo={photo}
                        reason={album.lastCuration?.reasons[photo.id] ?? 'Recommended'}
                        applied={selectedIds.has(photo.id)}
                        onOpen={() => setLightbox(index)}
                        onRemove={() => void removeProposal(photo)}
                      />
                    );
                  })}
                </div>
                {curated.length > 48 ? (
                  <div className="border-t border-line px-4 py-2.5 text-center">
                    <Button variant="ghost" size="sm" onClick={() => setShowAll((value) => !value)}>
                      {showAll ? 'Show fewer' : `Show all ${formatCount(curated.length)} frames`}
                    </Button>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="px-5 py-10">
                <EmptyState
                  compact
                  icon={<Wand2 className="h-5 w-5" />}
                  title={eligible.length ? 'Make the first pass' : 'Analysis still needed'}
                  description={
                    eligible.length
                      ? 'Ivory will look at quality, duplicate groups, people and moments. It proposes — you decide.'
                      : 'Photographs need analysis before an album can be curated. Run processing from Import, then come back.'
                  }
                  action={
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <Button variant="primary" onClick={handleSuggest} disabled={!eligible.length} icon={<Sparkles className="h-4 w-4" />}>
                        Suggest selection
                      </Button>
                      {selected.length ? (
                        <Button variant="secondary" onClick={useCurrentSelection}>
                          Use current selection
                        </Button>
                      ) : null}
                      <Button variant="ghost" onClick={() => navigate('/review')}>Review sets</Button>
                    </div>
                  }
                />
              </div>
            )}
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-5">
              <SectionHeading
                eyebrow="Coverage"
                title="Is anyone missing?"
                description="A balanced album usually touches the key people and the arc of the day."
              />
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Metric label="People represented" value={formatCount(coverage.people)} />
                <Metric label="Moments represented" value={formatCount(coverage.events)} />
                <Metric label="Categories" value={formatCount(coverage.categories)} />
                <Metric label="Average quality" value={focus.length ? String(coverage.averageScore) : '—'} />
              </div>

              {keyPeople.length ? (
                <div className="mt-4 space-y-1.5">
                  <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-faint">Key people</p>
                  {keyPeople.map(({ person, represented }) => (
                    <div key={person.id} className="flex items-center gap-2 text-[11.5px]">
                      <span
                        className={clsx(
                          'flex h-4 w-4 items-center justify-center rounded-full border',
                          represented ? 'border-success bg-success-soft text-success' : 'border-line text-faint',
                        )}
                      >
                        {represented ? <Check className="h-2.5 w-2.5" /> : <Circle className="h-2 w-2" />}
                      </span>
                      <span className={clsx('truncate', represented ? 'text-ink' : 'text-soft')}>{person.name}</span>
                      <span className="ml-auto text-[9.5px] capitalize text-faint">{person.role}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              {eventCounts.length ? (
                <div className="mt-4 space-y-1.5 border-t border-line pt-3">
                  <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-faint">Strongest moments</p>
                  {eventCounts.map((event) => (
                    <div key={event.id} className="flex items-center gap-2 text-[11.5px]">
                      <span className="min-w-0 flex-1 truncate text-soft">{event.name}</span>
                      <span className="tabular-nums text-faint">{event.count}</span>
                      <div className="h-1 w-16 overflow-hidden rounded-full bg-ink/[.07]">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${percent(event.count, focus.length)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {!focus.length ? (
                <p className="mt-4 rounded-lg border border-dashed border-line px-3 py-3 text-center text-[10.5px] leading-relaxed text-faint">
                  Coverage appears after you create a proposal or add photographs to the album.
                </p>
              ) : null}
            </Card>

            <Card className="p-5">
              <SectionHeading
                eyebrow="Next best"
                title="Worth a second look"
                description="Frames outside the current selection that add something without repeating it."
                action={
                  suggestions.length ? (
                    <Chip tone="accent">{formatCount(suggestions.length)} ideas</Chip>
                  ) : undefined
                }
              />
              {suggestions.length ? (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {suggestions.slice(0, 6).map((photo, index) => (
                    <SuggestionTile
                      key={photo.id}
                      photo={photo}
                      onOpen={() => setSuggestionLightbox(index)}
                      onAdd={() => void addSuggestion(photo)}
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-4 rounded-lg border border-dashed border-line px-3 py-8 text-center text-[10.5px] leading-relaxed text-faint">
                  {focus.length
                    ? 'No strong non-duplicate suggestions remain. The album already covers this library well.'
                    : 'Suggestions appear once there is a selection to compare against.'}
                </p>
              )}
            </Card>
          </div>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-[76px] xl:self-start">
          <Card className="overflow-hidden">
            <div className="bg-ink px-5 py-5 text-canvas">
              <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-canvas/45">Album progress</p>
              <div className="mt-2 flex items-end gap-2">
                <span className="display text-4xl leading-none">{formatCount(curated.length || selected.length)}</span>
                <span className="pb-1 text-[11px] text-canvas/50">of {formatCount(album.target)} target</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-500"
                  style={{ width: `${Math.min(100, progressValue)}%` }}
                />
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-canvas/45">
                {curated.length
                  ? `${formatCount(Math.max(0, album.target - curated.length))} frames below target. You can apply a shorter album.`
                  : selected.length
                    ? `${formatCount(selected.length)} frames are currently in the album.`
                    : 'No album photos selected yet.'}
              </p>
            </div>
            <div className="space-y-2 p-4">
              <Button
                variant="gold"
                className="w-full"
                icon={<Check className="h-4 w-4" />}
                onClick={() => void apply()}
                disabled={!curated.length}
              >
                Apply proposed selection
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                icon={<Eye className="h-4 w-4" />}
                onClick={() => navigate('/album/preview')}
                disabled={!selected.length && !curated.length}
              >
                Open album preview
              </Button>
              {selected.length ? (
                <button
                  type="button"
                  onClick={() => void clearApplied()}
                  className="w-full rounded-lg py-1.5 text-[10.5px] font-medium text-faint transition-colors hover:bg-danger-soft hover:text-danger"
                >
                  Clear all {formatCount(selected.length)} applied photos
                </button>
              ) : null}
            </div>
          </Card>

          <Card className="p-4">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-faint">The flow</p>
            <ol className="mt-3 space-y-3">
              <FlowStep index={1} done label="Set the brief" description="Target, categories and tone." />
              <FlowStep
                index={2}
                done={Boolean(album.lastCuration)}
                label="Create a proposal"
                description="Ivory ranks and diversifies."
              />
              <FlowStep
                index={3}
                done={Boolean(curated.length)}
                label="Refine every frame"
                description="Remove, add and compare."
              />
              <FlowStep
                index={4}
                done={fullyApplied}
                label="Apply & preview"
                description="Selection becomes the album."
              />
            </ol>
            {album.lastCuration ? (
              <p className="mt-3 border-t border-line pt-3 text-[9.5px] text-faint">
                Proposal made {formatDate(album.lastCuration.createdAt, true)}
              </p>
            ) : null}
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-faint">Album flow</p>
              <span className="text-[9.5px] text-faint">{formatCount(focus.length)} frames</span>
            </div>
            <div className="mt-3 space-y-1.5">
              {ALBUM_CATEGORIES.filter((category) => (categoryCounts.get(category.id) ?? 0) > 0).map((category) => {
                const count = categoryCounts.get(category.id) ?? 0;
                return (
                  <div key={category.id} className="flex items-center gap-2 text-[11px]">
                    <span className="min-w-0 flex-1 truncate text-soft">{category.label}</span>
                    <span className="tabular-nums text-faint">{count}</span>
                    <div className="h-1 w-12 overflow-hidden rounded-full bg-ink/[.07]">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${percent(count, Math.max(1, focus.length))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {!categoryCounts.size ? (
                <p className="text-[10.5px] leading-relaxed text-faint">
                  Categories appear once frames are proposed or applied.
                </p>
              ) : null}
            </div>
          </Card>

          <Card className="border-accent/20 bg-accent-soft/30 p-4">
            <p className="flex items-center gap-2 text-[11.5px] font-medium text-ink">
              <Heart className="h-3.5 w-3.5 text-accent" /> Your judgement wins
            </p>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-soft">
              Ivory never deletes a photograph. Applying a selection only marks photographs as “in album”. You can undo it immediately, and originals always remain available.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => navigate('/compare')}>
                Compare frames <ChevronRight className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate('/review')}>
                Review sets
              </Button>
            </div>
          </Card>
        </aside>
      </div>

      {lightbox !== null && curated[lightbox] ? (
        <PhotoLightbox
          photos={curated}
          index={lightbox}
          onIndexChange={setLightbox}
          onClose={() => setLightbox(null)}
        />
      ) : null}
      {suggestionLightbox !== null && suggestions[suggestionLightbox] ? (
        <PhotoLightbox
          photos={suggestions}
          index={suggestionLightbox}
          onIndexChange={setSuggestionLightbox}
          onClose={() => setSuggestionLightbox(null)}
        />
      ) : null}
    </div>
  );
}

function CuratedTile({
  photo,
  reason,
  applied,
  onOpen,
  onRemove,
}: {
  photo: Photo;
  reason: string;
  applied: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const url = useThumbUrl(photo.id);
  return (
    <div
      className={clsx(
        'group relative overflow-hidden rounded-lg border bg-raised transition-colors',
        applied ? 'border-accent/50' : 'border-line',
      )}
    >
      <button type="button" onClick={onOpen} className="relative block aspect-square w-full overflow-hidden" aria-label={`Open ${photo.name}`}>
        {url ? (
          <img src={url} alt={photo.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-faint"><ImageOff className="h-4 w-4" /></span>
        )}
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent p-1.5 pt-5">
          <span className="block truncate text-[8.5px] font-medium leading-tight text-white/90">{photo.name}</span>
          <span className="mt-0.5 block truncate text-[8px] leading-tight text-accent">{reason}</span>
        </span>
        {applied ? (
          <span className="absolute left-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-accent-ink">
            <Check className="h-2.5 w-2.5" />
          </span>
        ) : null}
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white/80 opacity-0 backdrop-blur transition-opacity hover:bg-danger hover:text-white group-hover:opacity-100"
        aria-label={`Remove ${photo.name} from proposal`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function SuggestionTile({
  photo,
  onOpen,
  onAdd,
}: {
  photo: Photo;
  onOpen: () => void;
  onAdd: () => void;
}) {
  const url = useThumbUrl(photo.id);
  return (
    <div className="group overflow-hidden rounded-lg border border-line bg-surface">
      <button type="button" onClick={onOpen} className="relative block aspect-[4/3] w-full overflow-hidden bg-raised" aria-label={`Inspect ${photo.name}`}>
        {url ? (
          <img src={url} alt={photo.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-faint"><ImageOff className="h-4 w-4" /></span>
        )}
        <span className="absolute left-1.5 top-1.5 rounded-full bg-black/50 px-1.5 py-0.5 text-[8.5px] font-semibold tabular-nums text-white/85 backdrop-blur">
          {photo.scores?.overall ?? '—'}
        </span>
      </button>
      <div className="flex items-center gap-1 px-1.5 py-1.5">
        <span className="min-w-0 flex-1 truncate text-[8.5px] text-faint">{photo.name}</span>
        <button
          type="button"
          onClick={onAdd}
          className="flex h-6 items-center gap-1 rounded-full bg-accent-soft px-1.5 text-[9px] font-medium text-accent transition-colors hover:bg-accent hover:text-accent-ink"
          aria-label={`Add ${photo.name} to album`}
        >
          <Plus className="h-2.5 w-2.5" /> Add
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-raised/40 px-3 py-2.5">
      <p className="display text-2xl leading-none text-ink">{value}</p>
      <p className="mt-1 text-[9px] uppercase tracking-[0.12em] text-faint">{label}</p>
    </div>
  );
}

function FlowStep({
  index,
  done,
  label,
  description,
}: {
  index: number;
  done: boolean;
  label: string;
  description: string;
}) {
  return (
    <li className="flex gap-2.5">
      <span
        className={clsx(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[9px] font-semibold',
          done ? 'border-success bg-success-soft text-success' : 'border-line bg-raised text-faint',
        )}
      >
        {done ? <Check className="h-3 w-3" /> : index}
      </span>
      <span className="min-w-0">
        <span className={clsx('block text-[11.5px] font-medium', done ? 'text-ink' : 'text-soft')}>{label}</span>
        <span className="mt-0.5 block text-[9.5px] leading-relaxed text-faint">{description}</span>
      </span>
    </li>
  );
}
