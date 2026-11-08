import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  ImageOff,
  LayoutTemplate,
  Loader2,
  Pencil,
  Printer,
  X,
} from 'lucide-react';
import type { AlbumDraft, Photo, Project } from '@/types';
import { useAppStore } from '@/store/appStore';
import { usePreviewUrl } from '@/hooks/useApp';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProjectGate } from '@/components/ProjectGate';
import { PhotoLightbox } from '@/components/PhotoLightbox';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ProgressBar,
  SegmentedControl,
} from '@/components/ui';
import { ALBUM_CATEGORIES } from '@/lib/constants';
import { groupAlbumPhotos } from '@/lib/exporter';
import { formatCount, formatDate, percent } from '@/lib/utils';
import {
  ExportCancelled,
  exportAlbumPdf,
  type ExportProgress,
} from '@/lib/exporter';

type PreviewPage =
  | { kind: 'cover' }
  | { kind: 'photos'; photos: Photo[] }
  | { kind: 'notes' };

type Layout = 'two-up' | 'one-up';

const CATEGORY_LABEL = new Map(ALBUM_CATEGORIES.map((category) => [category.id, category.label]));

export function AlbumPreviewPage() {
  return (
    <ProjectGate feature="the album preview">
      <AlbumPreviewWorkspace />
    </ProjectGate>
  );
}

