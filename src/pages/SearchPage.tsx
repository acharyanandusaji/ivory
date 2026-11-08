import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowRight,
  CalendarDays,
  Check,
  Command,
  ImageOff,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import type { Photo } from '@/types';
import { useAppStore } from '@/store/appStore';
import { useDebouncedValue, useThumbUrl } from '@/hooks/useApp';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProjectGate } from '@/components/ProjectGate';
import { PhotoLightbox } from '@/components/PhotoLightbox';
import { PersonAvatar } from '@/components/PersonAvatar';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  IconButton,
  ProgressBar,
  SegmentedControl,
  Spinner,
  TextInput,
} from '@/components/ui';
import { FLAG_META, PERSON_ROLES } from '@/lib/constants';
import { SMART_FILTERS } from '@/lib/categories';
import {
  parseQuery,
  querySuggestions,
  semanticSearch,
  smartSearch,
  type SearchHit,
} from '@/lib/search';
import { formatCount } from '@/lib/utils';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const ROLE_LABEL = new Map(PERSON_ROLES.map((role) => [role.id, role.label]));
const SMART_LABEL = new Map(SMART_FILTERS.map((filter) => [filter.id, filter.label]));

type SearchMode = 'smart' | 'visual';

export function SearchPage() {
  return (
    <ProjectGate feature="search">
      <SearchWorkspace />
    </ProjectGate>
  );
}

