import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  Archive,
  BookOpen,
  CheckCircle2,
  CircleAlert,
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  HardDrive,
  Images,
  Info,
  Link2,
  Loader2,
  Printer,
  ShieldCheck,
} from 'lucide-react';
import type { Photo } from '@/types';
import {
  useAppStore,
  type RelinkProgress,
  type RelinkResult,
} from '@/store/appStore';
import { useLibraryView } from '@/hooks/useLibrary';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProjectGate } from '@/components/ProjectGate';
import {
  Button,
  Card,
  Chip,
  Field,
  ProgressBar,
  SectionHeading,
  SegmentedControl,
  Select,
  TextArea,
  TextInput,
} from '@/components/ui';
import { countAvailableOriginals } from '@/lib/assets';
import { pickFiles } from '@/lib/import';
import {
  ExportCancelled,
  buildCsv,
  buildExportName,
  buildManifest,
  exportAlbumPdf,
  exportContactSheetPdf,
  exportCsv,
  exportHandoffHtml,
  exportManifest,
  exportPhotosZip,
  exportReportPdf,
  type ExportProgress,
} from '@/lib/exporter';
import {
  formatBytes,
  formatCount,
  sanitizeFilename,
} from '@/lib/utils';

type Scope = 'album' | 'favourites' | 'view' | 'all';
type JobKind = 'zip' | 'contact' | 'album' | 'report';
type AlbumLayout = 'two-up' | 'one-up';

interface Job {
  kind: JobKind;
  label: string;
}

const SCOPES: Array<{ id: Scope; label: string; description: string }> = [
  {
    id: 'album',
    label: 'Album selection',
    description: 'The frames marked for this album — the usual handoff set.',
  },
  {
    id: 'favourites',
    label: 'Favourites',
    description: 'Everything you starred while curating.',
  },
  {
    id: 'view',
    label: 'Current library view',
    description: 'Exactly what the active filters and search show in Library.',
  },
  {
    id: 'all',
    label: 'Every photograph',
    description: 'The complete library, including frames not chosen for the album.',
  },
];

const TEMPLATE_TOKENS = ['{name}', '{index}', '{date}', '{category}'];

function readAlbumLayout(): AlbumLayout {
  try {
    return localStorage.getItem('ivory.albumLayout') === 'one-up' ? 'one-up' : 'two-up';
  } catch {
    return 'two-up';
  }
}

export function ExportPage() {
  return (
    <ProjectGate feature="exporting and handoff">
      <ExportWorkspace />
    </ProjectGate>
  );
}

