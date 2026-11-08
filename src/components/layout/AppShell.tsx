import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  Archive,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  Columns3,
  Eye,
  HardDrive,
  Images,
  LayoutDashboard,
  Loader2,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { formatBytes, formatCount, percent } from '@/lib/utils';
import { Button, IconButton, ProgressBar } from '@/components/ui';
import { Toaster } from '@/components/Toaster';
import { NewProjectModal } from '@/components/NewProjectModal';

const NAV_SECTIONS = [
  {
    label: 'Curate',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/import', label: 'Import', icon: Upload },
      { to: '/library', label: 'Library', icon: Images },
      { to: '/review', label: 'Review', icon: Sparkles },
      { to: '/people', label: 'People', icon: Users },
      { to: '/timeline', label: 'Timeline', icon: CalendarDays },
    ],
  },
  {
    label: 'Discover',
    items: [
      { to: '/search', label: 'Search', icon: Search },
      { to: '/compare', label: 'Compare', icon: Columns3 },
    ],
  },
  {
    label: 'Deliver',
    items: [
      { to: '/album', label: 'Album', icon: BookOpen },
      { to: '/album/preview', label: 'Album preview', icon: Eye },
      { to: '/export', label: 'Export & handoff', icon: Archive },
    ],
  },
] as const;

function ProjectSwitcher({ onCreate }: { onCreate: () => void }) {
  const project = useAppStore((state) => state.project);
  const projects = useAppStore((state) => state.projects);
  const openProject = useAppStore((state) => state.openProject);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-surface px-2.5 py-2 text-left transition-colors hover:border-accent/40"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <span className="display text-base">{project ? project.name.slice(0, 1).toUpperCase() : 'I'}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-medium leading-tight text-ink">
            {project?.name ?? 'No library open'}
          </span>
          <span className="mt-0.5 block truncate text-[10px] text-faint">
            {project?.coupleNames || (project ? formatCount(projects.length) + ' libraries' : 'Create your first library')}
          </span>
        </span>
        <ChevronDown className={clsx('h-3.5 w-3.5 shrink-0 text-faint transition-transform', open && 'rotate-180')} />
      </button>

      {open ? (
        <div className="absolute left-0 top-[calc(100%+6px)] z-40 w-64 overflow-hidden rounded-xl border border-line bg-surface shadow-lift animate-scale-in">
          <div className="max-h-64 overflow-y-auto p-1.5">
            {projects.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (item.id !== project?.id) {
                    void openProject(item.id).then(() => navigate('/library'));
                  }
                }}
                className={clsx(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-raised',
                  item.id === project?.id && 'bg-accent-soft/70',
                )}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-raised text-[10px] font-semibold text-soft">
                  {item.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-ink">{item.name}</span>
                  <span className="block truncate text-[10px] text-faint">
                    {item.coupleNames || item.venue || 'Private library'}
                  </span>
                </span>
                {item.id === project?.id ? <Check className="h-3.5 w-3.5 shrink-0 text-accent" /> : null}
              </button>
            ))}
            {!projects.length ? (
              <p className="px-3 py-4 text-center text-[11.5px] text-faint">No libraries yet.</p>
            ) : null}
          </div>
          <div className="border-t border-line p-1.5">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onCreate();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[11.5px] font-medium text-accent transition-colors hover:bg-accent-soft"
            >
              <Plus className="h-3.5 w-3.5" /> New library
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StorageMeter({ collapsed }: { collapsed: boolean }) {
  const storage = useAppStore((state) => state.storage);
  const usagePct = storage.quota > 0 ? Math.min(100, percent(storage.usage, storage.quota)) : 0;
  if (collapsed) {
    return (
      <div className="flex justify-center py-2" title={`${formatBytes(storage.usage)} used`}>
        <HardDrive className={clsx('h-4 w-4', usagePct > 85 ? 'text-danger' : 'text-faint')} />
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-line bg-surface/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10.5px] font-medium text-soft">
          <HardDrive className="h-3 w-3" /> Local storage
        </span>
        <span className="text-[10px] tabular-nums text-faint">{usagePct}%</span>
      </div>
      <ProgressBar value={usagePct} max={100} tone={usagePct > 85 ? 'danger' : 'accent'} className="mt-2" />
      <p className="mt-1.5 text-[9.5px] text-faint">
        {formatBytes(storage.usage)} of {storage.quota ? formatBytes(storage.quota) : '—'}
        {storage.persisted ? ' · protected' : ''}
      </p>
    </div>
  );
}

