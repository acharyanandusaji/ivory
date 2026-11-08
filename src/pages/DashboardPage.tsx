import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  Clock,
  FolderPlus,
  Heart,
  Images,
  Lock,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Users,
} from 'lucide-react';
import type { Photo } from '@/types';
import { useAppStore } from '@/store/appStore';
import { PageHeader } from '@/components/layout/PageHeader';
import { PhotoTile } from '@/components/PhotoTile';
import { PhotoLightbox } from '@/components/PhotoLightbox';
import { PersonAvatar } from '@/components/PersonAvatar';
import { NewProjectModal } from '@/components/NewProjectModal';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  IconButton,
  Modal,
  ProgressBar,
  SectionHeading,
} from '@/components/ui';
import { formatBytes, formatCount, formatDate, formatDayLabel, percent, timeAgo } from '@/lib/utils';
import { selectionCoverage } from '@/lib/selection';

function Stat({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  tone?: 'default' | 'accent' | 'success';
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'group flex flex-col rounded-xl2 border border-line bg-surface p-4 text-left shadow-soft transition-all',
        onClick ? 'hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lift' : 'cursor-default',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-faint">{label}</span>
        <span
          className={clsx(
            'flex h-7 w-7 items-center justify-center rounded-lg',
            tone === 'accent' ? 'bg-accent-soft text-accent' : tone === 'success' ? 'bg-success-soft text-success' : 'bg-raised text-soft',
          )}
        >
          {icon}
        </span>
      </div>
      <span className="display mt-3 text-[28px] leading-none tabular-nums text-ink">{value}</span>
      {hint ? <span className="mt-1.5 text-[10.5px] text-faint">{hint}</span> : null}
    </button>
  );
}