function AlbumPreviewWorkspace() {
  const project = useAppStore((state) => state.project)!;
  const photos = useAppStore((state) => state.photos);
  const album = useAppStore((state) => state.album);
  const pushToast = useAppStore((state) => state.pushToast);
  const navigate = useNavigate();

  const [layout, setLayout] = useState<Layout>(() => {
    try {
      return localStorage.getItem('ivory.albumLayout') === 'one-up' ? 'one-up' : 'two-up';
    } catch {
      return 'two-up';
    }
  });
  const [pageIndex, setPageIndex] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const selected = useMemo(() => photos.filter((photo) => photo.selected), [photos]);
  const ordered = useMemo(() => {
    const order = [
      ...album.categories,
      ...ALBUM_CATEGORIES.map((category) => category.id).filter(
        (id) => !album.categories.includes(id),
      ),
    ];
    return groupAlbumPhotos(selected, order).flatMap((group) => group.photos);
  }, [selected, album.categories]);

  const pages = useMemo<PreviewPage[]>(() => {
    const result: PreviewPage[] = [{ kind: 'cover' }];
    const perPage = layout === 'two-up' ? 2 : 1;
    for (let index = 0; index < ordered.length; index += perPage) {
      result.push({ kind: 'photos', photos: ordered.slice(index, index + perPage) });
    }
    if (album.notes.trim()) result.push({ kind: 'notes' });
    return result;
  }, [ordered, layout, album.notes]);

  useEffect(() => {
    setPageIndex((current) => Math.min(current, Math.max(0, pages.length - 1)));
  }, [pages.length]);

  useEffect(() => {
    try {
      localStorage.setItem('ivory.albumLayout', layout);
    } catch {
      // Layout is a convenience; the album itself is unaffected.
    }
  }, [layout]);

  const page = pages[pageIndex] ?? pages[0];
  const contentPages = Math.max(0, pages.length - 1 - (album.notes.trim() ? 1 : 0));
  const photosOnPage = page?.kind === 'photos' ? page.photos : [];

  const go = (next: number) => {
    setPageIndex(Math.max(0, Math.min(pages.length - 1, next)));
  };

  useEffect(() => {
    if (lightbox !== null) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        setPageIndex((current) => Math.max(0, current - 1));
      } else if (event.key === 'ArrowRight') {
        setPageIndex((current) => Math.min(pages.length - 1, current + 1));
      } else if (event.key === 'Home') {
        setPageIndex(0);
      } else if (event.key === 'End') {
        setPageIndex(Math.max(0, pages.length - 1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pages.length, lightbox]);

  const startExport = async () => {
    if (!ordered.length || exporting) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setExporting(true);
    setProgress(null);
    try {
      await exportAlbumPdf(project, ordered, {
        title: album.title || project.name,
        subtitle: album.subtitle,
        notes: album.notes.trim() || undefined,
        layout,
        signal: controller.signal,
        onProgress: setProgress,
      });
      pushToast({
        title: 'Album PDF exported',
        description: `${formatCount(ordered.length)} photographs · A4 landscape · generated on this device.`,
        tone: 'success',
        duration: 5200,
      });
    } catch (error) {
      if (error instanceof ExportCancelled) {
        pushToast({ title: 'Album export cancelled', description: 'No file was saved.', tone: 'default' });
      } else {
        pushToast({
          title: 'Album export failed',
          description: error instanceof Error ? error.message : 'The PDF could not be generated.',
          tone: 'danger',
        });
      }
    } finally {
      abortRef.current = null;
      setExporting(false);
      setProgress(null);
    }
  };

  if (!selected.length) {
    return (
      <div className="animate-fade-up">
        <PageHeader
          eyebrow="Album preview"
          title="See the story take shape"
          description="Preview the album as a printed page, move through it, and export a print-ready PDF."
        />
        <EmptyState
          icon={<BookOpen className="h-5 w-5" />}
          title="No photographs in the album yet"
          description="Build a proposal in Album, then apply the frames you want. The preview mirrors the PDF layout."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="primary" onClick={() => navigate('/album')}>Build the album</Button>
              <Button variant="secondary" onClick={() => navigate('/library')}>Open library</Button>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-up pb-12">
      <PageHeader
        eyebrow="Album preview"
        title="See the story take shape"
        description="A print-calibrated preview of the applied selection. Move through the pages, change the layout, and export a local PDF."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Pencil className="h-4 w-4" />}
              onClick={() => navigate('/album')}
            >
              Edit selection
            </Button>
            <Button
              variant="primary"
              icon={exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              onClick={() => void startExport()}
              disabled={exporting || !ordered.length}
            >
              {exporting ? 'Rendering PDF' : 'Export album PDF'}
            </Button>
          </>
        }
      >
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <Chip tone="accent">{formatCount(ordered.length)} photographs</Chip>
          <Chip>{formatCount(contentPages)} {contentPages === 1 ? 'page' : 'pages'} + cover</Chip>
          <Chip tone="success">A4 landscape</Chip>
          <Chip>{layout === 'two-up' ? 'Two per page' : 'One per page'}</Chip>
        </div>
      </PageHeader>

      {exporting ? (
        <Card className="mb-5 border-accent/30 bg-accent-soft/30 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
            <p className="text-[12px] font-medium text-ink">Rendering the album PDF</p>
            <span className="text-[10.5px] tabular-nums text-faint">
              {formatCount(progress?.done ?? 0)} of {formatCount(progress?.total ?? ordered.length)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => abortRef.current?.abort()}
            >
              Cancel
            </Button>
          </div>
          <ProgressBar
            className="mt-3"
            value={progress?.done ?? 0}
            max={Math.max(1, progress?.total ?? ordered.length)}
          />
          <p className="mt-1.5 truncate text-[10.5px] text-faint">
            {progress?.currentName ?? 'Preparing preview images at print resolution…'}
          </p>
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_310px]">
        <div className="min-w-0">
          <div className="relative">
            <div className="mx-auto max-w-[1040px] px-10 sm:px-14">
              <div className="rounded-lg shadow-lift">
                {page?.kind === 'cover' ? (
                  <CoverPage project={project} album={album} contentPages={contentPages} />
                ) : page?.kind === 'notes' ? (
                  <NotesPage project={project} album={album} photos={ordered} />
                ) : (
                  <PhotoPage
                    photos={photosOnPage}
                    layout={layout}
                    album={album}
                    project={project}
                    pageNumber={pageIndex}
                  />
                )}
              </div>
            </div>

            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center">
              <button
                type="button"
                onClick={() => go(pageIndex - 1)}
                disabled={pageIndex <= 0}
                className="pointer-events-auto flex h-10 w-10 -translate-x-1 items-center justify-center rounded-full border border-line bg-surface/90 text-soft shadow-soft backdrop-blur transition-all hover:border-accent/40 hover:text-ink disabled:opacity-30 sm:-translate-x-2"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4.5 w-4.5" />
              </button>
            </div>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center">
              <button
                type="button"
                onClick={() => go(pageIndex + 1)}
                disabled={pageIndex >= pages.length - 1}
                className="pointer-events-auto flex h-10 w-10 translate-x-1 items-center justify-center rounded-full border border-line bg-surface/90 text-soft shadow-soft backdrop-blur transition-all hover:border-accent/40 hover:text-ink disabled:opacity-30 sm:translate-x-2"
                aria-label="Next page"
              >
                <ChevronRight className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>

          <div className="mx-auto mt-4 flex max-w-[1040px] flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-ink">
                {page?.kind === 'cover'
                  ? 'Cover'
                  : page?.kind === 'notes'
                    ? 'Notes & credits'
                    : `Page ${pageIndex} of ${contentPages}`}
              </span>
              {page?.kind === 'photos' ? (
                <span className="text-[10px] text-faint">
                  {page.photos.map((photo) => photo.category ? CATEGORY_LABEL.get(photo.category) ?? photo.category : 'Unfiled').join(' · ')}
                </span>
              ) : null}
            </div>
            <span className="text-[10px] text-faint">Use ← → to turn pages</span>
          </div>

          <div className="mx-auto mt-4 flex max-w-[1040px] items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink/[.07]">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-300"
                style={{ width: `${percent(pageIndex + 1, pages.length)}%` }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-faint">{pageIndex + 1} / {pages.length}</span>
          </div>

          {photosOnPage.length && page?.kind === 'photos' ? (
            <div className="mx-auto mt-5 flex max-w-[1040px] justify-center gap-2">
              {page.photos.map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => {
                    const index = ordered.findIndex((item) => item.id === photo.id);
                    if (index >= 0) setLightbox(index);
                  }}
                  className="rounded-full border border-line bg-surface px-3 py-1.5 text-[10.5px] text-soft transition-colors hover:border-accent/40 hover:text-ink"
                >
                  Inspect {photo.name.length > 34 ? `${photo.name.slice(0, 33)}…` : photo.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-[76px] xl:self-start">
          <Card className="p-4">
            <p className="flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-faint">
              <LayoutTemplate className="h-3 w-3" /> Page layout
            </p>
            <div className="mt-3">
              <SegmentedControl
                value={layout}
                onChange={setLayout}
                className="w-full"
                options={[
                  { value: 'two-up', label: 'Two per page' },
                  { value: 'one-up', label: 'One per page' },
                ]}
              />
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-faint">
              Two per page suits a story album. One per page gives every frame a full page.
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-faint">Pages</p>
              <span className="text-[9.5px] text-faint">{formatCount(pages.length)} total</span>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {pages.map((item, index) => (
                <PageChip
                  key={`${item.kind}-${index}`}
                  page={item}
                  index={index}
                  active={index === pageIndex}
                  onClick={() => setPageIndex(index)}
                />
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-faint">Album details</p>
            <p className="display mt-2 text-lg leading-tight text-ink">{album.title || project.name}</p>
            {album.subtitle ? <p className="mt-1 text-[11px] text-soft">{album.subtitle}</p> : null}
            <div className="mt-3 space-y-1.5 border-t border-line pt-3 text-[10.5px] text-faint">
              <p>{formatCount(ordered.length)} photographs</p>
              <p>{formatCount(contentPages)} content {contentPages === 1 ? 'page' : 'pages'}</p>
              <p>{project.eventDate ? formatDate(Date.parse(`${project.eventDate}T12:00:00`)) : 'Date not set'}</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3 w-full"
              icon={<Pencil className="h-3.5 w-3.5" />}
              onClick={() => navigate('/album')}
            >
              Edit title and notes
            </Button>
          </Card>

          <Card className="p-4">
            <p className="flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-faint">
              <Printer className="h-3 w-3" /> Print-ready PDF
            </p>
            <p className="mt-2 text-[10.5px] leading-relaxed text-soft">
              A4 landscape, image-safe margins and a cover. Generated entirely in your browser — no upload.
            </p>
            <Button
              variant="gold"
              size="sm"
              className="mt-3 w-full"
              icon={exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              onClick={() => void startExport()}
              disabled={exporting}
            >
              {exporting ? 'Rendering…' : 'Download PDF'}
            </Button>
            <p className="mt-2 text-center text-[9px] text-faint">
              {formatCount(ordered.length)} images · {contentPages} pages
            </p>
          </Card>

          <Card className="border-accent/20 bg-accent-soft/25 p-4">
            <p className="flex items-center gap-2 text-[11px] font-medium text-ink">
              <FileText className="h-3.5 w-3.5 text-accent" /> A preview, not a commitment
            </p>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-soft">
              Changing the selection in Album updates this preview immediately. PDFs are snapshots — your library and originals are untouched.
            </p>
          </Card>
        </aside>
      </div>

      {lightbox !== null && ordered[lightbox] ? (
        <PhotoLightbox
          photos={ordered}
          index={lightbox}
          onIndexChange={setLightbox}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </div>
  );
}

function PageChip({
  page,
  index,
  active,
  onClick,
}: {
  page: PreviewPage;
  index: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex aspect-[4/3] flex-col items-center justify-center rounded-md border text-[9px] font-medium transition-all',
        active
          ? 'border-accent bg-accent-soft text-accent shadow-sm'
          : 'border-line bg-raised/60 text-faint hover:border-accent/30 hover:text-soft',
      )}
      aria-label={`Go to page ${index + 1}`}
    >
      {page.kind === 'cover' ? (
        <>
          <BookOpen className="h-3 w-3" />
          <span className="mt-0.5">Cover</span>
        </>
      ) : page.kind === 'notes' ? (
        <>
          <FileText className="h-3 w-3" />
          <span className="mt-0.5">Notes</span>
        </>
      ) : (
        <>
          <span className="tabular-nums">{String(index).padStart(2, '0')}</span>
          <span className="mt-0.5 text-[8px] opacity-70">{page.photos.length} img</span>
        </>
      )}
    </button>
  );
}

function CoverPage({
  project,
  album,
  contentPages,
}: {
  project: Project;
  album: AlbumDraft;
  contentPages: number;
}) {
  const date = project.eventDate ? Date.parse(`${project.eventDate}T12:00:00`) : null;
  return (
    <div className="relative flex aspect-[297/210] w-full flex-col items-center justify-center overflow-hidden rounded-lg bg-[#1d1a17] px-[8%] text-center text-[#f7f3eb]">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[#b08d57]/15 blur-3xl" />
        <div className="absolute -bottom-32 -right-20 h-80 w-80 rounded-full bg-[#b08d57]/10 blur-3xl" />
      </div>
      <div className="relative">
        <p className="text-[8px] font-semibold uppercase tracking-[0.32em] text-[#c9a66b] sm:text-[9px]">
          Ivory · Private album
        </p>
        <h1 className="display mt-[4%] text-[clamp(26px,5.8vw,64px)] leading-[1.02] tracking-[-0.02em]">
          {album.title || project.coupleNames || project.name}
        </h1>
        {album.subtitle ? (
          <p className="mx-auto mt-[3%] max-w-[80%] text-[clamp(9px,1.55vw,15px)] leading-relaxed text-[#c6bfb4]">
            {album.subtitle}
          </p>
        ) : null}
        <div className="mx-auto mt-[7%] h-px w-16 bg-[#c9a66b]/50" />
        <p className="mt-[5%] text-[clamp(7px,1vw,10px)] uppercase tracking-[0.2em] text-[#9e968a]">
          {[date ? formatDate(date) : '', project.venue, `${contentPages} pages`].filter(Boolean).join(' · ')}
        </p>
      </div>
      <span className="absolute bottom-[6%] left-[6%] text-[8px] uppercase tracking-[0.18em] text-[#776f64]">
        {project.coupleNames || project.name}
      </span>
      <span className="absolute bottom-[6%] right-[6%] text-[8px] tabular-nums text-[#776f64]">Cover</span>
    </div>
  );
}

function PhotoPage({
  photos,
  layout,
  album,
  project,
  pageNumber,
}: {
  photos: Photo[];
  layout: Layout;
  album: AlbumDraft;
  project: Project;
  pageNumber: number;
}) {
  return (
    <div className="relative aspect-[297/210] w-full overflow-hidden rounded-lg bg-[#f7f4ee] p-[2.8%] shadow-lift">
      <div className={clsx('flex h-full w-full gap-[2%]', layout === 'one-up' && 'gap-0')}>
        {photos.map((photo) => (
          <PagePhoto key={photo.id} photo={photo} single={layout === 'one-up'} />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-[2.8%] bottom-[1.4%] flex items-center justify-between">
        <span className="max-w-[55%] truncate text-[7.5px] uppercase tracking-[0.16em] text-[#928a7e]">
          {photos
            .map((photo) => (photo.category ? CATEGORY_LABEL.get(photo.category) ?? photo.category : 'Unfiled'))
            .filter((value, index, array) => array.indexOf(value) === index)
            .join(' · ')}
        </span>
        <span className="text-[7.5px] uppercase tracking-[0.16em] text-[#a39a8d]">
          {album.title || project.name}
        </span>
        <span className="ml-4 text-[7.5px] tabular-nums text-[#928a7e]">{pageNumber}</span>
      </div>
    </div>
  );
}

function PagePhoto({ photo, single }: { photo: Photo; single: boolean }) {
  const url = usePreviewUrl(photo.id);
  return (
    <div className={clsx('flex min-w-0 flex-1 items-center justify-center border border-[#e2dbcf] bg-white p-[1.4%]', single ? 'p-[1%]' : '')}>
      {url ? (
        <img
          src={url}
          alt={photo.name}
          draggable={false}
          className="h-full w-full select-none object-contain"
          loading="eager"
        />
      ) : (
        <span className="flex flex-col items-center gap-1 text-[#b7ad9f]">
          <ImageOff className="h-4 w-4" />
          <span className="text-[8px]">Preview unavailable</span>
        </span>
      )}
    </div>
  );
}

function NotesPage({
  project,
  album,
  photos,
}: {
  project: Project;
  album: AlbumDraft;
  photos: Photo[];
}) {
  return (
    <div className="relative flex aspect-[297/210] w-full flex-col overflow-hidden rounded-lg bg-[#f7f4ee] p-[7%] text-[#3a352f] shadow-lift">
      <p className="text-[7.5px] font-semibold uppercase tracking-[0.24em] text-[#b08d57]">Notes & credits</p>
      <h2 className="display mt-[2%] text-[clamp(20px,3.2vw,36px)] leading-tight">
        {album.title || project.coupleNames || project.name}
      </h2>
      <div className="mt-[4%] grid flex-1 grid-cols-[1.4fr_1fr] gap-[7%]">
        <div>
          <p className="max-h-[70%] overflow-hidden whitespace-pre-wrap text-[clamp(8px,1.15vw,11px)] leading-relaxed text-[#5f574d]">
            {album.notes || project.handoffNotes || 'A private collection of photographs from the day.'}
          </p>
        </div>
        <div className="space-y-[4%] border-l border-[#e2dbcf] pl-[7%] text-[clamp(7px,0.95vw,9px)] leading-relaxed text-[#7a7166]">
          {project.photographerName ? (
            <div>
              <p className="text-[7px] uppercase tracking-[0.16em] text-[#a49a8c]">Photography</p>
              <p className="mt-0.5">{project.photographerName}</p>
              {project.photographerContact ? <p>{project.photographerContact}</p> : null}
            </div>
          ) : null}
          <div>
            <p className="text-[7px] uppercase tracking-[0.16em] text-[#a49a8c]">Collection</p>
            <p className="mt-0.5">{photos.length} photographs</p>
            {project.venue ? <p>{project.venue}</p> : null}
          </div>
          <div>
            <p className="text-[7px] uppercase tracking-[0.16em] text-[#a49a8c]">Made with</p>
            <p className="mt-0.5">Ivory · private, local curation</p>
          </div>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between border-t border-[#e2dbcf] pt-[2%] text-[7px] uppercase tracking-[0.16em] text-[#a49a8c]">
        <span>{project.coupleNames || project.name}</span>
        <span>Notes</span>
      </div>
    </div>
  );
}