function ProcessingStatus({ collapsed }: { collapsed: boolean }) {
  const processing = useAppStore((state) => state.processing);
  const ai = useAppStore((state) => state.ai);
  const importActive = useAppStore((state) => state.importActive);
  const importProgress = useAppStore((state) => state.importProgress);
  const pause = useAppStore((state) => state.pauseProcessing);
  const resume = useAppStore((state) => state.resumeProcessing);
  const navigate = useNavigate();

  if (importActive) {
    const done = importProgress.processed;
    const total = importProgress.totalFiles || 1;
    return (
      <div className={clsx('rounded-xl border border-accent/25 bg-accent-soft/60', collapsed ? 'p-2' : 'p-3')}>
        {collapsed ? <Loader2 className="mx-auto h-4 w-4 animate-spin text-accent" /> : (
          <>
            <div className="flex items-center gap-2 text-[11px] font-medium text-accent">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Importing {formatCount(importProgress.imported)}
            </div>
            <ProgressBar value={done} max={total} className="mt-2" />
            <p className="mt-1.5 truncate text-[9.5px] text-accent/80">{importProgress.currentName || 'Reading files…'}</p>
          </>
        )}
      </div>
    );
  }

  if (processing.running) {
    const done = processing.completed;
    const total = processing.total || 1;
    return (
      <div className={clsx('rounded-xl border border-accent/25 bg-accent-soft/60', collapsed ? 'p-2' : 'p-3')}>
        {collapsed ? (
          <button type="button" onClick={() => navigate('/library')} className="mx-auto flex h-6 w-6 items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
          </button>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-[11px] font-medium capitalize text-accent">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {processing.paused ? 'Paused' : processing.stage}
              </span>
              <button
                type="button"
                onClick={() => (processing.paused ? resume() : pause())}
                className="flex h-5 w-5 items-center justify-center rounded text-accent hover:bg-accent/10"
                aria-label={processing.paused ? 'Resume processing' : 'Pause processing'}
              >
                {processing.paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
              </button>
            </div>
            <ProgressBar value={done} max={total} className="mt-2" />
            <p className="mt-1.5 truncate text-[9.5px] text-accent/80">
              {formatCount(done)} of {formatCount(total)} · {processing.currentName || 'Preparing…'}
            </p>
          </>
        )}
      </div>
    );
  }

  if (ai.status === 'indexing' || ai.status === 'loading') {
    return (
      <div className={clsx('rounded-xl border border-line bg-surface/70', collapsed ? 'p-2' : 'p-3')}>
        {collapsed ? <Sparkles className="mx-auto h-4 w-4 animate-pulse-soft text-accent" /> : (
          <>
            <div className="flex items-center gap-2 text-[11px] font-medium text-accent">
              <Sparkles className="h-3.5 w-3.5 animate-pulse-soft" />
              {ai.status === 'loading' ? 'Loading visual model' : 'Visual indexing'}
            </div>
            <ProgressBar value={ai.completed} max={ai.total || 1} className="mt-2" />
            <p className="mt-1.5 truncate text-[9.5px] text-faint">{ai.completed} of {ai.total || '—'}</p>
          </>
        )}
      </div>
    );
  }

  if (collapsed) return null;
  return (
    <div className="flex items-center gap-2 rounded-xl border border-success/20 bg-success-soft/50 px-3 py-2">
      <ShieldCheck className="h-3.5 w-3.5 text-success" />
      <span className="text-[10.5px] font-medium text-success">All processing is local</span>
    </div>
  );
}

function SidebarContent({
  collapsed,
  onCreate,
  onNavigate,
}: {
  collapsed: boolean;
  onCreate: () => void;
  onNavigate?: () => void;
}) {
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <div className="flex h-full flex-col">
      <div className={clsx('flex items-center gap-2.5 px-3 pb-4 pt-5', collapsed && 'justify-center px-0')}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface shadow-sm">
          <span className="display text-lg text-accent">I</span>
        </div>
        {!collapsed ? (
          <div className="min-w-0">
            <p className="display text-lg leading-none text-ink">Ivory</p>
            <p className="mt-1 text-[8.5px] uppercase tracking-[0.2em] text-faint">Photo curation</p>
          </div>
        ) : null}
      </div>

      <div className={clsx('px-2 pb-4', collapsed && 'px-1.5')}>
        {collapsed ? (
          <button
            type="button"
            onClick={onCreate}
            className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent"
            title="New library"
          >
            <Plus className="h-4 w-4" />
          </button>
        ) : (
          <ProjectSwitcher onCreate={onCreate} />
        )}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 no-scrollbar">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-4">
            {!collapsed ? (
              <p className="mb-1 px-2.5 text-[8.5px] font-semibold uppercase tracking-[0.18em] text-faint/80">
                {section.label}
              </p>
            ) : (
              <div className="mx-auto mb-2 h-px w-5 bg-line" />
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={'end' in item ? item.end : false}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      clsx(
                        'group relative flex items-center gap-2.5 rounded-lg py-2 text-[12px] font-medium transition-all duration-150',
                        collapsed ? 'justify-center px-0' : 'px-2.5',
                        isActive
                          ? 'bg-accent-soft text-accent'
                          : 'text-soft hover:bg-ink/[.045] hover:text-ink',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && !collapsed ? (
                          <span className="absolute -left-2 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-accent" />
                        ) : null}
                        <Icon className={clsx('h-4 w-4 shrink-0', isActive ? 'text-accent' : 'text-faint group-hover:text-soft')} />
                        {!collapsed ? <span className="truncate">{item.label}</span> : null}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className={clsx('space-y-2 px-2 py-3', collapsed && 'px-1.5')}>
        <ProcessingStatus collapsed={collapsed} />
        <StorageMeter collapsed={collapsed} />
        <NavLink
          to="/settings"
          onClick={onNavigate}
          title={collapsed ? 'Settings' : undefined}
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-2.5 rounded-lg py-2 text-[12px] font-medium transition-colors',
              collapsed ? 'justify-center px-0' : 'px-2.5',
              isActive ? 'bg-accent-soft text-accent' : 'text-soft hover:bg-ink/[.045] hover:text-ink',
            )
          }
        >
          <Settings className="h-4 w-4 shrink-0" />
          {!collapsed ? 'Settings' : null}
        </NavLink>
        <div className={clsx('flex items-center', collapsed ? 'justify-center' : 'justify-between gap-1 px-1')}>
          {!collapsed ? (
            <button
              type="button"
              onClick={() => updateSettings({ sidebarCollapsed: true })}
              className="flex h-7 w-7 items-center justify-center rounded-md text-faint hover:bg-ink/[.05] hover:text-ink"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {collapsed ? (
            <button
              type="button"
              onClick={() => updateSettings({ sidebarCollapsed: false })}
              className="flex h-7 w-7 items-center justify-center rounded-md text-faint hover:bg-ink/[.05] hover:text-ink"
              aria-label="Expand sidebar"
            >
              <PanelLeftOpen className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
            className="flex h-7 w-7 items-center justify-center rounded-md text-faint hover:bg-ink/[.05] hover:text-ink"
            aria-label="Toggle colour theme"
          >
            {settings.theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function GlobalSearch() {
  const filters = useAppStore((state) => state.filters);
  const setFilters = useAppStore((state) => state.setFilters);
  const [value, setValue] = useState(filters.search);
  const navigate = useNavigate();

  return (
    <form
      className="relative hidden flex-1 sm:block sm:max-w-md"
      onSubmit={(event) => {
        event.preventDefault();
        setFilters({ search: value });
        navigate('/search');
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search people, moments or details…"
        aria-label="Search the library"
        className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-14 text-[12px] text-ink placeholder:text-faint transition-colors focus:border-accent focus:outline-none"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-line bg-raised px-1.5 py-0.5 text-[9px] font-medium text-faint">
        /
      </kbd>
    </form>
  );
}

export function AppShell() {
  const settings = useAppStore((state) => state.settings);
  const processing = useAppStore((state) => state.processing);
  const ai = useAppStore((state) => state.ai);
  const importActive = useAppStore((state) => state.importActive);
  const importProgress = useAppStore((state) => state.importProgress);
  const requestPersistence = useAppStore((state) => state.requestPersistence);
  const refreshStorage = useAppStore((state) => state.refreshStorage);
  const location = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const [newProject, setNewProject] = useState(false);

  const collapsed = settings.sidebarCollapsed;

  useEffect(() => {
    setMobileNav(false);
  }, [location.pathname]);

  useEffect(() => {
    void requestPersistence();
    void refreshStorage();
  }, [requestPersistence, refreshStorage]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === '/' && !(event.target as HTMLElement)?.closest('input, textarea, select, [contenteditable]')) {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('input[aria-label="Search the library"]')?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const busy = processing.running || ai.status === 'indexing' || importActive;
  const progressTotal = importActive ? importProgress.totalFiles : processing.total;
  const progressDone = importActive ? importProgress.processed : processing.completed;

  return (
    <div className="min-h-screen bg-canvas">
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-30 hidden border-r border-line bg-surface/60 backdrop-blur-sm transition-[width] duration-300 md:block',
          collapsed ? 'w-[68px]' : 'w-[248px]',
        )}
      >
        <SidebarContent collapsed={collapsed} onCreate={() => setNewProject(true)} />
      </aside>

      <div className={clsx('transition-[padding] duration-300', collapsed ? 'md:pl-[68px]' : 'md:pl-[248px]')}>
        <header className="sticky top-0 z-20 border-b border-line glass">
          <div className="flex h-14 items-center gap-3 px-4 lg:px-8">
            <IconButton label="Open navigation" onClick={() => setMobileNav(true)} className="md:hidden">
              <Menu className="h-4.5 w-4.5" />
            </IconButton>
            <GlobalSearch />
            <div className="ml-auto flex items-center gap-1.5">
              {busy ? (
                <div className="hidden items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 sm:flex">
                  <Loader2 className="h-3 w-3 animate-spin text-accent" />
                  <span className="text-[10.5px] font-medium text-soft">
                    {importActive ? 'Importing' : processing.paused ? 'Paused' : processing.running ? processing.stage : 'Visual indexing'}
                  </span>
                  <span className="text-[10px] tabular-nums text-faint">
                    {formatCount(progressDone)}/{formatCount(progressTotal || 0)}
                  </span>
                </div>
              ) : null}
              <IconButton label="Settings" onClick={() => { window.location.hash = '#/settings'; }}>
                <Settings className="h-4 w-4" />
              </IconButton>
              <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => { window.location.hash = '#/import'; }}>
                Import
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>

        <footer className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-2 px-4 pb-6 pt-2 text-[10px] text-faint lg:px-8">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3 text-success" /> Ivory processes everything on this device.
          </span>
          <span>Open source · No accounts · No uploads</span>
        </footer>
      </div>

      {mobileNav ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={() => setMobileNav(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-[268px] border-r border-line bg-surface shadow-lift animate-fade-in">
            <div className="absolute right-2 top-2 z-10">
              <IconButton label="Close navigation" onClick={() => setMobileNav(false)}>
                <X className="h-4 w-4" />
              </IconButton>
            </div>
            <SidebarContent collapsed={false} onCreate={() => setNewProject(true)} onNavigate={() => setMobileNav(false)} />
          </aside>
        </div>
      ) : null}

      <NewProjectModal open={newProject} onClose={() => setNewProject(false)} />
      <Toaster />
    </div>
  );
}