function SearchWorkspace() {
  const project = useAppStore((state) => state.project)!;
  const photos = useAppStore((state) => state.photos);
  const people = useAppStore((state) => state.people);
  const faces = useAppStore((state) => state.faces);
  const events = useAppStore((state) => state.events);
  const embeddings = useAppStore((state) => state.embeddings);
  const ai = useAppStore((state) => state.ai);
  const filters = useAppStore((state) => state.filters);
  const setFilters = useAppStore((state) => state.setFilters);
  const indexVisualSearch = useAppStore((state) => state.indexVisualSearch);
  const cancelVisualIndexing = useAppStore((state) => state.cancelVisualIndexing);
  const queryVisual = useAppStore((state) => state.queryVisual);
  const toggleSelected = useAppStore((state) => state.toggleSelected);
  const updateProject = useAppStore((state) => state.updateProject);
  const navigate = useNavigate();

  const initialQuery = filters.search.trim();
  const [query, setQuery] = useState(initialQuery);
  const [mode, setMode] = useState<SearchMode>('smart');
  const [visualHits, setVisualHits] = useState<SearchHit[] | null>(null);
  const [visualLoading, setVisualLoading] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debouncedQuery = useDebouncedValue(query, 300);
  const debouncedVisualQuery = useDebouncedValue(query, 650);

  useEffect(() => {
    // Focus the field when arriving from the global search shortcut.
    const id = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => window.clearTimeout(id);
  }, []);

  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const eventsById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const roles = useMemo(() => new Map(people.map((person) => [person.id, person.role])), [people]);

  const eventPhotoCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const photo of photos) {
      if (!photo.eventId) continue;
      counts.set(photo.eventId, (counts.get(photo.eventId) ?? 0) + 1);
    }
    return counts;
  }, [photos]);

  const parsed = useMemo(() => parseQuery(query, people), [query, people]);
  const suggestions = useMemo(
    () => querySuggestions(people, events.map((event) => event.name)),
    [people, events],
  );

  const smartHits = useMemo(() => {
    const raw = query.trim();
    if (!raw) return [];
    return smartSearch(photos, raw, { people, faces, roles, events: eventsById })
      .filter((hit) => !hit.photo.rejected)
      .slice(0, 240);
  }, [photos, query, people, faces, roles, eventsById]);

  // Keyword results already carry relevance; visual results come from the local CLIP index.
  const hits = mode === 'visual' && visualHits ? visualHits.filter((hit) => !hit.photo.rejected) : smartHits;
  const visualReady = embeddings.size > 0;
  const canVisualSearch = project.consentAiSearch && visualReady;
  const missingEmbeddings = photos.filter((photo) => photo.status === 'ready' && !embeddings.has(photo.id)).length;
  const indexing = ai.status === 'indexing' || ai.status === 'loading';

  useEffect(() => {
    if (mode !== 'visual') return;
    const text = debouncedVisualQuery.trim();
    if (!text || !project.consentAiSearch || !embeddings.size) {
      setVisualHits(null);
      return;
    }
    let active = true;
    setVisualLoading(true);
    void queryVisual(text)
      .then((vector) => {
        if (!active) return;
        if (!vector) {
          setVisualHits([]);
          return;
        }
        setVisualHits(semanticSearch(photos, vector, embeddings));
      })
      .finally(() => {
        if (active) setVisualLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mode, debouncedVisualQuery, project.consentAiSearch, embeddings, photos, queryVisual]);

  const openInLibrary = () => {
    setFilters({
      search: query.trim(),
      peopleIds: [],
      categories: [],
      smart: [],
      flags: [],
      tags: [],
      eventId: null,
      onlyRejected: false,
      hideRejected: true,
    });
    navigate('/library');
  };

  const searchPerson = (id: string) => {
    const person = peopleById.get(id);
    setFilters({
      search: '',
      peopleIds: [id],
      smart: [],
      eventId: null,
      onlyRejected: false,
      hideRejected: true,
    });
    navigate('/library');
    if (person) useAppStore.getState().pushToast({ title: `Showing ${person.name}`, tone: 'default', duration: 2200 });
  };

  const searchEvent = (id: string) => {
    setFilters({
      search: '',
      peopleIds: [],
      smart: [],
      eventId: id,
      onlyRejected: false,
      hideRejected: true,
    });
    navigate('/library');
  };

  const openPhoto = (photo: Photo) => {
    const index = hits.findIndex((hit) => hit.photo.id === photo.id);
    setLightbox(index >= 0 ? index : null);
  };

  const interpreted = useMemo(() => {
    const chips: string[] = [];
    for (const id of parsed.personIds) chips.push(peopleById.get(id)?.name ?? 'Person');
    for (const role of parsed.roleFilters) chips.push(ROLE_LABEL.get(role as never) ?? role);
    for (const tag of parsed.tags) chips.push(SMART_LABEL.get(tag) ?? tag);
    for (const flag of parsed.flags) {
      chips.push(flag === 'duplicates' ? 'Duplicates & repeats' : FLAG_META[flag as keyof typeof FLAG_META]?.label ?? flag);
    }
    if (parsed.month !== null) chips.push(MONTHS[parsed.month]);
    if (parsed.year !== null) chips.push(String(parsed.year));
    for (const term of parsed.terms) chips.push(`“${term}”`);
    return Array.from(new Set(chips));
  }, [parsed, peopleById]);

  const topPeople = useMemo(() => [...people].sort((a, b) => b.faceCount - a.faceCount).slice(0, 10), [people]);
  const topEvents = useMemo(
    () =>
      [...events]
        .filter((event) => (eventPhotoCounts.get(event.id) ?? 0) > 0)
        .sort((a, b) => a.start - b.start)
        .slice(0, 8),
    [events, eventPhotoCounts],
  );
  const topRated = useMemo(
    () =>
      [...photos]
        .filter((photo) => !photo.rejected)
        .sort((a, b) => (b.scores?.overall ?? 0) - (a.scores?.overall ?? 0))
        .slice(0, 8),
    [photos],
  );

  const isEmpty = !query.trim();

  return (
    <div className="animate-fade-up pb-16">
      <PageHeader
        eyebrow="Search"
        title="Ask the library"
        description="Search by person, moment, filename, note or visual description. Everything is interpreted on this device — no query ever leaves the browser."
        actions={
          <>
            <Button variant="secondary" icon={<ArrowRight className="h-4 w-4" />} onClick={openInLibrary} disabled={!query.trim()}>
              Refine in library
            </Button>
            <Button variant="primary" icon={<Sparkles className="h-4 w-4" />} onClick={() => navigate('/review')}>
              Review sets
            </Button>
          </>
        }
      >
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <Chip tone="success">
            <ShieldCheck className="h-3 w-3" /> Local interpretation
          </Chip>
          <Chip>{formatCount(photos.length)} photographs indexed by metadata</Chip>
          <Chip tone={visualReady ? 'accent' : 'neutral'}>
            <Sparkles className="h-3 w-3" /> {formatCount(embeddings.size)} visual embeddings
          </Chip>
        </div>
      </PageHeader>

      <Card className="relative overflow-hidden p-4 sm:p-5">
        <div className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <TextInput
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    if (mode === 'visual') setMode('visual');
                  }
                  if (event.key === 'Escape') setQuery('');
                }}
                placeholder="Try “bride and groom smiling at sunset” or “Emma with family”…"
                className="h-12 rounded-xl2 pl-11 pr-10 text-[14px]"
                aria-label="Search photographs"
              />
              {query ? (
                <IconButton label="Clear search" size="sm" className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setQuery('')}>
                  <X className="h-3.5 w-3.5" />
                </IconButton>
              ) : (
                <kbd className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded border border-line bg-raised px-1.5 py-0.5 text-[9px] text-faint">
                  <Command className="h-2.5 w-2.5" /> K
                </kbd>
              )}
            </div>
            <SegmentedControl
              value={mode}
              onChange={setMode}
              options={[
                { value: 'smart', label: 'Smart search', icon: <Search className="h-3 w-3" /> },
                { value: 'visual', label: 'Visual similarity', icon: <Sparkles className="h-3 w-3" /> },
              ]}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">Try</span>
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => {
                  setQuery(suggestion);
                  setMode('smart');
                }}
                className="rounded-full border border-line bg-raised/70 px-2.5 py-1 text-[10.5px] text-soft transition-colors hover:border-accent/40 hover:text-ink"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {mode === 'visual' ? (
        <VisualSearchPanel
          consent={project.consentAiSearch}
          visualReady={visualReady}
          missingEmbeddings={missingEmbeddings}
          indexing={indexing}
          aiStatus={ai.status}
          aiMessage={ai.message}
          aiCompleted={ai.completed}
          aiTotal={ai.total}
          onEnable={() => void updateProject({ consentAiSearch: true })}
          onIndex={() => void indexVisualSearch()}
          onCancel={cancelVisualIndexing}
          onQuery={query}
        />
      ) : null}

      {isEmpty ? (
        <div className="mt-6 space-y-6">
          {topPeople.length ? (
            <Card className="p-5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">People</p>
                  <h2 className="display mt-1 text-xl text-ink">Who are you looking for?</h2>
                </div>
                <Button variant="ghost" size="sm" onClick={() => navigate('/people')}>
                  All people <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10">
                {topPeople.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => searchPerson(person.id)}
                    className="group flex flex-col items-center gap-2 rounded-xl border border-transparent p-2 transition-colors hover:border-line hover:bg-raised"
                  >
                    <PersonAvatar person={person} faces={faces} size={48} />
                    <span className="w-full truncate text-center text-[10.5px] font-medium text-soft group-hover:text-ink">
                      {person.name}
                    </span>
                    <span className="text-[9px] text-faint">{person.faceCount} faces</span>
                  </button>
                ))}
              </div>
            </Card>
          ) : null}

          {topEvents.length ? (
            <Card className="p-5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Moments</p>
                  <h2 className="display mt-1 text-xl text-ink">Or a part of the day</h2>
                </div>
                <Button variant="ghost" size="sm" onClick={() => navigate('/timeline')}>
                  Timeline <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {topEvents.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => searchEvent(event.id)}
                    className="flex items-center gap-3 rounded-xl border border-line bg-raised/40 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-soft"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-accent shadow-sm">
                      <CalendarDays className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-medium capitalize text-ink">
                        {event.name || event.type.replace('-', ' ')}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-faint">
                        {formatCount(eventPhotoCounts.get(event.id) ?? 0)} photographs
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          ) : null}

          {topRated.length ? (
            <Card className="p-5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">A place to start</p>
                  <h2 className="display mt-1 text-xl text-ink">The strongest frames</h2>
                </div>
                <Chip tone="accent">Quality, not a verdict</Chip>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
                {topRated.map((photo) => (
                  <QuickThumb key={photo.id} photo={photo} onOpen={() => openPhoto(photo)} />
                ))}
              </div>
            </Card>
          ) : null}

          {!photos.length ? (
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title="Nothing to search yet"
              description="Import photographs first. Ivory reads filenames, notes, people and moments locally, so search works offline."
              action={<Button variant="primary" onClick={() => navigate('/import')}>Import photographs</Button>}
            />
          ) : null}
        </div>
      ) : (
        <div className="mt-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-medium text-ink">
              {visualLoading ? 'Searching visually…' : `${formatCount(hits.length)} result${hits.length === 1 ? '' : 's'}`}
            </span>
            {interpreted.length ? (
              <span className="flex flex-wrap items-center gap-1">
                {interpreted.slice(0, 8).map((chip) => (
                  <Chip key={chip} tone="accent">{chip}</Chip>
                ))}
              </span>
            ) : null}
            <div className="ml-auto flex items-center gap-2">
              {mode === 'smart' && smartHits.length ? (
                <span className="text-[10.5px] text-faint">Click a photograph to inspect and add it to the album.</span>
              ) : null}
              <Button variant="ghost" size="sm" onClick={() => setQuery('')}>Clear</Button>
            </div>
          </div>

          {visualLoading && mode === 'visual' ? (
            <Card className="flex flex-col items-center justify-center gap-3 p-16">
              <Spinner />
              <p className="text-[12px] text-soft">Comparing your words with {formatCount(embeddings.size)} local image embeddings…</p>
            </Card>
          ) : hits.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {hits.map((hit) => (
                <ResultCard
                  key={hit.photo.id}
                  hit={hit}
                  peopleById={peopleById}
                  onOpen={() => openPhoto(hit.photo)}
                  onToggleSelected={() => void toggleSelected(hit.photo.id)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title={mode === 'visual' && !canVisualSearch ? 'Visual search is not ready' : 'No photographs found'}
              description={
                mode === 'visual' && !canVisualSearch
                  ? 'Enable local visual search and index a few photographs to describe what you are looking for.'
                  : 'Try fewer words, another person’s name, or a broader moment. Search only interprets what is stored locally; nothing has been discarded.'
              }
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {suggestions.slice(0, 3).map((suggestion) => (
                    <Button key={suggestion} variant="secondary" size="sm" onClick={() => {
                      setQuery(suggestion);
                      setMode('smart');
                    }}>
                      {suggestion}
                    </Button>
                  ))}
                </div>
              }
            />
          )}
        </div>
      )}

      {lightbox !== null && hits[lightbox] ? (
        <PhotoLightbox
          photos={hits.map((hit) => hit.photo)}
          index={lightbox}
          onIndexChange={setLightbox}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </div>
  );
}

function VisualSearchPanel({
  consent,
  visualReady,
  missingEmbeddings,
  indexing,
  aiStatus,
  aiMessage,
  aiCompleted,
  aiTotal,
  onEnable,
  onIndex,
  onCancel,
  onQuery,
}: {
  consent: boolean;
  visualReady: boolean;
  missingEmbeddings: number;
  indexing: boolean;
  aiStatus: string;
  aiMessage: string;
  aiCompleted: number;
  aiTotal: number;
  onEnable: () => void;
  onIndex: () => void;
  onCancel: () => void;
  onQuery: string;
}) {
  if (!consent) {
    return (
      <Card className="mt-4 flex flex-col gap-3 border-accent/25 bg-accent-soft/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[12.5px] font-medium text-ink">Visual similarity is off</p>
            <p className="mt-0.5 max-w-xl text-[11px] leading-relaxed text-soft">
              Describing a scene requires a local CLIP model (~170 MB, downloaded once). It runs entirely in your browser and can be disabled or cleared at any time.
            </p>
          </div>
        </div>
        <Button variant="primary" size="sm" onClick={onEnable}>Enable local visual search</Button>
      </Card>
    );
  }

  if (indexing) {
    return (
      <Card className="mt-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Spinner className="h-4 w-4" />
          <p className="text-[12px] font-medium text-ink">
            {aiStatus === 'loading' ? 'Preparing the visual model…' : 'Indexing photographs visually'}
          </p>
          <span className="text-[10.5px] tabular-nums text-faint">{formatCount(aiCompleted)} of {formatCount(aiTotal || missingEmbeddings)}</span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={onCancel}>Stop</Button>
        </div>
        <ProgressBar className="mt-3" value={aiCompleted} max={Math.max(1, aiTotal || missingEmbeddings)} />
        <p className="mt-1.5 truncate text-[10.5px] text-faint">{aiMessage}</p>
      </Card>
    );
  }

  if (!visualReady || missingEmbeddings > 0) {
    return (
      <Card className="mt-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[12.5px] font-medium text-ink">
              {visualReady ? `${formatCount(missingEmbeddings)} photographs still to index` : 'Index the library for visual search'}
            </p>
            <p className="mt-0.5 max-w-xl text-[11px] leading-relaxed text-soft">
              The first run downloads the model once. Then descriptions like “quiet moment by the window” become searchable offline.
            </p>
          </div>
        </div>
        <Button variant="primary" size="sm" icon={<Sparkles className="h-3.5 w-3.5" />} onClick={onIndex}>
          {visualReady ? 'Index remaining' : 'Start visual indexing'}
        </Button>
      </Card>
    );
  }

  if (aiStatus === 'error') {
    return (
      <Card className="mt-4 border-danger/25 bg-danger-soft/50 p-4 text-[11.5px] leading-relaxed text-danger">
        The visual model could not start. {aiMessage} Metadata search still works normally.
      </Card>
    );
  }

  if (!onQuery.trim()) {
    return (
      <Card className="mt-4 flex items-start gap-3 p-4">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <p className="text-[11.5px] leading-relaxed text-soft">
          Describe a scene, mood, colour or composition. Visual similarity compares your phrase with each photograph’s local embedding and shows the closest matches first.
        </p>
      </Card>
    );
  }

  return null;
}

function QuickThumb({ photo, onOpen }: { photo: Photo; onOpen: () => void }) {
  const url = useThumbUrl(photo.id);
  return (
    <button type="button" onClick={onOpen} className="group relative aspect-square overflow-hidden rounded-lg border border-line bg-raised">
      {url ? (
        <img src={url} alt={photo.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-faint"><ImageOff className="h-4 w-4" /></span>
      )}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent p-1.5 pt-5">
        <span className="block truncate text-[9.5px] font-medium text-white/90">{photo.name}</span>
      </span>
    </button>
  );
}

function ResultCard({
  hit,
  peopleById,
  onOpen,
  onToggleSelected,
}: {
  hit: SearchHit;
  peopleById: Map<string, { name: string; color?: string }>;
  onOpen: () => void;
  onToggleSelected: () => void;
}) {
  const url = useThumbUrl(hit.photo.id);
  const people = hit.photo.personIds
    .map((id) => peopleById.get(id)?.name)
    .filter((name): name is string => Boolean(name));

  return (
    <article
      className={clsx(
        'group overflow-hidden rounded-xl2 border bg-surface shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lift',
        hit.photo.rejected ? 'border-danger/30 opacity-70' : 'border-line',
      )}
    >
      <button type="button" onClick={onOpen} className="relative block aspect-[4/3] w-full overflow-hidden bg-raised" aria-label={`Open ${hit.photo.name}`}>
        {url ? (
          <img src={url} alt={hit.photo.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-faint"><ImageOff className="h-5 w-5" /></span>
        )}
        <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <span className="absolute left-2 top-2 flex flex-wrap gap-1">
          {hit.reasons.slice(0, 2).map((reason) => (
            <span key={reason} className="rounded-full bg-black/45 px-1.5 py-0.5 text-[9px] font-medium text-white/90 backdrop-blur-sm">
              {reason}
            </span>
          ))}
        </span>
        <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-white/90 backdrop-blur-sm">
          {hit.score}
        </span>
        <span className="absolute inset-x-2 bottom-2 flex items-end justify-between gap-2">
          <span className="min-w-0 text-left">
            <span className="block truncate text-[11px] font-medium text-white">{hit.photo.name}</span>
            <span className="mt-0.5 block truncate text-[9px] text-white/65">
              {hit.photo.category ? hit.photo.category.replace('-', ' ') : 'unfiled'}
              {people.length ? ` · ${people.slice(0, 2).join(', ')}` : ''}
            </span>
          </span>
        </span>
      </button>
      <div className="flex items-center gap-1.5 px-2.5 py-2">
        <button
          type="button"
          onClick={onToggleSelected}
          className={clsx(
            'flex h-7 items-center gap-1 rounded-full px-2 text-[10px] font-medium transition-colors',
            hit.photo.selected ? 'bg-accent text-accent-ink' : 'bg-raised text-soft hover:bg-accent-soft hover:text-accent',
          )}
          aria-label={hit.photo.selected ? 'Remove from album' : 'Add to album'}
        >
          <Check className="h-3 w-3" /> {hit.photo.selected ? 'In album' : 'Add'}
        </button>
        <span className="min-w-0 flex-1 truncate text-right text-[9.5px] text-faint">
          {hit.photo.faces.faceCount ? <span className="inline-flex items-center gap-1"><Users className="h-2.5 w-2.5" />{hit.photo.faces.faceCount}</span> : null}
          {hit.photo.capturedAt ? <span className="ml-2">{new Date(hit.photo.capturedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span> : null}
        </span>
      </div>
    </article>
  );
}