function ProjectRow({
  id,
  name,
  couple,
  photos,
  lastOpened,
  active,
  onDelete,
}: {
  id: string;
  name: string;
  couple?: string;
  photos: number;
  lastOpened: number;
  active?: boolean;
  onDelete: () => void;
}) {
  const openProject = useAppStore((state) => state.openProject);
  const navigate = useNavigate();
  return (
    <div
      className={clsx(
        'group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors',
        active ? 'border-accent/30 bg-accent-soft/40' : 'border-transparent hover:border-line hover:bg-raised/60',
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-[11px] font-semibold text-accent shadow-sm">
        {name.slice(0, 1).toUpperCase()}
      </span>
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={() => {
          if (active) navigate('/library');
          else void openProject(id).then(() => navigate('/library'));
        }}
      >
        <p className="flex items-center gap-1.5 truncate text-[12.5px] font-medium text-ink">
          {name}
          {active ? <span className="rounded-full bg-accent px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-accent-ink">Open</span> : null}
        </p>
        <p className="mt-0.5 truncate text-[10.5px] text-faint">
          {couple || 'Private library'} · {formatCount(photos)} photos · {timeAgo(lastOpened)}
        </p>
      </button>
      <IconButton
        label={`Delete ${name}`}
        tone="danger"
        size="sm"
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 focus:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </IconButton>
    </div>
  );
}

export function DashboardPage() {
  const project = useAppStore((state) => state.project);
  const projects = useAppStore((state) => state.projects);
  const photos = useAppStore((state) => state.photos);
  const people = useAppStore((state) => state.people);
  const faces = useAppStore((state) => state.faces);
  const events = useAppStore((state) => state.events);
  const groups = useAppStore((state) => state.groups);
  const storage = useAppStore((state) => state.storage);
  const settings = useAppStore((state) => state.settings);
  const processing = useAppStore((state) => state.processing);
  const deleteProject = useAppStore((state) => state.deleteProject);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const navigate = useNavigate();

  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const stats = useMemo(() => {
    const selected = photos.filter((photo) => photo.selected);
    const favourites = photos.filter((photo) => photo.favorite);
    const flagged = photos.filter((photo) => photo.flags.length > 0);
    const coverage = selectionCoverage(selected);
    const average = photos.reduce((sum, photo) => sum + (photo.scores?.overall ?? 0), 0) / Math.max(1, photos.length);
    const stars = photos.reduce((sum, photo) => sum + photo.rating, 0);
    return {
      selected: selected.length,
      favourites: favourites.length,
      flagged: flagged.length,
      coverage,
      average: Math.round(average),
      stars,
      rated: photos.filter((photo) => photo.rating > 0).length,
    };
  }, [photos]);

  const recent = useMemo(
    () => [...photos].sort((a, b) => b.addedAt - a.addedAt).slice(0, 8),
    [photos],
  );

  const momentRows = useMemo(() => {
    const byEvent = new Map<string, Photo[]>();
    for (const photo of photos) {
      if (!photo.eventId) continue;
      const list = byEvent.get(photo.eventId);
      if (list) list.push(photo);
      else byEvent.set(photo.eventId, [photo]);
    }
    return events
      .map((event) => ({
        event,
        photos: byEvent.get(event.id) ?? [],
      }))
      .filter((row) => row.photos.length)
      .sort((a, b) => a.event.start - b.event.start);
  }, [events, photos]);

  const topPeople = useMemo(
    () => [...people].sort((a, b) => b.faceCount - a.faceCount).slice(0, 6),
    [people],
  );

  const dismissOnboarding = () => updateSettings({ onboardingDismissed: true });

  if (!project) {
    return (
      <div className="animate-fade-up">
        <div className="noise relative overflow-hidden rounded-xl2 border border-line bg-surface shadow-soft">
          <div
            className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full opacity-50 blur-3xl"
            style={{ background: 'radial-gradient(circle, rgb(var(--accent) / .35), transparent 70%)' }}
          />
          <div className="relative grid gap-10 p-7 sm:p-10 lg:grid-cols-[1.15fr_.85fr] lg:p-14">
            <div className="flex flex-col justify-center">
              <p className="mb-4 flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-[0.24em] text-accent">
                <span className="h-px w-8 bg-accent/50" /> Private, local-first curation
              </p>
              <h1 className="display max-w-2xl text-[38px] leading-[1.02] tracking-[-0.025em] text-ink sm:text-[54px]">
                Find the photographs
                <br />
                <span className="italic text-accent">that matter.</span>
              </h1>
              <p className="mt-5 max-w-lg text-[13.5px] leading-relaxed text-soft">
                Import a wedding or event, let Ivory group duplicates, rank quality and gather the people you love — all inside your browser. No uploads, accounts or subscriptions.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-2.5">
                <Button variant="primary" size="lg" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
                  Create a private library
                </Button>
                {projects.length ? (
                  <Button
                    variant="secondary"
                    size="lg"
                    icon={<ArrowRight className="h-4 w-4" />}
                    onClick={() => void useAppStore.getState().openProject(projects[0].id)}
                  >
                    Open {projects[0].name}
                  </Button>
                ) : null}
              </div>
              <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-[10.5px] text-faint">
                <span className="flex items-center gap-1.5"><Lock className="h-3 w-3 text-success" /> 100% on device</span>
                <span className="flex items-center gap-1.5"><ShieldCheck className="h-3 w-3 text-success" /> Open source</span>
                <span className="flex items-center gap-1.5"><Sparkles className="h-3 w-3 text-accent" /> AI recommends, you decide</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 self-center">
              {[
                { icon: Images, title: 'Duplicates & bursts', body: 'Exact and visual duplicates grouped, with the sharpest frame suggested.' },
                { icon: Star, title: 'Quality ranking', body: 'Focus, exposure, composition and faces scored locally.' },
                { icon: Users, title: 'People, privately', body: 'Face grouping stays on this device and can be deleted in one tap.' },
                { icon: BookOpen, title: 'Album to handoff', body: 'Curate to a target, preview spreads and export originals.' },
              ].map((feature) => (
                <div key={feature.title} className="rounded-xl border border-line bg-canvas/55 p-4">
                  <feature.icon className="h-4 w-4 text-accent" />
                  <p className="mt-3 text-[12px] font-medium text-ink">{feature.title}</p>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-faint">{feature.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {projects.length ? (
          <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
            <Card className="p-5">
              <SectionHeading title="Your libraries" description="Recently opened private projects." />
              <div className="mt-4 space-y-1">
                {projects.map((item) => (
                  <ProjectRow
                    key={item.id}
                    id={item.id}
                    name={item.name}
                    couple={item.coupleNames || item.venue}
                    photos={0}
                    lastOpened={item.lastOpenedAt}
                    onDelete={() => setDeleting({ id: item.id, name: item.name })}
                  />
                ))}
              </div>
            </Card>
            <Card className="p-5">
              <SectionHeading eyebrow="A quieter workflow" title="Built for real events" />
              <div className="mt-4 space-y-3 text-[12px] leading-relaxed text-soft">
                <p>Ivory never deletes or discards a photograph automatically. Every suggestion is reversible, and originals remain yours.</p>
                <p className="rounded-xl border border-line bg-raised/60 p-3 text-[11.5px] text-faint">
                  Tip: for a 5,000-photo wedding, start with the Library quality sort, then use Review to compare bursts and similar frames.
                </p>
              </div>
            </Card>
          </div>
        ) : null}

        <NewProjectModal open={creating} onClose={() => setCreating(false)} />
        <DeleteProjectModal deleting={deleting} onClose={() => setDeleting(null)} onConfirm={deleteProject} />
      </div>
    );
  }

  const coveragePct = stats.selected ? percent(stats.coverage.categories, 10) : 0;
  const selectedPct = percent(stats.selected, Math.max(1, photos.length));
  const avgTone = stats.average >= 70 ? 'text-success' : stats.average >= 50 ? 'text-accent' : 'text-danger';

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        eyebrow={project.eventDate ? formatDate(Date.parse(`${project.eventDate}T12:00:00`)) : 'Private library'}
        title={project.name}
        description={
          project.coupleNames || project.venue
            ? [project.coupleNames, project.venue].filter(Boolean).join(' · ')
            : 'A private, local-first photo library. Every recommendation can be overridden.'
        }
        actions={
          <>
            <Button variant="secondary" icon={<Search className="h-4 w-4" />} onClick={() => navigate('/search')}>Search</Button>
            <Button variant="gold" icon={<Sparkles className="h-4 w-4" />} onClick={() => navigate('/review')}>Start review</Button>
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/import')}>Import</Button>
          </>
        }
      />

      {!settings.onboardingDismissed ? (
        <div className="relative overflow-hidden rounded-xl2 border border-accent/25 bg-accent-soft/60 p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[13px] font-medium text-ink">A simple path through a big gallery</p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-soft">
                  Import → let analysis finish → review similar sets → name people → curate the album → export. You are always in control.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => navigate('/import')}>
                {photos.length ? 'Add photos' : 'Import photos'}
              </Button>
              <IconButton label="Dismiss guide" onClick={dismissOnboarding}>
                <Check className="h-4 w-4" />
              </IconButton>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Photographs"
          value={formatCount(photos.length)}
          hint={`${formatCount(photos.filter((p) => p.status === 'ready').length)} analysed`}
          icon={<Images className="h-3.5 w-3.5" />}
          onClick={() => navigate('/library')}
        />
        <Stat
          label="In the album"
          value={formatCount(stats.selected)}
          hint={`${selectedPct}% of the library`}
          icon={<Check className="h-3.5 w-3.5" />}
          tone="accent"
          onClick={() => navigate('/album')}
        />
        <Stat
          label="Favourites"
          value={formatCount(stats.favourites)}
          hint={`${formatCount(stats.rated)} rated by you`}
          icon={<Heart className="h-3.5 w-3.5" />}
          tone="accent"
          onClick={() => navigate('/library')}
        />
        <Stat
          label="People"
          value={formatCount(people.length)}
          hint={`${formatCount(groups.length)} similar & burst sets`}
          icon={<Users className="h-3.5 w-3.5" />}
          tone="success"
          onClick={() => navigate('/people')}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
        <Card className="p-5">
          <SectionHeading
            eyebrow="Library health"
            title="A balanced starting point"
            action={<Chip tone="accent">{processing.running ? 'Analysing…' : 'Local analysis'}</Chip>}
          />
          <div className="mt-5 grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center">
            <div className="flex items-baseline gap-2">
              <span className={clsx('display text-[54px] leading-none tabular-nums', avgTone)}>{stats.average || '—'}</span>
              <span className="text-[10.5px] text-faint">/ 100<br />average quality</span>
            </div>
            <div className="space-y-3">
              <div>
                <div className="mb-1 flex justify-between text-[10.5px]">
                  <span className="text-soft">Album selection</span>
                  <span className="tabular-nums text-faint">{formatCount(stats.selected)} photos</span>
                </div>
                <ProgressBar value={stats.selected} max={Math.max(1, photos.length)} />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-[10.5px]">
                  <span className="text-soft">Moment coverage</span>
                  <span className="tabular-nums text-faint">{stats.coverage.events} of {events.length} moments</span>
                </div>
                <ProgressBar value={stats.coverage.events} max={Math.max(1, events.length)} tone="success" />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-[10.5px]">
                  <span className="text-soft">Category spread</span>
                  <span className="tabular-nums text-faint">{stats.coverage.categories} categories</span>
                </div>
                <ProgressBar value={coveragePct} max={100} tone="accent" />
              </div>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
            <Chip tone={stats.flagged ? 'danger' : 'success'}>
              <CircleAlert className="h-3 w-3" /> {formatCount(stats.flagged)} photographs need a second look
            </Chip>
            <Chip>
              <Star className="h-3 w-3" /> {formatCount(photos.filter((p) => (p.scores?.overall ?? 0) >= 75).length)} top-rated
            </Chip>
            <Chip>
              <Clock className="h-3 w-3" /> {processing.running ? 'Analysis in progress' : 'Ready to curate'}
            </Chip>
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeading
            eyebrow="Storage & privacy"
            title="On this device only"
            action={<ShieldCheck className="h-4 w-4 text-success" />}
          />
          <div className="mt-5 space-y-4">
            <div>
              <div className="mb-1 flex justify-between text-[10.5px]">
                <span className="text-soft">Browser storage used</span>
                <span className="tabular-nums text-faint">
                  {formatBytes(storage.usage)} {storage.quota ? `of ${formatBytes(storage.quota)}` : ''}
                </span>
              </div>
              <ProgressBar value={storage.usage} max={Math.max(1, storage.quota)} tone={storage.quota && storage.usage / storage.quota > 0.85 ? 'danger' : 'accent'} />
              <p className="mt-1.5 text-[10px] text-faint">
                {storage.persisted ? 'Storage is protected from automatic eviction.' : 'The browser may evict data under pressure.'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg border border-line bg-raised/60 p-2.5">
                <p className="text-[9.5px] uppercase tracking-wide text-faint">Face grouping</p>
                <p className="mt-1 font-medium text-ink">{project.consentFace ? 'On, local' : 'Off'}</p>
              </div>
              <div className="rounded-lg border border-line bg-raised/60 p-2.5">
                <p className="text-[9.5px] uppercase tracking-wide text-faint">Visual search</p>
                <p className="mt-1 font-medium text-ink">{project.consentAiSearch ? 'Opted in' : 'Off'}</p>
              </div>
              <div className="rounded-lg border border-line bg-raised/60 p-2.5">
                <p className="text-[9.5px] uppercase tracking-wide text-faint">Originals stored</p>
                <p className="mt-1 font-medium text-ink">{project.storeOriginals ? 'Yes' : 'Relink on export'}</p>
              </div>
              <div className="rounded-lg border border-line bg-raised/60 p-2.5">
                <p className="text-[9.5px] uppercase tracking-wide text-faint">Last activity</p>
                <p className="mt-1 font-medium text-ink">{timeAgo(project.updatedAt)}</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" className="w-full" onClick={() => navigate('/settings')}>
              Manage privacy & storage <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </Card>
      </div>

      {momentRows.length ? (
        <Card className="p-5">
          <SectionHeading
            eyebrow="Timeline"
            title="Moments already gathered"
            action={<Button variant="ghost" size="sm" onClick={() => navigate('/timeline')}>View timeline <ArrowRight className="h-3.5 w-3.5" /></Button>}
          />
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {momentRows.slice(0, 6).map(({ event, photos: eventPhotos }) => {
              const best = Math.max(...eventPhotos.map((photo) => photo.scores?.overall ?? 0));
              return (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => navigate('/timeline')}
                  className="flex items-center gap-3 rounded-xl border border-line bg-raised/40 p-3 text-left transition-colors hover:border-accent/40 hover:bg-raised"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-accent shadow-sm">
                    <CalendarDays className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium capitalize text-ink">{event.name || event.type.replace('-', ' ')}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-faint">
                      {formatDayLabel(event.start)} · {formatCount(eventPhotos.length)} photos
                    </span>
                  </span>
                  <span className="text-[10.5px] font-semibold tabular-nums text-accent">{best ? Math.round(best) : '—'}</span>
                </button>
              );
            })}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.3fr_.7fr]">
        <Card className="p-5">
          <SectionHeading
            eyebrow="Recently imported"
            title="Latest arrivals"
            action={<Button variant="ghost" size="sm" onClick={() => navigate('/library')}>Open library <ArrowRight className="h-3.5 w-3.5" /></Button>}
          />
          <div className="mt-4">
            {recent.length ? (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                {recent.map((photo) => (
                  <PhotoTile
                    key={photo.id}
                    photo={photo}
                    showMeta={false}
                    selectable={false}
                    onOpen={() => setLightbox(recent.findIndex((item) => item.id === photo.id))}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                compact
                icon={<Images className="h-5 w-5" />}
                title="No photographs yet"
                description="Import a folder, files or ZIP archive to begin."
                action={<Button variant="primary" size="sm" onClick={() => navigate('/import')}>Import photographs</Button>}
              />
            )}
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeading
            eyebrow="People"
            title="Faces gathered"
            action={<Button variant="ghost" size="sm" onClick={() => navigate('/people')}>All people</Button>}
          />
          {topPeople.length ? (
            <div className="mt-5 flex flex-wrap gap-3">
              {topPeople.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => navigate('/people')}
                  className="flex w-[72px] flex-col items-center gap-1.5 rounded-xl p-1.5 transition-colors hover:bg-raised"
                >
                  <PersonAvatar person={person} faces={faces} size={48} />
                  <span className="w-full truncate text-center text-[10px] font-medium text-soft">{person.name}</span>
                  <span className="text-[9px] text-faint">{person.faceCount} faces</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-line p-5 text-center">
              <Users className="mx-auto h-5 w-5 text-faint" />
              <p className="mt-2 text-[11.5px] leading-relaxed text-faint">
                {project.consentFace
                  ? 'People will appear after face analysis finishes. You can name and merge them any time.'
                  : 'Face grouping is off. You can enable it in Settings whenever you choose.'}
              </p>
            </div>
          )}
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-[10.5px] font-medium text-soft">Projects</p>
            <div className="mt-2 space-y-1">
              {projects.slice(0, 3).map((item) => (
                <ProjectRow
                  key={item.id}
                  id={item.id}
                  name={item.name}
                  couple={item.coupleNames || item.venue}
                  photos={item.id === project.id ? photos.length : 0}
                  lastOpened={item.lastOpenedAt}
                  active={item.id === project.id}
                  onDelete={() => setDeleting({ id: item.id, name: item.name })}
                />
              ))}
            </div>
            <Button variant="secondary" size="sm" className="mt-3 w-full" icon={<FolderPlus className="h-3.5 w-3.5" />} onClick={() => setCreating(true)}>
              New library
            </Button>
          </div>
        </Card>
      </div>

      {lightbox !== null && recent.length ? (
        <PhotoLightbox
          photos={recent}
          index={Math.min(lightbox, recent.length - 1)}
          onIndexChange={setLightbox}
          onClose={() => setLightbox(null)}
        />
      ) : null}

      <NewProjectModal open={creating} onClose={() => setCreating(false)} />
      <DeleteProjectModal deleting={deleting} onClose={() => setDeleting(null)} onConfirm={deleteProject} />
    </div>
  );
}

function DeleteProjectModal({
  deleting,
  onClose,
  onConfirm,
}: {
  deleting: { id: string; name: string } | null;
  onClose: () => void;
  onConfirm: (id: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={Boolean(deleting)}
      onClose={onClose}
      title="Delete this library?"
      description="This removes every photograph, preview, descriptor and album decision from this browser. Originals you still hold elsewhere are unaffected."
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={async () => {
              if (!deleting) return;
              setBusy(true);
              await onConfirm(deleting.id);
              setBusy(false);
              onClose();
            }}
          >
            <Trash2 className="h-4 w-4" /> Delete permanently
          </Button>
        </div>
      }
    >
      <div className="px-5 py-4 text-[12.5px] leading-relaxed text-soft">
        <p className="font-medium text-ink">{deleting?.name}</p>
        <p className="mt-2">
          There is no cloud copy to recover from. Export anything you need before deleting.
        </p>
      </div>
    </Modal>
  );
}
