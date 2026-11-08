import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  Archive,
  CheckCircle2,
  CircleAlert,
  FileImage,
  FolderOpen,
  ImagePlus,
  Info,
  Loader2,
  Pause,
  Play,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProjectGate } from '@/components/ProjectGate';
import { Button, Card, Chip, ProgressBar } from '@/components/ui';
import {
  collectFromDataTransfer,
  collectFromFileList,
  pickFiles,
  type CollectedSources,
  type IngestResult,
} from '@/lib/import';
import { formatBytes, formatCount, formatDuration } from '@/lib/utils';

const EMPTY: CollectedSources = { files: [], zips: [], skipped: 0, errors: [] };

function mergeSources(current: CollectedSources, next: CollectedSources): CollectedSources {
  return {
    files: [...current.files, ...next.files],
    zips: [...current.zips, ...next.zips],
    skipped: current.skipped + next.skipped,
    errors: [...current.errors, ...next.errors],
  };
}

export function ImportPage() {
  return (
    <ProjectGate feature="importing">
      <ImportWorkspace />
    </ProjectGate>
  );
}

function ImportWorkspace() {
  const project = useAppStore((state) => state.project)!;
  const importSources = useAppStore((state) => state.importSources);
  const importActive = useAppStore((state) => state.importActive);
  const importProgress = useAppStore((state) => state.importProgress);
  const cancelImport = useAppStore((state) => state.cancelImport);
  const processing = useAppStore((state) => state.processing);
  const pauseProcessing = useAppStore((state) => state.pauseProcessing);
  const resumeProcessing = useAppStore((state) => state.resumeProcessing);
  const cancelProcessing = useAppStore((state) => state.cancelProcessing);
  const updateProject = useAppStore((state) => state.updateProject);
  const navigate = useNavigate();

  const [sources, setSources] = useState<CollectedSources>(EMPTY);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const dragCounter = useRef(0);

  const totalBytes = useMemo(
    () => sources.files.reduce((sum, item) => sum + item.blob.size, 0) + sources.zips.reduce((sum, zip) => sum + zip.size, 0),
    [sources],
  );
  const totalCount = sources.files.length + sources.zips.length;

  const addSources = useCallback((next: CollectedSources) => {
    setResult(null);
    setSources((current) => mergeSources(current, next));
  }, []);

  const chooseFiles = async () => {
    const files = await pickFiles({ accept: 'image/*' });
    if (files.length) addSources(collectFromFileList(files));
  };
  const chooseFolder = async () => {
    const files = await pickFiles({ directory: true, accept: 'image/*' });
    if (files.length) addSources(collectFromFileList(files));
  };
  const chooseZip = async () => {
    const files = await pickFiles({ accept: '.zip,application/zip' });
    if (files.length) addSources(collectFromFileList(files));
  };

  const runImport = async () => {
    if (importActive || !totalCount) return;
    const outcome = await importSources(sources);
    setResult(outcome ?? null);
    if (outcome?.stats.imported) setSources(EMPTY);
  };

  const importPct = importProgress.totalFiles
    ? Math.round((importProgress.processed / importProgress.totalFiles) * 100)
    : 0;
  const processPct = processing.total ? Math.round((processing.completed / processing.total) * 100) : 0;
  const busy = importActive || processing.running;

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Import"
        title="Bring the whole day in"
        description="Drop photographs, a folder or ZIP archives. Ivory reads EXIF, fingerprints each file and starts local analysis. Nothing is uploaded."
        actions={
          <Button variant="secondary" onClick={() => navigate('/library')}>Open library</Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
        <div className="space-y-5">
          <div
            onDragEnter={(event) => {
              event.preventDefault();
              dragCounter.current += 1;
              setDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              dragCounter.current -= 1;
              if (dragCounter.current <= 0) setDragging(false);
            }}
            onDrop={async (event) => {
              event.preventDefault();
              dragCounter.current = 0;
              setDragging(false);
              if (busy) return;
              const collected = await collectFromDataTransfer(event.dataTransfer);
              addSources(collected);
            }}
            className={clsx(
              'relative overflow-hidden rounded-xl2 border-2 border-dashed bg-surface/60 p-8 text-center transition-all sm:p-12',
              dragging ? 'scale-[1.005] border-accent bg-accent-soft/50 shadow-lift' : 'border-line hover:border-accent/40',
              busy && 'pointer-events-none opacity-60',
            )}
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-60"
              style={{ background: 'radial-gradient(circle at 50% 0%, rgb(var(--accent) / .07), transparent 60%)' }}
            />
            <div className="relative">
              <div className={clsx('mx-auto flex h-16 w-16 items-center justify-center rounded-full transition-transform', dragging ? 'scale-110 bg-accent text-accent-ink' : 'bg-accent-soft text-accent')}>
                {dragging ? <UploadCloud className="h-7 w-7" /> : <ImagePlus className="h-7 w-7" />}
              </div>
              <h2 className="display mt-5 text-2xl text-ink">
                {dragging ? 'Release to add photographs' : 'Drop photographs or folders here'}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-[12.5px] leading-relaxed text-soft">
                JPEG, PNG, WebP, AVIF, GIF and BMP, or ZIP archives. Folder structure and capture dates are preserved.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                <Button variant="primary" icon={<FileImage className="h-4 w-4" />} onClick={() => void chooseFiles()}>Choose files</Button>
                <Button variant="secondary" icon={<FolderOpen className="h-4 w-4" />} onClick={() => void chooseFolder()}>Choose folder</Button>
                <Button variant="secondary" icon={<Archive className="h-4 w-4" />} onClick={() => void chooseZip()}>Add ZIP</Button>
              </div>
              <p className="mt-4 text-[10px] text-faint">Safety limits: 30,000 files · 30 GB archive · nothing leaves this device</p>
            </div>
          </div>

          {totalCount ? (
            <Card className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-faint">Ready to import</p>
                  <p className="display mt-1 text-2xl text-ink">
                    {formatCount(sources.files.length)} photographs
                    {sources.zips.length ? ` + ${formatCount(sources.zips.length)} archive${sources.zips.length === 1 ? '' : 's'}` : ''}
                  </p>
                  <p className="mt-1 text-[11px] text-faint">
                    {formatBytes(totalBytes)} · {sources.skipped ? `${sources.skipped} unsupported files will be skipped` : 'All files look supported'}
                  </p>
                </div>
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-faint hover:bg-ink/[.05] hover:text-ink"
                  onClick={() => setSources(EMPTY)}
                  aria-label="Clear selection"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-line bg-raised/50 p-2">
                {sources.files.slice(0, 60).map((file, index) => (
                  <div key={`${file.path}-${index}`} className="flex items-center gap-2 rounded px-1.5 py-1 text-[10.5px]">
                    <FileImage className="h-3 w-3 shrink-0 text-faint" />
                    <span className="min-w-0 flex-1 truncate text-soft">{file.path}</span>
                    <span className="shrink-0 tabular-nums text-faint">{formatBytes(file.blob.size)}</span>
                  </div>
                ))}
                {sources.files.length > 60 ? (
                  <p className="px-1.5 py-1 text-[10px] text-faint">…and {formatCount(sources.files.length - 60)} more photographs</p>
                ) : null}
                {sources.zips.map((zip, index) => (
                  <div key={`${zip.name}-${index}`} className="flex items-center gap-2 rounded px-1.5 py-1 text-[10.5px]">
                    <Archive className="h-3 w-3 shrink-0 text-accent" />
                    <span className="min-w-0 flex-1 truncate text-soft">{zip.name}</span>
                    <span className="shrink-0 tabular-nums text-faint">{formatBytes(zip.size)}</span>
                  </div>
                ))}
              </div>
              {sources.errors.length ? (
                <div className="mt-3 rounded-lg border border-danger/20 bg-danger-soft/60 p-2.5 text-[10.5px] leading-relaxed text-danger">
                  {sources.errors.slice(0, 3).map((error, index) => (
                    <p key={index}>{error}</p>
                  ))}
                </div>
              ) : null}
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-[10.5px] leading-relaxed text-faint">
                  Analysis and optional face grouping begin automatically after import.
                </p>
                <Button
                  variant="gold"
                  size="lg"
                  loading={importActive}
                  disabled={!totalCount || busy}
                  icon={<Sparkles className="h-4 w-4" />}
                  onClick={() => void runImport()}
                >
                  Import & analyse
                </Button>
              </div>
            </Card>
          ) : null}

          {result ? (
            <Card className="border-success/25 bg-success-soft/40 p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink">
                    {result.cancelled ? 'Import stopped' : `${formatCount(result.stats.imported)} photographs imported`}
                  </p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-soft">
                    {[
                      result.stats.duplicates ? `${formatCount(result.stats.duplicates)} duplicates skipped` : '',
                      result.stats.skipped ? `${formatCount(result.stats.skipped)} unsupported files skipped` : '',
                      result.stats.failed ? `${formatCount(result.stats.failed)} could not be read` : '',
                    ].filter(Boolean).join(' · ') || 'Everything was read successfully.'}
                  </p>
                  {result.stats.errors.length ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[10.5px] font-medium text-danger">
                        {result.stats.errors.length} import {result.stats.errors.length === 1 ? 'note' : 'notes'}
                      </summary>
                      <ul className="mt-1.5 space-y-0.5 text-[10px] text-soft">
                        {result.stats.errors.slice(0, 8).map((error, index) => (
                          <li key={index}><span className="text-ink">{error.name}</span> — {error.message}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                  <div className="mt-3 flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => navigate('/library')}>View library</Button>
                    <Button variant="ghost" size="sm" onClick={() => setResult(null)}>Dismiss</Button>
                  </div>
                </div>
              </div>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          {importActive || processing.running ? (
            <Card className="overflow-hidden">
              <div className="border-b border-line bg-accent-soft/40 px-4 py-3">
                <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {importActive ? 'Importing photographs' : processing.paused ? 'Analysis paused' : 'Analysing library'}
                </p>
              </div>
              <div className="space-y-4 p-4">
                <div>
                  <div className="mb-1.5 flex justify-between text-[10.5px]">
                    <span className="text-soft">{importActive ? 'Copying & fingerprinting' : processing.stage}</span>
                    <span className="tabular-nums text-faint">{importActive ? importPct : processPct}%</span>
                  </div>
                  <ProgressBar
                    value={importActive ? importProgress.processed : processing.completed}
                    max={Math.max(1, importActive ? importProgress.totalFiles : processing.total)}
                  />
                  <p className="mt-1.5 truncate text-[10px] text-faint">
                    {importActive
                      ? `${formatCount(importProgress.processed)} of ${formatCount(importProgress.totalFiles)} · ${formatBytes(importProgress.bytesProcessed)} of ${formatBytes(importProgress.bytesTotal)}`
                      : `${formatCount(processing.completed)} of ${formatCount(processing.total)} · ${processing.currentName || 'Preparing…'}`}
                  </p>
                </div>
                {processing.etaMs && processing.running ? (
                  <p className="text-[10.5px] text-faint">About {formatDuration(processing.etaMs)} remaining</p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {importActive ? (
                    <Button variant="secondary" size="sm" onClick={cancelImport}>Stop import</Button>
                  ) : (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={processing.paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                        onClick={() => (processing.paused ? resumeProcessing() : pauseProcessing())}
                      >
                        {processing.paused ? 'Resume' : 'Pause'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={cancelProcessing}>Stop analysis</Button>
                    </>
                  )}
                </div>
                <p className="text-[10px] leading-relaxed text-faint">
                  You can leave this page. Processing continues in the background, and previews remain available.
                </p>
              </div>
            </Card>
          ) : (
            <Card className="p-5">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-faint">Import notes</p>
              <ul className="mt-3 space-y-2.5 text-[11.5px] leading-relaxed text-soft">
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" /> Duplicate files are detected by content hash before they are stored.</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" /> HEIC files are not decoded by browsers; export them as JPEG first.</li>
                <li className="flex gap-2"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" /> Large archives are read as a stream, so memory use stays controlled.</li>
                <li className="flex gap-2"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" /> Closing the tab stops processing. Re-open the project to continue where you left off.</li>
              </ul>
            </Card>
          )}

          <Card className="p-5">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-faint">Storage for this library</p>
            <div className="mt-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-[12.5px] font-medium text-ink">Keep full-resolution originals</p>
                <p className="mt-1 text-[10.5px] leading-relaxed text-faint">
                  Recommended for reliable ZIP export. Turning this off keeps previews and requires relinking originals later.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void updateProject({ storeOriginals: !project.storeOriginals })}
                className={clsx(
                  'relative mt-0.5 h-6 w-10 shrink-0 rounded-full border transition-colors',
                  project.storeOriginals ? 'border-accent bg-accent' : 'border-line bg-ink/[.08]',
                )}
                aria-label="Toggle original storage"
                aria-pressed={project.storeOriginals}
              >
                <span
                  className={clsx('absolute top-0.5 rounded-full bg-white shadow-sm transition-transform', project.storeOriginals ? 'translate-x-[19px]' : 'translate-x-0.5')}
                  style={{ height: 18, width: 18 }}
                />
              </button>
            </div>
          </Card>

          <Card className="border-line bg-raised/40 p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-success" />
              <p className="text-[12px] font-medium text-ink">Privacy by default</p>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-soft">
              Files are read in your browser and stored in IndexedDB. Ivory has no server and sends no analytics. Face descriptors and visual embeddings are optional and can be erased independently.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Chip tone="success">No uploads</Chip>
              <Chip tone="success">No accounts</Chip>
              <Chip>Open source</Chip>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
