import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  Database,
  HardDrive,
  Info,
  Loader2,
  Moon,
  Palette,
  RefreshCw,
  ScanFace,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  UserRound,
  Wand2,
} from 'lucide-react';
import type { ProjectSettings } from '@/types';
import { useAppStore } from '@/store/appStore';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProjectGate } from '@/components/ProjectGate';
import {
  Button,
  Card,
  Chip,
  Field,
  Modal,
  ProgressBar,
  SectionHeading,
  SegmentedControl,
  Select,
  Slider,
  Switch,
  TextArea,
  TextInput,
} from '@/components/ui';
import { DEFAULT_PROJECT_SETTINGS, CLIP_MODEL_LABEL } from '@/lib/constants';
import { getProjectAssetSizes } from '@/lib/db';
import { formatBytes, formatCount, formatDate, percent } from '@/lib/utils';

type ConfirmKind = 'faces' | 'originals' | 'visual' | 'project' | 'reset';

interface AssetBreakdown {
  total: number;
  original: number;
  preview: number;
  thumb: number;
  face: number;
  count: number;
}

const LICENCES = [
  { name: 'React · React DOM', licence: 'MIT', note: 'interface runtime' },
  { name: 'Vite', licence: 'MIT', note: 'build tool' },
  { name: 'Tailwind CSS', licence: 'MIT', note: 'design system' },
  { name: 'Zustand', licence: 'MIT', note: 'local state' },
  { name: 'React Router', licence: 'MIT', note: 'navigation' },
  { name: 'idb', licence: 'ISC', note: 'IndexedDB access' },
  { name: 'fflate · client-zip', licence: 'MIT', note: 'streaming archives' },
  { name: 'exifr', licence: 'MIT', note: 'metadata reading' },
  { name: 'jsPDF', licence: 'MIT', note: 'PDF documents' },
  { name: 'hash-wasm', licence: 'MIT', note: 'content hashing' },
  { name: 'Lucide', licence: 'ISC', note: 'icons' },
  { name: '@vladmandic/face-api', licence: 'MIT', note: 'face detection and recognition' },
  { name: '@huggingface/transformers', licence: 'Apache-2.0', note: 'local CLIP inference' },
  { name: 'ONNX Runtime Web', licence: 'MIT', note: 'in-browser runtime' },
  { name: 'CLIP ViT-B/32', licence: 'MIT', note: 'visual search model' },
  { name: 'Fraunces · Inter', licence: 'OFL-1.1', note: 'typefaces' },
];

export function SettingsPage() {
  return (
    <ProjectGate feature="settings">
      <SettingsWorkspace />
    </ProjectGate>
  );
}