function ExportWorkspace() {
  const project = useAppStore((state) => state.project)!;
  const photos = useAppStore((state) => state.photos);
  const people = useAppStore((state) => state.people);
  const events = useAppStore((state) => state.events);
  const album = useAppStore((state) => state.album);
  const pushToast = useAppStore((state) => state.pushToast);
  const updateProject = useAppStore((state) => state.updateProject);
  const relinkOriginals = useAppStore((state) => state.relinkOriginals);
  const refreshStorage = useAppStore((state) => state.refreshStorage);
  const { photos: viewPhotos } = useLibraryView();
  const navigate = useNavigate();

  const [scope, setScope] = useState<Scope>('album');
  const [filenameTemplate, setFilenameTemplate] = useState('{date}-{name}');
  const [categoryFolders, setCategoryFolders] = useState(true);
  const [includeManifest, setIncludeManifest] = useState(true);
  const [includeCsv, setIncludeCsv] = useState(true);
  const [contactColumns, setContactColumns] = useState(4);
  const [albumLayout, setAlbumLayout] = useState<AlbumLayout>(readAlbumLayout);
  const [job, setJob] = useState<Job | null>(null);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [relinking, setRelinking] = useState(false);
  const [relinkProgress, setRelinkProgress] = useState<RelinkProgress | null>(null);
  const [relinkResult, setRelinkResult] = useState<RelinkResult | null>(null);
  const relinkAbort = useRef<AbortController | null>(null);

  const [details, setDetails] = useState({
    photographerName: project.photographerName ?? '',
    photographerContact: project.photographerContact ?? '',
    handoffNotes: project.handoffNotes ?? '',
  });
  const [detailsSaved, setDetailsSaved] = useState(true);

  useEffect(() => {
    setDetails({
      photographerName: project.photographerName ?? '',
      photographerContact: project.photographerContact ?? '',
      handoffNotes: project.handoffNotes ?? '',
    });
    setDetailsSaved(true);
  }, [project.id, project.photographerName, project.photographerContact, project.handoffNotes]);

  useEffect(() => {
    try {
      localStorage.setItem('ivory.albumLayout', albumLayout);
    } catch {
      // A layout preference; the export itself is unaffected.
    }
  }, [albumLayout]);

  const albumPhotos = useMemo(
    () => photos.filter((photo) => photo.selected && !photo.rejected),
    [photos],
  );
  const favouritePhotos = useMemo(() => photos.filter((photo) => photo.favorite), [photos]);

  const chosen = useMemo<Photo[]>(() => {
    switch (scope) {
      case 'album':
        return albumPhotos;
      case 'favourites':
        return favouritePhotos;
      case 'view':
        return viewPhotos;
      default:
        return photos;
    }
  }, [scope, albumPhotos, favouritePhotos, viewPhotos, photos]);

  const peopleNameById = useMemo(() => new Map(people.map((person) => [person.id, person.name])), [people]);
  const originalsAvailable = useMemo(() => countAvailableOriginals(chosen), [chosen]);
  const missingOriginals = chosen.length - originalsAvailable;
  const globalOriginalsAvailable = useMemo(() => countAvailableOriginals(photos), [photos]);
  const globalMissingOriginals = photos.length - globalOriginalsAvailable;
  const chosenBytes = useMemo(() => chosen.reduce((sum, photo) => sum + photo.size, 0), [chosen]);
  const albumBytes = useMemo(() => albumPhotos.reduce((sum, photo) => sum + photo.size, 0), [albumPhotos]);

  const sampleNames = useMemo(() => {
    return chosen.slice(0, 3).map((photo, index) =>
      buildExportName(photo, index, filenameTemplate, { category: categoryFolders }),
    );
  }, [chosen, filenameTemplate, categoryFolders]);

  const busy = job !== null;

  const runJob = async (
    kind: JobKind,
    label: string,
    task: (signal: AbortSignal) => Promise<void>,
  ) => {
    if (busy || !chosen.length) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setJob({ kind, label });
    setProgress(null);
    try {
      await task(controller.signal);
    } catch (error) {
      if (error instanceof ExportCancelled) {
        pushToast({ title: 'Export cancelled', description: 'No file was saved.', tone: 'default' });
      } else {
        pushToast({
          title: 'Export failed',
          description: error instanceof Error ? error.message : 'The file could not be created.',
          tone: 'danger',
        });
      }
    } finally {
      abortRef.current = null;
      setJob(null);
      setProgress(null);
    }
  };

  const startZip = () =>
    runJob('zip', 'Packaging photographs', async (signal) => {
      const result = await exportPhotosZip(chosen, {
        filename: `${sanitizeFilename(project.name)}-${scope}.zip`,
        filenameTemplate,
        categoryFolders,
        manifest: includeManifest
          ? buildManifest(project, chosen, {
              scope,
              people: people.map((person) => ({ name: person.name, role: person.role })),
            })
          : undefined,
        csv: includeCsv ? buildCsv(chosen, peopleNameById) : undefined,
        signal,
        onProgress: setProgress,
      });
      if (result.status === 'cancelled') {
        pushToast({ title: 'ZIP export cancelled', description: 'No file was saved.', tone: 'default' });
        return;
      }
      pushToast({
        title: result.status === 'saved' ? 'ZIP saved' : 'ZIP downloaded',
        description: `${formatCount(chosen.length)} photographs · ${formatBytes(result.bytes)} · generated on this device.`,
        tone: 'success',
        duration: 5600,
      });
    });

  const startContactSheet = () =>
    runJob('contact', 'Rendering contact sheet', async (signal) => {
      await exportContactSheetPdf(project, chosen, {
        title: `${project.coupleNames || project.name} — contact sheet`,
        columns: contactColumns,
        signal,
        onProgress: setProgress,
      });
      pushToast({
        title: 'Contact sheet exported',
        description: `${formatCount(chosen.length)} frames · ${contactColumns} columns · print-ready A4 landscape.`,
        tone: 'success',
        duration: 5200,
      });
    });

  const startAlbumPdf = () =>
    runJob('album', 'Rendering album PDF', async (signal) => {
      await exportAlbumPdf(project, albumPhotos, {
        title: album.title || project.name,
        subtitle: album.subtitle,
        notes: album.notes.trim() || undefined,
        layout: albumLayout,
        signal,
        onProgress: setProgress,
      });
      pushToast({
        title: 'Album PDF exported',
        description: `${formatCount(albumPhotos.length)} photographs · ${albumLayout === 'two-up' ? 'two per page' : 'one per page'} · A4 landscape.`,
        tone: 'success',
        duration: 5200,
      });
    });

  const startReport = () =>
    runJob('report', 'Writing library report', async (signal) => {
      await exportReportPdf(project, chosen, {
        people: people.map((person) => ({
          name: person.name,
          role: person.role,
          faceCount: person.faceCount,
        })),
        events: events.map((event) => ({
          name: event.name,
          start: event.start,
          count: photos.filter((photo) => photo.eventId === event.id).length,
        })),
        selected: albumPhotos,
        signal,
        onProgress: setProgress,
      });
      pushToast({
        title: 'Library report exported',
        description: 'A local PDF summary with coverage, people, moments and an album index.',
        tone: 'success',
        duration: 5200,
      });
    });

  const exportDocuments = (format: 'csv' | 'json' | 'handoff') => {
    if (format === 'csv') {
      exportCsv(chosen, project, peopleNameById);
      pushToast({
        title: 'CSV exported',
        description: `${formatCount(chosen.length)} rows · opens in Excel, Numbers or Sheets.`,
        tone: 'success',
      });
    } else if (format === 'json') {
      exportManifest(project, chosen, {
        scope,
        people: people.map((person) => ({ name: person.name, role: person.role })),
      });
      pushToast({
        title: 'Manifest exported',
        description: 'A portable JSON record of the selection, metadata and scores.',
        tone: 'success',
      });
    } else {
      exportHandoffHtml(project, chosen, peopleNameById);
      pushToast({
        title: 'Handoff sheet exported',
        description: 'A printable HTML sheet with filenames, people, marks and notes.',
        tone: 'success',
      });
    }
  };

  const saveDetails = async () => {
    await updateProject({
      photographerName: details.photographerName.trim() || undefined,
      photographerContact: details.photographerContact.trim() || undefined,
      handoffNotes: details.handoffNotes.trim() || undefined,
    });
    setDetailsSaved(true);
    pushToast({ title: 'Handoff details saved', tone: 'success' });
  };

  const chooseOriginals = async (directory: boolean) => {
    if (relinking) return;
    const files = await pickFiles({ directory, accept: 'image/*' });
    if (!files.length) return;
    const controller = new AbortController();
    relinkAbort.current = controller;
    setRelinking(true);
    setRelinkProgress(null);
    setRelinkResult(null);
    try {
      const result = await relinkOriginals(files, {
        signal: controller.signal,
        onProgress: setRelinkProgress,
      });
      setRelinkResult(result);
      await refreshStorage();
    } finally {
      relinkAbort.current = null;
      setRelinking(false);
      setRelinkProgress(null);
    }
  };

  const appendToken = (token: string) => {
    setFilenameTemplate((current) => `${current}${current.endsWith('-') || !current ? '' : '-'}${token}`);
  };

  const progressValue = progress?.done ?? 0;
  const progressMax = Math.max(1, progress?.total ?? chosen.length);

  return (
    <div className="animate-fade-up pb-12">
      <PageHeader
        eyebrow="Export & handoff"
        title="Deliver the day, privately"
        description="Package originals, print contact sheets, build the album PDF and write a clear handoff. Every file is generated in your browser — nothing is uploaded."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/album/preview')} icon={<BookOpen className="h-4 w-4" />}>
              Album preview
            </Button>
            <Button
              variant="primary"
              onClick={() => void startZip()}
              loading={job?.kind === 'zip'}
              disabled={busy || !chosen.length}
              icon={<Archive className="h-4 w-4" />}
            >
              Download ZIP
            </Button>
          </>
        }
      >
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <Chip tone="accent">{formatCount(chosen.length)} in scope</Chip>
          <Chip>{formatBytes(chosenBytes)}</Chip>
          <Chip tone={missingOriginals ? 'danger' : 'success'}>
            {missingOriginals ? `${formatCount(missingOriginals)} preview-only` : 'All originals available'}
          </Chip>
          <Chip tone="success">No upload</Chip>
        </div>
      </PageHeader>

      {job ? (
        <Card className="mb-5 border-accent/30 bg-accent-soft/30 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
            <p className="text-[12px] font-medium text-ink">{job.label}</p>
            <span className="text-[10.5px] tabular-nums text-faint">
              {formatCount(progressValue)} of {formatCount(progress?.total ?? chosen.length)}
            </span>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => abortRef.current?.abort()}>
              Cancel
            </Button>
          </div>
          <ProgressBar className="mt-3" value={progressValue} max={progressMax} />
          <p className="mt-1.5 truncate text-[10.5px] text-faint">
            {progress?.currentName || (job.kind === 'zip' ? 'Reading stored files…' : 'Preparing images…')}
          </p>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,.6fr)]">
        <div className="space-y-5">
          <Card className="p-5">
            <SectionHeading
              eyebrow="01 · Choose"
              title="What leaves the library"
              description="Start from the album selection, your favourites, the current filtered view, or the whole library."
            />
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {SCOPES.map((item) => {
                const count =
                  item.id === 'album'
                    ? albumPhotos.length
                    : item.id === 'favourites'
                      ? favouritePhotos.length
                      : item.id === 'view'
                        ? viewPhotos.length
                        : photos.length;
                const active = scope === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setScope(item.id)}
                    className={clsx(
                      'rounded-xl border p-3.5 text-left transition-all',
                      active
                        ? 'border-accent bg-accent-soft/50 shadow-sm'
                        : 'border-line bg-surface hover:border-accent/35 hover:bg-raised/60',
                    )}
                    aria-pressed={active}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-[12.5px] font-medium text-ink">{item.label}</span>
                      <span className={clsx('text-[11px] tabular-nums', active ? 'text-accent' : 'text-faint')}>
                        {formatCount(count)}
                      </span>
                    </div>
                    <p className="mt-1 text-[10.5px] leading-relaxed text-faint">{item.description}</p>
                  </button>
                );
              })}
            </div>
            {!chosen.length ? (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-danger/20 bg-danger-soft/50 p-3 text-[11px] leading-relaxed text-danger">
                <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  This scope is empty. Choose the album selection, build a selection in Album, or pick another scope.
                </span>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-[10.5px] text-faint">
                <span className="inline-flex items-center gap-1.5">
                  <Images className="h-3.5 w-3.5" /> {formatCount(chosen.length)} photographs
                </span>
                <span aria-hidden>·</span>
                <span className="tabular-nums">{formatBytes(chosenBytes)}</span>
                <span aria-hidden>·</span>
                <span>{formatCount(originalsAvailable)} with stored originals</span>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <SectionHeading
              eyebrow="02 · Package"
              title="Full-resolution ZIP"
              description="Files are renamed, optionally sorted into category folders, and streamed into one archive."
              action={
                <Button
                  variant="gold"
                  size="sm"
                  onClick={() => void startZip()}
                  loading={job?.kind === 'zip'}
                  disabled={busy || !chosen.length}
                  icon={<Download className="h-3.5 w-3.5" />}
                >
                  Download ZIP
                </Button>
              }
            />

            <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <Field
                label="Filename template"
                hint="Use tokens to keep names stable and sortable. Extensions are preserved."
              >
                <TextInput
                  value={filenameTemplate}
                  onChange={(event) => setFilenameTemplate(event.target.value)}
                  placeholder="{date}-{name}"
                  spellCheck={false}
                />
                <div className="mt-2 flex flex-wrap gap-1">
                  {TEMPLATE_TOKENS.map((token) => (
                    <Chip key={token} onClick={() => appendToken(token)} title={`Insert ${token}`}>
                      {token}
                    </Chip>
                  ))}
                </div>
              </Field>

              <div className="space-y-2.5">
                <ToggleRow
                  checked={categoryFolders}
                  onChange={setCategoryFolders}
                  label="Category folders"
                  description="Sort files into ceremony/, portraits/, couple/ and so on."
                />
                <ToggleRow
                  checked={includeManifest}
                  onChange={setIncludeManifest}
                  label="Include JSON manifest"
                  description="A portable record of metadata, scores and selection state."
                />
                <ToggleRow
                  checked={includeCsv}
                  onChange={setIncludeCsv}
                  label="Include CSV index"
                  description="A spreadsheet-friendly list for the studio or couple."
                />
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-line bg-raised/60 p-3">
              <p className="flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-faint">
                <FileText className="h-3 w-3" /> Name preview
              </p>
              {sampleNames.length ? (
                <ul className="mt-2 space-y-1">
                  {sampleNames.map((name, index) => (
                    <li key={`${name}-${index}`} className="truncate font-mono text-[10.5px] text-soft">
                      {name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[10.5px] text-faint">Choose a scope with photographs to preview filenames.</p>
              )}
            </div>

            {missingOriginals > 0 ? (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-accent/25 bg-accent-soft/40 p-3 text-[10.5px] leading-relaxed text-soft">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                <span>
                  {formatCount(missingOriginals)} photographs have no stored original. The ZIP will use the stored
                  preview for those frames. Relink originals below for full resolution.
                </span>
              </div>
            ) : (
              <p className="mt-3 flex items-center gap-2 text-[10.5px] text-success">
                <CheckCircle2 className="h-3.5 w-3.5" /> Every frame in this scope has a full-resolution original.
              </p>
            )}
          </Card>

          <div className="grid gap-5 md:grid-cols-2">
            <Card className="flex flex-col p-5">
              <p className="flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-faint">
                <Printer className="h-3 w-3" /> Contact sheet
              </p>
              <h3 className="display mt-2 text-xl text-ink">Review on paper</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-soft">
                A4 landscape pages with filenames and quality scores — useful for a final read-through.
              </p>
              <div className="mt-3">
                <Field label="Columns per page">
                  <Select
                    value={contactColumns}
                    onChange={(event) => setContactColumns(Number(event.target.value))}
                  >
                    {[3, 4, 5, 6].map((value) => (
                      <option key={value} value={value}>
                        {value} columns
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="mt-auto pt-0"
                onClick={() => void startContactSheet()}
                loading={job?.kind === 'contact'}
                disabled={busy || !chosen.length}
                icon={<Download className="h-3.5 w-3.5" />}
              >
                Export contact sheet
              </Button>
            </Card>

            <Card className="flex flex-col p-5">
              <p className="flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-faint">
                <BookOpen className="h-3 w-3" /> Album PDF
              </p>
              <h3 className="display mt-2 text-xl text-ink">The keepsake</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-soft">
                {album.title || 'Untitled album'} · {formatCount(albumPhotos.length)} selected · {formatBytes(albumBytes)}
              </p>
              <div className="mt-3">
                <SegmentedControl
                  size="sm"
                  className="w-full"
                  value={albumLayout}
                  onChange={setAlbumLayout}
                  options={[
                    { value: 'two-up', label: 'Two per page' },
                    { value: 'one-up', label: 'One per page' },
                  ]}
                />
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="mt-auto"
                onClick={() => void startAlbumPdf()}
                loading={job?.kind === 'album'}
                disabled={busy || !albumPhotos.length}
                icon={<Download className="h-3.5 w-3.5" />}
              >
                {albumPhotos.length ? 'Export album PDF' : 'Select album frames first'}
              </Button>
            </Card>
          </div>

          <Card className="p-5">
            <SectionHeading
              eyebrow="03 · Hand off"
              title="Documents and delivery"
              description="A report for the studio, a manifest for another tool, or a clean sheet for the couple."
            />
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <DocumentButton
                icon={<FileSpreadsheet className="h-4 w-4" />}
                title="Library CSV"
                description="Metadata, people, scores and flags in a spreadsheet."
                onClick={() => exportDocuments('csv')}
                disabled={!chosen.length}
              />
              <DocumentButton
                icon={<FileJson className="h-4 w-4" />}
                title="JSON manifest"
                description="A complete, portable record of this selection."
                onClick={() => exportDocuments('json')}
                disabled={!chosen.length}
              />
              <DocumentButton
                icon={<FileText className="h-4 w-4" />}
                title="Handoff sheet"
                description="Printable HTML with filenames, people, marks and notes."
                onClick={() => exportDocuments('handoff')}
                disabled={!chosen.length}
              />
              <DocumentButton
                icon={<FileText className="h-4 w-4" />}
                title="Library report PDF"
                description="Coverage, people, moments and an album index."
                onClick={() => void startReport()}
                disabled={busy || !chosen.length}
                busy={job?.kind === 'report'}
              />
            </div>
          </Card>

          <Card className="p-5">
            <SectionHeading
              eyebrow="Studio details"
              title="What the handoff says"
              description="These details appear on the handoff sheet, report and album notes page."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void saveDetails()}
                  disabled={detailsSaved}
                >
                  {detailsSaved ? 'Saved' : 'Save details'}
                </Button>
              }
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Photographer or studio">
                <TextInput
                  value={details.photographerName}
                  onChange={(event) => {
                    setDetailsSaved(false);
                    setDetails((current) => ({ ...current, photographerName: event.target.value }));
                  }}
                  placeholder="e.g. Fern & Field Studio"
                />
              </Field>
              <Field label="Contact">
                <TextInput
                  value={details.photographerContact}
                  onChange={(event) => {
                    setDetailsSaved(false);
                    setDetails((current) => ({ ...current, photographerContact: event.target.value }));
                  }}
                  placeholder="email or phone"
                />
              </Field>
              <Field
                label="Handoff notes"
                className="sm:col-span-2"
                hint="Printed on the report and handoff sheet. A short delivery note works well."
              >
                <TextArea
                  value={details.handoffNotes}
                  onChange={(event) => {
                    setDetailsSaved(false);
                    setDetails((current) => ({ ...current, handoffNotes: event.target.value }));
                  }}
                  placeholder="Delivery notes, credit line, or a note for the couple…"
                  rows={3}
                />
              </Field>
            </div>
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-[76px] lg:self-start">
          <Card className="overflow-hidden">
            <div className="border-b border-line bg-accent-soft/40 px-4 py-3">
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-accent">Ready to deliver</p>
              <p className="display mt-1 text-2xl text-ink">{formatCount(chosen.length)} photographs</p>
            </div>
            <div className="space-y-2 p-4 text-[11px] text-soft">
              <SummaryRow label="Scope" value={SCOPES.find((item) => item.id === scope)?.label ?? scope} />
              <SummaryRow label="Approximate size" value={formatBytes(chosenBytes)} />
              <SummaryRow label="Stored originals" value={`${formatCount(originalsAvailable)} of ${formatCount(chosen.length)}`} />
              <SummaryRow label="Album selection" value={`${formatCount(albumPhotos.length)} frames`} />
              <SummaryRow label="Favourites" value={formatCount(favouritePhotos.length)} />
              <SummaryRow label="People tagged" value={formatCount(people.length)} />
              <SummaryRow label="Moments" value={formatCount(events.length)} />
              {missingOriginals ? (
                <div className="mt-1 flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-soft/50 p-2.5 text-[10.5px] leading-relaxed text-danger">
                  <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Exporting now will substitute previews for {formatCount(missingOriginals)} frames.
                  </span>
                </div>
              ) : null}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-faint">
                <Link2 className="h-3 w-3" /> Relink originals
              </p>
              <span className="text-[9.5px] tabular-nums text-faint">
                {formatCount(globalOriginalsAvailable)}/{formatCount(photos.length)}
              </span>
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-soft">
              Reconnect the original files after clearing browser data or moving to another computer. Ivory matches them by
              content hash, never by filename.
            </p>

            {relinking ? (
              <div className="mt-3 rounded-lg border border-accent/25 bg-accent-soft/40 p-2.5">
                <div className="flex items-center gap-2 text-[10.5px] font-medium text-accent">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Matching originals
                </div>
                <ProgressBar
                  className="mt-2"
                  value={relinkProgress?.done ?? 0}
                  max={Math.max(1, relinkProgress?.total ?? 1)}
                />
                <p className="mt-1.5 truncate text-[9.5px] text-faint">
                  {relinkProgress?.currentName || 'Reading files…'} · {formatCount(relinkProgress?.matched ?? 0)} matched
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1"
                  onClick={() => relinkAbort.current?.abort()}
                >
                  Stop
                </Button>
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<FolderOpen className="h-3.5 w-3.5" />}
                  onClick={() => void chooseOriginals(false)}
                  disabled={!globalMissingOriginals}
                >
                  Choose original files
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<FolderOpen className="h-3.5 w-3.5" />}
                  onClick={() => void chooseOriginals(true)}
                  disabled={!globalMissingOriginals}
                >
                  Choose a folder
                </Button>
              </div>
            )}

            {relinkResult && !relinking ? (
              <div className="mt-3 space-y-1 rounded-lg border border-line bg-raised/60 p-2.5 text-[10px] text-soft">
                <p className="flex items-center justify-between gap-2">
                  <span className="text-success">Matched</span>
                  <span className="tabular-nums">{formatCount(relinkResult.matched)}</span>
                </p>
                <p className="flex items-center justify-between gap-2">
                  <span>Unmatched files</span>
                  <span className="tabular-nums">{formatCount(relinkResult.unmatched)}</span>
                </p>
                {relinkResult.failed ? (
                  <p className="flex items-center justify-between gap-2 text-danger">
                    <span>Could not read</span>
                    <span className="tabular-nums">{formatCount(relinkResult.failed)}</span>
                  </p>
                ) : null}
                {relinkResult.cancelled ? <p className="text-faint">Stopped early.</p> : null}
              </div>
            ) : null}

            {!globalMissingOriginals && photos.length ? (
              <p className="mt-3 flex items-center gap-2 text-[10px] text-success">
                <CheckCircle2 className="h-3.5 w-3.5" /> All originals are linked.
              </p>
            ) : null}
          </Card>

          <Card className="p-4">
            <p className="flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-faint">
              <HardDrive className="h-3 w-3" /> Storage & safety
            </p>
            <div className="mt-2 space-y-1.5 text-[10.5px] leading-relaxed text-soft">
              <p>
                ZIP archives stream directly from IndexedDB. Large exports may ask where to save the file; nothing is
                uploaded.
              </p>
              <p>
                Previews stand in only when an original is unavailable. A manifest records exactly what was exported.
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Chip tone="success">Local only</Chip>
              <Chip>No account</Chip>
              <Chip>Originals never overwritten</Chip>
            </div>
            {missingOriginals > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="mt-3 w-full"
                onClick={() => navigate('/settings')}
              >
                Manage stored originals
              </Button>
            ) : null}
          </Card>

          <Card className="border-success/20 bg-success-soft/30 p-4">
            <p className="flex items-center gap-2 text-[11px] font-medium text-ink">
              <ShieldCheck className="h-3.5 w-3.5 text-success" /> Nothing is deleted
            </p>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-soft">
              Exporting never removes a photograph, preview or selection. Rejected frames stay in the library unless you
              choose to delete the project.
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line/60 pb-1.5 last:border-0 last:pb-0">
      <span className="text-faint">{label}</span>
      <span className="text-right font-medium text-ink">{value}</span>
    </div>
  );
}

function ToggleRow({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-line bg-surface px-2.5 py-2 transition-colors hover:border-accent/30">
      <span className="min-w-0">
        <span className="block text-[11.5px] font-medium text-ink">{label}</span>
        <span className="mt-0.5 block text-[10px] leading-relaxed text-faint">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--accent))]"
      />
    </label>
  );
}

function DocumentButton({
  icon,
  title,
  description,
  onClick,
  disabled,
  busy,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3 text-left transition-all hover:border-accent/40 hover:bg-raised/60 disabled:cursor-not-allowed disabled:opacity-55"
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[11.5px] font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-[10px] leading-relaxed text-faint">{description}</span>
      </span>
    </button>
  );
}