function SettingsWorkspace() {
  const project = useAppStore((state) => state.project)!;
  const projects = useAppStore((state) => state.projects);
  const photos = useAppStore((state) => state.photos);
  const people = useAppStore((state) => state.people);
  const faces = useAppStore((state) => state.faces);
  const events = useAppStore((state) => state.events);
  const embeddings = useAppStore((state) => state.embeddings);
  const settings = useAppStore((state) => state.settings);
  const storage = useAppStore((state) => state.storage);
  const processing = useAppStore((state) => state.processing);
  const ai = useAppStore((state) => state.ai);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const updateProject = useAppStore((state) => state.updateProject);
  const deleteFaceData = useAppStore((state) => state.deleteFaceData);
  const deleteStoredOriginals = useAppStore((state) => state.deleteStoredOriginals);
  const deleteVisualIndex = useAppStore((state) => state.deleteVisualIndex);
  const refreshStorage = useAppStore((state) => state.refreshStorage);
  const requestPersistence = useAppStore((state) => state.requestPersistence);
  const deleteProject = useAppStore((state) => state.deleteProject);
  const resetAllData = useAppStore((state) => state.resetAllData);
  const reorganise = useAppStore((state) => state.reorganise);
  const pushToast = useAppStore((state) => state.pushToast);
  const navigate = useNavigate();

  const [details, setDetails] = useState({
    name: project.name,
    coupleNames: project.coupleNames ?? '',
    eventDate: project.eventDate ?? '',
    venue: project.venue ?? '',
    photographerName: project.photographerName ?? '',
    photographerContact: project.photographerContact ?? '',
    handoffNotes: project.handoffNotes ?? '',
  });
  const [detailsDirty, setDetailsDirty] = useState(false);
  const [analysis, setAnalysis] = useState<ProjectSettings>({ ...project.settings });
  const [analysisDirty, setAnalysisDirty] = useState(false);
  const [assets, setAssets] = useState<AssetBreakdown | null>(null);
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [working, setWorking] = useState(false);
  const loadToken = useRef(0);

  useEffect(() => {
    setDetails({
      name: project.name,
      coupleNames: project.coupleNames ?? '',
      eventDate: project.eventDate ?? '',
      venue: project.venue ?? '',
      photographerName: project.photographerName ?? '',
      photographerContact: project.photographerContact ?? '',
      handoffNotes: project.handoffNotes ?? '',
    });
    setAnalysis({ ...project.settings });
    setDetailsDirty(false);
    setAnalysisDirty(false);
  }, [project.id, project.name, project.coupleNames, project.eventDate, project.venue, project.photographerName, project.photographerContact, project.handoffNotes, project.settings]);

  const loadAssets = async () => {
    const token = ++loadToken.current;
    try {
      const breakdown = await getProjectAssetSizes(project.id);
      if (token === loadToken.current) setAssets(breakdown);
    } catch {
      if (token === loadToken.current) setAssets(null);
    }
  };

  useEffect(() => {
    void loadAssets();
    // Refresh when the composition of the library changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, photos.length, faces.length, people.length, embeddings.size]);

  const setDetail = (patch: Partial<typeof details>) => {
    setDetails((current) => ({ ...current, ...patch }));
    setDetailsDirty(true);
  };

  const setAnalysisValue = <K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]) => {
    setAnalysis((current) => ({ ...current, [key]: value }));
    setAnalysisDirty(true);
  };

  const saveDetails = async () => {
    const name = details.name.trim();
    if (!name) {
      pushToast({ title: 'Give the library a name', description: 'The name appears on exports and in the project switcher.', tone: 'danger' });
      return;
    }
    await updateProject({
      name,
      coupleNames: details.coupleNames.trim() || undefined,
      eventDate: details.eventDate || undefined,
      venue: details.venue.trim() || undefined,
      photographerName: details.photographerName.trim() || undefined,
      photographerContact: details.photographerContact.trim() || undefined,
      handoffNotes: details.handoffNotes.trim() || undefined,
    });
    setDetailsDirty(false);
    pushToast({ title: 'Library details saved', tone: 'success' });
  };

  const saveAnalysis = async () => {
    await updateProject({ settings: analysis });
    setAnalysisDirty(false);
    pushToast({
      title: 'Analysis settings saved',
      description: 'New thresholds apply next time the library is organised.',
      tone: 'success',
    });
  };

  const resetAnalysis = () => {
    setAnalysis({ ...DEFAULT_PROJECT_SETTINGS });
    setAnalysisDirty(true);
  };

  const runReorganise = async () => {
    await saveAnalysis();
    await reorganise();
  };

  const storagePct = storage.quota > 0 ? Math.min(100, percent(storage.usage, storage.quota)) : 0;
  const faceCount = faces.length;
  const selectedCount = useMemo(() => photos.filter((photo) => photo.selected).length, [photos]);
  const originalCount = useMemo(() => photos.filter((photo) => photo.originalStored).length, [photos]);

  const confirmTitle = useMemo(() => {
    switch (confirm) {
      case 'faces':
        return 'Delete all face data?';
      case 'originals':
        return 'Delete stored originals?';
      case 'visual':
        return 'Delete the visual index?';
      case 'project':
        return `Delete “${project.name}”?`;
      case 'reset':
        return 'Reset Ivory completely?';
      default:
        return '';
    }
  }, [confirm, project.name]);

  const runConfirmed = async () => {
    if (!confirm || working) return;
    setWorking(true);
    try {
      if (confirm === 'faces') {
        await deleteFaceData();
      } else if (confirm === 'originals') {
        await deleteStoredOriginals();
      } else if (confirm === 'visual') {
        await deleteVisualIndex();
      } else if (confirm === 'project') {
        await deleteProject(project.id);
        navigate('/');
      } else if (confirm === 'reset') {
        if (confirmText.trim().toUpperCase() !== 'RESET') return;
        await resetAllData();
        navigate('/');
      }
      await loadAssets();
      await refreshStorage();
      setConfirm(null);
      setConfirmText('');
    } finally {
      setWorking(false);
    }
  };

  const resetBlocked = confirm === 'reset' && confirmText.trim().toUpperCase() !== 'RESET';

  return (
    <div className="animate-fade-up pb-12">
      <PageHeader
        eyebrow="Settings"
        title="Your library, your rules"
        description="Preferences, analysis thresholds, privacy controls and local storage. Ivory has no server — everything here affects this device only."
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />} onClick={() => void refreshStorage()}>
              Refresh storage
            </Button>
            <Button variant="primary" icon={<ShieldCheck className="h-4 w-4" />} onClick={() => void requestPersistence()}>
              Protect local data
            </Button>
          </>
        }
      >
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <Chip tone="success">Local only</Chip>
          <Chip>{formatCount(photos.length)} photographs</Chip>
          <Chip>{formatCount(projects.length)} libraries</Chip>
          <Chip tone={storage.persisted ? 'success' : 'default'}>
            {storage.persisted ? 'Storage protected' : 'Storage not yet protected'}
          </Chip>
        </div>
      </PageHeader>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
        <div className="space-y-5">
          <Card className="p-5">
            <SectionHeading
              eyebrow="Library"
              title="Details and credits"
              description="Names, dates and notes that travel with exports and handoff documents."
              action={
                <Button variant="secondary" size="sm" onClick={() => void saveDetails()} disabled={!detailsDirty}>
                  {detailsDirty ? 'Save details' : 'Saved'}
                </Button>
              }
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Library name">
                <TextInput
                  value={details.name}
                  onChange={(event) => setDetail({ name: event.target.value })}
                  placeholder="Summer wedding"
                />
              </Field>
              <Field label="Couple or event name">
                <TextInput
                  value={details.coupleNames}
                  onChange={(event) => setDetail({ coupleNames: event.target.value })}
                  placeholder="e.g. Aisha & Noah"
                />
              </Field>
              <Field label="Event date">
                <TextInput
                  type="date"
                  value={details.eventDate}
                  onChange={(event) => setDetail({ eventDate: event.target.value })}
                />
              </Field>
              <Field label="Venue">
                <TextInput
                  value={details.venue}
                  onChange={(event) => setDetail({ venue: event.target.value })}
                  placeholder="The Old Barn, Somerset"
                />
              </Field>
              <Field label="Photographer or studio">
                <TextInput
                  value={details.photographerName}
                  onChange={(event) => setDetail({ photographerName: event.target.value })}
                  placeholder="Studio name"
                />
              </Field>
              <Field label="Contact">
                <TextInput
                  value={details.photographerContact}
                  onChange={(event) => setDetail({ photographerContact: event.target.value })}
                  placeholder="email or phone"
                />
              </Field>
              <Field
                label="Handoff notes"
                className="sm:col-span-2"
                hint="Printed on the library report, handoff sheet and album notes page."
              >
                <TextArea
                  value={details.handoffNotes}
                  onChange={(event) => setDetail({ handoffNotes: event.target.value })}
                  placeholder="Delivery note, credit line or a message for the couple…"
                  rows={3}
                />
              </Field>
            </div>
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-faint">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3 w-3" /> Created {formatDate(project.createdAt)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <UserRound className="h-3 w-3" /> {formatCount(people.length)} people
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" /> {formatCount(selectedCount)} in album
              </span>
            </p>
          </Card>

          <Card className="p-5">
            <SectionHeading
              eyebrow="Analysis"
              title="How Ivory decides"
              description="Similarity, bursts, events and face grouping. These are suggestions — you can always override a frame."
              action={
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" size="sm" onClick={resetAnalysis} disabled={!analysisDirty}>
                    Restore defaults
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => void saveAnalysis()} disabled={!analysisDirty}>
                    Save thresholds
                  </Button>
                </div>
              }
            />

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Slider
                label="Similar-frame sensitivity"
                value={analysis.similarityThreshold}
                min={2}
                max={20}
                step={1}
                onChange={(value) => setAnalysisValue('similarityThreshold', value)}
                formatValue={(value) => `${value} dHash bits`}
              />
              <Slider
                label="Burst window"
                value={Math.round(analysis.burstWindowMs / 250)}
                min={2}
                max={40}
                step={1}
                onChange={(value) => setAnalysisValue('burstWindowMs', value * 250)}
                formatValue={(value) => `${(value * 0.25).toFixed(1)} s`}
              />
              <Slider
                label="Timeline gap"
                value={analysis.timelineGapMin}
                min={10}
                max={180}
                step={5}
                onChange={(value) => setAnalysisValue('timelineGapMin', value)}
                formatValue={(value) => `${value} min`}
              />
              <Slider
                label="Face grouping sensitivity"
                value={analysis.faceClusterThreshold}
                min={0.2}
                max={0.7}
                step={0.01}
                onChange={(value) => setAnalysisValue('faceClusterThreshold', value)}
                formatValue={(value) => value.toFixed(2)}
              />
              <Slider
                label="Face detector confidence"
                value={analysis.faceDetectorThreshold}
                min={0.2}
                max={0.8}
                step={0.01}
                onChange={(value) => setAnalysisValue('faceDetectorThreshold', value)}
                formatValue={(value) => value.toFixed(2)}
              />
              <Slider
                label="Analysis concurrency"
                value={analysis.analysisConcurrency}
                min={1}
                max={6}
                step={1}
                onChange={(value) => setAnalysisValue('analysisConcurrency', value)}
                formatValue={(value) => `${value} ${value === 1 ? 'worker' : 'workers'}`}
              />
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <Field
                label="Face detector"
                hint="Tiny is fastest and well suited to small screens; SSD is more thorough on detailed group photographs."
              >
                <Select
                  value={analysis.faceDetector}
                  onChange={(event) => setAnalysisValue('faceDetector', event.target.value as ProjectSettings['faceDetector'])}
                >
                  <option value="tiny">Tiny Face Detector — fast</option>
                  <option value="ssd">SSD MobileNet — thorough</option>
                </Select>
              </Field>
              <Button
                variant="primary"
                icon={processing.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                onClick={() => void runReorganise()}
                disabled={processing.running || !photos.length}
              >
                {processing.running ? 'Organising…' : 'Re-organise library'}
              </Button>
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
              Re-organising re-reads existing files and refreshes similarity groups, events, scores and flags. It never
              deletes a photograph or clears your selections.
            </p>
          </Card>

          <Card className="p-5">
            <SectionHeading
              eyebrow="Privacy"
              title="Consent and sensitive data"
              description="Face grouping and visual search are optional, use open models, and run entirely on this device."
            />

            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-line bg-surface p-3.5">
                <Switch
                  checked={project.consentFace}
                  onChange={(value) => void updateProject({ consentFace: value })}
                  label="Face detection and people grouping"
                  description="Detects faces, estimates smiles, eyes and gaze, and groups recurring people. Descriptors are stored locally in IndexedDB."
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Chip tone={project.consentFace ? 'success' : 'default'}>
                    {project.consentFace ? 'Enabled' : 'Off'}
                  </Chip>
                  <span className="text-[10px] text-faint">
                    {formatCount(faceCount)} faces · {formatCount(people.length)} people
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto text-danger hover:text-danger"
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={() => setConfirm('faces')}
                    disabled={!faceCount && !people.length}
                  >
                    Delete face data
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-line bg-surface p-3.5">
                <Switch
                  checked={project.consentAiSearch}
                  onChange={(value) => void updateProject({ consentAiSearch: value })}
                  label="Natural-language visual search"
                  description={`Optional CLIP model. ${CLIP_MODEL_LABEL} is downloaded once, only with your consent, then cached for offline use.`}
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Chip tone={project.consentAiSearch ? 'success' : 'default'}>
                    {project.consentAiSearch ? 'Enabled' : 'Off'}
                  </Chip>
                  <span className="text-[10px] text-faint">
                    {formatCount(embeddings.size)} embeddings · {ai.message}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto text-danger hover:text-danger"
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={() => setConfirm('visual')}
                    disabled={!embeddings.size}
                  >
                    Delete visual index
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-line bg-surface p-3.5">
                <Switch
                  checked={project.storeOriginals}
                  onChange={(value) => void updateProject({ storeOriginals: value })}
                  label="Keep full-resolution originals in this browser"
                  description="Reliable offline export, at the cost of storage. When off, future imports keep previews only; you can relink originals later."
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Chip tone={project.storeOriginals ? 'success' : 'default'}>
                    {project.storeOriginals ? 'Originals kept' : 'Previews only'}
                  </Chip>
                  <span className="text-[10px] text-faint">
                    {formatCount(originalCount)} of {formatCount(photos.length)} originals stored
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto text-danger hover:text-danger"
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={() => setConfirm('originals')}
                    disabled={!originalCount}
                  >
                    Delete stored originals
                  </Button>
                </div>
              </div>
            </div>

            <p className="mt-4 flex items-start gap-2 rounded-xl border border-success/20 bg-success-soft/40 p-3 text-[10.5px] leading-relaxed text-soft">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
              Ivory never sends photographs, face descriptors or embeddings to a server, and never deletes a photograph
              automatically. Rejected frames remain in the library until you delete the project.
            </p>
          </Card>

          <Card className="p-5">
            <SectionHeading
              eyebrow="About"
              title="Open source, open formats"
              description="Ivory is free for personal and studio use. These are the components and models that make it work."
            />
            <div className="mt-4 overflow-hidden rounded-xl border border-line">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-line bg-raised/60 px-3 py-2 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-faint">
                <span>Component</span>
                <span>Licence</span>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {LICENCES.map((item) => (
                  <div
                    key={item.name}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-line/60 px-3 py-2 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[11.5px] font-medium text-ink">{item.name}</p>
                      <p className="text-[9.5px] text-faint">{item.note}</p>
                    </div>
                    <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[9.5px] text-soft">
                      {item.licence}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-faint">
              Model weights are bundled or cached locally. No paid API, cloud inference, account or subscription is used.
              Full licence texts are included with the source distribution.
            </p>
          </Card>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-[76px] xl:self-start">
          <Card className="p-4">
            <p className="flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-faint">
              <Palette className="h-3 w-3" /> Appearance
            </p>
            <div className="mt-3 space-y-3">
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-soft">Theme</p>
                <SegmentedControl
                  className="w-full"
                  value={settings.theme}
                  onChange={(value) => updateSettings({ theme: value })}
                  options={[
                    { value: 'light', label: 'Light', icon: <Sun className="h-3.5 w-3.5" /> },
                    { value: 'dark', label: 'Dark', icon: <Moon className="h-3.5 w-3.5" /> },
                  ]}
                />
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-soft">Grid density</p>
                <SegmentedControl
                  className="w-full"
                  value={settings.gridDensity}
                  onChange={(value) => updateSettings({ gridDensity: value })}
                  options={[
                    { value: 'comfortable', label: 'Comfortable' },
                    { value: 'compact', label: 'Compact' },
                  ]}
                />
              </div>
              <Switch
                checked={settings.sidebarCollapsed}
                onChange={(value) => updateSettings({ sidebarCollapsed: value })}
                label="Collapse sidebar"
                description="More room for the library grid."
              />
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-line bg-raised/50 px-4 py-3">
              <p className="flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-faint">
                <HardDrive className="h-3 w-3" /> Local storage
              </p>
              <p className="display mt-1 text-xl text-ink">
                {formatBytes(storage.usage)}
                <span className="ml-1.5 font-sans text-[11px] font-normal text-faint">
                  of {storage.quota ? formatBytes(storage.quota) : 'unknown'}
                </span>
              </p>
            </div>
            <div className="space-y-3 p-4">
              <ProgressBar value={storagePct} max={100} tone={storagePct > 85 ? 'danger' : 'accent'} />
              <p className="text-[10px] text-faint">
                {storage.supported
                  ? storage.persisted
                    ? 'The browser has granted persistent storage for this library.'
                    : 'The browser may evict data under pressure. Protect local data to ask for persistence.'
                  : 'Storage estimates are not available in this browser.'}
              </p>
              {assets ? (
                <div className="space-y-1.5 border-t border-line pt-3 text-[10.5px]">
                  <AssetRow label="Originals" value={assets.original} />
                  <AssetRow label="Previews" value={assets.preview} />
                  <AssetRow label="Thumbnails" value={assets.thumb} />
                  <AssetRow label="Face crops" value={assets.face} />
                  <div className="flex items-center justify-between gap-3 border-t border-line pt-1.5 font-medium text-ink">
                    <span>This library</span>
                    <span className="tabular-nums">{formatBytes(assets.total)}</span>
                  </div>
                  <p className="pt-1 text-[9.5px] text-faint">{formatCount(assets.count)} stored assets</p>
                </div>
              ) : (
                <p className="flex items-center gap-2 text-[10px] text-faint">
                  <Loader2 className="h-3 w-3 animate-spin" /> Measuring this library…
                </p>
              )}
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                icon={<RefreshCw className="h-3.5 w-3.5" />}
                onClick={() => {
                  void refreshStorage();
                  void loadAssets();
                }}
              >
                Refresh measurements
              </Button>
            </div>
          </Card>

          <Card className="p-4">
            <p className="flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-faint">
              <Database className="h-3 w-3" /> This library
            </p>
            <div className="mt-2 space-y-1.5 text-[10.5px] text-soft">
              <div className="flex justify-between gap-3">
                <span className="text-faint">Photographs</span>
                <span className="tabular-nums">{formatCount(photos.length)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-faint">In album</span>
                <span className="tabular-nums">{formatCount(selectedCount)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-faint">People</span>
                <span className="tabular-nums">{formatCount(people.length)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-faint">Moments</span>
                <span className="tabular-nums">{formatCount(events.length)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-faint">Embeddings</span>
                <span className="tabular-nums">{formatCount(embeddings.size)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-faint">Face data</span>
                <span className="tabular-nums">{formatCount(faces.length)} descriptors</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 w-full"
              icon={<ScanFace className="h-3.5 w-3.5" />}
              onClick={() => navigate('/people')}
            >
              Open People
            </Button>
          </Card>

          <Card className="p-4">
            <p className="flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-faint">
              <ShieldCheck className="h-3 w-3" /> Privacy promise
            </p>
            <ul className="mt-2 space-y-2 text-[10.5px] leading-relaxed text-soft">
              <li className="flex gap-2">
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-success" /> No uploads, analytics or accounts.
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-success" /> No cloud AI or paid API.
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-success" /> No automatic deletion or discarding.
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-success" /> Face and visual data can be erased independently.
              </li>
            </ul>
          </Card>

          <Card className="border-danger/20 p-4">
            <p className="flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-danger">
              <AlertTriangle className="h-3 w-3" /> Danger zone
            </p>
            <p className="mt-2 text-[10.5px] leading-relaxed text-soft">
              Deleting a project removes its photographs, previews, faces and analysis from this browser. It cannot be
              undone.
            </p>
            <div className="mt-3 space-y-2">
              <Button
                variant="secondary"
                size="sm"
                className="w-full border-danger/30 text-danger hover:border-danger/50 hover:text-danger"
                icon={<Trash2 className="h-3.5 w-3.5" />}
                onClick={() => {
                  setConfirmText('');
                  setConfirm('project');
                }}
              >
                Delete this library
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-danger hover:text-danger"
                onClick={() => {
                  setConfirmText('');
                  setConfirm('reset');
                }}
              >
                Reset all Ivory data
              </Button>
            </div>
          </Card>

          <p className="px-1 text-center text-[9px] leading-relaxed text-faint">
            Ivory runs locally in your browser. Nothing here is a substitute for a backup of your original files.
          </p>
        </aside>
      </div>

      <Modal
        open={confirm !== null}
        onClose={() => {
          if (!working) {
            setConfirm(null);
            setConfirmText('');
          }
        }}
        title={confirmTitle}
        description={confirm === 'reset' ? 'This erases every library on this device.' : 'This action cannot be undone.'}
        size="sm"
        footer={
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" size="sm" onClick={() => setConfirm(null)} disabled={working}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => void runConfirmed()}
              loading={working}
              disabled={resetBlocked}
              icon={<Trash2 className="h-3.5 w-3.5" />}
            >
              {confirm === 'faces'
                ? 'Delete face data'
                : confirm === 'originals'
                  ? 'Delete originals'
                  : confirm === 'visual'
                    ? 'Delete visual index'
                    : confirm === 'project'
                      ? 'Delete library'
                      : 'Reset everything'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 px-5 py-4 text-[12px] leading-relaxed text-soft sm:px-6">
          {confirm === 'faces' ? (
            <>
              <p>
                This removes every face descriptor, face crop and named person in <strong className="text-ink">{project.name}</strong>.
                Photographs, previews and album selections stay untouched.
              </p>
              <p className="rounded-lg border border-line bg-raised/60 p-2.5 text-[11px]">
                Face detection remains enabled. New analyses can rebuild people from the photographs if you choose.
              </p>
            </>
          ) : confirm === 'originals' ? (
            <>
              <p>
                This removes {formatCount(originalCount)} stored full-resolution {originalCount === 1 ? 'file' : 'files'} from
                IndexedDB. Previews, thumbnails, scores and selections remain.
              </p>
              <p className="rounded-lg border border-accent/25 bg-accent-soft/40 p-2.5 text-[11px]">
                You can relink the originals later from Export → Relink originals. Your files outside the browser are never
                modified.
              </p>
            </>
          ) : confirm === 'visual' ? (
            <>
              <p>
                This removes {formatCount(embeddings.size)} CLIP embeddings from this library. Text and metadata search keep
                working; visual search will need to re-index.
              </p>
              <p className="rounded-lg border border-line bg-raised/60 p-2.5 text-[11px]">
                The cached model files stay on this device so a future index does not need to download them again.
              </p>
            </>
          ) : confirm === 'project' ? (
            <>
              <p>
                <strong className="text-ink">{project.name}</strong> contains {formatCount(photos.length)} photographs and will
                be removed from this browser, along with previews, faces, groups, events and the album draft.
              </p>
              <p className="font-medium text-danger">
                Your original files on disk are not affected, but the library cannot be restored without importing them again.
              </p>
            </>
          ) : (
            <>
              <p>
                This erases every library, photograph, preview, face descriptor, embedding and preference stored by Ivory on
                this device.
              </p>
              <div className="rounded-xl border border-danger/25 bg-danger-soft/40 p-3">
                <p className="flex items-start gap-2 text-[11px] leading-relaxed text-danger">
                  <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  This is permanent and cannot be undone. Your original files outside the browser are not touched.
                </p>
                <Field label="Type RESET to confirm" className="mt-3">
                  <TextInput
                    value={confirmText}
                    onChange={(event) => setConfirmText(event.target.value)}
                    placeholder="RESET"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

function AssetRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-faint">{label}</span>
      <span className="tabular-nums text-soft">{formatBytes(value)}</span>
    </div>
  );
}
